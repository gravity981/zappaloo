# UX Mocks

[zappaloo-mocks.html](zappaloo-mocks.html) is a clickable mid-fi prototype of the guest website, the game world and the admin area (decided 2026-11-10). Open it in a browser; it needs no build and no server (fonts load from Google Fonts). The UI texts are German like the app; names and places are made-up sample data, and the pixel art is placeholder only.

## How to use the mocks

- **Frontend steps follow the mocks.** A step that builds a screen shown here uses its layout, flow and texts as the starting point. Each screen lists the requirement IDs it covers.
- The requirements in [sw-architecture.md](../sw-architecture.md) still decide. Where a mock and a requirement disagree, the requirement wins, and the mock is fixed in the same step.
- A UX change found during implementation is proposed first, then applied to the mock and, if it touches a requirement, to the spec.
- The mocks are deliberately neutral. The website theme (colours and fonts) comes with the theme package (sw-architecture.md 19.7, stage 4), and the pixel style of the game UI with the world package (stage 5).
- In the prototype: **Phone / Desktop** switches the device, the dashed **State** chips switch a screen's states, and buttons inside a mock lead to the next screen. The game world, avatar editor, upload composer, invitation code boxes, moderation and waiting page are interactive.

## Screens

| Area | Screens |
|---|---|
| Release 1: invitation and RSVP | Enter invitation code, redeem and create account, login, forgot password, set password (setup and reset link), confirm email address, page not found, privacy notice, waiting page, RSVP (attendance, food and allergies, companions and song, summary), profile |
| Game world | First entry (avatar, say hello), game world, page overlay over the game, table finder |
| Website | Start, programme, content page, more, where do I sit, upload, upload confirmation, gallery with photo viewer, keepsake page, games and rankings, treasure found |
| Developer tools | Theme package editor (development only, epic 5.2) |
| Admin | Event setup, overview, invitations, accounts and roles, RSVP overview, seating plan, content editor, game world (objects and portals, maps and import), settings, moderation, event screen |

## UX decisions (2026-11-10)

The decisions behind the mocks, by question number in the prototype's "Questions & decisions" page. Decisions that change requirements are also written into sw-architecture.md (IDs in brackets).

| Q | Topic | Decision |
|---|---|---|
| 1 | Invitation code input | Six separate character boxes; typing jumps to the next box, pasting fills all six. |
| 2, 45 | Email at registration | Offered, optional (some guests, e.g. grandparents, have none); verified later in the profile. |
| 3 | Username | Suggested from the guest name, editable. |
| 4, 44 | Sign-in | Username or verified email address (ACC-16). |
| 5, 6 | Waiting page | Only Profil and Ausloggen besides the RSVP; no programme or venue teaser. |
| 7, 8 | RSVP form | Three-step wizard (attendance → food → companions and song); no "I'm in for everything" shortcut. |
| 9 | Allergy note | "Sieht nur das Organisationsteam" with a lock icon on every person card, companions included. |
| 10, 11 | Companion requests | Pending requests can be edited or withdrawn; optional note for the admin (RSVP-10). |
| 12 | RSVP confirmation | No confirmation email; the summary page only. |
| 13 | Own contributions | "Meine Beiträge" in the profile (ACC-12). |
| 14, 47 | Own figure | Always shown, no switch (PRES-04). |
| 15 | Avatar step | Cannot be skipped; "Zufällig" makes it one tap. |
| 16, 41 | Game bar | Bar at the top: the event's name and "Website", which leaves the game (changed 2026-11-17: Programm, Anmeldung and Hochladen are objects of the world, not buttons). No buttons at the bottom, no event-day "now / next" in the game (GAME-14, WEB-07). |
| 17, 40, 42 | World objects | Clickable objects come from the event's Tiled maps; each map has its own. They sparkle along their edges at random, and a shine passes over them now and then; tapping one walks the avatar there and runs its action. Portals between scenes are floating arrows. The admin assigns each object's action per map in "Erlebniswelt" (GAME-05, GAME-06, GAME-15, GAME-16, MAP-15). |
| 40 | Own avatar | Tapping it opens the profile (GAME-18). |
| 43 | Discoverability | The sparkle plus a hint at the first entry, "Tippe auf Dinge, die funkeln" (GAME-17). |
| 18 | Overlay links | Links inside an overlay stay in the overlay. |
| 19 | Website tabs | Start · Programm · Hochladen · Erinnerungen · Mehr (bottom tab bar on phones, top nav on desktop). |
| 20 | Start page | Fixed layout. The hosts edit the hero image, the welcome text and the countdown switch. The cards are fixed (RSVP status, countdown, now / next, shortcuts). Changed 2026-11-13, see "Start page" under stage 4. |
| 21 | Programme | Only the program items the guest is invited to (WEB-09); since 2026-11-18 without a line saying that others are left out. |
| 22 | Content pages | Plain Markdown for every page, FAQ included. |
| 23 | Table finder | The table and tablemates only, no seat. |
| 24 | Text limits | Snapshot caption 140 characters, keepsake text 1000 (PHO-15). |
| 25 | Closed upload kind | The closed button stays visible, disabled, marked "deaktiviert". |
| 26 | Photo download | Download in full resolution from the photo viewer (PHO-19). |
| 27 | Keepsake page | Visible to all signed-in guests. |
| 28 | Minigame from the website | Starts full-screen; closing returns to the page. |
| 29 | Treasure found | Shows the hint of one item not found yet. |
| 30 | Admin on phones | Everything responsive; tables are tuned for desktop. |
| 31 | Invited program items | Set per batch when creating invitations. The invitation list shows them as read-only letters (T A D P). Changed afterwards in the account panel only (changed 2026-11-12). |
| 32 | Seating plan | Drag and drop only, no auto-fill. |
| 33 | Content editor | One "Veröffentlichen" button, live at once; no drafts. |
| 34 | Settings | One page with sections; the "Wie kennst du das Paar?" list has its own section. |
| 35 | Moderation card | Contributor name, upload time, type and location. |
| 36 | Photo wall | Contributor name under the photo; nothing for anonymous uploads. |
| 37, 46 | Upload QR on the event screen | Not a fixed column: slides in bottom right for 15 s every 2 minutes; the admin picks the upload link per screen link (SCR-07). |
| 38 | Visual theme | The mock style is fine as a base. Website theme: colours and fonts. Pixel style of the game UI: later. |
| 39 | Website style | Calm and classic; pixel accents only in game-related places. |

