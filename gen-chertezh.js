// Генератор чертежа участка (3 листа А3) по общей расчётной модели model.js.
// Запуск: node gen-chertezh.js <файл.html>
const fs = require('fs'), path = require('path');
const UM = require(path.join(__dirname, 'model.js'));
const OUT = process.argv[2] || path.join(__dirname, 'chertezh.html');

const P = JSON.parse(JSON.stringify(UM.DEF));
const M = UM.build(P, 5), ST = UM.stats(P);
const {ROADW} = UM;
const K_STONE = 1.3, K_SAND = 1.2, RHO = {g1: 1.45, g2: 1.40, sand: 1.50};
const DATE = '26.10.2026';
const pts = M.pts, S = M.S, g = P.gap, wT = M.wTop, e = M.e;
const add = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, k) => [a[0] * k, a[1] * k], sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const unit = a => mul(a, 1 / Math.hypot(a[0], a[1]));

/* ---------- форматирование ---------- */
const f2 = (v, d = 2) => { const r = Math.round(v * 10 ** d) / 10 ** d; return (r < 0 ? '−' : '') + Math.abs(r).toFixed(d).replace('.', ','); };
const lv = v => { const r = Math.round(v * 100) / 100; if (Math.abs(r) < 0.005) return '0,00'; return (r > 0 ? '+' : '−') + Math.abs(r).toFixed(2).replace('.', ','); };
const lvn = v => { const r = Math.round(v * 100) / 100; if (Math.abs(r) < 0.005) return '0,00'; return (r < 0 ? '−' : '') + Math.abs(r).toFixed(2).replace('.', ','); };
const dms = a => { let d = Math.floor(a), m = Math.round((a - d) * 60); if (m === 60) { d++; m = 0; } return `${d}°${String(m).padStart(2, '0')}′`; };

/* ---------- примитивы SVG (единицы — мм листа) ---------- */
const r2 = v => Math.round(v * 100) / 100;
const L = (x1, y1, x2, y2, c = 'th') => `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" class="${c}"/>`;
const R = (x, y, w, h, a = 'class="th" fill="none"') => `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" ${a}/>`;
const T = (x, y, s, o = {}) => `<text x="${r2(x)}" y="${r2(y)}" class="${o.c || 't'}${o.h ? ' h' : ''}" font-size="${o.s || 2.5}" text-anchor="${o.a || 'start'}"${o.rot != null ? ` transform="rotate(${r2(o.rot)} ${r2(x)} ${r2(y)})"` : ''}${o.w ? ` font-weight="${o.w}"` : ''}${o.fill ? ` fill="${o.fill}"` : ''}>${s}</text>`;
const PL = (p, c = 'th') => `<polyline points="${p.map(q => r2(q[0]) + ',' + r2(q[1])).join(' ')}" class="${c}" fill="none"/>`;
const PG = (p, a) => `<polygon points="${p.map(q => r2(q[0]) + ',' + r2(q[1])).join(' ')}" ${a}/>`;
const tick = (x, y) => L(x - 0.9, y + 0.9, x + 0.9, y - 0.9, 'md');
const arrowHead = (x, y, ang, sz = 2.2, cls = 'ah') => {
  const a1 = ang + Math.PI * 0.86, a2 = ang - Math.PI * 0.86;
  return PG([[x, y], [x + sz * Math.cos(a1), y + sz * Math.sin(a1)], [x + sz * Math.cos(a2), y + sz * Math.sin(a2)]], `class="${cls}"`);
};
const arrow = (x1, y1, x2, y2, cls = 'md', head = 'ah', sz = 2.2) => L(x1, y1, x2, y2, cls) + arrowHead(x2, y2, Math.atan2(y2 - y1, x2 - x1), sz, head);
// угол текста вдоль направления, чтобы читался слева направо или снизу вверх
const readAng = d => { let a = Math.atan2(d[1], d[0]) * 180 / Math.PI; if (a > 90) a -= 180; if (a <= -90) a += 180; return a; };

function dimH(x1, x2, y, label, f1, f2_, o = {}) {
  const ext = (x, f) => { if (f == null) return ''; const dn = f > y; return L(x, f + (dn ? -0.8 : 0.8), x, y + (dn ? -1.5 : 1.5)); };
  return ext(x1, f1) + ext(x2, f2_) + L(x1 - 1.5, y, x2 + 1.5, y) + tick(x1, y) + tick(x2, y)
    + T(o.lx != null ? o.lx : (x1 + x2) / 2, y - 0.8, label, {a: 'middle', s: o.s || 2.5, h: true});
}
function dimV(x, y1, y2, label, f1, f2_, o = {}) {
  const ext = (yy, f) => { if (f == null) return ''; const lf = f < x; return L(f + (lf ? 0.8 : -0.8), yy, x + (lf ? 1.5 : -1.5), yy); };
  const ya = Math.min(y1, y2), yb = Math.max(y1, y2);
  return ext(y1, f1) + ext(y2, f2_) + L(x, ya - 1.5, x, yb + 1.5) + tick(x, y1) + tick(x, y2)
    + T(x - 0.8, o.ly != null ? o.ly : (ya + yb) / 2, label, {a: 'middle', rot: -90, s: o.s || 2.5, h: true});
}
// размер вдоль произвольного отрезка (точки уже в мм листа), n — единичный сдвиг размерной линии
function dimAligned(p1, p2, n, off, label, o = {}) {
  const q1 = add(p1, mul(n, off)), q2 = add(p2, mul(n, off)), d = unit(sub(p2, p1));
  const ext = (p, q) => L(...add(p, mul(n, 0.8)), ...add(q, mul(n, 1.5)));
  const tk = q => { const t = unit(add(d, n)); return L(...sub(q, mul(t, 1.2)), ...add(q, mul(t, 1.2)), 'md'); };
  const fr = o.at != null ? o.at : 0.5;
  const m = add(add(mul(q1, 1 - fr), mul(q2, fr)), mul(n, o.inside ? -1.2 : 0.9));
  return ext(p1, q1) + ext(p2, q2) + L(...sub(q1, mul(d, 1.5)), ...add(q2, mul(d, 1.5))) + tk(q1) + tk(q2)
    + T(m[0], m[1] + 0.9, label, {a: 'middle', s: o.s || 3, rot: readAng(d), h: true});
}
function lvl(x, y, label, o = {}) {
  const left = o.left;
  return `<path d="M${r2(x - 1.1)},${r2(y - 1.9)} L${r2(x)},${r2(y)} L${r2(x + 1.1)},${r2(y - 1.9)} Z" class="lv"/>`
    + T(left ? x - 1.7 : x + 1.7, y - 0.5, label, {a: left ? 'end' : 'start', s: o.s || 2.4, h: true, fill: o.fill});
}
function leader(x1, y1, x2, y2, label, o = {}) {
  const right = o.right !== false;
  const shelf = o.shelf || label.length * 1.15;
  const xe = right ? x2 + shelf : x2 - shelf;
  return `<circle cx="${r2(x1)}" cy="${r2(y1)}" r="0.45" class="dot"/>` + PL([[x1, y1], [x2, y2], [xe, y2]])
    + T(right ? x2 + 0.6 : x2 - 0.6, y2 - 0.7, label, {a: right ? 'start' : 'end', s: o.s || 2.4, h: true});
}

