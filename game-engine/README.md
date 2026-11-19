# Game engine integration

The engine in this workspace is shared by the application and the standalone
developer preview. The application loads the active WorldPackage; the preview
loads an uploaded package or a selected local package file. Both paths
validate package data before the Phaser scene consumes it.

## Data flow

1. Author finite isometric maps in the documented Tiled 1.12.2 format.
2. Export maps as Tiled JSON with embedded tilesets and package images under
   `tilesets/`.
3. Validate the complete WorldPackage in `backend/src/world/`; shared Zod
   schemas define its JSON shapes and the backend applies package-level rules.
4. Load validated world data in `game-engine/` and render it with Phaser 4.2.1.
   The frontend and `game-preview/` use this same engine.

The normative authoring and package rules are in
[spec/sw-architecture.md](../spec/sw-architecture.md), section 14. The
generated package-format documentation is derived from
`shared/src/packages/world-v2.ts`.

## Rendering and gameplay contract

- Preserve Tiled layer order. Put visible ground tile layers before one
  top-down `Props` object layer containing static tile objects; put
  foreground/canopy tile layers after it. Phaser renders these layers and
  objects natively. Props sort by their bottom edge and actors by their feet.
  A tile-image `occlusion` polyline lets an actor pass behind or in front of
  that intact prop at the authored edge; foreground tile layers cover both.
- Tile objects use their image's natural size and bottom alignment. Tileset
  offsets must be zero. The validator rejects scaled tile objects, other
  alignments, and non-zero offsets instead of relying on renderer-specific
  transform fallbacks.
- Image-collection tile guides named `collision`, `trigger` and `occlusion`
  remain in the world package. `collision` polygons or rectangles block
  movement; a portal's `trigger` polygon or rectangle defines its activation
  area; an `occlusion` polyline defines the prop's front edge for actor depth.
  No artwork splitting or pixel masks are used.
- The logical position of the player is the visible feet (GAME-02): each frame
  is drawn 3 px left and 10 px down from it. The movement footprint is an
  ellipse centred 2 px left of the feet with radii 0.1 and 0.05 tile widths, so
  it does not extend below the feet. The same point is used for actor depth
  and portal checks.

**Atmosphere** (GAME-31 – GAME-34, world format version 3): per map the engine draws the fog along the `border` polygons (clear inside, thickening over two tile widths outside, then covering everything), faint soft cloud shadows that drift from left to right, and the bird of the world (`ambient/bird/`), which a small flock flies through the view every 20 to 60 seconds, above everything. The map properties `clouds`, `birds` and `fog` switch an effect off; with `prefers-reduced-motion` the shadows and the birds are not shown, the fog stays. The rules live in `fog.ts`, `clouds.ts`, `birds.ts` and `atmosphere-plan.ts` (pure, tested); `atmosphere.ts` draws them. The host passes the bird's PixelLab metadata to `prepareWorld` as `birdMetadata` when the public world says `bird: true`.

**NPCs** (GAME-36, GAME-38, world format version 3): `npc` point objects with a `figure`, an optional `path` (a `path` polyline of the same map) and the preset properties of a clickable object. `map-model.ts` reads them into `ParsedMap.npcs` (a path starts at its first point); `world-data.ts` loads the figure's `wave` frames (the animation its `figures.json` entry names); `npc-walk.ts` (pure, tested) is the behaviour: walk the path to its end, wait 3 to 8 s, walk back, and while standing wave every 8 to 20 s; `npc-crowd.ts` draws the figures with the shadow and depth of the guest figures and keeps a clickable area for each NPC with an action, which the scene reads for the tap, Enter and arrival like an object's. The NPCs are not in `ParsedMap.clickables`, so they have no sparkles; they glow only while the player walks to them, and the NPC waits meanwhile. The test hook state has `npcs`.

**Labels in sight** (GAME-40, GAME-41): an object, portal or NPC with an edge indicator that is not outside the view carries its label, the indicator's white pill, centred over its top. `object-labels.ts` (pure, tested) places the label and applies the overlap rule (the nearest object's label shows); `object-label-layer.ts` draws them as HTML over the canvas, taps pass through, and they hide while a page is open. The text is `titleOf(action)` of the engine options (the app gives the title of a page; the preview gives none), else the object's label or name. Only the setting `showIndicator` decides whether an object or NPC has an indicator and a label (`indicatorShown`, from `LoadedWorld.showIndicator`; on unless the admin turned it off): an easter egg, an object without an action or one that shows a dialogue follows it like any other, and the game preview, which has no settings, shows all.

**NPC texts, bubbles and indicators** (MAP-21, GAME-37, GAME-39): the admin's name, short dialog and portrait of each NPC come with the public world (`LoadedWorld.npcs`, by `<map>/<name>`; `npc-texts.ts`). The speech bubbles of guests and NPCs are decided together by `bubble-board.ts` (the board): the crowds report their figures as participants once a frame, the board opens a bubble within 0.8 tile widths of a guest and 3 of an NPC (closing beyond 1.1 and 3.5), applies pinning and the cross, lets of two overlapping bubbles only the nearer show, and draws them (`bubble-layer.ts`); a tap on the bubble of an NPC with an action runs the NPC's tap instead of pinning. An NPC with a short dialog stops and turns to the player while its bubble is open. An NPC with an action has an edge indicator labelled with its name that follows it (the scene builds these sources every frame). The game preview has no NPC texts, so no NPC bubbles.

**Tile animations** (GAME-35, world format version 3): an image-collection tile with a Tiled `animation` plays it on its tile objects, e.g. a fountain. `map-model.ts` reads the frames (the texture key of each frame's tile and its duration) into the tile's `TileImage.animation`; `world-data.ts` loads the frame pictures too; `tile-animation.ts` (pure, tested) decides which frame shows, the same for all objects of a map and looping from the moment the map is entered, and `GameScene` swaps the texture of the drawn picture. With `prefers-reduced-motion` the objects stand on their first frame. The state of the test hook has `tileAnimation` with the number of animated objects and the frame each shows.

**Guest figures** (PRES-01, PRES-02): the host gives the engine `guests` (id, name, figure id). Each guest walks on the map that the hash of its id picks among the maps with a wander area (`guestMapOf`), to random reachable points of the wander areas, at a quarter of the player's speed (`GUEST_SPEED_FACTOR`), and waits 3–8 s between walks. The name tag is drawn above the figure. A guest within 0.8 tile widths of the player stands still, turns to them and opens a speech bubble (HTML over the canvas, like the edge indicators; PRES-10): picture or initials, name, badge, greeting and line (`greeting`, `badge`, `line`, `photo` of the guest, and `guestPhoto` for the picture's address). Of bubbles that would overlap only the nearest figure's is shown; a click or tap pins a bubble, which keeps its figure standing until the cross closes it. The preview passes `sampleGuests(world)`.

The preview's **Collision**, **Border**, **Spawn**, and **Portal** guides
visualize gameplay geometry. Renderer geometry and package constraints are
covered by independent engine and validator tests; no Tiled executable is
required in Zappaloo.
