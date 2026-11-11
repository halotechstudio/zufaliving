"""Tree library for the website's forest and gardens (vertex-coloured, light enough to instance thousands).
Each tree is its own collection and its own export. Origin at the trunk base; canopy radius about 4.5 m for forest trees.
Run in Blender:  exec(open(r"D:\\Zufa\\blender\\build_trees.py").read())"""
exec(open(r"D:\Zufa\blender\zufa_lib.py").read())
import math, random

scene()
M = materials()
out = {}


def trunk_with_limbs(C, name, h, r0, limbs, spread, seed):
    rnd = random.Random(seed)
    cyl(C, name + "_t", r0, h, (0, 0, 0), M['bark'], 6, r0 * 0.6)
    tips = []
    for i in range(limbs):
        a = 2 * math.pi * i / limbs + rnd.uniform(-0.3, 0.3)
        L = spread * rnd.uniform(0.8, 1.1)
        base = Vector((0, 0, h * 0.85))
        tip = Vector((math.cos(a) * L, math.sin(a) * L, h + L * 0.6))
        d = tip - base
        b = cyl(C, f"{name}_l{i}", r0 * 0.45, d.length, (0, 0, 0), M['bark'], 5, r0 * 0.2)
        b.rotation_mode = 'QUATERNION'
        b.rotation_quaternion = d.to_track_quat('Z', 'Y')
        b.location = base
        tips.append(tip)
    return tips


# --- forest A: broad rain-tree / banyan-like canopy (~450 tris)
C = coll("Tree_ForestA", clear=True)
tips = trunk_with_limbs(C, "FA", 4.0, 0.32, 4, 2.6, 1)
cent = [(t.x, t.y, t.z + 0.8, 2.3) for t in tips] + [(0, 0, 7.4, 2.8)]
leaf_canopy(C, "FA_canopy", cent, None, M, 'leaf', per=42, leaf=0.95, seed=1)
out['forestA'] = export_plain("Tree_ForestA", "ForestA", "tree_forest_a")

# --- forest B: taller, rounder (neem / mango-like)
C = coll("Tree_ForestB", clear=True)
tips = trunk_with_limbs(C, "FB", 5.0, 0.28, 3, 1.6, 2)
cent = [(t.x, t.y, t.z + 1.0, 2.0) for t in tips] + [(0, 0, 8.6, 2.6), (0, 0, 10.2, 1.8)]
leaf_canopy(C, "FB_canopy", cent, None, M, 'leaf', per=40, leaf=0.9, seed=2)
out['forestB'] = export_plain("Tree_ForestB", "ForestB", "tree_forest_b")

# --- forest C: slender, lighter-toned (teak / acacia-like), flatter crown
C = coll("Tree_ForestC", clear=True)
tips = trunk_with_limbs(C, "FC", 6.0, 0.24, 5, 3.0, 3)
cent = [(t.x, t.y, t.z + 0.4, 1.9) for t in tips]
leaf_canopy(C, "FC_canopy", cent, None, M, 'olive', per=34, leaf=0.85, seed=3)
out['forestC'] = export_plain("Tree_ForestC", "ForestC", "tree_forest_c")

# --- garden tree: denser and finer for close-up views inside the plots (~1,600 tris)
C = coll("Tree_Garden", clear=True)
tips = trunk_with_limbs(C, "GT", 2.4, 0.16, 4, 1.3, 4)
cent = [(t.x, t.y, t.z + 0.5, 1.2) for t in tips] + [(0, 0, 4.2, 1.5)]
leaf_canopy(C, "GT_canopy", cent, None, M, 'leaf', per=150, leaf=0.32, seed=4)
out['garden'] = export_plain("Tree_Garden", "GardenTree", "tree_garden")

# --- palm for avenues and boulevards (fine leaflets, ~1,800 tris)
C = coll("Tree_Palm", clear=True)
palm(C, "PL", (0, 0, 0), M, h=8.5, seed=5)
out['palm'] = export_plain("Tree_Palm", "Palm", "tree_palm")

bpy.ops.wm.save_mainfile()
result = out
