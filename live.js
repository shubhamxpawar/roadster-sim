// The live half: one model, stepped forward in fixed sub-steps; the car's own
// convex solids re-projected and merged back into the diorama's depth order
// every frame; the firing nozzles drawn as a plume on two WebGL layers, one
// behind the drawing and one in front of it.
const D = __DATA__;
const NS = "http://www.w3.org/2000/svg";
const RAD = Math.PI / 180;
const TAU = Math.PI * 2;
const DT = 1 / 240;
const clampTo = (v, a, b) => (v < a ? a : v > b ? b : v);

const root = document.querySelector(".rr");
const stage = root.querySelector(".rr-stage");
const solids = stage.querySelector('[data-layer="solids"]');
const svg = stage.querySelector(".rr-stage-svg");
const readout = root.querySelector("[data-readout]");
const said = stage.querySelector(".rr-said");
const still = matchMedia("(prefers-reduced-motion: reduce)");
// a touch-only device has no keys to press, so the hint drops the key list
const TOUCH = matchMedia("(hover: none)").matches;
const LIGHT = D.theme === "light" ? 1 : 0;
const SLOW_STEPS = [1, 1 / 20, 1 / 100];

// ---------------------------------------------------------------- the car
const STATIC_NODES = [...solids.children];
const STATIC_DEPTH = D.statics;

function pathEl(cls, tone) {
  const p = document.createElementNS(NS, "path");
  p.setAttribute("class", cls);
  if (tone) p.setAttribute("data-tone", tone);
  return p;
}
const CAR = D.car.map((part) => {
  const g = document.createElementNS(NS, "g");
  g.setAttribute("class", "iso-solid");
  if (part.inner) g.setAttribute("data-inner", "");
  const fill = pathEl("iso-fill");
  const shades = [];
  for (let i = 0; i < 4; i++) {
    const p = pathEl("iso-shade");
    p.setAttribute("data-shade", String(i));
    shades.push(p);
  }
  const top = pathEl("iso-top");
  const crease = pathEl("iso-line iso-crease", part.crease);
  const edge = pathEl("iso-line iso-edge", part.tone);
  const node = g;
  node.append(fill, ...shades, top, crease, edge);
  solids.append(node);
  return { part, node, fill, shades, top, crease, edge, lit: false };
});

// the SVG plume fallback, hidden once WebGL draws
const fallback = document.createElementNS(NS, "g");
fallback.setAttribute("class", "rr-plume-fb");
const fbPath = pathEl("rr-fb");
fallback.append(fbPath);
svg.append(fallback);

// console dynamics: the slider knob and the phase wheel were appended right
// after the solids group, in that order, and the needle path after them
const CONSOLE_NODES = [...svg.querySelectorAll(":scope > g.iso-solid")];
const NEEDLE = svg.querySelector(".rr-needle path");

function poseCar(s) {
  const c = Math.cos(s.pitch * RAD), sn = Math.sin(s.pitch * RAD);
  const { x, y, z } = s;
  for (const car of CAR) {
    const { v, f } = car.part;
    const pv = new Array(v.length);
    for (let i = 0; i < v.length; i++) {
      const p = v[i];
      pv[i] = [x + p[0] * c - p[2] * sn, y + p[1], z + p[0] * sn + p[2] * c];
    }
    const { paths, depth } = T3.solidPaths({ v: pv, f }, D.P);
    car.fill.setAttribute("d", paths.fill);
    for (let i = 0; i < 4; i++) car.shades[i].setAttribute("d", paths.shades[i]);
    car.top.setAttribute("d", paths.top);
    car.crease.setAttribute("d", paths.crease);
    car.edge.setAttribute("d", paths.outline);
    car.depth = depth + (car.part.inner ? -1.6 : 0);
    if (car.part.nozzle) {
      const on = sim.levels[D.nozzles.findIndex((n) => n.id === car.part.nozzle)] > 0.03;
      if (on !== car.lit) { car.lit = on; if (on) car.node.setAttribute("data-lit", ""); else car.node.removeAttribute("data-lit"); }
    }
  }
}

// ---------------------------------------------------------------- depth order
const order = [];
function sortSolids() {
  order.length = 0;
  for (let i = 0; i < STATIC_NODES.length; i++) order.push({ d: STATIC_DEPTH[i], n: STATIC_NODES[i] });
  for (const car of CAR) order.push({ d: car.depth, n: car.node });
  order.sort((a, b) => a.d - b.d);
  for (let i = 0; i < order.length; i++) {
    const want = order[i].n;
    const cur = solids.children[i];
    if (cur !== want) solids.insertBefore(want, cur || null);
  }
}

// ---------------------------------------------------------------- the run
let sim = M.freshState();
let advance = !still.matches;
let scrubF = null;
let bias = 0;
let slow = 0;
let shellFade = false;
let announced = "";

