# Standalone game preview

Start the developer-only preview from the repository root:

```sh
APP_ENV=dev npm run dev:game-preview
```

Open [http://localhost:5175](http://localhost:5175). The preview validates a
selected `.tar.gz` world package locally and uses the shared game engine. It
does not use the application backend or database and never modifies the active
event. A failed replacement leaves the current world running.

To preview a local world package, enter its absolute path in **Local world
package** and select **Preview and watch**. Use the path as seen by the preview
server (for example, `/path/to/world.tar.gz`); no environment variable is needed. The preview watches the
package's containing directory and reloads after in-place edits or atomic file
replacement. A failed read or validation keeps the last valid world running
and displays the error.

## Opening the preview on a phone

The preview listens on `127.0.0.1` only. To try it on a phone, publish it to
your own tailnet with Tailscale, which the devcontainer has installed and starts
in userspace mode (the login is kept in the `zappaloo-tailscale` volume):

```sh
sudo tailscale up --hostname=zappaloo-dev   # once; open the printed login URL
sudo tailscale serve --bg 5175              # HTTPS for your tailnet only
tailscale serve status                      # shows the https://….ts.net URL
PREVIEW_ALLOWED_HOST=<that host name> APP_ENV=dev npm run dev:game-preview
```

HTTPS certificates and MagicDNS must be enabled once in the Tailscale admin
console, and the phone needs the Tailscale app on the same account. Never use
`tailscale funnel`: it publishes to the public internet, and the preview reads
files and starts packages from paths on this machine. Tick **Frame rate and
canvas** under **Guides and view** (or add `?debug=frames`) to see the frame
rate on the phone.

## Controls

- Choose a world package and select **Load package**. **Reload** revalidates
  and reloads the current package.
- Or enter an absolute path under **Local world package** and select
  **Preview and watch**. **Stop watching** leaves the current preview running.
- Use **Map**, **Spawn**, and **Figure** to choose the scene.
- A package of format version 3 shows its atmosphere too: the fog along the borders, the cloud shadows and, every 20 to 60 seconds, the bird (the preview loads `ambient/bird/` from the local package). The map properties `clouds`, `birds` and `fog` turn them off per map.
- The preview has no guests, so it shows two sample figures with made-up names (`Guest 1`, …) in the wander areas of every map that has one; they check the areas and their collisions (PRES-02). Some carry a made-up greeting, badge and line, so the speech bubbles can be checked too (no photos: the initials).
- Expand **Guides and view** to toggle collision, border, spawn, portal,
  and grid guides, or **Artwork only** to hide gameplay elements.
- Set zoom to 1×, 2×, or 3×. **Reset camera** returns the scene to the selected
  spawn with the selected view settings.
- Validation findings and asset-loading errors are shown in the page; package
  warnings remain available under **Package warnings**.

The Vite server refuses to start unless `APP_ENV=dev` is set. Its package API
exists only in that development server and exposes files from the selected,
validated package only.

## World-package and engine integration

The integration contract is specified in [spec/sw-architecture.md](../spec/sw-architecture.md),
section 14. World packages use the documented Tiled-compatible JSON format,
validated by the backend before the shared Phaser 4.2.1 engine loads them.
Zappaloo does not ship or invoke the Tiled executable; authoring and package
export happen outside this repository. The application and this preview use
the same engine; see
[game-engine/README.md](../game-engine/README.md) for the code boundaries.

Author visible tile layers in draw order: ground layers first, one top-down
`Props` object layer for static tile objects, then foreground/canopy layers.
Phaser renders tile layers and tile objects natively; props sort by their
bottom edges and actors by their feet. An image-collection tile's
`occlusion` polyline lets an actor pass behind or in front of that intact prop.
Use bottom-aligned, unscaled tile objects and zero tileset offsets. Tile-image
`collision` and `trigger` guides remain gameplay data; `occlusion` guides drive
actor depth, without splitting artwork or adding pixel masks.

The engine's player position is the visible feet (GAME-02): each frame is drawn
3 px left and 10 px down from it. The collision footprint is an ellipse centred
2 px left of the feet with radii 0.1 and 0.05 tile widths, so it does not extend
below the feet. This same point drives depth sorting, portals, and movement
checks.
