"""Render quick test stills of chosen film frames.  Set FRAMES / PCT before exec."""
import bpy, time
site = bpy.data.scenes["ZUFA_Site"]
bpy.context.window.scene = site
for c in bpy.data.collections:
    c.hide_render = c.name == "Export"
out = {}
old_pct, old_samples = site.render.resolution_percentage, site.cycles.samples
site.render.resolution_percentage = globals().get("PCT", 50)
site.cycles.samples = globals().get("SAMPLES", 40)
site.render.image_settings.file_format = 'JPEG'
for f in globals().get("FRAMES", [289]):
    site.frame_set(f)
    site.render.filepath = rf"C:\Users\PRAVEE~1\AppData\Local\Temp\claude\4cfeb0de37bf75bc\083b0ca0-1a4e-4f11-ad26-7e7e702ae4a4\scratchpad\ft_{f:04d}.jpg"
    t = time.time()
    bpy.ops.render.render(write_still=True)
    out[f] = round(time.time() - t, 1)
site.render.resolution_percentage, site.cycles.samples = old_pct, old_samples
result = out
