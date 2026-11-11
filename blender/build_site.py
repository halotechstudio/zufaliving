"""ZUFA site for the Cycles film: the full 25-acre layout from blender/site.json.
Builds scene "ZUFA_Site": roads, plots, footpaths, boundary wall, approach boulevard, entrance, clubhouse,
villas placed to face their roads (setback + driveway), farm estates, avenue palms and street lamps.
Assets (villas, clubhouse, entrance, trees, car) are collection instances from the ZUFA_Assets scene.
Run in Blender:  exec(open(r"D:\\Zufa\\blender\\build_site.py").read())"""
exec(open(r"D:\Zufa\blender\zufa_lib.py").read())
import bpy, bmesh, json, math, random
from mathutils import Vector, Matrix

S = json.load(open(r"D:\Zufa\blender\site.json"))
rnd = random.Random(2026)

# ---------------------------------------------------------------- scene
site = bpy.data.scenes.get("ZUFA_Site")
if site is None:
    site = bpy.data.scenes.new("ZUFA_Site")
bpy.context.window.scene = site
for c in list(site.collection.children):
    site.collection.children.unlink(c)
for o in list(site.collection.objects):
    site.collection.objects.unlink(o)
site.unit_settings.system = 'METRIC'
M = materials()


def scoll(name):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
    else:
        for o in list(c.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    if c.name not in [x.name for x in site.collection.children]:
        site.collection.children.link(c)
    return c


# ---------------------------------------------------------------- extra materials for the site
def mat_asphalt():
    m, nt, b, tc = _new("ZUFA_Asphalt")
    L = nt.links.new
    n = _n(nt, "ShaderNodeTexNoise", Scale=180.0, Detail=12.0, Roughness=0.75)
    L(tc.outputs["Object"], n.inputs["Vector"])
    big = _n(nt, "ShaderNodeTexNoise", Scale=0.08, Detail=4.0)
    L(tc.outputs["Object"], big.inputs["Vector"])
    r = _ramp(nt, [(0.35, (0.055, 0.055, 0.058)), (0.65, (0.13, 0.13, 0.13))])
    L(n.outputs["Fac"], r.inputs[0])
    mx = _n(nt, "ShaderNodeMix", data_type='RGBA', blend_type='MULTIPLY')
    mx.inputs["Factor"].default_value = 0.35
    L(r.outputs[0], mx.inputs["A"])
    L(big.outputs["Color"], mx.inputs["B"])
    L(mx.outputs["Result"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.82
    _bump(nt, b, n.outputs["Fac"], 0.25, 0.004)
    return m


def mat_lawn():
    """Mown lawn: fine blade noise, mowing stripes, patchy tone."""
    m, nt, b, tc = _new("ZUFA_Lawn_Film")
    L = nt.links.new
    fine = _n(nt, "ShaderNodeTexNoise", Scale=90.0, Detail=10.0)
    L(tc.outputs["Object"], fine.inputs["Vector"])
    patch = _n(nt, "ShaderNodeTexNoise", Scale=0.12, Detail=5.0)
    L(tc.outputs["Object"], patch.inputs["Vector"])
    sep = _n(nt, "ShaderNodeSeparateXYZ")
    L(tc.outputs["Object"], sep.inputs[0])
    stripe = _math(nt, "GREATER_THAN", _math(nt, "FRACT", _math(nt, "MULTIPLY", _math(nt, "ADD", sep.outputs["X"], _math(nt, "MULTIPLY", sep.outputs["Y"], 0.3)), 0.25)), 0.5)
    r = _ramp(nt, [(0.3, (0.04, 0.062, 0.022)), (0.55, (0.075, 0.1, 0.04)), (0.75, (0.13, 0.135, 0.07))])
    L(fine.outputs["Fac"], r.inputs[0])
    st = _n(nt, "ShaderNodeMix", data_type='RGBA', blend_type='MULTIPLY')
    L(_math(nt, "MULTIPLY", stripe, 0.12), st.inputs["Factor"])
    st.inputs["B"].default_value = (0.75, 0.8, 0.7, 1)
    L(r.outputs[0], st.inputs["A"])
    pt = _n(nt, "ShaderNodeMix", data_type='RGBA', blend_type='OVERLAY')
    pt.inputs["Factor"].default_value = 0.6
    L(st.outputs["Result"], pt.inputs["A"])
    L(patch.outputs["Color"], pt.inputs["B"])
    L(pt.outputs["Result"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.9
    _bump(nt, b, fine.outputs["Fac"], 0.35, 0.01)
    return m


def mat_farmland():
    """Telangana farmland from the air: rectangular fields (green crop, young crop, straw stubble, fallow red soil,
    dry grass) separated by narrow earth bunds, with crop rows and soft wear inside each field."""
    m, nt, b, tc = _new("ZUFA_Farmland")
    L = nt.links.new
    rot = _n(nt, "ShaderNodeMapping")
    rot.inputs["Rotation"].default_value = (0, 0, math.radians(-10))
    L(tc.outputs["Object"], rot.inputs[0])
    br = _n(nt, "ShaderNodeTexBrick", offset=0.37, offset_frequency=1, squash=1.0, squash_frequency=1)
    br.inputs["Scale"].default_value = 1.0
    br.inputs["Brick Width"].default_value = 135.0
    br.inputs["Row Height"].default_value = 62.0
    br.inputs["Mortar Size"].default_value = 1.4
    br.inputs["Mortar Smooth"].default_value = 0.6
    br.inputs["Bias"].default_value = 0.0
    br.inputs["Color1"].default_value = (0, 0, 0, 1)
    br.inputs["Color2"].default_value = (1, 1, 1, 1)
    L(rot.outputs[0], br.inputs["Vector"])
    fields = _ramp(nt, [(0.0, (0.085, 0.15, 0.035)), (0.22, (0.15, 0.22, 0.06)), (0.40, (0.40, 0.34, 0.20)),
                        (0.58, (0.30, 0.16, 0.09)), (0.76, (0.33, 0.30, 0.17)), (1.0, (0.11, 0.18, 0.05))])
    L(br.outputs["Color"], fields.inputs[0])
    # crop rows inside the fields
    rows = _n(nt, "ShaderNodeTexWave", wave_type='BANDS', bands_direction='Y')
    rows.inputs["Scale"].default_value = 0.012
    rows.inputs["Distortion"].default_value = 0.4
    L(rot.outputs[0], rows.inputs["Vector"])
    rowc = _n(nt, "ShaderNodeMix", data_type='RGBA', blend_type='MULTIPLY')
    L(_math(nt, "MULTIPLY", rows.outputs["Fac"], 0.25), rowc.inputs["Factor"])
    rowc.inputs["B"].default_value = (0.6, 0.6, 0.55, 1)
    L(fields.outputs[0], rowc.inputs["A"])
    # large soft variation + fine grain
    big = _n(nt, "ShaderNodeTexNoise", Scale=0.004, Detail=6.0, Roughness=0.6)
    L(tc.outputs["Object"], big.inputs["Vector"])
    fine = _n(nt, "ShaderNodeTexNoise", Scale=0.6, Detail=10.0)
    L(tc.outputs["Object"], fine.inputs["Vector"])
    v1 = _n(nt, "ShaderNodeMix", data_type='RGBA', blend_type='OVERLAY')
    v1.inputs["Factor"].default_value = 0.45
    L(rowc.outputs["Result"], v1.inputs["A"])
    L(big.outputs["Color"], v1.inputs["B"])
    v2 = _n(nt, "ShaderNodeMix", data_type='RGBA', blend_type='OVERLAY')
    v2.inputs["Factor"].default_value = 0.35
    L(v1.outputs["Result"], v2.inputs["A"])
    L(fine.outputs["Color"], v2.inputs["B"])
    # earth bunds between fields
    bund = _n(nt, "ShaderNodeMix", data_type='RGBA')
    bund.inputs["B"].default_value = (0.24, 0.19, 0.12, 1)
    L(br.outputs["Fac"], bund.inputs["Factor"])          # Brick Fac = 1 in the mortar (the bunds)
    L(v2.outputs["Result"], bund.inputs["A"])
    L(bund.outputs["Result"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.95
    _bump(nt, b, _math(nt, "ADD", fine.outputs["Fac"], _math(nt, "MULTIPLY", rows.outputs["Fac"], 0.3)), 0.35, 0.05)
    return m


def mat_emit(name, rgb, strength):
    m, nt, b, tc = _new(name)
    nt.nodes.remove(b)
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (*rgb, 1)
    e.inputs["Strength"].default_value = strength
    nt.links.new(e.outputs[0], nt.nodes["Material Output"].inputs[0])
    return m


M['asphalt'] = mat_asphalt()
M['lawn'] = mat_lawn()
M['farm'] = mat_farmland()
M['kerb'] = mat_flat("ZUFA_Kerb", (0.72, 0.70, 0.66), 0.8)
M['granite'] = mat_rock("ZUFA_Granite", light=(0.62, 0.56, 0.52), dark=(0.36, 0.31, 0.29))
M['lampglow'] = mat_emit("ZUFA_LampGlow", (1.0, 0.78, 0.5), 0.0)
M['soil'] = mat_flat("ZUFA_Soil", (0.30, 0.16, 0.09), 0.95)


# ---------------------------------------------------------------- geometry helpers (Blender XY plane)
def inside(p, poly):
    c = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > p[1]) != (yj > p[1])) and (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi):
            c = not c
        j = i
    return c


def signed_area(poly):
    return sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly))) / 2


def offset(poly, d):
    """Inset (d > 0) / outset (d < 0) a simple polygon by mitred edge offsets."""
    s = 1 if signed_area(poly) > 0 else -1
    n = len(poly)
    lines = []
    for i in range(n):
        a, b = Vector(poly[i]), Vector(poly[(i + 1) % n])
        u = (b - a).normalized()
        nrm = Vector((-u.y, u.x)) * s
        lines.append((a + nrm * d, u))
    out = []
    for i in range(n):
        (p1, u1), (p2, u2) = lines[i - 1], lines[i]
        den = u1.x * u2.y - u1.y * u2.x
        if abs(den) < 1e-4:
            out.append(tuple(p2))
            continue
        t = ((p2.x - p1.x) * u2.y - (p2.y - p1.y) * u2.x) / den
        out.append(tuple(p1 + u1 * t))
    return out


def slab(col, name, poly, z0, z1, mat, holes=()):
    bm = bmesh.new()
    top = [bm.verts.new((x, y, z1)) for x, y in poly]
    bot = [bm.verts.new((x, y, z0)) for x, y in poly]
    if holes:
        # ring between poly and the first hole
        h = holes[0]
        th = [bm.verts.new((x, y, z1)) for x, y in h]
        n, m2 = len(poly), len(h)
        # stitch by nearest-angle matching around the ring
        cx = sum(p[0] for p in poly) / n
        cy = sum(p[1] for p in poly) / n
        ang = lambda p: math.atan2(p[1] - cy, p[0] - cx)
        bmesh.ops.contextual_create(bm, geom=[])
        edges = []
        for ring in (top, th):
            for i in range(len(ring)):
                edges.append(bm.edges.new((ring[i], ring[(i + 1) % len(ring)])))
        bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges)
        for v in bot:
            bm.verts.remove(v)
    else:
        bm.faces.new(top)
        bm.faces.new(bot[::-1])
        for i in range(len(poly)):
            j = (i + 1) % len(poly)
            bm.faces.new((bot[i], bot[j], top[j], top[i]))
    bm.normal_update()
    return from_bm(bm, name, mat, col)


def ring(col, name, outer, inner, z0, z1, mat):
    """Band between two polygons with the same vertex count (e.g. a polygon and its inset)."""
    bm = bmesh.new()
    n = len(outer)
    ot = [bm.verts.new((x, y, z1)) for x, y in outer]
    it = [bm.verts.new((x, y, z1)) for x, y in inner]
    ob = [bm.verts.new((x, y, z0)) for x, y in outer]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((ot[i], ot[j], it[j], it[i]))
        bm.faces.new((ob[i], ob[j], ot[j], ot[i]))
    bm.normal_update()
    return from_bm(bm, name, mat, col)


def inst(col, name, coll_name, loc, rz=0.0, scale=1.0, parent=None):
    e = bpy.data.objects.new(name, None)
    e.instance_type = 'COLLECTION'
    e.instance_collection = bpy.data.collections[coll_name]
    e.location = loc
    e.rotation_euler = (0, 0, rz)
    e.scale = (scale, scale, scale)
    col.objects.link(e)
    if parent:
        e.parent = parent
    return e


outline = [tuple(p) for p in S['outline']]
plots = S['plots']
club_poly = [tuple(p) for p in S['club']['poly']]
blocked = [club_poly] + [[tuple(p) for p in pl['poly']] for pl in plots]


def is_road(p):
    return inside(p, outline) and not any(inside(p, q) for q in blocked)


# ---------------------------------------------------------------- 1. ground: countryside, verge, site slab (asphalt), boundary wall
G = scoll("Site_Ground")
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=3500)
from_bm(bm, "Farmland", M['farm'], G).location.z = -0.05
slab(G, "Verge", offset(outline, -9), -0.02, 0.06, M['lawn'])
slab(G, "Roads", outline, 0.0, 0.18, M['asphalt'])
wall_in, wall_out = offset(outline, -6.3), offset(outline, -7.0)
ring(G, "BoundaryWall", wall_out, wall_in, 0.0, 2.1, M['rubble'])
ring(G, "BoundaryCoping", offset(outline, -7.1), offset(outline, -6.2), 2.1, 2.22, M['paving'])

