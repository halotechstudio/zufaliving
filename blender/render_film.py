"""Render the ZUFA scroll film and pack it into WebP sprite sheets.
  hd/s###.webp : 2x2 frames (1280x720 each)      lo/s###.webp : 4x4 frames (480x270 each, loads first)
Run headless; resumable (frames already on disk are not re-rendered, finished sheets are skipped):
  blender -b D:\\Zufa\\blender\\zufa_assets.blend --python D:\\Zufa\\blender\\render_film.py
Env: ZF_SAMPLES (48)  ZF_PCT (100)  ZF_OUT (D:\\Zufa\\film)  ZF_ONLY (render one hd sheet, testing)"""
import bpy, os, json, time
import numpy as np

OUT = os.environ.get("ZF_OUT", r"D:\Zufa\film")
TMP = os.path.join(OUT, "_frames")
for d in (TMP, os.path.join(OUT, "hd"), os.path.join(OUT, "lo")):
    os.makedirs(d, exist_ok=True)
sc = bpy.data.scenes["ZUFA_Site"]
for c in bpy.data.collections:
    c.hide_render = c.name == "Export"
sc.render.resolution_percentage = int(os.environ.get("ZF_PCT", 100))
sc.cycles.samples = int(os.environ.get("ZF_SAMPLES", 48))
prefs = bpy.context.preferences.addons["cycles"].preferences
for dt in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = dt
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type == dt
        sc.cycles.device = 'GPU'
        break
    except Exception:
        pass
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGB'

W = int(sc.render.resolution_x * sc.render.resolution_percentage / 100)
H = int(sc.render.resolution_y * sc.render.resolution_percentage / 100)
LW, LH = W * 3 // 8, H * 3 // 8
frames = list(range(sc.frame_start, sc.frame_end + 1))
HD, LO = 4, 16
hd_sheets = [frames[i:i + HD] for i in range(0, len(frames), HD)]
lo_sheets = [frames[i:i + LO] for i in range(0, len(frames), LO)]
only = os.environ.get("ZF_ONLY")
fpath = lambda f: os.path.join(TMP, f"f{f:04d}.png")


def load(f, w=None, h=None):
    im = bpy.data.images.load(fpath(f))
    if w:
        im.scale(w, h)
    ww, hh = im.size
    px = np.empty(ww * hh * 4, dtype=np.float32)
    im.pixels.foreach_get(px)
    bpy.data.images.remove(im)
    return px.reshape(hh, ww, 4)


def pack(fr, cols, w, h, path):
    rows = cols                                         # square grid: 2x2 hd, 4x4 lo (last sheet may be part-empty)
    A = np.zeros((h * rows, w * cols, 4), dtype=np.float32)
    A[..., 3] = 1
    for k, f in enumerate(fr):
        c, r = k % cols, k // cols                      # layout reads top-down, left-right
        y0 = (rows - 1 - r) * h                         # Blender pixel rows go bottom-up
        A[y0:y0 + h, c * w:(c + 1) * w] = load(f) if w == W else load(f, w, h)
    img = bpy.data.images.new("ZF_Sheet", w * cols, h * rows, alpha=False)
    img.pixels.foreach_set(A.ravel())
    img.file_format = 'WEBP'
    img.save(filepath=path, quality=70 if w == W else 68)
    bpy.data.images.remove(img)


prog = os.path.join(OUT, "progress.json")
t0, nr = time.time(), 0
todo = [f for f in frames if not os.path.exists(fpath(f))]
if only:
    todo = [f for f in hd_sheets[int(only)] if f in todo]
for f in todo:
    sc.frame_set(f)
    sc.render.filepath = fpath(f)
    bpy.ops.render.render(write_still=True, scene=sc.name)
    nr += 1
    el = time.time() - t0
    json.dump({"rendered": len(frames) - len(todo) + nr, "frames": len(frames), "elapsed_s": round(el),
               "s_per_frame": round(el / nr, 1), "eta_min": round(el / nr * (len(todo) - nr) / 60)}, open(prog, "w"))
    # pack any sheet whose frames are now all on disk
    for i, fr in enumerate(hd_sheets):
        p = os.path.join(OUT, "hd", f"s{i:03d}.webp")
        if f in fr and not os.path.exists(p) and all(os.path.exists(fpath(x)) for x in fr):
            pack(fr, 2, W, H, p)
    for i, fr in enumerate(lo_sheets):
        p = os.path.join(OUT, "lo", f"s{i:03d}.webp")
        if f in fr and not os.path.exists(p) and all(os.path.exists(fpath(x)) for x in fr):
            pack(fr, 4, LW, LH, p)

if not only:
    keys = json.load(open(r"D:\Zufa\blender\export\film_keys.json"))
    json.dump({"frames": len(frames), "keys": keys["keys"], "cams": keys["cams"], "hd": {"w": W, "h": H, "per": HD, "cols": 2, "sheets": len(hd_sheets)},
               "lo": {"w": LW, "h": LH, "per": LO, "cols": 4, "sheets": len(lo_sheets)}}, open(os.path.join(OUT, "film.json"), "w"))
    json.dump({"rendered": len(frames), "frames": len(frames), "elapsed_s": round(time.time() - t0), "finished": True}, open(prog, "w"))
