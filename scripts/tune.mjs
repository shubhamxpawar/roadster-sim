import { freshState, step, readoutOf, LIP, END_S, RAMP_L, START_X, cycleTable, MPH, PITCH0, PITCH1, CG_H } from "../model.mjs";

const mode = process.argv[2] || "run";

if (mode === "cycle") {
  const { rows, facts } = cycleTable();
  console.log("cycle s      ", facts.cycle.toFixed(2));
  console.log("60 mph s     ", facts.sixty.toFixed(3));
  console.log("low margin kN", (facts.lowestMargin / 1000).toFixed(1));
  console.log("lip          ", LIP.x.toFixed(2), LIP.z.toFixed(2), "pitch", PITCH0.toFixed(1), "->", PITCH1.toFixed(0), "arc", RAMP_L.toFixed(1));
  console.log("peak z       ", facts.peak.toFixed(2), "landing x", facts.landingX.toFixed(2));
  console.log("flight s     ", facts.flightT.toFixed(2), "crashed", facts.crashed);
  console.log("touch        ", "pitch", facts.touchPitch.toFixed(0), "vz", facts.touchVz.toFixed(1), "vx", facts.touchVx.toFixed(1), "z", facts.touchZ.toFixed(2));
  const seen = new Set();
  for (const r of rows) {
    if (!seen.has(r.phase)) {
      seen.add(r.phase);
      console.log(
        `→ ${r.phase.padEnd(7)} t ${r.t.toFixed(2)}  x ${r.x.toFixed(1)} z ${r.z.toFixed(2)}  v ${Math.hypot(r.vx, r.vz).toFixed(1)}  pitch ${(((r.pitch % 360) + 360) % 360).toFixed(0)}  p ${r.p.toFixed(0)}  fan ${r.fan.toFixed(2)}  margin ${(r.margin / 1000).toFixed(1)}`,
      );
    }
  }
} else {
  const st = freshState();
  const dt = 1 / 240;
  let next = 0;
  let minMargin = 1e9;
  const rows = [];
  for (let i = 0; i < 40 * 240; i++) {
    step(st, dt, { bias: 0 });
    minMargin = Math.min(minMargin, st.margin);
    if (st.t >= next) {
      next += 0.08;
      rows.push({ ...st, levels: st.levels.slice() });
    }
    if (st.phase === "charge" && st.phaseT > 0.05 && st.t > 4) break;
  }
  let last = null;
  for (const r of rows) {
    if (r.phase === "fly" && last && last.phase === "fly" && Math.round(r.t * 100) % 16 !== 0) continue;
    last = r;
    const r2 = readoutOf(r);
    const dbg = r.dbg ? ` fz ${(r.dbg.fz / 1000).toFixed(1).padStart(5)}/${(r.dbg.fzCmd / 1000).toFixed(1).padStart(5)} fx ${(r.dbg.fx / 1000).toFixed(1).padStart(5)} tq ${(r.dbg.tq / 1000).toFixed(0).padStart(4)}/${(r.dbg.tqCmd / 1000).toFixed(0).padStart(4)} uz ${r.dbg.upZ.toFixed(2).padStart(5)}` : "";
    console.log(
      `${r.t.toFixed(2)} ${r.phase.padEnd(6)} x ${r.x.toFixed(2).padStart(6)} z ${r.z.toFixed(2).padStart(6)} v ${Math.hypot(r.vx, r.vz).toFixed(1).padStart(5)} vz ${r.vz.toFixed(1).padStart(5)} pitch ${r2.pitch.toFixed(0).padStart(4)} om ${r.omega.toFixed(2).padStart(6)} mph ${r2.mph.toFixed(0).padStart(3)} p ${r.p.toFixed(0).padStart(3)} T ${r2.kn.toFixed(1).padStart(4)} fan ${r.fan.toFixed(2)} marg ${(r.margin / 1000).toFixed(1).padStart(5)} s ${r.s.toFixed(1)}${dbg}`,
    );
  }
  console.log("min margin kN", (minMargin / 1000).toFixed(2), "end x", st.x.toFixed(1));
  void END_S; void START_X; void MPH; void CG_H;
}
