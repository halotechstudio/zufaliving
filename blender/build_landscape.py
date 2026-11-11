"""Landscape for the Cycles film: film-quality tree species, the forest belt and groves, granite outcrops.
Run after build_site.py:  exec(open(r"D:\\Zufa\\blender\\build_landscape.py").read())"""
exec(open(r"D:\Zufa\blender\zufa_lib.py").read())
import bpy, bmesh, json, math, random
from mathutils import Vector

S = json.load(open(r"D:\Zufa\blender\site.json"))
M = materials()

# ---- leaf shading for Cycles: per-leaf colour (vertex 'Col') + light passing through the leaves
for name in ("ZUFA_Leaf", "ZUFA_Olive_Leaf"):
    m = bpy.data.materials[name]
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")
    at = nt.nodes.get("LeafCol") or nt.nodes.new("ShaderNodeVertexColor")
    at.name = "LeafCol"
    at.layer_name = "Col"
    nt.links.new(at.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Subsurface Weight"].default_value = 0.0
    try:
        b.inputs["Transmission Weight"].default_value = 0.0
    except KeyError:
        pass
    # thin translucent leaves: mix in a translucent BSDF
    out = next(n for n in nt.nodes if n.bl_idname == "ShaderNodeOutputMaterial")
    tr = nt.nodes.get("LeafTrans") or nt.nodes.new("ShaderNodeBsdfTranslucent")
    tr.name = "LeafTrans"
    nt.links.new(at.outputs["Color"], tr.inputs["Color"])
    mix = nt.nodes.get("LeafMix") or nt.nodes.new("ShaderNodeMixShader")
    mix.name = "LeafMix"
    mix.inputs["Fac"].default_value = 0.25
    nt.links.new(b.outputs[0], mix.inputs[1])
    nt.links.new(tr.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])
    b.inputs["Roughness"].default_value = 0.6
for name in ("ZUFA_Bark",):
    m = bpy.data.materials[name]
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")
    at = nt.nodes.get("BarkCol") or nt.nodes.new("ShaderNodeVertexColor")
    at.name = "BarkCol"
    at.layer_name = "Col"
    nt.links.new(at.outputs["Color"], b.inputs["Base Color"])

# ---- film tree species (dense, built in the asset scene)
FT = bpy.data.collections.get("Film_Trees") or bpy.data.collections.new("Film_Trees")
for c in list(FT.children):
    for o in list(c.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    FT.children.unlink(c)
specs = [("RainTree", 1.25, 1, 'leaf', 520), ("Mango", 1.0, 2, 'leaf', 600), ("Neem", 0.95, 3, 'olive', 560), ("Tamarind", 1.15, 4, 'leaf', 500)]
for nm, s, seed, mat, per in specs:
    c = bpy.data.collections.get("FT_" + nm) or bpy.data.collections.new("FT_" + nm)
    for o in list(c.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    if c.name not in [x.name for x in FT.children]:
        FT.children.link(c)
    rnd = random.Random(seed)
    cyl(c, nm + "_t", 0.38 * s, 4.0 * s, (0, 0, 0), M['bark'], 8, 0.24 * s)
    tint_foliage(c.objects[nm + "_t"], seed)
    centres = []
    nlimb = 5 if nm != "Neem" else 4
    for i in range(nlimb):
        a = 2 * math.pi * i / nlimb + rnd.uniform(-0.3, 0.3)
        L = rnd.uniform(2.8, 3.8) * s * (1.25 if nm == "RainTree" else 1.0)
        base = Vector((0, 0, 3.6 * s))
        tip = Vector((math.cos(a) * L * 0.85, math.sin(a) * L * 0.85, 3.8 * s + L * (0.45 if nm == "RainTree" else 0.75)))
        d = tip - base
        br = cyl(c, f"{nm}_l{i}", 0.15 * s, d.length, (0, 0, 0), M['bark'], 6, 0.07 * s)
        br.rotation_mode = 'QUATERNION'
        br.rotation_quaternion = d.to_track_quat('Z', 'Y')
        br.location = base
        tint_foliage(br, seed + i)
        centres.append((tip.x, tip.y, tip.z + 0.5 * s, rnd.uniform(2.0, 2.7) * s))
    centres.append((0, 0, (7.6 if nm != "Neem" else 9.0) * s, 2.8 * s))
    leaf_canopy(c, nm + "_canopy", centres, None, M, mat, per=per, leaf=0.3 * s, seed=seed)

# ---- forest belt, groves and field trees (Geometry Nodes instancing on a point cloud)
site = bpy.data.scenes["ZUFA_Site"]
bpy.context.window.scene = site
L = bpy.data.collections.get("Site_Landscape") or bpy.data.collections.new("Site_Landscape")
for o in list(L.objects):
    bpy.data.objects.remove(o, do_unlink=True)
if L.name not in [x.name for x in site.collection.children]:
    site.collection.children.link(L)

outline = [tuple(p) for p in S['outline']]


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


def seg_d(p, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy or 1)))
    return math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy)


