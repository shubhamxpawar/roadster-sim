// The diorama: a test ground, a tall curling ramp, a row of parked cars, a
// trailer to clear, and the car itself — built from small convex solids and
// drawn through kit3d's painter's-order renderer.

import * as k from "./kit/iso-kit.mjs";
import * as T from "./kit3d.mjs";
import { NOZZLES } from "./model.mjs";

const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const GROUND = { x: -20, y: -8.6, w: 56, d: 17.2 };
export const Z_GROUND = 0;
export const RAMP_W = 2.6;
export const RAIL_Y = 1.36;
// The trailer is parked under the run-out from the loop rather than further
// downrange: the car's tail sweeps far below its centre of mass as it comes out
// of the flip, so a trailer any further along would be hit. Parked here it keeps
// its full size and still leaves more than a metre of clearance.
export const TRAILER = { x: 12.0, w: 4.5, y: -1.3, d: 2.6, h: 3.9 };
export const CAR_ROW_X = 21.0;
// the row straddles the run rather than blocking it: the flight path at this x
// is only about a metre up, so a car in the middle of the lane would be hit.
// Two pairs either side leave a lane for the flip to come down through.
export const CAR_ROW_Y = [-6.4, -4.0, 4.0, 6.4];
export const CONSOLE = { x: -7.5, y: 5.4, w: 3.2, d: 1.5, h: 0.95 };

// ---------------------------------------------------------------- helpers
// Every static solid is one entry: the kit markup and the depth to sort it by.
export function collector(P) {
  const items = [];
  const push = (solid, style = {}) => {
    const { paths, depth } = T.solidPaths(solid, P);
    const entry = { svg: k.solidSvg(paths, { tone: style.tone ?? "mid", crease: style.crease ?? "faint", lit: style.lit, className: style.className }), depth };
    items.push(entry);
    return entry;
  };
  return { items, push };
}

// ---------------------------------------------------------------- the ramp
export function buildRamp(P, push, RAMP_L, trackAt) {
  const N = 44;
  const ds = RAMP_L / N;
  const thick = 0.26;
  const nodeAt = (s) => {
    const c = trackAt(s);
    return { x: c.x, z: c.z, th: c.th, ux: c.ux, uz: c.uz, tx: c.tx, tz: c.tz };
  };
  for (let i = 0; i < N; i++) {
    const s0 = i * ds, s1 = s0 + ds, sm = (s0 + s1) / 2;
    const a = nodeAt(s0), b = nodeAt(s1), m = nodeAt(sm);
    const len = Math.hypot(b.x - a.x, b.z - a.z) + 0.06;
    const deg = (m.th * 180) / Math.PI;
    // centre of the deck slab, its top face on the track line
    const cx = m.x - (thick / 2) * m.ux;
    const cz = m.z - (thick / 2) * m.uz;
    const slab = T.xform(T.box(0, 0, -thick / 2, len, RAMP_W, thick), (p) => {
      const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
      return [p[0] * c - p[2] * s, p[1], p[0] * s + p[2] * c];
    });
    push(T.move(slab, [cx, 0, cz]), { tone: i % 2 ? "mid" : "lo", crease: "faint" });
  }
  // two side rails, as chains of short bars offset laterally
  for (const sy of [-1, 1]) {
    for (let i = 0; i < N - 1; i += 2) {
      const a = nodeAt(i * ds), b = nodeAt(Math.min(N, i + 2) * ds);
      const off = (n) => [n.x + n.ux * 0.34, sy * RAIL_Y, n.z + n.uz * 0.34];
      push(T.rod(off(a), off(b), 0.085, 0.085, 10), { tone: "hi", crease: "lo" });
    }
  }
  // cross ties under the deck, and posts to the ground where the underside
  // faces down; a gantry carries the overhanging end
  for (let i = 2; i < N; i += 3) {
    const m = nodeAt(i * ds);
    const px = m.x - 0.4 * m.ux;
    // the trailer is parked in this stretch: no tie or support grows inside it
    const inTrailer = px > TRAILER.x - 0.3 && px < TRAILER.x + TRAILER.w + 0.3;
    if (!inTrailer) {
      push(T.rod([m.x - 0.5 * m.ux, -RAIL_Y, m.z - 0.5 * m.uz], [m.x - 0.5 * m.ux, RAIL_Y, m.z - 0.5 * m.uz], 0.06, 0.06, 8), { tone: "lo", crease: "faint" });
    }
    if (m.uz > 0.25 && m.z > 1.4) {
      for (const sy of [-1, 1]) {
        if (sy < 0 && inTrailer) continue;
        const top = [m.x - 0.4 * m.ux, sy * RAIL_Y, m.z - 0.4 * m.uz];
        push(T.rod(top, [top[0], sy * RAIL_Y, 0], 0.075, 0.11, 8), { tone: "mid" });
        push(T.disc([top[0], sy * RAIL_Y], 0.26, 0, 0.16, 10), { tone: "lo" });
      }
      const a = nodeAt(Math.max(0, i - 3) * ds);
      push(T.rod([a.x - 0.4 * a.ux, RAIL_Y, a.z - 0.4 * a.uz], [m.x - 0.4 * m.ux, RAIL_Y, 0], 0.05, 0.05, 6), { tone: "faint" });
    }
  }
  // the gantry: a column behind the ramp with two arms reaching over the lip
  const GY = -2.9;
  push(T.box(11.7, GY, 0, 0.5, 0.5, 19.4), { tone: "mid" });
  push(T.box(11.7, GY, 0, 1.0, 0.9, 0.3), { tone: "lo" });
  for (const [ax, az] of [[12.55, 18.75], [10.4, 16.4]]) {
    push(T.box(ax, (GY + RAIL_Y + 0.3) / 2 + 0.0, az, 1.9, 1.4, 0.18), { tone: "mid" });
    push(T.rod([ax - 0.8, GY, az], [ax - 0.8, RAIL_Y + 0.3, az], 0.06, 0.06, 6), { tone: "faint" });
    push(T.rod([ax - 0.8, RAIL_Y + 0.3, az], [ax - 0.8, RAIL_Y + 0.3, az - 0.9], 0.05, 0.05, 6), { tone: "faint" });
    push(T.rod([11.7, GY, az], [ax - 0.8, GY, az], 0.05, 0.05, 6), { tone: "faint" });
  }
  push(T.box(0.7, 0, -0.2, 2.2, RAMP_W + 0.2, 0.22), { tone: "mid" });
}

