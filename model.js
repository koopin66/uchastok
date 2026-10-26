/* Расчётная модель участка: геометрия по координатам углов, отметки, канавы, объёмы.
   Общая для 3D-страницы (index.html) и генератора чертежа (gen-chertezh.js).
   Все высоты в метрах от покрытия автодороги (0,00).
   Локальные координаты: x — на восток, z — на юг (север вверху плана), начало в углу 1. */
(function (root) {
  const CAP = 0.3, ROADW = 6, EXT = 14;
  const DEF = {
    // [Север, Восток] углов 1–4 по кадастровому плану
    coords: [[523776.10, 1285844.30], [523756.98, 1285841.84], [523755.70, 1285872.86], [523774.80, 1285875.75]],
    drop: 0.6, strip: 0.1, finish: 0, finishMode: 'flat', t1: 0.2, t2: 0.1, t3: 0.4,
    iCA: 2, iDB: 0, iD: 2, gap: 1, offset: 0.3, depth: 1, bw: 0.3,
  };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const len = a => Math.hypot(a[0], a[1]), unit = a => mul(a, 1 / len(a));

  function build(P, stage = 5) {
    const c0 = P.coords[0];
    const pts = P.coords.map(([n, e]) => [e - c0[1], c0[0] - n]);
    const [P1, P2, P3, P4] = pts;
    const cen = mul(add(add(P1, P2), add(P3, P4)), 0.25);
    const side = (a, b) => {
      const t = unit(sub(b, a)); let n = [t[1], -t[0]];
      if (dot(n, sub(cen, a)) > 0) n = mul(n, -1);
      return {o: a, t, n, len: len(sub(b, a))};
    };
    // стороны: А = 1–4, Б = 1–2, С = 2–3, D = 3–4; n — внешняя нормаль
    const S = {A: side(P1, P4), B: side(P1, P2), C: side(P2, P3), D: side(P3, P4)};
    const sd = (s, x, z) => dot(sub([x, z], s.o), s.n);
    const sA = (x, z) => sd(S.A, x, z), sB = (x, z) => sd(S.B, x, z);
    const aA = (x, z) => dot(sub([x, z], P1), S.A.t), bB = (x, z) => dot(sub([x, z], P1), S.B.t);
    const nA = S.A.n, nB = S.B.n, det = nA[0] * nB[1] - nA[1] * nB[0];
    // точка с заданными расстояниями наружу от линий А и Б
    const pt = (a, b) => [P1[0] + (a * nB[1] - nA[1] * b) / det, P1[1] + (nA[0] * b - a * nB[0]) / det];
    const along = (p, t, k) => add(p, mul(t, k));

    const i1 = P.iCA / 100, i2 = P.iDB / 100, iD = P.iD / 100;
    const dAmax = Math.max(...pts.map(p => -sA(...p))), dBmax = Math.max(...pts.map(p => -sB(...p)));
    const baseHigh = -(P.drop + P.strip);
    const base = (x, z) => baseHigh - i1 * (dAmax + sA(x, z)) - i2 * (dBmax + sB(x, z));
    const top1 = (x, z) => base(x, z) + P.t1;
    const top2 = (x, z) => top1(x, z) + P.t2;
    const fin = P.finishMode === 'parallel' ? (x, z) => top2(x, z) + P.t3 : (x, z) => Math.max(P.finish, top2(x, z));

    const g = P.gap;
    const wTop = Math.max(0.1, g - P.offset);
    const bw = Math.min(P.bw, wTop - 0.04);
    const e = (wTop - bw) / 2;
    const lenA = S.A.len, lenB = S.B.len;
    const corner = -(P.depth + iD * Math.max(lenA, lenB));       // дно у точки 1
    const bot = s => corner + iD * Math.max(0, s);
    const prof = (u, b) => {
      if (u < 0 || u >= wTop) return 0;
      if (u < e) return b * (u / e);
      if (u <= e + bw) return b;
      return b * (1 - (u - e - bw) / e);
    };
    const hGapBuilt = (x, z) => {
      const a = sA(x, z), b = sB(x, z);
      const hA = a >= 0 && a <= g && aA(x, z) <= lenA ? prof(g - a, bot(aA(x, z))) : 0;
      const hB = b >= 0 && b <= g && bB(x, z) <= lenB ? prof(g - b, bot(bB(x, z))) : 0;
      return Math.min(hA, hB);
    };
    const hGap = stage >= 2 ? hGapBuilt : () => -P.drop;
    const plotTop = (x, z) => stage === 0 ? -P.drop : stage <= 2 ? base(x, z) : stage === 3 ? top1(x, z) : stage === 4 ? top2(x, z) : fin(x, z);

    const inPlot = (x, z) => sA(x, z) <= 1e-9 && sB(x, z) <= 1e-9 && sd(S.C, x, z) <= 1e-9 && sd(S.D, x, z) <= 1e-9;
    const zoneAt = (x, z) => {
      if (inPlot(x, z)) return 'plot';
      const a = sA(x, z), b = sB(x, z), al = aA(x, z), bl = bB(x, z);
      if ((a >= 0 && a <= g && b <= g && al <= lenA + CAP) || (b >= 0 && b <= g && a <= g && bl <= lenB + CAP)) return 'strip';
      if ((a > g && a <= g + ROADW && b <= g + ROADW && al <= lenA + EXT) || (b > g && b <= g + ROADW && a <= g && bl <= lenB + EXT)) return 'road';
      return 'out';
    };
    const column = (x, z, deep) => {
      const out = []; const B = (n, a, b) => { if (b > a + 1e-6) out.push([n, a, b]); };
      const nat = -P.drop, ts = -P.drop - P.strip;
      switch (zoneAt(x, z)) {
        case 'road': B('soil', deep, nat); B('roadbed', nat, -0.12); B('road', Math.max(nat, -0.12), 0); break;
        case 'strip': { const h = hGap(x, z); B('soil', deep, Math.min(h, nat)); B('fill', nat, h); break; }
        case 'plot':
          if (stage === 0) { B('soil', deep, ts); B('topsoil', ts, nat); }
          else {
            const b = base(x, z); B('soil', deep, b);
            if (stage >= 3) B('g1', b, top1(x, z));
            if (stage >= 4) B('g2', top1(x, z), top2(x, z));
            if (stage >= 5) B('sand', top2(x, z), fin(x, z));
          }
          break;
        default: B('soil', deep, ts); B('topsoil', ts, nat);
      }
      return out;
    };

    const Q = {
      plot: [P1, P4, P3, P2],
      corner: [P1, pt(g, 0), pt(g, g), pt(0, g)],
      stripA: [P1, along(P4, S.A.t, CAP), add(along(P4, S.A.t, CAP), mul(nA, g)), pt(g, 0)],
      stripB: [P1, along(P2, S.B.t, CAP), add(along(P2, S.B.t, CAP), mul(nB, g)), pt(0, g)],
      roadA: [pt(g, g + ROADW), along(add(P4, mul(nA, g)), S.A.t, EXT), along(add(P4, mul(nA, g + ROADW)), S.A.t, EXT), pt(g + ROADW, g + ROADW)],
      roadB: [pt(g, g), along(add(P2, mul(nB, g)), S.B.t, EXT), along(add(P2, mul(nB, g + ROADW)), S.B.t, EXT), pt(g, g + ROADW)],
      hole: [pt(g, g), add(along(P4, S.A.t, CAP), mul(nA, g)), along(P4, S.A.t, CAP), P4, P3, P2, along(P2, S.B.t, CAP), add(along(P2, S.B.t, CAP), mul(nB, g))],
    };
    const roadMid = g + ROADW / 2;
    const roadAxis = {A: [pt(roadMid, roadMid), along(add(P4, mul(nA, roadMid)), S.A.t, EXT)], B: [pt(roadMid, roadMid), along(add(P2, mul(nB, roadMid)), S.B.t, EXT)]};

    // линия разреза: перпендикулярно стороне А (axis 'x') или Б (axis 'z'), t — расстояние внутрь участка
    const secLine = (axis, pos) => {
      const s = axis === 'x' ? S.A : S.B;
      const p0 = along(P1, s.t, pos), dir = mul(s.n, -1);
      const at = t => along(p0, dir, t);
      let tExit = 0;
      while (tExit < 300 && inPlot(...at(tExit + 0.01))) tExit += 0.01;
      // изломы профиля: всё между ними линейно
      const breaks = (t0, t1) => {
        const out = [t0, t1];
        const lin = (f, vals) => { const f0 = f(...at(0)), df = f(...at(1)) - f0; if (Math.abs(df) < 1e-12) return; for (const v of vals) { const t = (v - f0) / df; if (t > t0 + 1e-3 && t < t1 - 1e-3) out.push(t - 1e-4, t + 1e-4); } };
        const prf = [0, g - wTop, g - e - bw, g - e, g, g + ROADW];
        lin(sA, prf); lin(sB, prf);
        lin((x, z) => sd(S.C, x, z), [0]); lin((x, z) => sd(S.D, x, z), [0]);
        lin(aA, [lenA, lenA + CAP]); lin(bB, [lenB, lenB + CAP]);
        return [...new Set(out)].sort((a, b) => a - b);
      };
      return {p0, dir, t: s.t, at, tExit, breaks, side: s};
    };

    const area = Math.abs(pts.reduce((acc, p, i) => { const q = pts[(i + 1) % 4]; return acc + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
    const angles = pts.map((o, i) => {
      const a = pts[(i + 3) % 4], b = pts[(i + 1) % 4];
      const u = sub(a, o), v = sub(b, o);
      return Math.acos(dot(u, v) / len(u) / len(v)) * 180 / Math.PI;
    });
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    const bbox = {x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs)};

    return {P, stage, pts, cen, S, sA, sB, aA, bB, pt, along, dAmax, dBmax, baseHigh, base, top1, top2, fin, plotTop,
      wTop, bw, e, corner, bot, prof, hGap, hGapBuilt, inPlot, zoneAt, column, Q, roadAxis, secLine,
      lenA, lenB, area, angles, bbox, g};
  }

  // объёмы и проверки (по готовому состоянию)
  function stats(P) {
    const M = build(P, 5), {pts, bbox} = M;
    const step = 0.1; let n = 0, sStrip = 0, sSand = 0;
    for (let x = bbox.x0 + step / 2; x < bbox.x1; x += step) for (let z = bbox.z0 + step / 2; z < bbox.z1; z += step) {
      if (!M.inPlot(x, z)) continue;
      n++; sStrip += Math.max(0, -P.drop - M.base(x, z)); sSand += Math.max(0, M.fin(x, z) - M.top2(x, z));
    }
    const vStripAll = M.area * sStrip / n, vSand = M.area * sSand / n;
    const vTop = M.area * P.strip;
    // канавы: сетка по прямоугольнику, охватывающему полосу между дорогой и участком
    const qs = [...M.Q.stripA, ...M.Q.stripB, ...M.Q.corner];
    const gx0 = Math.min(...qs.map(p => p[0])), gx1 = Math.max(...qs.map(p => p[0]));
    const gz0 = Math.min(...qs.map(p => p[1])), gz1 = Math.max(...qs.map(p => p[1]));
    const d = 0.05, dA = d * d; let cap = 0, exc = 0, bank = 0;
    for (let x = gx0 + d / 2; x < gx1; x += d) for (let z = gz0 + d / 2; z < gz1; z += d) {
      if (M.zoneAt(x, z) !== 'strip') continue;
      const h = M.hGapBuilt(x, z);
      cap += Math.max(0, -h) * dA; exc += Math.max(0, -P.drop - h) * dA; bank += Math.max(0, h + P.drop) * dA;
    }
    // запас между низом щебня у границы и дном канавы
    let minClr = 1e9, where = null;
    for (let a = 0; a <= M.lenA + 1e-9; a += 0.1) { const p = M.along(pts[0], M.S.A.t, a); const c = M.base(...p) - M.bot(a); if (c < minClr) { minClr = c; where = {side: 'А', a}; } }
    for (let b = 0; b <= M.lenB + 1e-9; b += 0.1) { const p = M.along(pts[0], M.S.B.t, b); const c = M.base(...p) - M.bot(b); if (c < minClr) { minClr = c; where = {side: 'Б', a: b}; } }
    const c = M.g - M.wTop / 2;
    const len = Math.hypot(...sub(add(pts[3], mul(M.S.A.n, c)), M.pt(c, c))) + Math.hypot(...sub(add(pts[1], mul(M.S.B.n, c)), M.pt(c, c)));
    return {M, S: M.area, vTop, vExtra: Math.max(0, vStripAll - vTop), v1: M.area * P.t1, v2: M.area * P.t2, vSand,
      cap, exc, bank, minClr, where, len,
      dMin: P.depth, dMax: -M.corner, dEndA: -M.bot(M.lenA), dEndB: -M.bot(M.lenB),
      sandAt: pts.map(p => M.fin(...p) - M.top2(...p))};
  }

  const api = {DEF, CAP, ROADW, EXT, build, stats};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.UchastokModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
