"""Film rig for the ZUFA_Site scene: render settings, sky/sun through the day, night lighting,
homes rising, and the camera flight through the website's shots.
Run after build_site.py and build_landscape.py:  exec(open(r"D:\\Zufa\\blender\\build_film.py").read())"""
exec(open(r"D:\Zufa\blender\zufa_lib.py").read())
import bpy, json, math
from mathutils import Vector

S = json.load(open(r"D:\Zufa\blender\site.json"))
site = bpy.data.scenes["ZUFA_Site"]
bpy.context.window.scene = site
beats = S['beats']
# frames per move scale with how much the picture changes (travel relative to height); low flyovers crane up mid-move
ARC, FK = {}, [1]
for i in range(len(beats) - 1):
    A, B = S['cameras'][beats[i]['cam']], S['cameras'][beats[i + 1]['cam']]
    dp, dt = math.dist(A['p'], B['p']), math.dist(A['t'], B['t'])
    h = max(25.0, min(A['p'][2], B['p'][2]))
    if dp / h > 5:
        ARC[i] = max(A['p'][2], B['p'][2], 0.3 * dp)
        h = (h + ARC[i]) / 2
    FK.append(FK[-1] + int(max(28, min(64, round(10 * (dp + 0.7 * dt) / h)))))
json.dump({"keys": FK, "frames": FK[-1], "cams": [b['cam'] for b in beats]}, open(r"D:\Zufa\blender\export\film_keys.json", "w"))
site.frame_start, site.frame_end = 1, FK[-1]
site.render.fps = 24

# ---------------------------------------------------------------- render settings
_gpu(site)
cy = site.cycles
cy.samples = 64
cy.use_adaptive_sampling = True
cy.adaptive_threshold = 0.03
cy.use_denoising = True
try:
    cy.denoiser = 'OPTIX'
except Exception:
    pass
cy.max_bounces = 6
cy.diffuse_bounces = 3
cy.glossy_bounces = 3
cy.transmission_bounces = 4
cy.transparent_max_bounces = 8
cy.caustics_reflective = False
cy.caustics_refractive = False
cy.sample_clamp_indirect = 8
try:
    cy.use_light_tree = True
except Exception:
    pass
site.render.use_persistent_data = True
site.render.resolution_x, site.render.resolution_y = 1280, 720
site.render.resolution_percentage = 100
site.view_settings.view_transform = 'AgX'
try:
    site.view_settings.look = 'AgX - Medium High Contrast'
except Exception:
    pass
site.render.film_transparent = False
site.view_settings.exposure = -0.1

# ---------------------------------------------------------------- leaf / bark shaders: per-leaf colour where present, procedural otherwise
for name in ("ZUFA_Leaf", "ZUFA_Olive_Leaf", "ZUFA_Bark", "ZUFA_Lavender", "ZUFA_Bloom", "ZUFA_Reed"):
    m = bpy.data.materials.get(name)
    if not m:
        continue
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")
    ramp = next((n for n in nt.nodes if n.bl_idname == "ShaderNodeValToRGB"), None)
    for n in [n for n in nt.nodes if n.name in ("LeafCol", "BarkCol")]:
        nt.nodes.remove(n)
    at = nt.nodes.get("ColAttr") or nt.nodes.new("ShaderNodeAttribute")
    at.name = "ColAttr"
    at.attribute_type = 'GEOMETRY'
    at.attribute_name = "Col"
    mx = nt.nodes.get("ColMix") or nt.nodes.new("ShaderNodeMix")
    mx.name = "ColMix"
    mx.data_type = 'RGBA'
    nt.links.new(at.outputs["Alpha"], mx.inputs["Factor"])
    if ramp:
        nt.links.new(ramp.outputs["Color"], mx.inputs["A"])
    nt.links.new(at.outputs["Color"], mx.inputs["B"])
    nt.links.new(mx.outputs["Result"], b.inputs["Base Color"])
    tr = nt.nodes.get("LeafTrans")
    if tr:
        nt.links.new(mx.outputs["Result"], tr.inputs["Color"])

# ---------------------------------------------------------------- scene-level controls, animated per shot
def hour_at(i):
    return beats[i]['hour']