# ---------------------------------------------------------------- 2. plots: lawn, kerb, footpath
P = scoll("Site_Plots")
for pl in plots:
    poly = [tuple(p) for p in pl['poly']]
    pid = pl['id']
    inner = offset(poly, 0.9)
    slab(P, f"Plot{pid:02d}", inner, 0.0, 0.42, M['lawn'])
    ring(P, f"Kerb{pid:02d}", inner, offset(poly, 1.15), 0.0, 0.5, M['kerb'])
    ring(P, f"Path{pid:02d}", offset(poly, -0.7), inner, 0.0, 0.26 + (pid % 2) * 0.003, M['paving'])
slab(P, "ClubLawn", offset(club_poly, 1.5), 0.0, 0.42, M['lawn'])

# ---------------------------------------------------------------- 3. approach boulevard (entrance local frame -> world)
E = S['entrance']
ex, ey, erz = E['pos'][0], E['pos'][1], E['rotZ']
R = Matrix.Rotation(erz, 3, 'Z')
local = [(0, -18), (0, 0), (0, 40), (-6, 120), (-30, 260), (-80, 520), (-150, 900)]   # website entrance-local (x, z)
ctrl = [R @ Vector((x, -z, 0)) + Vector((ex, ey, 0)) for x, z in local]
cu = bpy.data.curves.new("BoulevardPath", 'CURVE')
cu.dimensions = '3D'
sp = cu.splines.new('POLY')
sp.points.add(len(ctrl) - 1)
for i, p in enumerate(ctrl):
    sp.points[i].co = (p.x, p.y, 0.05, 1)
