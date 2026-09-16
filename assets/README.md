# Chibi sprite pack

27 standalone runtime assets derived from the approved Chibi Arena concept using the built-in image generator:

- `characters/`: Mochi, Hạt Dẻ, Bzz, Nemu, Aether; transparent PNG, right-facing idle poses.
- `weapons/`: carrot, acorn, honey, bubble, fish, star, Void Prism; transparent PNG.
- `environment/`: five opaque backgrounds plus five destructible-ground textures: Sky Islands, Candy Valley, Moonlit Mushroom Grove, Death Valley and Celestial Stars.

PNG sprites have a four-pixel transparent gutter. Runtime render uses feet at the actor anchor and mirrors sprites for left aim. The PNGs serve as HUD portraits and fallback sprites. Animated rendering uses the four WebP sheets in `animations/`. Each weapon carries its own `ammo` parameters in `src/assets.js` (gravity, wind drift, crater width and depth, damage, angle range).

`src/assets.js` is the runtime manifest and asset loader. Relative URLs support a hosted subdirectory. Image failure/timeout falls back to procedural artwork. The terrain texture is drawn against the original heightmap, then clipped against the live heightmap, so craters do not regrow grass.

## Generation prompts

Reference: the approved four-panel Chibi Arena concept from this conversation. No external game artwork was downloaded.

1. Character atlas: extract the four character designs, retain faces and clothing, full-body right-facing idle poses, same scale/baseline, empty hands, real alpha transparency, four separated columns, no text or shadows.
2. Weapon atlas: extract six weapon designs in a 3×2 grid, right-facing, complete silhouettes, real alpha transparency, no labels, panels or ground shadows.
3. Background: expand the sky island panel into a full-bleed 2:1 landscape; open center sky, floating villages and windmills at edges; remove foreground fences, HUD and characters.
4. Terrain: derive a full-bleed 3:1 horizontal grass/earth cross-section; grass at top, rocks/roots beneath; no island silhouette, labels, trees or transparency.

The generated atlases were sliced into individual PNG files and resized with Pillow; alpha was supplied by image generation and retained. Background and terrain were encoded as WebP to reduce initial download.

## Map assets (v0.5)

Each map pairs a 2:1 background with a 3:1 material cross-section. Built-in ImageGen created each pair, using the approved Sky Islands background only as an art-direction reference. Prompts keep the projectile area open, move scenery to the outer edges, omit playable foreground from backgrounds, and require textures to fill every pixel beneath a level top edge. Runtime then warps each texture to its map heightmap and clips new craters against live collision data.

- Candy Valley: peach candy kingdom plus layered sponge cake and chocolate soil.
- Moonlit Mushroom Grove: blue-violet mushroom village plus glowing moss, roots and crystals.
- Death Valley: family-friendly ochre canyon plus cracked red-clay and sandstone strata.
- Thiên Tinh: celestial crystal palaces and Milky Way plus lavender crystal stone with gold mineral veins.

## Animation sheets (v0.3)

Each `animations/{mochi,hat-de,bzz,nemu,aether}.webp` contains 4×4 frames, 768×768 pixels with alpha. Each cell is 192×192 pixels; the common foot anchor is (96,184). Rows: idle, walk, shoot, hurt. The runtime draws a 128×128 cell at the actor anchor and mirrors it for direction. Four frames per action, 80 frames total.

Aether and Void Prism use an original white-haired blindfolded arcane-marksman design. They reference only the broad character archetype, not franchise artwork, insignia or an exact costume.

Generation: built-in ImageGen, referencing each corresponding approved PNG character. Prompt: preserve exact character/outfit and right-facing view; create a transparent 4×4 full-body sheet, evenly spaced, same scale and baseline; row 1 breathing/blink, row 2 alternating walking steps, row 3 brace/recoil/recover, row 4 startle/wince/recover; empty hands, no text, grid or background. Atlas cells were cropped, uniformly scaled per character, aligned on their foot baseline and packed into WebP.

Idle uses variable frame durations for a brief blink. Walk loops at about 8 fps. Shoot/hurt play once and return to idle or walk. Hurt overrides shoot; defeat holds a hurt pose. Animation time uses the game's fixed timestep and freezes with pause/hidden tab. Reduced-motion mode holds a stable character pose and disables recoil/muzzle flashes. Missing animation sheets retain static PNG rendering.
