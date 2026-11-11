"""ZUFA Blender library: materials, building parts, baking and export.
Load inside Blender with:  exec(open(r"D:\\Zufa\\blender\\zufa_lib.py").read())
Conventions: metres, Z up, model origin at ground centre. Blender +X = long axis, -Y = garden/pool side
(the website maps Blender -Y to its +Z, which faces the plot's garden)."""
import bpy, bmesh, math, os, random, time
import numpy as np
from mathutils import Vector, Matrix, noise

SCN_NAME = "ZUFA_Assets"
EXPORT_DIR = r"D:\Zufa\blender\export"
TEX_DIR = os.path.join(EXPORT_DIR, "textures")
# materials that stay separate on the web (night glow / water shading)
KEEP = {"ZUFA_Glass", "ZUFA_Water", "ZUFA_Shade", "ZUFA_Pond"}
# foliage keeps its own material (coloured per leaf with vertex colours) instead of using atlas space
FOLIAGE = {"ZUFA_Leaf", "ZUFA_Olive_Leaf", "ZUFA_Lavender", "ZUFA_Bloom", "ZUFA_Reed", "ZUFA_Bark"}
KEEP |= FOLIAGE
FOLIAGE_TONES = {
    "ZUFA_Leaf": [(0.06, 0.16, 0.04), (0.11, 0.25, 0.06), (0.17, 0.32, 0.08), (0.24, 0.36, 0.10)],
    "ZUFA_Olive_Leaf": [(0.14, 0.18, 0.11), (0.22, 0.27, 0.18), (0.30, 0.34, 0.24)],
    "ZUFA_Lavender": [(0.30, 0.22, 0.50), (0.42, 0.32, 0.64), (0.22, 0.30, 0.16)],
    "ZUFA_Bloom": [(0.50, 0.12, 0.28), (0.70, 0.30, 0.45), (0.14, 0.26, 0.08)],
    "ZUFA_Reed": [(0.22, 0.30, 0.10), (0.36, 0.42, 0.16), (0.46, 0.46, 0.22)],
    "ZUFA_Bark": [(0.20, 0.15, 0.11), (0.27, 0.21, 0.15), (0.33, 0.27, 0.20)],
}


def export_plain(src_coll, name, out_name):
    """Join a collection (vertex-coloured, no baking) and export it as GLB."""
    scn = scene()
    vl = bpy.context.view_layer
    exp = coll("Export")
    exp.hide_viewport = False
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    dups = []
    for o in bpy.data.collections[src_coll].objects:
        if o.type != 'MESH':
            continue
        d = o.copy()
        d.data = o.data.copy()
        exp.objects.link(d)
        if not d.data.color_attributes.get("Col"):
            tint_foliage(d, 0)
        dups.append(d)
    for o in vl.objects:
        o.select_set(False)
    for d in dups:
        d.select_set(True)
    vl.objects.active = dups[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(dups) > 1:
        bpy.ops.object.join()
    j = vl.objects.active
    j.name = name
    ca = j.data.color_attributes
    for a in [a for a in ca if a.name != "Col"]:
        ca.remove(a)
    if "Col" in ca:
        ca.active_color = ca["Col"]
    path = os.path.join(EXPORT_DIR, out_name + ".glb")
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_cameras=False, export_lights=False)
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    j.hide_render = True
    exp.hide_viewport = True
    return {"bytes": os.path.getsize(path), "tris": sum(len(p.vertices) - 2 for p in j.data.polygons)}


def tint_foliage(o, seed=0):
    """Random per-face colour from the material's palette (exported as COLOR_0)."""
    me = o.data
    pal = FOLIAGE_TONES.get(me.materials[0].name if me.materials else "", None)
    if not pal:
        return
    rnd = random.Random(seed)
    ca = me.color_attributes.new("Col", 'BYTE_COLOR', 'CORNER')
    for p in me.polygons:
        c = pal[rnd.randrange(len(pal))]
        k = rnd.uniform(0.85, 1.15)
        col = (min(1, c[0] * k), min(1, c[1] * k), min(1, c[2] * k), 1)
        for li in p.loop_indices:
            ca.data[li].color = col


def scene():
    s = bpy.data.scenes.get(SCN_NAME) or bpy.data.scenes.new(SCN_NAME)
    bpy.context.window.scene = s
    return s


# ---------------------------------------------------------------- materials
def _new(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(b.outputs[0], out.inputs[0])
    tc = nt.nodes.new("ShaderNodeTexCoord")
    return m, nt, b, tc


def _n(nt, t, **kw):
    n = nt.nodes.new(t)
    for k, v in kw.items():
        if k in n.inputs:
            n.inputs[k].default_value = v
        else:
            setattr(n, k, v)
    return n


def _ramp(nt, stops):
    r = nt.nodes.new("ShaderNodeValToRGB")
    e = r.color_ramp.elements
    e[0].position, e[0].color = stops[0][0], (*stops[0][1], 1)
    e[1].position, e[1].color = stops[-1][0], (*stops[-1][1], 1)
    for p, c in stops[1:-1]:
        x = e.new(p)
        x.color = (*c, 1)
    return r


def _bump(nt, b, h, strength, dist=0.02):
    bp = _n(nt, "ShaderNodeBump")
    bp.inputs["Strength"].default_value = strength
    bp.inputs["Distance"].default_value = dist
    nt.links.new(h, bp.inputs["Height"])
    nt.links.new(bp.outputs[0], b.inputs["Normal"])
    return bp


def _math(nt, op, a=None, b=None):
    m = _n(nt, "ShaderNodeMath", operation=op)
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            m.inputs[i].default_value = v
        else:
            nt.links.new(v, m.inputs[i])
    return m.outputs[0]


def _slope_axis(nt, tc):
    """1 where the face points mostly along X (so its slope runs along X), else 0."""
    geo = _n(nt, "ShaderNodeNewGeometry")
    sep = _n(nt, "ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Normal"], sep.inputs[0])
    ax = _math(nt, "ABSOLUTE", sep.outputs["X"])
    ay = _math(nt, "ABSOLUTE", sep.outputs["Y"])
    return _math(nt, "GREATER_THAN", ax, ay)


