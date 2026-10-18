// The truth model: one planar rigid body (x, z, pitch, angular rate) with ten
// fixed nozzles, a compressed-air tank and a suction plenum. Everything the
// figure does — the drawing, the readout, the audit — reads this one model.
//
// Newton, with fixed sub-steps. Thrust pulls down a finite tank; the suction
// downforce must beat the weight the moment the car is past vertical, and the
// margin is shown live. The pitch is not keyframed: it comes out of where the
// nozzles sit on the body, because the allocator only ever commands a force and
// a torque and lets the nozzle arms decide which nozzles fire.

export const G = 9.81;
export const MASS = 1320;              // kg, car with driver and full tank
export const CAR_L = 4.6;              // m, length
export const CAR_W = 1.94;             // m, width
export const CG_H = 0.52;              // m, centre of gravity above the ground
export const WHEEL_R = 0.33;           // m

// Compressed air: p V = m R T. Flow is finite, so thrust falls as the tank
// empties and can never exceed what the pressure supports.
export const TANK_P0 = 300;            // bar, charged
export const TANK_V = 0.60;            // m3
export const AIR_R = 287;              // J/kg K
export const AIR_T = 293;              // K
export const ISP = 120;                // s, heated-air thruster (illustrative)
export const VE = ISP * G;             // m/s, effective exhaust velocity
export const NOZZLE_N = 10800;         // N per nozzle at full tank pressure
export const SUCTION_N = 24000;        // N, plenum downforce at full tank, fan full
export const FAN_RISE = 0.26;          // s, fan spool

// The ramp: the tangent turns RAMP_TURN over arc length RAMP_L, and the radius
// tightens toward the lip, so the car is already slowing before the tight curl.
export const RAMP_TURN = 180;          // deg
export const RAMP_R = 6.0;             // m, radius at the lip
export const RAMP_P = 1.9;             // curl exponent
export const RAMP_L = ((RAMP_TURN * Math.PI) / 180) * RAMP_P * RAMP_R;

export const V_60 = 26.82;             // m/s == 60 mph
export const START_X = -14.0;          // m, on the line
export const RAMP_X = 0.0;             // m, foot of the ramp
export const V_LIP = 1.6;              // m/s, the speed the lip can take
export const MPH = 2.23694;
export const LANE_Y = -3.4;            // m, the taxi lane the return run uses
export const LANE_RATE = 3.2;          // m/s, how fast it pulls across to the lane

// Ten fixed thrusters. dir is the thrust ON the car, in body axes (x nose, z roof),
// and force is what that nozzle delivers at full tank pressure.
export const NOZZLES = [
  { id: "r1", group: "rear", x: -2.12, z: 0.02, y: -0.62, dx: 1, dz: 0, force: NOZZLE_N },
  { id: "r2", group: "rear", x: -2.12, z: 0.02, y: -0.21, dx: 1, dz: 0, force: NOZZLE_N },
  { id: "r3", group: "rear", x: -2.12, z: 0.02, y: 0.21, dx: 1, dz: 0, force: NOZZLE_N },
  { id: "r4", group: "rear", x: -2.12, z: 0.02, y: 0.62, dx: 1, dz: 0, force: NOZZLE_N },
  { id: "f1", group: "front", x: 2.02, z: 0.30, y: -0.42, dx: -1, dz: 0, force: NOZZLE_N },
  { id: "f2", group: "front", x: 2.02, z: 0.30, y: 0.42, dx: -1, dz: 0, force: NOZZLE_N },
  { id: "s1", group: "side", x: 0.35, z: 0.26, y: -0.88, dx: 0, dz: 0, dy: -1, force: 5200 },
  { id: "s2", group: "side", x: 0.35, z: 0.26, y: 0.88, dx: 0, dz: 0, dy: 1, force: 5200 },
  { id: "u1", group: "under", x: -2.05, z: -0.34, y: 0, dx: 0, dz: 1, force: 32000 },
  { id: "u2", group: "under", x: 2.05, z: -0.34, y: 0, dx: 0, dz: 1, force: 32000 },
];
export const groupForce = (group) => NOZZLES.filter((n) => n.group === group).reduce((sum, n) => sum + n.force, 0);
export const IYY = (MASS * (CAR_L * CAR_L + 1.4)) / 12;   // kg m2

