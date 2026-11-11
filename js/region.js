// "The bigger picture": a schematic motion-graphic map of the Chevella corridor, drawn over the night film.
// Coordinates: 1 km ≈ 100 units, x east, y south (same schematic as the earlier 3D map). Not to scale.
const RG = {
  zufa: [0, 0], C: [7500, -300], orr: 2500, rrr: 6400,
  appa: [5085, 347], chevella: [2000, 150], dc: [2200, -380], airport: [7300, 1900],
  road: [[-60, 240], [380, 90], [2000, 150], [3600, 300], [5085, 347]],
  airRoad: [[5085, 347], [6000, 1250], [7300, 1900]],
  train: [[12500, -700], [7500, -300], [4500, -1500], [1500, -2350], [-4500, -3100]],
};
const ROUTES = [ // [key, points | circle, colour, step, width, dashed]
  ['orr', 'orr', '#e2bf86', 0, 2.2],
  ['road', RG.road, '#f3d7a8', 0, 2.6],
  ['rrr', 'rrr', '#9fd0ff', 2, 2.2, true],
  ['widen', RG.road.slice(1), '#ffb36b', 3, 7],
  ['air', RG.airRoad, '#c7a6ff', 4, 2.6],
  ['train', RG.train, '#7ef0d8', 5, 2.6],
];
const LABELS = [ // [html, at, step, class]
  ['<b>Hyderabad</b>', [RG.C[0], RG.C[1] + 120], 0, 'rm-l--city'],
  ['Outer Ring Road', [RG.C[0] - 300, RG.C[1] - RG.orr - 180], 0, ''],
  ['ORR Exit 18 · Appa', [RG.appa[0], RG.appa[1] + 230], 0, ''],
  ['Chevella', [RG.chevella[0], RG.chevella[1] + 220], 0, ''],
  ['Chevella Road · 50 km · 45 min drive', [3000, 760], 0, 'rm-l--road'],
  ['<em>01</em> Data Centre City', [RG.dc[0], RG.dc[1] - 520], 1, 'rm-l--dev'],
  ['<em>02</em> Regional Ring Road', [RG.C[0] - RG.rrr * .9, RG.C[1] - RG.rrr * .42], 2, 'rm-l--dev'],
  ['<em>03</em> New 200-ft road expansion', [3700, -330], 3, 'rm-l--dev'],
  ['<em>04</em> Shamshabad Airport', [RG.airport[0], RG.airport[1] + 520], 4, 'rm-l--dev'],
  ['<em>05</em> Bullet train road', [1500, -2780], 5, 'rm-l--dev'],
];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const NS = 'http://www.w3.org/2000/svg';

