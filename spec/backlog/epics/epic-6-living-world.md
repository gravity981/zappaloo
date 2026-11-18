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
Requirements: PRES-10.

### Story 6c – Seating plan and table finder

**Tiled world project:** seats (`type = seat`, `table`) at the tables.
Tables and seats, default seats for accompanying persons, admin override, table finder with tablemates, visibility date.
Requirements: PRES-05, PRES-06, PRES-07, PRES-12.

### Story 6d – Dialogues

Mock screen: `admin-world` (variant "Dialoge"). Moved here from 5g on 2026-11-17.
- Dialogues edited by admins in Erlebniswelt › Dialoge (id, NPC name, lines in Markdown, "Verwendet von"), audited with ids only. Deleting is refused while an object shows the dialogue; changing the id keeps the assignments.
- The action `dialog`: the NPC name and the lines, which the guest taps through. The dialogues the admin can pick for a clickable object (Objekte & Portale) and the `preset_missing` warning for a dialogue that does not exist start working with them.
- The optional portrait picture of a dialogue, uploaded in Dialoge and shown on the left of the dialogue box.
Requirements: CNT-02 (the dialogue and NPC text part; albums follow in step 7d), CNT-03 (completing it), CNT-08.

### Story 6e – World format version 3 and atmosphere

**Tiled world project:** `formatVersion: 3`; `border` polygons where the fog shall lie; the map properties `clouds`, `birds`, `fog` where an effect is off; one bird in `ambient/`.
Mock screen: `game` (atmosphere only as a note).
- World format version 3 (`shared/src/packages/world-v3.ts`, JSON Schemas, format document, `zappaloo validate`, test world); version 2 stays readable. Its fields come with this story and 6f – 6g.
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
