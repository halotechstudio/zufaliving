// ZUFA Living — "One day at ZUFA": scroll story controller
import { PLOTS } from './site-data.js';

/* ---- Site config: fill these in before launch ---- */
const CONFIG = {
  enquiryEmail: '',   // e.g. 'sales@yourdomain.com' — form opens a pre-filled email to this address
  whatsapp: '',       // e.g. '9198XXXXXXXX' — if set, form opens a WhatsApp chat instead
  ratePerSqYd: 5000,
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => matchMedia('(max-width: 899px)').matches;
const CAT_LABEL = { quarter: 'Quarter acre', half: 'Half acre', signature: 'Signature estate', bespoke: 'Bespoke size' };
const fmtIN = n => Math.round(n).toLocaleString('en-IN');
const rupees = n => n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : `₹${(n / 1e5).toFixed(2).replace(/\.?0+$/, '')} L`;
// Marketing prices: standard plots at their rounded figure, others rounded down to the nearest lakh.
const ROUNDED = { quarter: 60e5, half: 120e5 };
const price = p => (p.sqyd === 1210 || p.sqyd === 2420) ? ROUNDED[p.sqyd === 1210 ? 'quarter' : 'half'] : Math.floor(p.sqyd * CONFIG.ratePerSqYd / 1e5) * 1e5;
const hhmm = h => { h = ((h % 24) + 24) % 24; const m = Math.round((h % 1) * 60 / 5) * 5; return `${String(Math.floor(h) + (m === 60 ? 1 : 0)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const dayPart = h => h < 5.5 ? 'Night' : h < 7.5 ? 'Dawn' : h < 11.5 ? 'Morning' : h < 15.5 ? 'Afternoon' : h < 18.3 ? 'Golden hour' : h < 20 ? 'Dusk' : 'Night';

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);
document.documentElement.classList.add('js');
document.body.classList.add('is-hero', 'is-loading');

const { gsap, ScrollTrigger } = window;
gsap.registerPlugin(ScrollTrigger);

/* ---------------- smooth scroll ---------------- */
let lenis = null;
if (!reduce && window.Lenis) {
  lenis = new window.Lenis({ lerp: 0.075, smoothWheel: true, wheelMultiplier: .85 });
  lenis.on('scroll', () => { ScrollTrigger.update(); onScroll(); });
  gsap.ticker.add(t => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0);
} else addEventListener('scroll', () => onScroll(), { passive: true });
const scrollToEl = (el, opts = {}) => { const y = el.offsetTop + el.offsetHeight / 2 - innerHeight / 2; lenis ? lenis.scrollTo(Math.max(0, y), { duration: 2.2, ...opts }) : scrollTo({ top: y, behavior: 'smooth' }); };
$$('a[href^="#"]').forEach(a => a.addEventListener('click', e => { const t = $(a.getAttribute('href')); if (!t) return; e.preventDefault(); if (a.getAttribute('href') === '#top') { lenis ? lenis.scrollTo(0, { duration: 2.4 }) : scrollTo({ top: 0, behavior: 'smooth' }); return; } scrollToEl(t); }));

/* ---------------- beats ---------------- */
const beats = $$('.beat').map(el => ({
  el, inner: $('.beat__in, .final, .hero__content', el),
  cam: el.dataset.cam, hour: +(el.dataset.hour || 6), build: +(el.dataset.build || 0), region: +(el.dataset.region || 0), reg: +(el.dataset.reg || 0),
  hl: el.dataset.hl ? el.dataset.hl.split(',') : null, ch: +(el.dataset.ch ?? -1),
  side: el.classList.contains('beat--right') ? -1 : el.classList.contains('beat--center') || el.classList.contains('beat--final') || el.classList.contains('beat--hero') || el.classList.contains('beat--low') ? 0 : 1,
  low: el.classList.contains('beat--low') ? 1 : 0,
  c: 0,
}));
const measure = () => beats.forEach(b => { b.c = b.el.offsetTop + b.el.offsetHeight / 2; });
// hero beat: anchor the 3D at the top of the page
const heroMedia = $('[data-hero]'), heroContent = $('.hero__content'), railLinks = $$('.rail a');
let world = null, film = null, rmap = null, curCh = -2, lastClock = '';
const clock = $('[data-clock]'), clockL = $('[data-clock-label]');
const story = { hour: 5.9, region: 0 };

function storyState() {
  const y = (lenis ? lenis.scroll : scrollY) + innerHeight / 2;
  let i = 0; while (i < beats.length - 1 && beats[i + 1].c <= y) i++;
  const A = beats[i], B = beats[Math.min(i + 1, beats.length - 1)];
  const raw = B === A ? 0 : clamp((y - A.c) / (B.c - A.c)), k = clamp((raw - .18) / .64);
  return { i, A, B, k, raw, y };
}
// film frame for every beat: shots in the film map to their keyframe; the region beats (2D map) sit on the night crane
function mapBeatsToFilm() {
  const { keys, cams } = film.m; let j = 0;
  beats.forEach(b => { const at = cams.indexOf(b.cam, j); if (at >= 0) { b.f = keys[at]; j = at; } else b.f = null; });
  for (let i = 0; i < beats.length; i++) { if (beats[i].f !== null) continue;
    let a = i; while (a > 0 && beats[a].f === null) a--; let z = i; while (z < beats.length - 1 && beats[z].f === null) z++;
    const span = z - a; beats[i].f = beats[a].f + (beats[z].f - beats[a].f) * (i - a) / span; }
}
function onScroll() {
  const sy = lenis ? lenis.scroll : scrollY, vh = innerHeight;
  // hero dissolve
  const hp = clamp(sy / (vh * .95));
  heroMedia.style.opacity = 1 - sstep(.05, 1, hp); heroMedia.style.transform = `scale(${1 + hp * .12})`;
  heroContent.style.opacity = 1 - sstep(0, .55, hp); heroContent.style.transform = `translateY(${-hp * 80}px)`;
  document.body.classList.toggle('is-hero', hp < .6);
  // beat text: fade by distance from viewport centre
  for (const b of beats) { if (!b.inner || b.el.classList.contains('beat--hero')) continue;
    const r = b.el.getBoundingClientRect(), d = (r.top + r.height / 2 - vh / 2) / vh;
    const last = b === beats[beats.length - 1];
    const o = last ? 1 - sstep(.3, .65, d) : 1 - sstep(.22, .5, Math.abs(d));
    b.inner.style.opacity = o.toFixed(3); b.inner.style.transform = `translateY(${(d * -50).toFixed(1)}px)`; b.inner.style.visibility = o < .01 ? 'hidden' : 'visible'; }
  if (document.body.classList.contains('is-exploring')) return;
  const { A, B, k, raw } = storyState();
  // the film follows the scroll continuously (it eases into each shot by itself); hour/map follow the beat easing
  if (film && A.f != null) film.set(lerp(A.f, B.f, clamp((raw - .08) / .84)));
  story.hour = lerp(A.hour, B.hour, k); story.region = lerp(A.region, B.region, k);
  if (rmap) rmap.update(clamp(story.region), lerp(A.reg, B.reg, k));
  const s = hhmm(story.hour); if (s !== lastClock) { lastClock = s; clock.textContent = s; clockL.textContent = dayPart(story.hour); }
  const ch = k < .5 ? A.ch : B.ch;
  if (ch !== curCh) { curCh = ch; railLinks.forEach((a, j) => a.classList.toggle('is-active', j === ch)); }
}
railLinks.forEach(a => a.addEventListener('click', e => { e.preventDefault(); const t = $(a.getAttribute('href')); if (t) scrollToEl(t); }));

/* ---------------- loader + intro ---------------- */
const hw = $('.hero__word'); hw.innerHTML = [...hw.textContent].map(c => `<span class="ch">${c}</span>`).join('');
const pct = $('.loader__pct'), load = { v: 0 };
const setLoad = () => { pct.textContent = Math.round(load.v); gsap.set('.loader__line i', { scaleX: load.v / 100 }); };
gsap.to('.loader__mark span', { y: 0, duration: 1.1, ease: 'expo.out', stagger: .07, delay: .1 });
const tl = gsap.to(load, { v: 80, duration: 2.4, ease: 'power2.out', onUpdate: setLoad });
const heroImg = $('.hero__media img');
const imgReady = heroImg.complete ? Promise.resolve() : new Promise(r => { heroImg.onload = r; heroImg.onerror = r; });
const filmReady = Promise.all([import('./film.js'), import('./region.js')]).then(async ([{ Film }, { RegionMap }]) => {
  rmap = new RegionMap($('[data-region-map]'));
  film = await new Film($('[data-film]')).init(p => { load.v = Math.max(load.v, 80 * p); setLoad(); });
  mapBeatsToFilm(); measure(); onScroll(); film.snap(); window.zufa = { film, lenis, get world() { return world; } };
}).catch(err => console.error(err));

// the real-time 3D world (explorer + Villa Studio) loads only when someone asks for it
let worldLoading = null;
function getWorld() {
  if (world) return Promise.resolve(world);
  if (worldLoading) return worldLoading;
  const wl = $('[data-wload]'); wl.classList.add('is-on');
  worldLoading = import('./world.js').then(({ World }) => {
    const compass = $('[data-compass]');
    world = new World($('[data-canvas]'), { onSelect: showPlot, onHover: hoverPlot, onFrame: a => { compass.style.transform = `rotate(${a}rad)`; } });
    world.setStory({ a: 'overview', b: 'overview', k: 0, hour: clamp(story.hour, 7, 20), build: 0, region: 0, reg: 0, hl: null }); world.snap();
    return new Promise(r => setTimeout(r, 400)).then(() => world);
  }).catch(err => { console.error(err); worldLoading = null;
    $('[data-canvas]').innerHTML = '<p style="position:absolute;inset:auto 0 40% 0;text-align:center;color:#cbbfae">The interactive masterplan needs WebGL, which isn’t available in this browser.</p>'; throw err;
  }).finally(() => wl.classList.remove('is-on'));
  return worldLoading;
}
Promise.all([imgReady, document.fonts?.ready, filmReady, new Promise(r => setTimeout(r, 900))]).then(() => {
  tl.kill();
  gsap.timeline()
    .to(load, { v: 100, duration: .5, ease: 'power2.inOut', onUpdate: setLoad })
    .to('.loader__mark span', { y: '-105%', duration: .8, ease: 'expo.in', stagger: .05 }, '+=.1')
    .to('.loader', { clipPath: 'inset(0 0 100% 0)', duration: 1.1, ease: 'expo.inOut' }, '-=.35')
    .add(() => { document.body.classList.remove('is-loading'); $('.loader').remove(); measure(); onScroll(); })
    .fromTo('.hero__media img', { scale: 1.2 }, { scale: 1, duration: 2.6, ease: 'expo.out' }, '-=.9')
    .to('.hero__word .ch', { y: 0, duration: 1.4, ease: 'expo.out', stagger: .08 }, '-=2.3')
    .from(['.hero__content .eyebrow', '.hero__lede', '.hero__tag', '.hero__cue'], { y: 24, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: .1 }, '-=1.4')
    .from('.nav', { y: -24, opacity: 0, duration: 1, ease: 'expo.out', clearProps: 'opacity,transform' }, '-=1');
});
addEventListener('resize', () => { measure(); onScroll(); });
addEventListener('load', () => { measure(); onScroll(); });

/* ---------------- headline reveals ---------------- */
if (!reduce) $$('.beat__h, .beat__h3').forEach(h => {
  const walk = n => [...n.childNodes].forEach(c => { if (c.nodeType === 3) { const f = document.createDocumentFragment(); c.textContent.split(/(\s+)/).forEach(w => { if (!w) return; if (/^\s+$/.test(w)) return f.append(w); const s = document.createElement('span'); s.className = 'w'; s.innerHTML = `<span>${w}</span>`; f.append(s); }); c.replaceWith(f); } else if (c.nodeType === 1) walk(c); });
  walk(h);
  gsap.fromTo($$('.w > span', h), { yPercent: 110 }, { yPercent: 0, duration: 1.2, ease: 'expo.out', stagger: .04, scrollTrigger: { trigger: h, start: 'top bottom-=20', toggleActions: 'play none none reverse' } });
});

/* ---------------- cursor ---------------- */
const cur = $('.cursor');
if (matchMedia('(hover:hover) and (pointer:fine)').matches && !reduce) {
  const xTo = gsap.quickTo(cur, 'x', { duration: .35, ease: 'power3' }), yTo = gsap.quickTo(cur, 'y', { duration: .35, ease: 'power3' });
  addEventListener('pointermove', e => { xTo(e.clientX); yTo(e.clientY); });
  document.addEventListener('pointerover', e => cur.classList.toggle('is-hover', !!e.target.closest('a,button,select,input,.rail a')));
}

/* ---------------- explorer ---------------- */
const panel = $('[data-panel]'), tip = $('[data-tip]'), list = $('[data-list]'), timeIn = $('[data-time]'), timeOut = $('[data-time-out]');
let exFilter = 'all';
function renderList() {
  list.innerHTML = PLOTS.filter(p => exFilter === 'all' || p.cat === exFilter).map(p =>
    `<button data-pick="${p.id}"><b>${String(p.id).padStart(2, '0')}</b><span>${CAT_LABEL[p.cat]}<small>${fmtIN(p.sqyd)} sq. yd · ${fmtIN(p.sqyd * 9)} sft</small></span><em>${rupees(price(p))}</em></button>`).join('');
}
renderList();
list.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) world.select(+b.dataset.pick, true); });
panel.setAttribute('data-lenis-prevent', '');
async function openExplorer(id) {
  lenis?.stop();
  try { await getWorld(); } catch { lenis?.start(); return; }
  world.resume(); world.setHour(story.hour > 18.6 ? 10 : clamp(story.hour, 7, 18.6)); world.snap();
  document.body.classList.add('is-exploring'); $('[data-explorer]').setAttribute('aria-hidden', 'false');
  world.setViewOffset(...(isMobile() ? [0, .12] : [-.1, 0])); world.setMode('explore');
  const h = clamp(world.stT.hour, 6, 22); timeIn.value = h; timeOut.textContent = hhmm(h);
  if (id) setTimeout(() => world.select(id, true), 1650);
}
function closeExplorer() {
  document.body.classList.remove('is-exploring'); $('[data-explorer]').setAttribute('aria-hidden', 'true'); lenis?.start();
  tip.hidden = true; showPlot(null); world.setMode('story'); exFilter = 'all'; renderList();
  $$('[data-filter]').forEach(b => b.classList.toggle('is-on', b.dataset.filter === 'all')); onScroll();
  setTimeout(() => { if (!document.body.classList.contains('is-exploring')) world.pause(); }, 1000);
}
$$('[data-explore]').forEach(b => b.addEventListener('click', () => openExplorer()));
$('[data-close]').addEventListener('click', closeExplorer);
addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('is-exploring')) closeExplorer(); });
$('[data-reset]').addEventListener('click', () => world.resetView());
timeIn.addEventListener('input', () => { const h = +timeIn.value; world.setHour(h); timeOut.textContent = hhmm(h); });
$$('[data-filter]').forEach(b => b.addEventListener('click', () => { exFilter = b.dataset.filter; $$('[data-filter]').forEach(x => x.classList.toggle('is-on', x === b)); world.setFilter(exFilter); renderList();
  if (world.selected && exFilter !== 'all' && PLOTS[world.selected - 1].cat !== exFilter) world.select(null); }));
$$('[data-villa]').forEach(b => b.addEventListener('click', () => { $$('[data-villa]').forEach(x => x.classList.toggle('is-on', x === b)); world.showVilla(b.dataset.villa); }));
$('[data-back]').addEventListener('click', () => world.select(null));

function showPlot(p) {
  const det = $('.ex__detail', panel), empty = $('.ex__empty', panel);
  det.hidden = !p; empty.hidden = !!p;
  $$('[data-villa]').forEach(x => x.classList.toggle('is-on', x.dataset.villa === 'none'));
  if (!p) return;
  const f = (k, v) => { const el = $(`[data-f="${k}"]`, det); if (el) el.textContent = v; };
  f('id', p.id); f('catLabel', CAT_LABEL[p.cat]); f('sqyd', fmtIN(p.sqyd)); f('sft', fmtIN(p.sqyd * 9)); f('price', rupees(price(p)));
  $('[data-enquire-plot]').dataset.plot = p.id; panel.scrollTop = 0;
  if (!reduce) gsap.from(det.children, { y: 14, opacity: 0, duration: .6, ease: 'expo.out', stagger: .04 });
}
function hoverPlot(p, at) {
  if (!p || !at) { tip.hidden = true; return; }
  tip.hidden = false; tip.innerHTML = `<b>${p.id}</b>${CAT_LABEL[p.cat]} · ${fmtIN(p.sqyd)} sq. yd · ${rupees(price(p))}`;
  tip.style.left = at.x + 'px'; tip.style.top = at.y + 'px';
}
$('[data-enquire-plot]').addEventListener('click', e => { e.preventDefault(); const id = e.currentTarget.dataset.plot; closeExplorer(); prefill(id); setTimeout(() => scrollToEl($('#enquire'), { duration: 2.8 }), 80); });

/* ---------------- enquiry form ---------------- */
const form = $('[data-form]');
function prefill(id) { if (!id) return; $('#f-plot').value = id; const p = PLOTS[id - 1]; $('#f-interest').value = p.cat === 'half' ? 'Half-acre estate' : p.cat === 'signature' ? 'Signature Estate (Plot 47)' : 'Quarter-acre estate'; }
form.addEventListener('submit', e => {
  e.preventDefault(); let ok = true;
  $$('[required]', form).forEach(i => { const bad = !i.value.trim() || (i.pattern && !new RegExp('^' + i.pattern + '$').test(i.value.trim())); i.closest('.field').classList.toggle('is-error', bad); if (bad) ok = false; });
  if (!ok) return;
  const d = Object.fromEntries(new FormData(form));
  const text = `ZUFA Living enquiry\nName: ${d.name}\nPhone: ${d.phone}\nEmail: ${d.email || '-'}\nInterested in: ${d.interest}\nPlot: ${d.plot || '-'}\n${d.message || ''}`;
  if (CONFIG.whatsapp) window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  else if (CONFIG.enquiryEmail) location.href = `mailto:${CONFIG.enquiryEmail}?subject=${encodeURIComponent('ZUFA Living — site visit request')}&body=${encodeURIComponent(text)}`;
  $('.form__ok', form).hidden = false; form.reset();
});

/* ---------------- villa studio ---------------- */
const ST = {
  sanctuary: ['Sanctuary Villa', 'An Andalusian Spanish-themed weekend villa on a single level, with a private pool. About 3,000 sft, on a quarter-acre or half-acre estate.'],
  estate: ['Estate Villa', 'A Californian Spanish-themed weekend villa with a private pool. About 5,000 sft, on a quarter-acre or half-acre estate.'],
};
function setStudio(type) {
  $('[data-st-title]').textContent = ST[type][0]; $('[data-st-desc]').textContent = ST[type][1];
  $$('[data-st-type]').forEach(b => b.classList.toggle('is-on', b.dataset.stType === type));
  world.enterStudio(type);
}
async function openStudio(type) {
  lenis?.stop();
  try { await getWorld(); } catch { lenis?.start(); return; }
  world.resume();
  document.body.classList.add('is-exploring', 'is-studio'); $('[data-studio-ui]').setAttribute('aria-hidden', 'false');
  world.setHour(story.hour > 20 ? 12 : clamp(story.hour, 6.6, 20));
  world.setViewOffset(...(isMobile() ? [0, .14] : [.1, 0]));
  const h = clamp(world.stT.hour, 6.6, 20); world.setHour(h);
  let best = null; $$('[data-st-hour]').forEach(b => { if (!best || Math.abs(+b.dataset.stHour - h) < Math.abs(+best.dataset.stHour - h)) best = b; });
  $$('[data-st-hour]').forEach(b => b.classList.toggle('is-on', b === best));
  setStudio(type);
}
function closeStudio() {
  document.body.classList.remove('is-exploring', 'is-studio'); $('[data-studio-ui]').setAttribute('aria-hidden', 'true'); lenis?.start();
  world.exitStudio(); onScroll();
  setTimeout(() => { if (!document.body.classList.contains('is-exploring')) world.pause(); }, 1000);
}
$$('[data-studio]').forEach(b => b.addEventListener('click', () => openStudio(b.dataset.studio)));
$$('[data-st-type]').forEach(b => b.addEventListener('click', () => setStudio(b.dataset.stType)));
$$('[data-st-hour]').forEach(b => b.addEventListener('click', () => { $$('[data-st-hour]').forEach(x => x.classList.toggle('is-on', x === b)); world.setHour(+b.dataset.stHour); }));
$('[data-st-close]').addEventListener('click', closeStudio);
$('[data-st-enquire]').addEventListener('click', e => { e.preventDefault(); $('#f-interest').value = 'Estate with villa add-on'; $('#f-msg').value = 'Interested in the ' + ST[world.studioType || 'sanctuary'][0]; closeStudio(); setTimeout(() => scrollToEl($('#enquire'), { duration: 2.8 }), 80); });
addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('is-studio')) closeStudio(); });

/* ---------------- ambient soundscape (synthesised in the browser; follows the clock) ---------------- */
const Ambience = {
  ctx: null, on: false,
  start() {
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = C.createGain(); this.master.gain.value = 0; this.master.connect(C.destination);
    // breeze: low-passed noise
    const len = C.sampleRate * 3, buf = C.createBuffer(1, len, C.sampleRate), d = buf.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + .02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = C.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    this.wind = C.createGain(); this.wind.gain.value = .5; src.connect(lp); lp.connect(this.wind); this.wind.connect(this.master); src.start();
    // crickets: pulsed high tones
    this.crick = C.createGain(); this.crick.gain.value = 0; this.crick.connect(this.master);
    for (const [f, rate] of [[4300, 17], [4750, 21], [3900, 13]]) {
      const o = C.createOscillator(); o.frequency.value = f; const g = C.createGain(); g.gain.value = 0;
      const l = C.createOscillator(); l.type = 'square'; l.frequency.value = rate; const lg = C.createGain(); lg.gain.value = .012;
      l.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(this.crick); o.start(); l.start();
    }
    // birdsong: short random chirp phrases
    this.birds = C.createGain(); this.birds.gain.value = 0; this.birds.connect(this.master);
    const chirp = () => {
      if (this.on && this.birds.gain.value > .05) {
        const t0 = C.currentTime, n = 2 + (Math.random() * 4 | 0), base = 2200 + Math.random() * 2200;
        const pan = C.createStereoPanner ? C.createStereoPanner() : null; if (pan) { pan.pan.value = Math.random() * 2 - 1; pan.connect(this.birds); }
        for (let i = 0; i < n; i++) {
          const o = C.createOscillator(), g = C.createGain(), t = t0 + i * (.09 + Math.random() * .05);
          o.frequency.setValueAtTime(base * (1 + Math.random() * .15), t); o.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * .3), t + .05); o.frequency.exponentialRampToValueAtTime(base * .9, t + .1);
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + .015); g.gain.exponentialRampToValueAtTime(.0005, t + .11);
          o.connect(g); g.connect(pan || this.birds); o.start(t); o.stop(t + .13);
        }
      }
      setTimeout(chirp, 500 + Math.random() * 2600);
    };
    chirp();
  },
  toggle() { if (!this.ctx) this.start(); this.on = !this.on; this.ctx.resume(); this.master.gain.linearRampToValueAtTime(this.on ? .8 : 0, this.ctx.currentTime + .8); return this.on; },
  update(hour, region) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime, day = sstep(5.6, 7, hour) * (1 - sstep(17.8, 19.2, hour)), night = clamp(1 - sstep(5, 6.4, hour) + sstep(18.6, 20, hour)), site = 1 - clamp(region);
    this.birds.gain.setTargetAtTime(day * site, t, .6); this.crick.gain.setTargetAtTime(night * site, t, .6); this.wind.gain.setTargetAtTime(.25 + .35 * site, t, .6);
  },
};
const sndBtn = $('[data-sound]');
sndBtn.addEventListener('click', () => { const on = Ambience.toggle(); sndBtn.setAttribute('aria-pressed', on); sndBtn.title = on ? 'Turn sound off' : 'Turn sound on'; sndBtn.setAttribute('aria-label', on ? 'Turn ambient sound off' : 'Turn ambient sound on'); });
setInterval(() => { const ex = world && document.body.classList.contains('is-exploring'); Ambience.update(ex ? world.st.hour : story.hour, ex ? 0 : story.region); }, 400);
