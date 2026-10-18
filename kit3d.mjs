// A small general 3D convex-solid renderer that draws through the kit's own
// camera. Each part is a convex polyhedron (vertices + face loops). Every frame
// we transform the vertices, project them with the kit's `iso`, find which faces
// face the viewer, bucket them by the kit's light, and hand the kit `solidSvg`
// the same {fill, outline, crease, top, shades} picture it draws for a slab.
//
// It is not a depth buffer: solids are painted back-to-front by their depth
// along the view axis. The diorama and the car are separate convex parts with a
// real gap between them, which is what painter's order needs.

import { iso, pathOf, solidSvg, depthOf } from "./kit/iso-kit.mjs";

const RADIANS = Math.PI / 180;
export const SHADES = 4;

// ---------------------------------------------------------------- geometry
export function polyhedron(v, f) {
  return { v: v.map((p) => p.slice()),
           f: f.map((loop) => loop.slice()) };
}

export function box(cx, cy, z0, w, d, h) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - d / 2, y1 = cy + d / 2, z1 = z0 + h;
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
             [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const f = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  return polyhedron(v, f);
}

// upright prism: a 2D polygon in (x, y) extruded from z0 to z1
export function prism(poly, z0, z1) {
  const n = poly.length, v = [], f = [];
  for (const [x, y] of poly) v.push([x, y, z0]);
  for (const [x, y] of poly) v.push([x, y, z1]);
  f.push([...Array(n).keys()].slice().reverse());
  f.push([...Array(n).keys()].map((i) => i + n));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    f.push([i, j, j + n, i + n]);
  }
  return polyhedron(v, f);
}

export function rect(cx, cy, z0, w, d, h) {
  const x0 = cx - w / 2, y0 = cy - d / 2, x1 = cx + w / 2, y1 = cy + d / 2;
  return prism([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, z0 + h);
}

export function disc(c, r, z0, z1, n = 32) {
  const poly = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    poly.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return prism(poly, z0, z1);
}

// a round bar from a to b (arbitrary axis), radius r0 at a, r1 at b
export function rod(a, b, r0, r1 = r0, n = 24, caps = true) {
  const ax = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...ax) || 1;
  const u = ax.map((x) => x / len);
  const ref = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let e1 = cross(u, ref); e1 = norm(e1);
  const e2 = cross(u, e1);
  const v = [], f = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const c = Math.cos(a0), s = Math.sin(a0);
    const dir = [e1[0] * c + e2[0] * s, e1[1] * c + e2[1] * s, e1[2] * c + e2[2] * s];
    v.push([a[0] + dir[0] * r0, a[1] + dir[1] * r0, a[2] + dir[2] * r0]);
  }
  if (r1 > 1e-4) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const c = Math.cos(a0), s = Math.sin(a0);
      const dir = [e1[0] * c + e2[0] * s, e1[1] * c + e2[1] * s, e1[2] * c + e2[2] * s];
      v.push([b[0] + dir[0] * r1, b[1] + dir[1] * r1, b[2] + dir[2] * r1]);
    }
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; f.push([i, j, j + n, i + n]); }
    if (caps) { f.push([...Array(n).keys()].map((i) => i + n)); f.push([...Array(n).keys()].reverse()); }
  } else {
    const tip = v.length; v.push(b.slice());
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; f.push([i, j, tip]); }
    if (caps) f.push([...Array(n).keys()].reverse());
  }
  return polyhedron(v, f);
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

// ---------------------------------------------------------------- transform
export function xform(solid, fn) {
  return { ...solid, v: solid.v.map(fn) };
}
export function move(solid, t) {
  return xform(solid, (p) => [p[0] + t[0], p[1] + t[1], p[2] + t[2]]);
}
// rotate about the y axis by deg, then translate — the car's pose
export function poseBody(solid, [x0, y0, z0], deg) {
  const c = Math.cos(deg * RADIANS), s = Math.sin(deg * RADIANS);
  return xform(solid, (p) => [x0 + p[0] * c - p[2] * s, y0 + p[1], z0 + p[0] * s + p[2] * c]);
}
// the world direction a body direction points, under the same pose
export function poseDir([dx, dy, dz], deg) {
  const c = Math.cos(deg * RADIANS), s = Math.sin(deg * RADIANS);
  return [dx * c - dz * s, dy, dx * s + dz * c];
}