sp.type = 'NURBS'
sp.order_u = 4
sp.use_endpoint_u = True
path = bpy.data.objects.new("BoulevardPath", cu)
G.objects.link(path)
dg = bpy.context.evaluated_depsgraph_get()
pts = []
me = path.evaluated_get(dg).to_mesh()
pts = [v.co.copy() for v in me.vertices]
path.evaluated_get(dg).to_mesh_clear()
if len(pts) < 10:
    pts = ctrl
# densify by linear interpolation
dense = []
for i in range(len(pts) - 1):
    a, b = pts[i], pts[i + 1]
    k = max(1, int((b - a).length / 3))
    for j in range(k):
        dense.append(a.lerp(b, j / k))
dense.append(pts[-1])
bm = bmesh.new()
left, right, edgeL, edgeR = [], [], [], []
for i, p in enumerate(dense):
    t = (dense[min(i + 1, len(dense) - 1)] - dense[max(i - 1, 0)]).normalized()
    nrm = Vector((-t.y, t.x, 0))
    left.append(bm.verts.new(p + nrm * 9.5 + Vector((0, 0, 0.1))))
    right.append(bm.verts.new(p - nrm * 9.5 + Vector((0, 0, 0.1))))
for i in range(len(dense) - 1):
    bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
from_bm(bm, "Boulevard", M['asphalt'], G)
for s in (-1, 1):   # painted edge lines
    bm = bmesh.new()
    a, b2 = [], []
    for i, p in enumerate(dense):
        t = (dense[min(i + 1, len(dense) - 1)] - dense[max(i - 1, 0)]).normalized()
        nrm = Vector((-t.y, t.x, 0)) * s
        a.append(bm.verts.new(p + nrm * 8.7 + Vector((0, 0, 0.115))))
        b2.append(bm.verts.new(p + nrm * 8.9 + Vector((0, 0, 0.115))))
    for i in range(len(dense) - 1):
        bm.faces.new((a[i], b2[i], b2[i + 1], a[i + 1]))
    from_bm(bm, f"BoulevardLine{s}", M['kerb'], G)