if site.animation_data:                     # drop keys from earlier builds (frame numbers change); keep drivers
    site.animation_data.action = None
for prop in ("hour", "night", "build"):
    site[prop] = 0.0
for i, f in enumerate(FK):
    h = hour_at(i)
    a = (h - 5.5) / 13 * math.pi
    el = math.sin(a)
    night = 1 - max(0.0, min(1.0, (el + 0.02) / 0.16))
    site["hour"] = h
    site["night"] = night
    site["build"] = beats[i]['build']
    for prop in ("hour", "night", "build"):
        site.keyframe_insert(f'["{prop}"]', frame=f)


def sun_dir(h):
    a = (h - 5.5) / 13 * math.pi
    d = Vector((math.cos(a) * 800, -280, max(math.sin(a), -0.25) * 700 + 25))
    return d.normalized()


# ---------------------------------------------------------------- sky (Nishita) + stars, sun and moon
w = bpy.data.worlds.get("ZUFA_FilmWorld") or bpy.data.worlds.new("ZUFA_FilmWorld")
site.world = w
w.use_nodes = True
nt = w.node_tree
nt.nodes.clear()
out = nt.nodes.new("ShaderNodeOutputWorld")
sky = nt.nodes.new("ShaderNodeTexSky")
sky.name = "Sky"
# multiple-scattering physical sky; its sun disc is off because the sun lamp provides direct light and shadows
sky.sun_disc = False
sky.air_density = 1.0
try:
    sky.aerosol_density = 1.2
except Exception:
    pass
bg = nt.nodes.new("ShaderNodeBackground")
bg.name = "SkyBG"
nt.links.new(sky.outputs[0], bg.inputs[0])
# stars: sparse bright voronoi points, only overhead and only at night
tc = nt.nodes.new("ShaderNodeTexCoord")
vor = nt.nodes.new("ShaderNodeTexVoronoi")
vor.inputs["Scale"].default_value = 420
nt.links.new(tc.outputs["Generated"], vor.inputs["Vector"])
star = nt.nodes.new("ShaderNodeMath")
star.operation = 'LESS_THAN'
star.inputs[1].default_value = 0.035
nt.links.new(vor.outputs["Distance"], star.inputs[0])
sep = nt.nodes.new("ShaderNodeSeparateXYZ")
nt.links.new(tc.outputs["Generated"], sep.inputs[0])
up = nt.nodes.new("ShaderNodeMath")
up.operation = 'MULTIPLY'
nt.links.new(star.outputs[0], up.inputs[0])
nt.links.new(sep.outputs["Z"], up.inputs[1])
sbg = nt.nodes.new("ShaderNodeBackground")
sbg.name = "Stars"
sbg.inputs["Color"].default_value = (1, 0.97, 0.9, 1)
nt.links.new(up.outputs[0], sbg.inputs["Strength"])
nightbg = nt.nodes.new("ShaderNodeBackground")
nightbg.name = "NightSky"
nightbg.inputs["Color"].default_value = (0.012, 0.016, 0.04, 1)
nightbg.inputs["Strength"].default_value = 1.0
add1 = nt.nodes.new("ShaderNodeAddShader")
add2 = nt.nodes.new("ShaderNodeAddShader")
nt.links.new(bg.outputs[0], add1.inputs[0])
nt.links.new(nightbg.outputs[0], add1.inputs[1])
nt.links.new(add1.outputs[0], add2.inputs[0])
nt.links.new(sbg.outputs[0], add2.inputs[1])
nt.links.new(add2.outputs[0], out.inputs[0])

for nm in ("FilmSun", "FilmMoon"):
    o = bpy.data.objects.get(nm)
    if o:
        bpy.data.objects.remove(o, do_unlink=True)
LC = bpy.data.collections.get("Site_Lighting") or bpy.data.collections.new("Site_Lighting")
if LC.name not in [x.name for x in site.collection.children]:
    site.collection.children.link(LC)