// ---------------------------------------------------------------- the ground
export function buildGround(P, push) {
  push(T.box(GROUND.x + GROUND.w / 2, GROUND.y + GROUND.d / 2, -1.7, GROUND.w, GROUND.d, 1.7), { tone: "lo", crease: "none" });
  // the run surface is a slightly raised strip
  push(T.box(-6, 0, 0, 28, 3.4, 0.1), { tone: "faint", crease: "faint" });
  push(T.box(26, 0, 0, 24, 3.4, 0.1), { tone: "faint", crease: "faint" });
  // start line and lane dashes as solid tiles, so nothing floats
  push(T.box(-14, 0, 0.1, 0.35, 3.2, 0.02), { tone: "hi", crease: "none" });
  for (let x = -19; x < 35; x += 3) push(T.box(x, 0, 0.1, 1.4, 0.12, 0.02), { tone: "lo", crease: "none" });
  // a painted landing circle past the props
  for (let i = 0; i < 32; i++) {
    const a0 = (i / 32) * Math.PI * 2, a1 = ((i + 0.55) / 32) * Math.PI * 2;
    const r = 6.2;
    push(T.rod([26 + r * Math.cos(a0), r * Math.sin(a0), 0.1], [26 + r * Math.cos(a1), r * Math.sin(a1), 0.1], 0.09, 0.09, 6), { tone: "faint", crease: "none" });
  }
  // measurement flags along the far edge: small posts with cross bars
  for (let i = 0; i < 9; i++) {
    const x = -19 + i * 7;
    push(T.rod([x, -7.7, 0], [x, -7.7, 1.5], 0.05, 0.05, 6), { tone: "mid" });
    push(T.box(x, -7.7, 1.42, 0.5, 0.06, 0.14), { tone: "hi", crease: "none" });
  }
}

