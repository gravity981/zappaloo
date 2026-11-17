# Standalone game preview

Start the developer-only preview from the repository root:

```sh
APP_ENV=dev npm run dev:game-preview
```

Open [http://localhost:5175](http://localhost:5175). The preview validates a
selected `.tar.gz` world package locally and uses the shared game engine. It
does not use the application backend or database and never modifies the active
event. A failed replacement leaves the current world running.

To preview the local Tiled source checkout as well, set
`ZAPPALOO_TILED_SOURCE_DIR` to its absolute path before starting the server:

```sh
ZAPPALOO_TILED_SOURCE_DIR=/absolute/path/to/tiled-source \
  APP_ENV=dev npm run dev:game-preview
```

The configured directory must contain one Tiled project with a `maps` folder.
The source controls remain unavailable with a clear status message if the
variable is missing or the checkout cannot be used. The preview exports and
validates the source into a temporary archive; it does not write to the source
checkout. While watching, changes are exported and validated automatically.
If an export fails, the last successful world remains on screen and the error
is shown in the source panel.

## Controls

- Choose a world package and select **Load package**. **Reload** revalidates
  and reloads the current package.
- Or choose a start map under **Local Tiled source** and select **Preview and
  watch**. **Stop watching** leaves the current preview running; choose a
  different start map and restart to change the source preview entry point.
- Use **Map**, **Spawn**, and **Figure** to choose the scene.
- Expand **Guides and view** to toggle collision, border, spawn, portal,
  and grid guides, or **Artwork only** to hide gameplay elements.
- Set zoom to 1×, 2×, or 3×. **Reset camera** returns the scene to the selected
  spawn with the selected view settings.
- Validation findings and asset-loading errors are shown in the page; package
  warnings remain available under **Package warnings**.

The Vite server refuses to start unless `APP_ENV=dev` is set. Its package API
exists only in that development server and exposes files from the selected,
validated package only.

## Tiled and engine integration

The integration contract is specified in [spec/sw-architecture.md](../spec/sw-architecture.md),
section 14. Tiled 1.12.2 maps are exported with embedded tilesets, validated as
a WorldPackage by the backend, then parsed by the shared Phaser 4.2.1 engine.
The application and this preview use the same engine; see
[game-engine/README.md](../game-engine/README.md) for the code boundaries.

Author visible tile layers in draw order: ground layers first, one top-down
`Props` object layer for static tile objects, then foreground/canopy layers.
Phaser renders the tile layers and tile objects natively; actors share the
`Props` depth band and sort by their feet. Use bottom-aligned, unscaled tile
objects and zero tileset offsets. Image-local `occlusion` guides are not part
of the package format: use a foreground tile layer for artwork that covers
actors. Tile-image `collision` guides and portal `trigger` guides remain
gameplay data and do not change rendering.

The engine's player position is the bottom-centre of the sprite frame. Its
circular collision footprint is centered one radius above that foot anchor,
so its lower tangent ends at the feet. This same anchor drives depth sorting,
portals, and movement checks.