sun = bpy.data.objects.new("FilmSun", bpy.data.lights.new("FilmSun", 'SUN'))
sun.data.angle = math.radians(0.8)
LC.objects.link(sun)
moon = bpy.data.objects.new("FilmMoon", bpy.data.lights.new("FilmMoon", 'SUN'))
moon.data.color = (0.62, 0.72, 1.0)
moon.data.angle = math.radians(1.5)
moon.rotation_euler = (math.radians(35), 0, math.radians(-40))
LC.objects.link(moon)
sun.rotation_mode = 'QUATERNION'
if site.world and site.world.node_tree and site.world.node_tree.animation_data:
    site.world.node_tree.animation_data.action = None
for i, f in enumerate(FK):
    h = hour_at(i)
    d = sun_dir(h)
    el = math.asin(max(-1, min(1, d.z)))
    sun.rotation_quaternion = (-d).to_track_quat('-Z', 'Y')
    sun.keyframe_insert("rotation_quaternion", frame=f)
    day = max(0.0, min(1.0, (math.sin((h - 5.5) / 13 * math.pi) + 0.06) / 0.28))
    sun.data.energy = 4.6 * day
    sun.data.keyframe_insert("energy", frame=f)
    warm = max(0.0, min(1.0, math.sin((h - 5.5) / 13 * math.pi) / 0.55))
    sun.data.color = (1.0, 0.62 + 0.34 * warm, 0.38 + 0.55 * warm)
    sun.data.keyframe_insert("color", frame=f)
    moon.data.energy = 0.08 * (1 - day)
    moon.data.keyframe_insert("energy", frame=f)
    try:
        sky.sun_elevation = max(el, math.radians(-8))
        sky.sun_rotation = math.atan2(d.x, d.y)
        sky.keyframe_insert("sun_elevation", frame=f)
        sky.keyframe_insert("sun_rotation", frame=f)
    except Exception:
        pass
    bg.inputs["Strength"].default_value = 0.05 + 0.17 * day
    bg.inputs["Strength"].keyframe_insert("default_value", frame=f)
    n = 1 - max(0.0, min(1.0, (math.sin((h - 5.5) / 13 * math.pi) + 0.02) / 0.16))
    nightbg.inputs["Strength"].default_value = n
    nightbg.inputs["Strength"].keyframe_insert("default_value", frame=f)
    sbg.inputs["Strength"].default_value = 0.0
    up.inputs[1].default_value  # (stars scale with night through the multiply below)


def drive(owner, path, expr, index=-1):
    fc = owner.driver_add(path, index) if index >= 0 else owner.driver_add(path)
    d = fc.driver
    d.type = 'SCRIPTED'
    for v in list(d.variables):
        d.variables.remove(v)
    for nm, prop in (("n", "night"), ("b", "build")):
        v = d.variables.new()
        v.name = nm
        v.type = 'SINGLE_PROP'
        v.targets[0].id_type = 'SCENE'
        v.targets[0].id = site
        v.targets[0].data_path = f'["{prop}"]'
    d.expression = expr
    return fc


# stars only at night: drive the star layer strength
drive(sbg.inputs["Strength"], "default_value", "n*n*6")

# ---------------------------------------------------------------- night: street lamps, lamp heads, window glow
for o in bpy.data.collections["Site_Avenues"].objects:
    if o.type == 'LIGHT':
        drive(o.data, "energy", "n*90")
