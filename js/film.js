// ZUFA scroll film: a Cycles-rendered day, packed into WebP sprite sheets and scrubbed on a canvas.
// lo sheets (4x4 small frames) load first so the whole film is scrubbable quickly; hd sheets (2x2) stream in
// nearest-first around the reader's position and replace the small frames as they arrive.

// where the subject sits in each shot (the camera's lens shift leaves room for the copy): -1 left, 0 centre, 1 right
const SIDE = { sky: 0, overview: 1, forestLow: -1, arrival: 1, avenues: -1, club: 1, quarter: -1, half: 1, buildWide: -1,
  villaQ: 1, villaH: 1, farm: -1, buildWide2: -1, avenues2: 1, arrivalNight: -1, nightSky: 0, finale: 0 };

export class Film {
  constructor(canvas, base = 'film/') {
    this.cv = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.base = base; this.cur = 0; this.target = 0; this.dirty = true; this.active = 0;
    this.useHD = !(navigator.connection && navigator.connection.saveData);
    addEventListener('resize', () => this.resize());
  }

  async init(onProgress = () => {}) {
    const res = await fetch(this.base + 'film.json'); if (!res.ok) throw new Error('film.json ' + res.status);
    const m = this.m = await res.json();
    this.N = m.frames; this.lo = new Array(m.lo.sheets); this.hd = new Array(m.hd.sheets);
    this.side = new Float32Array(this.N);
    for (let j = 0; j < m.keys.length - 1; j++) {
      const a = m.keys[j] - 1, b = m.keys[j + 1] - 1, sa = SIDE[m.cams[j]] || 0, sb = SIDE[m.cams[j + 1]] || 0;
      for (let f = a; f <= b; f++) { const t = (f - a) / Math.max(1, b - a), e = t * t * (3 - 2 * t); this.side[f] = sa + (sb - sa) * e; }
    }
    this.resize();
    const first = 1; let n = 0;                      // the opening shot; the rest streams in behind the intro
    await Promise.all(Array.from({ length: first }, (_, i) => this._load('lo', i).then(() => onProgress(++n / first))));
    for (let i = 0; i < 4; i++) this._pump();
    const loop = () => { requestAnimationFrame(loop); this._tick(); }; loop();
    return this;
  }

  /* frame number (1-based, as in Blender) of each shot */
  get keys() { return this.m.keys; }
  set(frame) { this.target = Math.max(0, Math.min(this.N - 1, frame - 1)); }
  snap() { this.cur = this.target; this.dirty = true; }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    this.cv.width = Math.round(innerWidth * dpr); this.cv.height = Math.round(innerHeight * dpr); this.dirty = true;
  }

  _load(kind, i) {
    if (this[kind][i]) return this[kind][i].p;
    const img = new Image(), e = { img, ok: false };
    img.decoding = 'async';
    e.p = new Promise(r => {
      img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => { e.ok = true; this.dirty = true; r(); });
      img.onerror = () => { e.err = true; r(); };
    });
    img.src = `${this.base}${kind}/s${String(i).padStart(3, '0')}.webp`;
    this[kind][i] = e; this.active++;
    e.p.then(() => { this.active--; this._pump(); });
    return e.p;
  }
  // next sheet to fetch: the small set first (nearest the reader), then hd nearest-first
  _pump() {
    if (this.active >= 4) return;
    const f = Math.round(this.target), pick = (arr, per) => {
      let best = -1, bd = 1e9; for (let i = 0; i < arr.length; i++) { if (arr[i]) continue; const d = Math.abs(i * per + per / 2 - f) + (i * per + per / 2 < f ? per : 0); if (d < bd) { bd = d; best = i; } } return best; };
    let i = pick(this.lo, this.m.lo.per); if (i >= 0) return this._load('lo', i);
    if (!this.useHD) return;
    // hd only in a window around the reader; far sheets are released so decoded pixels stay bounded (phones especially)
    const per = this.m.hd.per, cs = (f / per) | 0, R = matchMedia('(max-width: 899px)').matches ? 6 : 12;
    for (let j = 0; j < this.hd.length; j++) { const e = this.hd[j]; if (e && e.ok && Math.abs(j - cs) > R + 4) { e.img.src = ''; this.hd[j] = undefined; } }
    i = pick(this.hd, per); if (i >= 0 && Math.abs(i - cs) <= R) return this._load('hd', i);
  }

  _src(f) {
    const H = this.m.hd, L = this.m.lo;
    const h = this.hd[(f / H.per) | 0]; if (h && h.ok) { const k = f % H.per; return { img: h.img, sx: (k % H.cols) * H.w, sy: ((k / H.cols) | 0) * H.h, w: H.w, h: H.h }; }
    const l = this.lo[(f / L.per) | 0]; if (l && l.ok) { const k = f % L.per; return { img: l.img, sx: (k % L.cols) * L.w, sy: ((k / L.cols) | 0) * L.h, w: L.w, h: L.h }; }
    return null;
  }

  _tick() {
    const now = performance.now(), dt = Math.min(1, ((now - (this._t || now)) / 1000)); this._t = now;
    const d = this.target - this.cur;
    if (Math.abs(d) > 0.002) { this.cur += d * (1 - Math.pow(3e-7, dt)); this.dirty = true; } else if (d !== 0) { this.cur = this.target; this.dirty = true; }
    if (!this.dirty) return; this.dirty = false;
    const c = this.ctx, W = this.cv.width, Hh = this.cv.height, i = Math.floor(this.cur), t = this.cur - i;
    const portrait = W / Hh < 1;
    // portrait screens: the film fills the top ~72% and dissolves into ink behind the copy
    const fh = portrait ? Hh * 0.72 : Hh, s = Math.max(W / 16, fh / 9), dw = 16 * s, dh = 9 * s;
    const focus = 0.5 + 0.12 * (this.side[Math.min(this.N - 1, Math.round(this.cur))] || 0);
    let dx = W / 2 - focus * dw; dx = Math.min(0, Math.max(W - dw, dx));
    if (!portrait) dx = (W - dw) / 2;
    const dy = portrait ? 0 : (Hh - dh) / 2;
    let a = this._src(i), b = t > 0.01 && i + 1 < this.N ? this._src(i + 1) : null;
    if (!a) { a = this._near(i); b = null; if (!a) return; }
    c.globalAlpha = 1; c.drawImage(a.img, a.sx, a.sy, a.w, a.h, dx, dy, dw, dh);
    if (b) { c.globalAlpha = t; c.drawImage(b.img, b.sx, b.sy, b.w, b.h, dx, dy, dw, dh); c.globalAlpha = 1; }
    if (portrait) {
      const g = c.createLinearGradient(0, fh * 0.62, 0, fh);
      g.addColorStop(0, 'rgba(15,14,12,0)'); g.addColorStop(1, 'rgba(15,14,12,1)');
      c.fillStyle = g; c.fillRect(0, fh * 0.62, W, fh * 0.38 + 1); c.fillStyle = '#0f0e0c'; c.fillRect(0, fh, W, Hh - fh);
    }
    this._pump();
  }
  // nothing decoded for this frame yet: show the closest frame we do have
  _near(i) {
    for (let r = 1; r < this.N; r++) for (const j of [i - r, i + r]) { if (j >= 0 && j < this.N) { const s = this._src(j); if (s) return s; } }
    return null;
  }
}