function reset() {
  sim = M.freshState();
}
function advanceTo(target) {
  if (target < sim.t - 1e-6) reset();
  let guard = 0;
  while (sim.t < target - 1e-6 && guard++ < 20000) M.step(sim, DT, { bias });
}
function stepBy(dt) {
  let n = 0;
  const target = sim.t + dt;
  while (sim.t < target - 1e-6 && n++ < 64) M.step(sim, DT, { bias });
}

function cycleT() { return D.cycleT; }
function sliderF() {
  const t = sim.t % cycleT();
  return t / cycleT();
}

// ---------------------------------------------------------------- plumes
const MAXP = 10;
const PLUME_GLSL = `
uniform float uPlumeN;uniform vec3 uPos[10];uniform vec3 uDir[10];uniform float uLen[10];uniform float uR[10];uniform float uPow[10];uniform float uLight;
vec3 tintAt(float a){vec3 core=vec3(.62,.74,.95);vec3 tip=vec3(.24,.30,.42);return mix(core,tip,a);}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec3 p0=rayOf(vb);vec3 V=towardViewer();
  vec3 col=vec3(0.);
  for(int i=0;i<10;i++){
    if(float(i)>=uPlumeN)break;
    vec3 a=uPos[i];vec3 ab=uDir[i]*uLen[i];vec3 b=a+ab;
    vec3 w0=p0-a;
    float aa=1.0;float bb=dot(V,ab);float cc=dot(ab,ab);
    float dd=dot(V,w0);float ee=dot(ab,w0);
    float den=aa*cc-bb*bb;
    if(den<1e-6)continue;
    float tc=(aa*ee-bb*dd)/den;
    tc=clamp(tc,0.,1.);
    float sc=(bb*tc-dd)/aa;
    vec3 pc=p0+sc*V;vec3 qc=a+tc*ab;
    float dist=length(pc-qc);
    float r=uR[i]*(1.0+2.4*tc);
    float g=exp(-pow(dist/max(r,1e-4),2.0));
    g*=smoothstep(0.0,0.05,tc)*(1.0-smoothstep(0.45,1.0,tc));
    g*=uPow[i];
    col+=g*tintAt(tc);
  }
  if(max(col.r,max(col.g,col.b))<1e-4){gl_FragColor=vec4(0.);return;}
  col=tonemap(col,1.5);
  float m=max(col.r,max(col.g,col.b));
  float n=(hash12(gl_FragCoord.xy+fract(uTime*.61)*91.)+hash12(gl_FragCoord.yx*1.37+fract(uTime*.37)*57.)-1.)/255.;
  col=max(col+n*smoothstep(0.,1.5/255.,m),0.);
  gl_FragColor=vec4(col,m);
}`;
const PL_UNIFORMS = ["uPlumeN", "uPos", "uDir", "uLen", "uR", "uPow", "uLight"];
const backCanvas = stage.querySelector(".rr-gl-back");
const frontCanvas = stage.querySelector(".rr-gl-front");
const backLayer = glLayer({ canvas: backCanvas, fragment: PLUME_GLSL, view: [D.W, D.H], camera: D.camera, uniforms: PL_UNIFORMS, fixed: { uLight: LIGHT } });
const frontLayer = glLayer({ canvas: frontCanvas, fragment: PLUME_GLSL, view: [D.W, D.H], camera: D.camera, uniforms: PL_UNIFORMS, fixed: { uLight: LIGHT } });
if (backLayer && frontLayer) stage.setAttribute("data-gl", "");
const camV = [Math.cos(D.P.azimuth * RAD) * Math.cos(D.P.elevation * RAD), Math.sin(D.P.azimuth * RAD) * Math.cos(D.P.elevation * RAD), Math.sin(D.P.elevation * RAD)];

const blank = () => ({ n: 0, pos: new Float32Array(MAXP * 3), dir: new Float32Array(MAXP * 3), len: new Float32Array(MAXP), r: new Float32Array(MAXP), pow: new Float32Array(MAXP) });
const backSet = blank(), frontSet = blank();
const nozzleWorld = D.nozzles.map(() => ({ p: [0, 0, 0], d: [0, 0, 0], on: 0 }));

