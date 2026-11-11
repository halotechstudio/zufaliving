"""Wellness clubhouse campus. Reference: client image 1 (Kerala-style tropical pavilions, pond, lawn).
Fits the clubhouse parcel: Blender X -30..42, Y -36..16 (origin = parcel centroid, X along its longest edge).
Run in Blender:  exec(open(r"D:\\Zufa\\blender\\build_clubhouse.py").read())"""
exec(open(r"D:\Zufa\blender\zufa_lib.py").read())
import math, random

scene()
M = materials()
M['stonedeck'] = mat_paving("ZUFA_Stone_Deck", (0.78, 0.74, 0.66), (0.72, 0.68, 0.60), 0.9)
M['laterite'] = mat_rubble("ZUFA_Laterite", light=(0.62, 0.36, 0.24), dark=(0.42, 0.22, 0.14))
M['grass'] = mat_foliage("ZUFA_Reed", (0.20, 0.30, 0.08), (0.42, 0.50, 0.18), 30.0)
C = coll("Clubhouse", clear=True)
rnd = random.Random(3)


def kerala_hall(name, w, d, cx, cy, eave=3.6, pitch=33, ver=2.4, post_gap=3.0, gable=True):
    """Hall with glazed core, timber-pillar veranda all round and a steep hipped Mangalore-tile roof."""
    FL = 0.5
    box(C, name + "_plinth", (w + 0.6, d + 0.6, FL), (cx, cy, 0), M['laterite'])
    box(C, name + "_floor", (w + 0.2, d + 0.2, 0.06), (cx, cy, FL), M['terracotta'])
    cw, cd = w - 2 * ver, d - 2 * ver
    box(C, name + "_core", (cw, cd, eave - 0.2), (cx, cy, FL), M['stucco'])
    # glazing bands on the long faces of the core
    n = max(2, int(cw / 3.4))
    for s in (-1, 1):
        for i in range(n):
            x = cx - cw / 2 + cw * (i + 0.5) / n
            glazed_door(C, f"{name}_g{s}{i}", cw / n - 0.6, 2.6, (x, cy + s * (cd / 2 + 0.02), FL), '+Y' if s > 0 else '-Y', M, frame='teak', mullions=2)
    # veranda pillars on stone bases
    k = 0
    for sx in (-1, 1):
        for i in range(int(d / post_gap) + 1):
            y = cy - d / 2 + 0.3 + (d - 0.6) * i / int(d / post_gap)
            for o in (cyl(C, f"{name}_p{k}", 0.15, eave - 0.45, (cx + sx * (w / 2 - 0.3), y, FL + 0.45), M['teak'], 12),
                      box(C, f"{name}_pb{k}", (0.5, 0.5, 0.45), (cx + sx * (w / 2 - 0.3), y, FL), M['rubble'])):
                pass
            k += 1
    for sy in (-1, 1):
        for i in range(1, int(w / post_gap)):
            x = cx - w / 2 + 0.3 + (w - 0.6) * i / int(w / post_gap)
            cyl(C, f"{name}_p{k}", 0.15, eave - 0.45, (x, cy + sy * (d / 2 - 0.3), FL + 0.45), M['teak'], 12)
            box(C, f"{name}_pb{k}", (0.5, 0.5, 0.45), (x, cy + sy * (d / 2 - 0.3), FL), M['rubble'])
            k += 1
    # timber wall plate (beam) round the veranda
    for sy in (-1, 1):
        box(C, f"{name}_bm{sy}", (w, 0.3, 0.32), (cx, cy + sy * (d / 2 - 0.3), FL + eave - 0.32), M['teak'])
    for sx in (-1, 1):
        box(C, f"{name}_bmx{sx}", (0.3, d, 0.32), (cx + sx * (w / 2 - 0.3), cy, FL + eave - 0.32), M['teak'])
    roof, h = hip_roof(C, name + "_roof", w, d, pitch, (cx, cy, FL), M['tile_mlr'], overhang=1.5, fascia=M['teak'], fascia_h=0.3, caps=M['tile_mlr'], eave=eave)
    if gable:
        # Kerala cross-gable (mukhappu) facing the garden with a carved timber face
        gw = min(9, w * 0.3)
        gable_roof(C, name + "_xg", gw, d / 2 + 1.5, pitch + 4, (cx, cy - d / 4 - 0.75, FL), M['tile_mlr'], overhang=0.9, eave=eave + 0.4, gable_mat=M['teak'], ridge='Y')
        for i in range(7):
            x = -gw / 2 + gw * (i + 0.5) / 7
            hh = (gw / 2 - abs(x)) * math.tan(math.radians(pitch + 4)) * 0.85
            if hh > 0.2:
                box(C, f"{name}_xgs{i}", (0.08, 0.1, hh), (cx + x, cy - d / 2 - 1.42, FL + eave + 0.4), M['timber'])
    return h


