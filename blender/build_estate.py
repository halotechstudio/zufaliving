"""Estate Villa (about 5,000 sft, single level). Reference: client image 2 (big villa).
Run in Blender:  exec(open(r"D:\\Zufa\\blender\\build_estate.py").read())"""
exec(open(r"D:\Zufa\blender\zufa_lib.py").read())
import math, random

scene()
M = materials()
M['sand'] = mat_rock("ZUFA_Sandstone", light=(0.80, 0.74, 0.62), dark=(0.56, 0.50, 0.40))
M['stonedeck'] = mat_paving("ZUFA_Stone_Deck", (0.78, 0.74, 0.66), (0.72, 0.68, 0.60), 0.9)
C = coll("Estate_Villa", clear=True)
H = 3.5
FL = 0.6

# ---- massing: main wing 28 x 12.5 + garden wing 9 x 12.8  (~465 m2 = ~5,000 sft)
box(C, "E_plinth", (28.4, 12.9, FL), (0, 6.75, 0), M['rubble'])
box(C, "E_main", (28, 12.5, H), (0, 6.75, FL), M['stucco'])
box(C, "E_wing_plinth", (9.4, 13.2, FL), (9.5, -5.9, 0), M['rubble'])
box(C, "E_wing", (9, 12.8, H), (9.5, -5.9, FL), M['stucco'])

# ---- roofs: standing-seam metal, deep dark fascia
hip_roof(C, "E_roof", 28, 12.5, 22, (0, 6.75, FL), M['metal'], overhang=1.3, fascia=M['fascia'], fascia_h=0.45, caps=M['metal'], eave=H)
gable_roof(C, "E_wing_roof", 9, 12.8, 30, (9.5, -5.9, FL), M['metal'], overhang=1.1, eave=H, gable_mat=M['timber'], ridge='Y')
box(C, "E_wing_fascia", (11.3, 0.3, 0.42), (9.5, -13.4, FL + H - 0.4), M['fascia'])
box(C, "E_ridge_orn", (0.8, 0.14, 0.5), (-9.5, 6.75, FL + H + 7.55 * math.tan(math.radians(22)) + 0.05), M['fascia'])

# ---- garden facade of the main wing (y = 0.5, facing -Y), x -14..5
pil = [-13.7, -9.2, -4.7, -0.2, 4.7]
for i, x in enumerate(pil):
    box(C, f"E_pil{i}", (0.65, 0.4, H - 0.3), (x, 0.36, FL), M['white'])
    box(C, f"E_cap{i}", (0.85, 0.55, 0.3), (x, 0.33, FL + H - 0.35), M['white'])
    box(C, f"E_base{i}", (0.8, 0.5, 0.5), (x, 0.33, FL), M['rubble'])
    lantern(C, f"E_lan{i}", (x, 0.15, FL + 2.3), 0, M)
for i in range(len(pil) - 1):
    a, b = pil[i] + 0.33, pil[i + 1] - 0.33
    cx, w = (a + b) / 2, b - a
    dw = min(3.2, w - 0.7)
    glazed_door(C, f"E_gd{i}", dw, 2.85, (cx, 0.47, FL), '-Y', M, frame='frame', mullions=2)
    for s in (-1, 1):
        ww = (w - dw) / 2
        box(C, f"E_wsc{i}{s}", (ww, 0.06, 1.05), (cx + s * (dw / 2 + ww / 2), 0.47, FL), M['rubble'])
# garden wing: inner face (x = 5, facing -X) and gable end (y = -12.3)
for i, y in enumerate((-2.6, -7.2)):
    glazed_door(C, f"E_wi{i}", 3.0, 2.85, (4.97, y, FL), '-X', M, frame='frame', mullions=2)
    box(C, f"E_wiw{i}", (0.06, 1.0, 1.05), (4.97, y - 2.0, FL), M['rubble'])
glazed_door(C, "E_wg", 4.2, 2.9, (9.5, -12.33, FL), '-Y', M, frame='frame', mullions=3)
for s in (-1, 1):
    box(C, f"E_wgw{s}", (2.2, 0.06, 1.05), (9.5 + s * 3.35, -12.33, FL), M['rubble'])
# road facade + ends
box(C, "E_entry_sur", (3.4, 0.2, 3.4), (-4.0, 13.08, FL), M['rubble'])
glazed_door(C, "E_entry", 2.2, 2.9, (-4.0, 13.15, FL), '+Y', M, frame='frame', mullions=2)
lantern(C, "E_lanE1", (-5.9, 13.3, FL + 2.3), math.pi, M)
lantern(C, "E_lanE2", (-2.1, 13.3, FL + 2.3), math.pi, M)
for x in (-11, 3, 9):
    glazed_door(C, f"E_bw{x}", 2.0, 1.8, (x, 13.03, FL + 0.95), '+Y', M, frame='frame', mullions=2)