def _along(nt, tc, axis_flag, scale_across, scale_up):
    """Coordinates (u across the slope, v up the slope) for roof patterns on hip faces."""
    sep = _n(nt, "ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    # across = Y when the face points along X, else X
    mix = _n(nt, "ShaderNodeMix", data_type='FLOAT')
    nt.links.new(axis_flag, mix.inputs["Factor"])
    nt.links.new(sep.outputs["X"], mix.inputs["A"])
    nt.links.new(sep.outputs["Y"], mix.inputs["B"])
    u = _math(nt, "MULTIPLY", mix.outputs["Result"], scale_across)
    v = _math(nt, "MULTIPLY", sep.outputs["Z"], scale_up)
    return u, v


def mat_stucco(name, base, dirt=(0.55, 0.50, 0.42)):
    m, nt, b, tc = _new(name)
    L = nt.links.new
    n1 = _n(nt, "ShaderNodeTexNoise", Scale=0.35, Detail=6.0, Roughness=0.6)
    n2 = _n(nt, "ShaderNodeTexNoise", Scale=22.0, Detail=8.0, Roughness=0.7)
    L(tc.outputs["Object"], n1.inputs["Vector"])
    L(tc.outputs["Object"], n2.inputs["Vector"])
    r = _ramp(nt, [(0.3, tuple(c * 0.93 for c in base)), (0.7, base)])
    L(n1.outputs["Fac"], r.inputs[0])
    sep = _n(nt, "ShaderNodeSeparateXYZ")
    L(tc.outputs["Object"], sep.inputs[0])
    low = _ramp(nt, [(0.0, (0, 0, 0)), (0.12, (1, 1, 1))])
    L(_math(nt, "MULTIPLY", sep.outputs["Z"], 0.12), low.inputs[0])
    mix = _n(nt, "ShaderNodeMix", data_type='RGBA')
    mix.inputs["B"].default_value = (*dirt, 1)
    L(_math(nt, "MULTIPLY", _math(nt, "SUBTRACT", 1.0, low.outputs[0]), 0.35), mix.inputs["Factor"])
    L(r.outputs[0], mix.inputs["A"])
    L(mix.outputs["Result"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.92
    _bump(nt, b, n2.outputs["Fac"], 0.22, 0.01)
    return m


def mat_tile(name="ZUFA_Roof_Tile", c1=(0.40, 0.12, 0.05), c2=(0.66, 0.29, 0.14)):
    """Mangalore / Spanish clay tile for flat roof planes: barrel ridges + courses, per-tile tone."""
    m, nt, b, tc = _new(name)
    L = nt.links.new
    ax = _slope_axis(nt, tc)
    u, v = _along(nt, tc, ax, 1 / 0.30, 1 / 0.16)
    # barrel profile across the slope
    wave = _math(nt, "ABSOLUTE", _math(nt, "SINE", _math(nt, "MULTIPLY", u, math.pi)))
    # course step up the slope (sawtooth)
    course = _math(nt, "FRACT", v)
    h = _math(nt, "ADD", _math(nt, "MULTIPLY", wave, 0.7), _math(nt, "MULTIPLY", course, 0.5))
    # per-tile tone from a cell index
    cell = _n(nt, "ShaderNodeCombineXYZ")
    L(_math(nt, "FLOOR", u), cell.inputs["X"])
    L(_math(nt, "FLOOR", v), cell.inputs["Y"])
    wn = _n(nt, "ShaderNodeTexWhiteNoise", noise_dimensions='3D')
    L(cell.outputs[0], wn.inputs["Vector"])
    r = _ramp(nt, [(0.0, c1), (0.5, tuple((a + b2) / 2 for a, b2 in zip(c1, c2))), (1.0, c2)])
    L(wn.outputs["Value"], r.inputs[0])
    big = _n(nt, "ShaderNodeTexNoise", Scale=1.6, Detail=4.0)
    L(tc.outputs["Object"], big.inputs["Vector"])
    mx = _n(nt, "ShaderNodeMix", data_type='RGBA', blend_type='MULTIPLY')
    mx.inputs["Factor"].default_value = 0.35
    L(r.outputs[0], mx.inputs["A"])
    L(big.outputs["Color"], mx.inputs["B"])
    # shadow in the troughs
    ao = _n(nt, "ShaderNodeMix", data_type='RGBA', blend_type='MULTIPLY')
    ao.inputs["B"].default_value = (0.55, 0.45, 0.42, 1)
    L(_math(nt, "SUBTRACT", 1.0, wave), ao.inputs["Factor"])
    L(mx.outputs["Result"], ao.inputs["A"])
    L(ao.outputs["Result"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.72
    _bump(nt, b, h, 0.9, 0.05)
    return m


def mat_metal_roof(name="ZUFA_Metal_Roof", col=(0.30, 0.17, 0.10)):
    """Standing-seam metal: seams every 0.5 m running down the slope, satin copper-brown."""
    m, nt, b, tc = _new(name)
    L = nt.links.new
    ax = _slope_axis(nt, tc)
    u, v = _along(nt, tc, ax, 1 / 0.5, 1.0)
    f = _math(nt, "FRACT", u)
    # raised seam where the panel coordinate wraps (f near 0 or 1)
    edge = _math(nt, "SUBTRACT", 0.5, _math(nt, "ABSOLUTE", _math(nt, "SUBTRACT", f, 0.5)))
    seam = _math(nt, "MAXIMUM", _math(nt, "SUBTRACT", 1.0, _math(nt, "MULTIPLY", edge, 25.0)), 0.0)
    n = _n(nt, "ShaderNodeTexNoise", Scale=3.0, Detail=5.0)
    L(tc.outputs["Object"], n.inputs["Vector"])
    r = _ramp(nt, [(0.35, tuple(c * 0.8 for c in col)), (0.7, tuple(min(1, c * 1.25) for c in col))])
    L(n.outputs["Fac"], r.inputs[0])
    L(r.outputs[0], b.inputs["Base Color"])
    b.inputs["Metallic"].default_value = 0.55
    b.inputs["Roughness"].default_value = 0.42
    _bump(nt, b, seam, 1.0, 0.04)
    return m


def mat_rubble(name="ZUFA_Rubble_Stone", light=(0.80, 0.74, 0.62), dark=(0.55, 0.50, 0.42)):
    """Random rubble stone cladding with recessed mortar."""
    m, nt, b, tc = _new(name)
    L = nt.links.new
    mp = _n(nt, "ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (3.2, 3.2, 4.4)
    L(tc.outputs["Object"], mp.inputs[0])
    v = _n(nt, "ShaderNodeTexVoronoi", feature='DISTANCE_TO_EDGE')
    L(mp.outputs[0], v.inputs["Vector"])
    vc = _n(nt, "ShaderNodeTexVoronoi")
    L(mp.outputs[0], vc.inputs["Vector"])
    mortar = _ramp(nt, [(0.0, (0, 0, 0)), (0.06, (1, 1, 1))])
    L(v.outputs["Distance"], mortar.inputs[0])
    tone = _ramp(nt, [(0.0, dark), (0.5, tuple((a + c) / 2 for a, c in zip(dark, light))), (1.0, light)])
    L(vc.outputs["Color"], tone.inputs[0])
    n = _n(nt, "ShaderNodeTexNoise", Scale=18.0, Detail=8.0)
    L(tc.outputs["Object"], n.inputs["Vector"])
    st = _n(nt, "ShaderNodeMix", data_type='RGBA', blend_type='MULTIPLY')
    st.inputs["Factor"].default_value = 0.25
    L(tone.outputs[0], st.inputs["A"])
    L(n.outputs["Color"], st.inputs["B"])
    mm = _n(nt, "ShaderNodeMix", data_type='RGBA')
    mm.inputs["A"].default_value = (0.42, 0.40, 0.36, 1)
    L(mortar.outputs[0], mm.inputs["Factor"])
    L(st.outputs["Result"], mm.inputs["B"])
    L(mm.outputs["Result"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.9
    h = _math(nt, "ADD", mortar.outputs[0], _math(nt, "MULTIPLY", n.outputs["Fac"], 0.3))
    _bump(nt, b, h, 0.8, 0.03)
    return m


def mat_rock(name="ZUFA_Boulder", light=(0.58, 0.51, 0.41), dark=(0.30, 0.26, 0.21)):
    m, nt, b, tc = _new(name)
    L = nt.links.new
    n = _n(nt, "ShaderNodeTexNoise", Scale=2.5, Detail=10.0, Roughness=0.7)
    L(tc.outputs["Object"], n.inputs["Vector"])
    n2 = _n(nt, "ShaderNodeTexNoise", Scale=30.0, Detail=6.0)
    L(tc.outputs["Object"], n2.inputs["Vector"])
    r = _ramp(nt, [(0.3, dark), (0.6, light)])
    L(n.outputs["Fac"], r.inputs[0])
    L(r.outputs[0], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.85
    _bump(nt, b, _math(nt, "ADD", n.outputs["Fac"], _math(nt, "MULTIPLY", n2.outputs["Fac"], 0.35)), 0.7, 0.06)
    return m


def mat_pebbles(name="ZUFA_Pebbles"):
    """River-pebble bank: rounded stones of mixed tone."""
    m, nt, b, tc = _new(name)
    L = nt.links.new
    mp = _n(nt, "ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (7, 7, 7)
    L(tc.outputs["Object"], mp.inputs[0])
    v = _n(nt, "ShaderNodeTexVoronoi", feature='SMOOTH_F1')
    v.inputs["Smoothness"].default_value = 0.3
    L(mp.outputs[0], v.inputs["Vector"])
    vc = _n(nt, "ShaderNodeTexVoronoi")
    L(mp.outputs[0], vc.inputs["Vector"])
    tone = _ramp(nt, [(0.0, (0.35, 0.30, 0.26)), (0.4, (0.62, 0.56, 0.48)), (0.75, (0.78, 0.72, 0.64)), (1.0, (0.48, 0.40, 0.33))])
    L(vc.outputs["Color"], tone.inputs[0])
    gap = _ramp(nt, [(0.0, (1, 1, 1)), (0.42, (1, 1, 1)), (0.5, (0.15, 0.13, 0.11))])
    L(v.outputs["Distance"], gap.inputs[0])
    mx = _n(nt, "ShaderNodeMix", data_type='RGBA', blend_type='MULTIPLY')
    mx.inputs["Factor"].default_value = 1.0
    L(tone.outputs[0], mx.inputs["A"])
    L(gap.outputs[0], mx.inputs["B"])
    L(mx.outputs["Result"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.6
    _bump(nt, b, _math(nt, "SUBTRACT", 1.0, v.outputs["Distance"]), 1.0, 0.04)
    return m


def mat_deck(name="ZUFA_Deck"):
    m, nt, b, tc = _new(name)
    L = nt.links.new
    br = _n(nt, "ShaderNodeTexBrick", offset=0.5, offset_frequency=1)
    br.inputs["Scale"].default_value = 1.0
    br.inputs["Brick Width"].default_value = 1.8
    br.inputs["Row Height"].default_value = 0.14
    br.inputs["Mortar Size"].default_value = 0.006
    br.inputs["Color1"].default_value = (0.42, 0.27, 0.15, 1)
    br.inputs["Color2"].default_value = (0.52, 0.34, 0.19, 1)
    br.inputs["Mortar"].default_value = (0.12, 0.08, 0.05, 1)
    L(tc.outputs["Object"], br.inputs["Vector"])
    g = _n(nt, "ShaderNodeTexNoise", Scale=1.0, Detail=6.0)
    mp = _n(nt, "ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (0.6, 30, 1)
    L(tc.outputs["Object"], mp.inputs[0])
    L(mp.outputs[0], g.inputs["Vector"])
    mx = _n(nt, "ShaderNodeMix", data_type='RGBA', blend_type='MULTIPLY')
    mx.inputs["Factor"].default_value = 0.35
    L(br.outputs["Color"], mx.inputs["A"])
    L(g.outputs["Color"], mx.inputs["B"])
    L(mx.outputs["Result"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.65
    _bump(nt, b, br.outputs["Fac"], -0.5, 0.01)
    return m


def mat_paving(name="ZUFA_Paving", c1=(0.80, 0.74, 0.64), c2=(0.74, 0.68, 0.58), size=0.6):
    m, nt, b, tc = _new(name)
    L = nt.links.new
    br = _n(nt, "ShaderNodeTexBrick", offset=0.5)
    br.inputs["Scale"].default_value = 1.0
    br.inputs["Brick Width"].default_value = size
    br.inputs["Row Height"].default_value = size
    br.inputs["Mortar Size"].default_value = 0.008
    br.inputs["Color1"].default_value = (*c1, 1)
    br.inputs["Color2"].default_value = (*c2, 1)
    br.inputs["Mortar"].default_value = (0.5, 0.47, 0.42, 1)
    L(tc.outputs["Object"], br.inputs["Vector"])
    n = _n(nt, "ShaderNodeTexNoise", Scale=4.0, Detail=5.0)
    L(tc.outputs["Object"], n.inputs["Vector"])
    mx = _n(nt, "ShaderNodeMix", data_type='RGBA', blend_type='MULTIPLY')
    mx.inputs["Factor"].default_value = 0.2
    L(br.outputs["Color"], mx.inputs["A"])
    L(n.outputs["Color"], mx.inputs["B"])
    L(mx.outputs["Result"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.8
    _bump(nt, b, br.outputs["Fac"], -0.35, 0.01)
    return m


def mat_flat(name, rgb, rough=0.8, metal=0.0):
    m, nt, b, tc = _new(name)
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    m.diffuse_color = (*rgb, 1)
    return m


def mat_foliage(name, c1, c2, scale=9.0):
    m, nt, b, tc = _new(name)
    L = nt.links.new
    n = _n(nt, "ShaderNodeTexNoise", Scale=scale, Detail=8.0)
    L(tc.outputs["Object"], n.inputs["Vector"])
    r = _ramp(nt, [(0.3, c1), (0.7, c2)])
    L(n.outputs["Fac"], r.inputs[0])
    L(r.outputs[0], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.85
    _bump(nt, b, n.outputs["Fac"], 0.8, 0.05)
    return m


def materials():
    M = {
        'stucco': mat_stucco("ZUFA_Stucco_Cream", (0.88, 0.82, 0.70)),
        'white': mat_stucco("ZUFA_Stucco_White", (0.91, 0.89, 0.84)),
        'tile': mat_tile(),
        'tile_mlr': mat_tile("ZUFA_Mangalore_Tile", (0.30, 0.10, 0.05), (0.50, 0.19, 0.10)),
        'metal': mat_metal_roof(),
        'rubble': mat_rubble(),
        'rock': mat_rock(),
        'pebbles': mat_pebbles(),
        'deck': mat_deck(),
        'paving': mat_paving(),
        'terracotta': mat_paving("ZUFA_Terracotta_Floor", (0.62, 0.36, 0.24), (0.56, 0.32, 0.21), 0.4),
        'timber': mat_flat("ZUFA_Timber", (0.20, 0.11, 0.05), 0.55),
        'teak': mat_flat("ZUFA_Teak", (0.33, 0.19, 0.09), 0.5),
        'frame': mat_flat("ZUFA_Frame_Black", (0.025, 0.025, 0.028), 0.4, 0.3),
        'fascia': mat_flat("ZUFA_Fascia", (0.16, 0.11, 0.08), 0.6),
        'iron': mat_flat("ZUFA_Iron", (0.03, 0.03, 0.03), 0.45, 0.6),
        'cushion': mat_flat("ZUFA_Cushion", (0.88, 0.85, 0.78), 0.9),
        'urn': mat_flat("ZUFA_Urn", (0.90, 0.88, 0.83), 0.5),
        'pot': mat_flat("ZUFA_Pot", (0.62, 0.34, 0.20), 0.8),
        'leaf': mat_foliage("ZUFA_Leaf", (0.06, 0.16, 0.04), (0.20, 0.36, 0.10)),
        'olive': mat_foliage("ZUFA_Olive_Leaf", (0.12, 0.16, 0.09), (0.26, 0.30, 0.20)),
        'lavender': mat_foliage("ZUFA_Lavender", (0.28, 0.20, 0.45), (0.50, 0.40, 0.72), 20.0),
        'bloom': mat_foliage("ZUFA_Bloom", (0.36, 0.10, 0.20), (0.62, 0.28, 0.40), 14.0),
        'bark': mat_foliage("ZUFA_Bark", (0.20, 0.15, 0.10), (0.38, 0.30, 0.22), 25.0),
        'glass': mat_flat("ZUFA_Glass", (0.10, 0.13, 0.15), 0.06, 0.3),
        'water': mat_flat("ZUFA_Water", (0.13, 0.55, 0.58), 0.04),
        'pond': mat_flat("ZUFA_Pond", (0.10, 0.22, 0.20), 0.04),
        'shade': mat_flat("ZUFA_Shade", (0.20, 0.16, 0.13), 0.95),
    }
    return M


# ---------------------------------------------------------------- geometry helpers
def coll(name, clear=False):
    s = scene()
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in [x.name for x in s.collection.children]:
        s.collection.children.link(c)
    if clear:
        for o in list(c.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    return c


def from_bm(bm, name, mat, col):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if isinstance(mat, (list, tuple)):
        for mm in mat:
            me.materials.append(mm)
    else:
        me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    col.objects.link(o)
    return o


def box(col, name, size, loc, mat, rz=0.0, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector((0, 0, size[2] / 2)), verts=bm.verts)
    if bevel:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=2, affect='EDGES', profile=0.5)
    o = from_bm(bm, name, mat, col)
    o.location = loc
    o.rotation_euler.z = rz
    return o


def cyl(col, name, r, h, loc, mat, seg=24, r2=None, axis='Z'):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=(r if r2 is None else r2), depth=h)
    if axis == 'Y':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    elif axis == 'X':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    else:
        bmesh.ops.translate(bm, vec=Vector((0, 0, h / 2)), verts=bm.verts)
    o = from_bm(bm, name, mat, col)
    o.location = loc
    return o


def lathe(col, name, profile, loc, mat, seg=24):
    """profile: list of (radius, z) from bottom to top."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z)) for i in range(seg)])
    for a, b2 in zip(rings, rings[1:]):
        for i in range(seg):
            bm.faces.new((a[i], a[(i + 1) % seg], b2[(i + 1) % seg], b2[i]))
    bm.faces.new(rings[0][::-1])
    o = from_bm(bm, name, mat, col)
    o.location = loc
    return o


def hip_roof(col, name, w, d, pitch, loc, mat, overhang=1.0, fascia=None, fascia_h=0.35, caps=None, eave=3.4):
    """Hipped roof over a w x d rectangle. Optional fascia band and ridge/hip caps."""
    W, D = w + 2 * overhang, d + 2 * overhang
    t = math.tan(math.radians(pitch))
    h = min(W, D) / 2 * t
    r = (max(W, D) - min(W, D)) / 2
    bm = bmesh.new()
    if W >= D:
        c = [(-W / 2, -D / 2, 0), (W / 2, -D / 2, 0), (W / 2, D / 2, 0), (-W / 2, D / 2, 0)]
        r1, r2 = (-r, 0, h), (r, 0, h)
    else:
        c = [(-W / 2, -D / 2, 0), (W / 2, -D / 2, 0), (W / 2, D / 2, 0), (-W / 2, D / 2, 0)]
        r1, r2 = (0, -r, h), (0, r, h)
    V = [bm.verts.new(p) for p in c]
    R1, R2 = bm.verts.new(r1), bm.verts.new(r2)
    if W >= D:
        faces = [(V[0], V[1], R2, R1), (V[1], V[2], R2), (V[2], V[3], R1, R2), (V[3], V[0], R1)]
    else:
        faces = [(V[0], V[1], R1), (V[1], V[2], R2, R1), (V[2], V[3], R2), (V[3], V[0], R1, R2)]
    for f in faces:
        bm.faces.new(f)
    # underside (soffit)
    bm.faces.new(V[::-1])
    bm.normal_update()
    roof = from_bm(bm, name, mat, col)
    roof.location = Vector(loc) + Vector((0, 0, eave))
    out = [roof]
    if fascia is not None:
        bmf = bmesh.new()
        bmesh.ops.create_cube(bmf, size=1.0)
        bmesh.ops.scale(bmf, vec=Vector((W + 0.04, D + 0.04, fascia_h)), verts=bmf.verts)
        bmesh.ops.translate(bmf, vec=Vector((0, 0, -fascia_h / 2 + 0.02)), verts=bmf.verts)
        inner = bmesh.ops.create_cube(bmf, size=1.0)['verts']
        bmesh.ops.delete(bmf, geom=inner, context='VERTS')
        f = from_bm(bmf, name + "_fascia", fascia, col)
        f.location = roof.location
        out.append(f)
    if caps is not None:
        pts = [(Vector(r1), Vector(r2))] + [(Vector(c[i]), Vector(r1 if (W >= D and i in (0, 3)) or (W < D and i in (0, 1)) else r2)) for i in range(4)]
        for i, (a, b2) in enumerate(pts):
            L = (b2 - a).length
            if L < 0.1:
                continue
            m = cyl(col, f"{name}_cap{i}", 0.11, L, (0, 0, 0), caps, seg=8, axis='Z')
            m.location = roof.location + (a + b2) / 2 + Vector((0, 0, 0.05))
            m.rotation_mode = 'QUATERNION'
            m.rotation_quaternion = (b2 - a).to_track_quat('Z', 'Y')
            m.location -= (b2 - a).normalized() * (L / 2)
            out.append(m)
    return out, h


def gable_roof(col, name, w, d, pitch, loc, mat, overhang=0.9, eave=3.4, gable_mat=None, ridge='X'):
    """Gable roof with ridge along w (ridge='X'). Returns roof objects and rise."""
    W, D = w + 2 * overhang, d + 2 * overhang
    h = (d / 2 + overhang) * math.tan(math.radians(pitch))
    bm = bmesh.new()
    p = [bm.verts.new(v) for v in [(-W / 2, -D / 2, 0), (W / 2, -D / 2, 0), (W / 2, 0, h), (-W / 2, 0, h), (W / 2, D / 2, 0), (-W / 2, D / 2, 0)]]
    bm.faces.new((p[0], p[1], p[2], p[3]))
    bm.faces.new((p[3], p[2], p[4], p[5]))
    bm.faces.new((p[5], p[4], p[1], p[0]))
    bm.normal_update()
    o = from_bm(bm, name, mat, col)
    o.location = Vector(loc) + Vector((0, 0, eave))
    if ridge == 'Y':
        o.rotation_euler.z = math.pi / 2
    out = [o]
    if gable_mat is not None:
        rise = (d / 2) * math.tan(math.radians(pitch))
        bm = bmesh.new()
        for s in (-1, 1):
            x = s * w / 2
            a, b2, c = bm.verts.new((x, -d / 2, 0)), bm.verts.new((x, d / 2, 0)), bm.verts.new((x, 0, rise))
            bm.faces.new((a, b2, c) if s > 0 else (c, b2, a))
        g = from_bm(bm, name + "_gable", gable_mat, col)
        g.location = Vector(loc) + Vector((0, 0, eave))
        if ridge == 'Y':
            g.rotation_euler.z = math.pi / 2
        out.append(g)
    return out, h


def organic_outline(rx, ry, seed, n=96, amp=0.14):
    rnd = random.Random(seed)
    ph = [rnd.uniform(0, 6.28) for _ in range(4)]
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        k = 1 + amp * (math.sin(2 * t + ph[0]) * 0.6 + math.sin(3 * t + ph[1]) * 0.4 + math.sin(5 * t + ph[2]) * 0.2)
        pts.append((rx * k * math.cos(t), ry * k * math.sin(t)))
    return pts


def disc_from_outline(col, name, pts, z, mat, inset=0.0):
    bm = bmesh.new()
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    vs = []
    for x, y in pts:
        dx, dy = x - cx, y - cy
        L = math.hypot(dx, dy) or 1
        vs.append(bm.verts.new((x - dx / L * inset, y - dy / L * inset, z)))
    bm.faces.new(vs)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    return from_bm(bm, name, mat, col)


def ring_from_outline(col, name, pts, w, z0, z1, mat, outward=True):
    """Band (e.g. coping, pebble bank) around an outline."""
    bm = bmesh.new()
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    a, b2 = [], []
    for x, y in pts:
        dx, dy = x - cx, y - cy
        L = math.hypot(dx, dy) or 1
        s = 1 if outward else -1
        a.append(bm.verts.new((x, y, z1)))
        b2.append(bm.verts.new((x + dx / L * w * s, y + dy / L * w * s, z0)))
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], b2[i], b2[j], a[j]))
    bm.normal_update()
    return from_bm(bm, name, mat, col)


def pool_basin(col, name, pts, depth, z_water, wall_mat, water_mat):
    """Freeform pool: water surface + inner wall down to the floor."""
    w = disc_from_outline(col, name + "_water", pts, z_water, water_mat)
    bm = bmesh.new()
    top = [bm.verts.new((x, y, z_water + 0.12)) for x, y in pts]
    bot = [bm.verts.new((x * 0.97, y * 0.97, z_water - depth)) for x, y in pts]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((top[j], bot[j], bot[i], top[i]))
    bm.faces.new(bot[::-1])
    bm.normal_update()
    wall = from_bm(bm, name + "_wall", wall_mat, col)
    return w, wall


def boulder(col, name, size, loc, mat, seed=0, sub=2):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    rnd = random.Random(seed)
    off = Vector((rnd.uniform(0, 50), rnd.uniform(0, 50), rnd.uniform(0, 50)))
    # a few random cleavage planes give the rock flat, broken faces instead of a blob
    planes = [(Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.3, 1))).normalized(), rnd.uniform(0.55, 0.8)) for _ in range(5)]
    for v in bm.verts:
        n = noise.noise(v.co * 1.3 + off) * 0.22 + noise.noise(v.co * 3.1 + off) * 0.07
        v.co *= 1 + n
        for nrm, dpl in planes:
            d = v.co.dot(nrm)
            if d > dpl:
                v.co -= nrm * (d - dpl)
        v.co.z = max(v.co.z, -0.35)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    o = from_bm(bm, name, mat, col)
    o.location = loc
    o.rotation_euler.z = rnd.uniform(0, 6.28)
    for p in o.data.polygons:
        p.use_smooth = not any(k in mat.name for k in ("Boulder", "Sandstone"))
    return o


def boulder_edge(col, prefix, pts, mat, seed, every=1.6, size=(0.9, 1.7), skip=None):
    rnd = random.Random(seed)
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    acc, out = 0.0, []
    for i in range(len(pts)):
        x, y = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        acc += math.hypot(x2 - x, y2 - y)
        if acc < every:
            continue
        acc = 0
        if skip and skip(x, y):
            continue
        dx, dy = x - cx, y - cy
        L = math.hypot(dx, dy) or 1
        s = rnd.uniform(*size)
        p = (x + dx / L * s * 0.45, y + dy / L * s * 0.45, s * 0.12)
        out.append(boulder(col, f"{prefix}{i}", (s, s * rnd.uniform(0.7, 1.0), s * rnd.uniform(0.45, 0.75)), p, mat, seed + i, 2))
    return out


def chair(col, name, loc, rz, M):
    objs = [box(col, name + "_s", (0.5, 0.5, 0.06), (0, 0, 0.44), M['teak']), box(col, name + "_b", (0.5, 0.06, 0.5), (0, 0.22, 0.47), M['teak'])]
    for sx in (-0.21, 0.21):
        for sy in (-0.21, 0.21):
            objs.append(box(col, f"{name}_l{sx}{sy}", (0.04, 0.04, 0.44), (sx, sy, 0), M['teak']))
    _place(objs, loc, rz)
    return objs


def dining_set(col, name, loc, M, n=4, r=0.95):
    objs = [cyl(col, name + "_t", 0.6, 0.05, (0, 0, 0.72), M['urn'], 24), cyl(col, name + "_tl", 0.06, 0.72, (0, 0, 0), M['iron'], 8)]
    _place(objs, loc, 0)
    for i in range(n):
        a = 2 * math.pi * i / n + 0.4
        chair(col, f"{name}_c{i}", (loc[0] + math.cos(a) * r, loc[1] + math.sin(a) * r, loc[2]), a + math.pi / 2, M)


def lantern(col, name, loc, rz, M):
    objs = [box(col, name + "_br", (0.06, 0.25, 0.06), (0, -0.12, 0.35), M['iron']),
            box(col, name + "_bx", (0.26, 0.26, 0.42), (0, -0.28, 0.05), M['iron']),
            box(col, name + "_gl", (0.2, 0.27, 0.32), (0, -0.28, 0.1), M['glass'])]
    _place(objs, loc, rz)
    return objs


def urn(col, name, loc, M, s=1.0, plant='leaf'):
    lathe(col, name, [(0.18 * s, 0), (0.32 * s, 0.25 * s), (0.36 * s, 0.55 * s), (0.25 * s, 0.85 * s), (0.28 * s, 0.92 * s)], loc, M['urn'])
    boulder(col, name + "_p", (0.45 * s, 0.45 * s, 0.55 * s), (loc[0], loc[1], loc[2] + 0.95 * s), M[plant], hash(name) % 997, 2)


def shrub(col, name, loc, s, M, kind='leaf', seed=0):
    rnd = random.Random(seed)
    centres = [(loc[0] + rnd.uniform(-0.3, 0.3) * s, loc[1] + rnd.uniform(-0.3, 0.3) * s, loc[2] + s * rnd.uniform(0.35, 0.55), s * 0.62) for _ in range(3)]
    return leaf_canopy(col, name, centres, None, M, kind, per=int(110 * s), leaf=0.14, seed=seed)


def lavender(col, name, loc, s, M, seed=0):
    """Lavender clump: many thin flower spikes over a grey-green mound."""
    rnd = random.Random(seed)
    shrub(col, name + "_b", (loc[0], loc[1], loc[2] - 0.1 * s), s * 0.75, M, 'olive', seed)
    bm = bmesh.new()
    for i in range(int(46 * s)):
        a = rnd.uniform(0, 6.28)
        d = rnd.uniform(0, s * 0.55)
        base = Vector((loc[0] + math.cos(a) * d, loc[1] + math.sin(a) * d, loc[2] + s * 0.25))
        tip = base + Vector((math.cos(a) * d * 0.35, math.sin(a) * d * 0.35, rnd.uniform(0.55, 0.85) * s))
        w = Vector((0.025, 0.025, 0))
        bm.faces.new([bm.verts.new(v) for v in (base - w, base + w, tip + w * 2.2, tip - w * 2.2)])
    o = from_bm(bm, name + "_spikes", M['lavender'], col)
    tint_foliage(o, seed)
    return o


def palm(col, name, loc, M, h=7.0, seed=0, fronds=14):
    """Palm with a ringed, slightly curved trunk and leaflet fronds (real geometry, no alpha cards)."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    seg, rings = 8, 14
    lean = Vector((rnd.uniform(-0.6, 0.6), rnd.uniform(-0.6, 0.6), 0))
    prev = None
    for k in range(rings + 1):
        t = k / rings
        c = Vector((0, 0, h * t)) + lean * (t * t)
        rad = 0.24 * (1.15 - 0.35 * t) * (1.0 + (0.08 if k % 2 else 0))
        ring = [bm.verts.new(c + Vector((math.cos(2 * math.pi * i / seg) * rad, math.sin(2 * math.pi * i / seg) * rad, 0))) for i in range(seg)]
        if prev:
            for i in range(seg):
                bm.faces.new((prev[i], prev[(i + 1) % seg], ring[(i + 1) % seg], ring[i]))
        prev = ring
    trunk = from_bm(bm, name + "_trunk", M['bark'], col)
    top = Vector((0, 0, h)) + lean
    bm = bmesh.new()
    fronds = max(fronds, 18)
    for f in range(fronds):
        az = 2 * math.pi * f / fronds + rnd.uniform(-0.12, 0.12)
        tier = f % 3
        up = (0.9, 0.45, 0.05)[tier] + rnd.uniform(-0.1, 0.1)
        L = rnd.uniform(3.4, 4.3) * (0.8 if tier == 0 else 1.0)
        d = Vector((math.cos(az), math.sin(az), 0))
        side = Vector((-d.y, d.x, 0))
        N = 26
        spine = [top + d * (L * i / N) + Vector((0, 0, L * (up * i / N - 0.95 * (i / N) ** 2))) for i in range(N + 1)]
        for i in range(2, N):
            s = i / N
            leaf = 0.95 * math.sin(math.pi * min(1.0, s * 1.08)) * (1 - 0.35 * s) + 0.12
            a = spine[i]
            fwd = (spine[i + 1] - spine[i]).normalized()
            for sgn in (-1, 1):
                # narrow drooping leaflet: a long thin quad angled forward and down
                tip = a + side * sgn * leaf + fwd * leaf * 0.55 + Vector((0, 0, -0.32 * leaf))
                w = fwd * 0.05
                bm.faces.new((bm.verts.new(a - w), bm.verts.new(a + w), bm.verts.new(tip + w * 0.3), bm.verts.new(tip - w * 0.3)))
    leaves = from_bm(bm, name + "_fronds", M['leaf'], col)
    tint_foliage(leaves, seed)
    for o in (trunk, leaves):
        o.location = loc
    for p in leaves.data.polygons:
        p.use_smooth = False
    return [trunk, leaves]


def leaf_canopy(col, name, centres, radius, M, mat='leaf', per=160, leaf=0.32, seed=0):
    """Canopy made of individual leaf quads scattered through clustered volumes (reads as real foliage)."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    for (cx, cy, cz, r) in centres:
        for _ in range(per):
            # sample inside a squashed sphere, biased to the surface
            while True:
                v = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
                if v.length <= 1:
                    break
            v = v.normalized() * (v.length ** 0.35)
            p = Vector((cx, cy, cz)) + Vector((v.x * r, v.y * r, v.z * r * 0.72))
            n = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(0.2, 1.2))).normalized()
            t = n.orthogonal().normalized()
            b2 = n.cross(t)
            s = leaf * rnd.uniform(0.7, 1.3)
            q = [p + t * s, p + b2 * s * 0.45, p - t * s, p - b2 * s * 0.45]
            bm.faces.new([bm.verts.new(x) for x in q])
    o = from_bm(bm, name, M[mat], col)
    tint_foliage(o, seed)
    return o


def broadleaf_tree(col, name, loc, M, s=1.0, seed=0, mat='leaf'):
    """Spreading shade tree: forked trunk, limbs and a leaf-card canopy."""
    rnd = random.Random(seed)
    x, y, z = loc
    cyl(col, name + "_t", 0.32 * s, 3.8 * s, (x, y, z), M['bark'], 10, 0.2 * s)
    centres = []
    for i in range(5):
        a = 2 * math.pi * i / 5 + rnd.uniform(-0.3, 0.3)
        L = rnd.uniform(2.6, 3.6) * s
        tip = Vector((x + math.cos(a) * L * 0.8, y + math.sin(a) * L * 0.8, z + 3.6 * s + L * 0.55))
        base = Vector((x, y, z + 3.4 * s))
        d = tip - base
        br = cyl(col, f"{name}_l{i}", 0.13 * s, d.length, (0, 0, 0), M['bark'], 7, 0.06 * s)
        br.rotation_mode = 'QUATERNION'
        br.rotation_quaternion = d.to_track_quat('Z', 'Y')
        br.location = base
        centres.append((tip.x, tip.y, tip.z + 0.6 * s, rnd.uniform(1.8, 2.4) * s))
    centres.append((x, y, z + 6.9 * s, 2.6 * s))
    leaf_canopy(col, name + "_canopy", centres, None, M, mat, per=int(420 * s), leaf=0.24 * s, seed=seed)


def olive(col, name, loc, M, seed=0, s=1.0):
    rnd = random.Random(seed)
    t = cyl(col, name + "_t", 0.2 * s, 1.8 * s, loc, M['bark'], 8, 0.12 * s)
    t.rotation_euler = (rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), 0)
    centres = []
    for i in range(5):
        a = rnd.uniform(0, 6.28)
        d = rnd.uniform(0.4, 1.1) * s
        centres.append((loc[0] + math.cos(a) * d, loc[1] + math.sin(a) * d, loc[2] + (2.2 + rnd.uniform(0, 0.8)) * s, 1.0 * s))
    leaf_canopy(col, name + "_canopy", centres, None, M, 'olive', per=int(170 * s), leaf=0.16 * s, seed=seed)


def _place(objs, loc, rz):
    R = Matrix.Rotation(rz, 4, 'Z')
    for o in objs:
        o.location = R @ o.location + Vector(loc)
        o.rotation_euler.z += rz


def cut(target, cutters):
    for c in cutters:
        m = target.modifiers.new("cut", 'BOOLEAN')
        m.operation = 'DIFFERENCE'
        m.object = c
        m.solver = 'EXACT'
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    me = bpy.data.meshes.new_from_object(target.evaluated_get(dg))
    old = target.data
    target.modifiers.clear()
    target.data = me
    bpy.data.meshes.remove(old)
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)


def glazed_door(col, name, w, h, loc, facing, M, frame='frame', mullions=2, sill=0.0):
    """Floor-to-ceiling glazed door/window with real frame profiles."""
    objs = []
    t = 0.08
    objs.append(box(col, name + "_g", (w, 0.04, h), (0, 0, sill), M['glass']))
    for x in (-w / 2, w / 2):
        objs.append(box(col, f"{name}_j{x}", (t, 0.14, h), (x, 0, sill), M[frame]))
    objs.append(box(col, name + "_hd", (w + t, 0.14, t), (0, 0, sill + h - t / 2), M[frame]))
    objs.append(box(col, name + "_sl", (w + t, 0.16, t), (0, 0, sill), M[frame]))
    for i in range(1, mullions):
        objs.append(box(col, f"{name}_m{i}", (0.05, 0.12, h), (-w / 2 + w * i / mullions, 0, sill), M[frame]))
    rot = {'-Y': 0, '+Y': math.pi, '+X': math.pi / 2, '-X': -math.pi / 2}[facing]
    _place(objs, loc, rot)
    return objs


# ---------------------------------------------------------------- bake + export
def _gpu(scn):
    scn.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.refresh_devices()
        for t in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
            try:
                prefs.compute_device_type = t
                if any(d.type == t for d in prefs.devices):
                    for d in prefs.devices:
                        d.use = True
                    scn.cycles.device = 'GPU'
                    return t
            except Exception:
                pass
    except Exception:
        pass
    return 'CPU'


def bake_and_export(src_coll, name, out_name, size=2048, ao_samples=64):
    """Join a collection into one mesh, bake colour x AO + normal into an atlas, export GLB."""
    t0 = time.time()
    scn = scene()
    vl = bpy.context.view_layer
    os.makedirs(TEX_DIR, exist_ok=True)
    exp = coll("Export")
    exp.hide_viewport = False
    exp.hide_render = False
    for nm in (name, name + "_Foliage"):
        old = bpy.data.objects.get(nm)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)
    dups, fol = [], []
    for o in bpy.data.collections[src_coll].objects:
        if o.type != 'MESH':
            continue
        d = o.copy()
        d.data = o.data.copy()
        exp.objects.link(d)
        (fol if (o.data.materials and o.data.materials[0].name in FOLIAGE) else dups).append(d)

    def join(objs, nm):
        for o in vl.objects:
            o.select_set(False)
        for d in objs:
            d.select_set(True)
        vl.objects.active = objs[0]
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        if len(objs) > 1:
            bpy.ops.object.join()
        jj = vl.objects.active
        jj.name = nm
        jj.data.name = nm
        bpy.ops.object.material_slot_remove_unused()
        return jj
    fj = join(fol, name + "_Foliage") if fol else None
    if fj:
        # keep only the per-leaf colour layer and make it the one that gets exported
        ca = fj.data.color_attributes
        for a in [a for a in ca if a.name != "Col"]:
            ca.remove(a)
        if "Col" in ca:
            ca.active_color = ca["Col"]
            try:
                ca.render_color_index = ca.active_color_index
            except Exception:
                pass
    j = join(dups, name)
    # isolate for baking so nothing else casts occlusion
    hidden = []
    for o in scn.objects:
        if o is not j and o is not fj and not o.hide_render:
            o.hide_render = True
            hidden.append(o)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.0015)
    bpy.ops.object.mode_set(mode='OBJECT')
    imgs = {}
    for k, nonc in (("color", False), ("ao", True), ("normal", True)):
        nm = f"{name}_{k}"
        im = bpy.data.images.get(nm)
        if im:
            bpy.data.images.remove(im)
        im = bpy.data.images.new(nm, size, size, alpha=False)
        if nonc:
            im.colorspace_settings.name = 'Non-Color'
        imgs[k] = im
    nodes = []
    for s in j.material_slots:
        nt = s.material.node_tree
        n = nt.nodes.new("ShaderNodeTexImage")
        n.name = "BAKE_TARGET"
        nt.nodes.active = n
        nodes.append((nt, n))
    dev = _gpu(scn)
    scn.render.bake.margin = 6
    scn.render.bake.use_clear = True

    def bake(kind, img, samples, **kw):
        for nt, n in nodes:
            n.image = img
        scn.cycles.samples = samples
        bpy.ops.object.bake(type=kind, **kw)
    bake('DIFFUSE', imgs["color"], 4, pass_filter={'COLOR'})
    bake('AO', imgs["ao"], ao_samples)
    bake('NORMAL', imgs["normal"], 4)
    for nt, n in nodes:
        nt.nodes.remove(n)
    c = np.empty(size * size * 4, dtype=np.float32)
    a = np.empty(size * size * 4, dtype=np.float32)
    imgs["color"].pixels.foreach_get(c)
    imgs["ao"].pixels.foreach_get(a)
    c = c.reshape(-1, 4)
    a = a.reshape(-1, 4)
    c[:, :3] *= (0.42 + 0.58 * np.clip(a[:, :1], 0, 1) ** 1.15)
    imgs["color"].pixels.foreach_set(c.ravel())
    for k in ("color", "normal"):
        im = imgs[k]
        im.filepath_raw = os.path.join(TEX_DIR, f"{name}_{k}.png")
        im.file_format = 'PNG'
        im.save()
    bm = bpy.data.materials.get(f"ZUFA_{name}_Baked")
    if bm:
        bpy.data.materials.remove(bm)
    bm = bpy.data.materials.new(f"ZUFA_{name}_Baked")
    bm.use_nodes = True
    nt = bm.node_tree
    b = nt.nodes["Principled BSDF"]
    ti = nt.nodes.new("ShaderNodeTexImage")
    ti.image = imgs["color"]
    nt.links.new(ti.outputs["Color"], b.inputs["Base Color"])
    tn = nt.nodes.new("ShaderNodeTexImage")
    tn.image = imgs["normal"]
    nmn = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(tn.outputs["Color"], nmn.inputs["Color"])
    nt.links.new(nmn.outputs[0], b.inputs["Normal"])
    b.inputs["Roughness"].default_value = 0.82
    keep_idx = {i for i, s in enumerate(j.material_slots) if s.material.name in KEEP}
    j.data.materials.append(bm)
    bi = len(j.material_slots) - 1
    for p in j.data.polygons:
        if p.material_index not in keep_idx:
            p.material_index = bi
    bpy.ops.object.material_slot_remove_unused()
    for o in hidden:
        o.hide_render = False
    for x in vl.objects:
        x.select_set(False)
    j.select_set(True)
    if fj:
        fj.select_set(True)
    vl.objects.active = j
    path = os.path.join(EXPORT_DIR, out_name + ".glb")
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_cameras=False, export_lights=False, export_image_format='JPEG', export_image_quality=84, export_tangents=False)
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    j.hide_render = True
    if fj:
        fj.hide_render = True
    exp.hide_viewport = True
    scn.render.engine = 'BLENDER_EEVEE'
    return {"secs": round(time.time() - t0, 1), "device": dev, "bytes": os.path.getsize(path),
            "tris": sum(len(p.vertices) - 2 for p in j.data.polygons) + (sum(len(p.vertices) - 2 for p in fj.data.polygons) if fj else 0),
            "slots": [s.material.name for s in j.material_slots]}


def bake_queue(jobs, status_path):
    """Run several bake_and_export jobs on a Blender timer so the MCP call returns at once.
    Progress is written as JSON to status_path."""
    import json
    state = {"done": [], "pending": [j[2] for j in jobs], "error": None}

    def write():
        with open(status_path, "w") as f:
            json.dump(state, f)
    write()
    q = list(jobs)

    def step():
        if not q:
            bpy.ops.wm.save_mainfile()
            state["finished"] = True
            write()
            return None
        src, name, out, size = q.pop(0)
        try:
            r = bake_and_export(src, name, out, size)
            state["done"].append({out: r})
        except Exception as e:
            import traceback
            state["error"] = traceback.format_exc()
            q.clear()
        state["pending"] = [j[2] for j in q]
        write()
        return 0.2
    bpy.app.timers.register(step, first_interval=0.5)
    return status_path


def preview(coll_names, path, cam_pos, target, lens=32, sun=(52, 0, 140), res=(1280, 720), engine='BLENDER_EEVEE', samples=64):
    """Render a check image with a sky, sun and lawn."""
    scn = scene()
    pc = coll("Preview")
    cam = bpy.data.objects.get("Preview_Cam")
    if not cam:
        cam = bpy.data.objects.new("Preview_Cam", bpy.data.cameras.new("Preview_Cam"))
        pc.objects.link(cam)
    s = bpy.data.objects.get("Preview_Sun")
    if not s:
        s = bpy.data.objects.new("Preview_Sun", bpy.data.lights.new("Preview_Sun", 'SUN'))
        pc.objects.link(s)
    s.data.energy = 3.2
    s.data.angle = math.radians(2)
    s.rotation_euler = tuple(math.radians(v) for v in sun)
    g = bpy.data.objects.get("Preview_Ground")
    if g and g.data.materials:
        g.data.materials[0] = materials_lawn()
    w = scn.world or bpy.data.worlds.new("ZUFA_World")
    scn.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    sky = nt.nodes.new("ShaderNodeTexSky")
    try:
        sky.sky_type = 'NISHITA'
        sky.sun_elevation = math.radians(90 - sun[0])
        sky.sun_rotation = math.radians(sun[2])
    except Exception:
        pass
    nt.links.new(sky.outputs[0], bg.inputs[0])
    nt.links.new(bg.outputs[0], o.inputs[0])
    bg.inputs["Strength"].default_value = 0.12
    scn.camera = cam
    cam.location = Vector(cam_pos)
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens
    for c in scn.collection.children:
        c.hide_render = c.name not in tuple(coll_names) + ("Preview",)
    scn.render.engine = engine
    if engine == 'CYCLES':
        _gpu(scn)
        scn.cycles.samples = samples
        scn.cycles.use_denoising = True
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.render.filepath = path
    try:
        scn.view_settings.view_transform = 'AgX'
    except Exception:
        pass
    bpy.ops.render.render(write_still=True)
    return path


def materials_lawn():
    m = bpy.data.materials.get("ZUFA_Lawn")
    if m:
        return m
    m, nt, b, tc = _new("ZUFA_Lawn")
    n = _n(nt, "ShaderNodeTexNoise", Scale=40.0, Detail=10.0)
    nt.links.new(tc.outputs["Object"], n.inputs["Vector"])
    r = _ramp(nt, [(0.35, (0.10, 0.22, 0.04)), (0.65, (0.22, 0.40, 0.08))])
    nt.links.new(n.outputs["Fac"], r.inputs[0])
    nt.links.new(r.outputs[0], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.9
    _bump(nt, b, n.outputs["Fac"], 0.5, 0.02)
    return m