def lattice_band(name, w, d, cx, cy, z, hgt=0.55, gap=0.22):
    """Carved timber lattice frieze under the eaves of a pavilion."""
    for s in (-1, 1):
        box(C, f"{name}_ty{s}", (w, 0.08, 0.08), (cx, cy + s * d / 2, z + hgt), M['teak'])
        box(C, f"{name}_by{s}", (w, 0.08, 0.08), (cx, cy + s * d / 2, z), M['teak'])
        box(C, f"{name}_tx{s}", (0.08, d, 0.08), (cx + s * w / 2, cy, z + hgt), M['teak'])
        box(C, f"{name}_bx{s}", (0.08, d, 0.08), (cx + s * w / 2, cy, z), M['teak'])
        for i in range(int(w / gap)):
            box(C, f"{name}_sy{s}{i}", (0.05, 0.05, hgt), (cx - w / 2 + gap * (i + 0.5), cy + s * d / 2, z), M['teak'])
        for i in range(int(d / gap)):
            box(C, f"{name}_sx{s}{i}", (0.05, 0.05, hgt), (cx + s * w / 2, cy - d / 2 + gap * (i + 0.5), z), M['teak'])


def lounger(name, x, y, rz):
    objs = [box(C, name + "_b", (0.7, 1.9, 0.3), (0, 0, 0.12), M['cushion'], bevel=0.05),
            box(C, name + "_bk", (0.7, 0.6, 0.12), (0, 0.75, 0.4), M['cushion'], bevel=0.04)]
    objs[1].rotation_euler.x = math.radians(35)
    _place(objs, (x, y, 0.08), rz)


def shade_tree(name, x, y, s=1.0, seed=0):
    """Broad rain-tree style canopy on a forked trunk."""
    r = random.Random(seed)
    cyl(C, name + "_t", 0.35 * s, 4.2 * s, (x, y, 0), M['bark'], 10, 0.22 * s)
    for i in range(3):
        a = r.uniform(0, 6.28)
        br = cyl(C, f"{name}_br{i}", 0.16 * s, 3.0 * s, (x, y, 3.6 * s), M['bark'], 8, 0.08 * s)
        br.rotation_euler = (math.cos(a) * 0.7, math.sin(a) * 0.7, 0)
    for i in range(9):
        a = r.uniform(0, 6.28)
        d = r.uniform(0.5, 3.6) * s
        boulder(C, f"{name}_c{i}", (2.6 * s, 2.4 * s, 1.6 * s), (x + math.cos(a) * d, y + math.sin(a) * d, (6.2 + r.uniform(-0.6, 1.2)) * s), M['leaf'], seed * 13 + i, 2)


def reeds(name, x, y, n=9, seed=0):
    r = random.Random(seed)
    for i in range(n):
        a = r.uniform(0, 6.28)
        d = r.uniform(0, 0.6)
        b = cyl(C, f"{name}{i}", 0.05, r.uniform(0.8, 1.5), (x + math.cos(a) * d, y + math.sin(a) * d, 0), M['grass'], 4, 0.005)
        b.rotation_euler = (r.uniform(-0.25, 0.25), r.uniform(-0.25, 0.25), 0)


# ---- 1. main hall (lounge, café, reception) and spa/gym wing
kerala_hall("CH_main", 40, 13, 8, 4)
kerala_hall("CH_spa", 15, 10, -21, 5.5, eave=3.4, gable=False)
box(C, "CH_link", (6.5, 3.0, 0.5), (-10.8, 4.5, 0), M['laterite'])
cyl(C, "CH_link_p1", 0.15, 3.0, (-12.6, 3.3, 0.5), M['teak'], 12)
cyl(C, "CH_link_p2", 0.15, 3.0, (-9.0, 3.3, 0.5), M['teak'], 12)
gable_roof(C, "CH_link_roof", 6.5, 3.0, 28, (-10.8, 4.5, 0.5), M['tile_mlr'], overhang=0.5, eave=3.0)

# ---- 2. lap pool, deck, loungers, jacuzzi (garden side of the main hall)
box(C, "CH_deck", (34, 12, 0.18), (10, -10.5, 0), M['stonedeck'])
box(C, "CH_pool_wall", (26.4, 8.4, 0.2), (10, -11, 0), M['stonedeck'])
box(C, "CH_pool", (25, 7, 0.2), (10, -11, 0.02), M['water'])
cyl(C, "CH_jac_rim", 1.9, 0.45, (25.5, -11, 0), M['stonedeck'], 40)
cyl(C, "CH_jac", 1.6, 0.47, (25.5, -11, 0), M['water'], 40)
for i in range(8):
    lounger(f"CH_lg{i}", -1.5 + i * 3.2, -5.7, math.pi)
