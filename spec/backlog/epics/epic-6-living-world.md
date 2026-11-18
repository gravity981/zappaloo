# Epic 6 – Living World

| Status | Release | Depends on | Branch |
|---|---|---|---|
| ready | Opening (completes it) | 5 | `feature/epic-6-living-world` |

[Roadmap](../roadmap.md) · [How we work on epics](../README.md)

## Refinement

The world comes alive: the figures of the attending guests wander the maps and introduce themselves in speech bubbles, the table finder shows where everybody sits, NPCs walk their rounds and call out to the player, fountains splash, cloud shadows and birds pass by, and fog at the border tells the player that here the world ends. Refined further on 2026-11-18 with the findings from the prototype world (stories 6e – 6i).

Stories marked **Tiled world project** need changes in the external project that makes the world package (maps, tilesets, figures). Those changes are made there, built into a world package and checked with `zappaloo validate` and the game preview; the story names what the package must contain so that it can be tested.

**Before the epic starts:**
- Seating plan of the first event, at least as test data.
- For 6e – 6h: a world package of format version 3 from the Tiled world project with a border, a bird, an animated fountain and at least one NPC with a path and a wave animation (can be made while 6e – 6g are built; the test world of the repository covers the tests).

**Status ready (2026-11-18):** the project owner confirmed the preconditions: the seating plan is test data, the world package of format version 3 is confirmed, epic 5 is done.

**Decisions** (2026-11-18, with the project owner):
1. **World format version 3.** World format version 2 is released (v2.0.0). NPCs, the tier `npc`, the wave animation, tile animations, the map switches and the bird change the format, so they come as format version 3. The platform keeps reading version 2 packages unchanged (sw-architecture.md 14.4).
2. **Fog** lies along the map's `border` polygon: inside it the view is clear; outside it the fog thickens over about 2 tiles and then covers everything, foreground layers included. A map without a border has no fog.
3. **Cloud shadows** are soft, translucent dark shapes drawn by the engine over the ground and the objects. They all drift from left to right at random heights; each starts outside the map's boundary and disappears when it has crossed the other side.
4. **Birds:** a small flock crosses the view every 20–60 s, above everything. The first iteration has one kind of bird. It comes from the world package with the same file structure as a figure (PixelLab metadata with standing poses and an animation, played at 8 frames per second); without a bird, there are no birds.
5. **Switches:** map properties `clouds`, `birds` and `fog`, each on by default, so an indoor map turns them off. With `prefers-reduced-motion` no clouds or birds move; the fog stays.
6. **Animated tile objects:** Tiled's tile animation (frames from the same tileset, each with a duration) on image-collection tiles, played on tile objects, e.g. the fountain of the prototype world. Tile-layer animation is not supported.
7. **NPCs in Tiled:** a point object with `type = npc` in the gameplay (Props) object layer, a unique name, `figure` (a figure id), optional `label` and optional `path` (the name of a polyline on the same map). The NPC walks the path point by point at the speed of the guest figures with the walk animation, waits 3–8 s at each end and walks back; without a path it stands. NPCs don't block the player.
8. **NPC figures:** a figure with tier `npc` is used only for NPCs and never offered in the avatar editor. A figure can name an extra animation of its PixelLab metadata as its wave (`wave` in `figures.json`, e.g. `"waving"`), checked in all four directions like the walk. A standing NPC plays it once every 8–20 s.
9. **NPCs in "Erlebniswelt":** each map tab lists its NPCs with a name (the Tiled `label` until the admin changes it), the **short dialog** (one line, at most 120 characters) and the action on tap (page, dialogue, minigame or none, as for clickable objects). Stored per map and NPC name, so they survive a new world package while the names stay.
   **Portrait:** a dialogue can have an optional portrait picture, uploaded by the admin in Erlebniswelt › Dialoge, not part of the world package. It is shown on the left of the dialogue box, whichever NPC or object opens the dialogue (CNT-08).