/* ---------- лист: рамка и основная надпись ---------- */
function frame(n, title, scale) {
  let s = R(0.25, 0.25, 419.5, 296.5, 'class="cut" fill="none"') + R(20, 5, 395, 287, 'class="tk" fill="none"');
  const x0 = 230, y0 = 237, w = 185;
  s += R(x0, y0, w, 55, 'class="tk" fill="#fff"');
  s += L(x0, y0 + 14, x0 + w, y0 + 14, 'md') + L(x0, y0 + 30, x0 + w, y0 + 30, 'md');
  s += L(x0 + 130, y0 + 14, x0 + 130, y0 + 55, 'md');
  s += L(x0 + 130, y0 + 21, x0 + w, y0 + 21, 'th') + L(x0 + 148, y0 + 14, x0 + 148, y0 + 30, 'th') + L(x0 + 166, y0 + 14, x0 + 166, y0 + 30, 'th');
  s += L(x0 + 130, y0 + 42, x0 + w, y0 + 42, 'th');
  s += T(x0 + w / 2, y0 + 6.2, `Участок ${f2(M.area, 0)} м² у автодороги`, {a: 'middle', s: 5, w: 700});
  s += T(x0 + w / 2, y0 + 11.6, 'Вертикальная планировка, отсыпка и дренаж', {a: 'middle', s: 3.2});
  s += T(x0 + 65, y0 + 21.5, title, {a: 'middle', s: 4, w: 700});
  s += T(x0 + 65, y0 + 27, 'Отметки и размеры в метрах. 0,00 — покрытие автодороги', {a: 'middle', s: 2.6});
  s += T(x0 + 139, y0 + 18.6, 'Стадия', {a: 'middle', s: 2.4}) + T(x0 + 157, y0 + 18.6, 'Лист', {a: 'middle', s: 2.4}) + T(x0 + 175.5, y0 + 18.6, 'Листов', {a: 'middle', s: 2.4});
  s += T(x0 + 139, y0 + 27.3, 'Эскиз', {a: 'middle', s: 3}) + T(x0 + 157, y0 + 27.3, String(n), {a: 'middle', s: 3.4}) + T(x0 + 175.5, y0 + 27.3, '3', {a: 'middle', s: 3.4});
  s += T(x0 + 65, y0 + 38, `S = ${f2(M.area, 2)} м² (по координатам углов)`, {a: 'middle', s: 3.2});
  s += T(x0 + 65, y0 + 44.5, 'Эскизный проект по заданию заказчика.', {a: 'middle', s: 2.6});
  s += T(x0 + 65, y0 + 49.5, 'Не является рабочей документацией, объёмы ориентировочные.', {a: 'middle', s: 2.6});
  s += T(x0 + 157.5, y0 + 37.5, scale, {a: 'middle', s: 3});
  s += T(x0 + 157.5, y0 + 50, DATE, {a: 'middle', s: 3});
  return s;
}

/* ---------- разрез по расчётной модели ---------- */
const PAT = {soil: 'pSoil', topsoil: 'pTop', roadbed: 'pRoadbed', road: 'pAsph', fill: 'pFill', g1: 'pG1', g2: 'pG2', sand: 'pSand'};
function section(o) {
  const Ls = M.secLine(o.axis, o.pos), len = Ls.tExit;
  const X = t => o.X0 + (t - o.t0) * o.kx, Y = y => o.Y0 - y * o.ky;
  const cols = Ls.breaks(o.t0, o.t1).map(t => ({t, b: M.column(...Ls.at(t), o.yBot)}));
  let s = '';
  for (const n of Object.keys(PAT)) {
    let run = [];
    const flush = () => {
      if (run.length > 1) s += PG(run.map(r => [X(r.t), Y(r.to)]).concat(run.slice().reverse().map(r => [X(r.t), Y(r.from)])), `fill="url(#${PAT[n]})" class="ly"`);
      run = [];
    };
    for (const c of cols) { const f = c.b.find(q => q[0] === n); if (f) run.push({t: c.t, from: f[1], to: f[2]}); else flush(); }
    flush();
  }
  s += L(X(Math.max(0, o.t0)), Y(-P.drop), X(Math.min(len, o.t1)), Y(-P.drop), 'ex');
  return {s, X, Y, len, Ls};
}

