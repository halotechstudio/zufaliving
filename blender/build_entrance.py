"""Grand entrance, after the client's Enscape render (Enscape_2026-04-07).
Frame = the website's entrance group: Blender X = across the road, Blender -Y = outward (away from the site), gate at Y = 0.
Run in Blender:  exec(open(r"D:\\Zufa\\blender\\build_entrance.py").read())"""
exec(open(r"D:\Zufa\blender\zufa_lib.py").read())
import math, random, os

scene()
M = materials()
M['bigstone'] = mat_rubble("ZUFA_Stacked_Stone", light=(0.84, 0.76, 0.62), dark=(0.58, 0.50, 0.40))
mp_node = next(n for n in M['bigstone'].node_tree.nodes if n.bl_idname == "ShaderNodeMapping")
mp_node.inputs["Scale"].default_value = (1.9, 1.9, 2.6)    # bigger stacked stones, as in the render
M['bronze'] = mat_flat("ZUFA_Bronze", (0.13, 0.10, 0.08), 0.38, 0.75)
M['steel'] = mat_flat("ZUFA_Steel", (0.62, 0.64, 0.66), 0.22, 1.0)
M['led'] = M['glass']   # LED rings use the glass material, which the website lights up at dusk


def mat_wave_paving():
    m, nt, b, tc = _new("ZUFA_Wave_Paving")
    L = nt.links.new
    w = _n(nt, "ShaderNodeTexWave", wave_type='BANDS', bands_direction='X', wave_profile='SIN')
    w.inputs["Scale"].default_value = 0.09
    w.inputs["Distortion"].default_value = 9.0
    w.inputs["Detail"].default_value = 2.0
    L(tc.outputs["Object"], w.inputs["Vector"])
    band = _ramp(nt, [(0.0, (0.40, 0.40, 0.40)), (0.18, (0.40, 0.40, 0.40)), (0.22, (0.80, 0.78, 0.74)), (1.0, (0.80, 0.78, 0.74))])
    L(w.outputs["Fac"], band.inputs[0])
    br = _n(nt, "ShaderNodeTexBrick", offset=0.5)
    br.inputs["Scale"].default_value = 1.0
    br.inputs["Brick Width"].default_value = 0.2
    br.inputs["Row Height"].default_value = 0.1
    br.inputs["Mortar Size"].default_value = 0.004
    L(tc.outputs["Object"], br.inputs["Vector"])
    mx = _n(nt, "ShaderNodeMix", data_type='RGBA', blend_type='MULTIPLY')
    mx.inputs["Factor"].default_value = 0.6
    L(band.outputs[0], mx.inputs["A"])
    L(br.outputs["Color"], mx.inputs["B"])
    L(mx.outputs["Result"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.8
    _bump(nt, b, br.outputs["Fac"], -0.3, 0.005)
    return m


M['wave'] = mat_wave_paving()
C = coll("Entrance", clear=True)

# ---- forecourt with wave paving (Blender Y negative = outside the gate)
cyl(C, "EN_forecourt", 19.5, 0.16, (0, -18, 0), M['wave'], 72)

# ---- curved stacked-stone walls (annular sectors) with coping
def arc_wall(name, cx, cy, r, a0, a1, h, t=1.1):
    bm = bmesh.new()
    n = 40
    outer, inner = [], []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        outer.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
        inner.append((cx + math.cos(a) * (r - t), cy + math.sin(a) * (r - t)))
    ring = outer + inner[::-1]
    vb = [bm.verts.new((x, y, 0)) for x, y in ring]
    vt = [bm.verts.new((x, y, h)) for x, y in ring]
    bm.faces.new(vt)
    bm.faces.new(vb[::-1])
    for i in range(len(ring)):
        j = (i + 1) % len(ring)
        bm.faces.new((vb[i], vb[j], vt[j], vt[i]))
    bm.normal_update()
    from_bm(bm, name, M['bigstone'], C)
    # coping
    bm = bmesh.new()
    ring2 = [(cx + math.cos(a0 + (a1 - a0) * i / n) * (r + 0.12), cy + math.sin(a0 + (a1 - a0) * i / n) * (r + 0.12)) for i in range(n + 1)] + \
            [(cx + math.cos(a0 + (a1 - a0) * i / n) * (r - t - 0.12), cy + math.sin(a0 + (a1 - a0) * i / n) * (r - t - 0.12)) for i in range(n, -1, -1)]
    vb = [bm.verts.new((x, y, h)) for x, y in ring2]
    vt = [bm.verts.new((x, y, h + 0.14)) for x, y in ring2]
    bm.faces.new(vt)
    bm.faces.new(vb[::-1])
    for i in range(len(ring2)):
        j = (i + 1) % len(ring2)
        bm.faces.new((vb[i], vb[j], vt[j], vt[i]))
    from_bm(bm, name + "_cope", M['paving'], C)


arc_wall("EN_wallL", -25, -8, 15, -1.05, 1.05, 3.4)
arc_wall("EN_wallR", 25, -8, 15, math.pi - 1.05, math.pi + 1.05, 3.4)

# ---- canopy: two linked rings with a skylight, bronze top, teak-slat soffit, LED rims
C1, C2 = (-11.0, -18.0, 11.0), (14.0, -16.0, 7.0)


def hull_pts(S=64):
    (x1, y1, r1), (x2, y2, r2) = C1, C2
    d = math.hypot(x2 - x1, y2 - y1)
    th = math.atan2(y2 - y1, x2 - x1)
    al = math.acos((r1 - r2) / d)
    pts = [(x1 + math.cos(th + al + (2 * math.pi - 2 * al) * i / S) * r1, y1 + math.sin(th + al + (2 * math.pi - 2 * al) * i / S) * r1) for i in range(S + 1)]
    pts += [(x2 + math.cos(th - al + 2 * al * i / S) * r2, y2 + math.sin(th - al + 2 * al * i / S) * r2) for i in range(S + 1)]
    return pts


Z0 = 9.0
pts = hull_pts()
bm = bmesh.new()
vb = [bm.verts.new((x, y, Z0)) for x, y in pts]
vt = [bm.verts.new((x, y, Z0 + 0.7)) for x, y in pts]
bm.faces.new(vt)
for i in range(len(pts)):
    j = (i + 1) % len(pts)
    bm.faces.new((vb[i], vb[j], vt[j], vt[i]))
bm.normal_update()
top = from_bm(bm, "EN_canopy_top", M['bronze'], C)
sky = cyl(C, "cut_sky", 4.2, 3, (C1[0], C1[1], Z0 - 1), M['bronze'], 48)
cut(top, [sky])
# soffit: timber slats under the canopy
bm = bmesh.new()
vs = [bm.verts.new((x, y, Z0 - 0.02)) for x, y in pts]
bm.faces.new(vs[::-1])
bmesh.ops.triangulate(bm, faces=bm.faces[:])
sof = from_bm(bm, "EN_soffit", M['teak'], C)
cut(sof, [cyl(C, "cut_sky2", 4.2, 3, (C1[0], C1[1], Z0 - 1.5), M['teak'], 48)])
for k in range(-20, 27, 1):
    x = k * 0.9
    ys = [y for (px, y) in pts if abs(px - x) < 0.6]
    if len(ys) < 2:
        continue
    y0, y1 = min(ys) + 0.4, max(ys) - 0.4
    if y1 - y0 > 1:
        box(C, f"EN_slat{k}", (0.12, y1 - y0, 0.1), (x, (y0 + y1) / 2, Z0 - 0.12), M['timber'])
# LED rims: one round the canopy edge, one round the skylight
def ring_tube(name, pts2, z, r=0.12):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    sp = curve.splines.new('POLY')
    sp.points.add(len(pts2) - 1)
    for i, (x, y) in enumerate(pts2):
        sp.points[i].co = (x, y, z, 1)
    sp.use_cyclic_u = True
    curve.bevel_depth = r
    curve.bevel_resolution = 1
    o = bpy.data.objects.new(name, curve)
    C.objects.link(o)
    o.data.materials.append(M['led'])
    return o


ring_tube("EN_led_rim", [(x * 0.985 + C1[0] * 0.015, y * 0.985 + C1[1] * 0.015) for x, y in pts], Z0 - 0.08)
ring_tube("EN_led_sky", [(C1[0] + math.cos(a) * 4.5, C1[1] + math.sin(a) * 4.5) for a in [i / 48 * 2 * math.pi for i in range(48)]], Z0 - 0.08)
for x in (-16, -6, 4, 12):
    cyl(C, f"EN_downlight{x}", 0.18, 0.05, (x, -18 + (2 if x > 0 else 0), Z0 - 0.2), M['led'], 12)

# ---- branching steel tree column under the big ring
rnd = random.Random(4)
for i in range(9):
    a = i / 9 * 2 * math.pi + 0.3
    top_p = Vector((C1[0] + math.cos(a) * 6.2, C1[1] + math.sin(a) * 6.2, Z0 - 0.15))
    base = Vector((C1[0] + rnd.uniform(-0.5, 0.5), C1[1] + rnd.uniform(-0.5, 0.5), 0))
    mid = Vector((C1[0] + math.cos(a) * 1.3, C1[1] + math.sin(a) * 1.3, 3.3))
    curve = bpy.data.curves.new(f"EN_branch{i}", 'CURVE')
    curve.dimensions = '3D'
    sp = curve.splines.new('BEZIER')
    sp.bezier_points.add(1)
    sp.bezier_points[0].co = base
    sp.bezier_points[0].handle_right = mid
    sp.bezier_points[0].handle_left = base - (mid - base) * 0.2
    sp.bezier_points[1].co = top_p
    sp.bezier_points[1].handle_left = mid + Vector((0, 0, 2))
    sp.bezier_points[1].handle_right = top_p + Vector((0, 0, 0.5))
    curve.bevel_depth = 0.14
    curve.bevel_resolution = 1
    curve.resolution_u = 10
    o = bpy.data.objects.new(f"EN_branch{i}", curve)
    C.objects.link(o)
    o.data.materials.append(M['steel'])
for (x, y) in [(9, -12), (19, -12), (9, -20.5), (19, -20.5)]:
    cyl(C, f"EN_post{x}{y}", 0.22, Z0, (x, y, 0), M['bronze'], 12)

# ---- sign on the right wall (facing the road)
fontp = next((p for p in (r"C:\Windows\Fonts\georgia.ttf", r"C:\Windows\Fonts\times.ttf") if os.path.exists(p)), None)
def text_mesh(name, body, size, loc, rz, extrude=0.03):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.align_x = 'CENTER'
    if fontp:
        cu.font = bpy.data.fonts.load(fontp, check_existing=True)
    o = bpy.data.objects.new(name, cu)
    C.objects.link(o)
    o.data.materials.append(M['bronze'])
    o.location = loc
    o.rotation_euler = (math.pi / 2, 0, rz)
    return o


# on the right wall's outer face, turned towards arriving cars (as in the render)
sa = math.pi + 0.55
nx, ny = math.cos(sa), math.sin(sa)
sx, sy = 25 + nx * 15.55, -8 + ny * 15.55   # in front of the curved face so the letters stand clear of the wall
srz = math.atan2(nx, -ny)
text_mesh("EN_sign", "ZUFA", 1.15, (sx, sy, 1.7), -srz)
text_mesh("EN_sign2", "GATED COMMUNITY OF LANDS", 0.2, (sx, sy, 1.25), -srz, 0.01)
bar = box(C, "EN_sign_bar", (3.2, 0.04, 0.03), (sx, sy, 1.5), M['bronze'])
bar.rotation_euler.z = -srz

# ---- steel water blade and basin
cyl(C, "EN_basin", 2.4, 0.4, (-4.5, -26, 0), M['steel'], 40)
cyl(C, "EN_basin_w", 2.2, 0.42, (-4.5, -26, 0), M['water'], 40)
bl = bpy.data.curves.new("EN_blade", 'CURVE')
bl.dimensions = '3D'
sp = bl.splines.new('BEZIER')
sp.bezier_points.add(1)
sp.bezier_points[0].co = (-6.2, -25.2, 0.3)
sp.bezier_points[0].handle_right = (-6.5, -24.2, 4.5)
sp.bezier_points[0].handle_left = (-6.1, -25.4, -0.5)
sp.bezier_points[1].co = (-3.2, -24.4, 6.2)
sp.bezier_points[1].handle_left = (-4.5, -24.0, 6.4)
sp.bezier_points[1].handle_right = (-2.5, -24.6, 6.1)
bl.extrude = 0.35
bl.bevel_depth = 0.04
o = bpy.data.objects.new("EN_blade", bl)
C.objects.link(o)
o.data.materials.append(M['steel'])

# ---- planting: ornamental grasses, shrubs, palms, boulders
M['grassplume'] = M['bloom']
# planting bed in front of each wall (the forecourt side), like the render: grasses, flowering shrubs
for i in range(44):
    left = i % 2 == 0
    cx = -25 if left else 25
    a = (rnd.uniform(-1.0, -0.05)) if left else (math.pi + rnd.uniform(0.05, 1.0))
    r = rnd.uniform(15.7, 17.6)
    x, y = cx + math.cos(a) * r, -8 + math.sin(a) * r
    if abs(x) < 9.6:
        continue
    if i % 4 == 0:
        shrub(C, f"EN_shr{i}", (x, y, 0), rnd.uniform(0.7, 1.0), M, 'leaf', 300 + i)
    elif i % 4 == 1:
        shrub(C, f"EN_flw{i}", (x, y, 0), rnd.uniform(0.6, 0.9), M, 'bloom', 400 + i)
    else:
        lavender(C, f"EN_gr{i}", (x, y, 0), rnd.uniform(1.0, 1.4), M, seed=320 + i)
for i, (x, y, h) in enumerate([(-30, -26, 8.5), (-35, -12, 9.0), (31, -24, 8.2), (36, -10, 9.4), (-14, 4, 7.8), (16, 4, 8.6)]):
    palm(C, f"EN_palm{i}", (x, y, 0), M, h=h, seed=60 + i)
for i, (x, y, s) in enumerate([(-12.5, -30, 1.1), (12.0, -31, 0.9), (-15, -34, 0.7), (21, -2, 0.8), (-21, -2, 0.9)]):
    boulder(C, f"EN_rock{i}", (s * 1.4, s, s * 0.8), (x, y, 0.05), M['rock'], 80 + i)

# convert curves / text to meshes so they bake and export like everything else
for o in list(C.objects):
    if o.type in ('CURVE', 'FONT'):
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        m2 = bpy.data.objects.new(o.name + "_m", me)
        m2.matrix_world = o.matrix_world
        C.objects.link(m2)
        bpy.data.objects.remove(o, do_unlink=True)

bpy.ops.wm.save_mainfile()
result = {"objects": len(C.objects), "tris": sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in C.objects if o.type == 'MESH')}
