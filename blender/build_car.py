"""Generic luxury SUV for the arrival scenes (no brand). Length 4.8 m. Front faces Blender -Y.
Paint is a separate material ('ZUFA_Car_Paint') so the website can give each car its own colour.
Run in Blender:  exec(open(r"D:\\Zufa\\blender\\build_car.py").read())"""
exec(open(r"D:\Zufa\blender\zufa_lib.py").read())
import math

scene()
M = materials()
M['paint'] = mat_flat("ZUFA_Car_Paint", (0.05, 0.05, 0.06), 0.22, 0.6)
M['tyre'] = mat_flat("ZUFA_Tyre", (0.02, 0.02, 0.02), 0.85)
M['rim'] = mat_flat("ZUFA_Rim", (0.55, 0.56, 0.58), 0.3, 1.0)
M['chrome'] = mat_flat("ZUFA_Chrome", (0.8, 0.8, 0.82), 0.12, 1.0)
M['head'] = mat_flat("ZUFA_Headlight", (0.9, 0.9, 0.85), 0.1)
M['tail'] = mat_flat("ZUFA_Taillight", (0.5, 0.02, 0.02), 0.2)
C = coll("Car", clear=True)
L, W = 4.8, 1.95
box(C, "CAR_body", (W, L, 0.95), (0, 0, 0.42), M['paint'], bevel=0.08)
box(C, "CAR_cabin", (W - 0.08, L * 0.62, 0.72), (0, 0.32, 1.36), M['paint'], bevel=0.06)
# glasshouse: windscreen, side and rear glass
ws = box(C, "CAR_ws", (W - 0.22, 0.05, 0.7), (0, -0.98, 1.38), M['glass'])
ws.rotation_euler.x = math.radians(-18)
for s in (-1, 1):
    box(C, f"CAR_side{s}", (0.04, L * 0.56, 0.52), (s * (W / 2 - 0.02), 0.34, 1.44), M['glass'])
box(C, "CAR_rear", (W - 0.25, 0.04, 0.5), (0, 1.79, 1.44), M['glass'])
box(C, "CAR_roofrail1", (0.05, L * 0.55, 0.05), (-0.7, 0.32, 2.08), M['chrome'])
box(C, "CAR_roofrail2", (0.05, L * 0.55, 0.05), (0.7, 0.32, 2.08), M['chrome'])
# grille, bumpers, lights
box(C, "CAR_grille", (1.1, 0.05, 0.42), (0, -2.42, 0.6), M['frame'])
box(C, "CAR_bumperF", (W + 0.02, 0.2, 0.22), (0, -2.38, 0.28), M['frame'], bevel=0.04)
box(C, "CAR_bumperR", (W + 0.02, 0.2, 0.22), (0, 2.38, 0.28), M['frame'], bevel=0.04)
for s in (-1, 1):
    cyl(C, f"CAR_head{s}", 0.13, 0.06, (s * 0.72, -2.43, 0.82), M['head'], 16, axis='Y')
    box(C, f"CAR_tail{s}", (0.18, 0.04, 0.42), (s * 0.82, 2.42, 0.95), M['tail'])
    box(C, f"CAR_mirror{s}", (0.2, 0.12, 0.14), (s * (W / 2 + 0.08), -0.85, 1.22), M['paint'])
# wheels with rims and arches
for sx in (-1, 1):
    for sy in (-1.55, 1.55):
        cyl(C, f"CAR_tyre{sx}{sy}", 0.42, 0.32, (sx * (W / 2 - 0.08), sy, 0.42), M['tyre'], 20, axis='X')
        cyl(C, f"CAR_rim{sx}{sy}", 0.27, 0.34, (sx * (W / 2 - 0.08), sy, 0.42), M['rim'], 12, axis='X')
cyl(C, "CAR_spare", 0.36, 0.25, (0, 2.55, 1.0), M['tyre'], 16, axis='Y')
import bpy
bpy.ops.wm.save_mainfile()
result = {"objects": len(C.objects)}