/* ---------- ЛИСТ 1. План ---------- */
function sheet1() {
  const k = 1000 / 150, wx0 = -9.5, wx1 = 33.6, wz0 = -7.5, wz1 = 22.4, X0 = 22, Z0 = 22;
  const map = p => [X0 + (p[0] - wx0) * k, Z0 + (p[1] - wz0) * k];
  const W = q => q.map(map);
  const endA = s => add(pts[3], mul(S.A.n, s)), endB = s => add(pts[1], mul(S.B.n, s));
  const Lsh = (sA, sB) => [M.pt(sA, sB), endA(sA), endB(sB)];
  let s = frame(1, 'План участка', 'М 1:150');
  s += T(22, 15, 'План участка. Отметки, уклоны, дренажные канавы', {s: 4.2, w: 700});
  s += T(22, 19.6, 'М 1:150. Север вверху, границы по каталогу координат', {s: 2.8});
  const [cx0, cz0] = map([wx0, wz0]), [cx1, cz1] = map([wx1, wz1]);
  s += `<clipPath id="planClip"><rect x="${r2(cx0)}" y="${r2(cz0)}" width="${r2(cx1 - cx0)}" height="${r2(cz1 - cz0)}"/></clipPath><g clip-path="url(#planClip)">`;
  // дороги
  s += PG(W(M.Q.roadA), 'class="md" fill="url(#pRoadP)"') + PG(W(M.Q.roadB), 'class="md" fill="url(#pRoadP)"');
  s += PL(W(M.roadAxis.A), 'cl') + PL(W(M.roadAxis.B), 'cl');
  // канавы: откосы, дно (вода), берма
  const lshape = (sOut, sIn) => [M.pt(sOut, sOut), endA(sOut), endA(sIn), M.pt(sIn, sIn), endB(sIn), endB(sOut)];
  s += PG(W(lshape(g, g - wT)), 'fill="#e6d6bd" class="none"');
  s += PG(W(lshape(g - e, g - e - M.bw)), 'fill="url(#pWater)" class="none"');
  s += PG(W([M.pt(g - wT, g - wT), endA(g - wT), pts[3], pts[0], pts[1], endB(g - wT)]), 'fill="#f3eee4" class="none"');
  const edge = sv => PL(W([endA(sv), M.pt(sv, sv), endB(sv)]), sv === g || sv === g - wT ? 'md' : 'th');
  s += edge(g) + edge(g - wT) + edge(g - e) + edge(g - e - M.bw);
  s += PL(W([endA(g), endA(g - wT)]), 'md') + PL(W([endB(g), endB(g - wT)]), 'md');
  // участок
  s += PG(W([pts[0], pts[3], pts[2], pts[1]]), 'fill="url(#pSandP)" class="none"');
  s += PG(W([pts[0], pts[3], pts[2], pts[1]]), 'class="bd" fill="none"');
  // сток по дну канав
  const c = g - wT / 2;
  for (let a = M.lenA - 3.5; a > 1; a -= 8) { const p1 = map(M.along(M.along(pts[0], S.A.t, a), S.A.n, c)), p2 = map(M.along(M.along(pts[0], S.A.t, a - 3), S.A.n, c)); s += arrow(...p1, ...p2, 'fl', 'fh', 1.6); }
  for (let b = M.lenB - 2; b > 1; b -= 6) { const p1 = map(M.along(M.along(pts[0], S.B.t, b), S.B.n, c)), p2 = map(M.along(M.along(pts[0], S.B.t, b - 3), S.B.n, c)); s += arrow(...p1, ...p2, 'fl', 'fh', 1.6); }
  const ta = map(M.along(M.along(pts[0], S.A.t, M.lenA * 0.55), S.A.n, g + 0.35));
  s += T(...ta, `дно канавы: уклон i = ${f2(P.iD / 100, 3)} к т.1`, {a: 'middle', s: 2.3, rot: readAng(S.A.t), h: true});
  const tb = map(M.along(M.along(pts[0], S.B.t, M.lenB * 0.45), S.B.n, g + 0.35));
  s += T(...tb, `дно канавы: уклон i = ${f2(P.iD / 100, 3)} к т.1`, {a: 'middle', s: 2.3, rot: readAng(S.B.t), h: true});
  s += T(...map(M.along(M.along(pts[0], S.A.t, M.lenA * 0.45), S.A.n, g + ROADW / 2 + 0.7)), 'АВТОДОРОГА · покрытие 0,00', {a: 'middle', s: 3, w: 700, rot: readAng(S.A.t), h: true});
  s += T(...map(M.along(M.along(pts[0], S.B.t, M.lenB * 0.62), S.B.n, g + ROADW / 2 + 0.7)), 'АВТОДОРОГА · покрытие 0,00', {a: 'middle', s: 3, w: 700, rot: readAng(S.B.t), h: true});
  s += '</g>';
  // отметки дна канав и т.1
  const ea = map(endA(c)), eb = map(endB(c)), lp = map(M.pt(c, c));
  s += leader(...ea, ea[0] + 4, ea[1] - 6, `дно ${lvn(M.bot(M.lenA))}`);
  s += leader(...eb, eb[0] - 3, eb[1] + 6, `дно ${lvn(M.bot(M.lenB))}`, {right: false});
  s += `<circle cx="${r2(lp[0])}" cy="${r2(lp[1])}" r="1.3" class="lp"/>`;
  s += leader(...lp, lp[0] - 12, lp[1] - 18, `т.1 — нижняя точка, дно ${lvn(M.corner)}`, {right: false, s: 2.5});
  const dc = map(M.along(M.along(pts[0], S.A.t, 12), S.A.n, g - wT * 0.3));
  s += leader(...dc, dc[0] + 8, cz0 + 4.5, `канава: по верху ${f2(wT)}, по дну ${f2(M.bw)}, берма ${f2(g - wT)} (узел А, лист 2)`, {s: 2.3});
  // уклон основания
  const pm = (u, v) => { const a = M.along(pts[0], S.A.t, M.lenA * u); const b = M.along(pts[1], S.C.t, S.C.len * u); return [a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v]; };
  for (const u of [0.25, 0.75]) {
    const p = pm(u, 0.8), q = add(p, mul(S.A.n, 11));
    s += arrow(...map(p), ...map(q), 'md', 'ah', 2.4);
    const lt = map(add(mul(add(p, q), 0.5), mul(S.A.t, 0.55)));
    s += T(...lt, `i = ${f2(P.iCA / 100, 3)}`, {s: 2.6, rot: readAng(S.A.n), a: 'middle', h: true});
  }
  const cm = map(M.cen);
  s += T(cm[0], cm[1] - 6, 'Уклон основания (низа щебня) от стороны С к стороне А', {a: 'middle', s: 2.6, h: true, rot: readAng(S.A.t)});
  s += T(cm[0], cm[1] + 1, `Верх отсыпки горизонтальный: ${lv(P.finish)}`, {a: 'middle', s: 3, w: 700, h: true});
  s += T(cm[0], cm[1] + 6, `S = ${f2(M.area, 2)} м²`, {a: 'middle', s: 3, h: true});
  // названия сторон и размеры по сторонам
  const sides = [['А', S.A, pts[0], pts[3], 'in'], ['Б', S.B, pts[0], pts[1], 'in'], ['С', S.C, pts[1], pts[2], 'out'], ['D', S.D, pts[2], pts[3], 'out']];
  for (const [name, sd, a, b, where] of sides) {
    const n = where === 'in' ? mul(sd.n, -1) : sd.n;
    s += dimAligned(map(a), map(b), n, where === 'in' ? 6 : 7, f2(sd.len), {inside: where === 'in', at: 0.28});
    const mid = map(M.along([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], sd.n, -2.9));
    s += T(mid[0], mid[1] + 1.1, `Сторона ${name}`, {a: 'middle', s: 3.2, w: 700, rot: readAng(sd.t), h: true});
  }
  // углы и отметки
  const adj = [[S.A, S.B], [S.B, S.C], [S.C, S.D], [S.D, S.A]];
  pts.forEach((p, i) => {
    const inw = unit(mul(add(adj[i][0].n, adj[i][1].n), -1));
    const cc = map(add(p, mul(inw, -0.6)));
    s += `<circle cx="${r2(cc[0])}" cy="${r2(cc[1])}" r="2.6" class="cn"/>` + T(cc[0], cc[1] + 1.2, String(i + 1), {a: 'middle', s: 3.4, w: 700});
    const tg = map(add(p, mul(inw, 3.4)));
    s += elevTag(tg[0], tg[1], M.fin(...p), -P.drop, M.base(...p));
  });
  // линии разрезов
  const cutLine = (Ls, ad, lab) => {
    const a1 = map(Ls.at(-(g + ROADW + 0.6))), a2 = map(Ls.at(-(g + ROADW - 1.6))), b1 = map(Ls.at(Ls.tExit + 0.4)), b2 = map(Ls.at(Ls.tExit + 2.6));
    const dir = unit(ad);
    let o = L(...a1, ...a2, 'cut2') + L(...b1, ...b2, 'cut2') + L(...a2, ...b1, 'axl');
    for (const [p, q] of [[a1, a2], [b1, b2]]) {
      const m = mul(add(p, q), 0.5), t = add(m, mul(dir, 4));
      o += arrow(...m, ...t, 'md', 'ah', 1.8) + T(t[0] + dir[0] * 2.2, t[1] + dir[1] * 2.2 + 1.2, lab, {a: 'middle', s: 3.6, w: 700});
    }
    return o;
  };
  const L1 = M.secLine('x', M.lenA / 2), L2 = M.secLine('z', M.lenB / 2);
  s += cutLine(L1, S.A.t, '1') + cutLine(L2, mul(S.B.t, -1), '2');
  // север
  const nx = cx1 - 9, ny = cz0 + 18;
  s += arrow(nx, ny, nx, ny - 11, 'md', 'ah', 2.6) + T(nx, ny + 4.5, 'Север', {a: 'middle', s: 2.8, w: 700});
  // правая колонка
  s += legend1(314, 12);
  s += coordTable(314, 104);
  s += cornerTable(314, 147);
  s += ditchTable(314, 182);
  s += T(25, 228, 'Примечания', {s: 3.2, w: 700});
  ['1. Отметки и размеры в метрах. 0,00 — отметка покрытия автодороги. Координаты — по кадастровому плану.',
    '2. Профиль канавы — узел А (лист 2). Разрез 1–1 — лист 2, разрез 2–2 — лист 3. Ширина автодороги условная (6,0).',
  ].forEach((t, i) => { s += T(25, 233.5 + i * 5, t, {s: 2.6}); });
  return s;
}
function elevTag(x, y, proj, nat, base) {
  // крест отметок: справа вверху проектная, справа внизу существующая, слева вверху рабочая, слева внизу низ щебня
  return L(x - 9, y, x + 9, y, 'th') + L(x, y - 4.2, x, y + 4.2, 'th')
    + T(x + 0.8, y - 0.9, lvn(proj), {s: 2.6, fill: '#c0281b', w: 700, h: true})
    + T(x + 0.8, y + 3, lvn(nat), {s: 2.6, h: true})
    + T(x - 0.8, y - 0.9, lv(proj - nat), {s: 2.6, a: 'end', h: true})
    + T(x - 0.8, y + 3, lvn(base), {s: 2.6, a: 'end', fill: '#1f5f9c', h: true});
}
function legend1(x, y) {
  let s = T(x, y, 'Условные обозначения', {s: 3.2, w: 700});
  const items = [
    [yy => R(x, yy, 11, 4.4, 'class="md" fill="url(#pRoadP)"'), 'Автодорога, покрытие 0,00'],
    [yy => R(x, yy, 11, 4.4, 'fill="#e6d6bd" class="th"') + R(x, yy + 1.4, 11, 1.6, 'fill="url(#pWater)" class="none"'), 'Дренажная канава: откосы и дно'],
    [yy => R(x, yy, 11, 4.4, 'fill="#f3eee4" class="th"'), `Берма ${f2(g - wT)} у границы участка`],
    [yy => R(x, yy, 11, 4.4, 'fill="url(#pSandP)" class="bd"'), 'Участок, граница участка'],
    [yy => arrow(x, yy + 2.2, x + 11, yy + 2.2, 'fl', 'fh', 1.6), 'Сток воды по дну канавы'],
    [yy => arrow(x, yy + 2.2, x + 11, yy + 2.2, 'md', 'ah', 2), 'Уклон основания (низа щебня)'],
    [yy => `<circle cx="${r2(x + 5.5)}" cy="${r2(yy + 2.2)}" r="1.3" class="lp"/>`, 'т.1 — самая низкая точка'],
    [yy => L(x, yy + 2.2, x + 4, yy + 2.2, 'cut2') + L(x + 5, yy + 2.2, x + 11, yy + 2.2, 'axl'), 'Линия разреза'],
  ];
  items.forEach(([sym, t], i) => { const yy = y + 2.5 + i * 6.4; s += sym(yy) + T(x + 14, yy + 3.5, t, {s: 2.5}); });
  const ty = y + items.length * 6.4 + 10;
  s += T(x, ty - 4, 'Отметки в углах участка:', {s: 2.5, w: 700});
  s += elevTag(x + 24, ty + 4, 0, -0.6, -1.08).replace(/>0,00</, '>проект.<').replace(/>−0,60</, '>существ.<').replace(/>\+0,60</, '>рабочая<').replace(/>−1,08</, '>низ щебня<');
  s += T(x + 38, ty + 2.5, 'рабочая = проект. − существ.', {s: 2.2});
  s += T(x + 38, ty + 6, '(+ насыпь)', {s: 2.2});
  return s;
}
function table(x, y, widths, rows, o = {}) {
  const rh = o.rh || 5; let s = '';
  const Wt = widths.reduce((a, b) => a + b, 0);
  rows.forEach((row, i) => {
    let cx = x;
    row.forEach((cell, j) => {
      const left = (o.left || [0]).includes(j) && !(j === 0 && o.center0);
      s += T(left ? cx + 1 : cx + widths[j] / 2, y + i * rh + rh - 1.4, cell, {a: left ? 'start' : 'middle', s: o.s || 2.4, w: i === 0 && o.head !== false ? 700 : null});
      cx += widths[j];
    });
    s += L(x, y + (i + 1) * rh, x + Wt, y + (i + 1) * rh, i === 0 && o.head !== false ? 'md' : 'th');
  });
  s += R(x, y, Wt, rows.length * rh, 'class="md" fill="none"');
  let cx = x; widths.slice(0, -1).forEach(w => { cx += w; s += L(cx, y, cx, y + rows.length * rh, 'th'); });
  return s;
}
function coordTable(x, y) {
  const names = ['Б (1–2)', 'С (2–3)', 'D (3–4)', 'А (4–1)'];
  const lens = [S.B.len, S.C.len, S.D.len, S.A.len];
  const rows = [['№', 'Север', 'Восток', 'Угол', 'Сторона', 'Длина']];
  P.coords.forEach(([n, e2], i) => rows.push([String(i + 1), n.toFixed(2), e2.toFixed(2), dms(M.angles[i]), names[i], f2(lens[i])]));
  return T(x, y - 2, 'Каталог координат', {s: 3.2, w: 700}) + table(x, y, [7, 19, 21, 15, 18, 16], rows, {center0: true, s: 2.3});
}
function cornerTable(x, y) {
  const rows = [['Угол', 'Проект.', 'Сущ.', 'Рабочая', 'Низ щебня', 'Срезка']];
  pts.forEach((p, i) => rows.push([String(i + 1), lvn(M.fin(...p)), lvn(-P.drop), lv(M.fin(...p) + P.drop), lvn(M.base(...p)), f2(-P.drop - M.base(...p))]));
  return T(x, y - 2, 'Ведомость отметок по углам', {s: 3.2, w: 700}) + table(x, y, [10, 15, 14, 16, 22, 19], rows, {center0: true, s: 2.3});
}
function ditchTable(x, y) {
  const rows = [
    ['Длина по оси (А + Б)', `${f2(ST.len, 1)} м`],
    ['Ширина по верху / по дну', `${f2(wT)} / ${f2(M.bw)} м`],
    ['Отступ (берма) от границы', `${f2(g - wT)} м`],
    ['Глубина у угла 4 / у угла 2', `${f2(ST.dEndA)} / ${f2(ST.dEndB)} м`],
    ['Глубина в т.1', `${f2(ST.dMax)} м`],
    ['Уклон дна к т.1', f2(P.iD / 100, 3)],
    ['Откосы', `1:${f2(e / ST.dMax)} … 1:${f2(e / ST.dMin)}`],
    ['Ёмкость канав', `${f2(ST.cap, 1)} м³`],
  ];
  return T(x, y - 2, 'Дренажная канава', {s: 3.2, w: 700}) + table(x, y, [64, 32], rows, {head: false, s: 2.3, rh: 4.9});
}

