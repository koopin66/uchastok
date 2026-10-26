// Генератор чертежа участка (3 листа А3) по той же расчётной модели, что и 3D-страница.
// Запуск: node gen-chertezh.js <файл.html>
const fs = require('fs');
const OUT = process.argv[2] || 'chertezh.html';

/* ---------- исходные данные (как в 3D-модели) ---------- */
const P = {L: 31, W: 19, drop: 0.6, strip: 0.1, finish: 0, t1: 0.2, t2: 0.1,
  iCA: 2, iDB: 0, iD: 2, gap: 1, offset: 0.3, depth: 1, bw: 0.3};
const CAP = 0.3, ROADW = 6;
const K_STONE = 1.3, K_SAND = 1.2, RHO = {g1: 1.45, g2: 1.40, sand: 1.50};
const DATE = '26.10.2026';

function model() {
  const i1 = P.iCA / 100, i2 = P.iDB / 100, iD = P.iD / 100;
  const baseHigh = -(P.drop + P.strip);
  const base = (x, z) => baseHigh - i1 * (P.W - z) - i2 * (P.L - x);
  const top1 = (x, z) => base(x, z) + P.t1;
  const top2 = (x, z) => top1(x, z) + P.t2;
  const fin = (x, z) => Math.max(P.finish, top2(x, z));
  const wTop = Math.max(0.1, P.gap - P.offset);
  const bw = Math.min(P.bw, wTop - 0.04);
  const e = (wTop - bw) / 2;
  const corner = -(P.depth + iD * Math.max(P.L, P.W));
  const bot = s => corner + iD * Math.max(0, s);
  const prof = (u, b) => {
    if (u < 0 || u >= wTop) return 0;
    if (u < e) return b * (u / e);
    if (u <= e + bw) return b;
    return b * (1 - (u - e - bw) / e);
  };
  const hGap = (x, z) => {
    const hA = x <= P.L ? prof(z + P.gap, bot(Math.max(x, 0))) : 0;
    const hB = z <= P.W ? prof(x + P.gap, bot(Math.max(z, 0))) : 0;
    return Math.min(hA, hB);
  };
  return {base, top1, top2, fin, hGap, bot, corner, wTop, bw, e};
}
const M = model();

function zoneAt(x, z) {
  const g = P.gap;
  if (x >= 0 && x <= P.L && z >= 0 && z <= P.W) return 'plot';
  if (z >= -g && z < 0 && x >= -g && x <= P.L + CAP) return 'strip';
  if (x >= -g && x < 0 && z >= 0 && z <= P.W + CAP) return 'strip';
  if (z >= -g - ROADW && z < -g && x >= -g - ROADW) return 'road';
  if (x >= -g - ROADW && x < -g && z >= -g) return 'road';
  return 'out';
}
function column(x, z, deep) {
  const out = []; const B = (n, a, b) => { if (b > a + 1e-6) out.push([n, a, b]); };
  const nat = -P.drop, ts = -P.drop - P.strip;
  switch (zoneAt(x, z)) {
    case 'road': B('soil', deep, nat); B('roadbed', nat, -0.12); B('road', -0.12, 0); break;
    case 'strip': { const h = M.hGap(x, z); B('soil', deep, Math.min(h, nat)); B('fill', nat, h); break; }
    case 'plot': {
      const b = M.base(x, z); B('soil', deep, b);
      B('g1', b, M.top1(x, z)); B('g2', M.top1(x, z), M.top2(x, z)); B('sand', M.top2(x, z), M.fin(x, z));
      break;
    }
    default: B('soil', deep, ts); B('topsoil', ts, nat);
  }
  return out;
}

function stats() {
  const S = P.L * P.W, nX = 62, nZ = 38, dA = S / (nX * nZ);
  let vStrip = 0, vSand = 0;
  for (let i = 0; i < nX; i++) for (let j = 0; j < nZ; j++) {
    const x = (i + 0.5) * P.L / nX, z = (j + 0.5) * P.W / nZ;
    vStrip += Math.max(0, -P.drop - M.base(x, z)) * dA;
    vSand += Math.max(0, M.fin(x, z) - M.top2(x, z)) * dA;
  }
  let cap = 0, exc = 0, bank = 0; const dx = 0.1, du = 0.02;
  const acc = (x, z) => { const h = M.hGap(x, z); cap += Math.max(0, -h) * dx * du; exc += Math.max(0, -P.drop - h) * dx * du; bank += Math.max(0, h + P.drop) * dx * du; };
  for (let x = -P.gap + dx / 2; x < P.L; x += dx) for (let z = -P.gap + du / 2; z < 0; z += du) acc(x, z);
  for (let x = -P.gap + du / 2; x < 0; x += du) for (let z = dx / 2; z < P.W; z += dx) acc(x, z);
  const vTop = S * P.strip;
  return {S, vTop, vExtra: Math.max(0, vStrip - vTop), v1: S * P.t1, v2: S * P.t2, vSand, cap, exc, bank,
    len: (P.L + P.gap - M.wTop / 2) + (P.W + P.gap - M.wTop / 2)};
}
const ST = stats();