## UX decisions for the admin area of stage 2 (2026-11-10, step 2h)

| Topic | Decision |
|---|---|
| Admin navigation | Lists only the pages that exist; each later step adds its entry with its page. The mock shows the complete navigation. |
| Account panel | "…" in Konten & Rollen opens a panel per account: roles, staff capabilities (only with staff), groups as chips, and a reset link. "Konto anlegen" and a group (rename, members, delete with a second click) open panels too. Side sheet on desktop, full screen on phones. Variants in the mock's "Accounts, roles & groups" screen. |
| Links to hand over | Setup and reset links are shown once, with a copy button and their expiry. |
| Opening the platform | Stage 2 shows only the state (header, Übersicht); the opening card in Einstellungen comes with steps 3c and 3d. |
| Manual releases | No page until a feature stores access conditions (step 4a or 5b). |
| Invitation expiry | A date, not a time: the code is valid through that day, in the admin's time zone. Invited parts per invitation come with step 3a. |

## UX decisions for the event setup (2026-11-11, step 2i)

| Topic | Decision |
|---|---|
| Setup form (48) | On a fresh installation an admin sees only the setup form in the admin area: name, time zone (a text field with a list of IANA names) and default language (Deutsch only for now). Saving completes the setup and opens the normal admin area; no navigation before. The mock's "Event setup" screen shows it (CFG-02). |
| Not set up yet | Everyone else who signs in sees a neutral "Noch nicht eingerichtet" page with Ausloggen. |
| Change later | Einstellungen has a card "Veranstaltung" at the top with the same three fields and Speichern (CFG-06). |

## UX decisions for stage 3 (2026-11-11, plan review)

Written into sw-architecture.md 7.4.1, 10.4 and 24 as well.