/* ---------- ЛИСТ 2. Разрез 1–1, узел А, конструкция ---------- */
function sheet2() {
  let s = frame(2, 'Разрез 1–1. Узел А', 'М 1:100, 1:25');
  const posA = M.lenA / 2;
  const L1 = M.secLine('x', posA), len = L1.tExit;
  const o = {axis: 'x', pos: posA, t0: -8, t1: len + 1.6, kx: 10, ky: 40, X0: 35, Y0: 46, yBot: -1.9};
  const S1 = section(o); const {X, Y} = S1;
  const at = t => L1.at(t);
  s += T(30, 15, 'Разрез 1–1 (поперёк стороны А, посередине стороны)', {s: 4.2, w: 700});
  s += T(30, 19.6, 'М гор. 1:100, верт. 1:25', {s: 2.8});
  s += S1.s;
  s += dimH(X(-7), X(-1), Y(0) - 12, '6,00 (условно)', Y(0), Y(0));
  s += dimH(X(-1), X(0), Y(0) - 12, f2(g), null, Y(0));
  s += dimH(X(0), X(len), Y(0) - 12, f2(len), null, Y(0));
  s += T(X(-4), Y(0) - 16.5, 'Автодорога', {a: 'middle', s: 2.8});
  s += T(X(0), Y(0) - 16.5, 'Сторона А', {a: 'middle', s: 2.8, w: 700});
  s += T(X(len), Y(0) - 16.5, 'Сторона С', {a: 'middle', s: 2.8, w: 700});
  s += lvl(X(-5), Y(0), '0,00');
  const hb = M.hGap(...at(-g + wT / 2));
  s += leader(X(-g + wT / 2), Y(hb), X(-3), Y(-1.55), `дно канавы ${lvn(hb)}`, {right: false});
  const lev = p => [0, M.top2(...p), M.top1(...p), M.base(...p)];
  lev(at(0)).forEach(v => { s += lvl(X(0.7), Y(v), lvn(v)); });
  lev(at(len)).forEach(v => { s += L(X(len), Y(v), X(len + 2.6), Y(v), 'ld') + lvl(X(len + 2.6), Y(v), lvn(v)); });
  s += L(X(len + 1.6), Y(-P.drop), X(len + 4.4), Y(-P.drop), 'ld') + lvl(X(len + 4.4), Y(-P.drop), `${lvn(-P.drop)} сущ.`);
  const tm = len / 2, pmid = at(tm), b = M.base(...pmid);
  s += T(X(tm), Y(M.top2(...pmid) / 2) + 1, `Песок, h = ${f2(-M.top2(...at(len)))}…${f2(-M.top2(...at(0)))}, с послойным уплотнением`, {a: 'middle', s: 2.7, h: true});
  s += T(X(tm), Y(M.top2(...pmid) - P.t2 / 2) + 0.9, `Щебень 20×40, h = ${f2(P.t2)}`, {a: 'middle', s: 2.4, h: true});
  s += T(X(tm), Y(b + P.t1 / 2) + 0.9, `Щебень 40×70, h = ${f2(P.t1)}`, {a: 'middle', s: 2.6, h: true});
  const ang = -Math.atan(P.iCA / 100 * o.ky / o.kx) * 180 / Math.PI;
  s += T(X(tm), Y(b) + 4.2, `основание: снятие плодородного слоя, уклон i = ${f2(P.iCA / 100, 3)} к стороне А`, {a: 'middle', s: 2.5, rot: ang, h: true});
  s += T(X(len * 0.78), Y(-P.drop) - 0.8, `существующий рельеф ${lvn(-P.drop)}`, {a: 'middle', s: 2.3, h: true});

  // узел А
  const posN = M.lenA - 2, LN = M.secLine('x', posN);
  const n = {axis: 'x', pos: posN, t0: -2.2, t1: 2.0, kx: 40, ky: 40, X0: 25, Y0: 160, yBot: -1.9};
  const SN = section(n); const NX = SN.X, NY = SN.Y;
  s += T(25, 136, 'Узел А. Профиль канавы в 2 м от угла 4', {s: 4, w: 700});
  s += T(25, 140.6, 'М 1:25 (на остальной длине глубина больше, см. таблицу на листе 1)', {s: 2.6});
  s += SN.s;
  const xb1 = -g + e, xb2 = xb1 + M.bw, xt = -g + wT, yb = M.bot(posN), pA = LN.at(0.05);
  s += PL([[NX(-g), NY(0)], [NX(xb1), NY(yb)], [NX(xb2), NY(yb)], [NX(xt), NY(0)]], 'gt');
  s += dimH(NX(-g), NX(xt), NY(0) - 6, f2(wT), NY(0), NY(0));
  s += dimH(NX(xt), NX(0), NY(0) - 6, f2(g - wT), null, NY(0));
  s += dimH(NX(-g), NX(0), NY(0) - 12, f2(g), NY(0) - 6, NY(0) - 6);
  s += dimH(NX(-g), NX(xb1), NY(yb) + 8, f2(e), NY(0), NY(yb));
  s += dimH(NX(xb1), NX(xb2), NY(yb) + 8, f2(M.bw), null, NY(yb));
  s += dimH(NX(xb2), NX(xt), NY(yb) + 8, f2(e), null, NY(0));
  s += dimV(NX(-1.7), NY(0), NY(yb), f2(-yb), null, NX(xb1));
  s += lvl(NX(-2.0), NY(0), '0,00');
  s += lvl(NX((xb1 + xb2) / 2), NY(yb), lvn(yb));
  lev(pA).forEach(v => { s += lvl(NX(0.25), NY(v), lvn(v)); });
  s += T(NX(1.2), NY(M.top2(...pA) / 2) + 1, 'песок', {a: 'middle', s: 2.4, h: true});
  s += T(NX(1.25), NY(M.top1(...pA) + P.t2 / 2) + 0.9, '20×40', {a: 'middle', s: 2.3, h: true});
  s += T(NX(1.25), NY(M.base(...pA) + P.t1 / 2) + 0.9, '40×70', {a: 'middle', s: 2.3, h: true});
  s += T(NX(-1.6), NY(-0.06), 'дорога', {a: 'middle', s: 2.3, h: true});
  s += leader(NX(xb1 - e * 0.5), NY(yb * 0.5), NX(0.1), NY(-1.55), 'крепление откосов: геотекстиль + щебень или лоток', {s: 2.3});
  const clr = M.base(...pA) - yb;
  if (clr < 0.1) {
    s += T(25, 242, `Дно канавы здесь (${lvn(yb)}) ${clr < 0 ? `на ${f2(-clr)} выше` : `всего на ${f2(clr)} ниже`} низа щебня (${lvn(M.base(...pA))}): вода`, {s: 2.6, fill: '#a2560a', w: 700});
    s += T(25, 246.5, `из щебня у угла 4 не уйдёт в канаву. Рекомендуется глубина в мелком конце не менее ${f2(Math.ceil((P.depth + 0.1 - ST.minClr) * 20) / 20)}.`, {s: 2.6, fill: '#a2560a', w: 700});
  }
  s += T(25, 251, `Откосы 1:${f2(e / -yb)} — круче допустимого для песка (1:1,5), крепление обязательно.`, {s: 2.6, fill: '#a2560a', w: 700});

  // конструкция отсыпки
  s += T(205, 136, 'Конструкция отсыпки', {s: 4, w: 700});
  s += T(205, 140.6, 'М 1:20', {s: 2.6});
  const bases = pts.map(p => M.base(...p));
  s += pie(210, 150, 'у стороны С', Math.max(...bases));
  s += pie(290, 150, 'у стороны А', Math.min(...bases));
  s += T(345, 150, 'Порядок работ', {s: 3.2, w: 700});
  [`1. Снять плодородный слой ${f2(P.strip)}.`, '2. Спланировать основание', `    с уклоном ${f2(P.iCA / 100, 3)} к стороне А.`, '3. Вырыть канавы, уклон дна', `    ${f2(P.iD / 100, 3)} к т.1, укрепить откосы.`,
    `4. Щебень 40×70, ${f2(P.t1)}, уплотнить.`, `5. Щебень 20×40, ${f2(P.t2)}, уплотнить.`, '6. Песок до 0,00, уплотнять', '    послойно.'].forEach((t, i) => { s += T(345, 156 + i * 4.6, t, {s: 2.6}); });
  return s;
}
function pie(x, y, title, base) {
  const k = 50; let s = '';
  const layers = [['sand', 0, base + P.t1 + P.t2, 'Песок'], ['g2', base + P.t1 + P.t2, base + P.t1, 'Щебень 20×40'], ['g1', base + P.t1, base, 'Щебень 40×70']];
  const w = 22;
  layers.forEach(([nm, top, bot, name]) => {
    const y1 = y - top * k, y2 = y - bot * k;
    s += R(x, y1, w, y2 - y1, `fill="url(#${PAT[nm]})" class="ly"`);
    s += T(x + w + 2, (y1 + y2) / 2 + 1, `${name} ${f2(top - bot)}`, {s: 2.5});
  });
  const yb = y - base * k;
  s += R(x, yb, w, 7, 'fill="url(#pSoil)" class="ly"');
  s += T(x + w + 2, yb + 4.5, `основание ${lvn(base)}`, {s: 2.5, fill: '#1f5f9c'});
  s += lvl(x - 0.2, y, '0,00', {left: true});
  s += T(x + w / 2, yb + 12, title, {a: 'middle', s: 2.8, w: 700});
  return s;
}