function plumeInputs(s) {
  const c = Math.cos(s.pitch * RAD), sn = Math.sin(s.pitch * RAD);
  backSet.n = 0; frontSet.n = 0;
  for (let i = 0; i < D.nozzles.length; i++) {
    const n = D.nozzles[i];
    const lvl = s.levels ? s.levels[i] : 0;
    const wx = n.dx * c - n.dz * sn, wy = n.dy, wz = n.dx * sn + n.dz * c;
    // exhaust leaves opposite the thrust
    const ex = [-wx, -wy, -wz];
    const mouth = [s.x + n.x * c - n.z * sn + wx * 0.18, s.y + n.y + wy * 0.18, s.z + n.x * sn + n.z * c + wz * 0.18];
    nozzleWorld[i].p = mouth; nozzleWorld[i].d = ex; nozzleWorld[i].on = lvl;
    if (lvl <= 0.02) continue;
    const set = ex[0] * camV[0] + ex[1] * camV[1] + ex[2] * camV[2] > 0 ? frontSet : backSet;
    const k = set.n; set.n++;
    set.pos[k * 3] = mouth[0]; set.pos[k * 3 + 1] = mouth[1]; set.pos[k * 3 + 2] = mouth[2];
    set.dir[k * 3] = ex[0]; set.dir[k * 3 + 1] = ex[1]; set.dir[k * 3 + 2] = ex[2];
    set.len[k] = 0.35 + 2.4 * lvl;
    set.r[k] = 0.1 + 0.12 * lvl;
    set.pow[k] = 0.55 + 0.45 * lvl;
  }
}
const packPlume = (layer, set, t) => layer.draw({ uPlumeN: set.n, uPos: set.pos, uDir: set.dir, uLen: set.len, uR: set.r, uPow: set.pow }, t);

function drawFallback() {
  let d = "";
  for (const n of nozzleWorld) {
    if (n.on <= 0.02) continue;
    const [ax, ay] = iso(n.p, D.P);
    const tip = [n.p[0] + n.d[0] * (0.4 + 2.0 * n.on), n.p[1] + n.d[1] * (0.4 + 2.0 * n.on), n.p[2] + n.d[2] * (0.4 + 2.0 * n.on)];
    const [bx, by] = iso(tip, D.P);
    d += pathOf([[ax, ay], [bx, by]]);
  }
  fbPath.setAttribute("d", d);
}

// ---------------------------------------------------------------- readout
const trim = (s) => s.replace(/\s+/g, " ").trim();
function wordsOf(s) {
  const r = M.readoutOf(s);
  return `${M.labelOf(s)}. ${r.mph.toFixed(0)} miles per hour, ${r.height.toFixed(1)} metres up, pitch ${r.pitch.toFixed(0)} degrees, tank ${r.bar.toFixed(0)} bar, thrust ${r.kn.toFixed(1)} kilonewtons.`;
}
function drawReadout(s) {
  const r = M.readoutOf(s);
  const text = `${r.mph.toFixed(0)} mph · ${r.height.toFixed(1)} m · ${r.pitch.toFixed(0)}° · ${r.bar.toFixed(0)} bar · ${r.kn.toFixed(1)} kN · suction ${r.margin.toFixed(1)} kN`;
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(Math.round(sliderF() * 100)));
  const words = wordsOf(s);
  if (words !== announced) { announced = words; clearTimeout(announce.t); announce.t = setTimeout(() => { said.textContent = words; }, 600); }
}
const announce = { t: 0 };

// ---------------------------------------------------------------- render
function drawConsole(s) {
  const f = sliderF();
  if (CONSOLE_NODES.length >= 2) {
    const [k0, k1, ky, kz] = D.console.knob.span;
    CONSOLE_NODES[0].setAttribute("transform", translateAlong(D.P, [k0 + f * (k1 - k0), ky, kz]));
    CONSOLE_NODES[1].setAttribute("transform", translateAlong(D.P, D.console.wheel.at));
  }
  if (NEEDLE) {
    const idx = Math.max(0, M.PHASES.indexOf(s.phase));
    const a = (idx / M.PHASES.length) * TAU;
    const [wx, wy] = D.console.wheel.at;
    const r = D.console.wheel.r, z = D.console.wheel.z;
    const hub = iso([wx, wy, z], D.P);
    const tip = iso([wx + r * Math.cos(a), wy + r * Math.sin(a), z], D.P);
    NEEDLE.setAttribute("d", pathOf([hub, tip]));
  }
}

let last = 0;
let visible = false;
let frame = 0;
function render(now) {
  poseCar(sim);
  sortSolids();
  plumeInputs(sim);
  drawConsole(sim);
  drawReadout(sim);
  if (backLayer && frontLayer) {
    if (backSet.n) packPlume(backLayer, backSet, now); else backLayer.clear();
    if (frontSet.n) packPlume(frontLayer, frontSet, now); else frontLayer.clear();
  } else drawFallback();
  stage.style.setProperty("--rr-inner", shellFade ? "1" : "0");
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (scrubF !== null) { advanceTo(scrubF * cycleT()); }
  else if (advance) { stepBy(dt * SLOW_STEPS[slow]); }
  render(now);
  frame = visible ? requestAnimationFrame(tick) : 0;
}
// reduced motion: no animation loop, but a scrub still paints one honest frame
const paintOnce = () => { if (scrubF !== null) advanceTo(scrubF * cycleT()); render(performance.now()); };
const run = () => {
  if (still.matches) { paintOnce(); return; }
  if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); }
};