// ---------------------------------------------------------------- props
// a low two-seat roadster, in body coordinates: +x nose, +y left, +z roof,
// origin at the centre of gravity (0.52 m above the ground at rest)
export function carParts() {
  const P = [];
  const add = (solid, style) => P.push({ solid, ...style });
  const BOX = (bx, by, bz, w, d, h) => T.box(bx, by, bz - h / 2, w, d, h);
  // floor pan and the suction plenum under it
  add(BOX(0, 0, -0.16, 3.9, 1.78, 0.1), { tone: "lo", shell: true });
  add(BOX(-0.1, 0, -0.28, 3.1, 1.7, 0.16), { tone: "mid", shell: true });
  for (const bx of [-1.2, -0.6, 0, 0.6, 1.2]) add(BOX(bx, 0, -0.37, 0.16, 1.5, 0.05), { tone: "faint", shell: true, crease: "none" });
  // main tub, sills, side pods
  add(BOX(-0.05, 0, -0.06, 3.7, 1.72, 0.46), { tone: "mid", shell: true });
  add(BOX(-0.05, 0.9, -0.02, 3.4, 0.16, 0.34), { tone: "hi", shell: true });
  add(BOX(-0.05, -0.9, -0.02, 3.4, 0.16, 0.34), { tone: "hi", shell: true });
  add(BOX(-0.5, 0.86, 0.16, 1.8, 0.3, 0.26), { tone: "mid", shell: true });
  add(BOX(-0.5, -0.86, 0.16, 1.8, 0.3, 0.26), { tone: "mid", shell: true });
  // nose
  add(BOX(1.55, 0, 0.02, 1.2, 1.6, 0.34), { tone: "mid", shell: true });
  add(BOX(1.95, 0, -0.02, 0.7, 1.3, 0.26), { tone: "hi", shell: true });
  add(BOX(2.16, 0, -0.08, 0.5, 1.0, 0.16), { tone: "lo", shell: true });
  add(BOX(1.0, 0, 0.22, 0.5, 0.9, 0.1), { tone: "faint", shell: true });
  // rear deck over the tank bay
  add(BOX(-1.55, 0, 0.2, 1.5, 1.7, 0.34), { tone: "mid", shell: true });
  add(BOX(-2.2, 0, 0.24, 0.5, 1.5, 0.26), { tone: "hi", shell: true });
  // cockpit: floor, two seats, a roll hoop, a small screen
  add(BOX(0.55, 0, 0.16, 1.2, 1.3, 0.04), { tone: "lo", shell: true });
  for (const sy of [0.42, -0.42]) {
    add(BOX(0.35, sy, 0.36, 0.5, 0.5, 0.16), { tone: "mid", shell: true });
    add(BOX(0.05, sy, 0.5, 0.12, 0.5, 0.44), { tone: "mid", shell: true });
  }
  add(T.rod([-0.75, 0.72, 0.42], [-0.75, -0.72, 0.42], 0.05, 0.05, 8), { tone: "hi" });
  add(T.rod([-0.75, 0.72, 0.42], [-0.55, 0.72, 0.6], 0.05, 0.05, 8), { tone: "hi" });
  add(T.rod([-0.75, -0.72, 0.42], [-0.55, -0.72, 0.6], 0.05, 0.05, 8), { tone: "hi" });
  add(T.box(0.95, 0, 0.5, 0.06, 1.2, 0.28), { tone: "hi", shell: true });
  // wheels
  for (const [bx, by] of [[1.5, 0.9], [1.5, -0.9], [-1.5, 0.9], [-1.5, -0.9]]) {
    add(T.rod([bx, by - 0.16, -0.19], [bx, by + 0.16, -0.19], 0.33, 0.33, 20), { tone: "lo", crease: "faint" });
    add(T.rod([bx, by - 0.04, -0.19], [bx, by + 0.18, -0.19], 0.17, 0.17, 12), { tone: "hi" });
  }
  // the compressed-air tank, along the length under the floor
  add(T.rod([-1.3, 0, -0.05], [1.3, 0, -0.05], 0.27, 0.27, 24), { tone: "hi", inner: true });
  add(T.rod([1.3, 0, -0.05], [1.52, 0, -0.05], 0.18, 0.12, 16), { tone: "mid", inner: true });
  add(T.rod([-1.3, 0, -0.05], [-1.5, 0, -0.05], 0.18, 0.12, 16), { tone: "mid", inner: true });
  // plumbing: a manifold and hoses to each nozzle group
  add(T.rod([0, 0, -0.05], [0, 0.0, 0.16], 0.05, 0.05, 8), { tone: "mid", inner: true, crease: "none" });
  add(T.box(-0.4, 0, 0.18, 0.6, 0.9, 0.08), { tone: "mid", inner: true });
  for (const n of NOZZLES) {
    if (n.group === "under") continue;
    add(T.rod([-0.4, n.y * 0.5, 0.16], [n.x * 0.86, n.y * 0.92, n.z], 0.035, 0.035, 6), { tone: "faint", inner: true, crease: "none" });
  }
  add(T.rod([-0.4, -0.1, 0.16], [-2.0, -0.1, -0.28], 0.04, 0.04, 6), { tone: "faint", inner: true, crease: "none" });
  add(T.rod([-0.4, 0.1, 0.16], [-2.0, 0.1, -0.28], 0.04, 0.04, 6), { tone: "faint", inner: true, crease: "none" });
  // the ten thruster bells: a mount boss and a flared cone toward the exhaust
  for (const n of NOZZLES) {
    const dir = [n.dx, n.dy || 0, n.dz];
    const mouth = [n.x + dir[0] * 0.16, (n.y || 0) + dir[1] * 0.16, n.z + dir[2] * 0.16];
    const throat = [n.x - dir[0] * 0.02, (n.y || 0) - dir[1] * 0.02, n.z - dir[2] * 0.02];
    add(T.rod(throat, mouth, 0.09, 0.17, 14), { tone: "hi", lit: true, nozzle: n.id });
    add(T.rod([n.x - dir[0] * 0.06, (n.y || 0) - dir[1] * 0.06, n.z - dir[2] * 0.06], [n.x - dir[0] * 0.02, (n.y || 0) - dir[1] * 0.02, n.z - dir[2] * 0.02], 0.1, 0.1, 10), { tone: "mid", inner: true });
  }
  return P;
}

