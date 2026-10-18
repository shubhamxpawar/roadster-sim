// Trace one model variant: node scripts/trace.mjs KEY=VAL ...
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";

const SRC = new URL("../model.mjs", import.meta.url).pathname;
mkdirSync("/tmp/opencode", { recursive: true });
let src = readFileSync(SRC, "utf8");
for (const a of process.argv.slice(2)) {
  const [k, v] = a.split("=");
  const re = new RegExp(`(${k}\\s*=\\s*)[-\\d.]+`);
  if (!re.test(src)) throw new Error("no " + k);
  src = src.replace(re, `$1${v}`);
}
writeFileSync("/tmp/opencode/trace-model.mjs", src);
const probe = `
import { freshState, step, readoutOf, cycleTable } from "/tmp/opencode/trace-model.mjs";
const { facts } = cycleTable();
console.log("facts", JSON.stringify(facts));
const st = freshState();
let start = -1;
let next = 0;
for (let i = 0; i < 40 * 240; i++) {
  const p = st.phase;
  step(st, 1/240, { bias: 0 });
  if (p === "hang" && st.phase === "fly") { start = st.t; next = 0; }
  if (st.phase === "fly" && st.t - start >= next) {
    next += 0.1;
    const r = readoutOf(st);
    console.log([(st.t-start).toFixed(2).padStart(5), "x", st.x.toFixed(2).padStart(6), "z", st.z.toFixed(2).padStart(5), "pit", r.pitch.toFixed(0).padStart(4), "om", st.omega.toFixed(2).padStart(6), "vz", st.vz.toFixed(1).padStart(5), "vx", st.vx.toFixed(1).padStart(5)].join(" "));
  }
  if (st.phase === "touch") break;
}
`;
writeFileSync("/tmp/opencode/trace-probe.mjs", probe);
console.log(execSync("node /tmp/opencode/trace-probe.mjs", { encoding: "utf8" }));