/* ---------- форматирование ---------- */
const f2 = (v, d = 2) => { const r = Math.round(v * 10 ** d) / 10 ** d; return (r < 0 ? '−' : '') + Math.abs(r).toFixed(d).replace('.', ','); };
const lv = v => { const r = Math.round(v * 100) / 100; if (Math.abs(r) < 0.005) return '0,00'; return (r > 0 ? '+' : '−') + Math.abs(r).toFixed(2).replace('.', ','); };
const lvn = v => { const r = Math.round(v * 100) / 100; if (Math.abs(r) < 0.005) return '0,00'; return (r < 0 ? '−' : '') + Math.abs(r).toFixed(2).replace('.', ','); };

/* ---------- примитивы SVG (единицы — мм листа) ---------- */
const r2 = v => Math.round(v * 100) / 100;
const L = (x1, y1, x2, y2, c = 'th') => `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" class="${c}"/>`;
const R = (x, y, w, h, a = 'class="th" fill="none"') => `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" ${a}/>`;
const T = (x, y, s, o = {}) => `<text x="${r2(x)}" y="${r2(y)}" class="${o.c || 't'}${o.h ? ' h' : ''}" font-size="${o.s || 2.5}" text-anchor="${o.a || 'start'}"${o.rot != null ? ` transform="rotate(${r2(o.rot)} ${r2(x)} ${r2(y)})"` : ''}${o.w ? ` font-weight="${o.w}"` : ''}${o.fill ? ` fill="${o.fill}"` : ''}>${s}</text>`;
const PL = (pts, c = 'th') => `<polyline points="${pts.map(p => r2(p[0]) + ',' + r2(p[1])).join(' ')}" class="${c}" fill="none"/>`;
const PG = (pts, a) => `<polygon points="${pts.map(p => r2(p[0]) + ',' + r2(p[1])).join(' ')}" ${a}/>`;
const tick = (x, y) => L(x - 0.9, y + 0.9, x + 0.9, y - 0.9, 'md');
const arrowHead = (x, y, ang, sz = 2.2, cls = 'ah') => {
  const a1 = ang + Math.PI * 0.86, a2 = ang - Math.PI * 0.86;
  return PG([[x, y], [x + sz * Math.cos(a1), y + sz * Math.sin(a1)], [x + sz * Math.cos(a2), y + sz * Math.sin(a2)]], `class="${cls}"`);
};
const arrow = (x1, y1, x2, y2, cls = 'md', head = 'ah', sz = 2.2) => L(x1, y1, x2, y2, cls) + arrowHead(x2, y2, Math.atan2(y2 - y1, x2 - x1), sz, head);

function dimH(x1, x2, y, label, f1, f2, o = {}) {
  const ext = (x, f) => { if (f == null) return ''; const dn = f > y; return L(x, f + (dn ? -0.8 : 0.8), x, y + (dn ? -1.5 : 1.5)); };
  return ext(x1, f1) + ext(x2, f2) + L(x1 - 1.5, y, x2 + 1.5, y) + tick(x1, y) + tick(x2, y)
    + T(o.lx != null ? o.lx : (x1 + x2) / 2, y - 0.8, label, {a: 'middle', s: o.s || 2.5, h: true});
}
function dimV(x, y1, y2, label, f1, f2, o = {}) {
  const ext = (yy, f) => { if (f == null) return ''; const lf = f < x; return L(f + (lf ? 0.8 : -0.8), yy, x + (lf ? 1.5 : -1.5), yy); };
  const ya = Math.min(y1, y2), yb = Math.max(y1, y2);
  return ext(y1, f1) + ext(y2, f2) + L(x, ya - 1.5, x, yb + 1.5) + tick(x, y1) + tick(x, y2)
    + T(x - 0.8, o.ly != null ? o.ly : (ya + yb) / 2, label, {a: 'middle', rot: -90, s: o.s || 2.5, h: true});
}
// знак отметки уровня
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
  s += T(x0 + w / 2, y0 + 6.2, 'Участок 31 × 19 м у автодороги', {a: 'middle', s: 5, w: 700});
  s += T(x0 + w / 2, y0 + 11.6, 'Вертикальная планировка, отсыпка и дренаж', {a: 'middle', s: 3.2});
  s += T(x0 + 65, y0 + 21.5, title, {a: 'middle', s: 4, w: 700});
  s += T(x0 + 65, y0 + 27, 'Отметки и размеры в метрах. 0,00 — покрытие автодороги', {a: 'middle', s: 2.6});
  s += T(x0 + 139, y0 + 18.6, 'Стадия', {a: 'middle', s: 2.4}) + T(x0 + 157, y0 + 18.6, 'Лист', {a: 'middle', s: 2.4}) + T(x0 + 175.5, y0 + 18.6, 'Листов', {a: 'middle', s: 2.4});
  s += T(x0 + 139, y0 + 27.3, 'Эскиз', {a: 'middle', s: 3}) + T(x0 + 157, y0 + 27.3, String(n), {a: 'middle', s: 3.4}) + T(x0 + 175.5, y0 + 27.3, '3', {a: 'middle', s: 3.4});
  s += T(x0 + 65, y0 + 38, `S = ${f2(ST.S, 0)} м² (${f2(ST.S / 100)} сотки)`, {a: 'middle', s: 3.2});
  s += T(x0 + 65, y0 + 44.5, 'Эскизный проект по заданию заказчика.', {a: 'middle', s: 2.6});
  s += T(x0 + 65, y0 + 49.5, 'Не является рабочей документацией, объёмы ориентировочные.', {a: 'middle', s: 2.6});
  s += T(x0 + 157.5, y0 + 37.5, scale, {a: 'middle', s: 3});
  s += T(x0 + 157.5, y0 + 50, DATE, {a: 'middle', s: 3});
  return s;
}