// ---------------------------------------------------------------- input
function vbPoint(event) {
  const box = stage.getBoundingClientRect();
  return [((event.clientX - box.left) / box.width) * D.W, ((event.clientY - box.top) / box.height) * D.H];
}
function fractionAt(event) {
  const [px] = vbPoint(event);
  const [tx, ty, tw] = D.console.track;
  const a = iso([tx, ty, 1.2], D.P)[0], b = iso([tx + tw, ty, 1.2], D.P)[0];
  return clampTo((px - a) / Math.max(1, b - a), 0, 1);
}
// The tour pauses while you drive it and picks itself up again a moment after
// the last input, so it still loops on its own.
const HOLD_MS = 5000;
const idle = { t: 0 };
function paintHint() {
  const el = root.querySelector('[data-corner="hint"]');
  if (!el) return;
  const bits = ["drag the console slider"];
  if (!TOUCH) {
    bits.push("← → step");
    bits.push(bias ? `trim ${bias > 0 ? "+" : "−"}${Math.round(Math.abs(bias) * 3)}` : "shift + ← → trim");
    bits.push(`T slow${slow ? ` ×${slow === 1 ? 20 : 100}` : ""}`);
    bits.push("Space relaunch");
    bits.push(shellFade ? "E shell hidden" : "E shell");
  }
  if (scrubF !== null) bits.push("paused");
  el.textContent = bits.join(" · ");
}
function resume() { advance = true; scrubF = null; paintHint(); run(); }
function pause(ms = HOLD_MS) {
  advance = false;
  clearTimeout(idle.t);
  if (!still.matches) idle.t = setTimeout(resume, ms);
  paintHint();
}
function scrubTo(f) { scrubF = clampTo(f, 0, 1); pause(); run(); }
function overConsole(event) {
  const [px, py] = vbPoint(event);
  const [x0, y0, x1, y1] = D.consoleHit;
  return px >= x0 && px <= x1 && py >= y0 && py <= y1;
}
function say() { said.textContent = wordsOf(sim); }

// only a drag that starts on the console counts: a press on the car or the ramp
// just focuses the figure, and must not stop the tour
let dragging = false;
stage.addEventListener("pointerdown", (e) => {
  stage.focus({ preventScroll: true });   // so the figure answers the keys
  if (!overConsole(e)) return;
  dragging = true;
  scrubTo(fractionAt(e));
  stage.setPointerCapture?.(e.pointerId);
  e.preventDefault();
});
stage.addEventListener("pointermove", (e) => { if (dragging && e.buttons) scrubTo(fractionAt(e)); });
stage.addEventListener("pointerup", () => { if (!dragging) return; dragging = false; pause(); });
stage.addEventListener("pointercancel", () => { if (!dragging) return; dragging = false; pause(); });

function relaunch() { reset(); clearTimeout(idle.t); scrubF = null; bias = 0; advance = true; paintHint(); run(); say(); }

// The keys hang off the window rather than the figure: the figure is the whole
// page, and having to click it before the keys answer is a trap.
function onKey(e) {
  const k = e.key;
  const now = scrubF === null ? sliderF() : scrubF;
  if (k === "ArrowRight" || k === "ArrowLeft") {
    const dir = k === "ArrowRight" ? 1 : -1;
    if (e.shiftKey) { bias = clampTo(bias + dir * 0.34, -1, 1); pause(); }
    else scrubTo(now + dir * 0.02);
  } else if (k === "ArrowUp" || k === "ArrowDown") {
    if (!visible) return;               // off screen, let the arrows scroll the page
    scrubTo(now + (k === "ArrowUp" ? 0.06 : -0.06));
  } else if (k === " " || k === "Enter") relaunch();
  else if (k === "t" || k === "T") { slow = (slow + 1) % SLOW_STEPS.length; pause(); }
  else if (k === "e" || k === "E") { shellFade = !shellFade; pause(); }
  else return;
  e.preventDefault();
  say();
}
window.addEventListener("keydown", onKey);

still.addEventListener("change", () => { advance = !still.matches; if (!still.matches) { last = 0; } else { reset(); scrubF = D.stillT / cycleT(); } paintHint(); run(); });
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "160px 0px" }).observe(stage);

paintHint();

// reduced motion: one honest still frame, the car hung at the lip
if (still.matches) { reset(); scrubF = D.stillT / cycleT(); advanceTo(scrubF * cycleT()); advance = false; }
render(0);
say();