# ---------------------------------------------------------------- 4. entrance and clubhouse
A = scoll("Site_Architecture")
inst(A, "Entrance", "Entrance", (ex, ey, 0.0), erz)
C = S['club']
inst(A, "Clubhouse", "Clubhouse", (C['pos'][0], C['pos'][1], 0.42), C['rotZ'])

# ---------------------------------------------------------------- 5. estates: villas facing their roads, driveways, gardens, farm plots
H = scoll("Site_Homes")
homes = []
gate = Vector((ex, ey))
fixed = {25: 'sanctuary', 52: 'estate', 56: 'farm', 31: 'farm', 47: 'grand'}
for pl in plots:
    pid = pl['id']
    h = ((pid * 37) % 100) / 100
    kind = fixed.get(pid) or (('sanctuary' if h < .45 else 'estate' if h < .8 else 'farm') if pl['cat'] != 'half' else ('estate' if h < .5 else 'sanctuary' if h < .75 else 'farm'))
    f = pl['front']
    mid, n, u = Vector(f['mid']), Vector(f['n']), Vector(f['u'])
    rz = math.atan2(n.y, n.x)          # model +X end points at the road
    setback = 9.0 if pl['cat'] in ('half', 'signature') else 6.5
    half = {'sanctuary': 13.0, 'estate': 14.6, 'grand': 17.5, 'farm': 5.0}[kind]
    c = mid - n * (setback + half)
    root = bpy.data.objects.new(f"Home{pid:02d}", None)
    root.location = (c.x, c.y, 0.42)
    root.rotation_euler = (0, 0, rz)
    H.objects.link(root)
    order = 0.1 + 0.9 * min(1.0, (c - gate).length / 620)
    if pid in (25, 52, 56, 31):
        order = {25: .02, 52: .05, 56: .09, 31: .12}[pid]
    root["order"] = order
    if kind in ('sanctuary', 'estate', 'grand'):
        coll_name = 'Sanctuary_Villa' if kind == 'sanctuary' else 'Estate_Villa'
        inst(H, f"Villa{pid:02d}", coll_name, (0, 0, 0), 0, 1.2 if kind == 'grand' else 1.0, parent=root)
        # driveway from the road edge to the house end, with a parked car on some plots
        dl = setback + 1.0
        drv = box(H, f"Drive{pid:02d}", (dl, 4.2, 0.08), (half + dl / 2 - 0.2, 6.0 if kind == 'sanctuary' else 7.5, -0.04), M['paving'])
        drv.parent = root
        if pid % 3 == 0:
            car = inst(H, f"Car{pid:02d}", "Car", (half + 2.6, 6.0 if kind == 'sanctuary' else 7.5, 0.0), math.pi / 2, 1.0, parent=root)
        # garden trees in the back of deep plots
        back = pl['depth'] - setback - 2 * half
        for k in range(int(max(0, back) / 9)):
            for side in (-1, 1):
                t = inst(H, f"GTree{pid:02d}_{k}{side}", "Tree_Garden", (-half - 5 - k * 9, side * rnd.uniform(4, 9), 0), rnd.uniform(0, 6.28), rnd.uniform(0.9, 1.3), parent=root)
    else:
        # farm estate: orchard grid, crop beds, small cottage near the road
        box(H, f"Cottage{pid:02d}", (8, 6.5, 3.0), (0, 0, 0), M['stucco']).parent = root
        hip_roof(H, f"CottageRoof{pid:02d}", 8, 6.5, 30, (0, 0, 0), M['tile'], overhang=0.7, fascia=M['fascia'], fascia_h=0.2, eave=3.0)
        for o in [o for o in H.objects if o.name.startswith(f"CottageRoof{pid:02d}")]:
            o.parent = root
        depth = pl['depth'] - setback - 10
        for i in range(int(depth / 2.6)):
            bed = box(H, f"Bed{pid:02d}_{i}", (1.4, 9.0, 0.18), (-8 - i * 2.6, -6.5, 0), M['soil'] if i % 2 else M['leaf'])
            bed.parent = root
        for i in range(int(depth / 6)):
            for j in (2, 7):
                inst(H, f"Orch{pid:02d}_{i}{j}", "Tree_Garden", (-8 - i * 6, j, 0), rnd.uniform(0, 6.28), rnd.uniform(0.75, 1.0), parent=root)
    homes.append(root)