| Q | Topic | Decision |
|---|---|---|
| 49 | Countdown | Optional: a switch "Countdown auf der Warteseite zeigen" in the card "Plattform öffnen", separate from the opening date (which `{openingDate}` shows), default off. The countdown disappears at zero; the text stays (ACS-13). |
| 50 | Admin changes an RSVP | The allergies card in Anmeldungen becomes a guest table (name, status, parts, menu, song wish, allergies as a column only admins see, status filter). "Bearbeiten" opens the RSVP wizard in admin mode, also after the deadline (RSVP-04). |
| 51 | Menu | Tied to the meal program item, which the admin marks among the program items (name, time, place); asked only for persons attending it. One menu list for everyone, children's menu included. |
| 52 | Approved companions | Their VIP changes attendance, menu and allergies in the wizard until the deadline, without a new approval; the name only the admin. Pending requests: edit or withdraw (Q10). |
| 53 | Invited parts without an invitation (superseded 2026-11-12, see stage 3.9) | "Eingeladen zu" chips in the account panel for vip accounts without an invitation; a new account is invited to all parts, and "Konto anlegen" has no chips (decided 2026-11-11: the parts are changed in the account panel afterwards). With an invitation, its parts apply (changed under Einladungen). Revoking vip needs a second click ("vip entziehen"), because the guest's RSVP with allergies and companions is deleted with it. |
| 54 | Waiting-page texts | Edited in Einstellungen only; the content editor has no "Warteseite" page. |
| 55 | Privacy notice | Public page `/datenschutz` (new screen), linked on every page: login, waiting page, RSVP wizard, website "Mehr", admin area. German default text; the admin edits it as Markdown in Einstellungen (SEC-09). |
| 56 | Closing again | Once open, the card "Plattform öffnen" offers "Wieder schliessen", without an email. The "Die Tür ist offen" email and the RSVP reminder go to verified addresses only; their counts count those. |
| 57 | Password fields | The registration and the set-password page have one password field with an eye button and no repeated field (decided 2026-11-11): a typo is visible, and a guest who loses the password gets a new link from the hosts. |
| 58 | Brand on public pages | The header of the pages without sign-in shows the event's name (public `GET /api/site`, only the name); the event has no date setting yet, so the date of the mock's header is left out until the programme exists (stage 4). |
| 59 | Release 1 pages | Every page a guest sees before the opening follows its mock: login, enter code (six boxes), register (username suggested from the guest's name, optional email), forgot password, set password, confirm email, not found, privacy notice, RSVP in the flow frame, profile (account part), waiting page. The three pages without a mock were drawn on 2026-11-11 and confirmed by the project owner the same day (built in step 3h). |
| 60 | Install hint | A slim dismissible strip on the waiting page and a permanent card "App" in the profile; both appear only in a mobile browser, never in the installed app, and there is no pop-up on the first visit (decided 2026-11-11, step 3.5c). The install page is a flow page: Android with the browser's install button, iOS with the three Share-menu steps, and the note that the app asks for the password once more. |
| 61 | Footer notice | Under "Datenschutz · Version" on the pages with the footer (public pages, RSVP, profile, admin area), not on the waiting page: the admin's copyright line (small, only slightly stronger than the rest), a fixed license sentence and the links "Quellcode" and "Lizenz" (translated). Edited in the card "Fusszeile" in Einstellungen; "Lizenz" opens the public page `/license` (decided 2026-11-11, step 3.5d). |

## UX decisions for stage 3.9 (2026-11-12, findings of the Release 1 pilot)

Written into sw-architecture.md 7.1.2, 7.4.2 and 8.3 as well. The screens are drawn into the mock at the start of the step that builds them (epic 3.9, `spec/backlog/epics/epic-3.9-release-1-pilot.md`).

| Topic | Decision |
|---|---|
| Program item | "Programmpunkt" replaces "Teil" in every text. Earlier decisions that say "parts" (21, 31, 50 – 53) mean program items. |
| One answer | With "Pro Programmpunkt zusagen" off (the default), step 1 of the RSVP asks each person once ("Ja" / "Nein") and lists their program items. |
| Quiet pages | The RSVP step with companions and songs has no instructions around the list and the song field. The settings switches have one short sentence. Filter chips, buttons and their hint belong in the card of the table they act on (Einladungen like Konten & Rollen). |
| Plain sentences | Texts use short, full sentences and no semicolons. |
| Adding companions | "Begleitperson hinzufügen" instead of "beantragen". With "Begleitpersonen bestätigen" off (the default) an added person has no status tag and counts right away. The person type is chosen with chips (changed 2026-11-18, epic 5.4: preselected by the button "+Begleitung" or "+Kind", changeable). With approval off the guest removes an added person until the deadline. The admin removes one from the guest table in Anmeldungen (second click). |
| Person type | Chips "Erwachsen" and "Kind" per batch when creating invitations, in the account panel and in the companion form (right under the name, no title). The invitation list shows one letter (E, K) and cannot change it. For a child the menu in step 2 comes from the children's list (changed 2026-11-18, epic 5.4). Anmeldungen shows the totals by type and a column "Typ". |
| Konten & Rollen | Columns Benutzername (empty while inactive) · Name (current display name) · Status (aktiv / inaktiv / gesperrt) · Rollen · Fähigkeiten. Filter chips with counts and a search. No invitation information in the table. |
| Account panel | Inactive with an invitation: state, "Zur Einladung", person type, roles locked, groups, "Eingeladen zu", no password section, "Konto löschen". Inactive and created by an admin: free roles and "Neuen Einrichtungslink erstellen" instead (decided 2026-11-12). Active: as before plus person type, "Konto sperren" and "Konto löschen". Blocked: "Entsperren", no reset link. "Eingeladen zu" appears for every account with vip. |
| Konto anlegen | Ticking vip shows the program item chips, none selected. At least one is required (replaces 53). |
| Einladungen | "Aufräumen (n)" deletes revoked and replaced invitations after a second click. Revoking the last open invitation of a never-activated guest asks "Widerrufen und Gast entfernen". "Löschen" (INV-22, 2026-11-13) sits in the actions column on a redeemed invitation whose account is gone, after a second click "Endgültig löschen". |
| Redeeming while signed in | "Diese Einladung für «Gastname» zu deinem Konto «Benutzername» hinzufügen?" with "Nicht du? Ausloggen". |
| Deleting the own account | The confirmation says that the RSVP with companions and allergies stays with the hosts until after the event. |
| Phones | Wide admin tables scroll inside their own box. The page never moves sideways. |
| Footer | "Datenschutz · Version x.y.z" with a middle dot, as in 19.6. |

## UX decisions for stage 4 (2026-11-13, plan review)

Written into sw-architecture.md 6.2, 19.1.1 and 19.7 as well. The mock screens are changed in the steps that build them ("mock first").

| Topic | Decision |
|---|---|
| Website tabs (replaces 19 for now) | The navigation shows only what exists. Stage 4 has Start, Programm and Mehr. Hochladen and Erinnerungen come with stage 7. The start page cards for seating, quiz and the game world come with their stages. |
| Pages | A fresh installation has no pages. The hosts create them in Inhalte. Pages carry no access conditions in stage 4. |
| Content editor | Inhalte lists the pages, the start page text and the places. It has no "Programm" entry, because the program items are the schedule and stay in Einstellungen › Anmeldung (with an optional end time and a place picked from the places). |
| Images | Uploaded in the editor and placed with the Markdown image syntax (CNT-06). |
| Places and maps | A place card shows the uploaded map picture, the address and "In Google Maps öffnen". No map is embedded (CNT-07). |
| Theme | Card "Design" in Einstellungen: the active theme, the import of a theme package, the findings of a refused package and "Standard-Design verwenden" with a second click on a button held for four seconds (see the hold button, 2026-11-18). No download (THM-01 – THM-06). |
| World | The admin entry "Erlebniswelt" keeps the object actions per map. Its tab "Karten & Import" becomes the world importer for one whole package (stage 5, MAP-16). |
| Start page (decided 2026-11-13, step 4b) | Fixed layout (sw-architecture.md 5.6). Before the event day: hero image, welcome text, then the countdown card, the RSVP card and the shortcuts ("Programm" and the first three pages visible in "Mehr"). On the event day: "now / next", the feature cards, the shortcuts. No hero image, welcome text, countdown or RSVP card that day (WEB-10). "Erlebniswelt betreten" comes with stage 5. |
| Hero image | Picked in the editor of the start page ("Bild wählen" from its images or a new upload, "Entfernen", alt text). Shown in full width, uncropped. Without one the welcome text moves up. |
| Countdown | "Noch 214 Tage", "Noch 1 Tag": calendar days to the day of the first activity of all program items (the same for every guest), with its date and place. Gone on the event day and without program items. The switch "Countdown auf der Startseite zeigen" (default on) is in the editor of the start page, not in Einstellungen. Its number uses the theme's `display` font, or the heading font without one. It is calm like the website, not pixel style (WEB-11, THM-06; replaces the countdown among the pixel accents of decision 39). |

## UX decisions for stage 5 (updated 2026-11-17)

Written into sw-architecture.md 14.2 and 14.4 as well.

| Topic | Decision |
|---|---|
| World importer | Erlebniswelt › "Welt & Import": the active world (name, format, import time, start map, the previous world), "Welt importieren" for a whole package, the findings of a refused package, warnings listed with the active world, "Zurückrollen" with a second click on a button held for four seconds (see the hold button, 2026-11-18), and a guest-access switch (MAP-05, MAP-06, MAP-08, MAP-09, MAP-19). Guest access starts enabled on the first successful import. There is no template-world import and no import of single maps. |
| Maps and program items | Not linked (Q65): the game world and the schedule are different things. Each guest's figure walks on one map, picked at random. "Hingehen" is removed from the programme and from "now / next" (WEB-08 withdrawn). "Welt & Import" lists the maps; their objects and portals are in the tab "Objekte & Portale" (reworded 2026-11-17). |
| Objects | Erlebniswelt › "Objekte & Portale": a preset that points to something missing is marked "fehlt". A portal whose given target is missing cannot be imported; a portal without a target is a warning (reworded 2026-11-17). The minigame action is offered from stage 8. |
| Dialogues | A tab "Dialoge" in Erlebniswelt, not in Inhalte, because dialogues belong to the game world (Q63). A dialogue has an id (its `contentId`), the NPC's name and lines in Markdown, a preview of the dialogue box and "Verwendet von" (CNT-02, CNT-03). A dialogue in use cannot be deleted. Its id can be changed (Q64). |
| Who uses Erlebniswelt | Only admins manage the world: import, rollback, guest access, object actions and dialogues. Disabling guest access hides guest entry points and blocks direct guest navigation while leaving the active package and admin management available. |
| Game bar in stage 5 | Programm, Anmeldung, Website; since 2026-11-17 only the event's name and Website (GAME-14). |
| First entry in stage 5 | The avatar step, then the RSVP overlay while the RSVP is open. "Sag hallo" comes with stage 6 (GAME-13). |
| Without a world or with guest access disabled | Guests land on the website, and no guest navigation to the Erlebniswelt is shown. |

## UX decisions for step 5d.1 (2026-11-15, world format 2)

| Topic | Decision |
|---|---|
| Avatar editor | Two choices (decided 2026-11-17). First the kind of figure: «Mann», «Frau», «Kind» or «Andere», as buttons only for the kinds that the active world has a figure for; the kind of a figure comes from the world package. Choosing a kind picks a random figure of that kind at once. Then the figures of that kind are shown as a grid with their labels (7.3, AVA-01), with a walking preview of the chosen one (it bobs between two frames in the mock; the game plays the walk frames), and "Zufällig", which draws again within the kind only. Which figures a person may choose depends on the tier of each figure and the roles of the user (tier1 vip, tier2 staff, tier3 admin, exact, companions tier1; decided 2026-11-17). Each person (the guest and every companion) has a tab and chooses on their own; "Weiter" waits until every person has a figure, and there is no skip. There are no skin, hair, clothing or template choices. A figure without a label shows no name. |
| Game: walking, target and edges | Epic 5.1 (decided 2026-11-17, question 69; the owner confirmed the mock before story 5.1e). **Target marker:** a thick ring in the glow's light colour with a dark outline, lying flat on the ground in the tile's 2 : 1 ratio (0.4 tile widths wide in the game), pulsing once per second (scale 0.8 → 1.2, fading out), above the ground and below objects and figures; it shows for every walk started by a tap and disappears on arrival, stop, a blocked walk and the arrow keys. A tap on a blocked spot moves it to the nearest reachable spot within 3 tiles, or nothing happens. **Glow:** every clickable object glows softly along its edges all the time, in the colour of its sparkles (GAME-29), like the portal's arrow in its warm colour; the object or portal the avatar walks to pulses, swelling and fading once per second, until its action runs. **Edge indicators:** round dark buttons with a white outline, 12 px inside the edge of the game view and below the bar, on the line from the avatar to the object, with a small pointer towards it; a sparkle for a clickable object, a yellow arrow for a portal; a label beside the icon, black text on a white pill, on the side with more room: the name of the connected page for an object, the name of the map it leads to for a portal; at least 44 × 44 px to tap, the label included; at most 6, nearest first, only the nearer of two overlapping ones; hidden while an overlay is open; none for easter eggs and objects without an action. The mock shows them in the state "Objects out of view". |
| Persons | Each tab (the guest, each approved companion) chooses its own figure. |
| Admin card "Welt" | The info line shows the format, the tile size as width × height ("Kachel 64 × 32 Pixel"), the number of figures, the import time and the start map (MAP-05). |
| Refused package | The findings name the file of a figure with its frame, for example `avatar/<figure>/…/south.png: falsches Format (32 × 32 instead of 48 × 48)`. |
| Import text | "Ein Weltpaket (.tar.gz, Format 2) mit isometrischen Karten, Tilesets, Figuren und optional der Tür der Warteseite." |

## UX decisions for the theme package editor (2026-11-18, epic 5.2, story 5.2a)

Written into sw-architecture.md 19.7.1 as well. The screen `theme-editor` (group "Developer tools") is drawn with four states: theme in progress, empty draft, contrast check failing, export refused.

| Topic | Decision |
|---|---|
| Tool, not product | Development only (THM-08). English texts, admin styles of the mocks. The screen has no guest chrome and no link into the app. |
| Wide screen | Controls in cards on the left (Name, Colours, Contrast check, Waiting card, Fonts, Icons, Export), preview on the right. In the editor the two columns scroll on their own under a fixed header (changed 2026-11-18; the mock shows the whole screen as one page). |
| Narrow screen | Tabs «Edit» and «Preview» instead of one long column, so the preview is one tap away and not below a long list of controls. Proposed; the project owner confirms the mock before story 5.2c. |
| Header | «Open package…», «New theme» (second click), «Export», and the line «Draft saved in this browser». |
| Contrast check | Its own card with the five pairs of the validator, ratio and ✓ / ✗, live. A failing pair does not block «Export»; the validator's refusal is shown in the card Export. |
| Findings | Listed in the card Export with the card and field they belong to; nothing is downloaded. |
| Empty draft | The platform's default colours, no fonts, no icons; the Export card says what is missing. |
| Colour assistant (decided 2026-11-18) | Master colour = accent, with «Surprise me». Palette cards, each a complete mapping onto the seven colour keys: Tint, Neutral, Warm paper, Cool, Soft complement, Analogous, High contrast, each with ✓ when all pairs of the validator pass. Picking a card fills the colours (and the waiting card's if on); later edits stay; nothing is recomputed. No dark theme (status colours are for light surfaces). Modelled on mycolor.space (one colour in, many named palettes out), but every palette must fit the theme package's keys (THM-15). |
| Size adjust (decided 2026-11-18) | Per font, in the card Fonts: slider and number field, 50–200 %, default 100; live in the preview; for fonts whose letters look smaller or larger than the others (THM-16). |
| Soft buttons and bars (decided 2026-11-18) | In a theme, soft buttons, chips and tags and the bars (website header, game bar, phone tab bar) take a tint of the accent over the surface; the active tab is the surface colour. Derived from the seven colours (about 12 %, lowered until the text on it reaches 4.5 : 1), so the theme format has no new key (THM-17). The mocks stay neutral; the editor's mock shows the effect in a «Website bar» and a soft button. |

## UX decisions for epic 5.3 (2026-11-18, story 5.3a)

Written into the epic file (`spec/backlog/epics/epic-5.3-program-items-activities.md`, decisions 1 – 8); the requirements and sw-architecture.md follow in stories 5.3b – 5.3e. Where these rows say "program item" for what the schedule shows, they replace the older decisions 21, 51 and the stage 4 rows "Content editor" and "Countdown". The screens `programme`, `home`, `rsvp-parts` and `admin-settings` are changed; the project owner confirms them before story 5.3c starts.

| Topic | Decision |
|---|---|
| Program item and activity | A program item is what a guest is invited to and answers for: name and meal flag, no time or place. An activity belongs to one program item and has a name, a start, an optional end and a place. The mock's four items: Trauung (Eintreffen, Trauung), Apéro, Dinner (Dinner, Paar-Quiz), Party. |
| Programm page | One timeline row per activity, by start time, only for the program items the guest is invited to. The line "Du siehst die Programmpunkte, zu denen du eingeladen bist" stays. |
| Start page | "Now / next" shows activities. The countdown counts to the first activity of all program items, the same for every guest, with its date and place. Every day that has an activity is an event day. |
| RSVP wizard | Each program item shows its activities in a small line below its name, with start times: "Eintreffen 13:30, Trauung 14:00". Per program item: the activities line below its name. With one answer for all: one line per program item below the yes / no, "Trauung – Eintreffen 13:30, Trauung 14:00". The summary: the same line below each program item's name. |
| Einstellungen › Anmeldung | Each program item is a card with its name, the "Essen" tag, "Bearbeiten" and "Löschen"; its activities are listed inside it, each with "Bearbeiten" and "Löschen", then "Aktivität hinzufügen". The last activity of an item has no active "Löschen", and a hint says to delete the program item instead. "Programmpunkt hinzufügen" asks for the first activity at once. |

## UX decisions of 2026-11-18 (Einstellungen)

| Topic | Decision |
|---|---|
| Order of the cards | Einstellungen shows the cards that are used often first: Veranstaltung, Plattform öffnen, then Anmeldung and Funktionen side by side. The rarely changed cards come last: Design, Warteseite-Texte, Datenschutz and Fusszeile. |
| Erlebniswelt warnings | On "Welt & Import" the warnings of an accepted package come last, below the table of maps. The findings of a refused package stay at the top, because they answer the import. |
| Programme over several days | The programme has one timeline per calendar day, each under its own heading ("Samstag, 12. Juni 2027"), and rows show the time of day only. Every day with an activity is an event day: the start page shows its event-day layout, and the programme marks past and current activities on every day of the event. An activity without an end does not last into the next day. The line "Du siehst nur die Programmpunkte, zu denen du eingeladen bist." is gone. |
| Hold button | The confirmation of the design reset ("Ja, Standard-Design verwenden") and of the world rollback ("Ja, zurückrollen") must be held for four seconds, with the mouse, a finger or the Enter or Space key. While it is held a darker fill grows across the button like a progress bar; letting go or leaving the button starts over. A plain click does nothing, and no instruction stands next to the button (changed 2026-11-18). The same holds for "Jetzt öffnen" and "Wieder schliessen" of the platform and for "Frist entfernen" and "Erinnern" of the RSVP. The first button ("Standard-Design verwenden", "Zurückrollen") still only asks. |

## UX decisions for epic 5.4 (2026-11-18, story 5.4a)

Written into sw-architecture.md 7.4.4. The screens are drawn into the mock: `rsvp-people`, `rsvp-companion`, `rsvp-done`, `admin-rsvp`, `admin-users`, `admin-settings`, `admin-invitations`, `invite-register`, `waiting`. The project owner confirms them before story 5.4c starts.

| Topic | Decision |
|---|---|
| Menu lists | Einstellungen › Anmeldung has "Menüs" (adults) and "Kindermenüs", each with "Menü hinzufügen" / "Kindermenü hinzufügen", a Kürzel field and "Löschen" per entry. A child's menu in the wizard comes from the children's list and is required while it has entries; without children's menus a child is not asked. |
| Kept choices | A child who chose an adults' menu keeps it. The Anmeldungen table marks it "*", the menu totals list it as "Erwachsenenmenü" under Kinder. |
| Menu totals | Anmeldungen shows the menu totals in two groups, Erwachsene and Kinder. |
| Sonstiges/Anmerkungen | One optional text field (500 characters) on the main invitee's card in step 2, below the allergies, with the lock line "Sieht nur das Organisationsteam". Not on the companions' cards. The guest table has it as a second admin-only column next to the allergies. |
| +Begleitung / +Kind | Two small buttons side by side replace "Begleitperson hinzufügen". Both open the same form; the person type chip is preselected (Erwachsen or Kind) and changeable, and the menu field follows it. |
| E-Mail column | Next to the status, same tag style: "bestätigt" (green), "offen" (yellow), "–" (no address, and accompanying persons). |
| Short forms | Typ (E, K), Programmpunkte and Menü in Anmeldungen show one code per entry, full name in the tooltip (`abbr`). The codes are the "Kürzel" of program items and menus in Einstellungen (1–2 characters, default the first letter; shown as an outlined tag on a program item), and the invitation list uses them too. |
| Roles and capabilities | In Konten & Rollen the columns Rollen and Fähigkeiten are read only letters (V, S, A; I, M) with the full name in the tooltip. Roles are changed in the account's panel. |
| Landing | "Konto anlegen" (and "Zu meinem Konto hinzufügen") lead an unanswered guest to the Anmeldung; its "Weiter" (was "Fertig") leads to the start. The waiting page button reads "Jetzt anmelden" / "Anmeldung ändern". |
| Words | "Anmeldung" replaces "Rückmeldung" in all screens; signing in is "Einloggen" / "Ausloggen" (login, waiting page, profile, admin header, texts). |