// one parked car, in world coordinates, pointing +y (a body 4.4 m long)
export function parkedCar(x, y, tone) {
  const out = [];
  const B = (cx, cy, z0, w, d, h, t) => out.push({ solid: T.box(cx, cy, z0, w, d, h), tone: t ?? tone, crease: "faint" });
  B(x, y, 0.28, 2.0, 4.4, 0.42, tone);
  B(x, y, 0.62, 1.9, 2.6, 0.5, tone);
  B(x + 0.0, y + 0.5, 0.62, 1.7, 1.2, 0.36, "lo");
  B(x, y + 1.9, 0.5, 1.8, 0.5, 0.26, tone);
  B(x, y - 1.9, 0.5, 1.8, 0.5, 0.26, tone);
  for (const [dx, dy] of [[-1.0, 1.5], [1.0, 1.5], [-1.0, -1.5], [1.0, -1.5]])
    out.push({ solid: T.rod([x + dx, y + dy - 0.14, 0.32], [x + dx, y + dy + 0.14, 0.32], 0.32, 0.32, 16), tone: "lo" });
  return out;
}

export function buildProps(P, push, at) {
  for (const [i, y] of CAR_ROW_Y.entries()) {
    for (const part of parkedCar(CAR_ROW_X, y, i === 1 ? "hi" : "mid")) push(part.solid, { tone: part.tone, crease: part.crease });
  }
  // the trailer: a tall box van on wheels, aligned with the run
  const tr = TRAILER;
  push(T.box(tr.x + tr.w / 2, tr.y + tr.d / 2, 1.15, tr.w, tr.d, tr.h - 1.35), { tone: "hi" });
  push(T.box(tr.x + tr.w / 2, tr.y + tr.d / 2, 0.95, tr.w - 0.3, tr.d - 0.2, 0.3), { tone: "lo" });
  for (const bx of [tr.x + 1.0, tr.x + 2.7, tr.x + 4.4]) {
    push(T.rod([bx, tr.y + 0.1, 0.5], [bx, tr.y + 0.1 + tr.d - 0.2, 0.5], 0.48, 0.48, 16), { tone: "lo" });
  }
  push(T.box(tr.x + 0.25, tr.y + tr.d / 2, 0.9, 0.5, tr.d - 0.4, tr.h - 0.9), { tone: "hi" });
  push(T.box(tr.x + tr.w - 0.2, tr.y + tr.d / 2, 0.9, 0.3, tr.d + 0.4, 2.6), { tone: "hi" });
  for (let i = 0; i < 5; i++) push(T.box(tr.x + 0.6 + i * 0.85, tr.y + tr.d / 2, tr.h - 0.62, 0.7, tr.d - 0.6, 0.08), { tone: "faint", crease: "faint" });
  // a pair of service jacks and a barrier beside the ramp foot
  push(T.box(-1.6, 7.2, 0.3, 1.2, 1.0, 0.6), { tone: "lo" });
  push(T.box(-1.6, 7.2, 0.9, 0.8, 0.7, 0.4), { tone: "mid" });
  for (let i = 0; i < 4; i++) push(T.box(4.5 + i * 2.2, -8.4, 0.42, 1.6, 0.16, 0.5), { tone: "lo" });
  void at;
}