/* ---------- разрез по расчётной модели ---------- */
const PAT = {soil: 'pSoil', topsoil: 'pTop', roadbed: 'pRoadbed', road: 'pAsph', fill: 'pFill', g1: 'pG1', g2: 'pG2', sand: 'pSand'};
function section(o) {
  const len = o.axis === 'x' ? P.W : P.L;
  const pt = t => o.axis === 'x' ? [o.pos, t] : [t, o.pos];
  const X = t => o.X0 + (t - o.t0) * o.kx, Y = y => o.Y0 - y * o.ky;
  const br = [o.t0, o.t1];
  for (const b of [-P.gap - ROADW, -P.gap, -P.gap + M.e, -P.gap + M.e + M.bw, -P.gap + M.wTop, 0, len])
    if (b > o.t0 + 1e-3 && b < o.t1 - 1e-3) br.push(b - 1e-4, b + 1e-4);
  const ts = [...new Set(br)].sort((a, b) => a - b);
  const cols = ts.map(t => ({t, b: column(...pt(t), o.yBot)}));
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
  // существующий рельеф по участку
  s += L(X(Math.max(0, o.t0)), Y(-P.drop), X(Math.min(len, o.t1)), Y(-P.drop), 'ex');
  return {s, X, Y, len, pt};
}