/* ---------- ЛИСТ 3. Разрез 2–2, ведомость, примечания ---------- */
function sheet3() {
  let s = frame(3, 'Разрез 2–2. Ведомость объёмов', 'М 1:150, 1:25');
  const posB = M.lenB / 2, L2 = M.secLine('z', posB), len = L2.tExit;
  const o = {axis: 'z', pos: posB, t0: -8, t1: len + 2.6, kx: 1000 / 150, ky: 40, X0: 40, Y0: 46, yBot: -1.9};
  const S2 = section(o); const {X, Y} = S2;
  const at = t => L2.at(t);
  s += T(30, 15, 'Разрез 2–2 (поперёк стороны Б, посередине стороны)', {s: 4.2, w: 700});
  s += T(30, 19.6, 'М гор. 1:150, верт. 1:25', {s: 2.8});
  s += S2.s;
  s += dimH(X(-7), X(-1), Y(0) - 12, '6,00 (усл.)', Y(0), Y(0));
  s += dimH(X(-1), X(0), Y(0) - 12, f2(g), null, Y(0));
  s += dimH(X(0), X(len), Y(0) - 12, f2(len), null, Y(0));
  s += T(X(-4), Y(0) - 16.5, 'Автодорога', {a: 'middle', s: 2.8});
  s += T(X(0), Y(0) - 16.5, 'Сторона Б', {a: 'middle', s: 2.8, w: 700});
  s += T(X(len), Y(0) - 16.5, 'Сторона D', {a: 'middle', s: 2.8, w: 700});
  s += lvl(X(-5), Y(0), '0,00');
  const hb = M.hGap(...at(-g + wT / 2));
  s += leader(X(-g + wT / 2), Y(hb), X(-3), Y(-1.55), `дно канавы ${lvn(hb)}`, {right: false});
  const lev = p => [0, M.top2(...p), M.top1(...p), M.base(...p)];
  lev(at(0.05)).forEach(v => { s += lvl(X(1), Y(v), lvn(v)); });
  lev(at(len - 0.05)).forEach(v => { s += L(X(len), Y(v), X(len + 2), Y(v), 'ld') + lvl(X(len + 2), Y(v), lvn(v)); });
  const pm = at(len / 2);
  s += T(X(len / 2), Y(M.top2(...pm) / 2) + 1, `Песок, h = ${f2(-M.top2(...at(0.05)))}…${f2(-M.top2(...at(len - 0.05)))} (в этом разрезе)`, {a: 'middle', s: 2.7, h: true});
  s += T(X(len / 2), Y(M.top1(...pm) + P.t2 / 2) + 0.9, `Щебень 20×40, h = ${f2(P.t2)}`, {a: 'middle', s: 2.4, h: true});
  s += T(X(len / 2), Y(M.base(...pm) + P.t1 / 2) + 0.9, `Щебень 40×70, h = ${f2(P.t1)}`, {a: 'middle', s: 2.6, h: true});
  s += T(X(len / 2), Y(M.base(...pm)) + 4.2, 'основание: уклон перпендикулярно стороне А, вдоль Б почти горизонтально', {a: 'middle', s: 2.5, h: true});
  s += T(X(len * 0.78), Y(-P.drop) - 0.8, `существующий рельеф ${lvn(-P.drop)}`, {a: 'middle', s: 2.3, h: true});

  // ведомость объёмов
  s += T(25, 132, 'Ведомость объёмов работ и материалов', {s: 4, w: 700});
  const rows = [['№', 'Наименование', 'Ед.', 'В деле', 'К заказу', '≈ т']];
  const addRow = (name, v, k, rho) => rows.push([String(rows.length), name, 'м³', f2(v, 1), k ? f2(v * k, 1) : '—', rho ? f2(v * k * rho, 0) : '—']);
  const sandC = Math.min(...ST.sandAt), sandA = Math.max(...ST.sandAt);
  addRow(`Снятие плодородного слоя ${f2(P.strip)}`, ST.vTop);
  addRow('Доп. выемка грунта под уклон основания', ST.vExtra);
  addRow('Выемка грунта из канав (ниже сущ. рельефа)', ST.exc);
  addRow('Отсыпка бермы и бортов канав', ST.bank);
  addRow(`Щебень 40×70, слой ${f2(P.t1)}`, ST.v1, K_STONE, RHO.g1);
  addRow(`Щебень 20×40, слой ${f2(P.t2)}`, ST.v2, K_STONE, RHO.g2);
  addRow(`Песок, слой ${f2(sandC)}…${f2(sandA)}`, ST.vSand, K_SAND, RHO.sand);
  s += table(25, 136, [9, 92, 12, 26, 26, 22], rows, {rh: 6, s: 2.7, left: [0, 1]});
  s += T(25, 191, `К заказу = в деле × коэффициент уплотнения (щебень ${f2(K_STONE, 1)}, песок ${f2(K_SAND, 1)}).`, {s: 2.5});
  s += T(25, 195.5, `Насыпная плотность: 40×70 — ${f2(RHO.g1)}, 20×40 — ${f2(RHO.g2)}, песок — ${f2(RHO.sand)} т/м³. Уточнить у поставщика.`, {s: 2.5});

  // примечания
  s += T(235, 132, 'Примечания', {s: 4, w: 700});
  const need = Math.ceil((P.depth + 0.1 - ST.minClr) * 20) / 20;
  const notes = [
    ['Отметки и размеры в метрах. Условный 0,00 — покрытие', 'автодороги. Участок исходно ниже дороги на 0,60.'],
    [`Границы — по каталогу координат, S = ${f2(M.area, 2)} м².`, `Углы: ${M.angles.map((a, i) => `${i + 1} — ${dms(a)}`).join(', ')}.`],
    [`Плодородный слой снимается на ${f2(P.strip)} у стороны С; основание`, `с уклоном ${f2(P.iCA / 100, 3)} к стороне А (у А выемка ${f2(P.strip + P.iCA / 100 * M.dAmax)}).`],
    ['Подъём до 0,00: 0,60 + 0,10 = 0,70 = 0,20 + 0,10 + 0,40', `(у стороны С). К стороне А слой песка растёт до ${f2(sandA)}.`],
    [`Канавы вдоль сторон А и Б: ${f2(wT)} по верху от края дороги,`, `берма ${f2(g - wT)} у границы, дно с уклоном ${f2(P.iD / 100, 3)} к т.1 (угол 1).`],
    [`Глубина ${f2(P.depth)} от покрытия дороги — в мелком конце (угол 4).`, ST.minClr < 0.1 ? `Рекомендуется ${f2(need)}: иначе у угла 4 дно выше низа щебня.` : 'Дно канавы везде ниже низа щебня.'],
    ['Откосы канав круче 1:1 — нужно крепление (геотекстиль +', 'щебень, габионы или ж/б лоток).'],
    ['Сброс воды из т.1 (колодец, труба, кювет) — по месту,', 'в задании не определён.'],
    ['Слои отсыпать с послойным уплотнением.'],
    ['Ширина автодороги на чертеже условная.'],
  ];
  let yy = 138;
  notes.forEach((lines, i) => lines.forEach((t, j) => { s += T(j ? 239.5 : 235, yy, j ? t : `${i + 1}. ${t}`, {s: 2.7}); yy += 5; }));
  return s;
}

