"""Sanctuary Villa (about 3,000 sft, single level). Reference: client image 3 (small villa).
Run in Blender:  exec(open(r"D:\\Zufa\\blender\\build_sanctuary.py").read())"""
exec(open(r"D:\Zufa\blender\zufa_lib.py").read())
import math, random

scene()
M = materials()
C = coll("Sanctuary_Villa", clear=True)
H = 3.3          # wall height
FL = 0.35        # finished floor / terrace height

# ---- massing: main hall 24 x 10 + front-gable wing 7 x 5.5  (~278 m2 = ~3,000 sft)
box(C, "S_plinth", (24.4, 10.4, FL), (0, 7, 0), M['rubble'])
box(C, "S_main", (24, 10, H), (0, 7, FL), M['stucco'])
box(C, "S_wing_plinth", (7.4, 5.9, FL), (-8.5, -0.75, 0), M['rubble'])
box(C, "S_wing", (7, 5.5, H + 0.2), (-8.5, -0.75, FL), M['stucco'])

# ---- roofs
hip_roof(C, "S_roof", 24, 10, 27, (0, 7, FL), M['tile'], overhang=1.0, fascia=M['fascia'], fascia_h=0.28, caps=M['tile'], eave=H)
rr, rise = gable_roof(C, "S_wing_roof", 7, 5.5, 32, (-8.5, -0.75, FL), M['tile'], overhang=0.8, eave=H + 0.2, gable_mat=M['stucco'], ridge='Y')
# exposed timber on the front gable
for i, x in enumerate((-1.6, 0, 1.6)):
    h = (3.5 - abs(x)) * math.tan(math.radians(32)) * 0.8
    box(C, f"S_gt{i}", (0.14, 0.18, h), (-8.5 + x, -3.62, FL + H + 0.2), M['teak'])
box(C, "S_gbeam", (7.4, 0.22, 0.24), (-8.5, -3.62, FL + H + 0.05), M['teak'])
# ridge ornaments (Greek-key style blocks at the ridge ends)
for x in (-6.8, 6.8):
    for k, (dx, dz, w, hh) in enumerate([(0, 0.0, 0.7, 0.12), (-0.29, 0.12, 0.12, 0.34), (0.29, 0.12, 0.12, 0.34), (0, 0.42, 0.7, 0.12), (0.06, 0.2, 0.36, 0.1)]):
        box(C, f"S_orn{x}_{k}", (w, 0.12, hh), (x + dx, 7, FL + H + 6.0 * math.tan(math.radians(27)) + 0.12 + dz), M['tile'])

# ---- garden facade (y = 2, facing -Y): pilasters, stone wainscot, timber-framed glazing, lanterns
pil = [-4.6, -0.4, 3.8, 8.0, 11.75]
for i, x in enumerate(pil):
    box(C, f"S_pil{i}", (0.55, 0.35, H - 0.25), (x, 1.88, FL), M['white'])
    box(C, f"S_cap{i}", (0.75, 0.5, 0.25), (x, 1.85, FL + H - 0.3), M['white'])
    if i < len(pil) - 1:
        lantern(C, f"S_lan{i}", (x, 1.7, FL + 2.2), 0, M)
for i in range(len(pil) - 1):
    a, b = pil[i] + 0.28, pil[i + 1] - 0.28
    cx, w = (a + b) / 2, b - a
    glazed_door(C, f"S_gd{i}", min(2.6, w - 0.9), 2.7, (cx, 1.97, FL), '-Y', M, frame='teak', mullions=2)
    for s in (-1, 1):  # rubble wainscot either side of each door
        ww = (w - min(2.6, w - 0.9)) / 2
        box(C, f"S_wsc{i}{s}", (ww, 0.06, 0.95), (cx + s * (min(2.6, w - 0.9) / 2 + ww / 2), 1.97, FL), M['rubble'])
# wing face: wide glazing in stone surround
glazed_door(C, "S_wd", 3.0, 2.8, (-8.5, -3.55, FL), '-Y', M, frame='teak', mullions=3)
for s in (-1, 1):
    box(C, f"S_wsw{s}", (1.75, 0.06, 0.95), (-8.5 + s * 2.6, -3.53, FL), M['rubble'])
