// ZUFA — "One day at ZUFA": the living world behind the whole scroll story.
// Extends the masterplan (plots, roads, entrance, clubhouse, forest) with:
// time of day, homes that rise on the estates, cars & gate, birds, clouds, stars, and a schematic regional map.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Masterplan } from './masterplan.js';
import { rand, R, centroid, inside, inset, longestEdgeAngle, lerp, smooth } from './masterplan.js';
import { PLOTS, SITE } from './site-data.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

/* Load a self-contained .gltf (binary buffer embedded as a data: URI).
   Hosts with a strict content-security policy (e.g. the claude.ai preview) refuse to fetch data: URIs,
   so the buffer is decoded here and handed to the loader as a blob: URL, which those hosts allow. */
async function loadModel(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const json = await res.json();
  for (const b of json.buffers || []) {
    if (!b.uri || !b.uri.startsWith('data:')) continue;
    const bin = atob(b.uri.slice(b.uri.indexOf(',') + 1)), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    b.uri = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  }
  const base = url.slice(0, url.lastIndexOf('/') + 1);
  return new Promise((ok, fail) => new GLTFLoader().parse(JSON.stringify(json), base, ok, fail));
}
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/* ---------- sky by hour ---------- */
const SKY = [
  [0, '#060a1a', '#11162b'], [4.8, '#0c1330', '#24223a'], [5.8, '#3b4479', '#c98f8a'], [6.6, '#6f86c0', '#f1c2a2'],
  [8, '#79a3d8', '#e8e3d6'], [12, '#5f93d4', '#e2eaee'], [16, '#6f98cf', '#eee0cb'], [17.6, '#8781b6', '#f3c29a'],
  [18.5, '#5f5a92', '#e2a6a6'], [19.4, '#272a52', '#6a5677'], [20.5, '#0e1330', '#232541'], [24, '#060a1a', '#11162b'],
];
const skyAt = h => { h = ((h % 24) + 24) % 24; let i = 0; while (i < SKY.length - 2 && SKY[i + 1][0] <= h) i++;
  const [h0, t0, m0] = SKY[i], [h1, t1, m1] = SKY[i + 1], k = (h - h0) / (h1 - h0);
  return { top: new THREE.Color(t0).lerp(new THREE.Color(t1), k), mid: new THREE.Color(m0).lerp(new THREE.Color(m1), k) }; };

/* ---------- regional map (schematic, compressed: 1 km ≈ 100 units) ---------- */
const RG = {
  C: [7500, -300], orr: 2500, rrr: 6400,
  appa: [5085, 347], chevella: [2000, 150], mann: [380, 90], dc: [2200, -380], airport: [7300, 1900],
  road: [[-60, 240], [380, 90], [2000, 150], [3600, 300], [5085, 347]],
  airRoad: [[5085, 347], [6000, 1250], [7300, 1900]],
  train: [[12500, -700], [7500, -300], [4500, -1500], [1500, -2350], [-4500, -3100]],
};

export class World extends Masterplan {
  /* hook: called by the base after its own scene is built */
  _buildLabels() {
    super._buildLabels();
    this.st = { hour: 6, build: 0, region: 0, reg: 0 }; this.stT = { ...this.st }; this._last = {};
    this.story = { hl: null };
    this.camera.far = 140000; this.camera.updateProjectionMatrix();
    this.sky.geometry.dispose(); this.sky.geometry = new THREE.SphereGeometry(100000, 32, 16);
    this.moon = new THREE.DirectionalLight(0x8ea2d8, 0); this.moon.position.set(-300, 600, -200); this.scene.add(this.moon);
    this._buildStars(); this._buildClouds(); this._buildHomes(); this._buildLife(); this._buildRegion();
    this._loadVillaModels(); this._initRealism(); this._buildStudio(); this._loadTrees();
  }

