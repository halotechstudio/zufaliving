# ZUFA Living — website

Static site with no build step. It uses Three.js, GSAP and Lenis from CDNs.

## Run locally
```
node tools/serve.mjs 4317
```
Then open http://localhost:4317. Any static host (Netlify, Vercel, S3, cPanel) works: upload the folder as is.

## Before launch
- `js/main.js` → `CONFIG.enquiryEmail` / `CONFIG.whatsapp`: where the enquiry form sends leads. Both are blank for now, so the form only shows a thank-you message.
- `CONFIG.ratePerSqYd` (5000) drives every price on the site.
- Every plot is shown as available. To mark plots sold or held, add a status to `js/site-data.js`.

## The story ("One day at ZUFA")
The whole page is one scroll through a single day, shown as a **film rendered in Blender Cycles** (`film/`) and scrubbed by the scroll (`js/film.js`). 23 text "beats" in `index.html` sit over it:
- `data-cam`: the film shot this beat stops on (shot names are listed in `film/film.json` → `cams`)
- `data-hour`: time of day for the on-screen clock and the soundscape
- `data-region` / `data-reg`: shows the 2D regional map (`js/region.js`) and how many of the 5 developments are drawn in

The real-time 3D world (`js/world.js`) is no longer behind the story. It loads only when someone opens **Find your estate** or **Walk around this villa**, and its render loop sleeps when they close it.

### Re-rendering the film
The film is built in `blender/zufa_assets.blend`, scene **ZUFA_Site**:
1. `build_site.py` (roads, plots, homes facing their road, palms, lamps), then `build_landscape.py` (forest, groves, granite outcrops), then `build_film.py` (sun and sky through the day, night lighting, homes rising, the camera flight). The shot list and times come from `blender/site.json` (`node tools/export-site-blender.mjs > blender/site.json`). Each move gets 28–64 frames depending on how far the view travels; long, low moves crane up over the site; the camera eases to a stop on every shot.
2. Render headless (about 12 s a frame on a GTX 1650; resumable):
   `blender -b blender/zufa_assets.blend --python blender/render_film.py`
   It writes `film/hd/s###.webp` (4 frames of 1280×720 per sheet), `film/lo/s###.webp` (16 frames of 480×270, loaded first), and `film/film.json`. Raw frames go to `film/_frames/` (not committed).
3. If shots are added, removed or renamed, keep the `data-cam` names in `index.html` matching the film's shot names.

## Blender models
Everything 3D that isn't generated from the layout is built by scripts in `blender/`, into `blender/zufa_assets.blend` (scene **ZUFA_Assets**):
| Script | Builds | Reference |
|---|---|---|
| `build_sanctuary.py` | Sanctuary Villa, ~3,000 sft, single level | client image 3 (small villa) |
| `build_estate.py` | Estate Villa, ~5,000 sft | client image 2 (big villa) |
| `build_clubhouse.py` | Clubhouse campus: Kerala-style hall, spa wing, dining pavilion, lap pool, pond | client image 1 |
| `build_entrance.py` | Grand entrance: ring canopy, tree column, stone walls, sign, water blade | Enscape render |
| `build_trees.py` | 3 forest species, garden tree, palm | — |
| `build_car.py` | Generic luxury SUV | — |
`zufa_lib.py` holds the shared materials (clay tile, metal roof, rubble stone, pebbles, decking…), building parts and the bake/export pipeline.

To change a model: edit its script, then in Blender (with the MCP add-on, or Blender's Python console) run
`exec(open(r"D:\Zufa\blender\build_sanctuary.py").read())`, then bake and export with
`bake_and_export("Sanctuary_Villa", "SanctuaryVilla", "sanctuary")` (trees and the car use `export_plain`),
then `node tools/glb2gltf.mjs blender/export/sanctuary.glb assets/models/sanctuary.gltf`. The preview host only serves `.gltf`, not `.glb`.

The `.gltf` files embed their binary data as a `data:` URI. The claude.ai preview host's security policy blocks fetching `data:` URIs, so `js/world.js` → `loadModel()` decodes that data itself and passes it to Three.js as a `blob:` URL. Always load models through `loadModel()`, never `GLTFLoader.load()` directly. `tools/serve.mjs` sends the same security policy, so anything the live host would block also fails locally.

Material names starting `ZUFA_` matter: the website drives night glow from `ZUFA_Glass` / `ZUFA_Shade`, water from `ZUFA_Water` / `ZUFA_Pond`, and colours foliage per leaf for `ZUFA_Leaf`, `ZUFA_Olive_Leaf`, `ZUFA_Lavender`, `ZUFA_Bloom`, `ZUFA_Reed` and `ZUFA_Bark`.

## Structure
- `index.html`: page content and copy
- `css/main.css`: design system and layout
- `js/main.js`: scroll story, explorer UI, inventory and form
- `js/film.js`: the scroll-scrubbed Cycles film (sprite sheets, progressive loading, sub-frame crossfade)
- `js/region.js`: the 2D regional map for "The bigger picture"
- `js/masterplan.js`: base 3D scene (plots, roads, entrance canopy, clubhouse, forest, explorer, villa preview)
- `js/world.js`: the living world on top of it (time of day, homes rising, cars and gate, birds, clouds, stars, regional map)
- `js/site-data.js`: **generated** plot polygons in metres, plus the plot schedule
- `assets/img/`: web crops of the Enscape render

## Regenerating the masterplan from a new layout PDF
`tools/layout/` reads the vector linework in the architect's PDF:
1. `node tools/layout/dump.js "<layout.pdf>" <outdir>`: decompresses the PDF streams
2. `node tools/layout/parse.js <outdir>`: extracts line segments and text
3. `node --stack-size=65500 tools/layout/extract.js <outdir>`: flood-fills each plot from its number label and traces the site outline
4. `node tools/layout/build-data.js <outdir>/plots_raw.json js/site-data.js`: converts the result to metres and merges the plot schedule

The scripts assume the plot boundaries are drawn in magenta and plot numbers are text, as in Layout L1. The plot schedule is hard-coded in `build-data.js`.