for s, y in ((-1, 6.75), (1, 9.5)):
    glazed_door(C, f"E_ew{s}", 2.0, 1.8, (s * 14.03, y, FL + 0.95), '+X' if s > 0 else '-X', M, frame='frame', mullions=2)
glazed_door(C, "E_wo", 2.0, 1.8, (14.03, -6.0, FL + 0.95), '+X', M, frame='frame', mullions=2)

# ---- raised terrace with steps and urns
box(C, "E_terrace", (19.2, 2.6, FL), (-4.6, -0.8, 0), M['stonedeck'])
box(C, "E_step1", (19.2, 0.45, FL * 0.66), (-4.6, -2.32, 0), M['stonedeck'])
box(C, "E_step2", (19.2, 0.45, FL * 0.33), (-4.6, -2.77, 0), M['stonedeck'])
for i, x in enumerate((-11.5, -7.0, -2.5, 2.4)):
    urn(C, f"E_urn{i}", (x, -1.4, FL), M, 1.25)

# ---- lagoon pool with sandstone boulders, island deck and stepping stones
pts = organic_outline(8.0, 4.4, seed=21, amp=0.13)
pts = [(x - 4.6, y - 8.3) for x, y in pts]
pool_basin(C, "E_pool", pts, 1.4, 0.12, M['sand'], M['water'])
ring_from_outline(C, "E_pool_bank", pts, 1.0, 0.0, 0.2, M['stonedeck'])
cyl(C, "E_island", 2.5, 0.34, (-2.4, -8.6, 0), M['stonedeck'], 56)
dining_set(C, "E_dine", (-2.4, -8.6, 0.34), M, n=6, r=1.2)
for i, (x, y, r) in enumerate([(-6.0, -3.6, 0.7), (-5.0, -4.9, 0.5), (-4.4, -6.2, 0.75), (-8.2, -6.6, 0.45), (-9.0, -7.7, 0.62)]):
    cyl(C, f"E_stone{i}", r, 0.24, (x, y, 0), M['stonedeck'], 32)
boulder_edge(C, "E_bld", pts, M['sand'], seed=31, every=1.7, size=(0.7, 1.3), skip=lambda x, y: -7.5 < x < -3.5 and y > -5.0)
for i, (x, y, s) in enumerate([(2.6, -6.4, 1.6), (3.2, -8.0, 1.2), (-12.6, -9.0, 1.4), (-12.0, -10.5, 1.0)]):
    boulder(C, f"E_bigrock{i}", (s, s * 0.85, s * 0.9), (x, y, 0.1), M['sand'], 70 + i)

# ---- sunken lounge (front-left corner of the garden)
box(C, "E_lounge_floor", (4.6, 3.2, 0.1), (-11.2, -2.4, -0.5), M['stonedeck'])
for (sx, sy, x, y) in [(4.8, 0.35, -11.2, -0.85), (4.8, 0.35, -11.2, -3.95), (0.35, 3.4, -13.45, -2.4), (0.35, 3.4, -8.95, -2.4)]:
    box(C, f"E_lw{x}{y}", (sx, sy, 0.95), (x, y, -0.5), M['rubble'])
box(C, "E_lseat1", (4.0, 0.7, 0.45), (-11.2, -1.3, -0.4), M['cushion'], bevel=0.06)
box(C, "E_lseat2", (0.7, 2.2, 0.45), (-13.0, -2.6, -0.4), M['cushion'], bevel=0.06)
box(C, "E_ltable", (1.3, 0.8, 0.4), (-11.0, -2.8, -0.4), M['teak'])

# ---- planting
rnd = random.Random(17)
for i, (x, y) in enumerate([(-13.4, -6.0), (-13.0, -12.4), (-7.0, -13.2), (0.5, -13.0), (3.8, -11.4), (4.2, -3.6), (-0.6, -3.4)]):
    lavender(C, f"E_lav{i}", (x, y, 0), rnd.uniform(0.9, 1.3), M, seed=i + 120)
for i, (x, y) in enumerate([(-3.0, -12.9), (2.0, -4.6), (-9.8, -12.8)]):
    shrub(C, f"E_shr{i}", (x, y, 0), rnd.uniform(0.8, 1.2), M, 'leaf', i + 160)
palm(C, "E_palm1", (3.0, -10.0, 0), M, h=5.5, seed=13)
palm(C, "E_palm2", (-13.2, -10.6, 0), M, h=6.8, seed=14)
olive(C, "E_olive", (13.4, -14.0, 0), M, seed=15, s=1.0)

import bpy
bpy.ops.wm.save_mainfile()
result = {"objects": len(C.objects), "tris": sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in C.objects if o.type == 'MESH')}