# ---------------------------------------------------------------- 6. avenue palms and street lamps along every frontage
V = scoll("Site_Avenues")
lamp_pts, palm_pts, taken = [], [], set()
for pl in plots:
    poly = [tuple(p) for p in pl['poly']]
    s = 1 if signed_area(poly) > 0 else -1
    for i in range(len(poly)):
        a, b = Vector(poly[i]), Vector(poly[(i + 1) % len(poly)])
        L = (b - a).length
        if L < 8:
            continue
        u = (b - a) / L
        nrm = Vector((u.y, -u.x)) * s
        t = 5.0
        while t < L - 3:
            p = a + u * t + nrm * 1.6
            key = (round(p.x / 8), round(p.y / 8))
            if key not in taken and is_road((p.x, p.y)):
                taken.add(key)
                (palm_pts if len(palm_pts) <= len(lamp_pts) else lamp_pts).append(p)
            t += 11.0
for i, p in enumerate(palm_pts):
    inst(V, f"Palm{i}", "Tree_Palm", (p.x, p.y, 0.26), rnd.uniform(0, 6.28), rnd.uniform(0.85, 1.1))
lamp_c = bpy.data.collections.get("Street_Lamp") or bpy.data.collections.new("Street_Lamp")
for o in list(lamp_c.objects):
    bpy.data.objects.remove(o, do_unlink=True)