def poly_d(p, poly):
    return min(seg_d(p, poly[i], poly[(i + 1) % len(poly)]) for i in range(len(poly)))


blvd = bpy.data.objects.get("Boulevard")
bpts = [tuple((blvd.matrix_world @ v.co).xy) for v in blvd.data.vertices][::6] if blvd else []
rnd = random.Random(7)
verts, scales, kinds = [], [], []
# groves: clumped density field
groves = [(rnd.uniform(-1500, 1500), rnd.uniform(-1500, 1500), rnd.uniform(60, 220)) for _ in range(70)]
tries = 0
while len(verts) < 9000 and tries < 400000:
    tries += 1
    x, y = rnd.uniform(-1600, 1600), rnd.uniform(-1600, 1600)
    if inside((x, y), outline):
        continue
    d = poly_d((x, y), outline)
    if d < 9:
        continue
    if bpts and min(math.hypot(x - bx, y - by) for bx, by in bpts) < (40 if math.hypot(x - S['entrance']['pos'][0], y - S['entrance']['pos'][1]) < 250 else 16):
        continue
    if d < 70:
        prob = 0.9                                   # the forest hug: a dense belt round the boundary
    else:
        g = max((1 - math.hypot(x - gx, y - gy) / gr) for gx, gy, gr in groves)
        prob = 0.85 * max(0, g) + 0.012              # groves + scattered field trees
    if rnd.random() > prob:
        continue
    verts.append((x, y, 0))
    scales.append(rnd.uniform(0.75, 1.35))
    kinds.append(rnd.randrange(4))
me = bpy.data.meshes.new("ForestPoints")
me.from_pydata(verts, [], [])
a_sc = me.attributes.new("sc", 'FLOAT', 'POINT')
a_k = me.attributes.new("kind", 'INT', 'POINT')
a_sc.data.foreach_set("value", scales)
a_k.data.foreach_set("value", kinds)
fo = bpy.data.objects.new("Forest", me)
L.objects.link(fo)

ng = bpy.data.node_groups.get("ZUFA_Scatter") or bpy.data.node_groups.new("ZUFA_Scatter", 'GeometryNodeTree')
ng.nodes.clear()
for it in list(ng.interface.items_tree):
    ng.interface.remove(it)
ng.interface.new_socket("Geometry", in_out='INPUT', socket_type='NodeSocketGeometry')
ng.interface.new_socket("Geometry", in_out='OUTPUT', socket_type='NodeSocketGeometry')
N = ng.nodes
gi, go = N.new("NodeGroupInput"), N.new("NodeGroupOutput")
ci = N.new("GeometryNodeCollectionInfo")
ci.inputs["Collection"].default_value = FT
ci.inputs["Separate Children"].default_value = True
ci.inputs["Reset Children"].default_value = True
iop = N.new("GeometryNodeInstanceOnPoints")
iop.inputs["Pick Instance"].default_value = True
na_k = N.new("GeometryNodeInputNamedAttribute")
na_k.data_type = 'INT'
na_k.inputs["Name"].default_value = "kind"
na_s = N.new("GeometryNodeInputNamedAttribute")
na_s.data_type = 'FLOAT'
na_s.inputs["Name"].default_value = "sc"
rv = N.new("FunctionNodeRandomValue")
rv.data_type = 'FLOAT_VECTOR'
rv.inputs["Min"].default_value = (0, 0, 0)
rv.inputs["Max"].default_value = (0, 0, 6.283)
lk = ng.links.new
lk(gi.outputs[0], iop.inputs["Points"])
lk(ci.outputs[0], iop.inputs["Instance"])
lk(na_k.outputs["Attribute"], iop.inputs["Instance Index"])
lk(na_s.outputs["Attribute"], iop.inputs["Scale"])
lk(rv.outputs["Value"], iop.inputs["Rotation"])
lk(iop.outputs[0], go.inputs[0])
mod = fo.modifiers.new("Scatter", 'NODES')
mod.node_group = ng

# ---- granite boulder outcrops (Deccan landscape)
GR = bpy.data.collections.get("FT_Outcrop") or bpy.data.collections.new("FT_Outcrop")
n_out = 0
for k in range(30):
    for _ in range(50):
        x, y = rnd.uniform(-1300, 1300), rnd.uniform(-1300, 1300)
        if not inside((x, y), outline) and poly_d((x, y), outline) > 120:
            break
    for j in range(rnd.randint(3, 7)):
        s = rnd.uniform(2.0, 6.0)
        boulder(L, f"Outcrop{k}_{j}", (s * rnd.uniform(1.0, 1.4), s, s * rnd.uniform(0.7, 1.0)), (x + rnd.uniform(-10, 10), y + rnd.uniform(-10, 10), s * 0.25), M['granite'] if 'granite' in M else mat_rock("ZUFA_Granite", (0.62, 0.56, 0.52), (0.36, 0.31, 0.29)), 900 + k * 10 + j, 2)
        n_out += 1

bpy.ops.wm.save_mainfile()
result = {"trees": len(verts), "outcrop_rocks": n_out, "species": [c.name for c in FT.children]}
