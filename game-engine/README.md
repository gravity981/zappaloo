# Game engine integration

The engine in this workspace is shared by the application and the standalone
developer preview. The application loads the active WorldPackage; the preview
loads a selected package or exports a local Tiled source checkout to a
temporary package. Both paths validate package data before the Phaser scene
consumes it.

## Data flow

1. Author finite isometric maps in the pinned Tiled 1.12.2 format.
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
  objects natively. Actors sort with the props by the y-coordinate of their
  feet; foreground tile layers cover actors without image-local masks.
- Tile objects use their image's natural size and bottom alignment. Tileset
  offsets must be zero. The validator rejects scaled tile objects, other
  alignments, and non-zero offsets instead of relying on renderer-specific
  transform fallbacks.
- Image-collection tile guides named `collision` and `trigger` remain gameplay
  data. `collision` polygons or rectangles block movement; a portal's
  `trigger` polygon or rectangle defines its activation area. Image-local
  `occlusion` guides are unsupported.
- The player sprite uses its bottom-centre as the logical foot anchor. The
  circular movement footprint is centered one radius above that anchor, so
  it does not extend below the feet. The same point is used for actor depth
  and portal checks.

The preview's **Collision**, **Border**, **Spawn**, and **Portal** guides
visualize gameplay geometry. Phaser rendering parity is tested against the
pinned Tiled rasterizer for the supported authoring subset.