const LIMIT = Math.max(0, 1);                              // (kept for clarity)

// ---------------------------------------------------------------- the ramp
const curve = (() => {
  const N = 480;
  const xs = [0], zs = [0], ts = [0];
  let x = 0, z = 0;
  for (let i = 1; i <= N; i++) {
    const s = (i / N) * RAMP_L;
    const th = ((RAMP_TURN * Math.PI) / 180) * Math.pow(s / RAMP_L, RAMP_P);
    const ds = RAMP_L / N;
    x += Math.cos(th) * ds;
    z += Math.sin(th) * ds;
    xs.push(x); zs.push(z); ts.push(th);
  }
  return { xs, zs, ts, N };
})();

export const LIP = { x: curve.xs[curve.N], z: curve.zs[curve.N], th: curve.ts[curve.N] };

export function curveAt(s) {
  const u = Math.max(0, Math.min(1, s / RAMP_L)) * curve.N;
  const i = Math.min(curve.N - 1, Math.floor(u));
  const f = u - i;
  return {
    x: curve.xs[i] + (curve.xs[i + 1] - curve.xs[i]) * f,
    z: curve.zs[i] + (curve.zs[i + 1] - curve.zs[i]) * f,
    th: curve.ts[i] + (curve.ts[i + 1] - curve.ts[i]) * f,
  };
}
export function curvatureAt(s) {
  const th = (RAMP_TURN * Math.PI) / 180;
  const t = Math.max(1e-3, Math.min(1, s / RAMP_L));
  return (th * RAMP_P * Math.pow(t, RAMP_P - 1)) / RAMP_L;
}
// World point of the track surface at arc length s, and its tangent/normal.
export function trackAt(s) {
  const c = curveAt(s);
  return {
    x: c.x, z: c.z, th: c.th,
    tx: Math.cos(c.th), tz: Math.sin(c.th),
    ux: -Math.sin(c.th), uz: Math.cos(c.th),   // the car's up (toward the centre)
  };
}
export const END_S = RAMP_L;

// ---------------------------------------------------------------- phases
export const PHASES = ["charge", "launch", "climb", "hang", "fly", "touch", "roll", "back"];

const massOf = (p) => (p * 1e5 * TANK_V) / (AIR_R * AIR_T);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Flight schedule. The ramp has already rolled the car half over by the time it
// reaches the lip (pitch = LIP angle), and the lip points back the way it came,
// so the run-out is thrown backwards, over the ramp, to land on the approach
// side. RANGE is measured from the lip and is therefore negative. The pack
// finishes the roll: the whole stunt is one turn, half of it on the ramp.
export const RANGE = -17.4;            // m from the lip to touch-down (backward)
export const RUN_T = 3.3;              // s the run-out is spread over
export const PITCH0 = (LIP.th * 180) / Math.PI;
export const PITCH_SPAN = 180;         // deg, lip -> level, the rest of the roll
export const PITCH1 = PITCH0 + PITCH_SPAN;

// The flip is not a clockwork trapezoid: it is a rate profile laid over the 180
// degrees the pack still has to turn, shaped by where the ten nozzles can
// actually push. Reading the torque map, the pack spins the car up hardest just
// past the lip (pitch 180-270), which is the strong window the run-out leans on.
const FLIP_W1 = 4.0;                    // rad/s, high window
const FLIP_W2 = 0.29;                   // rad/s, slow settle
const FLIP_S1 = 0.24;                   // fraction of the turn spent spinning up
const FLIP_S2 = 0.58;                   // end of the high plateau
const FLIP_S3 = 0.94;                   // end of the hard brake
const FLIP_S4 = 0.97;                   // end of the slow coast
const FLIP_CTRL = [
  [0.00, FLIP_W1 * 0.12],
  [FLIP_S1, FLIP_W1],
  [FLIP_S2, FLIP_W1],
  [FLIP_S3, FLIP_W2],
  [FLIP_S4, FLIP_W2],
  [1.00, FLIP_W2 * 0.12],
];
const SPAN_RAD = (PITCH_SPAN * Math.PI) / 180;
const flip = (() => {
  const N = 720;
  const rateOf = (s) => {
    for (let i = 1; i < FLIP_CTRL.length; i++) {
      const [s0, w0] = FLIP_CTRL[i - 1], [s1, w1] = FLIP_CTRL[i];
      if (s <= s1) return w0 + ((w1 - w0) * (s - s0)) / (s1 - s0);
    }
    return FLIP_CTRL[FLIP_CTRL.length - 1][1];
  };
  const ts = [0];
  let t = 0;
  for (let i = 1; i <= N; i++) { t += SPAN_RAD / N / rateOf((i - 0.5) / N); ts.push(t); }
  return { ts, N, total: t };
})();
export const FLIGHT_T = flip.total;    // s in the air, set by the profile above
const pitchTarget = (u) => {
  const target = clamp(u, 0, 1) * flip.total;
  let lo = 0, hi = flip.N;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (flip.ts[mid] < target) lo = mid + 1; else hi = mid; }
  const i = Math.max(1, lo);
  const t0 = flip.ts[i - 1], t1 = flip.ts[i];
  const f = t1 > t0 ? (target - t0) / (t1 - t0) : 0;
  return PITCH0 + PITCH_SPAN * ((i - 1 + f) / flip.N);
};