/* ---------- ЛИСТ 1. План ---------- */
function sheet1() {
  const k = 1000 / 150;
  const X = x => 30 + (x + 7) * k, Z = z => 22 + (z + 7) * k;
  const g = P.gap, wT = M.wTop, e = M.e;
  let s = frame(1, 'План участка', 'М 1:150');
  s += T(30, 15, 'План участка. Отметки, уклоны, дренажные канавы', {s: 4.2, w: 700});
  s += T(30, 19.6, 'М 1:150', {s: 2.8});
  // дороги
  s += R(X(-7), Z(-7), X(33) - X(-7), Z(-1) - Z(-7), 'class="md" fill="url(#pRoadP)"');
  s += R(X(-7), Z(-1), X(-1) - X(-7), Z(21) - Z(-1), 'class="md" fill="url(#pRoadP)"');
  s += L(X(-4), Z(-4), X(33), Z(-4), 'cl') + L(X(-4), Z(-4), X(-4), Z(21), 'cl');
  s += T(X(14), Z(-4) - 1.2, 'АВТОДОРОГА · покрытие 0,00', {a: 'middle', s: 3, w: 700, h: true});
  s += T(X(-4) - 1.2, Z(12), 'АВТОДОРОГА · покрытие 0,00', {a: 'middle', s: 3, w: 700, rot: -90, h: true});
  // откосы канав, вода по дну, берма
  s += R(X(-g), Z(-g), X(P.L) - X(-g), Z(-P.offset) - Z(-g), 'fill="#e6d6bd" class="none"');
  s += R(X(-g), Z(-P.offset), X(-P.offset) - X(-g), Z(P.W) - Z(-P.offset), 'fill="#e6d6bd" class="none"');
  s += R(X(-g + e), Z(-g + e), X(P.L) - X(-g + e), M.bw * k, 'fill="url(#pWater)" class="none"');
  s += R(X(-g + e), Z(-g + e + M.bw), M.bw * k, Z(P.W) - Z(-g + e + M.bw), 'fill="url(#pWater)" class="none"');
  s += R(X(-P.offset), Z(-P.offset), X(P.L) - X(-P.offset), P.offset * k, 'fill="#f3eee4" class="none"');
  s += R(X(-P.offset), Z(0), P.offset * k, Z(P.W) - Z(0), 'fill="#f3eee4" class="none"');
  // бровки и дно
  s += PL([[X(P.L), Z(-g)], [X(-g), Z(-g)], [X(-g), Z(P.W)]], 'md');
  s += PL([[X(P.L), Z(-P.offset)], [X(-P.offset), Z(-P.offset)], [X(-P.offset), Z(P.W)]], 'md');
  s += PL([[X(P.L), Z(-g + e)], [X(-g + e), Z(-g + e)], [X(-g + e), Z(P.W)]], 'th');
  s += PL([[X(P.L), Z(-g + e + M.bw)], [X(-g + e + M.bw), Z(-g + e + M.bw)], [X(-g + e + M.bw), Z(P.W)]], 'th');
  s += L(X(P.L), Z(-g), X(P.L), Z(-P.offset), 'md') + L(X(-g), Z(P.W), X(-P.offset), Z(P.W), 'md');
  // участок
  s += R(X(0), Z(0), X(P.L) - X(0), Z(P.W) - Z(0), 'fill="url(#pSandP)" class="none"');
  s += R(X(0), Z(0), X(P.L) - X(0), Z(P.W) - Z(0), 'class="bd" fill="none"');
  // сток по дну канав
  const zc = -g + wT / 2;
  for (const x of [28, 20, 12, 4]) s += arrow(X(x), Z(zc), X(x - 3), Z(zc), 'fl', 'fh', 1.6);
  for (const z of [17, 11, 5]) s += arrow(X(zc), Z(z), X(zc), Z(z - 3), 'fl', 'fh', 1.6);
  s += T(X(16), Z(-g) - 1.3, `дно канавы: уклон i = ${f2(P.iD / 100, 3)} к т.1`, {a: 'middle', s: 2.3, h: true});
  s += T(X(-g) - 1.3, Z(9), `дно канавы: уклон i = ${f2(P.iD / 100, 3)} к т.1`, {a: 'middle', s: 2.3, rot: -90, h: true});
  // отметки дна канав
  s += leader(X(P.L), Z(zc), X(P.L) + 4, Z(-2.2), `дно ${lvn(M.bot(P.L))}`);
  s += leader(X(zc), Z(P.W), X(-2.4), Z(P.W) + 5.5, `дно ${lvn(M.bot(P.W))}`, {right: false});
  s += `<circle cx="${r2(X(zc))}" cy="${r2(Z(zc))}" r="1.3" class="lp"/>`;
  s += leader(X(zc), Z(zc), X(-6.6), Z(-5.6), `т.1 — нижняя точка, дно ${lvn(M.corner)}`, {s: 2.5});
  s += leader(X(10), Z(-g + wT * 0.3), X(13), Z(-6.4), `канава: по верху ${f2(wT)}, по дну ${f2(M.bw)}, берма ${f2(P.gap - wT)} (узел А, лист 2)`, {right: false, s: 2.3});
  // уклон основания
  for (const x of [7.75, 23.25]) {
    s += arrow(X(x), Z(15.5), X(x), Z(4.5), 'md', 'ah', 2.4);
    s += T(X(x) + 3.4, Z(10), `i = ${f2(P.iCA / 100, 3)}`, {s: 2.6, rot: -90, a: 'middle', h: true});
  }
  s += T(X(15.5), Z(9), 'Уклон основания (низа щебня) от стороны С к стороне А', {a: 'middle', s: 2.6, h: true});
  s += T(X(15.5), Z(12.3), `Верх отсыпки горизонтальный: ${lv(P.finish)}`, {a: 'middle', s: 3, w: 700, h: true});
  s += T(X(15.5), Z(15), `S = ${f2(ST.S, 0)} м²`, {a: 'middle', s: 3, h: true});
  // стороны
  s += T(X(15.5), Z(0) + 4.4, 'Сторона А', {a: 'middle', s: 3.2, w: 700, h: true});
  s += T(X(0) + 4.4, Z(9.5), 'Сторона Б', {a: 'middle', s: 3.2, w: 700, rot: -90, h: true});
  s += T(X(15.5), Z(P.W) - 2.2, 'Сторона С', {a: 'middle', s: 3.2, w: 700, h: true});
  s += T(X(P.L) - 2.6, Z(9.5), 'Сторона D', {a: 'middle', s: 3.2, w: 700, rot: -90, h: true});
  // размеры
  s += dimH(X(0), X(P.L), Z(P.W) + 7, f2(P.L), Z(P.W), Z(P.W), {s: 3, lx: X(8)});
  s += dimV(X(P.L) + 7, Z(0), Z(P.W), f2(P.W), X(P.L), X(P.L), {s: 3, ly: Z(4.5)});
  // углы и отметки
  const C = [[0, 0, 1, 1], [0, P.W, 1, -1], [P.L, P.W, -1, -1], [P.L, 0, -1, 1]];
  C.forEach(([x, z, dx, dz], i) => {
    const cx = X(x) - dx * 3.2, cy = Z(z) - dz * 3.2;
    s += `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="2.6" class="cn"/>` + T(cx, cy + 1.2, String(i + 1), {a: 'middle', s: 3.4, w: 700});
    const tx = X(x) + dx * 14, ty = Z(z) + dz * 8;
    s += elevTag(tx, ty, M.fin(x, z), -P.drop, M.base(x, z));
  });
  // линии разрезов
  const cut = (x1, y1, x2, y2, ax, ay, lab) => L(x1, y1, x2, y2, 'cut2') + arrow((x1 + x2) / 2, (y1 + y2) / 2, (x1 + x2) / 2 + ax, (y1 + y2) / 2 + ay, 'md', 'ah', 1.8)
    + T((x1 + x2) / 2 + ax * 1.6 + (ay ? 2.2 : 0), (y1 + y2) / 2 + ay * 1.6 + (ax ? -1.2 : 1), lab, {a: 'middle', s: 3.6, w: 700});
  s += cut(X(15.5), Z(-7.9), X(15.5), Z(-6.4), 4, 0, '1') + cut(X(15.5), Z(19.9), X(15.5), Z(21.4), 4, 0, '1');
  s += L(X(15.5), Z(-6.4), X(15.5), Z(19.9), 'axl');
  s += cut(X(-7.9), Z(9.5), X(-6.4), Z(9.5), 0, -4, '2') + cut(X(33.0), Z(9.5), X(34.5), Z(9.5), 0, -4, '2');
  s += L(X(-6.4), Z(9.5), X(33.0), Z(9.5), 'axl');
  // правая колонка
  s += legend1(312, 14);
  s += cornerTable(312, 118);
  s += ditchTable(312, 168);
  s += T(25, 222, 'Примечания', {s: 3.2, w: 700});
  ['1. Отметки и размеры в метрах. 0,00 — отметка покрытия автодороги.',
    '2. Профиль канавы и узел примыкания — узел А (лист 2). Разрез 1–1 — лист 2, разрез 2–2 — лист 3.',
    '3. Ширина автодороги показана условно (6,0 м).',
  ].forEach((t, i) => { s += T(25, 228 + i * 5, t, {s: 2.7}); });
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
    [yy => R(x, yy, 11, 5, 'class="md" fill="url(#pRoadP)"'), 'Автодорога, покрытие 0,00'],
    [yy => R(x, yy, 11, 5, 'fill="#e6d6bd" class="th"') + R(x, yy + 1.6, 11, 1.8, 'fill="url(#pWater)" class="none"'), 'Дренажная канава: откосы и дно'],
    [yy => R(x, yy, 11, 5, 'fill="#f3eee4" class="th"'), `Берма ${f2(P.gap - M.wTop)} у границы участка`],
    [yy => R(x, yy, 11, 5, 'fill="url(#pSandP)" class="bd"'), 'Участок, граница участка'],
    [yy => arrow(x, yy + 2.5, x + 11, yy + 2.5, 'fl', 'fh', 1.6), 'Сток воды по дну канавы'],
    [yy => arrow(x, yy + 2.5, x + 11, yy + 2.5, 'md', 'ah', 2), 'Уклон основания (низа щебня)'],
    [yy => `<circle cx="${r2(x + 5.5)}" cy="${r2(yy + 2.5)}" r="1.3" class="lp"/>`, 'т.1 — самая низкая точка'],
    [yy => L(x, yy + 2.5, x + 4, yy + 2.5, 'cut2') + L(x + 5, yy + 2.5, x + 11, yy + 2.5, 'axl'), 'Линия разреза'],
  ];
  items.forEach(([sym, t], i) => { const yy = y + 3 + i * 7.2; s += sym(yy) + T(x + 14, yy + 4, t, {s: 2.6}); });
  const ty = y + items.length * 7.2 + 12;
  s += T(x, ty - 4.5, 'Отметки в углах участка:', {s: 2.6, w: 700});
  s += elevTag(x + 26, ty + 4, 0, -0.6, -1.08).replace(/>0,00</, '>проект.<').replace(/>−0,60</, '>существ.<').replace(/>\+0,60</, '>рабочая<').replace(/>−1,08</, '>низ щебня<');
  s += T(x + 40, ty + 2.5, 'рабочая = проектная − существ.', {s: 2.3});
  s += T(x + 40, ty + 6, '(+ насыпь)', {s: 2.3});
  return s;
}
function table(x, y, widths, rows, o = {}) {
  const rh = o.rh || 5.2; let s = '';
  const W = widths.reduce((a, b) => a + b, 0);
  rows.forEach((row, i) => {
    let cx = x;
    row.forEach((cell, j) => {
      const left = (o.left || [0]).includes(j) && !(j === 0 && o.center0);
      s += T(left ? cx + 1 : cx + widths[j] / 2, y + i * rh + rh - 1.5, cell, {a: left ? 'start' : 'middle', s: o.s || 2.5, w: i === 0 && o.head !== false ? 700 : null});
      cx += widths[j];
    });
    s += L(x, y + (i + 1) * rh, x + W, y + (i + 1) * rh, i === 0 && o.head !== false ? 'md' : 'th');
  });
  s += R(x, y, W, rows.length * rh, 'class="md" fill="none"');
  let cx = x; widths.slice(0, -1).forEach(w => { cx += w; s += L(cx, y, cx, y + rows.length * rh, 'th'); });
  return s;
}
function cornerTable(x, y) {
  const C = [[0, 0], [0, P.W], [P.L, P.W], [P.L, 0]];
  const rows = [['Угол', 'Проект.', 'Сущ.', 'Рабочая', 'Низ щебня', 'Срезка']];
  C.forEach(([cx, cz], i) => rows.push([String(i + 1), lvn(M.fin(cx, cz)), lvn(-P.drop), lv(M.fin(cx, cz) + P.drop), lvn(M.base(cx, cz)), f2(-P.drop - M.base(cx, cz))]));
  return T(x, y - 2, 'Ведомость отметок по углам', {s: 3.2, w: 700}) + table(x, y, [11, 16, 15, 17, 21, 18], rows, {center0: true});
}
function ditchTable(x, y) {
  const rows = [
    ['Длина по оси (А + Б)', `${f2(ST.len, 1)} м`],
    ['Ширина по верху / по дну', `${f2(M.wTop)} / ${f2(M.bw)} м`],
    ['Отступ (берма) от границы', `${f2(P.gap - M.wTop)} м`],
    ['Глубина у угла 4', `${f2(-M.bot(P.L))} м`],
    ['Глубина у угла 2', `${f2(-M.bot(P.W))} м`],
    ['Глубина в т.1', `${f2(-M.corner)} м`],
    ['Уклон дна к т.1', f2(P.iD / 100, 3)],
    ['Откосы', `1:${f2(M.e / -M.corner)} … 1:${f2(M.e / P.depth)}`],
    ['Ёмкость канав', `${f2(ST.cap, 1)} м³`],
  ];
  return T(x, y - 2, 'Дренажная канава', {s: 3.2, w: 700}) + table(x, y, [66, 32], rows, {head: false});
}