/* ---------- сборка страницы ---------- */
const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<pattern id="pSoil" patternUnits="userSpaceOnUse" width="2.2" height="2.2" patternTransform="rotate(45)"><rect width="2.2" height="2.2" fill="#efe4d3"/><line x1="0" y1="0" x2="0" y2="2.2" stroke="#8a6f52" stroke-width="0.16"/></pattern>
<pattern id="pTop" patternUnits="userSpaceOnUse" width="1.1" height="1.1" patternTransform="rotate(-45)"><rect width="1.1" height="1.1" fill="#d8c6aa"/><line x1="0" y1="0" x2="0" y2="1.1" stroke="#5b4630" stroke-width="0.16"/></pattern>
<pattern id="pFill" patternUnits="userSpaceOnUse" width="2" height="2"><rect width="2" height="2" fill="#eadcc6"/><path d="M0,0 L2,2 M2,0 L0,2" stroke="#8a6f52" stroke-width="0.14"/></pattern>
<pattern id="pG1" patternUnits="userSpaceOnUse" width="3" height="3"><rect width="3" height="3" fill="#e3e4e5"/><ellipse cx="0.8" cy="0.9" rx="0.6" ry="0.45" fill="none" stroke="#444" stroke-width="0.15"/><ellipse cx="2.3" cy="2.2" rx="0.5" ry="0.4" fill="none" stroke="#444" stroke-width="0.15"/></pattern>
<pattern id="pG2" patternUnits="userSpaceOnUse" width="1.6" height="1.6"><rect width="1.6" height="1.6" fill="#eeeff0"/><circle cx="0.45" cy="0.45" r="0.28" fill="none" stroke="#555" stroke-width="0.12"/><circle cx="1.2" cy="1.15" r="0.24" fill="none" stroke="#555" stroke-width="0.12"/></pattern>
<pattern id="pSand" patternUnits="userSpaceOnUse" width="1.2" height="1.2"><rect width="1.2" height="1.2" fill="#f7edd0"/><circle cx="0.3" cy="0.3" r="0.12" fill="#9a7f45"/><circle cx="0.9" cy="0.85" r="0.1" fill="#9a7f45"/></pattern>
<pattern id="pSandP" patternUnits="userSpaceOnUse" width="3" height="3"><rect width="3" height="3" fill="#fbf5e3"/><circle cx="0.8" cy="0.8" r="0.14" fill="#c2a76a"/><circle cx="2.2" cy="2.1" r="0.12" fill="#c2a76a"/></pattern>
<pattern id="pAsph" patternUnits="userSpaceOnUse" width="1" height="1"><rect width="1" height="1" fill="#6f7276"/><circle cx="0.3" cy="0.4" r="0.1" fill="#9a9da1"/></pattern>
<pattern id="pRoadP" patternUnits="userSpaceOnUse" width="2" height="2"><rect width="2" height="2" fill="#cdd0d3"/><circle cx="0.5" cy="0.5" r="0.12" fill="#a9acaf"/></pattern>
<pattern id="pRoadbed" patternUnits="userSpaceOnUse" width="2" height="2" patternTransform="rotate(45)"><rect width="2" height="2" fill="#e5e0d6"/><line x1="0" y1="0" x2="0" y2="2" stroke="#7d7464" stroke-width="0.14"/><line x1="0" y1="1" x2="2" y2="1" stroke="#7d7464" stroke-width="0.1"/></pattern>
<pattern id="pWater" patternUnits="userSpaceOnUse" width="1.6" height="1.6"><rect width="1.6" height="1.6" fill="#cfe4f6"/><line x1="0" y1="0.8" x2="1.6" y2="0.8" stroke="#5b9bd5" stroke-width="0.12"/></pattern>
</defs></svg>`;

const sheets = [sheet1(), sheet2(), sheet3()];
const sheetSvg = (body, i) => `<figure class="sheet" id="list${i + 1}"><div class="scroll"><svg viewBox="0 0 420 297" width="420mm" height="297mm" role="img" aria-label="Лист ${i + 1}"><rect width="420" height="297" fill="#fff"/>${body}</svg></div></figure>`;

const html = `<title>Чертёж участка 6 соток</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=PT+Sans+Narrow:wght@400;700&family=PT+Sans:wght@400;700&display=swap">
<style>
/* Layout: листы А3 друг под другом на «столе», шапка со ссылками; в печати — по листу на страницу */
:root{--desk:#d9dedb;--ink:#1b282d;--ink-2:#56656a;--rule:#c3ccc8;--accent:#1f5f9c;--chip:#f8faf8;
  --f-ui:"PT Sans","Segoe UI",Roboto,Arial,sans-serif;--f-draw:"PT Sans Narrow","Arial Narrow",Arial,sans-serif}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--desk:#121819;--ink:#e1e8e5;--ink-2:#97a6ab;--rule:#2c383d;--accent:#6ea9e3;--chip:#182024;color-scheme:dark}}
