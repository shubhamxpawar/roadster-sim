// Print the car's screen box (viewBox px) at given sim times, for framing zooms.
import * as k from "../kit/iso-kit.mjs";
import * as M from "../model.mjs";
import * as S from "../scene.mjs";

const W = 1360, H = 800, AZ = 66, EL = 27;
const P = k.fitProjection(S.sceneBounds(M.LIP), W, H, { pad: 46, azimuth: AZ, elevation: EL });

const B = [[-2.45, -0.52], [-2.45, 0.78], [2.41, -0.52], [2.41, 0.78]];
const times = process.argv.slice(2).map(Number);
const maxT = Math.max(...times) + 0.1;

const st = M.freshState();
let i = 0;
const shown = new Set();
while (st.t < maxT) {
  M.step(st, 1 / 240, { bias: 0 });
  for (const t of times) {
    if (!shown.has(t) && st.t >= t) {
      shown.add(t);
      const c = Math.cos((st.pitch * Math.PI) / 180), s = Math.sin((st.pitch * Math.PI) / 180);
      const xs = [], ys = [];
      for (const [bx, bz] of B) {
        for (const by of [-1.0, 1.0]) {
          const wx = st.x + bx * c - bz * s, wz = st.z + bx * s + bz * c;
          const p = k.iso([wx, st.y + by, wz], P);
          xs.push(p[0]); ys.push(p[1]);
        }
      }
      console.log(`t=${t.toFixed(2)} phase=${st.phase} x=${st.x.toFixed(2)} z=${st.z.toFixed(2)} pitch=${st.pitch.toFixed(0)}  box=[${Math.round(Math.min(...xs))},${Math.round(Math.min(...ys))},${Math.round(Math.max(...xs) - Math.min(...xs))},${Math.round(Math.max(...ys) - Math.min(...ys))}]`);
    }
  }
}