// ---------------------------------------------------------------- render
export function solidPaths(solid, P) {
  const cen = centroid(solid.v);
  const { sinA, cosA, sinE, cosE } = camera(P);
  const w = [cosA * cosE, sinA * cosE, sinE];
  const L = norm([-sinA, cosA, 1.2]);
  const flat = solid.v.map((p) => iso(p, P));

  // edges shared by two faces, so silhouette and crease can be found
  const share = new Map();
  const faces = solid.f.map((loop) => {
    const n = faceNormal(solid.v, loop, cen);
    const vis = dot(n, w) > 1e-9;
    const bucket = n[2] > 0.6 ? -1 : clamp(Math.floor(((dot(n, L) + 1) / 2) * SHADES), 0, SHADES - 1);
    return { loop, n, vis, bucket };
  });
  const vis = faces.map((f) => f.vis);
  for (let fi = 0; fi < faces.length; fi++) {
    const loop = faces[fi].loop;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const at = share.get(key);
      if (at) at.push(fi); else share.set(key, [fi]);
    }
  }

  const buckets = Array.from({ length: SHADES }, () => []);
  let top = "", crease = "";
  for (const f of faces) {
    if (!f.vis) continue;
    const d = pathOf(f.loop.map((i) => flat[i]), true);
    if (f.bucket < 0) top += d; else buckets[f.bucket].push(d);
  }
  for (const [key, list] of share) {
    if (list.length !== 2) continue;
    const [fa, fb] = list;
    if (!vis[fa] || !vis[fb]) continue;          // silhouette (drawn by the hull)
    if (dot(faces[fa].n, faces[fb].n) < 0.94) {  // a real crease, not a facet
      const [a, b] = key.split("_").map(Number);
      crease += pathOf([flat[a], flat[b]]);
    }
  }
  const hull = hullPath(flat);
  return {
    paths: {
      fill: hull, top, crease, outline: hull, bevel: "",
      shades: buckets.map((d) => d.join("")),
    },
    depth: depthKey(solid.v, P),
  };
}

export function drawSolid(solid, P, style = {}) {
  const { paths } = solidPaths(solid, P);
  return solidSvg(paths, { tone: style.tone ?? "mid", crease: style.crease ?? "faint", lit: style.lit, className: style.className });
}

// the back-to-front key: the most distant vertex, so a big part never jumps
// ahead of a small one it sits behind
export function depthKey(v, P) {
  let min = Infinity;
  for (const p of v) min = Math.min(min, depthOf(p, P));
  return min;
}

const camera = (P) => {
  const a = (P.azimuth ?? 45) * RADIANS, e = (P.elevation ?? 30) * RADIANS;
  return { sinA: Math.sin(a), cosA: Math.cos(a), sinE: Math.sin(e), cosE: Math.cos(e) };
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function centroid(v) {
  const c = [0, 0, 0];
  for (const p of v) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  return c.map((x) => x / v.length);
}
function faceNormal(v, loop, cen) {
  const a = v[loop[0]], b = v[loop[1]], c = v[loop[2]];
  let n = norm(cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]));
  let fc = [0, 0, 0];
  for (const i of loop) { fc[0] += v[i][0]; fc[1] += v[i][1]; fc[2] += v[i][2]; }
  fc = fc.map((x) => x / loop.length);
  if (dot(n, [fc[0] - cen[0], fc[1] - cen[1], fc[2] - cen[2]]) < 0) n = n.map((x) => -x);
  return n;
}
function hullPath(pts) {
  const p = pts.map(([x, y]) => [x, y]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return pathOf(p, true);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) { while (lower.length >= 2 && cr(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cr(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return pathOf([...lower.slice(0, -1), ...upper.slice(0, -1)], true);
}