  /* ---------- Blender tree library: forest, avenue palms and garden trees ---------- */
  _loadTrees() {
    const names = ['tree_forest_a', 'tree_forest_b', 'tree_forest_c', 'tree_garden', 'tree_palm'];
    Promise.all(names.map(n => loadModel(`assets/models/${n}.gltf`).then(g => this._mergeModel(g.scene)).catch(e => { console.warn('tree', n, e); return null; })))
      .then(geos => { if (geos.every(Boolean)) this._installTrees(...geos); });
  }
  _mergeModel(root) {
    // one geometry per model: position + normal + float RGB colour (bark and leaves share a material)
    root.updateMatrixWorld(true); const parts = [];
    root.traverse(o => { if (!o.isMesh) return; const g = o.geometry.clone().applyMatrix4(o.matrixWorld), n = g.attributes.position.count;
      const src = g.attributes.color, rgb = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { rgb[i * 3] = src ? src.getX(i) : .5; rgb[i * 3 + 1] = src ? src.getY(i) : .5; rgb[i * 3 + 2] = src ? src.getZ(i) : .5; }
      const out = new THREE.BufferGeometry(); out.setAttribute('position', g.attributes.position); out.setAttribute('normal', g.attributes.normal);
      out.setAttribute('color', new THREE.BufferAttribute(rgb, 3)); if (g.index) out.setIndex(g.index); parts.push(out.index ? out.toNonIndexed() : out); });
    return mergeGeometries(parts);
  }
  _treeMat(amp) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .82, side: THREE.DoubleSide });
    m.onBeforeCompile = sh => { sh.uniforms.uTime = this.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * .07 + instanceMatrix[3].z * .05;
          float k = max(position.y - 2., 0.) * ${amp.toFixed(3)};
          transformed.x += sin(uTime * 1.1 + ph) * k; transformed.z += cos(uTime * .8 + ph) * k * .6;
        #endif`); };
    return m;
  }
  _installTrees(fa, fb, fc, garden, palmGeo) {
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    // forest: re-use the generated positions and sizes, split across three species
    // near trees (around the community) cast shadows; the far woodland does not, which keeps it fast
    const src = this.forestCrowns, n = src.count, groups = [[], [], [], [], [], []];
    for (let i = 0; i < n; i++) { src.getMatrixAt(i, m); m.decompose(p, q, s); const far = Math.hypot(p.x, p.z * .55) > 330 ? 3 : 0; groups[far + (i * 7919) % 3].push([p.x, p.z, s.x]); }
    const mat = this._treeMat(.022);
    groups.forEach((list, k) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh([fa, fb, fc][k % 3], mat, list.length);
      list.forEach(([x, z, r], i) => { q.setFromAxisAngle(up, R(0, 6.28)); const sc = r / 4.4 * R(.9, 1.1);
        m.compose(p.set(x, 0, z), q, s.set(sc, sc * R(.9, 1.15), sc)); im.setMatrixAt(i, m);
        const b = R(1.15, 1.55); im.setColorAt(i, col.setRGB(b * R(.9, 1.05), b, b * R(.8, 1.0))); });
      im.castShadow = k < 3; im.receiveShadow = k < 3 && !this.isMobile; this.scene.add(im);
    });
    src.visible = false; this.forestTrunks.visible = false;
    // avenue palms: same placements, real fronds
    this.palmMesh.geometry = palmGeo; this.palmMesh.material = this._treeMat(.012);
    for (let i = 0; i < this.palmMesh.count; i++) { const b = R(1.1, 1.4); this.palmMesh.setColorAt(i, col.setRGB(b, b, b * .9)); }
    this.palmMesh.instanceColor.needsUpdate = true;
    // garden / orchard trees inside the plots grow with their home
    this.gCrowns.geometry = garden; this.gCrowns.material = this._treeMat(.03); this.gTrunks.visible = false; this._gardenModel = true;
    for (let i = 0; i < this.gCrowns.count; i++) { const b = R(1.15, 1.5); this.gCrowns.setColorAt(i, col.setRGB(b * R(.9, 1.05), b, b * R(.75, .95))); }
    this.gCrowns.instanceColor.needsUpdate = true;
    this._applyBuild(this.st.build, true);
  }

  /* ---------- realism: live sky reflections + rippling water ---------- */
  _initRealism() {
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envScene = new THREE.Scene(); this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), this.sky.material));
    const ripple = mat => { mat.onBeforeCompile = sh => { sh.uniforms.uTime = this.uTime;
      sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <project_vertex>', `vec4 wpR = vec4(transformed, 1.);
        #ifdef USE_INSTANCING
          wpR = instanceMatrix * wpR;
        #endif
        vWPos = (modelMatrix * wpR).xyz;
        #include <project_vertex>`);
      sh.fragmentShader = 'uniform float uTime; varying vec3 vWPos;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { float t = uTime; vec2 p = vWPos.xz;
          vec2 rn = vec2(sin(p.x*2.1+t*1.3)+sin(p.y*1.7-t*1.1)+sin((p.x+p.y)*3.3+t*1.9), cos(p.y*2.3+t*1.2)+cos(p.x*1.5-t*.9)+cos((p.x-p.y)*3.1-t*1.7)) * .04;
          normal = normalize(normal + (viewMatrix * vec4(rn.x, 0., rn.y, 0.)).xyz); }`); };
      mat.color.set(0x2f8fa3); mat.roughness = .04; mat.metalness = .1; mat.envMapIntensity = 1.6; mat.needsUpdate = true; };
    ripple(this.homeMats.water); ripple(this.poolMat);
    this.pondMat = new THREE.MeshStandardMaterial({ name: 'ZUFA_Pond' }); ripple(this.pondMat);
    this.pondMat.color.set(0x24413a); this.pondMat.roughness = .06; this.pondMat.envMapIntensity = 1.3;
    // only reflective surfaces take the sky reflection; lawns and roads keep their own lighting
    this.homeMats.glass.envMapIntensity = 1.2;
    this.envMats = new Set([this.homeMats.water, this.poolMat, this.homeMats.glass, this.pondMat]);
  }
  _updateEnv() {
    const old = this._envRT; this._envRT = this.pmrem.fromScene(this.envScene, 0, .1, 100);
    for (const m of this.envMats) { if (!m.envMap) m.needsUpdate = true; m.envMap = this._envRT.texture; }
    if (old) old.dispose();
  }

  /* ---------- Villa Studio: orbit a finished villa, with craft callouts ---------- */
  _buildStudio() {
    // callout positions are in Blender model space (x, y, z-up)
    const H = {
      sanctuary: [['Terracotta hipped roof', 'Clay tiles with a decorative ridge', 0, 7, 7.4], ['Natural pool', 'Freeform, edged with boulders', 0.5, -7.6, 1.0],
        ['Island dining deck', 'Reached by stepping stones', 5.0, -8.4, 1.8], ['Timber-framed glazing', 'Tall glass doors onto the terrace', 5.9, 1.9, 2.6], ['Stone and stucco', 'Rubble-stone base and lantern pilasters', -4.6, 1.7, 3.0]],
      estate: [['Standing-seam metal roof', 'Copper-brown, with a deep fascia', -4, 6.75, 7.4], ['Lagoon pool', 'Sandstone boulders and stepping stones', -8.0, -9.5, 1.0],
        ['Island dining', 'Seats six, out on the water', -2.4, -8.6, 1.8], ['Sunken lounge', 'A stone-walled seating court', -11.2, -2.4, 0.9], ['Black-framed glazing', 'Floor-to-ceiling sliding doors', -7, 0.3, 2.8]],
    };
    this.studioSpots = {};
    for (const [type, spots] of Object.entries(H)) {
      const home = this.homes.find(h => h.p.id === (type === 'estate' ? 52 : 25));
      this.studioSpots[type] = spots.map(([t, d, x, y, z]) => { const el = document.createElement('div'); el.className = 'hs'; el.innerHTML = '<i></i><span><b>' + t + '</b>' + d + '</span>';
        const o = new CSS2DObject(el); o.position.copy(new THREE.Vector3(x, z, -y).applyQuaternion(home.G.quaternion).add(home.G.position)); o.visible = false; this.scene.add(o); return o; });
    }
    this.renderer.domElement.addEventListener('pointerdown', () => { if (this.mode === 'studio') this.controls.autoRotate = false; });
  }
  enterStudio(type) {
    if (this.mode !== 'studio') this._storyT = { ...this.stT };
    this.mode = 'studio'; this.studioType = type; this.setHighlight(null);
    Object.assign(this.stT, { build: 1, region: 0, reg: 0 });
    const home = this.homes.find(h => h.p.id === (type === 'estate' ? 52 : 25)), t = home.G.position.clone().setY(1.5), c = this.controls;
    for (const k in this.studioSpots) this.studioSpots[k].forEach(o => o.visible = k === type);
    c.minDistance = 22; c.maxDistance = 130; c.maxPolarAngle = 1.44; c.autoRotate = true; c.autoRotateSpeed = .45;
    const a = home.G.rotation.y + .7, d = (type === 'estate' ? 60 : 46) * this._distScale();
    this._fly(t.clone().add(new THREE.Vector3(Math.sin(a) * d, d * .5, Math.cos(a) * d)), t, 1.8);
  }
  exitStudio() {
    const c = this.controls; c.enabled = false; c.autoRotate = false; c.minDistance = 35; c.maxDistance = 1500; c.maxPolarAngle = 1.36; this._flying = null;
    for (const k in this.studioSpots) this.studioSpots[k].forEach(o => o.visible = false);
    this.mode = 'story'; if (this._storyT) Object.assign(this.stT, this._storyT);
  }

  /* ---------- Blender-modelled villas (assets/models/*.glb, built in blender/zufa_assets.blend) ---------- */
  _loadVillaModels() {
    const files = { sanctuary: 'assets/models/sanctuary.gltf', estate: 'assets/models/estate.gltf', clubhouse: 'assets/models/clubhouse.gltf',
      entrance: 'assets/models/entrance.gltf', car: 'assets/models/car_suv.gltf' };
    this.villaModels = {};
    for (const [k, url] of Object.entries(files)) loadModel(url).then(g => {
      this.villaModels[k] = g.scene;
      if (k === 'clubhouse') this._installClubhouse(g.scene);
      else if (k === 'entrance') this._installEntrance(g.scene);
      else if (k === 'car') this._installCars(g.scene);
      else if (this.villaModels.sanctuary && this.villaModels.estate) this._installVillaModels();
    }).catch(e => console.warn('model', url, e));
  }
  _installEntrance(model) {
    // the Blender entrance replaces the procedural canopy, walls and forecourt; road, gate leaves and scanner stay
    const E = this.entrance;
    E.children.forEach(c => {
      const edgeLine = c.isMesh && c.geometry.type === 'TubeGeometry' && c.scale.y < 1;
      if (!(c === this.approachRoad || this._keepAtGate.has(c) || edgeLine)) c.visible = false;
    });
    model.traverse(o => { if (o.isMesh) { o.material = this._villaMat(o.material); o.castShadow = o.receiveShadow = true; } });
    model.position.y = .02; E.add(model); this.entranceModel = model;
  }
  _installCars(model) {
    const night = { ZUFA_Headlight: this.headMat, ZUFA_Taillight: this.tailMat };
    for (const c of this.cars) {
      c.g.clear();
      const m = model.clone(true), paint = new THREE.MeshStandardMaterial({ color: c.paint, metalness: .65, roughness: .22, envMapIntensity: 1.2 });
      this.envMats && this.envMats.add(paint); if (this._envRT) paint.envMap = this._envRT.texture;
      m.traverse(o => { if (!o.isMesh) return; o.castShadow = true;
        const n = o.material.name; o.material = n === 'ZUFA_Car_Paint' ? paint : night[n] || (n === 'ZUFA_Glass' ? this.homeMats.glass : o.material); });
      c.g.add(m);
    }
  }
  _installClubhouse(model) {
    // same frame as the homes: model X along the parcel's longest edge, model -Y towards its garden
    this.clubGroup.visible = false;
    const G = new THREE.Group(); G.position.set(this.clubC.x, .8, this.clubC.z); G.rotation.y = longestEdgeAngle(SITE.club) - Math.PI / 2;
    model.traverse(o => { if (o.isMesh) { o.material = this._villaMat(o.material); o.castShadow = o.receiveShadow = true; } });
    G.add(model); this.scene.add(G); this.clubModel = G;
  }
  _villaMat(m) { // share the night-glow materials with the rest of the world
    const M = this.homeMats;
    if (m.name === 'ZUFA_Glass') return M.glass;
    if (m.name === 'ZUFA_Water') return M.water;
    if (m.name === 'ZUFA_Shade') return M.arcade;
    if (m.name === 'ZUFA_Pond') return this.pondMat;
    if (/^ZUFA_(Leaf|Olive_Leaf|Lavender|Bloom|Reed)/.test(m.name)) {   // foliage: per-leaf colours from Blender
      const k = m.name; this._fol = this._fol || {};
      return this._fol[k] || (this._fol[k] = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78, side: THREE.DoubleSide, name: k }));
    }
    // baked villa surfaces: a touch of sky reflection for depth
    m.envMapIntensity = .35; if (this.envMats && !this.envMats.has(m)) { this.envMats.add(m); if (this._envRT) { m.envMap = this._envRT.texture; m.needsUpdate = true; } }
    return m;
  }
  _installVillaModels() {
    const parts = type => { const src = this.villaModels[type === 'grand' ? 'estate' : type], out = [];
      src.updateMatrixWorld(true); src.traverse(o => { if (o.isMesh) out.push({ geo: o.geometry, mat: this._villaMat(o.material), m: o.matrixWorld.clone() }); }); return out; };
    this.villaInst = [];
    for (const type of ['sanctuary', 'estate', 'grand']) {
      const homes = this.homes.filter(h => h.type === type); if (!homes.length) continue;
      homes.forEach(h => { h.G.clear(); });           // replace placeholder boxes
      for (const p of parts(type)) {
        const im = new THREE.InstancedMesh(p.geo, p.mat, homes.length); im.receiveShadow = true;
        im.castShadow = !(p.mat.vertexColors && this.isMobile);   // phones: skip foliage shadows
        im.frustumCulled = false; this.scene.add(im); this.villaInst.push({ im, homes, local: p.m, s: type === 'grand' ? 1.2 : 1 });
      }
    }
    this._updateVillaInstances();
  }
  _updateVillaInstances() {
    if (!this.villaInst) return;
    const m = new THREE.Matrix4(), base = new THREE.Matrix4(), S = new THREE.Matrix4();
    for (const v of this.villaInst) {
      v.homes.forEach((h, i) => { const g = h.grow, sy = g > .002 ? g : 0, sx = g > .002 ? 1 : 0;
        base.compose(h.G.position, h.G.quaternion, new THREE.Vector3(v.s * sx, v.s * sy, v.s * sx));
        m.multiplyMatrices(base, v.local); v.im.setMatrixAt(i, m); });
      v.im.instanceMatrix.needsUpdate = true;
    }
  }
  _applyPreset() { /* replaced by _applyHour */ }
  setStoryProgress() { return 0; }

  _buildKeys() {
    super._buildKeys();
    const sph = (t, az, el, d) => ({ t: t.clone(), p: new THREE.Vector3(t.x + Math.sin(az) * Math.cos(el) * d, t.y + Math.sin(el) * d, t.z + Math.cos(az) * Math.cos(el) * d) });
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const pc = id => { const [x, z] = centroid(PLOTS[id - 1].inset); return V(x, 0, z); };
    const E = this.entranceWorld;
    Object.assign(this.keys, {
      sky: sph(V(0, 0, 0), -0.55, 0.62, 3000),
      club: sph(this.clubC, -1.2, 0.5, 200),
      forestLow: { t: V(40, 0, -40), p: V(-360, 110, 170) },
      buildWide: sph(this.south.clone().add(V(0, 0, 20)), 0.55, 0.62, 560),
      villaQ: sph(pc(25), -0.95, 0.4, 92),
      villaH: sph(pc(52), 0.75, 0.42, 120),
      farm: sph(pc(56), -0.45, 0.5, 125),
      buildWide2: sph(V(0, 0, -20), -2.5, 0.5, 820),
      avenues2: sph(this.south.clone().add(V(-10, 0, 10)), 1.9, 0.42, 250),
      arrivalNight: { t: E(0, 0, -110), p: E(-30, 62, 120) },
      regionWide: sph(V(3600, 0, 0), -0.12, 1.12, 15500),
      regionWest: sph(V(1700, 0, -150), -0.55, 0.78, 6200),
      regionCity: sph(V(5600, 0, 700), 0.35, 0.82, 9500),
      nightSky: { t: V(380, 230, -420), p: V(-260, 70, 330) },
      finale: sph(V(0, 0, 0), -0.7, 0.6, 1150),
    });
  }

  /* ---------- story API ---------- */
  setStory({ a, b, k, hour, build, region, reg, hl }) {
    const A = this._key(a), B = this._key(b), t = smooth(smooth(clamp(k)));
    const lift = Math.sin(t * Math.PI) * Math.min(160, A.p.distanceTo(B.p) * .18);
    this.camPos.lerpVectors(A.p, B.p, t).y += lift; this.camTarget.lerpVectors(A.t, B.t, t);
    Object.assign(this.stT, { hour, build, region, reg });
    const key = (hl || []).join(',');
    if (key !== this._hlKey) { this._hlKey = key; this.setHighlight(hl && hl.length ? hl : null); }
  }
  snap() { Object.assign(this.st, this.stT); this.camera.position.copy(this.camPos); this.target.copy(this.camTarget); }
  setHour(h) { this.stT.hour = h; }

  setMode(mode) {
    if (mode === 'explore') { this._storyT = { ...this.stT }; this.stT.build = 0; this.stT.region = 0; this.stT.reg = 0; this.stT.hour = clamp(this.stT.hour, 7, 20.5); }
    else if (this._storyT) { Object.assign(this.stT, this._storyT); }
    super.setMode(mode);
  }

  /* ---------- stars & clouds ---------- */
  _buildStars() {
    const n = 2200, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const u = rand(), v = R(0.04, 1), th = u * Math.PI * 2, r = 80000; const y = v * v; const s = Math.sqrt(1 - y * y);
      pos.set([Math.cos(th) * s * r, y * r, Math.sin(th) * s * r], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(g, this.starMat); this.stars.frustumCulled = false; this.scene.add(this.stars);
  }
  _buildClouds() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d');
    for (let i = 0; i < 22; i++) { const x = R(60, 196), y = R(90, 170), r = R(30, 70); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    this.cloudMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, fog: false });
    this.clouds = new THREE.Group();
    for (let i = 0; i < 46; i++) { const s = new THREE.Sprite(this.cloudMat); const a = R(0, 6.28), d = R(150, 1900); s.position.set(Math.cos(a) * d, R(420, 900), Math.sin(a) * d); const k = R(380, 900); s.scale.set(k, k * .55, 1); this.clouds.add(s); }
    this.scene.add(this.clouds);
  }

  /* ---------- homes rising on the estates ---------- */
  _buildHomes() {
    const M = this.homeMats = {
      white: new THREE.MeshStandardMaterial({ color: 0xf3eee5, roughness: .7 }),
      stone: new THREE.MeshStandardMaterial({ color: 0xcdbb9c, roughness: .9 }),
      timber: new THREE.MeshStandardMaterial({ color: 0x8a6646, roughness: .75 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x6f8590, roughness: .1, metalness: .35, emissive: 0xffc58a, emissiveIntensity: 0 }),
      water: new THREE.MeshStandardMaterial({ color: 0x5fb6c8, roughness: .06, metalness: .2, emissive: 0x1d6c80, emissiveIntensity: .2 }),
      crop1: new THREE.MeshStandardMaterial({ color: 0x7b8f47, roughness: 1 }), crop2: new THREE.MeshStandardMaterial({ color: 0xa48a58, roughness: 1 }),
      roofDark: new THREE.MeshStandardMaterial({ color: 0xa9532c, roughness: .75 }),
      stucco: new THREE.MeshStandardMaterial({ color: 0xf4ece0, roughness: .85 }),
      tile: new THREE.MeshStandardMaterial({ color: 0xb4582f, roughness: .7, flatShading: true, side: THREE.DoubleSide }),
      arcade: new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: .9, emissive: 0xffb877, emissiveIntensity: 0 }),
      paving: new THREE.MeshStandardMaterial({ color: 0xd8c4a2, roughness: .9 }),
    };
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const gate = new THREE.Vector2(SITE.gate[0], SITE.gate[1]);
    const override = { 25: ['sanctuary', .02], 52: ['estate', .05], 56: ['farm', .09], 31: ['custom', .12] };
    this.homes = []; this.homeGroup = new THREE.Group(); this.scene.add(this.homeGroup);
    const trees = [];
    let maxD = 0; PLOTS.forEach(p => { const [x, z] = centroid(p.inset); p._gd = gate.distanceTo(new THREE.Vector2(x, z)); maxD = Math.max(maxD, p._gd); });

    for (const p of PLOTS) {
      const h = ((p.id * 37) % 100) / 100;
      // both villa types can sit on quarter- or half-acre estates
      let type = p.cat === 'half' ? (h < .35 ? 'sanctuary' : h < .72 ? 'estate' : 'farm') : p.cat === 'signature' ? 'grand' : (h < .4 ? 'sanctuary' : h < .62 ? 'estate' : h < .84 ? 'farm' : 'custom');
      let order = .1 + .9 * (p._gd / maxD) * .95;
      if (override[p.id]) [type, order] = override[p.id];
      const [cx, cz] = centroid(p.inset), G = new THREE.Group();
      G.position.set(cx, .85, cz); G.rotation.y = longestEdgeAngle(p.inset) - Math.PI / 2; this.homeGroup.add(G); G.updateMatrixWorld(true);
      const local = p.inset.map(([x, z]) => { const v = G.worldToLocal(new THREE.Vector3(x, .85, z)); return [v.x, v.z]; });
      let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9; local.forEach(([x, z]) => { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); });
      const box = (w, hh, d, x, y, z, m) => { const o = new THREE.Mesh(unit, m); o.scale.set(w, hh, d); o.position.set(x, y + hh / 2, z); o.castShadow = o.receiveShadow = true; G.add(o); return o; };
      const flat = (w, d, x, z, m, y = .02) => box(w, .2, d, x, y, z, m);
      const tree = (x, z, s) => { if (inside([x, z], local)) trees.push({ G, x, z, s, home: this.homes.length }); };
      let foot = [0, 0];
      if (type === 'sanctuary' || type === 'estate' || type === 'grand') {
        foot = this._villa(G, type);
      } else if (type === 'custom') { // free-zone courtyard house
        box(18, 3.4, 4, 0, .2, -7, M.white); box(18, 3.4, 4, 0, .2, 7, M.glass); box(4, 3.4, 10, -7, .2, 0, M.white); box(4, 3.4, 10, 7, .2, 0, M.timber);
        box(19, .35, 5, 0, 3.6, -7, M.roofDark); box(19, .35, 5, 0, 3.6, 7, M.roofDark); flat(9, 9, 0, 0, M.crop1, .05); tree(0, 0, 1.4); foot = [10, 10];
      } else { // farm estate: cottage, crop strips and orchard
        const x0 = minx + 7; box(9, 3, 7, x0, .2, 0, M.white);
        { const roof = new THREE.Mesh(this._pyrGeo || (this._pyrGeo = new THREE.ConeGeometry(Math.SQRT2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, .5, 0)), M.roofDark);
          roof.scale.set(5.4, 2.3, 4.4); roof.position.set(x0, 3.2, 0); roof.castShadow = true; G.add(roof); } flat(4, 4, x0 + 7, 0, M.timber, .05);
        const span = maxx - x0 - 12, rows = Math.max(2, Math.floor((maxz - minz - 6) / 2.4));
        for (let i = 0; i < rows; i++) { const z = minz + 3 + i * 2.4; if (z > maxz - 3) break; flat(Math.max(4, span * .45), 1.1, x0 + 9 + span * .225, z, i % 2 ? M.crop1 : M.crop2, .04); }
        for (let x = x0 + 9 + span * .5; x < maxx - 3; x += 5.5) for (let z = minz + 3.5; z < maxz - 3; z += 5.5) tree(x + R(-.6, .6), z + R(-.6, .6), R(.75, 1.05));
        foot = [1e9, 1e9];
      }
      // garden trees around villas
      if (foot[0] < 1e8) for (let i = 0; i < 18 && trees.filter(t => t.G === G).length < 4; i++) { const x = R(minx + 2, maxx - 2), z = R(minz + 2, maxz - 2); if (Math.abs(x) > foot[0] + 2 || Math.abs(z) > foot[1] + 2) tree(x, z, R(.85, 1.2)); }
      G.scale.y = .001; G.visible = false;
      this.homes.push({ p, G, type, order, grow: -1 });
    }
    // orchard / garden trees (instanced, grow with their home)
    const crown = new THREE.IcosahedronGeometry(1, 1); const trunk = new THREE.CylinderGeometry(.12, .18, 1, 5).translate(0, .5, 0);
    this.gCrowns = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ roughness: .95, color: 0xffffff }), trees.length);
    this.gTrunks = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }), trees.length);
    const col = new THREE.Color();
    this.gTrees = trees.map((t, i) => { const w = t.G.localToWorld(new THREE.Vector3(t.x, 0, t.z)); this.gCrowns.setColorAt(i, col.setHSL(R(.22, .3), R(.35, .5), R(.24, .36))); return { ...t, w }; });
    this.gCrowns.castShadow = this.gTrunks.castShadow = true; this.scene.add(this.gCrowns, this.gTrunks);
    this._applyBuild(0, true);
  }
  /* Spanish-style single-level villas (indicative massing).
     Sanctuary ≈ 3,000 sft: L-plan (20×9 m + 9×11 m ≈ 279 m²), Andalusian.
     Estate ≈ 5,000 sft: U-plan (24×10 m + 2 × 9×12.5 m ≈ 465 m²), Californian. Returns the footprint half-extents. */
  _villa(G, type) {
    const M = this.homeMats, unit = this._unit || (this._unit = new THREE.BoxGeometry(1, 1, 1));
    const box = (w, h, d, x, y, z, m, shadow = true) => { const o = new THREE.Mesh(unit, m); o.scale.set(w, h, d); o.position.set(x, y + h / 2, z); o.castShadow = shadow; o.receiveShadow = true; G.add(o); return o; };
    const hip = (w, d, h) => { // hipped roof with a ridge along the longer side
      const L = Math.max(w, d), S = Math.min(w, d), r = (L - S) / 2, sw = w >= d;
      const P = (a, y, b) => sw ? [a, y, b] : [b, y, a];
      const c = [P(-L / 2, 0, -S / 2), P(L / 2, 0, -S / 2), P(L / 2, 0, S / 2), P(-L / 2, 0, S / 2)], r1 = P(-r, h, 0), r2 = P(r, h, 0);
      const t = [c[0], c[1], r2, c[0], r2, r1, c[2], c[3], r1, c[2], r1, r2, c[1], c[2], r2, c[3], c[0], r1];
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(t.flat(), 3)); g.computeVertexNormals(); return g; };
    const wing = (w, d, x, z) => { box(w, 3.4, d, x, .2, z, M.stucco); const m = new THREE.Mesh(hip(w + 1.2, d + 1.2, Math.min(w, d) * .28), M.tile); m.position.set(x, 3.6, z); m.castShadow = true; G.add(m);
      // window bands (glow at night)
      if (w >= d) { box(w * .7, 1.3, .15, x, 1.2, z + d / 2 + .05, M.glass, false); box(w * .7, 1.3, .15, x, 1.2, z - d / 2 - .05, M.glass, false); }
      else { box(.15, 1.3, d * .7, x + w / 2 + .05, 1.2, z, M.glass, false); box(.15, 1.3, d * .7, x - w / 2 - .05, 1.2, z, M.glass, false); } };
    if (type === 'sanctuary') {
      box(23, .22, 24, 0, 0, 1.5, M.paving, false);
      wing(20, 9, 0, -6); wing(9, 11, -5.5, 4);
      box(12, 2.6, 2.4, 3.5, .2, -.7, M.arcade); // shaded arcade facing the courtyard
      box(9, .25, 4, 5.5, .2, 5, M.water, false); // private pool
      return [13.5, 13.5];
    }
    const s = type === 'grand' ? 1.2 : 1;
    box(27 * s, .22, 26 * s, 0, 0, 1.5 * s, M.paving, false);
    wing(24 * s, 10 * s, 0, -6 * s); wing(9 * s, 12.5 * s, -7.5 * s, 5.25 * s); wing(9 * s, 12.5 * s, 7.5 * s, 5.25 * s);
    box(14 * s, 2.6, 2.4, 0, .2, .4 * s, M.arcade);
    box(5 * s, .25, 9 * s, 0, .2, 6.5 * s, M.water, false); // private pool in the courtyard
    return [15 * s, 15 * s];
  }
  showVilla(type) {
    if (this.villa) { this.scene.remove(this.villa); this.villa = null; }
    if (!this.selected || type === 'none') return;
    const p = PLOTS[this.selected - 1], [x, z] = centroid(p.inset);
    const G = new THREE.Group(); G.position.set(x, .85 + 1.2, z); G.rotation.y = longestEdgeAngle(p.inset) - Math.PI / 2;
    const key = type === 'estate' ? 'estate' : 'sanctuary', model = this.villaModels && this.villaModels[key];
    if (model) { const c = model.clone(true); c.traverse(o => { if (o.isMesh) { o.material = this._villaMat(o.material); o.castShadow = o.receiveShadow = true; } }); G.add(c); }
    else this._villa(G, key);
    this.villa = G; this.scene.add(G);
  }
  _applyBuild(b, force) {
    let changed = false;
    for (const h of this.homes) { const g = clamp((b * 1.3 - h.order) / .28); const e = g < 1 ? 1 - Math.pow(1 - g, 3) : 1;
      if (force || Math.abs(e - h.grow) > .002) { h.grow = e; h.G.visible = e > .002; h.G.scale.y = Math.max(.001, e); changed = true; } }
    if (!changed) return;
    this._updateVillaInstances();
    // lawns green up as each home is built
    const lawn = this._lawn || (this._lawn = new THREE.Color('#9caf6e'));
    for (const h of this.homes) { const mesh = this.plotById[h.p.id]; if (!mesh.userData.base0) mesh.userData.base0 = mesh.userData.base.clone();
      mesh.userData.base.copy(mesh.userData.base0).lerp(lawn, .78 * h.grow); }
    this._refreshPlots();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
    this.gTrees.forEach((t, i) => { const e = Math.max(.0001, this.homes[t.home].grow) * t.s;
      if (this._gardenModel) m.compose(v.set(t.w.x, .85, t.w.z), q, s.set(e, e, e));   // Blender garden tree, origin at its base
      else m.compose(v.set(t.w.x, .85 + 1.1 * e + 1.3 * e, t.w.z), q, s.set(1.5 * e, 1.7 * e, 1.5 * e));
      this.gCrowns.setMatrixAt(i, m);
      m.compose(v.set(t.w.x, .85, t.w.z), q, s.set(e, 1.6 * e, e)); this.gTrunks.setMatrixAt(i, m); });
    this.gCrowns.instanceMatrix.needsUpdate = this.gTrunks.instanceMatrix.needsUpdate = true;
  }

  /* ---------- life: cars, gate, scanner, birds ---------- */
  _buildLife() {
    const E = this.entrance;
    this.gateMesh.visible = false;
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x1d1a17, metalness: .6, roughness: .45 });
    this.leaves = [-1, 1].map(s => { const l = new THREE.Mesh(new THREE.BoxGeometry(9, 3, .3), leafMat); l.position.set(s * 4.5, 1.5, 0); l.castShadow = true; E.add(l); return l; });
    const post = new THREE.Mesh(new THREE.BoxGeometry(.5, 1.6, .5), leafMat); post.position.set(5.5, .8, 6); E.add(post);
    this.beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4040).multiplyScalar(3), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(4.6, .08), this.beamMat); beam.position.set(3.2, 1.1, 6); E.add(beam);
    this._keepAtGate = new Set([post, beam, ...this.leaves]);

    // path: from far along the boulevard, through the gate, into the site
    const pts = this.approach.slice().reverse().filter((_, i) => i % 3 === 0).map(a => E.localToWorld(new THREE.Vector3(a.p.x, 0, a.p.z)));
    pts.push(E.localToWorld(new THREE.Vector3(0, 0, -45)), E.localToWorld(new THREE.Vector3(0, 0, -90)));
    this.carPath = new THREE.CatmullRomCurve3(pts); this.carLen = this.carPath.getLength();
    const body = new THREE.BoxGeometry(1.9, .9, 4.5).translate(0, .75, 0), cabin = new THREE.BoxGeometry(1.7, .7, 2.4).translate(0, 1.5, -.2);
    const lamp = new THREE.BoxGeometry(.35, .18, .1);
    this.headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2d6).multiplyScalar(4) });
    this.tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a20).multiplyScalar(3) });
    const paints = [0x1b1d21, 0xe9e6e0, 0x3a3f46, 0x6b5a48, 0x22282f];
    this.cars = paints.map((c, i) => { const g = new THREE.Group(); const pm = new THREE.MeshStandardMaterial({ color: c, metalness: .6, roughness: .3 });
      const b = new THREE.Mesh(body, pm), cb = new THREE.Mesh(cabin, new THREE.MeshStandardMaterial({ color: 0x15181c, metalness: .7, roughness: .15 }));
      b.castShadow = true; g.add(b, cb);
      for (const s of [-.65, .65]) { const h = new THREE.Mesh(lamp, this.headMat); h.position.set(s, .85, 2.26); g.add(h); const t = new THREE.Mesh(lamp, this.tailMat); t.position.set(s, .9, -2.26); g.add(t); }
      this.scene.add(g); return { g, phase: i / paints.length, paint: c }; });

    // birds
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, .4, -1.3, .25, -.2, 0, 0, -.2, 0, 0, .4, 1.3, .25, -.2, 0, 0, -.2], 3)); bg.computeVertexNormals();
    this.birdMat = new THREE.MeshBasicMaterial({ color: 0x1e1c1a, side: THREE.DoubleSide, transparent: true, opacity: 0 });
    this.birds = new THREE.InstancedMesh(bg, this.birdMat, 34);
    this.birdData = Array.from({ length: 34 }, (_, i) => ({ r: R(120, 380), y: R(55, 120), s: R(.08, .14) * (rand() < .5 ? 1 : -1), ph: R(0, 6.28), cx: R(-120, 120), cz: R(-200, 200), k: R(1.6, 2.4) }));
    this.scene.add(this.birds);
  }
  _updateLife(t, n) {
    const E = this.entrance, gateW = E.localToWorld(new THREE.Vector3(0, 0, 0));
    let nearest = 1e9, scanning = false;
    for (const c of this.cars) {
      const u = ((t * 12 / this.carLen) + c.phase) % 1.25;
      if (u > 1) { c.g.visible = false; continue; }
      const p = this.carPath.getPointAt(u), tg = this.carPath.getTangentAt(u);
      const left = new THREE.Vector3(tg.z, 0, -tg.x).multiplyScalar(-3.2); // keep left
      c.g.position.copy(p).add(left).setY(.15); c.g.rotation.y = Math.atan2(tg.x, tg.z);
      const d = c.g.position.distanceTo(gateW), inside = u > .93; c.g.visible = !(u > .985);
      const s = inside ? clamp((.985 - u) / .05) : 1; c.g.scale.setScalar(Math.max(.001, s));
      if (!inside) nearest = Math.min(nearest, d); if (d < 22 && d > 6 && !inside) scanning = true;
    }
    const open = clamp((32 - nearest) / 14); this._open = lerp(this._open || 0, open, .06);
    this.leaves.forEach((l, i) => { l.position.x = (i ? 1 : -1) * (4.5 + this._open * 8.2); });
    this.beamMat.opacity = scanning ? .8 : lerp(this.beamMat.opacity, 0, .1);
    this.beamMat.color.set(nearest < 14 ? 0x40ff9a : 0xff4040).multiplyScalar(3);
    // birds
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
    this.birdData.forEach((b, i) => { const a = b.ph + t * b.s; v.set(b.cx + Math.cos(a) * b.r, b.y + Math.sin(t * .3 + i) * 6, b.cz + Math.sin(a) * b.r);
      e.set(0, -a + (b.s > 0 ? Math.PI : 0), 0); q.setFromEuler(e); const f = .35 + .65 * Math.abs(Math.sin(t * b.k * 3 + i));
      m.compose(v, q, s.set(1.6, 1.6 * f, 1.6)); this.birds.setMatrixAt(i, m); });
    this.birds.instanceMatrix.needsUpdate = true;
  }

  /* ---------- regional map ---------- */
  _buildRegion() {
    const G = this.region = new THREE.Group(); G.visible = false; this.scene.add(G);
    const V = ([x, z], y = 6) => new THREE.Vector3(x, y, z);
    this.regMats = [];
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(90000, 90000).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uOp: { value: 0 } },
      vertexShader: 'varying vec2 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: 'uniform float uOp; varying vec2 vW; void main(){ vec2 g = abs(fract(vW/1000.)-.5); float ln = 1.-smoothstep(0.,.006,min(g.x,g.y)); float r = length(vW-vec2(4000.,0.)); float f = 1.-smoothstep(7000.,22000.,r); vec3 c = mix(vec3(.03,.032,.04), vec3(.13,.12,.14), ln*.7); gl_FragColor = vec4(c, uOp*f); }',
    }));
    plane.position.y = -4; plane.renderOrder = -5; G.add(plane); this.regPlane = plane.material;

    const routeMat = (hex, dash = 0) => { const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color(hex) }, uProg: { value: 0 }, uOp: { value: 0 }, uTime: this.uTime, uDash: { value: dash } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uProg, uOp, uTime, uDash; varying vec2 vUv; void main(){ if (vUv.x > uProg) discard; if (uDash > 0. && fract(vUv.x*uDash) > .55) discard; float f = fract(vUv.x*4. - uTime*.12); float pulse = smoothstep(0.,.015,f)*(1.-smoothstep(.015,.08,f)); float head = smoothstep(uProg-.03, uProg, vUv.x); gl_FragColor = vec4(uColor*(1.3 + 2.4*pulse + 2.*head), uOp); }' });
      this.regMats.push(m); return m; };
    const tube = (pts, r, mat, closed = false) => { const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), closed ? 256 : 220, r, 6, closed), mat); G.add(m); return m; };
    const circle = (c, rad, y = 6) => Array.from({ length: 128 }, (_, i) => { const a = i / 128 * Math.PI * 2; return new THREE.Vector3(c[0] + Math.cos(a) * rad, y, c[1] + Math.sin(a) * rad); });

    this.rOrr = routeMat('#e2bf86'); tube(circle(RG.C, RG.orr), 22, this.rOrr, true);
    this.rRoad = routeMat('#f3d7a8'); tube(RG.road.map(p => V(p)), 20, this.rRoad);
    this.rWiden = routeMat('#ffb36b'); tube(RG.road.slice(1).map(p => V(p, 8)), 36, this.rWiden);
    this.rRRR = routeMat('#9fd0ff', 60); tube(circle(RG.C, RG.rrr), 26, this.rRRR, true);
    this.rAir = routeMat('#c7a6ff'); tube(RG.airRoad.map(p => V(p)), 22, this.rAir);
    this.trainCurve = new THREE.CatmullRomCurve3(RG.train.map(p => V(p, 10)));
    this.rTrain = routeMat('#7ef0d8'); G.add(new THREE.Mesh(new THREE.TubeGeometry(this.trainCurve, 260, 18, 6), this.rTrain));
    this.trainDot = new THREE.Mesh(new THREE.SphereGeometry(70, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7ef0d8).multiplyScalar(4), transparent: true, opacity: 0 })); G.add(this.trainDot);

    // city of Hyderabad (abstract skyline)
    const cityMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, emissive: 0xffc98a, emissiveIntensity: .22, transparent: true, opacity: 0 });
    const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0), cityMat, 1100); const m = new THREE.Matrix4();
    for (let i = 0; i < 1100; i++) { const a = R(0, 6.28), d = Math.sqrt(rand()) * 2300; const hgt = 30 + 300 * Math.exp(-d / 700) * rand() + R(0, 40);
      m.compose(new THREE.Vector3(RG.C[0] + Math.cos(a) * d, 0, RG.C[1] + Math.sin(a) * d), new THREE.Quaternion(), new THREE.Vector3(R(40, 110), hgt, R(40, 110))); city.setMatrixAt(i, m); }
    G.add(city); this.cityMat = cityMat;
    // data centre city (rises in step 1)
    const dcMat = new THREE.MeshStandardMaterial({ color: 0x1b2a33, emissive: 0x5fd4ff, emissiveIntensity: .9, transparent: true, opacity: 0 });
    this.dc = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0), dcMat, 36); this.dcMat = dcMat; this.dcBase = [];
    for (let i = 0; i < 36; i++) { this.dcBase.push([RG.dc[0] + (i % 6) * 120 - 300 + R(-10, 10), RG.dc[1] + Math.floor(i / 6) * 95 - 240, R(30, 70)]); }
    G.add(this.dc);
    // airport runways
    this.airMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc7a6ff).multiplyScalar(2), transparent: true, opacity: 0 });
    for (const dz of [-90, 90]) { const r = new THREE.Mesh(new THREE.BoxGeometry(1500, 4, 45), this.airMat); r.position.set(RG.airport[0], 6, RG.airport[1] + dz); r.rotation.y = .35; G.add(r); }
    // ZUFA marker
    this.markMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc89b62).multiplyScalar(3), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    this.mark = new THREE.Mesh(new THREE.RingGeometry(330, 380, 64).rotateX(-Math.PI / 2), this.markMat); this.mark.position.y = 12; G.add(this.mark);
    this.pulse = new THREE.Mesh(new THREE.RingGeometry(330, 360, 64).rotateX(-Math.PI / 2), this.markMat.clone()); this.pulse.position.y = 12; G.add(this.pulse);

    // labels
    const L = (html, pos, step, cls = '') => { const d = document.createElement('div'); d.className = 'rg ' + cls; d.innerHTML = html; const o = new CSS2DObject(d); o.position.copy(pos); o.visible = false; this.scene.add(o); return { o, step }; };
    this.rLabels = [
      L('<b>ZUFA</b><span>Your land</span>', V([0, -820], 40), 0, 'rg--zufa'),
      L('<b>Hyderabad</b>', V(RG.C, 400), 0, 'rg--city'),
      L('Outer Ring Road', V([RG.C[0] - 300, RG.C[1] - RG.orr - 250]), 0),
      L('ORR Exit 18 · Appa', V(RG.appa, 60), 0),
      L('Chevella', V(RG.chevella, 60), 0),
      L('Chevella Road · 50 km · 45 min drive', V([3000, 520]), 0, 'rg--road'),
      L('<em>01</em> Data Centre City', V([RG.dc[0], RG.dc[1] - 420], 90), 1, 'rg--dev'),
      L('<em>02</em> Regional Ring Road', V([RG.C[0] - RG.rrr * .94, RG.C[1] - RG.rrr * .34]), 2, 'rg--dev'),
      L('<em>03</em> New 200-ft road expansion', V([1200, -260]), 3, 'rg--dev'),
      L('<em>04</em> Shamshabad Airport', V([RG.airport[0], RG.airport[1] + 500]), 4, 'rg--dev'),
      L('<em>05</em> Bullet train road', V([1500, -2750]), 5, 'rg--dev'),
    ];
  }
  _applyRegion(rf, reg, t) {
    const on = rf > .002; this.region.visible = on;
    this.rLabels.forEach(l => { l.o.visible = rf > .65 && reg >= l.step - .35; });
    if (!on) return;
    this.regPlane.uniforms.uOp.value = rf;
    const set = (m, prog, op = rf) => { m.uniforms.uProg.value = prog; m.uniforms.uOp.value = op; };
    set(this.rOrr, clamp(rf * 1.6 - .4)); set(this.rRoad, clamp(rf * 1.6 - .5));
    const s = i => clamp(reg - (i - 1));
    set(this.rRRR, s(2)); set(this.rWiden, s(3), rf * .4); set(this.rAir, s(4)); set(this.rTrain, s(5));
    this.cityMat.opacity = rf; this.airMat.opacity = rf * s(4); this.dcMat.opacity = rf * Math.min(1, s(1) * 2);
    this.markMat.opacity = rf; this.pulse.material.opacity = rf * (1 - (t * .5 % 1)); this.pulse.scale.setScalar(1 + (t * .5 % 1) * 1.6);
    const m = new THREE.Matrix4(), g = s(1);
    this.dcBase.forEach(([x, z, h], i) => { m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(80, Math.max(.01, h * g), 60)); this.dc.setMatrixAt(i, m); });
    this.dc.instanceMatrix.needsUpdate = true;
    const tp = s(5); this.trainDot.material.opacity = tp > .99 ? rf : 0; this.trainDot.position.copy(this.trainCurve.getPointAt((t * .05) % 1));
  }

  /* ---------- time of day ---------- */
  _applyHour(h, rf) {
    const a = (h - 5.5) / 13 * Math.PI, el = Math.sin(a);
    const d = sstep(-.06, .22, el), n = 1 - sstep(-.02, .14, el);
    const { top, mid } = skyAt(h);
    this.skyU.top.value.copy(top); this.skyU.mid.value.copy(mid); this.skyU.bottom.value.copy(mid.clone().multiplyScalar(.32));
    this.scene.fog.color.copy(mid.clone().lerp(new THREE.Color(0x0a0b12), rf * .8)); this.scene.fog.density = lerp(.00028, .000004, rf);
    this.sun.position.set(Math.cos(a) * 800, Math.max(el, .06) * 700 + 25, 280);
    this.sun.color.set('#ff9a5c').lerp(new THREE.Color('#fff3df'), sstep(0, .55, el)); this.sun.intensity = 3 * d;
    this.moon.intensity = .9 * (1 - d);
    this.hemi.color.set('#2b3358').lerp(new THREE.Color('#dbe6f2'), d); this.hemi.groundColor.set('#141418').lerp(new THREE.Color('#5d6848'), d); this.hemi.intensity = lerp(.75, 1.1, d);
    this.renderer.toneMappingExposure = lerp(1.4, 1.0, d);
    this.lampMat.color.set(0xffcf96).multiplyScalar(.3 + 3.7 * n);
    this.glowMats.forEach(g => g.color.set(0xffdcae).multiplyScalar(.6 + 2.4 * n));
    this.poolLightMat.opacity = .45 * n; this.clubGlass.emissiveIntensity = .05 + .6 * n;
    this.homeMats.glass.emissiveIntensity = 2.2 * n; this.homeMats.arcade.emissiveIntensity = 1.4 * n; this.homeMats.water.emissiveIntensity = .2 + 1.2 * n; this.poolMat.emissiveIntensity = 1 + 1.5 * n;
    this.headMat.color.set(0xfff2d6).multiplyScalar(.6 + 4 * n); this.tailMat.color.set(0xff2a20).multiplyScalar(.5 + 3 * n);
    this.starMat.opacity = sstep(.55, 1, n);
    this.cloudMat.color.copy(mid).lerp(new THREE.Color(0xffffff), d * .55);
    this.birdMat.opacity = d * (1 - rf);
    this.bloom.strength = .14 + .5 * n + .25 * rf;
    this._night = n; this._day = d;
    if (this.pmrem && (this._envH === undefined || Math.abs(h - this._envH) > .2)) { this._envH = h; this._updateEnv(); }
  }

  /* ---------- frame ---------- */
  _tick() {
    if (!this.active) return;
    const dt = Math.min(.05, this.clock.getDelta()), t = this.clock.elapsedTime;
    const S = this.st, T = this.stT, f = 1 - Math.pow(.004, dt);
    for (const k of ['hour', 'build', 'region', 'reg']) S[k] += (T[k] - S[k]) * f;
    const L = this._last;
    if (Math.abs(L.hour - S.hour) > 1e-3 || Math.abs(L.region - S.region) > 1e-4 || L.hour === undefined) { this._applyHour(S.hour, clamp(S.region)); L.hour = S.hour; }
    this._applyBuild(S.build); this._applyRegion(clamp(S.region), S.reg, t); L.region = S.region;
    this._applyViewOffset();
    if (this._flying) this._flying();
    else if (this.mode === 'story') {
      const far = this.camPos.y > 900, amp = far ? 0 : 1;
      const drift = new THREE.Vector3(Math.sin(t * .1) * 6 * amp, Math.sin(t * .13) * 3 * amp, Math.cos(t * .1) * 6 * amp);
      const k = 1 - Math.pow(.0015, dt);
      this.camera.position.lerp(this.camPos.clone().add(drift), k); this.target.lerp(this.camTarget, k); this.camera.lookAt(this.target);
    } else if (this.controls.enabled) {
      this.controls.update(); const tg = this.controls.target; tg.x = clamp(tg.x, -400, 400); tg.z = clamp(tg.z, -500, 500); tg.y = 0;
    }
    const dist = this.camera.position.distanceTo(this.mode === 'story' ? this.target : this.controls.target);
    const near = clamp(dist * .0025, .5, 60); if (Math.abs(near - this.camera.near) > .05) { this.camera.near = near; this.camera.updateProjectionMatrix(); }
    this.sky.position.copy(this.camera.position); this.stars.position.copy(this.camera.position);
    // site-scale details fade away in the regional view
    const rf = clamp(S.region), siteLabels = rf < .3;
    if (!siteLabels) for (const id in this.tags) this.tags[id].obj.visible = false;
    this.clouds.visible = this.cloudMat.opacity > .01;
    this.cloudMat.opacity = clamp((this.camera.position.y - 260) / 500) * (1 - rf) * (.35 + .5 * (this._day || 0));
    this._updateLife(t, this._night || 0);
    if (this.opts.onFrame) { const fw = new THREE.Vector3(); this.camera.getWorldDirection(fw); this.opts.onFrame(Math.atan2(-fw.x, -fw.z), S.hour); }
    this.grade.uniforms.uTime.value = t; this.uTime.value = t;
    this.composer.render(dt); this.labels.render(this.scene, this.camera);
  }
}