const shape = (u) => { const t = clamp(u, 0, 1); return 0.72 * (t * t * (3 - 2 * t)) + 0.28 * t; };
export function flightX(u, x0) { return x0 + RANGE * shape(u); }
export function flightHeight(u, z0) {
  const t = clamp(u, 0, 1);
  return CG_H + (z0 - CG_H) * Math.pow(1 - t, 1.2);
}
// The trapezoid's rate and acceleration in scheduled time, so the nozzles can be
// fed forward instead of chasing a bang-bang slew. du/dt = 1/FLIGHT_T.
const DU = 0.002;
const rateAt = (u) =>
  ((pitchTarget(Math.min(1, u + DU)) - pitchTarget(Math.max(0, u - DU))) / (2 * DU * FLIGHT_T)) * (Math.PI / 180);
const accAt = (u) => (rateAt(Math.min(1, u + DU)) - rateAt(Math.max(0, u - DU))) / (2 * DU * FLIGHT_T);

const climbTarget = (s) => {
  const t = clamp(s / RAMP_L, 0, 1);
  return V_LIP + (V_LOOK - V_LIP) * Math.pow(1 - t, 1.15);
};
const V_LOOK = 24.0;                    // m/s the climb is trimmed to enter at

// Vertical guidance once the car is upright (upZ > 0): hold a sink rate that
// eases as the ground comes up. These are the numbers the landing lives or dies
// by, so they sit in one place.
const VSAFE_A = 0.7;                    // m/s floor of the sink rate
const VSAFE_B = 0.45;                   // s^-1, how fast the allowed sink grows with height
const VSAFE_GAIN = 3.5;                 // 1/s, how hard the sink rate is held
const VSAFE_MAX = 13.0;                 // m/s cap

// Pitch tracking gains: feed-forward from the trapezoid plus a small angle term
// and a rate term. These are the numbers that keep the flip on schedule.
const PITCH_KP = 24.0;                  // 1/s^2
const PITCH_KD = 20.0;                  // 1/s
const PITCH_KI = 5.0;                   // 1/s^3
const PITCH_I_MAX = 34.0;               // rad/s^2, integral authority cap
// The trim (shift + arrows) moves the attitude the flip is aiming at, and it
// holds all the way down the run-out: full trim aims the car about 35 degrees
// off level, well past what the under thrusters can catch, so it goes down.
// Aiming it this way keeps the trim's authority whatever the gains above become.
const TRIM_DEG = 35.0;
const FLARE_GATE = 0.25;              // fraction of weight of up-force before the flare fires
const FLARE_CAP = 0.85;                 // fraction of the available up-force the flare may ask for

export function freshState() {
  return {
    t: 0, phase: "charge", phaseT: 0,
    x: START_X, y: 0, z: CG_H, vx: 0, vz: 0, pitch: 0, omega: 0,
    s: 0, v: 0, vEntry: V_LOOK,
    p: TANK_P0, m: massOf(TANK_P0), fan: 0,
    levels: NOZZLES.map(() => 0),
    thrust: 0, margin: SUCTION_N,
    sixty: -1, crashed: false, bias: 0, distance: 0, pitchI: 0, loose: false,
    x0: LIP.x, z0: LIP.z,
  };
}