lg = bpy.data.materials["ZUFA_LampGlow"].node_tree.nodes["Emission"]
drive(lg.inputs["Strength"], "default_value", "n*30")
gl = bpy.data.materials["ZUFA_Glass"]
gnt = gl.node_tree
gb = next(n for n in gnt.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")
gb.inputs["Emission Color"].default_value = (1.0, 0.72, 0.45, 1)
drive(gb.inputs["Emission Strength"], "default_value", "n*6")
gb.inputs["Roughness"].default_value = 0.05
# pools glow softly after dark
for wn in ("ZUFA_Water",):
    wm = bpy.data.materials[wn]
    wb = next(n for n in wm.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")
    wb.inputs["Emission Color"].default_value = (0.2, 0.75, 0.9, 1)
    drive(wb.inputs["Emission Strength"], "default_value", "n*1.5")
    wb.inputs["Transmission Weight"].default_value = 0.0
    wb.inputs["Roughness"].default_value = 0.02

# ---------------------------------------------------------------- homes rising (driven by build and each home's order)
for o in bpy.data.collections["Site_Homes"].objects:
    if o.parent is None and o.type == 'EMPTY' and "order" in o.keys():
        fc = drive(o, "scale", "", 2)
        fc.driver.expression = f"max(0.001, min(1.0, (b*1.3 - {o['order']:.3f})/0.28))"
        # everything on the plot stays hidden until its home starts to rise (no flattened pools on empty land)
        for ch in o.children:
            hc = drive(ch, "hide_render", "")
            hc.driver.expression = f"(b*1.3 - {o['order']:.3f}) < 0.02"

# ---------------------------------------------------------------- camera flight
for nm in ("FilmCam", "FilmTarget"):
    o = bpy.data.objects.get(nm)
    if o:
        bpy.data.objects.remove(o, do_unlink=True)
cam = bpy.data.objects.new("FilmCam", bpy.data.cameras.new("FilmCam"))
LC.objects.link(cam)
tgt = bpy.data.objects.new("FilmTarget", None)
LC.objects.link(tgt)
cam.data.sensor_fit = 'VERTICAL'
cam.data.angle_y = math.radians(S['fov'])
cam.data.clip_start = 0.5
cam.data.clip_end = 30000
c = cam.constraints.new('TRACK_TO')
c.target = tgt
c.track_axis = 'TRACK_NEGATIVE_Z'
c.up_axis = 'UP_Y'
site.camera = cam
# text-side offsets per shot (+1: copy on the left, so the subject shifts right)
SIDE = {"sky": 0, "overview": 1, "forestLow": -1, "arrival": 1, "avenues": -1, "club": 1, "quarter": -1, "half": 1, "buildWide": -1,
        "villaQ": 1, "villaH": 1, "farm": -1, "buildWide2": -1, "avenues2": 1, "arrivalNight": -1, "nightSky": 0, "finale": 0}
for i, f in enumerate(FK):
    k = S['cameras'][beats[i]['cam']]
    cam.location = k['p']
    tgt.location = k['t']
    cam.data.shift_x = -0.12 * SIDE.get(beats[i]['cam'], 0)
    cam.keyframe_insert("location", frame=f)
    tgt.keyframe_insert("location", frame=f)
    cam.data.keyframe_insert("shift_x", frame=f)
# crane arcs: lift over the site between distant low shots
for i, top in ARC.items():
    A, B = S['cameras'][beats[i]['cam']], S['cameras'][beats[i + 1]['cam']]
    fm = (FK[i] + FK[i + 1]) // 2
    p = [(a + b) / 2 for a, b in zip(A['p'], B['p'])]
    p[2] = top
    cam.location = p
    tgt.location = [(a + b) / 2 for a, b in zip(A['t'], B['t'])]
    cam.keyframe_insert("location", frame=fm)
    tgt.keyframe_insert("location", frame=fm)


def fcurves(ob):
    ad = ob.animation_data
    if not (ad and ad.action):
        return []
    act = ad.action
    if getattr(act, "fcurves", None):
        return list(act.fcurves)
    out = []
    for ly in act.layers:
        for sp in ly.strips:
            cb = sp.channelbag(ad.action_slot)
            if cb:
                out += list(cb.fcurves)
    return out


# ease into every shot (camera settles where the copy sits), glide through the crane arcs
SHOT = set(FK)
for ob in (cam, tgt, cam.data):
    for fc in fcurves(ob):
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
            kp.handle_left_type = kp.handle_right_type = 'AUTO_CLAMPED'
        fc.update()
        if fc.data_path != "location":
            continue
        pts = fc.keyframe_points
        for j, kp in enumerate(pts):
            if round(kp.co.x) not in SHOT:
                continue
            kp.handle_left_type = kp.handle_right_type = 'FREE'
            if j > 0:
                kp.handle_left = (kp.co.x - (kp.co.x - pts[j - 1].co.x) / 2.2, kp.co.y)
            if j < len(pts) - 1:
                kp.handle_right = (kp.co.x + (pts[j + 1].co.x - kp.co.x) / 2.2, kp.co.y)
        fc.update()

site.frame_set(1)
bpy.ops.wm.save_mainfile()
result = {"frames": FK[-1], "shots": len(FK)}
