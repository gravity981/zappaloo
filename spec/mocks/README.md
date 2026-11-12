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
| Release 1: invitation and RSVP | Enter invitation code, redeem and create account, login, forgot password, set password (setup and reset link), confirm email address, page not found, privacy notice, waiting page, RSVP (attendance, food and allergies, companions and song, summary), profile |
| Game world | First entry (avatar, say hello), game world, page overlay over the game, table finder |
| Website | Start, programme, content page, more, where do I sit, upload, upload confirmation, gallery with photo viewer, keepsake page, games and rankings, treasure found |
| Admin | Event setup, overview, invitations, accounts and roles, RSVP overview, seating plan, content editor, game world (objects and portals, maps and import), settings, moderation, event screen |

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
| Not set up yet | Everyone else who signs in sees a neutral "Noch nicht eingerichtet" page with Abmelden. |
| Change later | Einstellungen has a card "Veranstaltung" at the top with the same three fields and Speichern (CFG-06). |

## UX decisions for stage 3 (2026-11-11, plan review)

Written into sw-architecture.md 7.4.1, 10.4 and 24 as well.

| Q | Topic | Decision |
|---|---|---|
| 49 | Countdown | Optional: a switch "Countdown auf der Warteseite zeigen" in the card "Plattform öffnen", separate from the opening date (which `{openingDate}` shows), default off. The countdown disappears at zero; the text stays (ACS-13). |
| 50 | Admin changes an RSVP | The allergies card in Rückmeldungen becomes a guest table (name, status, parts, menu, song wish, allergies as a column only admins see, status filter). "Bearbeiten" opens the RSVP wizard in admin mode, also after the deadline (RSVP-04). |
| 51 | Menu | Tied to the meal part, which the admin marks among the event parts (name, time, place); asked only for persons attending it. One menu list for everyone, children's menu included. |
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

Written into sw-architecture.md 7.1.2, 7.4.2 and 8.3 as well. The screens are drawn into the mock at the start of the step that builds them (implementation-plan.md, stage 3.9).

| Topic | Decision |
|---|---|
| Program item | "Programmpunkt" replaces "Teil" in every text; earlier decisions that say "parts" (21, 31, 50 – 53) mean program items. |
| One answer | With "Pro Programmpunkt zusagen" off (the default), step 1 of the RSVP asks each person once ("Ich komme" / "Ich komme nicht") and lists their program items. |
| Adding companions | "Begleitperson hinzufügen" instead of "beantragen". With "Begleitpersonen bestätigen" off (the default) an added person has no status tag and counts right away. The person type is chosen with chips, no default. With approval off the guest removes an added person until the deadline; the admin removes one from the guest table in Rückmeldungen (second click). |
| Person type | Chips "Erwachsene", "Kind", "Baby": per batch and row when creating invitations, in the account panel, in the companion form. A baby's card in step 2 has allergies but no menu. Rückmeldungen shows the totals per program item by type and a column "Typ". |
| Konten & Rollen | Columns Benutzername (empty while inactive) · Name (current display name) · Status (aktiv / inaktiv / gesperrt) · Rollen · Fähigkeiten; filter chips with counts and a search. No invitation information in the table. |
| Account panel | Inactive: state, "Zur Einladung", person type, roles locked, groups, "Eingeladen zu", no password section, "Konto löschen". Active: as before plus person type, "Konto sperren" and "Konto löschen". Blocked: "Entsperren", no reset link. "Eingeladen zu" appears for every account with vip. |
| Konto anlegen | Ticking vip shows the program item chips, none selected; at least one is required (replaces 53). |
| Einladungen | "Aufräumen (n)" deletes revoked and replaced invitations after a second click; revoking the last open invitation of a never-activated guest asks "Widerrufen und Gast entfernen". |
| Redeeming while signed in | "Diese Einladung für «Gastname» zu deinem Konto «Benutzername» hinzufügen?" with "Nicht du? Abmelden". |
| Deleting the own account | The confirmation says that the RSVP with companions and allergies stays with the hosts until after the event. |
| Phones | Wide admin tables scroll inside their own box; the page never moves sideways. |
| Footer | "Datenschutz · Version x.y.z" with a middle dot, as in 19.6. |