for i, x in enumerate((-4.5, 24.5)):
    cyl(C, f"CH_umb_pole{i}", 0.05, 2.5, (x, -6.2, 0.18), M['teak'], 8)
    cyl(C, f"CH_umb{i}", 1.6, 0.6, (x, -6.2, 2.4), M['cushion'], 12, 0.05)

# ---- 3. open dining pavilion (nalukettu style)
PX, PY, PW = -18, -12, 10
box(C, "CH_pav_plinth", (PW + 1, PW + 1, 0.55), (PX, PY, 0), M['laterite'])
box(C, "CH_pav_deck", (PW + 0.6, PW + 0.6, 0.06), (PX, PY, 0.55), M['deck'])
k = 0
for i in range(4):
    for j in range(4):
        if 0 < i < 3 and 0 < j < 3:
            continue
        x, y = PX - PW / 2 + 0.5 + (PW - 1) * i / 3, PY - PW / 2 + 0.5 + (PW - 1) * j / 3
        for dx in (-0.2, 0.2):
            cyl(C, f"CH_pav_p{k}", 0.12, 3.0, (x + dx, y, 0.61), M['teak'], 10)
            k += 1
        box(C, f"CH_pav_pb{k}", (0.8, 0.5, 0.3), (x, y, 0.61), M['rubble'])
lattice_band("CH_lat", PW - 0.6, PW - 0.6, PX, PY, 3.0)
hip_roof(C, "CH_pav_roof", PW, PW, 36, (PX, PY, 0.61), M['tile_mlr'], overhang=1.4, fascia=M['teak'], fascia_h=0.28, caps=M['tile_mlr'], eave=3.1)
for i, (x, y) in enumerate([(PX - 2.3, PY - 2.3), (PX + 2.3, PY - 2.3), (PX - 2.3, PY + 2.3), (PX + 2.3, PY + 2.3)]):
    dining_set(C, f"CH_dine{i}", (x, y, 0.61), M, n=4, r=0.9)

# ---- 4. natural pond with river-pebble bank, boulders and reeds
pts = organic_outline(15.0, 5.2, seed=4, amp=0.16)
pts = [(x + 14, y - 27.5) for x, y in pts]
disc_from_outline(C, "CH_pond_water", pts, 0.05, M['pond'])
ring_from_outline(C, "CH_pond_pebbles", pts, 1.6, 0.0, 0.08, M['pebbles'])
bm_bed = disc_from_outline(C, "CH_pond_bed", pts, -0.6, M['pebbles'], inset=0.3)
boulder_edge(C, "CH_pb", pts, M['rock'], seed=7, every=3.4, size=(0.6, 1.3))
for i, (x, y) in enumerate([(1.0, -24.0), (6.0, -32.0), (21.0, -22.6), (27.0, -30.0), (12.0, -21.8), (16.5, -33.4)]):
    reeds(f"CH_reed{i}_", x, y, 10, seed=i)
# little timber footbridge across the narrow waist
box(C, "CH_bridge", (1.8, 7.0, 0.14), (9.0, -27.5, 0.45), M['deck'])
for s in (-1, 1):
    box(C, f"CH_rail{s}", (0.08, 7.0, 0.9), (9.0 + s * 0.85, -27.5, 0.59), M['teak'])

# ---- 5. paths, shade trees, palms, planting
box(C, "CH_path1", (2.2, 8, 0.06), (-6, -11, 0), M['stonedeck'])
box(C, "CH_path2", (16, 2.2, 0.06), (-6, -20, 0), M['stonedeck'])
for i, (x, y, s) in enumerate([(-6, -30, 1.15), (33, -19, 1.25), (36, 5, 1.0), (-28, -24, 1.1), (30, -33, 0.95)]):
    broadleaf_tree(C, f"CH_tree{i}", (x, y, 0), M, s, seed=i + 2)
for i, (x, y, h) in enumerate([(-29, 14, 8.5), (-14, 14, 7.0), (32, 13, 7.8), (39, -4, 8.2), (-30, -6, 7.4), (24, -36, 6.8), (2, -36, 7.6)]):
    palm(C, f"CH_palm{i}", (x, y, 0), M, h=h, seed=40 + i)
for i in range(16):
    a = rnd.uniform(0, 6.28)
    x, y = 14 + math.cos(a) * rnd.uniform(15.5, 17.5), -27.5 + math.sin(a) * rnd.uniform(6.5, 8.5)
    shrub(C, f"CH_shr{i}", (x, y, 0), rnd.uniform(0.6, 1.1), M, 'bloom' if i % 4 == 0 else 'leaf', 200 + i)

import bpy
bpy.ops.wm.save_mainfile()
result = {"objects": len(C.objects), "tris": sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in C.objects if o.type == 'MESH')}