10. **NPC speech bubble:** NPCs want attention, so an NPC's bubble with its short dialog opens from 3 tiles away, further than a guest figure's (its distance is set in 6b). The NPC stops and turns to the player. An NPC without a short dialog shows no bubble.
   **Several bubbles:** bubbles of NPCs and guest figures can be open at the same time. Of bubbles that would overlap, only the nearest figure's is shown, as with the edge indicators. This changes PRES-10, which allowed only the nearest figure's bubble (reworded 2026-11-18).
   **Game preview:** it has no short dialogs, so NPC bubbles are not shown there and are tested in the app only.
11. **Tapping an NPC** walks the player to it and runs its action, like a clickable object. An NPC does not sparkle; it glows only while the player walks to it (GAME-25), and it waits instead of walking on.
12. **Edge indicators** also point to NPCs with an action, labelled with the NPC's name.
13. **Edge indicator labels** show the title of what the object opens: a page's title (Programm, Rückmeldung, Profil, or the content page's title), a dialogue's NPC name, a minigame's name. Without an action, the Tiled `label`, or the name. The game preview has no actions and keeps the label or name.
14. **Labels on objects in sight:** once an object or portal with an edge indicator comes into view, its indicator goes and its label sticks to the top of the object (the same white pill), so the player still sees what it is. Of labels that would overlap, only the nearest is shown.

## Stories

### Story 6a – Wandering figures

**Tiled world project:** wander areas (`type = wander`) on the maps.
Figures of attending guests in the wander areas of one map per guest (picked at random, kept per guest); own avatar instead of own figure; simulated per device.
Decided 2026-11-18 (refinement of 6a):

- **Map pick:** derived, not stored: every device hashes the guest id (`u<user id>`, `c<companion id>`) over the maps that have at least one wander area (sorted by id), so the pick is the same everywhere. No column, no migration; a new world package with other maps may move guests.
- **Behaviour:** a figure walks to a random reachable point inside a wander area with the existing pathfinding and collisions, at a quarter of the player's speed (changed the same day) with the walk animation, waits 3–8 s and repeats. NPCs (6g) walk at the same speed (decision 7: "the speed of the guest figures").
- **Name tag:** the white pill of the edge-indicator labels above the figure's head, with the person's display name.
- **Game preview:** it has no guests, so it shows a few sample figures of the world with made-up names in the wander areas, to check areas and collisions.
- The signed-in user's companions appear as figures; only the user's own figure is replaced by the avatar.
Requirements: PRES-01, PRES-02, PRES-04, PRES-08, AVA-04.

### Story 6b – Profiles

Mock screens: `profile`, `onboard-profile`, `admin-settings` (relation list), `admin-users` (profile section, drawn in this story).
Split on 2026-11-18 (with the project owner): the speech bubble in the game is story 6b2.
- Profile photo, greeting and "How I know the couple" (a list option and a free line) per person, the guest and each approved companion; the profile card "So sehen dich andere" with the bubble preview and the step "Sag hallo" of the first entry (GAME-13).
- **Photo:** processed on the server with `sharp` (sw-architecture.md 25): JPEG, PNG and WebP are accepted (HEIC comes with the contribution pipeline of epic 7: sharp's prebuilt binaries cannot decode it, and a phone's browser converts it to JPEG when it is picked), the picture is cropped to a square, shrunk to 256 px, re-encoded as WebP and stripped of EXIF and GPS data. The pipeline is the one epic 7 reuses. The processed picture (a few kilobytes) is stored as a BLOB in the table `profiles`, so account deletion and backups need no file handling.
- **Limits:** greeting 80 characters, the free line 60. The relation list is edited by the admin in Einstellungen and starts with the six wedding defaults of the mock (Familie Braut, Familie Bräutigam, Freunde Braut, Freunde Bräutigam, Freunde beider, Arbeit).
- **Admin removal** (PRES-14): the account panel in Konten gets a section "Profil" per person with the photo, the greeting and the lines, each with a button to remove it, audited with ids only. The mock `admin-users` gets the section in this story.
Requirements: PRES-09, PRES-13, PRES-14, PRES-15.
Re-verified: GAME-13.

### Story 6b2 – Speech bubble

Mock screen: `game`.
- The speech bubble of a guest figure opens automatically when the player comes close; the figure stops and turns to the player. Several bubbles can be open at once; of bubbles that would overlap, only the nearest figure's is shown (decision 10). A click or tap pins a bubble until it is closed.
Decided 2026-11-18 (refinement of 6b2):

