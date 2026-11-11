// ZUFA — interactive 3D masterplan. Geometry is generated from the L1 layout (see site-data.js).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// final cinematic grade: soft vignette, gentle warm lift, fine animated grain (runs after tone mapping)
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.55 }, uGrain: { value: 0.035 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uVig, uGrain; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - .5; float v = smoothstep(.85, .2, length(d * vec2(1., .82)));
      c.rgb *= mix(1. - uVig, 1., v);
      c.rgb = mix(c.rgb, c.rgb * vec3(1.03, 1.0, .96) + vec3(.012, .008, .0), .6);
      c.rgb += (h(vUv * 1000. + fract(uTime) * 61.) - .5) * uGrain;
      gl_FragColor = c;
    }`,
};
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { SITE, PLOTS } from './site-data.js';

export const CAT = {
  quarter:   { label: 'Quarter acre', color: '#efe6d6' },
  half:      { label: 'Half acre', color: '#cdbb94' },
  signature: { label: 'Signature estate', color: '#c4a57a' },
  bespoke:   { label: 'Bespoke size', color: '#9fa88f' },
};

/* ---------------- geometry helpers (x = east, z = south) ---------------- */
const rand = (() => { let s = 1337; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const R = (a, b) => a + (b - a) * rand();
function signedArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; } return a / 2; }
function centroid(p) { let x = 0, z = 0; p.forEach(q => { x += q[0]; z += q[1]; }); return [x / p.length, z / p.length]; }
function inside(pt, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if (((zi > pt[1]) !== (zj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - zi) / (zj - zi) + xi)) c = !c; } return c; }
function segDist(p, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz); }
function polyDist(p, poly) { let d = 1e9; for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(p, poly[i], poly[(i + 1) % poly.length])); return d; }
function inset(poly, d) {
  const s = signedArea(poly) > 0 ? 1 : -1, n = poly.length, L = [];
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; const nx = -dz * s, nz = dx * s; L.push({ p: [a[0] + nx * d, a[1] + nz * d], d: [dx, dz] }); }
  const out = [];
  for (let i = 0; i < n; i++) { const A = L[(i - 1 + n) % n], B = L[i]; const den = A.d[0] * B.d[1] - A.d[1] * B.d[0];
    if (Math.abs(den) < 1e-3) { out.push(B.p); continue; }
    const t = ((B.p[0] - A.p[0]) * B.d[1] - (B.p[1] - A.p[1]) * B.d[0]) / den; out.push([A.p[0] + A.d[0] * t, A.p[1] + A.d[1] * t]); }
  return out;
}
function shapeOf(poly) { const s = new THREE.Shape(); poly.forEach(([x, z], i) => i ? s.lineTo(x, -z) : s.moveTo(x, -z)); s.closePath(); return s; }
function extrude(poly, depth) { const g = new THREE.ExtrudeGeometry(shapeOf(poly), { depth, bevelEnabled: false, curveSegments: 4 }); g.rotateX(-Math.PI / 2); return g; }
function longestEdgeAngle(poly) { let best = 0, ang = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > best) { best = l; ang = Math.atan2(b[0] - a[0], b[1] - a[1]); } } return ang; }
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
export { rand, R, signedArea, centroid, inside, segDist, polyDist, inset, shapeOf, extrude, longestEdgeAngle, lerp, smooth };

/* ---------------- lighting presets ---------------- */
const PRESETS = {
  dusk: { top: '#7d76ad', mid: '#e8c1bb', bottom: '#2c2830', fog: '#a993a8', fogD: 0.0003, sun: '#ffb27e', sunI: 2.4, sunPos: [-650, 170, 160], hemiS: '#c9b5c6', hemiG: '#3d342b', hemiI: .85, exp: 1.05, lamp: 1, ground: '#ffffff' },
  day:  { top: '#6e9bd0', mid: '#e3ebee', bottom: '#8f9a86', fog: '#d8e2e6', fogD: 0.00022, sun: '#fff1db', sunI: 3.3, sunPos: [-320, 620, 260], hemiS: '#dbe7f4', hemiG: '#5d6848', hemiI: 1.15, exp: 1.0, lamp: 0, ground: '#ffffff' },
};

export class Masterplan {
  constructor(container, opts = {}) {
    this.el = container; this.opts = opts;
    this.isMobile = matchMedia('(max-width: 899px)').matches || matchMedia('(pointer: coarse)').matches;
    this.mode = 'story'; this.progress = 0; this.filter = 'all'; this.highlight = null;
    this.selected = null; this.hovered = null; this.active = true; this.time = 'dusk';
    this.viewOffset = { x: 0, y: 0, tx: 0, ty: 0 };
    this.uTime = { value: 0 };
    this._init();
  }

  /* ---------- setup ---------- */
  _init() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, this.isMobile ? 1.6 : 2));
    r.setSize(w, h); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.el.appendChild(r.domElement);

    this.labels = new CSS2DRenderer(); this.labels.setSize(w, h);
    this.labels.domElement.className = 'mp__labels';
    this.el.appendChild(this.labels.domElement);

    const s = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.isMobile ? 42 : 34, w / h, 1, 9000);
    this.camera.position.set(-600, 420, 600);
    this.target = new THREE.Vector3();
    this.camPos = this.camera.position.clone(); this.camTarget = new THREE.Vector3();

    // sky
    this.skyU = { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: this.skyU,
      vertexShader: 'varying vec3 vP; void main(){ vP = (modelMatrix*vec4(position,1.)).xyz - cameraPosition; gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h > 0. ? mix(mid, top, pow(smoothstep(0., .6, h), .7)) : mix(mid, bottom, smoothstep(0., -.08, h)); gl_FragColor = vec4(c, 1.); }',
    }));
    sky.frustumCulled = false; sky.renderOrder = -10; s.add(sky); this.sky = sky;
    s.fog = new THREE.FogExp2(0xb9a2b4, 0.00075);

    // lights
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1); s.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.castShadow = true; sun.shadow.mapSize.set(this.isMobile ? 2048 : 4096, this.isMobile ? 2048 : 4096);
    Object.assign(sun.shadow.camera, { left: -460, right: 460, top: 460, bottom: -460, near: 10, far: 2000 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
    s.add(sun); s.add(sun.target);

    this._buildGround(); this._buildSite(); this._buildPlots(); this._buildEntrance(); this._buildClub();
    this._buildVegetation(); this._buildLabels(); this._buildKeys();
    this._applyPreset(PRESETS.dusk, 1);

    // post
    const pr = r.getPixelRatio();
    this.composer = new EffectComposer(r, new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: this.isMobile ? 2 : 4 }));
    this.composer.addPass(new RenderPass(s, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.55, 0.88);
    this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader); this.composer.addPass(this.grade);

    // controls (explore mode)
    const c = this.controls = new OrbitControls(this.camera, r.domElement);
    c.enabled = false; c.enableDamping = true; c.dampingFactor = 0.07; c.maxPolarAngle = 1.36; c.minDistance = 35; c.maxDistance = 1500;
    c.zoomSpeed = 0.8; c.rotateSpeed = 0.55; c.screenSpacePanning = false;

    // interaction
    this.ray = new THREE.Raycaster(); this.mouse = new THREE.Vector2();
    const dom = r.domElement; let down = null;
    dom.addEventListener('pointermove', e => this._onMove(e));
    dom.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    dom.addEventListener('pointerup', e => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6) this._onClick(e); down = null; });
    dom.addEventListener('pointerleave', () => this._setHover(null));

    this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(this.el);
    this.clock = new THREE.Clock();
    const loop = () => { this._raf = requestAnimationFrame(loop); this._tick(); };
    loop();
  }

  _buildGround() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 2048; const g = cv.getContext('2d');
    g.fillStyle = '#4f5a3c'; g.fillRect(0, 0, 2048, 2048);
    const tones = ['#5d6a42', '#4c5a38', '#6c6c48', '#46553a', '#77704c', '#58663c', '#6a6244', '#505e3e'];
    g.save(); g.translate(1024, 1024); g.rotate(-0.17); g.translate(-1024, -1024);
    for (let i = 0; i < 1100; i++) { const x = R(-400, 2400), y = R(-400, 2400), w = R(30, 180), h = R(30, 140);
      g.globalAlpha = R(.35, .8); g.fillStyle = tones[(rand() * tones.length) | 0]; g.fillRect(x, y, w, h);
      if (rand() < .3) { g.globalAlpha = .25; g.strokeStyle = '#4f5a3c'; g.lineWidth = 1.2; g.strokeRect(x, y, w, h); } }
    g.restore();
    for (let i = 0; i < 26000; i++) { g.globalAlpha = R(.05, .18); g.fillStyle = rand() < .5 ? '#3f4a30' : '#a59a70'; g.fillRect(R(0, 2048), R(0, 2048), R(1, 4), R(1, 4)); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const ac = document.createElement('canvas'); ac.width = ac.height = 256; const ag = ac.getContext('2d');
    const rg = ag.createRadialGradient(128, 128, 60, 128, 128, 128); rg.addColorStop(0, '#fff'); rg.addColorStop(.8, '#fff'); rg.addColorStop(1, '#000'); ag.fillStyle = rg; ag.fillRect(0, 0, 256, 256);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1600, 96), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, alphaMap: new THREE.CanvasTexture(ac), transparent: true, depthWrite: true }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true; this.scene.add(ground);
  }

  _buildSite() {
    // the site slab = internal roads
    // asphalt: fine aggregate speckle, patching and tyre-worn bands (texture repeats every 10 m)
    const ac = document.createElement('canvas'); ac.width = ac.height = 1024; const ag = ac.getContext('2d');
    ag.fillStyle = '#5a5a5d'; ag.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 60; i++) { ag.globalAlpha = R(.04, .1); ag.fillStyle = rand() < .5 ? '#2c2c2e' : '#5c5b58'; ag.beginPath(); ag.ellipse(R(0, 1024), R(0, 1024), R(40, 220), R(30, 160), R(0, 3), 0, 6.3); ag.fill(); }
    for (let i = 0; i < 70000; i++) { ag.globalAlpha = R(.12, .5); ag.fillStyle = rand() < .55 ? '#2a2a2b' : (rand() < .7 ? '#6e6c68' : '#8a8780'); ag.fillRect(R(0, 1024), R(0, 1024), R(1, 2.6), R(1, 2.6)); }
    ag.globalAlpha = 1;
    this.asphalt = new THREE.CanvasTexture(ac); this.asphalt.wrapS = this.asphalt.wrapT = THREE.RepeatWrapping; this.asphalt.repeat.set(.1, .1); this.asphalt.colorSpace = THREE.SRGBColorSpace; this.asphalt.anisotropy = 8;
    this.asphaltMat = new THREE.MeshStandardMaterial({ map: this.asphalt, roughness: .88, color: 0xffffff });
    const site = new THREE.Mesh(extrude(SITE.outline, 0.3), this.asphaltMat);
    site.receiveShadow = true; this.scene.add(site);
    // green verge around the perimeter (inside the boundary wall)
    const verge = new THREE.Mesh(extrude(inset(SITE.outline, -6), 0.15), new THREE.MeshStandardMaterial({ color: 0x5d6b47, roughness: 1 }));
    verge.receiveShadow = true; this.scene.add(verge);
    // perimeter wall (stone)
    const o = SITE.outline, wallGeo = new THREE.BoxGeometry(1, 1, 1);
    const wall = new THREE.InstancedMesh(wallGeo, new THREE.MeshStandardMaterial({ color: 0xcdb898, roughness: .95 }), o.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), out = inset(o, -5);
    let k = 0;
    for (let i = 0; i < out.length; i++) { const a = out[i], b = out[(i + 1) % out.length]; const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (Math.hypot(mid[0] - SITE.gate[0], mid[1] - SITE.gate[1]) < 22 && Math.hypot(b[0] - a[0], b[1] - a[1]) < 60) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(b[0] - a[0], b[1] - a[1]));
      m.compose(new THREE.Vector3(mid[0], 1.1, mid[1]), q, new THREE.Vector3(0.7, 2.2, len + 0.7)); wall.setMatrixAt(k++, m); }
    wall.count = k; wall.castShadow = true; wall.receiveShadow = true; this.scene.add(wall);
    this.outerRing = out;
  }

  _buildPlots() {
    this.plotMeshes = []; this.plotById = {};
    // fine land texture: mown-lawn stripes + soft noise, multiplied by the category tint
    const cv = document.createElement('canvas'); cv.width = cv.height = 512; const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? 'rgba(0,0,0,.035)' : 'rgba(255,255,255,0)'; g.fillRect(i * 32, 0, 32, 512); }
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${rand() < .5 ? '0,0,0' : '255,255,255'},${R(.02, .07)})`; g.fillRect(R(0, 512), R(0, 512), R(1, 3), R(1, 3)); }
    const land = new THREE.CanvasTexture(cv); land.wrapS = land.wrapT = THREE.RepeatWrapping; land.repeat.set(1 / 18, 1 / 18); land.anisotropy = 8; land.colorSpace = THREE.SRGBColorSpace;
    const kerbMat = new THREE.MeshStandardMaterial({ color: 0xf6f1e8, roughness: .6 });
    for (const p of PLOTS) {
      const poly = inset(p.poly, 0.9);
      const geo = extrude(poly, 0.55);
      const mat = new THREE.MeshStandardMaterial({ color: CAT[p.cat].color, map: land, roughness: 0.92, metalness: 0, emissive: 0x000000 });
      const mesh = new THREE.Mesh(geo, mat); mesh.position.y = 0.3; mesh.castShadow = false; mesh.receiveShadow = true;
      mesh.userData.plot = p; mesh.userData.base = new THREE.Color(CAT[p.cat].color);
      // crisp boundary kerb: a thin raised ring along the plot edge
      const ring = shapeOf(poly), inner = inset(poly, 0.45); ring.holes.push(new THREE.Path(inner.slice().reverse().map(([x, z]) => new THREE.Vector2(x, -z))));
      const kg = new THREE.ExtrudeGeometry(ring, { depth: 0.16, bevelEnabled: false }); kg.rotateX(-Math.PI / 2);
      const kerb = new THREE.Mesh(kg, kerbMat); kerb.position.y = 0.55; kerb.receiveShadow = true; mesh.add(kerb);
      // paved footpath round the plot (between the lot line and the plot edge), at road level
      const fp = shapeOf(inset(p.poly, -0.7)); fp.holes.push(new THREE.Path(inset(p.poly, 0.85).slice().reverse().map(([x, z]) => new THREE.Vector2(x, -z))));
      const fg = new THREE.ExtrudeGeometry(fp, { depth: 0.14, bevelEnabled: false }); fg.rotateX(-Math.PI / 2);
      const foot = new THREE.Mesh(fg, this._pavers || (this._pavers = this._paverMat())); foot.position.y = .3 + (p.id % 2) * .004; foot.receiveShadow = true; this.scene.add(foot);
      this.scene.add(mesh); this.plotMeshes.push(mesh); this.plotById[p.id] = mesh;
      p.inset = poly; p.area = Math.abs(signedArea(poly));
    }
    // road-edge sample points (for palms, lamps, boulders)
    const pts = [], hash = new Set(), all = PLOTS.map(p => p.poly).concat([SITE.club]);
    const keep = (x, z, cell) => { const k = Math.round(x / cell) + ':' + Math.round(z / cell); if (hash.has(k)) return false; hash.add(k); return true; };
    for (const poly of all) { const s = signedArea(poly) > 0 ? 1 : -1;
      for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 8) continue;
        const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len, nx = dz * s, nz = -dx * s; // outward
        for (let t = 6; t < len - 4; t += 13) { const x = a[0] + dx * t + nx * 2.6, z = a[1] + dz * t + nz * 2.6;
          if (!inside([x, z], SITE.outline) || all.some(pp => inside([x, z], pp))) continue;
          if (polyDist([x, z], SITE.outline) < 2) continue;
          if (keep(x, z, 9)) pts.push({ x, z, ang: Math.atan2(dx, dz) }); } } }
    this.roadEdge = pts;
  }

  _paverMat() {
    // 400 x 200 mm concrete pavers in stretcher bond, warm grey
    const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
    g.fillStyle = '#8f8a80'; g.fillRect(0, 0, 512, 512);
    for (let r = 0; r < 16; r++) for (let k = -1; k < 9; k++) { const x = k * 64 + (r % 2) * 32, y = r * 32; g.fillStyle = `hsl(36, ${R(6, 12)}%, ${R(66, 76)}%)`; g.fillRect(x + 1.5, y + 1.5, 61, 29); }
    for (let i = 0; i < 9000; i++) { g.globalAlpha = R(.05, .15); g.fillStyle = rand() < .5 ? '#000' : '#fff'; g.fillRect(R(0, 512), R(0, 512), 1.5, 1.5); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 3.2, 1 / 3.2); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return new THREE.MeshStandardMaterial({ map: t, roughness: .85 });
  }

  _buildEntrance() {
    // orientation from the 55' road label: drawing direction -> world (-b, -a)
    const road = SITE.roads.find(r => r.label.startsWith('55')) || SITE.roads[0];
    const a = Math.cos(road.ang), b = Math.sin(road.ang);
    let inward = new THREE.Vector2(-b, -a).normalize(); // along the road into the site (from text direction)
    const g = SITE.gate, toCenter = new THREE.Vector2(-g[0], -g[1]).normalize();
    if (inward.dot(toCenter) < 0) inward.multiplyScalar(-1);
    const out = inward.clone().multiplyScalar(-1);
    this.gateDir = out; const perp = new THREE.Vector2(out.y, -out.x);
    const G = this.entrance = new THREE.Group(); G.position.set(g[0], 0, g[1]); G.rotation.y = Math.atan2(out.x, out.y); this.scene.add(G);
    // local frame: +z = outward, +x = perp

    const stone = new THREE.MeshStandardMaterial({ color: 0xd8c3a2, roughness: .95 });
    const bronze = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: .45, metalness: .55 });
    const soffit = new THREE.MeshStandardMaterial({ color: 0x9a7a58, roughness: .6, metalness: .1 });
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffdcae).multiplyScalar(3), toneMapped: true }); this.glowMats = [glow];

    // approach boulevard (curve outward), with central median
    const curve = new THREE.CatmullRomCurve3([[0, -18], [0, 0], [0, 40], [-6, 120], [-30, 260], [-80, 520], [-150, 900]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const N = 120, W = 9.5, pos = [], idx = [], med = [];
    for (let i = 0; i <= N; i++) { const t = i / N, p = curve.getPoint(t), tg = curve.getTangent(t); const nx = tg.z, nz = -tg.x;
      pos.push(p.x + nx * W, 0.12, p.z + nz * W, p.x - nx * W, 0.12, p.z - nz * W); med.push([p, nx, nz, t]);
      if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setIndex(idx); rg.computeVertexNormals();
    { const uv = []; for (let i = 0; i < pos.length; i += 3) uv.push(pos[i], -pos[i + 2]); rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); }
    const roadMat = this.asphaltMat.clone(); roadMat.side = THREE.DoubleSide;
    const roadMesh = new THREE.Mesh(rg, roadMat); roadMesh.receiveShadow = true; G.add(roadMesh); this.approachRoad = roadMesh;
    // white edge lines along the boulevard
    for (const s of [-1, 1]) { const ep = []; for (let i = 0; i <= N; i++) { const t = i / N, p = curve.getPoint(t), tg = curve.getTangent(t); ep.push(new THREE.Vector3(p.x + tg.z * s * (W - .6), .14, p.z - tg.x * s * (W - .6))); }
      const line = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ep), 200, .08, 3), new THREE.MeshStandardMaterial({ color: 0xd9d6cc, roughness: .7 })); line.scale.y = .2; G.add(line); }
    this.approach = med.map(([p, nx, nz, t]) => ({ p: p.clone(), nx, nz, t }));

    // forecourt (paved disc in front of gate)
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(19, 19, .2, 64), new THREE.MeshStandardMaterial({ color: 0xb8ab98, roughness: .9 }));
    fore.position.set(0, .14, 18); fore.receiveShadow = true; G.add(fore);

    // curved stone walls
    const arcWall = (cx, cz, r, a0, a1, h) => { const sh = new THREE.Shape(); sh.absarc(0, 0, r, a0, a1, false); sh.absarc(0, 0, r - 1.1, a1, a0, true);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 40 }); geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, stone); m.position.set(cx, 0, cz); m.castShadow = m.receiveShadow = true; G.add(m); return m; };
    arcWall(-25, 8, 15, -1.05, 1.05, 3.4);
    arcWall(25, 8, 15, Math.PI - 1.05, Math.PI + 1.05, 3.4);
    // wall uplight strips
    const strip = (cx, cz, r, a0, a1) => { const pts = []; for (let i = 0; i <= 40; i++) { const t = a0 + (a1 - a0) * i / 40; pts.push(new THREE.Vector3(cx + Math.cos(t) * (r + .25), .15, cz - Math.sin(t) * (r + .25))); }
      G.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, .12, 5), glow)); };
    strip(-25, 8, 15, -1.05, 1.05); strip(25, 8, 15, Math.PI - 1.05, Math.PI + 1.05);

    // sign
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 300; const c = cv.getContext('2d');
    c.fillStyle = '#2a2018'; c.font = '300 170px "Cormorant Garamond", serif'; c.textAlign = 'center'; c.fillText('ZUFA', 512, 175);
    c.font = '500 34px Manrope, sans-serif'; c.letterSpacing = '8px'; c.fillText('GATED COMMUNITY', 512, 250);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.64), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: .6 }));
    sign.position.set(10.15, 1.9, 8); sign.rotation.y = -Math.PI / 2; G.add(sign);
    this._signTex = tex; document.fonts?.ready.then(() => { c.clearRect(0, 0, 1024, 300); c.fillStyle = '#2a2018'; c.font = '300 170px "Cormorant Garamond", serif'; c.fillText('ZUFA', 512, 175); c.font = '500 34px Manrope, sans-serif'; c.fillText('G A T E D   C O M M U N I T Y', 512, 250); tex.needsUpdate = true; });

    // gate leaves
    const gate = new THREE.Mesh(new THREE.BoxGeometry(18, 3, .3), new THREE.MeshStandardMaterial({ color: 0x1d1a17, metalness: .6, roughness: .5, transparent: true, opacity: .85 }));
    gate.position.set(0, 1.5, 0); gate.castShadow = true; G.add(gate); this.gateMesh = gate;

    // the canopy: two linked rings (convex hull of two circles) with skylight
    const C1 = { x: -11, z: 18, r: 11 }, C2 = { x: 14, z: 16, r: 7 };
    const hull = (() => { const d = Math.hypot(C2.x - C1.x, C2.z - C1.z), th = Math.atan2(C2.z - C1.z, C2.x - C1.x), al = Math.acos((C1.r - C2.r) / d);
      const pts = []; const S = 48;
      for (let i = 0; i <= S; i++) { const t = th + al + (2 * Math.PI - 2 * al) * i / S; pts.push([C1.x + Math.cos(t) * C1.r, C1.z + Math.sin(t) * C1.r]); }
      for (let i = 0; i <= S; i++) { const t = th - al + (2 * al) * i / S; pts.push([C2.x + Math.cos(t) * C2.r, C2.z + Math.sin(t) * C2.r]); }
      return pts; })();
    const cs = new THREE.Shape(); hull.forEach(([x, z], i) => i ? cs.lineTo(x, -z) : cs.moveTo(x, -z));
    const hole = new THREE.Path(); hole.absarc(C1.x, -C1.z, 4.2, 0, Math.PI * 2, true); cs.holes.push(hole);
    const cg = new THREE.ExtrudeGeometry(cs, { depth: .45, bevelEnabled: true, bevelThickness: .18, bevelSize: .3, bevelSegments: 3, curveSegments: 48 }); cg.rotateX(-Math.PI / 2);
    const canopy = new THREE.Mesh(cg, [bronze, soffit]); canopy.position.y = 9; canopy.castShadow = true; G.add(canopy);
    const rimPts = hull.map(([x, z]) => new THREE.Vector3(x, 8.85, z));
    G.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 220, .14, 6, true), glow));
    const sky = new THREE.Mesh(new THREE.TorusGeometry(4.6, .13, 6, 64), glow); sky.rotation.x = Math.PI / 2; sky.position.set(C1.x, 8.9, C1.z); G.add(sky);
    // tree column
    const steel = new THREE.MeshStandardMaterial({ color: 0x2b2622, metalness: .7, roughness: .35 });
    for (let i = 0; i < 9; i++) { const t = i / 9 * Math.PI * 2 + .3, top = new THREE.Vector3(C1.x + Math.cos(t) * 6.2, 9, C1.z + Math.sin(t) * 6.2), base = new THREE.Vector3(C1.x + R(-.6, .6), 0, C1.z + R(-.6, .6));
      const mid = new THREE.Vector3(C1.x + Math.cos(t) * 1.2, 3.2, C1.z + Math.sin(t) * 1.2);
      G.add(Object.assign(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(base, mid, top), 12, .16, 5), steel), { castShadow: true })); }
    for (const [x, z] of [[9, 12], [19, 12], [9, 20.5], [19, 20.5]]) { const col = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, 9, 8), bronze); col.position.set(x, 4.5, z); col.castShadow = true; G.add(col); }
    // steel water blade
    const blade = new THREE.Mesh(new THREE.TorusGeometry(3.4, .18, 6, 40, Math.PI * .9), new THREE.MeshStandardMaterial({ color: 0xcfd3d6, metalness: 1, roughness: .2 }));
    blade.position.set(-4, 0, 26); blade.rotation.set(0, .8, 0); G.add(blade);
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, .4, 32), new THREE.MeshStandardMaterial({ color: 0x9fc6cf, metalness: .3, roughness: .1, emissive: 0x24444a }));
    pool.position.set(-4.5, .3, 26); G.add(pool);
    this.entranceWorld = (lx, ly, lz) => G.localToWorld(new THREE.Vector3(lx, ly, lz));
  }

  _buildClub() {
    const poly = SITE.club, [cx, cz] = centroid(poly), ang = longestEdgeAngle(poly);
    this.clubC = new THREE.Vector3(cx, 0, cz);
    const lawn = new THREE.Mesh(extrude(inset(poly, 1.5), 0.5), new THREE.MeshStandardMaterial({ color: 0x7c8a5c, roughness: 1 }));
    lawn.position.y = .3; lawn.receiveShadow = true; this.scene.add(lawn);
    const G = new THREE.Group(); G.position.set(cx, .8, cz); G.rotation.y = ang; G.scale.setScalar(1.25); this.scene.add(G);
    const stone = new THREE.MeshStandardMaterial({ color: 0xe2d4bd, roughness: .9 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(24, .25, 46), new THREE.MeshStandardMaterial({ color: 0xcbb99b, roughness: .85 })); deck.position.set(-6, .12, 2); deck.receiveShadow = true; G.add(deck);
    const water = new THREE.Mesh(new THREE.BoxGeometry(12, .2, 30), new THREE.MeshStandardMaterial({ color: 0x5fb2c2, metalness: .2, roughness: .05, emissive: 0x0f3b44, emissiveIntensity: 1 }));
    water.position.set(-6, .3, 2); G.add(water); this.poolMat = water.material;
    const jac = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, .3, 32), water.material); jac.position.set(-6, .32, -16); G.add(jac);
    // pavilion: smaller echo of the canopy motif
    const sh = new THREE.Shape(); sh.absellipse(0, 0, 13, 9, 0, Math.PI * 2);
    const roof = new THREE.Mesh((() => { const g = new THREE.ExtrudeGeometry(sh, { depth: .6, bevelEnabled: true, bevelSize: .3, bevelThickness: .2, curveSegments: 48 }); g.rotateX(-Math.PI / 2); return g; })(),
      new THREE.MeshStandardMaterial({ color: 0x5a4a3a, metalness: .5, roughness: .45 }));
    roof.position.set(13, 5.2, 4); roof.castShadow = true; G.add(roof);
    const rim = []; for (let i = 0; i <= 80; i++) { const t = i / 80 * Math.PI * 2; rim.push(new THREE.Vector3(13 + Math.cos(t) * 13.2, 5.05, 4 + Math.sin(t) * 9.2)); }
    G.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 120, .1, 5, true), this.glowMats[0]));
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 4.6, 40, 1, true), new THREE.MeshStandardMaterial({ color: 0xffe2b8, emissive: 0xffc98a, emissiveIntensity: .45, transparent: true, opacity: .55, side: THREE.DoubleSide }));
    glass.scale.z = .7; glass.position.set(13, 2.5, 4); G.add(glass); this.clubGlass = glass.material;
    const spa = new THREE.Mesh(new THREE.BoxGeometry(14, 4.2, 10), stone); spa.position.set(14, 2.1, -18); spa.castShadow = spa.receiveShadow = true; G.add(spa);
    const play = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, .15, 40), new THREE.MeshStandardMaterial({ color: 0xc58b62, roughness: 1 })); play.position.set(12, .1, 26); G.add(play);
    this.clubGroup = G;
  }

  _buildVegetation() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    // --- palm geometry (vertex coloured)
    const paint = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    const parts = [paint(new THREE.CylinderGeometry(.18, .32, 9, 6).translate(0, 4.5, 0), '#7a6650')];
    // fronds: tapered, V-folded, arching leaves with a dark-to-light gradient
    const dark = new THREE.Color('#3f5a2e'), light = new THREE.Color('#7f9a52');
    for (let i = 0; i < 13; i++) {
      const f = new THREE.PlaneGeometry(1, 5.4, 2, 10).translate(0, 2.7, 0), P = f.attributes.position, cols = new Float32Array(P.count * 3);
      const lift = i % 3 === 0 ? .62 : i % 3 === 1 ? .38 : .18, len = i % 3 === 0 ? .8 : 1;
      for (let k = 0; k < P.count; k++) { const lat = P.getX(k), r = P.getY(k) * len, t = r / 5.4;
        const w = lat * Math.sin(Math.PI * Math.min(1, t * 1.1 + .05)) * 1.25;
        P.setXYZ(k, r, lift * r - 0.08 * r * r + Math.abs(w) * .3, w); dark.clone().lerp(light, t).toArray(cols, k * 3); }
      f.setAttribute('color', new THREE.BufferAttribute(cols, 3)); f.rotateY(i / 13 * Math.PI * 2 + (i % 2) * .2); f.translate(0, 9, 0); f.computeVertexNormals(); parts.push(f);
    }
    parts.push(paint(new THREE.SphereGeometry(.42, 8, 6).translate(0, 8.9, 0), '#5a4a35'));
    const palmGeo = mergeGeometries(parts.map(g => g.index ? g.toNonIndexed() : g));
    const palmMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, side: THREE.DoubleSide });
    // --- round tree geometry: three lobes for a fuller, natural silhouette
    const lobe = (r, x, y, z) => { const s = new THREE.IcosahedronGeometry(r, 2), p = s.attributes.position; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = Math.sin(v.x * 5.1 + x) * Math.sin(v.y * 4.3 + y) * Math.sin(v.z * 4.7 + z); const j = 1 + n * .13; p.setXYZ(i, v.x * j + x, v.y * j * .9 + y, v.z * j + z); } return s; };
    const crown = mergeGeometries([lobe(1, 0, 0, 0), lobe(.72, .62, -.22, .25), lobe(.7, -.55, -.18, -.35), lobe(.6, .1, .45, -.2)]);
    crown.deleteAttribute('normal'); crown.deleteAttribute('uv'); const crownM = mergeVertices(crown); crownM.computeVertexNormals();
    const trunkGeo = new THREE.CylinderGeometry(.2, .32, 1, 5).translate(0, .5, 0);

    // palm positions: road edges + approach avenue + perimeter
    const palms = [];
    this.roadEdge.forEach((p, i) => { if (i % 2 === 0) palms.push([p.x, p.z]); });
    this.approach.forEach(a => { if (a.t > .07 && a.t < .42 && Math.round(a.t * 120) % 3 === 0) { for (const s of [-1, 1]) { const w = this.entrance.localToWorld(new THREE.Vector3(a.p.x + a.nx * 12.5 * s, 0, a.p.z + a.nz * 12.5 * s)); palms.push([w.x, w.z]); } } });
    { const ring = this.outerRing; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let t = 0; t < L; t += 16) { const x = a[0] + (b[0] - a[0]) * t / L, z = a[1] + (b[1] - a[1]) * t / L; if (Math.hypot(x - SITE.gate[0], z - SITE.gate[1]) > 30) palms.push([x + R(-1, 1), z + R(-1, 1)]); } } }
    const palm = new THREE.InstancedMesh(palmGeo, palmMat, palms.length);
    palms.forEach(([x, z], i) => { e.set(R(-.05, .05), R(0, 6.28), R(-.05, .05)); q.setFromEuler(e); const s = R(.8, 1.15); m.compose(v.set(x, .3, z), q, sc.set(s, s * R(.9, 1.2), s)); palm.setMatrixAt(i, m); palm.setColorAt(i, col.setHSL(.25, .1, R(.75, 1))); });
    palm.castShadow = true; this.scene.add(palm); this.palmMesh = palm;

    // forest hug: dense ring of trees outside the boundary, thinning with distance
    const N = this.isMobile ? 3200 : 6500, trees = [];
    const ap = this.approach.map(a => { const w = this.entrance.localToWorld(a.p.clone()); return [w.x, w.z]; });
    let tries = 0;
    while (trees.length < N && tries++ < N * 30) {
      const x = R(-1100, 1100), z = R(-1300, 1300); const p = [x, z];
      if (inside(p, this.outerRing)) continue;
      const d = polyDist(p, this.outerRing); if (d < 5) continue;
      let ad = 1e9; for (let i = 0; i < ap.length - 1; i++) ad = Math.min(ad, segDist(p, ap[i], ap[i + 1]));
      const gd = Math.hypot(x - SITE.gate[0], z - SITE.gate[1]); if (ad < (gd < 260 ? 48 : 18) || gd < 150) continue;
      const nz = Math.sin(x * .011) * Math.cos(z * .009) + Math.sin((x + z) * .004) * .7; // clumping
      const prob = (d < 110 ? .95 : Math.max(0, .55 - (d - 110) / 1600)) * (nz > -.2 ? 1 : .25);
      if (rand() > prob) continue; trees.push([x, z, d]);
    }
    // (clubhouse trees now come with the Blender clubhouse model)
    const crownMat = new THREE.MeshStandardMaterial({ roughness: .95 });
    // gentle wind sway, phase-shifted per instance
    const sway = (mat, amp) => { mat.onBeforeCompile = sh => { sh.uniforms.uTime = this.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * .07 + instanceMatrix[3].z * .05;
          float k = max(position.y, 0.) * ${amp.toFixed(3)};
          transformed.x += sin(uTime * 1.1 + ph) * k; transformed.z += cos(uTime * .8 + ph) * k * .6;
        #endif`); }; };
    sway(crownMat, .035); sway(palmMat, .012);
    const crowns = new THREE.InstancedMesh(crownM, crownMat, trees.length);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x4a3c2e, roughness: 1 }), trees.length);
    trees.forEach(([x, z, d], i) => { const r = d > 0 && d < 140 ? R(5, 9.5) : R(4, 8), th = r * R(.45, .8); q.setFromAxisAngle(up, R(0, 6.28));
      m.compose(v.set(x, th + r * .9, z), q, sc.set(r, r * R(.95, 1.3), r)); crowns.setMatrixAt(i, m);
      crowns.setColorAt(i, col.setHSL(R(.24, .33), R(.3, .48), R(.1, .19)));
      m.compose(v.set(x, 0, z), q, sc.set(1, th + r * .5, 1)); trunks.setMatrixAt(i, m); });
    crowns.castShadow = true; crowns.receiveShadow = true; trunks.castShadow = true; this.scene.add(crowns, trunks);
    this.forestCrowns = crowns; this.forestTrunks = trunks;

    // boulders (theme)
    const bg = new THREE.IcosahedronGeometry(1, 1); { const p = bg.attributes.position; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const h = Math.sin(v.x * 91.3 + v.y * 17.1 + v.z * 53.9) * 9631.7; const j = 1 + ((h - Math.floor(h)) - .5) * .5; p.setXYZ(i, v.x * j, v.y * j * .72, v.z * j); } bg.computeVertexNormals(); }
    const bpts = [];
    this.roadEdge.forEach((p, i) => { if (i % 3 === 1) for (let k = 0; k < 3; k++) bpts.push([p.x + R(-2.5, 2.5), p.z + R(-2.5, 2.5), R(.6, 1.6)]); });
    // keep road-side boulders out of the clubhouse campus (it has its own pond rocks)
    for (let i = bpts.length - 1; i >= 0; i--) if (inside([bpts[i][0], bpts[i][1]], SITE.club)) bpts.splice(i, 1);
    for (let i = 0; i < 14; i++) { const sd = rand() < .5 ? -1 : 1; const w = this.entrance.localToWorld(new THREE.Vector3(sd * R(22, 34), 0, R(14, 40))); bpts.push([w.x, w.z, R(.5, 1.2)]); }
    const boulders = new THREE.InstancedMesh(bg, new THREE.MeshStandardMaterial({ color: 0xc2ad8d, roughness: .95, flatShading: true }), bpts.length);
    bpts.forEach(([x, z, s], i) => { e.set(R(0, 3), R(0, 6.28), R(0, 3)); q.setFromEuler(e); m.compose(v.set(x, .3 + s * .3, z), q, sc.set(s * R(1, 1.5), s, s * R(1, 1.4))); boulders.setMatrixAt(i, m); boulders.setColorAt(i, col.setHSL(.09, R(.12, .25), R(.55, .72))); });
    boulders.castShadow = true; boulders.receiveShadow = true; this.scene.add(boulders);

    // street lamps + light pools
    const lamps = this.roadEdge.filter((_, i) => i % 2 === 1);
    const lw = this.approach.filter(a => a.t < .4 && Math.round(a.t * 120) % 4 === 0).map(a => this.entrance.localToWorld(new THREE.Vector3(a.p.x, 0, a.p.z))).map(w => ({ x: w.x, z: w.z }));
    const L = lamps.concat(lw);
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(.08, .1, 4.8, 5).translate(0, 2.4, 0), new THREE.MeshStandardMaterial({ color: 0x2a2622, metalness: .6, roughness: .5 }), L.length);
    const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffcf96).multiplyScalar(4) }); this.lampMat = headMat;
    const head = new THREE.InstancedMesh(new THREE.SphereGeometry(.32, 10, 8), headMat, L.length);
    const pc = document.createElement('canvas'); pc.width = pc.height = 128; const pg = pc.getContext('2d'); const gr = pg.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,205,150,.85)'); gr.addColorStop(1, 'rgba(255,205,150,0)'); pg.fillStyle = gr; pg.fillRect(0, 0, 128, 128);
    const poolMat = this.poolLightMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .4 });
    const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(11, 11).rotateX(-Math.PI / 2), poolMat, L.length);
    L.forEach((p, i) => { m.makeTranslation(p.x, .3, p.z); pole.setMatrixAt(i, m); m.makeTranslation(p.x, 5.1, p.z); head.setMatrixAt(i, m); m.makeTranslation(p.x, .34, p.z); pools.setMatrixAt(i, m); });
    pole.castShadow = true; this.scene.add(pole, head, pools);
  }

  _buildLabels() {
    this.tags = {};
    for (const p of PLOTS) { const d = document.createElement('div'); d.className = 'plot-tag'; d.textContent = p.id;
      const o = new CSS2DObject(d); const [x, z] = centroid(p.inset); o.position.set(x, 2.2, z); this.scene.add(o); this.tags[p.id] = { obj: o, el: d }; o.visible = false; }
    const mk = (txt, pos, cls = 'mp-label') => { const d = document.createElement('div'); d.className = cls; d.textContent = txt; const o = new CSS2DObject(d); o.position.copy(pos); o.visible = false; this.scene.add(o); return o; };
    this.poiLabels = [
      mk('Wellness Clubhouse', this.clubC.clone().setY(14)),
      mk('Grand Entrance', this.entranceWorld(0, 14, 18)),
    ];
    for (const r of SITE.roads) { const o = mk(r.label, new THREE.Vector3(r.p[0], 1, r.p[1]), 'mp-label mp-label--road'); this.poiLabels.push(o); }
  }

  /* ---------- camera keys ---------- */
  _buildKeys() {
    const avg = ids => { let x = 0, z = 0; ids.forEach(i => { const [a, b] = centroid(PLOTS[i - 1].inset); x += a; z += b; }); return new THREE.Vector3(x / ids.length, 0, z / ids.length); };
    const south = avg(Array.from({ length: 46 }, (_, i) => i + 1)), north = avg(Array.from({ length: 13 }, (_, i) => i + 47));
    this.south = south; this.north = north;
    const sph = (t, az, el, d) => ({ t: t.clone(), p: new THREE.Vector3(t.x + Math.sin(az) * Math.cos(el) * d, t.y + Math.sin(el) * d, t.z + Math.cos(az) * Math.cos(el) * d) });
    const gateT = this.entranceWorld(0, 2, -6), gateP = this.entranceWorld(-48, 42, 118);
    this.keys = {
      overview: sph(new THREE.Vector3(0, 0, 10), -0.8, 0.5, 980),
      arrival: { t: gateT, p: gateP },
      avenues: sph(south.clone().add(new THREE.Vector3(10, 0, 50)), -1.5, 0.52, 250),
      club: sph(this.clubC, 0.85, 0.48, 230),
      half: sph(north, -0.55, 0.62, 470),
      quarter: sph(south, 0.75, 0.72, 560),
      forest: sph(new THREE.Vector3(0, 0, 20), -0.35, 0.95, 1150),
      explore: sph(new THREE.Vector3(0, 0, 0), -0.55, 0.78, 1050),
    };
    this.chapters = ['overview', 'arrival', 'avenues', 'club', 'half', 'quarter', 'forest'];
    this.chapterHighlight = { half: ['half', 'signature'], quarter: ['quarter', 'bespoke'] };
  }
  _distScale() { const a = this.camera.aspect; return a < 1 ? 1 + (1 - a) * 1.45 : (a < 1.3 ? 1.15 : 1); }
  _key(name) { const k = this.keys[name]; const s = this._distScale(); const p = k.t.clone().add(k.p.clone().sub(k.t).multiplyScalar(s)); return { t: k.t, p }; }

  /* ---------- story ---------- */
  setStoryProgress(p) {
    this.progress = p;
    const n = this.chapters.length - 1, f = Math.min(n - 1e-6, Math.max(0, p * n)), i = Math.floor(f), t = smooth(smooth(f - i));
    const A = this._key(this.chapters[i]), B = this._key(this.chapters[i + 1]);
    // lift the path between keys for a crane-like move
    const lift = Math.sin(t * Math.PI) * Math.min(160, A.p.distanceTo(B.p) * .18);
    this.camPos.lerpVectors(A.p, B.p, t).y += lift; this.camTarget.lerpVectors(A.t, B.t, t);
    const ch = this.chapters[Math.round(f)];
    if (ch !== this._chapter) { this._chapter = ch; this.setHighlight(this.chapterHighlight[ch] || null); }
    return Math.round(f);
  }
  setHighlight(cats) { this.highlight = cats; this._refreshPlots(); }

  /* ---------- modes ---------- */
  setMode(mode) {
    this.mode = mode; const c = this.controls;
    if (mode === 'explore') {
      this._setHover(null); this.setHighlight(null);
      const k = this._key('explore'); c.target.copy(this.camTarget);
      this._fly(k.p, k.t, 1.6, () => { c.enabled = true; });
      this.poiLabels.forEach(o => o.visible = true);
    } else {
      c.enabled = false; this.select(null); this.setFilter('all'); this.poiLabels.forEach(o => o.visible = false);
      this._flying = null; this.setStoryProgress(this.progress);
    }
    this._refreshPlots();
  }
  _fly(p, t, dur = 1.4, done) {
    const c = this.controls, fromP = this.camera.position.clone(), fromT = c.enabled ? c.target.clone() : this.camTarget.clone();
    c.enabled = false; const st = performance.now();
    this._flying = () => { const k = Math.min(1, (performance.now() - st) / (dur * 1000)), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.camera.position.lerpVectors(fromP, p, e); this.camera.position.y += Math.sin(e * Math.PI) * fromP.distanceTo(p) * .08;
      c.target.lerpVectors(fromT, t, e); this.camera.lookAt(c.target);
      if (k >= 1) { this._flying = null; c.enabled = true; done && done(); } };
  }
  // the render loop sleeps while the scroll film is on screen
  pause() { if (this._raf) cancelAnimationFrame(this._raf); this._raf = null; }
  resume() { if (this._raf) return; this.clock.getDelta(); const loop = () => { this._raf = requestAnimationFrame(loop); this._tick(); }; loop(); }
  resetView() { const k = this._key('explore'); this.select(null); this._fly(k.p, k.t, 1.4); }

  setFilter(cat) { this.filter = cat; this._refreshPlots(); }
  _refreshPlots() {
    const dim = new THREE.Color('#5e574e');
    for (const mesh of this.plotMeshes) { const p = mesh.userData.plot, mat = mesh.material;
      const active = this.mode === 'explore' ? (this.filter === 'all' || this.filter === p.cat) : (!this.highlight || this.highlight.includes(p.cat));
      const sel = this.selected === p.id, hov = this.hovered === p.id;
      mat.color.copy(active ? mesh.userData.base : mesh.userData.base.clone().lerp(dim, .7));
      if (sel) mat.color.set('#e3b878');
      mat.emissive.set(sel ? 0xc89b62 : hov ? 0x8a6a44 : (this.mode === 'story' && this.highlight && active ? 0x6b4e2c : 0x000000));
      mat.emissiveIntensity = sel ? .55 : hov ? .45 : .35;
      mesh.position.y = 0.3 + (sel ? 1.2 : hov ? .5 : 0);
      const tag = this.tags[p.id]; tag.obj.visible = this.mode === 'explore' || (this.mode === 'story' && !!this.highlight && active);
      tag.el.classList.toggle('is-dim', !active); tag.el.classList.toggle('is-sel', sel);
      tag.obj.position.y = 2.2 + mesh.position.y;
    }
  }

  /* ---------- picking ---------- */
  _pick(e) { const r = this.renderer.domElement.getBoundingClientRect(); this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.mouse, this.camera); const hit = this.ray.intersectObjects(this.plotMeshes, false)[0]; return hit ? hit.object.userData.plot : null; }
  _onMove(e) { if (this.mode !== 'explore' || e.pointerType === 'touch') return; const p = this._pick(e); this._setHover(p ? p.id : null, e); }
  _setHover(id, e) { if (this.hovered !== id) { this.hovered = id; this._refreshPlots(); this.renderer.domElement.style.cursor = id ? 'pointer' : ''; }
    this.opts.onHover && this.opts.onHover(id ? PLOTS[id - 1] : null, e ? { x: e.clientX, y: e.clientY } : null); }
  _onClick(e) { if (this.mode !== 'explore') return; const p = this._pick(e); this.select(p ? p.id : null, true); }

  select(id, fly = false) {
    this.selected = id || null; this.showVilla('none'); this._refreshPlots();
    if (this.selRing) { this.scene.remove(this.selRing); this.selRing.geometry.dispose(); this.selRing = null; }
    if (id) { const p = PLOTS[id - 1];
      const pts = p.inset.map(([x, z]) => new THREE.Vector3(x, 2.15, z));
      this.selRing = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.02), 120, .18, 5, true), this.glowMats[0]); this.scene.add(this.selRing);
      if (fly || this.mode === 'explore') { const [x, z] = centroid(p.inset), t = new THREE.Vector3(x, 0, z);
        const dir = this.camera.position.clone().sub(this.controls.target).setY(0).normalize(); const d = (p.cat === 'half' || p.cat === 'signature' ? 280 : 220) * this._distScale();
        this._fly(t.clone().add(dir.multiplyScalar(d * .62)).setY(d * .78), t, 1.2); } }
    this.opts.onSelect && this.opts.onSelect(id ? PLOTS[id - 1] : null);
  }

  showVilla(type) {
    if (this.villa) { this.scene.remove(this.villa); this.villa.traverse(o => o.geometry && o.geometry.dispose()); this.villa = null; }
    if (!this.selected || type === 'none') return;
    const p = PLOTS[this.selected - 1], [x, z] = centroid(p.inset), ang = longestEdgeAngle(p.inset);
    const G = new THREE.Group(); G.position.set(x, 0.85 + 1.2, z); G.rotation.y = ang;
    const white = new THREE.MeshStandardMaterial({ color: 0xf6f1e8, roughness: .7 }), glass = new THREE.MeshStandardMaterial({ color: 0x2b3640, roughness: .1, metalness: .4, emissive: 0xffc890, emissiveIntensity: this.time === 'dusk' ? .35 : 0 });
    const box = (w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; G.add(m); return m; };
    // 3,000 sft ≈ 279 m² (G 16×11 + F 11×9.4); 5,000 sft ≈ 465 m² (G 22×13 + F 16×11.2) — indicative only
    if (type === 'sanctuary') { box(16, 3.2, 11, 0, 1.6, 0, glass); box(16.6, .35, 11.6, 0, 3.35, 0, white); box(11, 3, 9.4, -2.5, 5, 0, white); box(12, .35, 10.4, -2.5, 6.6, 0, white); }
    else { box(22, 3.2, 13, 0, 1.6, 0, glass); box(23, .35, 14, 0, 3.35, 0, white); box(16, 3, 11.2, -3, 5, 0, white); box(17, .35, 12.2, -3, 6.6, 0, white);
      const pool = new THREE.Mesh(new THREE.BoxGeometry(4, .2, 12), this.poolMat); pool.position.set(15, .1, 0); G.add(pool); }
    this.villa = G; this.scene.add(G);
  }

  /* ---------- time of day ---------- */
  toggleTime() { this.time = this.time === 'dusk' ? 'day' : 'dusk'; this._presetFrom = this._snapshot(); this._presetTo = PRESETS[this.time]; this._presetT0 = performance.now(); return this.time; }
  _snapshot() { return { top: this.skyU.top.value.clone(), mid: this.skyU.mid.value.clone(), bottom: this.skyU.bottom.value.clone(), fog: this.scene.fog.color.clone(), fogD: this.scene.fog.density, sun: this.sun.color.clone(), sunI: this.sun.intensity, sunPos: this.sun.position.toArray(), hemiS: this.hemi.color.clone(), hemiG: this.hemi.groundColor.clone(), hemiI: this.hemi.intensity, exp: this.renderer.toneMappingExposure, lamp: this._lamp ?? 1 }; }
  _applyPreset(P, k, F) {
    const C = (a, b) => F ? new THREE.Color(F[a]).lerp(new THREE.Color(P[b]), k) : new THREE.Color(P[b]);
    const n = (a) => F ? lerp(F[a], P[a], k) : P[a];
    this.skyU.top.value.copy(C('top', 'top')); this.skyU.mid.value.copy(C('mid', 'mid')); this.skyU.bottom.value.copy(C('bottom', 'bottom'));
    this.scene.fog.color.copy(C('fog', 'fog')); this.scene.fog.density = n('fogD');
    this.sun.color.copy(C('sun', 'sun')); this.sun.intensity = n('sunI');
    const sp = F ? F.sunPos.map((v, i) => lerp(v, P.sunPos[i], k)) : P.sunPos; this.sun.position.set(...sp);
    this.hemi.color.copy(C('hemiS', 'hemiS')); this.hemi.groundColor.copy(C('hemiG', 'hemiG')); this.hemi.intensity = n('hemiI');
    this.renderer.toneMappingExposure = n('exp');
    const l = this._lamp = n('lamp');
    this.lampMat && this.lampMat.color.set(0xffcf96).multiplyScalar(.6 + 3.4 * l);
    this.glowMats.forEach(g => g.color.set(0xffdcae).multiplyScalar(.8 + 2.2 * l));
    this.poolLightMat && (this.poolLightMat.opacity = .4 * l);
    this.clubGlass && (this.clubGlass.emissiveIntensity = .05 + .4 * l);
    this.bloom && (this.bloom.strength = .15 + .45 * l);
  }

  /* ---------- frame ---------- */
  setActive(v) { this.active = v; }
  setViewOffset(x, y) { this.viewOffset.tx = x; this.viewOffset.ty = y; }
  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight; if (!w || !h) return;
    this.camera.aspect = w / h; this.renderer.setSize(w, h); this.labels.setSize(w, h); this.composer.setSize(w, h); this.bloom.setSize(w, h);
    this._applyViewOffset(true); this.camera.updateProjectionMatrix();
    if (this.mode === 'story') this.setStoryProgress(this.progress);
  }
  _applyViewOffset(force) {
    const o = this.viewOffset, w = this.el.clientWidth, h = this.el.clientHeight;
    const nx = lerp(o.x, o.tx, force ? 1 : .06), ny = lerp(o.y, o.ty, force ? 1 : .06);
    if (!force && Math.abs(nx - o.x) < 1e-4 && Math.abs(ny - o.y) < 1e-4) return;
    o.x = nx; o.y = ny; this.camera.setViewOffset(w, h, -o.x * w, -o.y * h, w, h); this.camera.updateProjectionMatrix();
  }
  _tick() {
    if (!this.active) return;
    const dt = Math.min(.05, this.clock.getDelta()), t = this.clock.elapsedTime;
    if (this._presetTo) { const k = Math.min(1, (performance.now() - this._presetT0) / 1400); this._applyPreset(this._presetTo, smooth(k), this._presetFrom); if (k >= 1) this._presetTo = null; }
    this._applyViewOffset();
    if (this._flying) this._flying();
    else if (this.mode === 'story') {
      const drift = new THREE.Vector3(Math.sin(t * .1) * 6, Math.sin(t * .13) * 3, Math.cos(t * .1) * 6);
      this.camera.position.lerp(this.camPos.clone().add(drift), 1 - Math.pow(.0015, dt));
      this.target.lerp(this.camTarget, 1 - Math.pow(.0015, dt)); this.camera.lookAt(this.target);
    } else if (this.controls.enabled) {
      this.controls.update();
      const tg = this.controls.target; tg.x = Math.max(-400, Math.min(400, tg.x)); tg.z = Math.max(-500, Math.min(500, tg.z)); tg.y = 0;
    }
    if (this.opts.onFrame) { const f = new THREE.Vector3(); this.camera.getWorldDirection(f); this.opts.onFrame(Math.atan2(-f.x, -f.z)); }
    this.grade.uniforms.uTime.value = t; this.uTime.value = t;
    this.composer.render(dt); this.labels.render(this.scene, this.camera);
  }
  dispose() { cancelAnimationFrame(this._raf); this._ro.disconnect(); this.renderer.dispose(); }
}
