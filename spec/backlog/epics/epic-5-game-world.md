# Epic 5 – Game World and World Importer

| Status | Release | Depends on | Branch |
|---|---|---|---|
| done | World pilot (v2.0.0) | 4 | `feature/stage-5` (PR #9), `feature/stage-5-world-v2` (PR #10) |

[Roadmap](../roadmap.md) · [How we work on epics](../README.md)

## Refinement

Refined 2026-11-14 with the project owner, before the stage started. Branch `feature/stage-5`. Changed 2026-11-15 to world format 2 (isometric maps, complete figures; see "Format version 2" below); from step 5d.1 on, branch `feature/stage-5-world-v2`.

**Before the epic starts:**
- The layout of the world package is defined and confirmed (sw-architecture.md 14.4). A draft was agreed on 2026-11-14 (below); step 5a writes it into the spec.
- A first world package of the project owner, with maps drawn in Tiled, is needed for the Opening (since 2026-11-19: the Living-world pilot), not for building the steps. Steps 5b to 5k use a test world that a script generates.

**Decisions from the plan review (2026-11-14):**
- **Importer first, then the engine.** The validator, the import and the admin card come before the rendering. The engine is built against the generated test world.
- **Maps are not linked to program items** (changed 2026-11-14 in step 5a, replacing the link in "Erlebniswelt" first agreed): the game world and the schedule are different things. The Tiled map property `programItem` is dropped (MAP-03, 14.2). Each guest's figure walks on one map, picked at random and kept for that guest (PRES-02, 3.6, stage 6). WEB-08 ("Hingehen" from the programme) is withdrawn.
- **Dialogues** belong to the game world. Admins edit them in "Erlebniswelt", tab "Dialoge", not in Inhalte. A dialogue cannot be deleted while an object shows it; its id can be changed (decided 2026-11-14, mock Q63, Q64).
- **Only admins** use "Erlebniswelt" (import, rollback, object actions, dialogues; decided 2026-11-14).
- **No locked maps or zones in stage 5.** Objects with `type = protected` are accepted by the validator and do nothing yet. ACS-07 for maps means: sign-in and an open platform are checked when the world is served. The admin page for manual releases (ACS-05) moves to the first feature that stores access conditions, the treasure hunt (HUNT-05, stage 8).
- ~~**Avatar assets** are layered sprite sheets per part (body, hair, clothing, accessory), drawn in greyscale and tinted from the palettes named in `avatar/avatar.json`.~~ Replaced 2026-11-15 by complete figures (format version 2, below).
- **Partially implemented after stage 5** (test-strategy.md, section 5): GAME-13 without the step "Say hello" (profile photo, greeting, "How I know the couple"), which follows in stage 6; GAME-14 without "Hochladen", which follows in stage 7; GAME-06 without the minigame action, which follows in stage 8. Until then "Erlebniswelt" offers no minigame, and a preset `action = minigame` is reported as a warning.
- **Actions of a clickable object:** `page` opens a full overlay, either a built-in page (`programme`, `rsvp`, `profile`; later stages add theirs) or a content page as `p/<slug>`. ~~`content` shows the text of the content page named by `contentId` (its slug) in a small reading panel, e.g. for a sign.~~ A content page is linked as a page and opens as `p/<slug>` (step 5f, decided 2026-11-17). ~~`dialog` shows a dialogue: a new kind of content item with an NPC name and lines the guest taps through, edited in "Erlebniswelt" and referenced by `contentId`.~~ The action `dialog` comes with step 6d (decided 2026-11-17).
- **Without an active world or with guest access disabled,** a signed-in guest of an open platform lands on the website and has no guest entry point to the Erlebniswelt; the door scene still comes from the data volume (10.4).
- **Guest access** (MAP-19): the admin controls it in Erlebniswelt › Welt & Import. It is enabled automatically on the first successful world import. Disabling it hides guest entry points and blocks direct guest navigation and world-serving routes without removing the active package or the admin's management access.
- **Where a player enters:** the last map is remembered on the device. Otherwise, and when that map no longer exists, the player enters the start map at its spawn point `start`. A portal leads to its `targetSpawn`.

~~**Draft layout of the world package, format version 1** (agreed 2026-11-14; the complete layout, rules and limits are in sw-architecture.md 14.4 since step 5a):~~ Struck through 2026-11-17: format version 1 was never released as a format of its own, and format version 2 replaces it (sw-architecture.md 14.4). The text below is the history of that draft.

```text
world.tar.gz
  manifest.json   { "kind": "zappaloo-world", "formatVersion": 1, "name", "startMap", "tileSize": 16 }
  maps/<id>.json  Tiled JSON: orthogonal, tilesets embedded, at least the spawn point "start"
  tilesets/*.png
  avatar/avatar.json, avatar/*.png
  door/door.json, door/door.png, door/door-glimpse.png   optional, the format of 10.4
```

- Tile layers are drawn in order; layers whose name starts with `above` are drawn over the avatars.
- Collisions come from the tile layer `collision` (every tile blocks) and from optional rectangles with `type = collision`.
- Object types: `spawn`, `portal`, `clickable`, `decoration`, `seat`, `wander`, `protected`.
- Limits around 40 MB packed and 100 MB unpacked; fixed in step 5a.

**Format version 2** (decided 2026-11-15 with the project owner; replaces format version 1, which shipped only in `v1.3.0-rc.1` and never in a final release). The world project drew a first **prototype world**: isometric, with complete figures made in PixelLab instead of tinted parts. Its package and the world project's notes were the reference for step 5d.1: the package (`.tar.gz`) and the notes (`.md`) in the local, ignored `world/` folder. The native-first rendering contract below is authoritative and supersedes the earlier prototype alignment, scaling, offset and occlusion choices.

- **Only version 2.** The platform reads `formatVersion: 2` only. Format version 1 and its avatar parts are removed from code, schemas and spec, not kept alongside.
- **Isometric only.** Maps have `orientation = isometric`; orthogonal maps are refused. The manifest names `tileWidth` and `tileHeight` instead of `tileSize` (the prototype: 64 × 32), and every map and sheet tileset uses them.
- **Maps.**
  - Group layers are allowed and read recursively, in the order of the file.
  - Image-collection tilesets (one PNG per tile, tile ids with gaps, a size per tile) are allowed next to sheet tilesets. Every image is a PNG in `tilesets/`, named relative to the map.
  - The native-first rendering contract uses bottom-aligned, natural-size tile objects and zero tileset offsets. Scaling, other alignments and non-zero offsets are refused (finalized in step 5e.6).
  - A hidden layer is not drawn, but its gameplay objects still apply (the prototype's border layer is hidden in Tiled).
- **Collisions.**
  - The tile layer `collision` stays: every tile blocks.
  - Objects with `type = collision` may be rectangles or polygons.
  - Collision polygons drawn on a tile image in Tiled's collision editor (objects named `collision` in the tile's `objectgroup`) block too. They translate with each placed tile object.
  - New type **`border`**: a closed polygon whose outline blocks in both directions; its inside stays walkable.
- **Draw order.** The standard Ground → Props → Foreground layer order puts ground behind depth-sorted props and actors, and foreground tile layers over both. Objects sort by their bottom edge and actors by their feet; an image-local `occlusion` polyline places an actor behind or in front of an intact object at its authored front edge. This replaces the rule for tile layers named `above…`. New requirement GAME-19.
- **Properties.**
  - Properties on tiles in the tilesets are ignored (the world project uses `category`, `symbol`, `text`, `direction`, `name`).
  - The map property `cameraZoom` is fixed at 2 and is not read from the map (decided 2026-11-15 with the project owner).
  - Other unknown properties stay warnings (e.g. the prototype's `previewFormat`).
- **Names** stay required for spawn points, portals and clickable objects (1–40 characters of `a–z 0–9 -`), because the assignments in "Erlebniswelt" are keyed by name.
- **Portals.**
  - Targets stay in Tiled (`targetMap`, `targetSpawn`). MAP-07 stays withdrawn.
  - Changed 2026-11-16: a portal is a tile object (its arrow, which floats); its trigger area is the polygon `trigger` in the tile's object group, like the collision polygons of buildings. Walking into it takes the player through; tapping it walks the player into it. The former property `marker` is gone.
  - A portal without `targetMap` and `targetSpawn` is a warning and does nothing, so a world with one map imports. A target that is given but missing in the package stays an error (MAP-06).
- **Figures instead of avatar parts.** The avatar editor only chooses a complete figure. There is no skin colour, hairstyle, clothing, colour or template anymore.
  - `avatar/figures.json`: `{ "figures": [{ "id", "label"?, "metadata" }] }`. `id` is 1–40 characters of `a–z 0–9 -`, unique. `label` is optional and is the name the editor shows; without it, the editor shows no name. `metadata` is the path of the figure's PixelLab metadata, relative to `figures.json`.
  - The **PixelLab metadata** (`metadata.json`) and its frames are included unchanged; frame paths are relative to the figure's folder. The validator relies only on: the first entry of `states`; its `character.size` (`width`, `height`); `frames.rotations` with `south`, `west`, `east` and `north`; `frames.animations.walking` with the same four directions and the same number of frames each (1–16). Every listed frame is a PNG of exactly that size inside the figure's folder. All other fields are ignored, which is an exception to the rule that unknown fields are refused.
  - Every PNG in `avatar/` is named by a figure's metadata.
  - Game side, not in the package: the rotation image is the standing pose, the walk frames play in the order listed at 8 frames per second, and the figure faces the nearest of its four directions on screen.
  - The stored avatar is `{ "figure": "<id>" }`; an id that the active world no longer has falls back to the first figure. Companions choose a figure the same way.
  - The limits: at most 50 figures per world (decided 2026-11-15); the frame size and the tile size are proposed in step 5d.1 and await the project owner's confirmation.
- **Limits.** At most **3000 files** per package (was 500). The other limits stay: 40 MB packed, 100 MB unpacked, 5 MB per JSON file, 8 MB and 4096 × 4096 pixels per PNG.
- **Door scene** unchanged (`door/`, optional).

## Stories

### Story 5a – Spec and mocks

(no code). Done.
- Section 14.4 gets the layout of format version 1: files, fields of `manifest.json` and `avatar.json`, the Tiled rules, the validator's rules and limits.
- Mocks: `admin-world` tab "Karten & Import" becomes "Welt & Import", the importer of one whole package (active world with name, import time, maps and start map; import with findings and warnings; rollback). A tab "Dialoge" in `admin-world`. The game bar without "Hochladen". The first entry with the avatar step only. "Hingehen" removed (WEB-08 withdrawn).

### Story 5b – Validator and test world

Done 2026-11-14 (decisions of the step in sw-architecture.md 14.4).
- The package reader (gzip and tar, limits, paths; shared with the theme package), `manifest.json`, the Tiled checks per map (format, orientation, embedded tilesets, referenced images, layers, spawn points), portal targets inside the package, the door scene, the avatar assets. Returns all findings. One test per validator rule with a broken package.
- A script builds the test world (two or three maps with generated placeholder tiles, avatar parts and objects of every type) for the tests and for development.
- Checking a package outside the platform (decided 2026-11-14; 19.7, 14.4): JSON Schemas generated from the Zod schemas, theme first, then world (manifest, avatar, maps), committed in `schemas/` with a test that fails when they differ; attached to every release. The CLI command `zappaloo validate <file>` for both kinds of package, with `--json` and exit code 0 or 1, tested with the test world and the example theme.
Requirements: MAP-06, MAP-16, MAP-17, THM-07.

### Story 5c – Import, rollback and serving

Done 2026-11-14 (decisions of the step in sw-architecture.md 14.4).
- Import and rollback routes, the table of the active and the previous world (migration), a folder per import, audit entries on the card "Zuletzt". A refused package leaves the active world unchanged.
- Warnings for presets that point to a missing page or content item, and for minigame presets.
- The world (manifest, maps, tilesets, avatar assets) is served with a version in the URL, so a new world is loaded on the next map entry. Sign-in and an open platform are checked.
- The waiting page takes its door scene from the active world; without one, from the data volume.
Requirements: MAP-01, MAP-04, MAP-08, MAP-09, MAP-10.
Follow-up from stage 2: map loading checked on the server, with `[ACS-07]` tests.
Re-verified: ACS-12.

### Story 5d – Erlebniswelt › Welt & Import

Done 2026-11-14: the page with the import tab only (Objekte & Portale came with 5f; the tab Dialoge comes with 6d), no template-world import action, per-map counts in the admin status. Resolved 2026-11-17: the mock's map names come from the optional map property `name` (14.4). Mock screen: `admin-world` (variant "import").
- The admin card: the active world with its maps, import with findings and warnings, rollback to the previous world, admins only.
Requirements: MAP-05.

### Story 5d.1 – World format 2

Done 2026-11-15 (inserted 2026-11-15; details below 5d). The decisions are in sw-architecture.md 14.4 ("Decisions of step 5d.1"); the frame and tile-size limits await the project owner's confirmation. Mock screens: `onboard-avatar`, `admin-world` (variant "import"). Branch `feature/stage-5-world-v2`. Implements the decisions in "Format version 2" above; replaces what 5a–5d built for format version 1. No rendering yet (5e).
- **Spec** (sw-architecture.md):
  - 14.1, 14.2, 14.4 and 14.5 rewritten for format version 2: layout, manifest, map rules, object types (with `border`), collisions, portal triggers, figures with the PixelLab metadata, validator rules, errors and warnings, limits. The final native rendering contract is recorded in 5e.6.
  - 7.3: the avatar editor chooses a complete figure.
  - Section 3 says the world is isometric.
  - Fix two contradictions found 2026-11-14: 4.1 starts a minigame through a *portal* (it is a clickable object, as in 14.2 and MG-11), and 14.2 says dialogues are edited in *Inhalte* (they are edited in "Erlebniswelt", as in 14.4).
  - Requirements reworded, marked "(reworded 2026-11-15)": AVA-01, AVA-02 (figure), MAP-02 (group layers, image collections, polygons, `border`), MAP-03 (properties, `cameraZoom`), MAP-16 (figures instead of avatar editor assets), GAME-02 (polygon collisions, borders), GAME-05, GAME-15 and GAME-16 (portal trigger areas and arrows). GAME-19's native layer-depth convention is finalized in 5e.6.
- **Mocks:** `onboard-avatar` becomes a figure picker: a grid of the figures with their labels, a walking preview of the chosen one, a tab for the guest and each approved companion. `admin-world` shows the tile size as width × height. UX decisions in `spec/mocks/README.md`.
- **Code:**
  - `shared`: the package definition `world-v1.ts` becomes `world-v2.ts`; `WORLD_FORMAT_VERSIONS = [2]`; the manifest, figure and map schemas and the limits in `shared/src/world.ts`; `GET /api/world` returns tile width and height and the figures.
  - `backend/src/world/`: the map checks (`maps.ts`: isometric, group layers, image collections, bottom alignment and natural-size tile objects, zero offsets, collision and trigger guides, `border`, polygon `collision`, portals and optional targets, `cameraZoom`, tile properties ignored), `avatar.ts` replaced by the figure checks, the limits, `summary.ts`, the import and the storage of the figure list (the column `world_packages.avatar` holds it; a migration only if the column is renamed).
  - Serving: the avatar files sit in a folder per figure; `backend/src/api/world.ts` serves only flat folders today.
  - The test world generator (`backend/src/world/build.ts`): an isometric world of two maps with group layers, a sheet and an image-collection tileset, tile collision polygons, a `border`, a portal with a trigger area, a portal without a target, and two figures in the PixelLab layout with generated frames.
  - `npm run schemas` regenerates the JSON Schemas and the format document; `zappaloo validate` reads format 2.
  - The admin page (`frontend/src/admin/AdminWorldPage.tsx`) and its tests show tile width × height.
- **Ask the project owner before building:** what happens to a format-1 world already imported in a dev or staging installation (recommendation: a migration removes format-1 rows, the admin imports again); the range and default of `cameraZoom`; the limits for figures.
- **Tests:** one validator test per new or changed rule with a broken package; the tests of MAP-06, MAP-16 and MAP-17 rewritten for format 2. Run `npm run cli -- validate world/<package>.tar.gz` on the prototype and list its findings in the step report. The original prototype is expected to be refused: its manifest has `tileSize` instead of `tileWidth` and `tileHeight`, `figures.json` has no labels (allowed, but worth noting), and its portal is an unnamed tile object without a trigger area. These findings go back to the world project; the platform does not loosen its rules for them.
Requirements: MAP-06, MAP-16, MAP-17 (re-verified with format 2).

### Story 5e – Shared game engine and world-package integration

Done (2026-11-17).

The project owner confirms that the world renders correctly and that the world-integration risks and acceptance criteria formerly listed under 5e.1–5e.8 are resolved. Those substeps and their acceptance gates are retired; the requirement-tagged automated tests remain regression coverage.

- The application and standalone preview load world packages through the shared `game-engine/` workspace.
- The engine renders package maps, layers and objects; handles depth, collision, movement, pathfinding and portals; and exposes the development guides needed to inspect world behavior.
- The standalone preview validates uploaded or locally watched packages. Invalid replacements preserve the last working preview.

Requirements: GAME-01, GAME-02, GAME-03, GAME-07, GAME-09, GAME-10, GAME-19, GAME-20, MAP-02, MAP-06, MAP-16, MAP-17, MAP-18.
Exit: the shared engine and world-package integration are accepted; step 5f may begin. Step 9c (moved from 5j on 2026-11-17) owns the sign-in-to-playable loading budget.

### Story 5f – Objects and overlays

Done (2026-11-17). Decisions: sw-architecture.md 14.4 "Decisions of step 5f". Mock screens: `game`, `game-overlay`, `admin-world` (variant "objects").
- Object types `portal`, `clickable`, `decoration` and the properties of 14.2. Clickable objects sparkle along their edges at random (small sparkles, up to five at a time) and a shine passes over them now and then; a portal's arrow floats up and down above a shadow, like a boat on waves, and glows. A click or tap on a clickable object walks to the approach point and runs the action; a tap on a portal walks into its trigger area; Enter or Space activates the object in front of the avatar. Easter eggs.
- Pages as overlays above the paused game; closing returns to the same position; links inside stay in the overlay.
- Erlebniswelt › Objekte & Portale: assign each clickable object's action per map (page including content pages, none; dialogues in 6d); portals read-only.
Requirements: GAME-04, GAME-05, GAME-06 (without minigames), GAME-08, GAME-11, GAME-15, GAME-16, MAP-03, MAP-15.

### Story 5g – Dropped (decided 2026-11-17)

Dialogues moved to step 6d, and a content page is linked to a clickable object as a page (`p/<slug>`) that opens in the page overlay of 5f, so there is no separate content action and no reading panel. CNT-03 is covered by 5f for content pages; its dialogue part completes in 6d.

### Story 5h – Avatar editor

Done 2026-11-17. Mock screen: `onboard-avatar`. Decisions: sw-architecture.md 14.4 ("Decisions of step 5h").
- The world package: a mandatory `tier` and a mandatory `type` per figure (breaking change of format version 2), checked by the validator, in the JSON Schema and the test world.
- The editor chooses first the kind (male, female, child, other; only kinds with a figure the user may choose), then a figure of that kind: a grid with labels, a walking preview, and "Zufällig" within the kind. Tabs for the guest and each approved companion; "Weiter" waits until every person has a figure.
- The tiers decide which figures a user may choose (vip tier1, staff tier2, admin tier3, companions tier1), checked on the server.
- The chosen figure is stored with the membership (companions with their record); the fallback to the first figure the person may choose.
- The same editor is reached from the profile. The game shows the player's own avatar.
Requirements: AVA-01, AVA-02, AVA-03.

### Story 5i – Entering the game

Done 2026-11-17. Decisions: sw-architecture.md 14.4 "Decisions of step 5i". Mock screens: `game`, `onboard-avatar`, `home`.
- With an active world, a signed-in user of an open platform lands in the game; direct links open their target. "Website" in the bar returns to the website; "Erlebniswelt betreten" on the start page.
- The guided first entry: avatar (also for companions), the RSVP in an overlay if not answered, then free play.
- The bar at the top with Programm, Rückmeldung (badge while the RSVP is open) and Website. The hint "Tippe auf Dinge, die funkeln" until the first object is used. The own avatar opens the profile.
- Size (added 2026-11-17): the game fills a phone's viewport and is a centred window of at most 1280 × 800 pixels on a wide screen.
Requirements: GAME-12, GAME-13 (without "Say hello"), GAME-14 (without "Hochladen"), GAME-17, GAME-18, GAME-21.

### Story 5j – Moved to step 9c (decided 2026-11-17)

The loading-time test and the size budget wait until a release shows whether the game works at all on devices. PERF-04 stays on the "not yet implemented" list until then.

### Story 5k – Erlebniswelt access and stage report

Done (2026-11-17). Decisions: sw-architecture.md 14.4 "Decisions of step 5k".
- Do not create or ship a template world.
- Add an admin switch in Erlebniswelt › Welt & Import to disable or re-enable guest access. Guest access starts enabled on the first successful world import. When disabled, guest entry points and direct guest navigation are unavailable and guest world-serving routes are blocked; the active package and admin management remain available.
- Status report for stage 5.
Requirements: MAP-19.

### Story 5l – Review findings (added 2026-11-17)

A review of stage 5 (completeness, consistency, code quality, design decisions, security) after the status report. The world-package contract itself stands; this step fixes the defects found around it. Work packages 5l.1 – 5l.9 can be done and committed one by one, in this order. Line numbers refer to commit `dff93cc` and may have moved; find the place by the function or text named.

*How to work on this step (for whoever implements it):*
- The rules of CLAUDE.md apply: branch `feature/stage-5-world-v2`, clean working tree before each package, no commits (the project owner commits), stop after each package with a short summary.
- Tests: run only the tests of the files you changed (`npx vitest run <path>`, `npx playwright test e2e/<file> --project=desktop-chromium -g "<ID>"`), then `npm run lint` and `npm run typecheck`. The full suites and `npm run req-report` run once, in 5l.9.
- Every new test names its requirement IDs in the title (given per package below).
- Do not change the world-package format beyond what a package says. If a fix seems to need a format or UX change not described here, stop and ask.
- Never read, quote or commit anything from the ignored `world/` folder.

*Decisions of the review (2026-11-17, with the project owner):*
1. **Object actions survive an import.** An import no longer deletes the assigned actions (`world_object_actions`) of objects the new package lacks; they stay, are reported as unmatched, and apply again after a rollback or when a later package has the object again (5l.6).
2. **Figure fallback for staff and admins.** When a user's role tiers give no figure (e.g. a staff-only user in a world without `tier2` figures), the user chooses from `tier1` (5l.6).
3. **Direct links from emails stay as they are.** `/rsvp` is a full-screen page outside the website layout and does not set the website flag; finishing the RSVP opened from the reminder email (`<url>/rsvp`) therefore leads into the game, like any arrival at `/`. Written into 14.4 "Decisions of step 5i" (5l.8).
4. **Confirmed:** "Erlebniswelt betreten" also shows on the event-day start page (above the shortcuts); staff reach the world while guest access is off, like admins. The "Confirm" entries in the stage 5 report are closed (5l.8).

#### Story 5l.1 – Path traversal in the world file route (security, high)

- *Problem:* `GET /api/world/:importId/*` reads any `.json` or `.png` the server process can read. `SERVED_FILE` (`backend/src/world/service.ts:90`) allows `..` as a folder name in the avatar branch (`[A-Za-z0-9._-]+\/`), and `file()` (`service.ts:378`) does `readFileSync(join(this.directory, importId, path))`, which resolves the `..`. Fastify passes raw `../` and the encodings `..%2F`, `%2e%2e/`, `%2e%2e%2f` through to the wildcard parameter. Any signed-in guest knows the import id (`version` of `GET /api/world`). Introduced in stage 5 (on `main` the avatar branch allowed one segment only).
- *Fix (all three):*
  - In `file()`, return `undefined` unless `isSafePath(path)` (`backend/src/packages/archive.ts:49`) is true.
  - In `file()`, compute `root = resolve(this.directory, importId)` and `full = resolve(root, path)`; return `undefined` unless `full.startsWith(root + sep)`.
  - In `SERVED_FILE`, let every avatar path segment start with a letter or digit: `[A-Za-z0-9][A-Za-z0-9._-]*`.
- *Tests* (`backend/src/api/world.test.ts`, title `[ACS-07][MAP-10] …`): `GET /api/world/<version>/avatar/..%2F..%2F<x>.json` and `…/avatar/%2e%2e%2f%2e%2e%2fmanifest.json` answer 404, while a real figure frame still answers 200. (`app.inject` normalises a raw `../` before routing, so only encoded forms can be tested this way.) A unit test of `WorldService.file()` with `avatar/../../manifest.json` returning `undefined`.
- *Done when:* the tests pass; no other world route changed.
- *Suggested commit message:* `fix: Serve only the files of the world package from the world file route`

#### Story 5l.2 – Validator: sheet tilesets with per-tile data; served file names (contract, medium)

- *Problem A:* `checkTilesets` in `backend/src/world/maps.ts:540` treats every tileset with a `tiles` array as an image collection. Tiled writes `tiles` into a normal sheet tileset as soon as one tile has a property, class, probability, animation or collision shape, so a valid sheet is refused with misleading findings ("tile 1 has the image undefined", "the tile id 1 is in no tileset"). The engine has the same branch (`game-engine/src/map-model.ts:148`, `tileSources`). 14.2 says properties on tiles are ignored.
- *Fix A:*
  - Validator and engine: a tileset is an image collection when it has no `image` and has `tiles`; a tileset with an `image` is a sheet, whether or not it has `tiles`.
  - For a sheet, per-tile properties, class, probability and animation are ignored (no finding).
  - A sheet tile with guides (`objectgroup` objects named `collision`, `trigger` or `occlusion`) is refused with `map_guide`: "guides on a tile of a sheet tileset are not supported; put the tile in an image-collection tileset". The engine reads guides only from collection tiles; ignoring them silently would make walls walkable. (Recommendation of the review; the project owner may change it to a warning.)
  - Remove the then-dead condition `tileset.image === undefined` in `checkTileGuides` (`maps.ts:756`) only if it really became dead.
- *Problem B:* collection tiles may omit `imagewidth`/`imageheight`. The validator measures the PNG, the engine falls back to the tileset's `tilewidth`/`tileheight` (`map-model.ts:158`), so both can disagree.
- *Fix B:* refuse a collection tile without `imagewidth` and `imageheight` (`map_tileset`), and refuse it when they differ from the PNG's real size. Tiled always writes them, so real packages are not affected.
- *Problem C:* the package layout accepts any character in figure frame paths (`shared/src/packages/world-v2.ts`, `avatar/{figure}/{frame}.png`), but `SERVED_FILE` only serves `[A-Za-z0-9._-]`. A frame named `frame 0.png` imports and then answers 404 in the game. A figure frame may also name a non-PNG file in its folder (`backend/src/world/figures.ts:165`: when `images.get(path)` is undefined, no check runs).
- *Fix C:*
  - Export one segment pattern from `shared/src/world.ts` (e.g. `WORLD_FILE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/`) and use it in `SERVED_FILE` (5l.1) and in the figure checks.
  - Refuse a frame path with another segment, or not ending in `.png`, with `figure_frame`.
- *Tests* (`backend/src/world/validate.test.ts`, one test per rule with a broken or edge package, titles `[MAP-06][MAP-16] …`):
  - a sheet tileset with `tiles: [{ id: 1, properties: [...] }]` is accepted;
  - a sheet tile with a `collision` guide is refused with `map_guide`;
  - a collection tile without `imagewidth` is refused;
  - a frame `frame 0.png` is refused;
  - a frame `metadata.json` is refused.
  - In `game-engine/src/map-model.test.ts` (`[GAME-20] …`), a sheet with per-tile properties resolves its tiles from the sheet.
- *After the change:* `npm run schemas` (if a schema or the format document changes) and `npm run build:test-world` still work; `scripts/schemas/schemas.test.ts` passes.
- *Suggested commit message:* `fix: Accept sheet tilesets with tile properties from Tiled`

#### Story 5l.3 – Game engine: pause before the scene runs; keys outside the game (high)

- *Problem A:* `setGamePaused` (`game-engine/src/engine.ts:56`) does nothing while the scene does not exist yet or is still loading. `GameCanvas` (`frontend/src/game/GameCanvas.tsx:115`) calls it right after `createGame` and never again unless `paused` changes. On the guided first entry the RSVP overlay opens before the game has started, so the game runs under the overlay: keys go to the game, the avatar walks, and Enter can activate an object behind the form.
- *Fix A:* the engine remembers the wanted state.
  - `setGamePaused` stores it in the game registry (a new key next to `ENGINE_CONFIG_REGISTRY_KEY` in `host.ts`) and applies it at once only when the scene is running (`scene.sys.isActive()` or `scene.sys.isPaused()`).
  - `WorldScene.create()` reads the stored state at its end and calls `setPaused(true)` when it is set. This also covers a restart of the scene after a portal.
- *Problem B:* Phaser's global key capture (`GameScene.ts:712–727`; `createCursorKeys`, `addKey`) calls `preventDefault` for the arrow keys, W/A/S/D, Space and Enter on the whole window. While the game runs, Enter and Space on a focused button of the game bar do nothing, and in the game preview typing a path into the input loses every w, a, s, d and space.
- *Fix B:*
  - Add a helper `isTypingTarget(element)` in the engine: true for `input`, `textarea`, `select`, `button`, `a[href]`, `[contenteditable]`.
  - Create the keys without capture (`addKey(code, false)`; build the four arrow keys with `addKey` instead of `createCursorKeys`).
  - Register one `keydown` listener on `window` that calls `preventDefault` for the arrow keys and Space only when the scene is running and `document.activeElement` is not a typing target (so the page does not scroll).
  - In `update`, ignore movement and activation keys while `document.activeElement` is a typing target.
  - Remove the listener on scene SHUTDOWN.
  - `setPaused` no longer needs to switch the global capture; keep `resetKeys()`.
- *Problem C:* closing an overlay with Enter on its close button can open the object again in the same keystroke: the overlay closes synchronously, the game resumes, and Phaser sees Enter "just down" on the next frame (`GameScene.ts:299`).
- *Fix C:* in `setPaused(false)` call `resetKeys()` after `resume()` and ignore the activation keys until they have been released once (a flag cleared on the key's `up` event).
- *Tests:*
  - `game-engine/src/*.test.ts` (`[GAME-11] …`): unit test of the stored pause state (call before the scene exists, then the scene's `create` applies it). If Phaser cannot be booted in Vitest, extract the decision into a pure function and test that.
  - `[GAME-09] …`: unit test of `isTypingTarget`.
  - `e2e/game-world.spec.ts` (`[GAME-11][GAME-13] …`): on the first entry with an open RSVP, type "wasd" into the RSVP's first text field; the field holds the text and the player's position (test hook) is unchanged.
  - `[GAME-11] …`: open an object with Enter, close the overlay with Enter on "Schliessen"; the overlay stays closed.
- *Suggested commit message:* `fix: Keep the game paused under the first RSVP and let keys reach buttons and fields`

#### Story 5l.4 – Game engine: tap-to-move and walking (high/medium)

- *Problem A:* tap-to-move ignores borders and thin collision shapes that lie between cell centres. `#tapTo` and `#walkToObject` (`GameScene.ts:743–790`) build a `Grid` whose `walkable(cell)` only tests the player's ellipse at the cell centre; `findPath` (`game-engine/src/pathfinding.ts:78`) never tests the step between two cells. A border drawn along tile edges (the way Tiled snaps it) lies about 14 px from both neighbouring centres on a 64 × 32 tile, while the ellipse radii are 6.4 × 3.2 px, so the path crosses it. The avatar then stops or slides at the border, and a pending object action never runs.
- *Fix A:*
  - Add an optional `passable?: (from: Cell, to: Cell) => boolean` to `Grid`; `findPath` skips a neighbour when `passable` returns false (also for the goal cell).
  - Move the grid construction of `#tapTo` and `#walkToObject` into one function in a new module `game-engine/src/navigation.ts`, e.g. `navigationGrid(map)`:
    - `walkable` is cached per cell for the map;
    - `passable(a, b)` is `clearLine(map.obstacles, centreOf(a), centreOf(b), size.width, 2)` (`game-engine/src/collision.ts:117`).
  - In both callers, before walking, check the segment from the player's position to the first waypoint and from the last cell's centre to the final goal (approach point or portal centre) with `clearLine`. If the first segment is blocked, put the centre of the start cell first; if the last one is blocked, do not walk.
- *Problem B:* a blocked walk can jitter forever. `stepPosition` slides along an obstacle, so `moved` stays true and the path is never cleared (`GameScene.ts:319–325`). Also `walking` only looks at `move.x`.
- *Fix B:*
  - `const walking = !keysHeld && (move.x !== 0 || move.y !== 0);`
  - Add a small pure helper in `game-engine/src/movement.ts` that tracks the distance to the current waypoint: when it has not shrunk by at least 1 px within 500 ms of walking, the walk is stuck. Then clear `#path` and `#pending`.
- *Problem C:* the tap target of a portal is `polygonCentre` (`geometry.ts:110`), the centre of the bounding box. For a concave trigger it can lie outside the polygon.
- *Fix C:* when the centre is outside, use the polygon point that is closest to the centre and inside: the centroid of the triangle of the first vertex and the two neighbouring vertices that lies inside, or else the midpoint of the first edge moved 1 px inwards. Any point inside the trigger is fine.
- *Tests* (`game-engine/src/pathfinding.test.ts`, `navigation.test.ts`, `movement.test.ts`; titles `[GAME-10] …`, `[GAME-02][GAME-10] …`, `[GAME-16] …`):
  - a border along the edge between two cells is never crossed, and the path goes round it;
  - a thin collision rectangle between two cell centres is not crossed;
  - with `passable` blocking every edge out of the start, `findPath` returns `undefined`;
  - the stuck helper reports stuck after 500 ms without progress and not while the distance shrinks;
  - the tap target of an L-shaped trigger lies inside it.
- *Suggested commit message:* `fix: Walk around borders and fences when tapping, and stop when the way is blocked`

#### Story 5l.5 – Page overlay (medium)

- *Problem A:* links written in the Markdown of a content page leave the game. `ContentPage` renders through `renderMarkdown` (`frontend/src/app/markdown.ts`), which outputs plain `<a href>`; the overlay's `MemoryRouter` only handles router links. A link to `/programme` reloads the browser at `/programme`, and the game and its position are lost; a link to another site replaces the game tab. This breaks UX decision 18 and the 5f overlay decision.
- *Fix A:* in `GameOverlay.tsx`, a click handler on the overlay's host element:
  - for a click on an `a[href]` (no modifier key, primary button) whose URL has the app's origin, call `preventDefault` and navigate the overlay's router to the path. The router's `navigate` reaches the handler through a small component inside the `MemoryRouter` that hands `useNavigate()` out by a ref.
  - Paths the overlay does not know show its "not found" page, as today.
  - For a foreign URL, open it with `window.open(url, "_blank", "noopener,noreferrer")` and call `preventDefault`.
- *Problem B:* the overlay creates its own `SessionProvider` and `EventProvider` (`GameOverlay.tsx:57`). Signing out in the overlay's profile only clears the overlay's session, and `ProfilePage` then redirects to `/login`, which the overlay does not know ("page not found"). A changed display name does not reach the app until reload, and each open fetches `/api/session` and `/api/event` again.
- *Fix B:*
  - Read the app's session and event in `GameOverlay` (`useSession()`, `useEvent()`, and the setter context of `frontend/src/app/event.ts`). Render them into the overlay root with `SessionContext.Provider` / `EventContext.Provider` / `SetEventContext.Provider` instead of new providers.
  - Add an overlay route `login` that closes the overlay and navigates the app's router to `/login` (pass a callback `onLeave(path)` from `GamePage`).
- *Problem C:* `OverlayPage` (`GameOverlay.tsx:52`) creates a new React root on the same `<div>` while the old root's unmount is still pending in a `setTimeout`. This happens under StrictMode on every open, and when `page` changes while the overlay is open.
- *Fix C:*
  - Create the root once per mounted `OverlayPage` (in a ref, in a mount effect) and call `root.render(...)` in a second effect whenever page, session or event change. Unmount the deferred root on unmount only.
  - Give `<OverlayPage key={page} …>` so a new page gets a fresh host element.
- *Problem D (accessibility):* the dialog has no focus management.
  - Focus does not move into the sheet on open, Tab reaches the game bar behind it, and focus is not restored on close.
  - Escape is a window listener (`GameOverlay.tsx:87`), so it closes the overlay even while an RSVP field or a `<select>` is in use, and the wizard's input is lost.
- *Fix D:*
  - On open, focus the sheet's heading or close button.
  - Set `inert` on the game window (`.game-window`) while an overlay is open.
  - On close, return focus to the element that had it.
  - Escape closes the overlay only when `event.target` is not an `input`, `textarea` or `select` and `event.defaultPrevented` is false.
- *Problem E (CSS):* the inner `<div className="guest">` inside the overlay root gets `min-height: 100dvh` from `.guest` (`frontend/src/app/ui.css:789`), so every overlay page is at least a screen tall.
- *Fix E:* drop the wrapper `<div className="guest">` (the sheet already has `.guest`) or give it `min-height: 0`. Also give the phone sheet `padding-bottom: env(safe-area-inset-bottom)`, and make the game window rule two-class (`.game-window.guest`), so it does not depend on the order of the stylesheets.
- *Tests* (`frontend/src/game/overlay.test.tsx`, titles `[GAME-11] …`):
  - a Markdown link `[x](/programme)` in a content page opens the programme inside the overlay, and `window.location` is unchanged;
  - a foreign link calls `window.open`;
  - signing out in the overlay closes it and leads to `/login`;
  - the overlay uses the app's session (no second `/api/session` request);
  - focus moves into the sheet and back on close;
  - Escape in a text field does not close the overlay.
  - Render the overlay test once inside `<StrictMode>` and assert no console error.
- *Suggested commit message:* `fix: Keep links, sign-out and keyboard focus inside the page overlay of the game`

#### Story 5l.6 – Decisions 1 and 2, and import robustness (medium)

- *Decision 1, object actions survive an import:*
  - In `importPackage` (`backend/src/world/service.ts:417`), do not delete the rows of objects the new package lacks.
  - Instead delete only rows whose object is in neither the new package nor the world that becomes the previous one (the current active world), so a rollback finds its actions again.
  - Rename the warning code `action_dropped` to `action_unmatched` (`shared/src/packages/codes.ts`, the rule in `shared/src/packages/world-v2.ts:480`, `service.ts:438`, `backend/src/api/world.test.ts:486`) with the message "the object no longer exists; its assigned action is kept and applies again if the object returns".
  - Update 14.4 "Assigned actions" (sw-architecture.md, the bullet starting "**Assigned actions** (MAP-15)") to match.
  - Run `npm run schemas` and keep the regenerated format document.
- *Decision 2, figure fallback:*
  - In `AvatarService` (`backend/src/world/avatar.ts`), when the figures allowed by `tiersOf(user.roles)` are empty, use the `tier1` figures for the user, in every path: the list for "me" (line ~101), the effective figure, and the check on `PUT` (line ~137).
  - Companions stay on `tier1`.
  - Write the rule into 14.4 "Decisions of step 5h" and into 7.3.
  - Remove the unused `figureOf` (`avatar.ts:95`) if nothing uses it.
- *Import robustness:*
  - Imports and rollbacks run one at a time: a promise chain (mutex) in `WorldService` around `importPackage` and `rollback`.
  - Decide which folder to delete from the row the import's transaction actually deletes (read the `previous` row inside the transaction), not from the value read before the files were written (`service.ts:449`, `:511`).
  - `octal()` in `backend/src/packages/archive.ts:38` throws `TarError` instead of `Error`, so a broken tar header answers 422 with `not_tar` instead of 500 (also for the theme package).
  - `GET /api/world` re-reads and re-parses every map on every request (`#overridesOf` → `#objectsOf`, `service.ts:230–250`). Cache the result of `#objectsOf` per `importId` in a `Map` on the service (the files of an import never change).
- *Tests* (`backend/src/api/world.test.ts`, `backend/src/api/avatar.test.ts`, `backend/src/packages/check.test.ts`):
  - `[MAP-09][MAP-15]` import a package without an assigned object, then roll back: the action applies again;
  - `[MAP-15]` the warning `action_unmatched` lists it;
  - `[AVA-01][AVA-02]` a staff-only user in a world without `tier2` figures gets the `tier1` figures and may choose one; a vip-only user still cannot choose a `tier2` figure;
  - `[MAP-09]` an import started while a rollback runs leaves both worlds' folders intact (call both without awaiting the first);
  - `[MAP-06]` a tar with a non-octal size field answers 422.
- *Suggested commit message:* `feat: Keep object actions across imports so a rollback restores them, and give staff a figure in every world`

#### Story 5l.7 – Smaller fixes (low)

Each with a unit test where the behaviour is testable; titles with the requirement ID given.
- `game-engine/src/GameScene.ts:172` – the guide graphics (depth 1 000 000–1 000 003) are hidden under foreground layers (depth ≥ 1 001 000). Put the guides at 2 000 000 and above. `[MAP-18]`
- `GameScene.ts:432` – on a map without visible tile objects, `Math.min()` of an empty list is `Infinity`, and every tile layer, foreground included, is drawn below the player. When there are no tile objects, treat the first tile layer after the last ground layer as the actor layer order (or: all layers after the first object layer are foreground). `[GAME-19]`
- `GameScene.ts:538` – props get depth `feetY + index / 1000`; from the 500th object the tie-break leaves the actor's ±0.5 slot. Use `index / (objects.length + 1) * 0.25`. `[GAME-19]`
- `GameScene.ts:977–1011` – a shine interrupted by a map change leaves its canvas texture `shine:N` in the texture manager. Remove the shine textures on scene SHUTDOWN. `[GAME-15]`
- `GameScene.ts:115` – the own-avatar hit box is the whole sprite frame. Use the figure's opaque bounds or a box of half the frame width around the feet. `[GAME-18]`
- `game-preview/src/App.tsx:106–295` – overlapping loads can show an older package after a newer one. Number each load and drop the result of any load that is not the latest. `[MAP-18]`
- `game-preview/src/server/package-store.ts:260` – the TTL expires the current local snapshot while `status()` still advertises it. Never expire the current snapshot. `[MAP-18]`
- `game-preview` dev server – bind to `127.0.0.1` instead of `0.0.0.0` (`game-preview/package.json` script `dev`, `vite.config.ts`). Make `POST /__game-preview/api/local-package/start` require `Content-Type: application/json`, and refuse it when the `Origin` header is not the preview's own. `[MAP-18]`
- `backend/src/api/world.ts:193` – add `X-Content-Type-Options: nosniff` to served world files, like `content.ts:274`. `[MAP-10]`
- `frontend/src/avatar/figure-art.ts:47` – the figure-art cache key is the fixed string `"world"`, so a new import in the same tab keeps the old art. Key it by the world's `version`. `[AVA-01]`
- `frontend/src/avatar/AvatarEditor.tsx` (each item `[AVA-01]`):
  - `choose` (line ~69) – ignore a choice while a `PUT` is in flight.
  - Line ~54 – a failed `PUT` (e.g. `403 figure_not_allowed`) shows an error next to the grid and keeps the editor, instead of replacing it with "Die Figuren konnten nicht geladen werden".
  - Line ~164 – a figure without a label shows no name (`{figure.label}` only when set), as the UX decision says.
- `frontend/src/game/world-data.ts:21` and `frontend/src/avatar/figure-art.ts:27` – fetch maps and figure metadata in parallel (`Promise.all`). `[GAME-07]`
- `frontend/src/pages/GamePage.tsx:85` – when "Weiter" is pressed before the RSVP state is known, wait for it (disable "Weiter" while `rsvpOpen === undefined` and the RSVP feature is on). Fix the ineffective wait in `frontend/src/game/entry.test.tsx:167`. `[GAME-13]`
- `frontend/src/admin/AdminWorldObjects.tsx:92–106` – disable the select while its `PUT` runs, and use the list the `PUT` answers instead of a second `GET`. Encode the path segments with `encodeURIComponent` (names are `a–z 0–9 -` today; this only hardens). `[MAP-15]`
- `frontend/src/game/GameBar.tsx` / `GameOverlay.tsx`: give "II PAUSIERT" `aria-hidden="true"`, and move the badge's `role="status"` out of the button so the button's name stays "Rückmeldung". `[GAME-14]`
- `backend/src/world/maps.ts:91` – portals accept `label` and `approach`, which neither 14.2 nor the engine uses. Drop them from `PROPERTIES.portal`, so they are reported as `property_unknown` warnings. `[MAP-03]`
- `backend/src/world/validate.ts:108,113` – use `WORLD_LIMITS` in the "larger than 5 MB / 8 MB" messages instead of literals. `[MAP-06]`
- Test hygiene:
  - `e2e/skeleton.spec.ts` "[GAME-12] the game route mounts Phaser…" passes on three different outcomes. Make it assert one outcome, or drop the ID from its title.
  - `e2e/game-world.spec.ts:137–141` – replace the 40 s `toPass` tap retry with a wait for a stable view (two equal camera positions from the test hook), then one tap.
  - Fix the requirement tags that do not match what the test checks:
    - `validate.test.ts:1108` `[MAP-08]` → `[MAP-06]`;
    - `game-engine/src/world-data.test.ts:7` drop `[AVA-02]`;
    - the two `[GAME-02]` animation tests → `[AVA-04]`, and list AVA-04 as partially implemented, see 5l.8;
    - `geometry.test.ts:69` `[GAME-03]` → `[GAME-16]`.

#### Story 5l.8 – Spec and documents (no code)

- `game-engine/README.md` (rendering contract, last bullet) and `game-preview/README.md` (last paragraph) describe a circular footprint centred one radius above the sprite's bottom-centre. Replace with GAME-02's rule: the logical position is the visible feet; each frame is drawn 3 px left and 10 px down from it; the footprint is an ellipse centred 2 px left of the feet with radii 0.1 and 0.05 tile widths. Replace the example path `/workspaces/hz-event-assets/world.tar.gz` in `game-preview/README.md` with `/path/to/world.tar.gz`.
- `spec/sw-architecture.md`:
  - `avatar/avatar.json` → `avatar/figures.json` (the paragraphs on JSON Schemas and `$schema`, around lines 1763 and 1788);
  - remove the duplicated "Door scene" paragraph (around 1736/1738);
  - "the sheet a whole number of frames" → "exactly `frames × frameWidth` wide" (around 1750);
  - remove "from stage 5, optionally the map that represents the place" (around 606) and "optional map" in WEB-07 (around 634), since maps are not linked to program items;
  - remove "Template map set" from section 28 stage 5 (around 3063), the "Template maps" row of section 27 (around 2963) and the sentence in section 29 (around 3148), since MAP-12 – MAP-14 are withdrawn;
  - MAP-08: "a missing page or minigame" → "a missing page, content page, dialogue or minigame";
  - AVA-03: "composed from prepared pixel-art assets" → "chosen from prepared pixel-art figures"; MAP-04, MAP-17: "avatar editor assets" / "avatar definition" → "figures" (mark each "(reworded 2026-11-17)");
  - 14.4: the statement that format version 1 "never shipped in a final release" – v1.3.0 contained it; say that installations that imported a format-1 world lose it with migration `0021` and import again;
  - add decisions 1 – 4 of 5l to the "Decisions of step" bullets they belong to (5f "Assigned actions", 5h, 5i, 5k), and the 5l.2 rule for sheet tiles to the map rules of 14.4;
  - close or list as open the "Decisions of step 5b/5c (for the project owner to confirm)" headings (around 1786, 1797).
- `spec/implementation-plan.md`:
  - line 353 (plan-review decision "Actions of a clickable object"): strike through the `content` reading panel and the stage-5 `dialog`, and point to 5f and 6d;
  - 5f text: "(page, content item, dialogue, none)" → "(page including content pages, none; dialogues in 6d)";
  - fold the duplicated 5b – 5d.1 bodies into one block per step, adding the missing heading "**5b – Validator and test world.**" before the body that ends "Requirements: MAP-06, MAP-16, MAP-17, THM-07";
  - mark 5d's "Open: the mock shows map names" as resolved (map property `name`);
  - add "Done" markers to 5a, 5h and 5i;
  - strike through the format-1 draft block ("Draft layout of the world package, format version 1").
- `spec/test-strategy.md` section 5:
  - CNT-02 and CNT-03 appear both in the "not yet implemented" table and under "Partially implemented"; keep them only under "Partially implemented" (game-world part done, dialogues in 6d);
  - the ACS-05 and ACS-07 lines still name step "5b": ACS-05's manual-release page → step 8d (HUNT-05); ACS-07's "protected game areas" → step 8d too, with a note that stage 5 checks only sign-in, open platform and guest access;
  - list PRES-07 (tagged in `frontend/src/avatar/avatar.test.tsx:120`) and AVA-04 (own avatar done in 5h, wandering figures in stage 6) as partially implemented;
  - add MAP-12 – MAP-14 to the withdrawn list.
- `spec/README.md`: update the topic table (GAME 21 active; total 247 active of 284, 37 withdrawn; MAP and THM "implemented", GAME, AVA, CNT "in progress"; PERF stages "7, 9"); mark the decision row "The project owner draws the template map art (MAP-12)" as superseded; add `game-engine/README.md` to the document index.
- `spec/mocks/README.md` (around 151–152): "Welt & Import lists the maps with their objects and portals" → objects and portals are in the tab "Objekte & Portale"; "Portals with a missing target cannot be imported" → "a portal whose given target is missing cannot be imported; a portal without a target is a warning".
- `CLAUDE.md` command table: add `npm run schemas` (regenerates the JSON Schemas and the format document) and `npm run build:test-world`; add `game-preview/README.md` to the document table.
- Comments: `backend/src/world/build.ts:3` and `scripts/build-test-world.ts:2` ("a polygon portal with its marker") → "a portal tile with its trigger area"; the title of the test at `backend/src/world/validate.test.ts:821` that mentions the "marker property"; `backend/src/database/schema.ts:685` (`maps` holds the map summaries, not ids).
- Stage 5 status report (section 5): remove the two "Confirm" open points (decided, see decision 4); add a line "Review 2026-11-17: findings fixed in step 5l"; correct "39 of 39" to say that it includes THM-07 from step 5b.

#### Story 5l.9 – Verification and report update

- Run the full suites once on the final code, in CI order: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, then `npm run req-report` (not `npm run test:deploy`, which runs on CI only). `reports/vitest.json` is partial after the review's targeted runs, so the full `npm test` is required before the report.
- Update the stage 5 status report: test counts, requirement numbers, and the "Waiting on the project owner" list.
- Open after 5l, unchanged: the game-world end-to-end tests run on desktop Chromium only, and the game has not been tried on real phones. Both wait for the release candidate (status report, "Waiting on the project owner").

Requirements re-verified: ACS-07, AVA-01, AVA-02, GAME-02, GAME-09, GAME-10, GAME-11, GAME-13, GAME-14, GAME-15, GAME-16, GAME-18, GAME-19, GAME-20, MAP-06, MAP-09, MAP-10, MAP-15, MAP-16, MAP-18.

## Report

### Status report (2026-11-17, written after the stage)

An admin imports a whole world package (isometric maps from Tiled, complete figures) in Erlebniswelt › Welt & Import, rolls back to the previous one, assigns the actions of the clickable objects, and switches guest access on and off. Guests who sign in to an open platform land in the game: they choose their avatar (and their companions'), answer the RSVP in an overlay if it is still open, and walk around with the keys or by tapping. Objects sparkle, portals lead on, and website pages open as overlays above the paused game. A bar at the top gives Programm, Rückmeldung and Website, and a tap on the own figure opens the profile. On a phone the game fills the screen; on a wide screen it is a window of at most 1280 × 800 pixels.

**Steps:**
- **5a – Spec and mocks:** done (2026-11-14).
- **5b – Validator and test world:** done. 5c – Import, rollback and serving: done. 5d – Erlebniswelt › Welt & Import: done.
- **5d.1 – World format 2:** done (inserted 2026-11-15). Isometric maps and complete figures replace format version 1.
- **5e – Shared game engine and world-package integration:** done. The project owner confirmed the rendering; the sub-steps 5e.1 – 5e.8 were retired.
- **5f – Objects and overlays:** done. Clickable objects and portals with their effects, actions, page overlays, and the admin's list of objects.
- **5g – Dropped:** dialogues moved to step 6d; a content page is linked to an object as a page.
- **5h – Avatar editor:** done. Kind first, then a figure; tiers by role; companions' tabs.
- **5i – Entering the game:** done. Landing, guided first entry, bar, hint, the own avatar opens the profile, and the size rule (GAME-21, added during the step).
- **5j – Loading time:** moved to step 9c (2026-11-17), so that a release shows first whether the game works on devices. PERF-04 moved to stage 9.
- **5k – Erlebniswelt access and stage report:** done. The switch for guest access (MAP-19), no template world shipped, this report.
- **Changed during the stage:** world format 2 replaced format 1 (2026-11-15); the template world (MAP-12 – MAP-14) was withdrawn (2026-11-17); WEB-08 was withdrawn (2026-11-14); step 5g was dropped and 5j moved (2026-11-17); GAME-21 was added (2026-11-17).

**Requirements:** 39 of 39 planned for this stage (THM-07 from step 5b included), all with passing tests (requirement report; PERF-04 moved to stage 9). GAME-13 (without "Say hello"), GAME-14 (without "Hochladen") and GAME-06 (without the minigame action) are partially implemented, as listed in test-strategy.md, section 5. Overall (requirement report after step 5l, 2026-11-17): 174 of 247 active requirements implemented, 164 with passing tests. The local report shows 11 errors, all in the deployment test (ACC-05, ACC-11, ACC-14, CFG-02, CFG-07, OPS-02, OPS-05, OPS-13, OPS-15, OPS-16, SEC-01): it reads an old result file, because the deployment test runs on CI only. They are to be confirmed on CI; none is from stage 5.

**Tests:**
- Unit, component and integration (Vitest): 1140 tests in 109 files, all passing (`npm test`, run once more before the report).
- End-to-end (Playwright): 87 passed, 57 skipped (the project-specific skips), none failed (`npm run test:e2e`, complete run on the final code). Two tests were made more robust during the closing runs (the tap on the altar retries with a fresh target; the first load of the game waits longer for the Phaser chunk), and the specs of the website and the admin area keep their browser on the website (a world on the shared installation makes `/` lead into the game).
- Deployment test (`npm run test:deploy`): runs on CI only, because it does not work in the devcontainer under WSL (decided 2026-11-17). The local requirement report reads old results of it, and its 11 errors come from them (ACC-05, ACC-11, ACC-14, CFG-02, CFG-07, OPS-02, OPS-05, OPS-13, OPS-15, OPS-16, SEC-01); CI has the current ones.
- Manual checks on a phone: none recorded for stage 5. The game has not been checked on real devices yet.

**Spec changes and deviations:**
- Written into the spec during the stage: 14 (world format, importer, objects), GAME-01 – GAME-21, MAP-01 – MAP-19 (MAP-07, MAP-11 – MAP-14 withdrawn), AVA-01 – AVA-04, the decisions of steps 5b – 5k in sw-architecture.md 14.4, the mocks (`admin-world`, `onboard-avatar`, `game`, `game-overlay`), and the testing policy (test-strategy.md, section 8, and CLAUDE.md).
- Decided in step 5k: "guests" are the users who are neither staff nor admin; the setting lives in `event_settings` under its own name (no migration); the world routes and the avatar routes answer a guest with `403 world_access_disabled` while access is off.
- Decided in step 5i: with a world, `/` leads into the game once per browser session; a figure that a new world no longer has leads to the avatar step again.

**Overall status:**

| Stage | Content | Status |
|---|---|---|
| 1 | Walking skeleton and deployment | done |
| 2 | Accounts, roles and access | done |
| 3 | RSVP and waiting page | done |
| 3.5 | Installable app | done |
| 3.9 | Findings from the Release 1 pilot | done |
| 4 | Content and website | done (CNT-02, CNT-03 finish with the dialogues in step 6d) |
| 5 | Game world and world importer | done |
| 6 | Living world | next |
| 7 | Contributions and event screen | open |
| 8 | Minigames, treasure hunt and highscores | open |
| 9 | Event readiness | open |
| 10 | After the event | open |

**Remaining requirements by stage** (from the requirement report, whole stage numbers): stage 1 → 1; 2 → 0; 3 → 0; 4 → 2 (CNT-02, CNT-03); 5 → 0; 6 → 14; 7 → 30; 8 → 22; 9 → 2 (PERF-01, PERF-04); 10 → 4. In total 75 of 247 active requirements not yet implemented.

**Waiting on the project owner:**
- A first world package with maps drawn in Tiled and figures from PixelLab, for the Opening (since 2026-11-19: the Living-world pilot); the steps used a generated test world.
- A release candidate to check the game on real phones and a computer; that check also tells whether the loading time (step 9c) needs work.
- Confirm the preconditions and steps of stage 6 before it starts.
- **Open points (from stage 5):**
  - The frame and tile-size limits of format 2 (frame sides 8 to 256 pixels, 1 to 16 walk frames, tiles 8 to 128 pixels) were proposed in step 5d.1 and are not confirmed.
  - Review 2026-11-17: findings fixed in step 5l. The two former "Confirm" points are decided (14.4 "Decisions of step 5k"): "Erlebniswelt betreten" is also on the event-day start page, and staff reach the world while guest access is off, like admins.
  - A guest whose figure no longer exists after a new world is led through the avatar step again (confirmed 2026-11-17 for the step; mentioned here for the world update runbook).

**Risks and notes:**
- The loading time of the first map over 4G (PERF-04) is not measured until step 9c.
- The end-to-end tests of the world share one installation; a world makes `/` lead into the game for every browser that has not visited the website, so new specs of the website must use the `test` of `e2e/support.ts`.
- The standalone game preview needs its own port in the end-to-end run; when a preview is running on port 5175, set `ZAPPALOO_GAME_PREVIEW_PORT`.
- The requirement report's stage table reads whole stage numbers only, so 3.5 and 3.9 count under stage 3.
