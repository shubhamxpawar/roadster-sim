// Build the standalone page: the static diorama as one kit SVG, the car's own
// solids as runtime data the live script re-poses and re-sorts each frame, and
// the two plume canvases. Run: node build.mjs [--light]

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./kit/iso-kit.mjs";
import * as G from "./kit/gl.mjs";
import { kitScript, glScript } from "./scripts/inline-kit.mjs";
import * as M from "./model.mjs";
import * as S from "./scene.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const W = 1360;
const H = 800;
const AZIMUTH = 66;
const ELEVATION = 27;

const P = k.fitProjection(S.sceneBounds(M.LIP), W, H, { pad: 46, azimuth: AZIMUTH, elevation: ELEVATION });
const at = (p) => k.iso(p, P);

// ---------------------------------------------------------------- statics
// The ground is its own layer, behind the back plume canvas, so an exhaust
// plume that points away from the camera sits in front of the floor but behind
// the ramp, the props and the car. Everything else shares the car's depth list.
const ground = S.collector(P);
S.buildGround(P, ground.push);
ground.items.sort((a, b) => a.depth - b.depth);
const groundInner = ground.items.map((s) => s.svg).join("");

const { items: statics, push } = S.collector(P);
S.buildRamp(P, push, M.RAMP_L, M.trackAt);
S.buildProps(P, push, at);
S.buildConsole(P, push);
statics.sort((a, b) => a.depth - b.depth);
const stageInner = statics.map((s) => s.svg).join("");
const staticDepths = statics.map((s) => s.depth);

// ---------------------------------------------------------------- the car
const car = S.carParts().map((p) => ({
  v: p.solid.v, f: p.solid.f,
  tone: p.tone ?? "mid", crease: p.crease ?? "faint",
  lit: !!p.lit, inner: !!p.inner, nozzle: p.nozzle ?? null,
}));

const console3d = S.consoleDynamics(P);

// ---------------------------------------------------------------- data
const cycle = M.cycleTable();
const facts = cycle.facts;

// The reduced-motion still: out over the props, clear of the gantry, at the
// moment the pack is working hardest — the one honest frame that is shown.
let stillT = 0, hardest = -1;
for (const row of cycle.rows) {
  if (row.phase !== "fly" || row.x < 15.5) continue;
  if (row.thrust > hardest) { hardest = row.thrust; stillT = row.t; }
}

const readoutText = (r) =>
  `${r.mph.toFixed(0)} mph · ${r.height.toFixed(1)} m · ${r.pitch.toFixed(0)}° · ${r.bar.toFixed(0)} bar · ` +
  `${r.kn.toFixed(1)} kN · suction ${r.margin.toFixed(1)} kN`;

// The console is the run control, and on a 1360 px scene it is small: a drag
// starts anywhere over its projected footprint (plus a margin), while a press
// anywhere else on the figure is left alone rather than throwing the run to an end.
const consoleHit = (() => {
  const c = S.CONSOLE, mx = 0.55;
  const xs = [], ys = [];
  for (const x of [c.x - c.w / 2 - mx, c.x + c.w / 2 + mx]) {
    for (const y of [c.y - c.d / 2 - mx, c.y + c.d / 2 + mx]) {
      for (const z of [-0.35, 1.55]) {
        const p = k.iso([x, y, z], P);
        xs.push(p[0]); ys.push(p[1]);
      }
    }
  }
  const pad = 14;
  return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
})();

const DATA = {
  W, H, P,
  camera: G.glCamera(P),
  theme,
  statics: staticDepths,
  car,
  nozzles: M.NOZZLES.map((n) => ({ id: n.id, x: n.x, y: n.y || 0, z: n.z, dx: n.dx, dy: n.dy || 0, dz: n.dz })),
  cycleT: facts.cycle,
  stillT,
  console: console3d,
  consoleHit,
  mass: M.MASS,
  tank: M.TANK_P0,
  nozzleN: M.NOZZLE_N,
  rampR: M.RAMP_R,
  lip: [M.LIP.x, M.LIP.z],
  sixty: facts.sixty,
  lowMargin: facts.lowestMargin,
  landingX: facts.landingX,
  flightT: facts.flightT,
};

const viewBox = `0 0 ${W} ${H}`;
const groundSvg =
  `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg rr-layer rr-ground-svg" viewBox="${viewBox}" aria-hidden="true">${groundInner}</svg>`;

const carSvg = k.figureSvg({
  width: W, height: H,
  label: "A rocket car on a test ground: it launches, climbs a tall curling ramp on suction fans, hangs inverted at the top, and flips over a row of parked cars and a trailer to land on its wheels.",
  body: `<g class="rr-solids" data-layer="solids">${stageInner}</g>` +
    console3d.knob.svg + console3d.wheel.svg +
    `<g class="rr-needle"><path class="iso-line" data-tone="hi" d=""/></g>`,
  className: "rr-stage-svg",
});

