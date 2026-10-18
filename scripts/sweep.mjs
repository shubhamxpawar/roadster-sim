// Parameter sweep for the flight schedule. Writes one temp copy of the model per
// variant, then imports them all in a single node process (called from the
// shell) and reports the landing facts. Used only for tuning.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";

const SRC = new URL("../model.mjs", import.meta.url).pathname;
const DIR = "/tmp/opencode/sweep";
mkdirSync(DIR, { recursive: true });
const src0 = readFileSync(SRC, "utf8");

function variant(tag, patch) {
  let src = src0;
  for (const [key, val] of Object.entries(patch)) {
    const re = new RegExp(`(${key}\\s*=\\s*)[-\\d.]+`);
    if (!re.test(src)) throw new Error("patch missed " + key);
    src = src.replace(re, `$1${val}`);
  }
  const file = `${DIR}/${tag}.mjs`;
  writeFileSync(file, src);
  return { tag, file, patch };
}

const variants = [];
let n = 0;
for (const W1 of [7, 8, 9, 10, 11, 12]) {
  for (const W2 of [0.8, 1.1, 1.4, 1.8]) {
    for (const S1 of [0.16, 0.2, 0.24]) {
      for (const S2 of [0.4, 0.46, 0.52, 0.58]) {
        for (const S3 of [0.7, 0.78, 0.86, 0.94]) {
          const tag = `v${n++}`;
          variants.push(variant(tag, { FLIP_W1: W1, FLIP_W2: W2, FLIP_S1: S1, FLIP_S2: S2, FLIP_S3: S3, FLIP_S4: 0.97 }));
          variants[variants.length - 1].patch = { FLIP_W1: W1, FLIP_W2: W2, FLIP_S1: S1, FLIP_S2: S2, FLIP_S3: S3 };
        }
      }
    }
  }
}

const probe = `${DIR}/probe.mjs`;
const imports = variants.map((v, i) => `import { cycleTable as c${i} } from ${JSON.stringify(v.file)};`).join("\n");
const calls = variants.map((v, i) => `out.push(${JSON.stringify(v.patch)}, ${i}, s(c${i}()));`).join("\n");
writeFileSync(probe, `
const raw = [];
const out = [];
${imports}
const s = (o) => o.facts;
${calls}
process.stdout.write(JSON.stringify(out));
`);
const res = execSync(`node ${probe}`, { encoding: "utf8", maxBuffer: 1 << 28 });
const flat = JSON.parse(res);

const off = (p) => Math.min(((p % 360) + 360) % 360, 360 - ((p % 360) + 360) % 360);
const rows = [];
for (let i = 0; i < flat.length; i += 3) {
  const patch = flat[i], f = flat[i + 2];
  rows.push({ ...patch, ...f });
}
const clean = rows.filter((r) => !r.crashed && isFinite(r.touchPitch));
// score: want level, want a small over-rotation past the 720 target, want soft
const score = (r) => off(r.touchPitch) * 1.0 + Math.max(0, r.peakPitch - 720) * 0.7 + Math.max(0, -r.touchVz - 3) * 6;
clean.sort((a, b) => score(a) - score(b));
console.log(`--- ${clean.length} clean of ${rows.length}, best by (attitude + overshoot + softness) ---`);
for (const r of clean.slice(0, 30)) {
  console.log(
    `W1 ${String(r.FLIP_W1).padStart(3)} W2 ${String(r.FLIP_W2).padStart(4)} S1 ${r.FLIP_S1} S2 ${r.FLIP_S2} S3 ${r.FLIP_S3}  fl ${r.flightT.toFixed(2)}  x ${r.landingX.toFixed(1).padStart(5)}  off ${off(r.touchPitch).toFixed(0).padStart(3)}  vz ${r.touchVz.toFixed(1).padStart(6)}  vx ${r.touchVx.toFixed(1).padStart(5)}  peakP ${r.peakPitch.toFixed(0).padStart(4)}`,
  );
}
rmSync(DIR, { recursive: true, force: true });