# road facade (y = 12): entrance door + windows
glazed_door(C, "S_entry", 1.6, 2.6, (4.0, 12.03, FL), '+Y', M, frame='teak', mullions=1)
box(C, "S_entry_sur", (2.4, 0.12, 3.0), (4.0, 12.06, FL), M['white'])
lantern(C, "S_lanE1", (2.9, 12.2, FL + 2.1), math.pi, M)
lantern(C, "S_lanE2", (5.1, 12.2, FL + 2.1), math.pi, M)
for x in (-9, -4.5, 9):
    glazed_door(C, f"S_bw{x}", 1.6, 1.7, (x, 12.03, FL + 0.9), '+Y', M, frame='teak', mullions=1)
for s in (-1, 1):
    glazed_door(C, f"S_ew{s}", 1.6, 1.7, (s * 12.03, 7, FL + 0.9), '+X' if s > 0 else '-X', M, frame='teak', mullions=1)
glazed_door(C, "S_wsd", 1.6, 1.7, (-12.03, -0.75, FL + 0.9), '-X', M, frame='teak', mullions=1)

# ---- raised terrace with steps and urns
box(C, "S_terrace", (17.2, 3.0, FL), (3.6, 0.5, 0), M['paving'])
box(C, "S_step", (17.2, 0.5, FL / 2), (3.6, -1.25, 0), M['paving'])
for i, x in enumerate((-3.3, 4.9, 11.3)):
    urn(C, f"S_urn{i}", (x, 0.2, FL), M, 1.1)

# ---- freeform natural pool
pts = organic_outline(7.4, 4.0, seed=7, amp=0.12)
pts = [(x + 3.8, y - 7.6) for x, y in pts]
pool_basin(C, "S_pool", pts, 1.3, 0.12, M['rock'], M['water'])
ring_from_outline(C, "S_pool_bank", pts, 0.9, 0.0, 0.18, M['paving'])
# island deck with dining set
cyl(C, "S_island", 2.1, 0.32, (5.0, -8.4, 0), M['deck'], 48)
cyl(C, "S_island_rim", 2.15, 0.28, (5.0, -8.4, 0), M['teak'], 48)
dining_set(C, "S_dine", (5.0, -8.4, 0.32), M)
# stepping stones from the terrace to the island
for i, (x, y, r) in enumerate([(1.0, -2.3, 0.55), (1.6, -3.6, 0.45), (2.4, -4.9, 0.6), (3.2, -6.0, 0.42)]):
    cyl(C, f"S_step_stone{i}", r, 0.22, (x, y, 0), M['paving'], 28)
# boulders round the edge, leaving the stepping-stone approach open
boulder_edge(C, "S_bld", pts, M['rock'], seed=11, every=1.5, size=(0.55, 1.1), skip=lambda x, y: 0 < x < 4 and y > -5.5)
boulder(C, "S_bld_big1", (1.5, 1.2, 1.1), (-3.1, -6.0, 0.1), M['rock'], 41)
boulder(C, "S_bld_big2", (1.0, 0.9, 0.9), (-2.4, -7.3, 0.05), M['rock'], 42)
boulder(C, "S_bld_big3", (1.5, 1.2, 1.0), (11.6, -9.0, 0.05), M['rock'], 43)

# ---- planting
rnd = random.Random(5)
for i, (x, y) in enumerate([(-4.6, -9.5), (-5.2, -5.3), (12.0, -5.3), (11.0, -11.2), (-1.0, -11.6), (8.5, -12.0), (12.3, -2.0)]):
    lavender(C, f"S_lav{i}", (x, y, 0), rnd.uniform(0.8, 1.2), M, seed=i + 20)
for i, (x, y) in enumerate([(-6.0, -7.4), (13.0, -7.5), (-0.6, -2.3), (7.6, -2.6)]):
    shrub(C, f"S_shr{i}", (x, y, 0), rnd.uniform(0.7, 1.1), M, 'leaf', i + 60)
palm(C, "S_palm1", (-4.0, -11.0, 0), M, h=7.5, seed=3)
palm(C, "S_palm2", (12.4, -4.0, 0), M, h=6.4, seed=8)
olive(C, "S_olive", (-9.8, -7.5, 0), M, seed=9, s=1.1)

import bpy
bpy.ops.wm.save_mainfile()
result = {"objects": len(C.objects), "tris": sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in C.objects if o.type == 'MESH')}