export class RegionMap {
  constructor(el) {
    this.el = el; this.rf = -1; this.reg = -1;
    el.innerHTML = `<svg class="rm-svg" aria-hidden="true"></svg><div class="rm-labels"></div>`;
    this.svg = el.querySelector('svg'); this.lab = el.querySelector('.rm-labels');
    this.labels = LABELS.map(([html, at, step, cls]) => { const d = document.createElement('div'); d.className = 'rm-l ' + cls; d.innerHTML = html; this.lab.append(d); return { d, at, step }; });
    this.zufa = document.createElement('div'); this.zufa.className = 'rm-zufa'; this.zufa.innerHTML = '<i></i><b>ZUFA</b><span>Your land</span>'; this.lab.append(this.zufa);
    addEventListener('resize', () => this.layout()); this.layout();
  }
  layout() {
    const W = innerWidth, H = innerHeight, portrait = W < H;
    // frame the corridor from ZUFA to the city; portrait screens keep the copy area at the bottom free
    const box = portrait ? { x0: -900, x1: 10600, y0: -3300, y1: 2700 } : { x0: -2600, x1: 14600, y0: -4100, y1: 3000 };
    const aw = W * (portrait ? .96 : .9), ah = H * (portrait ? .5 : .62);
    const s = Math.min(aw / (box.x1 - box.x0), ah / (box.y1 - box.y0));
    const ox = W / 2 - s * (box.x0 + box.x1) / 2, oy = H * (portrait ? .34 : .42) - s * (box.y0 + box.y1) / 2;
    this.P = ([x, y]) => [ox + x * s, oy + y * s]; this.s = s;
    this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const P = this.P, svg = this.svg; svg.innerHTML = '';
    const defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = '<filter id="rmGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '<radialGradient id="rmCity"><stop offset="0" stop-color="#ffc98a" stop-opacity=".38"/><stop offset="1" stop-color="#ffc98a" stop-opacity="0"/></radialGradient>';
    svg.append(defs);
    // faint km grid
    const grid = document.createElementNS(NS, 'path'); let gd = '';
    for (let x = -5000; x <= 16000; x += 1000) { const [a] = P([x, 0]); gd += `M${a.toFixed(1)} 0V${H}`; }
    for (let y = -5000; y <= 5000; y += 1000) { const [, b] = P([0, y]); gd += `M0 ${b.toFixed(1)}H${W}`; }
    grid.setAttribute('d', gd); grid.setAttribute('class', 'rm-grid'); svg.append(grid);
    const city = document.createElementNS(NS, 'circle'); const [cx, cy] = P(RG.C);
    city.setAttribute('cx', cx); city.setAttribute('cy', cy); city.setAttribute('r', 2300 * s); city.setAttribute('fill', 'url(#rmCity)'); svg.append(city);
    // data centre city and airport blocks
    this.dc = this._blocks(RG.dc, 6, 6, 120, 95, '#5fd4ff');
    this.air = document.createElementNS(NS, 'g');
    for (const dz of [-90, 90]) { const r = document.createElementNS(NS, 'rect'); const [ax, ay] = P([RG.airport[0], RG.airport[1] + dz]);
      r.setAttribute('x', ax - 750 * s); r.setAttribute('y', ay - 22 * s); r.setAttribute('width', 1500 * s); r.setAttribute('height', Math.max(2, 45 * s)); r.setAttribute('fill', '#c7a6ff');
      r.setAttribute('transform', `rotate(20 ${ax} ${ay})`); this.air.append(r); }
    svg.append(this.air);
    this.routes = ROUTES.map(([k, pts, col, step, w, dashed]) => {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', pts === 'orr' || pts === 'rrr' ? this._circle(RG.C, RG[pts]) : this._curve(pts));
      p.setAttribute('pathLength', '1'); p.setAttribute('fill', 'none'); p.setAttribute('stroke', col); p.setAttribute('stroke-width', w);
      p.setAttribute('stroke-linecap', 'round'); p.setAttribute('filter', 'url(#rmGlow)'); p.setAttribute('class', 'rm-route' + (k === 'widen' ? ' rm-route--wide' : ''));
      p.style.strokeDasharray = '1 1'; svg.append(p);
      let dash = null; if (dashed) { dash = document.createElementNS(NS, 'path'); dash.setAttribute('d', p.getAttribute('d')); dash.setAttribute('fill', 'none'); dash.setAttribute('stroke', '#0f0e0c'); dash.setAttribute('stroke-width', w + 1.5); dash.setAttribute('stroke-dasharray', '6 9'); svg.append(dash); }
      return { p, step, dash };
    });
    this.labels.forEach(l => { const [x, y] = P(l.at); l.d.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%)`; });
    const [zx, zy] = P(RG.zufa); this.zufa.style.transform = `translate(${zx.toFixed(1)}px,${zy.toFixed(1)}px)`;
    this.rf = -1; this.update(this._rf || 0, this._reg || 0);
  }
  _blocks(at, nx, ny, dx, dy, col) {
    const g = document.createElementNS(NS, 'g'), s = this.s;
    for (let i = 0; i < nx * ny; i++) { const r = document.createElementNS(NS, 'rect'); const [x, y] = this.P([at[0] + (i % nx) * dx - 300, at[1] + Math.floor(i / nx) * dy - 240]);
      r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', Math.max(1.5, 70 * s)); r.setAttribute('height', Math.max(1.5, 60 * s)); r.setAttribute('fill', col); g.append(r); }
    this.svg.append(g); return g;
  }
  _circle(c, r) { const [x, y] = this.P(c), R = r * this.s; return `M${x + R} ${y}A${R} ${R} 0 1 1 ${x - R} ${y}A${R} ${R} 0 1 1 ${x + R} ${y}`; }
  _curve(pts) { // Catmull-Rom through the points, as cubic Béziers
    const q = pts.map(this.P); let d = `M${q[0][0].toFixed(1)} ${q[0][1].toFixed(1)}`;
    for (let i = 0; i < q.length - 1; i++) { const p0 = q[i - 1] || q[i], p1 = q[i], p2 = q[i + 1], p3 = q[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1.map(v => v.toFixed(1)).join(' ')} ${c2.map(v => v.toFixed(1)).join(' ')} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`; }
    return d;
  }
  // rf: 0..1 how much of the map is shown; reg: 0..5 which development step we're on
  update(rf, reg) {
    this._rf = rf; this._reg = reg;
    if (Math.abs(rf - this.rf) < 1e-3 && Math.abs(reg - this.reg) < 1e-3) return; this.rf = rf; this.reg = reg;
    this.el.style.opacity = rf.toFixed(3); this.el.style.visibility = rf < .005 ? 'hidden' : 'visible';
    const prog = step => step === 0 ? clamp((rf - .2) / .7) : clamp(reg - step + 1);
    for (const r of this.routes) { const k = prog(r.step); r.p.style.strokeDashoffset = (1 - k).toFixed(4); r.p.style.opacity = k > 0 ? 1 : 0; if (r.dash) r.dash.style.opacity = k > .98 ? 1 : 0; }
    this.dc.style.opacity = prog(1); this.air.style.opacity = prog(4);
    this.labels.forEach(l => l.d.classList.toggle('is-on', rf > .55 && (l.step === 0 || reg >= l.step - .35)));
    this.zufa.classList.toggle('is-on', rf > .3);
  }
}
