// Export the layout for Blender: plots with their road frontage, site outline, clubhouse, entrance.
// Coordinates are converted from the website's (x east, z south) to Blender's (X east, Y north): X = x, Y = -z.
// Usage: node tools/export-site-blender.mjs > blender/site.json
import { SITE, PLOTS } from '../js/site-data.js';
import { readFileSync } from 'node:fs';

const web = JSON.parse(readFileSync(new URL('../blender/web_export.json', import.meta.url)));
const B = ([x, z]) => [+x.toFixed(3), +(-z).toFixed(3)];
const inside = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) c = !c; } return c; };
const area = poly => { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
const centroid = poly => poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length], [0, 0]);

const outline = SITE.outline.map(B), club = SITE.club.map(B), plots = PLOTS.map(p => ({ ...p, b: p.poly.map(B) }));
const blocked = [club, ...plots.map(p => p.b)];
const isRoad = pt => inside(pt, outline) && !blocked.some(poly => inside(pt, poly));

const out = plots.map(p => {
  const poly = p.b, s = area(poly) > 0 ? 1 : -1, edges = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 4) continue;
    const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, nx = uy * s, ny = -ux * s;   // outward normal
    let hits = 0; for (const t of [.2, .5, .8]) { const m = [a[0] + (b[0] - a[0]) * t + nx * 4, a[1] + (b[1] - a[1]) * t + ny * 4]; if (isRoad(m)) hits++; }
    edges.push({ a, b, L, u: [ux, uy], n: [nx, ny], road: hits >= 2 });
  }
  const road = edges.filter(e => e.road);
  // frontage: the road-facing edge; prefer the shorter one (plots are deep and narrow), else the longest edge
  const front = (road.length ? road.sort((x, y) => x.L - y.L)[0] : edges.sort((x, y) => y.L - x.L)[0]);
  const mid = [(front.a[0] + front.b[0]) / 2, (front.a[1] + front.b[1]) / 2];
  // depth of the plot measured from the frontage, inwards
  const depth = Math.max(...poly.map(q => -((q[0] - mid[0]) * front.n[0] + (q[1] - mid[1]) * front.n[1])));
  return { id: p.id, cat: p.cat, sqyd: p.sqyd, poly, centroid: centroid(poly).map(v => +v.toFixed(3)),
    front: { mid: mid.map(v => +v.toFixed(3)), u: front.u.map(v => +v.toFixed(4)), n: front.n.map(v => +v.toFixed(4)), width: +front.L.toFixed(2), roadEdges: road.length },
    depth: +depth.toFixed(2) };
});

// entrance: the website's group rotation (about +Y) equals a Blender rotation about +Z by the same angle
const ent = { pos: B(web.entrance.pos), rotZ: web.entrance.rotY };
const cc = B(web.club.pos);
let best = 0, ang = 0; for (let i = 0; i < SITE.club.length; i++) { const a = SITE.club[i], b = SITE.club[(i + 1) % SITE.club.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > best) { best = l; ang = Math.atan2(b[0] - a[0], b[1] - a[1]); } }
const cam = {}; for (const [k, v] of Object.entries(web.keys)) cam[k] = { p: [v.p[0], -v.p[2], v.p[1]], t: [v.t[0], -v.t[2], v.t[1]] };
console.log(JSON.stringify({ outline, club: { poly: club, pos: cc, rotZ: ang - Math.PI / 2 }, entrance: ent, plots: out, cameras: cam, fov: web.fov, beats: web.beats }));
