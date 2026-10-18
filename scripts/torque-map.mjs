// Map the achievable pitch-torque window vs attitude. Positive = spin up the
// flip, negative = brake it. Where the whole window is positive, the car cannot
// slow its rotation at all.
import { NOZZLES } from "../model.mjs";

const rows = [];
for (let th = 0; th <= 360; th += 5) {
  const c = Math.cos((th * Math.PI) / 180), s = Math.sin((th * Math.PI) / 180);
  let lo = 0, hi = 0;
  for (const n of NOZZLES) {
    if (Math.abs(n.dx) + Math.abs(n.dz) < 1e-6) continue;
    const wx = n.dx * c - n.dz * s;
    const wz = n.dx * s + n.dz * c;
    const tq = (n.x * wz - n.z * wx) * n.force;
    if (tq < 0) lo += tq;   // saturate all negative-torque nozzles
    if (tq > 0) hi += tq;
  }
  rows.push({ th, lo: lo / 1000, hi: hi / 1000 });
}
for (const r of rows) {
  const bar = (v) => {
    const n = Math.round(v / 5);
    return v < 0
      ? " ".repeat(Math.max(0, 26 + Math.min(0, n))) + "|".repeat(-Math.min(0, n))
      : " ".repeat(26) + "|".repeat(Math.min(30, n));
  };
  console.log(`${String(r.th).padStart(3)}  lo ${r.lo.toFixed(0).padStart(5)}  hi ${r.hi.toFixed(0).padStart(5)}  ${r.lo >= -0.001 ? "NO-BRAKE" : ""}`);
}
