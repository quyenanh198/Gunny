# Chibi sprite pack

12 standalone runtime assets derived from the approved Chibi Arena concept using the built-in image generator:

- `characters/`: Mochi, Hạt Dẻ, Bzz, Nemu; transparent PNG, right-facing idle poses.
- `weapons/`: carrot, acorn, honey, bubble, fish, star; transparent PNG.
- `environment/sky-islands.webp`: opaque background layer.
- `environment/grass-earth.webp`: grass/soil texture for destructible terrain.

PNG sprites have a four-pixel transparent gutter. Runtime render uses feet at the actor anchor and mirrors sprites for left aim. These are static idle sprites, not frame-by-frame walk/fire animation sheets. Each weapon carries its own `ammo` parameters in `src/assets.js` (gravity, wind drift, crater radius, damage).

`src/assets.js` is the runtime manifest and asset loader. Relative URLs support a hosted subdirectory. Image failure/timeout falls back to procedural artwork. The terrain texture is drawn against the original heightmap, then clipped against the live heightmap, so craters do not regrow grass.

## Generation prompts

Reference: the approved four-panel Chibi Arena concept from this conversation. No external game artwork was downloaded.

1. Character atlas: extract the four character designs, retain faces and clothing, full-body right-facing idle poses, same scale/baseline, empty hands, real alpha transparency, four separated columns, no text or shadows.
2. Weapon atlas: extract six weapon designs in a 3×2 grid, right-facing, complete silhouettes, real alpha transparency, no labels, panels or ground shadows.
3. Background: expand the sky island panel into a full-bleed 2:1 landscape; open center sky, floating villages and windmills at edges; remove foreground fences, HUD and characters.
4. Terrain: derive a full-bleed 3:1 horizontal grass/earth cross-section; grass at top, rocks/roots beneath; no island silhouette, labels, trees or transparency.

The generated atlases were sliced into individual PNG files and resized with Pillow; alpha was supplied by image generation and retained. Background and terrain were encoded as WebP to reduce initial download. Total runtime pack is approximately 1.5 MB.