/* ---------- ЛИСТ 2. Разрез 1–1, узел А, конструкция ---------- */
function sheet2() {
  let s = frame(2, 'Разрез 1–1. Узел А', 'М 1:100, 1:25');
  // разрез 1–1
  const o = {axis: 'x', pos: P.L / 2, t0: -8, t1: 20.5, kx: 10, ky: 40, X0: 40, Y0: 46, yBot: -1.9};
  const S1 = section(o); const {X, Y} = S1;
  s += T(30, 15, 'Разрез 1–1 (поперёк стороны А, посередине участка)', {s: 4.2, w: 700});
  s += T(30, 19.6, 'М гор. 1:100, верт. 1:25', {s: 2.8});
  s += S1.s;
  s += dimH(X(-7), X(-1), Y(0) - 12, '6,00 (условно)', Y(0), Y(0));
  s += dimH(X(-1), X(0), Y(0) - 12, f2(P.gap), null, Y(0));
  s += dimH(X(0), X(P.W), Y(0) - 12, f2(P.W), null, Y(0));
  s += T(X(-4), Y(0) - 16.5, 'Автодорога', {a: 'middle', s: 2.8});
  s += T(X(0), Y(0) - 16.5, 'Сторона А', {a: 'middle', s: 2.8, w: 700});
  s += T(X(P.W), Y(0) - 16.5, 'Сторона С', {a: 'middle', s: 2.8, w: 700});
  s += lvl(X(-5), Y(0), '0,00');
  const hb = M.hGap(P.L / 2, -P.gap + M.wTop / 2);
  s += leader(X(-P.gap + M.wTop / 2), Y(hb), X(-3), Y(-1.55), `дно канавы ${lvn(hb)}`, {right: false});
  const A = [0, M.top2(P.L / 2, 0), M.top1(P.L / 2, 0), M.base(P.L / 2, 0)];
  A.forEach(v => { s += lvl(X(0.7), Y(v), lvn(v)); });
  const Cc = [0, M.top2(P.L / 2, P.W), M.top1(P.L / 2, P.W), M.base(P.L / 2, P.W)];
  Cc.forEach((v, i) => { s += L(X(P.W), Y(v), X(21.6), Y(v), 'ld') + lvl(X(21.6), Y(v), lvn(v)); });
  s += L(X(20.5), Y(-P.drop), X(23.4), Y(-P.drop), 'ld') + lvl(X(23.4), Y(-P.drop), `${lvn(-P.drop)} сущ.`);
  const tm = 9.5, b = M.base(P.L / 2, tm);
  s += T(X(tm), Y((M.top2(P.L / 2, tm) + 0) / 2) + 1, `Песок, h = ${f2(-M.top2(P.L / 2, P.W))}…${f2(-M.top2(P.L / 2, 0))}, с послойным уплотнением`, {a: 'middle', s: 2.7, h: true});
  s += T(X(tm), Y(M.top2(P.L / 2, tm) - P.t2 / 2) + 0.9, `Щебень 20×40, h = ${f2(P.t2)}`, {a: 'middle', s: 2.4, h: true});
  s += T(X(tm), Y(b + P.t1 / 2) + 0.9, `Щебень 40×70, h = ${f2(P.t1)}`, {a: 'middle', s: 2.6, h: true});
  const ang = -Math.atan(P.iCA / 100 * o.ky / o.kx) * 180 / Math.PI;
  s += T(X(tm), Y(b) + 4.2, `основание: снятие плодородного слоя, уклон i = ${f2(P.iCA / 100, 3)} к стороне А`, {a: 'middle', s: 2.5, rot: ang, h: true});
  s += T(X(14.8), Y(-P.drop) - 0.8, `существующий рельеф ${lvn(-P.drop)}`, {a: 'middle', s: 2.3, h: true});

  // узел А
  const n = {axis: 'x', pos: P.L - 0.1, t0: -2.2, t1: 2.0, kx: 40, ky: 40, X0: 25, Y0: 160, yBot: -1.9};
  const SN = section(n); const NX = SN.X, NY = SN.Y;
  s += T(25, 136, 'Узел А. Профиль канавы у угла 4', {s: 4, w: 700});
  s += T(25, 140.6, 'М 1:25 (на остальной длине глубина больше, см. таблицу на листе 1)', {s: 2.6});
  s += SN.s;
  const xb1 = -P.gap + M.e, xb2 = xb1 + M.bw, xt = -P.gap + M.wTop, yb = M.bot(P.L - 0.1);
  s += PL([[NX(-P.gap), NY(0)], [NX(xb1), NY(yb)], [NX(xb2), NY(yb)], [NX(xt), NY(0)]], 'gt');
  s += dimH(NX(-P.gap), NX(xt), NY(0) - 6, f2(M.wTop), NY(0), NY(0));
  s += dimH(NX(xt), NX(0), NY(0) - 6, f2(P.gap - M.wTop), null, NY(0));
  s += dimH(NX(-P.gap), NX(0), NY(0) - 12, f2(P.gap), NY(0) - 6, NY(0) - 6);
  s += dimH(NX(-P.gap), NX(xb1), NY(yb) + 8, f2(M.e), NY(0), NY(yb));
  s += dimH(NX(xb1), NX(xb2), NY(yb) + 8, f2(M.bw), null, NY(yb));
  s += dimH(NX(xb2), NX(xt), NY(yb) + 8, f2(M.e), null, NY(0));
  s += dimV(NX(-1.7), NY(0), NY(yb), f2(-yb), null, NX(xb1));
  s += lvl(NX(-2.0), NY(0), '0,00');
  s += lvl(NX((xb1 + xb2) / 2), NY(yb), lvn(yb));
  [0, M.top2(P.L - 0.1, 0), M.top1(P.L - 0.1, 0), M.base(P.L - 0.1, 0)].forEach(v => { s += lvl(NX(0.25), NY(v), lvn(v)); });
  s += T(NX(1.2), NY(M.top2(P.L, 0) / 2) + 1, 'песок', {a: 'middle', s: 2.4, h: true});
  s += T(NX(1.25), NY(M.top1(P.L, 0) + P.t2 / 2) + 0.9, '20×40', {a: 'middle', s: 2.3, h: true});
  s += T(NX(1.25), NY(M.base(P.L, 0) + P.t1 / 2) + 0.9, '40×70', {a: 'middle', s: 2.3, h: true});
  s += T(NX(-1.6), NY(-0.06), 'дорога', {a: 'middle', s: 2.3, h: true});
  s += leader(NX(xb1 - M.e * 0.5), NY(yb * 0.5), NX(0.1), NY(-1.55), 'крепление откосов: геотекстиль + щебень или лоток', {s: 2.3});
  s += T(25, 242, `Дно канавы у угла 4 (${lvn(yb)}) на ${f2(M.base(P.L, 0) - yb < 0 ? yb - M.base(P.L, 0) : 0)} выше низа щебня (${lvn(M.base(P.L, 0))}): вода`, {s: 2.6, fill: '#a2560a', w: 700});
  s += T(25, 246.5, `из щебня здесь не уйдёт в канаву. Рекомендуется глубина в мелком конце не менее 1,20.`, {s: 2.6, fill: '#a2560a', w: 700});
  s += T(25, 251, `Откосы 1:${f2(M.e / -yb)} — круче допустимого для песка (1:1,5), крепление обязательно.`, {s: 2.6, fill: '#a2560a', w: 700});

  // конструкция отсыпки
  s += T(205, 136, 'Конструкция отсыпки', {s: 4, w: 700});
  s += T(205, 140.6, 'М 1:20', {s: 2.6});
  s += pie(210, 150, 'у стороны С', M.base(0, P.W));
  s += pie(290, 150, 'у стороны А', M.base(0, 0));
  s += T(345, 150, 'Порядок работ', {s: 3.2, w: 700});
  ['1. Снять плодородный слой 0,10.', '2. Спланировать основание', `    с уклоном ${f2(P.iCA / 100, 3)} к стороне А.`, '3. Вырыть канавы, уклон дна', `    ${f2(P.iD / 100, 3)} к т.1, укрепить откосы.`,
    `4. Щебень 40×70, ${f2(P.t1)}, уплотнить.`, `5. Щебень 20×40, ${f2(P.t2)}, уплотнить.`, '6. Песок до 0,00, уплотнять', '    послойно.'].forEach((t, i) => { s += T(345, 156 + i * 4.6, t, {s: 2.6}); });
  return s;
}
function pie(x, y, title, base) {
  const k = 50; let s = '';
  const layers = [['sand', 0, base + P.t1 + P.t2, 'Песок'], ['g2', base + P.t1 + P.t2, base + P.t1, 'Щебень 20×40'], ['g1', base + P.t1, base, 'Щебень 40×70']];
  const w = 22;
  layers.forEach(([n, top, bot, name]) => {
    const y1 = y - top * k, y2 = y - bot * k;
    s += R(x, y1, w, y2 - y1, `fill="url(#${PAT[n]})" class="ly"`);
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
  const o = {axis: 'z', pos: P.W / 2, t0: -8, t1: 34, kx: 1000 / 150, ky: 40, X0: 40, Y0: 46, yBot: -1.9};
  const S2 = section(o); const {X, Y} = S2;
  s += T(30, 15, 'Разрез 2–2 (поперёк стороны Б, посередине участка)', {s: 4.2, w: 700});
  s += T(30, 19.6, 'М гор. 1:150, верт. 1:25', {s: 2.8});
  s += S2.s;
  s += dimH(X(-7), X(-1), Y(0) - 12, '6,00 (усл.)', Y(0), Y(0));
  s += dimH(X(-1), X(0), Y(0) - 12, f2(P.gap), null, Y(0));
  s += dimH(X(0), X(P.L), Y(0) - 12, f2(P.L), null, Y(0));
  s += T(X(-4), Y(0) - 16.5, 'Автодорога', {a: 'middle', s: 2.8});
  s += T(X(0), Y(0) - 16.5, 'Сторона Б', {a: 'middle', s: 2.8, w: 700});
  s += T(X(P.L), Y(0) - 16.5, 'Сторона D', {a: 'middle', s: 2.8, w: 700});
  s += lvl(X(-5), Y(0), '0,00');
  const zz = P.W / 2, hb = M.hGap(-P.gap + M.wTop / 2, zz);
  s += leader(X(-P.gap + M.wTop / 2), Y(hb), X(-3), Y(-1.55), `дно канавы ${lvn(hb)}`, {right: false});
  const lv4 = [0, M.top2(0, zz), M.top1(0, zz), M.base(0, zz)];
  lv4.forEach(v => { s += lvl(X(1), Y(v), lvn(v)); });
  lv4.forEach(v => { s += L(X(P.L), Y(v), X(33), Y(v), 'ld') + lvl(X(33), Y(v), lvn(v)); });
  s += T(X(15.5), Y(M.top2(15.5, zz) / 2) + 1, `Песок, h = ${f2(-M.top2(15.5, zz))}`, {a: 'middle', s: 2.7, h: true});
  s += T(X(15.5), Y(M.top1(15.5, zz) + P.t2 / 2) + 0.9, `Щебень 20×40, h = ${f2(P.t2)}`, {a: 'middle', s: 2.4, h: true});
  s += T(X(15.5), Y(M.base(15.5, zz) + P.t1 / 2) + 0.9, `Щебень 40×70, h = ${f2(P.t1)}`, {a: 'middle', s: 2.6, h: true});
  s += T(X(15.5), Y(M.base(15.5, zz)) + 4.2, P.iDB > 0 ? `основание, уклон i = ${f2(P.iDB / 100, 3)} к стороне Б` : 'основание вдоль стороны А горизонтально (уклон только от С к А)', {a: 'middle', s: 2.5, h: true});
  s += T(X(24), Y(-P.drop) - 0.8, `существующий рельеф ${lvn(-P.drop)}`, {a: 'middle', s: 2.3, h: true});

  // ведомость объёмов
  s += T(25, 132, 'Ведомость объёмов работ и материалов', {s: 4, w: 700});
  const rows = [['№', 'Наименование', 'Ед.', 'В деле', 'К заказу', '≈ т']];
  const add = (name, v, k, rho) => rows.push([String(rows.length), name, 'м³', f2(v, 1), k ? f2(v * k, 1) : '—', rho ? f2(v * k * rho, 0) : '—']);
  add(`Снятие плодородного слоя ${f2(P.strip)}`, ST.vTop);
  add('Доп. выемка грунта под уклон основания', ST.vExtra);
  add('Выемка грунта из канав (ниже сущ. рельефа)', ST.exc);
  add('Отсыпка бермы и бортов канав', ST.bank);
  add(`Щебень 40×70, слой ${f2(P.t1)}`, ST.v1, K_STONE, RHO.g1);
  add(`Щебень 20×40, слой ${f2(P.t2)}`, ST.v2, K_STONE, RHO.g2);
  add(`Песок, слой ${f2(-M.top2(0, P.W))}…${f2(-M.top2(0, 0))}`, ST.vSand, K_SAND, RHO.sand);
  s += table(25, 136, [9, 92, 12, 26, 26, 22], rows, {rh: 6, s: 2.7, left: [0, 1]});
  s += T(25, 191, `К заказу = в деле × коэффициент уплотнения (щебень ${f2(K_STONE, 1)}, песок ${f2(K_SAND, 1)}).`, {s: 2.5});
  s += T(25, 195.5, `Насыпная плотность: 40×70 — ${f2(RHO.g1)}, 20×40 — ${f2(RHO.g2)}, песок — ${f2(RHO.sand)} т/м³. Уточнить у поставщика.`, {s: 2.5});

  // примечания
  s += T(235, 132, 'Примечания', {s: 4, w: 700});
  const notes = [
    'Отметки и размеры в метрах. Условный 0,00 — покрытие',
    'автодороги. Участок исходно ниже дороги на 0,60.',
    `Площадь по размерам ${f2(P.L)} × ${f2(P.W)} = ${f2(ST.S, 0)} м² (не 600 м²).`,
    `Плодородный слой снимается на ${f2(P.strip)} у стороны С; основание`,
    `планируется с уклоном ${f2(P.iCA / 100, 3)} к стороне А (у А выемка ${f2(P.strip + P.iCA / 100 * P.W)}).`,
    'Подъём до 0,00: 0,60 + 0,10 = 0,70 = 0,20 + 0,10 + 0,40',
    '(на стороне С). К стороне А слой песка растёт до 0,78.',
    `Канавы вдоль сторон А и Б: ${f2(M.wTop)} по верху от края дороги,`,
    `берма ${f2(P.gap - M.wTop)} у границы, дно с уклоном ${f2(P.iD / 100, 3)} к т.1 (угол 1).`,
    'Глубина 1,00 от покрытия дороги — в мелком конце (угол 4).',
    'Рекомендуется 1,20: иначе у угла 4 дно выше низа щебня.',
    'Откосы канав круче 1:1 — нужно крепление (геотекстиль +',
    'щебень, габионы или ж/б лоток).',
    'Сброс воды из т.1 (колодец, труба, кювет) — по месту,',
    'в задании не определён.',
    'Слои отсыпать с послойным уплотнением.',
    'Ширина автодороги на чертеже условная.',
  ];
  let num = 0;
  const starts = [0, 2, 3, 5, 7, 9, 11, 13, 15, 16];
  notes.forEach((t, i) => { const isStart = starts.includes(i); if (isStart) num++; s += T(isStart ? 235 : 239.5, 138 + i * 5, isStart ? `${num}. ${t}` : t, {s: 2.7}); });
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
    <h1>Чертёж участка 31 × 19 м</h1>
    <p>3 листа А3: план, разрезы, узел канавы, ведомость объёмов. Отметки в метрах от покрытия автодороги.</p>
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