- **Distance:** a guest figure's bubble opens when the player is within 0.8 tile widths (NPCs: 3, story 6h; changed from 2 to 1.5 and then to 0.8 on 2026-11-18 at the project owner's request) and closes when the player is further than 1.1. A guest who wrote no greeting shows the default "Hallo 🙂", which the host supplies in its language (the engine has no words of its own); the profile's preview shows it too.
- **Pinned:** a click or tap on a bubble pins it; the figure keeps standing and the bubble stays open, wherever the player walks, until its cross closes it; the figure then strolls on.
- **Content:** the bubble shows the picture (or the initials), the name, the chosen relation as a badge, the greeting and the free line. `GET /api/world/guests` carries them (greeting, badge, line, version of the photo); the photo is served at `GET /api/world/guests/:key/photo`, signed in and with world access only, for attending guests only.
- **Drawing:** an HTML layer over the canvas like the edge indicators (crisp text, a real button for the cross), placed above the figure's head and kept inside the view.
- **Game preview:** its sample guests carry a made-up greeting and badge, no photo.
Requirements: PRES-10.

### Story 6c – Seating plan and table finder

**Tiled world project:** clickable objects (e.g. the tables) with `action = page`, `page = seating`. The world has no seats.
Mock screens: `admin-seating`, `seating`, `game-table`. Decided 2026-11-18 (refinement of 6c), simplified by the project owner twice: no seat placement and no wayfinding in the game, and no seats or tables in the game world at all.
- **Tables:** made by the admin in the Sitzplan, each with a name and a number of places. Only the table counts, not where at a table somebody sits (that is managed outside Zappaloo). The server refuses more persons than places (`409 table_full`); a deleted table leaves its persons without a table.
- **Seating plan** (Sitzplan, new admin page): persons who attend (guests and approved companions) are placed on tables by drag and drop, or by tapping a person and then a table for touch screens; a companion follows the guest's table until the admin places them elsewhere; the date from which guests see the plan is set on the page (without a date the plan stays hidden).
- **Table finder:** the page `seating` ("Wo sitze ich?"): the guest's table (name, places) and the tablemates with photo, greeting and badge, no seat. It is a built-in page like `programme`, `rsvp` and `profile`: clickable objects can open it (Tiled preset or the admin's assignment) and the website has `/seating` under Mehr and, on the event day, a card on the start page. Before the visibility date it shows a notice with the date.
- The photos of tablemates are served at `GET /api/seating/photo/:key`, only for the viewer's own tablemates.
- The `seat` object type is not used any more: format version 2 still accepts and ignores it, format version 3 drops it (story 6e).
Requirements: PRES-05, PRES-06, PRES-07, PRES-12.

### Story 6d – Dialogues

