# Standalone game preview

Start the developer-only preview from the repository root:

```sh
APP_ENV=dev npm run dev:game-preview
```

Open [http://localhost:5175](http://localhost:5175). The preview validates a
selected `.tar.gz` world package locally and uses the shared game engine. It
does not use the application backend or database and never modifies the active
event. A failed replacement leaves the current world running.

## Controls

- Choose a world package and select **Load package**. **Reload** revalidates
  and reloads the current package.
- Use **Map**, **Spawn**, and **Figure** to choose the scene.
- Expand **Guides and view** to toggle collision, border, spawn, portal,
  occlusion, and grid guides, or **Artwork only** to hide gameplay elements.
- Set zoom to 1×, 2×, or 3×. **Reset camera** returns the scene to the selected
  spawn with the selected view settings.
- Validation findings and asset-loading errors are shown in the page; package
  warnings remain available under **Package warnings**.

The Vite server refuses to start unless `APP_ENV=dev` is set. Its package API
exists only in that development server and exposes files from the selected,
validated package only.