const pressureLimit = (st) => Math.max(0, st.p) / TANK_P0;

// ---------------------------------------------------------------- allocator
// Planar nozzles only: the two side thrusters carry no in-plane force or torque.
const PLANAR = NOZZLES.map((n, i) => ({ n, i })).filter((o) => Math.abs(o.n.dx) + Math.abs(o.n.dz) > 1e-6);

function invert3(m) {
  const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const inv = 1 / det;
  return [
    [A * inv, (c * h - b * i) * inv, (b * f - c * e) * inv],
    [B * inv, (a * i - c * g) * inv, (c * d - a * f) * inv],
    [C * inv, (b * g - a * h) * inv, (a * e - b * d) * inv],
  ];
}
const mul3 = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];

// Choose ten nozzle throttles to make a wanted wrench (Fx, Fz, torque about y).
// Least squares with a clamp, so a nozzle past full simply can't help any more.
function allocate(st, fx, fz, torque, bias) {
  const lim = pressureLimit(st);
  const c = Math.cos((st.pitch * Math.PI) / 180);
  const s = Math.sin((st.pitch * Math.PI) / 180);
  const cols = PLANAR.map(({ n, i }) => {
    const wx = n.dx * c - n.dz * s;
    const wz = n.dx * s + n.dz * c;
    const Fmax = n.force * lim;
    return { i, fx: wx * Fmax, fz: wz * Fmax, tq: (n.x * wz - n.z * wx) * Fmax };
  });
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const col of cols) {
    const v = [col.fx, col.fz, col.tq];
    for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) M[r][q] += v[r] * v[q];
  }
  const Mi = invert3(M);
  const want = [fx, fz, torque];
  let g = mul3(Mi, want);
  let u = cols.map((col) => clamp(col.fx * g[0] + col.fz * g[1] + col.tq * g[2], 0, 1));
  for (let k = 0; k < 4; k++) {
    const r = [fx, fz, torque];
    cols.forEach((col, j) => { r[0] -= col.fx * u[j]; r[1] -= col.fz * u[j]; r[2] -= col.tq * u[j]; });
    g = mul3(Mi, r);
    let changed = false;
    u = u.map((v, j) => {
      const d = cols[j].fx * g[0] + cols[j].fz * g[1] + cols[j].tq * g[2];
      const nv = clamp(v + d, 0, 1);
      if (Math.abs(nv - v) > 1e-4) changed = true;
      return nv;
    });
    if (!changed) break;
  }
  if (bias) {
    for (const { n, i } of PLANAR) {
      if (n.group !== "under") continue;
      const at = cols.findIndex((col) => col.i === i);
      if (at >= 0) u[at] = clamp(u[at] + bias * 0.16 * (n.x < 0 ? -1 : 1), 0, 1);
    }
  }
  const out = { levels: NOZZLES.map(() => 0), fx: 0, fz: 0, tq: 0 };
  cols.forEach((col, j) => {
    out.levels[col.i] = u[j];
    out.fx += col.fx * u[j];
    out.fz += col.fz * u[j];
    out.tq += col.tq * u[j];
  });
  return out;
}

// ---------------------------------------------------------------- readout
export function readoutOf(st) {
  const speed = st.phase === "climb" || st.phase === "hang" ? Math.abs(st.v) : Math.hypot(st.vx, st.vz);
  return {
    mph: speed * MPH,
    height: Math.max(0, st.z - CG_H),
    pitch: ((st.pitch % 360) + 360) % 360,
    bar: st.p,
    kn: st.thrust / 1000,
    margin: st.margin / 1000,
    phase: st.crashed ? "down" : st.phase,
  };
}

const text = (n, d) => n.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
export function labelOf(st) {
  if (st.crashed) return `down · ${text(readoutOf(st).mph, 0)} mph`;
  return {
    charge: "charging", launch: "launch", climb: "on the fans",
    hang: "hung · upside down", fly: "flip", touch: "touchdown",
    roll: "braking", back: "return",
  }[st.phase];
}

