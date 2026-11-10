# UX Mocks

[zappaloo-mocks.html](zappaloo-mocks.html) is a clickable mid-fi prototype of the guest website, the game world and the admin area (decided 2026-11-10). Open it in a browser; it needs no build and no server (fonts load from Google Fonts). The UI texts are German like the app; names and places are made-up sample data, and the pixel art is placeholder only.

## How to use the mocks

- **Frontend steps follow the mocks.** A step that builds a screen shown here uses its layout, flow and texts as the starting point. Each screen lists the requirement IDs it covers.
- The requirements in [sw-architecture.md](../sw-architecture.md) still decide. Where a mock and a requirement disagree, the requirement wins, and the mock is fixed in the same step.
- A UX change found during implementation is proposed first, then applied to the mock and, if it touches a requirement, to the spec.
- The mocks are deliberately neutral. The website theme (colours and fonts, `theme.json`, stage 4) and the pixel style of the game UI are decided later.
- In the prototype: **Phone / Desktop** switches the device, the dashed **State** chips switch a screen's states, and buttons inside a mock lead to the next screen. The game world, avatar editor, upload composer, invitation code boxes, moderation and waiting page are interactive.

## Screens

| Area | Screens |
|---|---|
| Release 1: invitation and RSVP | Enter invitation code, redeem and create account, login, forgot password, waiting page, RSVP (attendance, food and allergies, companions and song, summary), profile |
| Game world | First entry (avatar, say hello), game world, page overlay over the game, table finder |
| Website | Start, programme, content page, more, where do I sit, upload, upload confirmation, gallery with photo viewer, keepsake page, games and rankings, treasure found |
| Admin | Overview, invitations, accounts and roles, RSVP overview, seating plan, content editor, game world (objects and portals, maps and import), settings, moderation, event screen |

## UX decisions (2026-11-10)

The decisions behind the mocks, by question number in the prototype's "Questions & decisions" page. Decisions that change requirements are also written into sw-architecture.md (IDs in brackets).

| Q | Topic | Decision |
|---|---|---|
| 1 | Invitation code input | Six separate character boxes; typing jumps to the next box, pasting fills all six. |
| 2, 45 | Email at registration | Offered, optional (some guests, e.g. grandparents, have none); verified later in the profile. |
| 3 | Username | Suggested from the guest name, editable. |
| 4, 44 | Sign-in | Username or verified email address (ACC-16). |
| 5, 6 | Waiting page | Only Profil and Abmelden besides the RSVP; no programme or venue teaser. |
| 7, 8 | RSVP form | Three-step wizard (attendance → food → companions and song); no "I'm in for everything" shortcut. |
| 9 | Allergy note | "Sieht nur das Organisationsteam" with a lock icon on every person card, companions included. |
| 10, 11 | Companion requests | Pending requests can be edited or withdrawn; optional note for the admin (RSVP-10). |
| 12 | RSVP confirmation | No confirmation email; the summary page only. |
| 13 | Own contributions | "Meine Beiträge" in the profile (ACC-12). |
| 14, 47 | Own figure | Always shown, no switch (PRES-04). |
| 15 | Avatar step | Cannot be skipped; "Zufällig" makes it one tap. |
| 16, 41 | Game bar | Bar at the top: Programm, Rückmeldung (badge), Hochladen, Website. "Website" leaves the game. No buttons at the bottom, no event-day "now / next" in the game (GAME-14, WEB-07). |
| 17, 40, 42 | World objects | Clickable objects come from the event's Tiled maps; each map has its own. They sparkle briefly at random; tapping one walks the avatar there and runs its action. Portals between scenes are wobbling arrows. The admin assigns each object's action per map in "Spielwelt" (GAME-05, GAME-06, GAME-15, GAME-16, MAP-15). |
| 40 | Own avatar | Tapping it opens the profile (GAME-18). |
| 43 | Discoverability | The sparkle plus a hint at the first entry, "Tippe auf Dinge, die funkeln" (GAME-17). |
| 18 | Overlay links | Links inside an overlay stay in the overlay. |
| 19 | Website tabs | Start · Programm · Hochladen · Erinnerungen · Mehr (bottom tab bar on phones, top nav on desktop). |
| 20 | Start page | Editable welcome block plus fixed system cards (RSVP status, now / next, shortcuts). |
| 21 | Programme | Only the parts the guest is invited to, with one line saying so (WEB-09). |
| 22 | Content pages | Plain Markdown for every page, FAQ included. |
| 23 | Table finder | The table and tablemates only, no seat. |
| 24 | Text limits | Snapshot caption 140 characters, keepsake text 1000 (PHO-15). |
| 25 | Closed upload kind | The closed button stays visible, disabled, marked "deaktiviert". |
| 26 | Photo download | Download in full resolution from the photo viewer (PHO-19). |
| 27 | Keepsake page | Visible to all signed-in guests. |
| 28 | Minigame from the website | Starts full-screen; closing returns to the page. |
| 29 | Treasure found | Shows the hint of one item not found yet. |
| 30 | Admin on phones | Everything responsive; tables are tuned for desktop. |
| 31 | Invited parts | Set per batch when creating invitations, editable per invitation afterwards. |
| 32 | Seating plan | Drag and drop only, no auto-fill. |
| 33 | Content editor | One "Veröffentlichen" button, live at once; no drafts. |
| 34 | Settings | One page with sections; the "Wie kennst du das Paar?" list has its own section. |
| 35 | Moderation card | Contributor name, upload time, type and location. |
| 36 | Photo wall | Contributor name under the photo; nothing for anonymous uploads. |
| 37, 46 | Upload QR on the event screen | Not a fixed column: slides in bottom right for 15 s every 2 minutes; the admin picks the upload link per screen link (SCR-07). |
| 38 | Visual theme | The mock style is fine as a base. Website theme: colours and fonts. Pixel style of the game UI: later. |
| 39 | Website style | Calm and classic; pixel accents only in game-related places. |