const stage =
  `<div class="rr-stage" tabindex="0" role="slider" aria-roledescription="run control" ` +
  `aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" ` +
  `aria-label="Thrust-assisted flip. The run plays on a loop. Drag the console slider, or press the left and right arrow keys, to step through the run; the tour pauses while you step and picks up again a few seconds later. Press T to slow to one twentieth, then one hundredth. Press Space to relaunch. Hold shift with the left and right arrow keys before the launch to trim the flip and over-rotate it. Press E to fade the body shell.">` +
  `<span class="rr-said" aria-live="polite"></span>` +
  groundSvg +
  `<canvas class="rr-layer rr-gl rr-gl-back" aria-hidden="true"></canvas>` +
  carSvg +
  `<canvas class="rr-layer rr-gl rr-gl-front" aria-hidden="true"></canvas>` +
  `</div>`;

// ---------------------------------------------------------------- caption
const caption =
  `A rocket-assisted car flips off the top of a curling ramp. It leaves the line and is at 60 mph ` +
  `in ${(facts.sixty - 1.3).toFixed(2)} s (illustrative figures, not a manufacturer's). Suction fans hold it to ` +
  `${M.RAMP_L.toFixed(0)} m of curved ramp as the surface rolls it upside down; the smallest suction margin on the way up is ` +
  `${(facts.lowestMargin / 1000).toFixed(1)} kN, and it hangs there until the pack takes over. The thrusters then turn it through ` +
  `one and a half turns — the pitch comes out of where the ten nozzles sit, so it can spin the flip up hard just past the lip and ` +
  `brake hard near the far side, but it has no brake at all near 270°, which is why it over-rotates past level and catches itself ` +
  `on the under thrusters. It clears the trailer and the parked cars and comes down on its wheels ${facts.landingX.toFixed(0)} m from the ` +
  `lip after ${facts.flightT.toFixed(1)} s of flight, and brakes to a stop. The tank is finite: thrust falls as the pressure drops, and ` +
  `the readout shows both.`;
const constants =
  `mass ${M.MASS} kg · tank ${M.TANK_P0} bar · ${M.NOZZLE_N.toLocaleString()} N per nozzle · ramp radius ${M.RAMP_R.toFixed(1)} m`;

const body = `<div class="rr">${k.plateHtml({
  fig: `Fig ${M.NOZZLES.length}`,
  title: "Thrust-assisted flip",
  hint: "drag the console slider · ← → step · shift + ← → trim · T slow · Space relaunch · E shell",
  readout: readoutText(M.readoutOf(M.freshState())),
  keys: [
    { mark: "lit", label: "The ten thrusters light only while they fire" },
    { mark: "raised", label: "Ramp, gantry, parked cars and trailer to clear" },
    { mark: "flat", label: "The run, from the line to the landing circle" },
  ],
  caption: `${caption} ${constants}.`,
  body: stage,
})}</div>`;

// ---------------------------------------------------------------- page
// The model and the 3D renderer are separate modules at build time, so at run
// time each is wrapped in an IIFE that hands back one namespace: both define
// helpers with the same names (clamp, dot, smooth), and inline in one script
// they would otherwise collide.
const namesOf = (src) => [...src.matchAll(/^export (?:const|let|var|function|class) ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
const namespaceOf = (src, name) => {
  const body = src.replace(/^export /gm, "").replace(/^import .*$/gm, "");
  return `const ${name} = (() => {\n${body}\nreturn { ${namesOf(src).join(", ")} };\n})();`;
};
const MODEL = namespaceOf(readFileSync(join(HERE, "model.mjs"), "utf8"), "M");
const KIT3D = namespaceOf(readFileSync(join(HERE, "kit3d.mjs"), "utf8"), "T3");
const CSS = readFileSync(join(HERE, "flip.css"), "utf8");
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));

const page = k.pageHtml({
  title: "Thrust-assisted flip",
  theme,
  body: `<style>${CSS}</style>${body}`,
  script: kitScript() + glScript() + MODEL + KIT3D + LIVE,
  width: 1420,
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), page);
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`,
  `${statics.length + ground.items.length} static parts + ${car.length} car parts`,
  `cycle ${facts.cycle.toFixed(1)} s`);
console.log(`  facts: 0-60 ${(facts.sixty - 1.3).toFixed(2)} s · low suction margin ${(facts.lowestMargin / 1000).toFixed(1)} kN ·`,
  `land x ${facts.landingX.toFixed(2)} m · flight ${facts.flightT.toFixed(2)} s · touch pitch ${facts.touchPitch.toFixed(0)}°`,
  `(off ${Math.min(facts.touchPitch, 360 - facts.touchPitch).toFixed(0)}°) · vz ${facts.touchVz.toFixed(2)} · vx ${facts.touchVx.toFixed(2)} · crashed ${facts.crashed} ·`,
  `peak pitch ${facts.peakPitch.toFixed(0)}°`);
console.log(`  still at ${stillT.toFixed(2)} s`);