// ---------------------------------------------------------------- integration
export function step(st, dt, user = {}) {
  const bias = user.bias ? clamp(user.bias, -1, 1) : 0;
  st.bias = bias;
  st.t += dt;
  st.phaseT += dt;
  const lim = pressureLimit(st);
  let want = { levels: NOZZLES.map(() => 0), fx: 0, fz: 0, tq: 0 };

  if (st.loose) {
    // The fans lost their hold: there is no deck under the car and no attitude
    // to fire into, so from here it is a plain falling body until it lands.
    st.vz -= G * dt;
    st.vx += (-0.45 * st.vx * Math.abs(st.vx)) / MASS * dt;
    st.omega *= Math.exp(-0.5 * dt);
    st.x += st.vx * dt;
    st.z += st.vz * dt;
    st.pitch += ((st.omega * 180) / Math.PI) * dt;
    st.margin = 0;
    want.levels = NOZZLES.map(() => 0);
    if (st.z <= CG_H) {
      st.z = CG_H; st.crashed = true; st.loose = false;
      st.phase = "touch"; st.phaseT = 0; st.vzPrev = st.vz;
    }
  } else if (st.phase === "charge") {
    st.p = Math.min(TANK_P0, st.p + 95 * dt);
    st.m = massOf(st.p);
    st.fan = Math.max(0, st.fan - dt / FAN_RISE);
    st.x = START_X; st.z = CG_H; st.vx = 0; st.vz = 0; st.pitch = 0; st.omega = 0;
    if (st.p >= TANK_P0 - 1e-6 && st.phaseT >= 1.3) { st.phase = "launch"; st.phaseT = 0; st.sixty = -1; }
  } else if (st.phase === "launch") {
    // the four rear thrusters; nose level on the runway
    st.z = CG_H; st.pitch = 0; st.omega = 0; st.vz = 0;
    const level = st.sixty < 0 ? 1 : 0;
    const fx = groupForce("rear") * lim * level;
    const drag = 0.5 * st.vx * Math.abs(st.vx) + 190 * Math.sign(st.vx);
    st.vx += ((fx - drag) / MASS) * dt;
    st.x += st.vx * dt;
    want.levels = NOZZLES.map((n) => (n.group === "rear" ? level : 0));
    if (st.sixty < 0 && st.vx >= V_60) st.sixty = st.t;
    if (st.x >= RAMP_X) {
      st.phase = "climb"; st.phaseT = 0; st.s = 0; st.v = st.vx; st.vEntry = st.vx;
    }
  } else if (st.phase === "climb") {
    // one degree of freedom along the track; the pitch is the track's own angle
    const tr = trackAt(st.s);
    const sT = Math.sin(tr.th);
    const vT = climbTarget(st.s);
    const aT = clamp(4.2 * (vT - st.v), -20, 15);
    const need = MASS * (aT + G * sT);
    let push = 0;
    if (need >= 0) {
      const level = clamp(need / (groupForce("rear") * lim), 0, 1);
      push = level * groupForce("rear") * lim;
      want.levels = NOZZLES.map((n) => (n.group === "rear" ? level : 0));
    } else {
      const level = clamp(-need / (groupForce("front") * lim), 0, 1);
      push = -level * groupForce("front") * lim;
      want.levels = NOZZLES.map((n) => (n.group === "front" ? level : 0));
    }
    st.v = Math.max(0.2, st.v + (push / MASS - G * sT) * dt);
    st.s += st.v * dt;
    const now = trackAt(st.s);
    st.x = now.x + CG_H * now.ux;
    st.z = now.z + CG_H * now.uz;
    st.pitch = (now.th * 180) / Math.PI;
    st.vx = st.v * now.tx;
    st.vz = st.v * now.tz;
    st.margin = suctionOf(st) - MASS * Math.max(0, -G * now.uz - st.v * st.v * curvatureAt(st.s));
    if (st.margin < 0) {
      // the plenum cannot hold the load any more: the car comes off the deck
      st.loose = true;
      st.vx = st.v * now.tx; st.vz = st.v * now.tz;
      st.omega = 0.3;
      st.x0 = st.x; st.z0 = st.z;
    } else if (st.s >= END_S || st.v <= V_LIP * 0.7) {
      st.s = END_S; st.phase = "hang"; st.phaseT = 0;
      const lip = trackAt(END_S);
      st.x = lip.x + CG_H * lip.ux;
      st.z = lip.z + CG_H * lip.uz;
      st.pitch = (lip.th * 180) / Math.PI;
      st.v = 0; st.vx = 0; st.vz = 0;
    }
  } else if (st.phase === "hang") {
    // hung upside down at the lip, on the fans, while the boost comes in
    const tr = trackAt(END_S);
    st.pitch = (tr.th * 180) / Math.PI;
    st.x = tr.x + CG_H * tr.ux;
    st.z = tr.z + CG_H * tr.uz;
    st.v = 0; st.vx = 0; st.vz = 0;
    st.margin = suctionOf(st) - MASS * Math.max(0, -G * tr.uz);
    if (st.phaseT > 1.25) {
      st.phase = "fly"; st.phaseT = 0; st.x0 = st.x; st.z0 = st.z;
      st.vx = 0; st.vz = 0; st.omega = 0; st.pitchI = 0;
    }
  } else if (st.phase === "fly") {
    // A falling powered flip. While the car is past vertical no nozzle can push
    // it up, so gravity has it and the pack only steers; once it swings upright
    // the under thrusters catch it and flare.
    const u = clamp(st.phaseT / FLIGHT_T, 0, 1);
    // the run-out geometry is spread over the whole descent, not over the roll:
    // the roll is quick, and the car then rides the flare down, still travelling
    // backwards, so it does not sling itself backwards and then drop vertically
    const uX = clamp(st.phaseT / RUN_T, 0, 1);
    const du = 1e-3;
    const xT = flightX(uX, st.x0);
    const vxT = (flightX(Math.min(1, uX + du), st.x0) - flightX(Math.max(0, uX - du), st.x0)) / (2 * du * RUN_T);
    const axT = 4.5 * (xT - st.x) + 3.5 * (vxT - st.vx);
    const pT = pitchTarget(u) + bias * TRIM_DEG;
    let dth = pT - st.pitch;
    dth = ((dth % 360) + 540) % 360 - 180;
    // past the schedule the target is a fixed level: hold it with a plain
    // PD and no feed-forward (the one-sided rate difference would otherwise
    // read as a deceleration that never comes and leave a slow drift)
    const ext = u >= 1;
    const wT = ext ? 0 : rateAt(u);
    const alphaT = ext ? 0 : accAt(u);
    const dthRad = (dth * Math.PI) / 180;
    // past the end of the schedule the target stops moving: drop the integral
    // so it cannot sit wound up and slowly unwind the car off level
    st.pitchI = u >= 1 ? 0 : clamp((st.pitchI || 0) + dthRad * PITCH_KI * dt, -PITCH_I_MAX, PITCH_I_MAX);
    let tqCmd = IYY * (alphaT + PITCH_KP * dthRad + PITCH_KD * (wT - st.omega) + st.pitchI);
    // At some attitudes the pack simply cannot make a torque of the sign asked
    // for (around pitch 270 there is no brake at all). Asking anyway drags the
    // allocator off the vertical job, so clamp the command to what exists.
    const cc = Math.cos((st.pitch * Math.PI) / 180);
    const ss = Math.sin((st.pitch * Math.PI) / 180);
    let tqLo = 0, tqHi = 0, upMax = 0;
    for (const n of NOZZLES) {
      const wx = n.dx * cc - n.dz * ss;
      const wz = n.dx * ss + n.dz * cc;
      const tq = (n.x * wz - n.z * wx) * n.force * lim;
      if (tq < 0) tqLo += tq; else tqHi += tq;
      upMax += Math.max(0, wz) * n.force * lim;
    }
    tqCmd = clamp(tqCmd, tqLo, tqHi);
    const upZ = Math.cos((st.pitch * Math.PI) / 180);
    // How much of the pack can push *up* (world z) at this attitude. It is zero
    // at pitch 180 — hung on its back, nothing lifts it — and grows as the car
    // rolls onto its side and then upright. The flare uses whatever is there, and
    // is capped so the under thrusters always keep some pitch authority in hand;
    // asking for all of the up-force at once is what makes the flip overshoot.
    let fzCmd = 0;
    if (upMax > FLARE_GATE * MASS * G) {
      const vSafe = -Math.min(VSAFE_MAX, VSAFE_A + VSAFE_B * Math.max(0, st.z - CG_H));
      fzCmd = Math.min(MASS * (G + VSAFE_GAIN * (vSafe - st.vz)), FLARE_CAP * upMax);
    }
    want = allocate(st, axT * MASS, fzCmd, tqCmd, bias);
    st.dbg = { upZ, fzCmd, fx: want.fx, fz: want.fz, tq: want.tq, tqCmd, axT };
    st.vx += (want.fx - 0.5 * st.vx * Math.abs(st.vx)) / MASS * dt;
    st.vz += (want.fz / MASS - G) * dt;
    st.omega += (want.tq / IYY) * dt;
    st.x += st.vx * dt;
    st.z += st.vz * dt;
    st.pitch += ((st.omega * 180) / Math.PI) * dt;
    st.margin = 0;
    const level = ((st.pitch % 360) + 360) % 360;
    const off = Math.min(level, 360 - level);
    // the flight ends when the wheels actually reach the ground, not when the
    // schedule runs out, so there is no drop to hide. The backstop is sized to
    // the whole run-out (the roll is shorter than the descent), not to the roll.
    if (st.z <= CG_H + 0.015 || st.phaseT > RUN_T + 2.5) {
      st.z = Math.max(CG_H, st.z);
      st.vzPrev = st.vz;
      if (off > 24 || st.vz < -8.5 || Math.abs(st.vx) > 15) st.crashed = true;
      st.phase = "touch"; st.phaseT = 0;
    }
  } else if (st.phase === "touch" || st.phase === "roll") {
    st.z = CG_H;
    if (st.crashed) {
      // keep tumbling: the pitch spins on, shedding rate, and the slide bleeds speed
      st.omega *= Math.exp(-1.9 * dt);
      st.pitch += ((st.omega * 180) / Math.PI) * dt;
      st.vx -= Math.sign(st.vx) * Math.min(Math.abs(st.vx), (5.2 + 0.06 * Math.abs(st.vx)) * dt);
    } else {
      // wheels down: the nose settles and the tyres and thrusters brake. The car
      // arrives off the lip travelling backwards, so the brake is whichever
      // group pushes against the way it is actually going.
      st.pitch = 0;
      st.omega = 0;
      const dir = st.vx > 0 ? 1 : -1;
      const brake = clamp(Math.abs(st.vx) / 6, 0, 1);
      const group = dir > 0 ? "front" : "rear";
      want.levels = NOZZLES.map((n) => (n.group === group ? brake * lim * 0.8 : 0));
      st.vx -= dir * (4.6 + 3.2 * brake) * dt;
    }
    st.vz = 0;
    st.x += st.vx * dt;
    if (Math.abs(st.vx) <= 0.05) {
      st.vx = 0; st.omega = 0;
      if (st.phaseT > 0.45) st.phase = "roll";
      if (st.phase === "roll") { st.phase = "back"; st.phaseT = 0; }
    }
  } else if (st.phase === "back") {
    // the drive back to the line is a profiled approach, not a flat-out run
    // into a wall: the speed it asks for tapers to nothing at the line, so the
    // loop closes without a stop you can see
    st.z = CG_H; st.vz = 0;
    if (st.crashed) {
      // after a bad landing the shell settles onto the nearest face instead of
      // snapping upright: the loop still closes, but without a jump cut
      const tgt = Math.round(st.pitch / 360) * 360;
      st.pitch += (tgt - st.pitch) * Math.min(1, 5 * dt);
      st.omega = 0;
    }
    const gap = st.x - START_X;
    const vT = -Math.min(13, 1.6 * Math.max(0, gap));
    const accel = clamp((vT - st.vx) * 2.2, -6.5, 6.5);
    st.vx += accel * dt;
    // front thrusters drive it backward, the rear ones are the brake
    const lvl = clamp(Math.abs(accel) / 3.0, 0, 1);
    want.levels = NOZZLES.map((n) => (n.group === (accel < 0 ? "front" : "rear") ? lvl : 0));
    st.x += st.vx * dt;
    if (gap <= 0.12 && Math.abs(st.vx) < 2.0) {
      st.x = START_X; st.vx = 0; st.phase = "charge"; st.phaseT = 0; st.crashed = false;
    }
  }

  // the plenum follows its own envelope; the fan is on from the line to the lip
  const fanWant = st.phase === "launch" || st.phase === "climb" || st.phase === "hang" ? 1 : 0;
  st.fan += clamp(fanWant - st.fan, -dt / FAN_RISE, dt / FAN_RISE);

  let total = 0;
  for (let i = 0; i < NOZZLES.length; i++) total += want.levels[i] * NOZZLES[i].force * lim;
  st.thrust = total;
  st.distance = st.x - START_X;
  if (st.phase !== "charge") {
    const flow = total / VE;
    st.m = Math.max(st.m * 0.05, st.m - flow * dt);
    st.p = (st.m * AIR_R * AIR_T) / (TANK_V * 1e5);
  }
  st.levels = want.levels;
  // the return run pulls off onto a taxi lane so it passes clear of the ramp
  // and the props; the launch line is centred
  const yTarget = st.phase === "back" && st.x > START_X + 9 ? LANE_Y : 0;
  st.y += clamp(yTarget - st.y, -LANE_RATE * dt, LANE_RATE * dt);
  return st;
}