cyl(lamp_c, "LampPole", 0.07, 4.6, (0, 0, 0), M['iron'], 8, 0.05)
box(lamp_c, "LampArm", (0.7, 0.08, 0.06), (0.3, 0, 4.55), M['iron'])
cyl(lamp_c, "LampHead", 0.16, 0.12, (0.62, 0, 4.42), M['lampglow'], 12)
for i, p in enumerate(lamp_pts):
    inst(V, f"Lamp{i}", "Street_Lamp", (p.x, p.y, 0.26), rnd.uniform(0, 6.28))
    li = bpy.data.lights.new(f"LampLight{i}", 'POINT')
    li.energy = 0.0
    li.color = (1.0, 0.78, 0.52)
    li.shadow_soft_size = 0.25
    lo = bpy.data.objects.new(f"LampLight{i}", li)
    lo.location = (p.x, p.y, 4.3)
    V.objects.link(lo)
# palms along the boulevard
for i in range(4, len(dense) - 1, 5):
    p, t = dense[i], (dense[i + 1] - dense[i - 1]).normalized()
    if (p.xy - gate).length > 260:
        break
    nrm = Vector((-t.y, t.x, 0))
    for s in (-1, 1):
        q = p + nrm * s * 12.5
        inst(V, f"BPalm{i}{s}", "Tree_Palm", (q.x, q.y, 0.0), rnd.uniform(0, 6.28), rnd.uniform(0.95, 1.15))

site["homes"] = len(homes)
bpy.ops.wm.save_mainfile()
result = {"homes": len(homes), "palms": len(palm_pts), "lamps": len(lamp_pts), "boulevard_pts": len(dense)}