// ---------------------------------------------------------------- console
// A physical run-control console: a knurled slider that scrubs the run and a
// phase wheel. It is the timeline, in the diorama.
export function buildConsole(P, push) {
  const c = CONSOLE;
  push(T.box(c.x, c.y, 0.28, c.w, c.d, 0.86), { tone: "mid" });
  push(T.box(c.x, c.y, 0.28, c.w - 0.2, c.d - 0.2, 0.9), { tone: "lo" });
  push(T.box(c.x, c.y - 0.1, 0.95, c.w - 0.2, c.d - 0.4, 0.24), { tone: "hi" });
  push(T.box(c.x, c.y, 0.0, c.w + 0.2, c.d + 0.2, 0.18), { tone: "lo" });
  // the slider track (a long groove the knob runs in)
  const track = { x: c.x - 1.15, y: c.y + 0.32, w: 2.3, d: 0.24 };
  push(T.box(track.x + track.w / 2, track.y + track.d / 2, 1.16, track.w, track.d, 0.06), { tone: "faint", crease: "none" });
  for (let i = 0; i <= 10; i++) push(T.box(track.x + (i / 10) * track.w, track.y + track.d / 2, 1.22, 0.03, 0.16, 0.02), { tone: i % 5 ? "lo" : "hi", crease: "none" });
  // the phase wheel and its slots
  push(T.disc([c.x + 0.0, c.y + 0.55], 0.34, 1.19, 1.24, 24), { tone: "hi" });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    push(T.box(c.x + 0.55 * Math.cos(a), c.y + 0.55 + 0.55 * Math.sin(a), 1.2, 0.12, 0.12, 0.03), { tone: "mid", crease: "none" });
  }
  // a small lamp bank that lights the live phase
  for (let i = 0; i < 4; i++) push(T.disc([c.x - 1.15 + i * 0.28, c.y - 0.42], 0.06, 1.19, 1.22, 10), { tone: "lo" });
}

// the two moving console bits and their rest markup, for the live script: the
// knurled slider knob runs the groove, and a needle on the phase wheel swings
// to point at the live phase. Both are drawn at the origin and translated.
export function consoleDynamics(P) {
  const c = CONSOLE;
  const track = { x: c.x - 1.15, y: c.y + 0.32, w: 2.3, d: 0.24 };
  const knob = T.solidPaths(T.box(0, 0, 1.16, 0.26, 0.34, 0.24), P);
  const wheel = T.solidPaths(T.disc([0, 0], 0.3, 1.19, 1.27, 20), P);
  // plain data only: DATA is serialised into the page, so no functions here
  return {
    knob: { svg: k.solidSvg(knob.paths, { tone: "hi", crease: "lo" }), span: [track.x + 0.13, track.x + track.w - 0.13, track.y + track.d / 2, 0] },
    wheel: { svg: k.solidSvg(wheel.paths, { tone: "hi", crease: "lo" }), at: [c.x, c.y + 0.55, 0], r: 0.26, z: 1.3 },
    track: [track.x, track.y + track.d / 2, track.w],
  };
}

// ---------------------------------------------------------------- bounds
export function sceneBounds(LIP) {
  const pts = [
    [GROUND.x, GROUND.y, -1.7], [GROUND.x + GROUND.w, GROUND.y, -1.7],
    [GROUND.x, GROUND.y + GROUND.d, -1.7], [GROUND.x + GROUND.w, GROUND.y + GROUND.d, -1.7],
    [GROUND.x, GROUND.y, 0], [GROUND.x + GROUND.w, GROUND.y + GROUND.d, 0],
    [LIP.x - 1.2, -RAIL_Y, LIP.z + 0.6], [LIP.x + 1.2, RAIL_Y, LIP.z + 0.6],
    [TRAILER.x + TRAILER.w, TRAILER.y + TRAILER.d, TRAILER.h],
    [CAR_ROW_X + 1, CAR_ROW_Y[2] + 2.2, 1.6],
    [CAR_ROW_X + 1, CAR_ROW_Y[0] - 2.2, 1.6],
    [CONSOLE.x - 2, CONSOLE.y + 1.5, 1.4],
  ];
  return pts;
}
void clamp; void DEG;