const suctionOf = (st) => SUCTION_N * pressureLimit(st) * st.fan;

// ---------------------------------------------------------------- replay
export function simulate(tEnd, dt = 1 / 240, user = {}) {
  const st = freshState();
  const n = Math.max(0, Math.ceil(tEnd / dt));
  for (let i = 0; i < n; i++) step(st, dt, user);
  return st;
}

function snapshot(st) {
  return {
    t: st.t, phase: st.phase, phaseT: st.phaseT,
    x: st.x, z: st.z, vx: st.vx, vz: st.vz, pitch: st.pitch, omega: st.omega,
    y: st.y,
    s: st.s, v: st.v, p: st.p, fan: st.fan, margin: st.margin, thrust: st.thrust,
    levels: st.levels.slice(), crashed: st.crashed,
  };
}

export function cycleTable(hz = 60, maxSeconds = 40) {
  const st = freshState();
  const dt = 1 / 240;
  const rows = [];
  let next = 0;
  const facts = {
    sixty: -1, lowestMargin: 1e9, peak: 0, lipX: LIP.x, lipZ: LIP.z,
    landingX: 0, cycle: 0, flightT: 0, crashed: false,
    touchPitch: 0, touchVz: 0, touchVx: 0, touchZ: 0, peakPitch: 0, levelT: 0,
  };
  for (let i = 0; i < maxSeconds * 240; i++) {
    const prev = st.phase;
    step(st, dt, { bias: 0 });
    if (prev === "hang" && st.phase === "fly") facts.flightStart = st.t;
    if (st.phase === "climb" || st.phase === "hang") facts.lowestMargin = Math.min(facts.lowestMargin, st.margin);
    if (st.z > facts.peak && st.phase === "fly") facts.peak = st.z;
    if (st.phase === "fly") {
      facts.peakPitch = Math.max(facts.peakPitch, st.pitch);
      const lv = ((st.pitch % 360) + 360) % 360;
      if (!facts.levelT && Math.min(lv, 360 - lv) < 8) facts.levelT = st.t - (facts.flightStart ?? st.t);
    }
    if (st.sixty > 0 && facts.sixty < 0) facts.sixty = st.sixty;
    if (prev !== "touch" && st.phase === "touch") {
      facts.landingX = st.x; facts.crashed = st.crashed;
      facts.touchPitch = ((st.pitch % 360) + 360) % 360;
      facts.touchVz = st.vzPrev; facts.touchVx = st.vx; facts.touchZ = st.z;
      facts.flightT = st.t - (facts.flightStart ?? st.t);
    }
    if (st.t >= next) { rows.push(snapshot(st)); next += 1 / hz; }
    if (st.phase === "charge" && st.phaseT > 0.05 && rows.length > hz * 4) break;
  }
  facts.cycle = st.t;
  return { rows, facts, dt: 1 / hz };
}

export function stateFromRow(r) {
  const st = freshState();
  Object.assign(st, r);
  st.levels = (r.levels || []).slice();
  return st;
}

void LIMIT;