:root[data-theme="dark"]{--desk:#121819;--ink:#e1e8e5;--ink-2:#97a6ab;--rule:#2c383d;--accent:#6ea9e3;--chip:#182024;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--desk);color:var(--ink);font-family:var(--f-ui);font-size:14px}
header{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:baseline;justify-content:space-between;padding-block:14px;
  padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
header h1{margin:0;font-family:var(--f-draw);font-size:22px;text-wrap:balance}
header p{margin:2px 0 0;color:var(--ink-2);font-size:13px}
nav{display:flex;gap:8px;flex-wrap:wrap}
nav a{color:var(--accent);background:var(--chip);border:1px solid var(--rule);border-radius:4px;padding:5px 10px;text-decoration:none;font-size:13px}
nav a:hover{border-color:var(--accent)}
main{display:flex;flex-direction:column;gap:20px;padding-block:0 24px;
  padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.sheet{margin:0 auto;width:100%;max-width:1500px}
.scroll{overflow-x:auto;box-shadow:0 1px 3px rgba(0,0,0,.25);background:#fff}
.sheet svg{display:block;width:100%;height:auto;min-width:860px}
.t{font-family:var(--f-draw);fill:#111}
.h{paint-order:stroke;stroke:#fff;stroke-width:.7px;stroke-linejoin:round}
.th{stroke:#111;stroke-width:.18}
.md{stroke:#111;stroke-width:.35}
.tk{stroke:#111;stroke-width:.7}
.cut{stroke:#999;stroke-width:.2}
.none{stroke:none}
.ly{stroke:#222;stroke-width:.2}
.bd{stroke:#111;stroke-width:.6;stroke-dasharray:6 1.2 1 1.2 1 1.2}
.cl{stroke:#fff;stroke-width:.4;stroke-dasharray:4 3}
.ex{stroke:#7a5a3a;stroke-width:.3;stroke-dasharray:2.5 1.2}
.ld{stroke:#555;stroke-width:.15;stroke-dasharray:1.2 .8}
.axl{stroke:#111;stroke-width:.18;stroke-dasharray:8 1.5 1 1.5}
.cut2{stroke:#111;stroke-width:.9}
.gt{stroke:#1f5f9c;stroke-width:.45;stroke-dasharray:1.5 .8;fill:none}
.ah{fill:#111}
.fl{stroke:#1f6fb5;stroke-width:.4}
.fh{fill:#1f6fb5}
.lv{fill:none;stroke:#111;stroke-width:.22}
.dot{fill:#111}
.lp{fill:#1f5f9c;stroke:#fff;stroke-width:.3}
.cn{fill:#fff;stroke:#c0281b;stroke-width:.45}
@page{size:420mm 297mm;margin:0}
@media print{
  header{display:none}
  body{background:#fff}
  main{padding:0;gap:0}
  .sheet{max-width:none;break-after:page}
  .scroll{overflow:visible;box-shadow:none}
  .sheet svg{width:420mm;height:297mm;min-width:0}
}
</style>
${DEFS}
<header>
  <div>
    <h1>Чертёж участка ${f2(M.area, 0)} м²</h1>
    <p>3 листа А3: план по координатам, разрезы, узел канавы, ведомость объёмов. Отметки в метрах от покрытия автодороги.</p>
  </div>
  <nav><a href="chertezh.pdf">Скачать PDF</a><a href="./">3D-модель</a><a href="#list1">Лист 1</a><a href="#list2">Лист 2</a><a href="#list3">Лист 3</a></nav>
</header>
<main>
${sheets.map(sheetSvg).join('\n')}
</main>
`;
// полноценный документ: всё до общих узоров — в head, остальное — в body
const headEnd = html.indexOf('<svg width="0"');
fs.writeFileSync(OUT, '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
  + html.slice(0, headEnd) + '</head><body>' + html.slice(headEnd) + '</body></html>', 'utf8');
console.log('ok', OUT, fs.statSync(OUT).size, 'bytes');