Mock screen: `admin-world` (variant "Dialoge"). Moved here from 5g on 2026-11-17. Decided 2026-11-18 (refinement of 6d):
- **Data:** a dialogue has an id (`a–z 0–9 -`, 1–40 characters, the `contentId` of Tiled presets), the NPC's name (1–60 characters), 1–30 lines in Markdown (each 1–500 characters) and an optional portrait. It is stored in the database, not in the world package.
- **Admin:** Erlebniswelt gets the tab "Dialoge" (admins only): the list (name, id, number of lines, "nicht verwendet" or the objects that show it), the editor (name, id, lines that can be moved and removed, a preview, "Verwendet von", the portrait upload, "Speichern", "Dialog löschen" held for four seconds). Deleting is refused while an object shows the dialogue and names the objects (`409 dialogue_in_use`); changing the id keeps the assignments (the admin's assignments follow; presets in Tiled files that name the old id point to nothing and warn, MAP-08). Audited with ids only.
- **The action `dialog`:** a dialogue box at the bottom of the game, over the paused game: the portrait on the left, the NPC's name, the line, "n / m · Tippen für weiter". A tap, Enter or Space goes on, the last one closes it; a cross or Escape closes it at once; the game goes on at the same spot. The lines are Markdown, sanitised as on the website. The dialogues the admin can pick for a clickable object and the `preset_missing` warning start working with real data.
- **Portrait (CNT-08):** JPEG, PNG or WebP, at most 1 MB and 512 pixels per side, checked by content and kept as uploaded, so pixel art stays crisp; shown in a fixed square box, small pictures scaled without smoothing. Not part of the world package; it is shown whichever NPC or object opens the dialogue.
Requirements: CNT-02 (the dialogue and NPC text part; albums follow in step 7d), CNT-03 (completing it), CNT-08.

### Story 6e – World format version 3 and atmosphere

**Tiled world project:** `formatVersion: 3`; `border` polygons where the fog shall lie (the outer border of the map is the edge of the world); the map properties `clouds`, `birds`, `fog` where an effect is off; one bird in `ambient/bird/`.
Mock screen: `game` (atmosphere only as a note). Decided 2026-11-18 (refinement of 6e):
- **Format reading:** the platform reads versions 2 and 3 (as decision 1, unlike the theme format which reads its newest version only); each package is checked against the layout and the rules of its own version; the definitions of both versions are kept (`world-v2.ts`, `world-v3.ts`), with their own JSON Schemas (`schemas/world-*.v3.schema.json`) and format documents. Version 3 drops the type `seat`. 14.4 and 19.7 say so.
- **Bird:** `ambient/bird/metadata.json` is a PixelLab metadata file like a figure's; the animation `flying` is needed for `east` and `west` (`south` and `north` are checked when there), 1–16 frames per direction, played at 8 frames per second; frames of 8–256 pixels; every file of `ambient/` must be named. Without it there are no birds. A flock flies to the left or to the right (random), 3–5 birds, every 20–60 s, at a random height of the view.
- **Cloud shadows:** faint (at most 13 % dark) and soft, squashed to the 2 : 1 of the ground plane, drawn over the ground, the objects and the figures, below the fog. The project owner doubted how a flat shadow looks over buildings; it was decided to keep faint, soft shadows and to check them on the real world.
- **Reduced motion:** cloud shadows and birds are not shown at all; the fog stays.
- **Fog colour:** a light mist (223, 230, 233), the same on every map.
- **In the app and in the game preview:** the engine draws the atmosphere; the preview loads the bird from the local package.
- World format version 3 (`shared/src/packages/world-v3.ts`, JSON Schemas, format document, `zappaloo validate`, test world in both versions); version 2 stays readable. Its fields come with this story and 6f – 6g. Version 3 drops the object type `seat` (the seating plan lives in Zappaloo, story 6c).
- Fog along the border, cloud shadows, birds, the map switches, reduced motion; in the app and the game preview.
Requirements: MAP-20, GAME-31, GAME-32, GAME-33, GAME-34.

### Story 6f – Animated tile objects

**Tiled world project:** the animation of the fountain (and other animated props) in its image-collection tileset.
- The validator reads tile animations of image-collection tiles (frames in the same tileset, durations); the engine plays them on tile objects.
Requirements: GAME-35.

### Story 6g – NPCs in the world

**Tiled world project:** `npc` objects with `figure`, `label` and `path` polylines; NPC figures with tier `npc` and a wave animation.
Mock screen: `game`.
- Object type `npc`, polylines as paths, tier `npc`, `wave`; NPCs walk their paths, stand and wave, in the app and the game preview; tapping walks to them with the glow, no sparkle.
Requirements: GAME-36, GAME-38.
Re-verified: GAME-25, AVA-01.

### Story 6h – NPCs in Erlebniswelt: name, short dialog, action

Mock screens: `admin-world` (NPC list), `game` (NPC bubble).
- The NPC list per map in Erlebniswelt with name, short dialog and action, audited; the NPC bubble from 3 tiles, several bubbles with the overlap rule; edge indicators for NPCs with an action.
Requirements: MAP-21, GAME-37, GAME-39.
Re-verified: PRES-10, CNT-03, GAME-26.

### Story 6i – Labels: title of the action, on objects in sight

Mock screen: `game`.
- The app gives the engine the title of what each object opens; the preview keeps the label or name.
- Once an object or portal with an indicator is in view, its label sticks to the top of the object; the overlap rule of the indicators applies.
Requirements: GAME-40, GAME-41.
Re-verified: GAME-26.

## Report

<Added when the epic is complete, from the template in README.md.>
