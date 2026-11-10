# Zappaloo – Specification

Zappaloo is a reusable digital event platform (e.g. for weddings) that combines a browser-based pixel-art game world with a classic, responsive event website. Both draw on one central content and data base. The game is the core experience: guests explore the event venues with their own avatar among the wandering figures of all attending guests, play minigames with central highscores, answer the RSVP, and contribute photos and messages via QR codes.

**Status: approved (2026-11-04).** Implementation follows [implementation-plan.md](implementation-plan.md).

This folder is the **source of truth**. The code implements the spec. When the code and the spec disagree, either the code gets fixed or the spec gets changed explicitly. Silent deviations are not allowed.

## Document index

| Document | Content |
|---|---|
| [README.md](README.md) | Purpose, document index, conventions, topic status, decisions |
| [sw-architecture.md](sw-architecture.md) | Concept, architecture, technology choices, and all requirement tables |
| [test-strategy.md](test-strategy.md) | Test levels, tooling, requirement traceability, "not yet implemented" list |
| [implementation-plan.md](implementation-plan.md) | Stages and steps, preconditions, releases, status reports after each stage |
| [manual-test-protocol.md](manual-test-protocol.md) | Records of manual checks in real environments, read by the requirement report |
| [mocks/](mocks/README.md) | Clickable UX mocks of website, game world and admin area, with the UX decisions; frontend steps follow them |

## Conventions

### Requirement IDs

Requirements live in tables at the end of each topic section in `sw-architecture.md`:

```
| ID | Requirement | Prio |
|---|---|---|
| ABC-01 | … | Must |
```

- An ID is `<PREFIX>-<nn>`. The prefix has 2–4 capital letters, one per topic.
- IDs are never renumbered or reused. New requirements are added at the end of their topic.
- A requirement that is dropped stays in the table, struck through and marked `(withdrawn)`, so its ID isn't reused.

### Priorities

| Prio | Meaning |
|---|---|
| Must | Required for the first production event. |
| Should | Expected. Can be deferred with an explicit decision. |
| Could | Optional and nice to have. |

The initial priorities follow the wording of the original concept: "muss" → Must, "soll" → Should, "kann"/"möglich" → Could. Core functions described as given were rated Must.

## Topics and status

Status values: **specified** (requirements written, not implemented) · **in progress** · **implemented** (all requirements have passing tests).

| Prefix | Topic | Section in sw-architecture.md | Reqs (active) | Stage | Status |
|---|---|---|---|---|---|
| GAME | Game world: entry, guided start, controls, movement, objects | 3 | 14 | 5 | specified |
| PRES | Guest presence (wandering figures, speech bubble with profile) and seating | 3.6 | 13 (2 withdrawn) | 6 | specified |
| HUNT | Treasure hunt | 3.7 | 7 | 8 | specified |
| MG | Minigames, results, highscores | 4 | 13 | 8 | specified |
| WEB | Classic website | 5 | 8 | 4, 5, 7, 8 | specified |
| LANG | Language and i18n | 5.3 | 2 | 1, 4 | in progress |
| SCR | Event screen (photo wall, live rankings) | 5.4 | 4 (2 withdrawn) | 7, 8 | specified |
| CNT | Shared content base, Markdown editing | 6 | 5 | 4 | specified |
| ACC | User accounts, authentication, email | 7, 23.8 | 14 (1 withdrawn) | 2 | specified |
| AVA | Avatars | 7.3 | 4 | 5, 6 | specified |
| RSVP | RSVP, event parts, accompanying persons | 7.4 | 9 | 3 | specified |
| ROLE | Roles (vip, staff, admin) and staff capabilities | 8 | 8 (2 withdrawn) | 2 | specified |
| INV | VIP invitations | 9 | 13 (6 withdrawn) | 2 | specified |
| ACS | Sign-in, opening the platform, waiting page, upload links, access control | 10, 11 | 10 (4 withdrawn) | 2, 3, 7 | specified |
| GRP | Guest groups | 12 | 2 | 2 | specified |
| PHO | Contributions: snapshots (gallery, photo wall) and keepsakes (keepsake page, printable book) | 13 | 17 (1 withdrawn) | 7 | specified |
| MOD | Moderation (swipe view) | 13.7 | 5 | 7 | specified |
| MAP | Tiled maps, map importer, template maps | 14 | 12 (2 withdrawn) | 5 | specified |
| DATA | Database and data model | 18 | 4 | 1, 2 | in progress |
| CFG | Event configuration, installation model | 19, 20 | 5 | 2, 4 | specified |
| OPS | Deployment, backup tools, CI/CD, versioning and releases (hosting out of scope) | 21–23 | 16 (2 withdrawn) | 1, 3 | in progress |
| SEC | Security and privacy (Swiss FADP) | 24 | 11 | 1, 2, 3, 4, 10 | in progress |
| PERF | Performance and load | 25 | 3 (1 withdrawn) | 5, 7, 9 | specified |
| MP | Multiplayer — removed | 3.3 | 0 (6 withdrawn) | – | withdrawn |
| GB | Guestbook — merged into PHO | 13.6 | 0 (4 withdrawn) | – | withdrawn |
| | **Total** | | **199** (232 IDs, 33 withdrawn) | | |

Sections with no requirement table describe architecture and technology choices: 15 (stack), 16 (frontend), 17 (backend), 26 (project structure), 27 (decision summary), 28 (stages) and 29 (principles). Section 30 lists what is out of scope for the first version.

## Decisions

| Date | Decision |
|---|---|
| 2026-11-04 | The spec is written in English. The original German concept was translated in full. |
| 2026-11-04 | The architecture document is `sw-architecture.md`. Requirement tables sit at the end of each topic section. |
| 2026-11-04 | Requirement priorities use Must / Should / Could. |
| 2026-11-04 | Test tooling: Vitest for unit, component and integration tests, Playwright for end-to-end tests (see `test-strategy.md`). |
| 2026-11-04 | Movement is smooth in all directions: arrow keys on desktop, tap-to-move on touch devices. Collisions only with the map, not between players. The client simulates movement and the server validates positions (MP-04–06, GAME-09–10). |
| 2026-11-04 | Minigames, including their content, ship with the platform (MG-11). Anti-cheat uses attempt IDs, per-minigame plausibility profiles and server-side quiz checks (MG-08). |
| 2026-11-04 | Website content is edited in the browser as Markdown (CNT-05). `events/<slug>/` only bootstraps an installation, and settings can be changed at runtime (CFG-02, CFG-05). |
| 2026-11-04 | Email goes through SMTP, with Infomaniak mail as proof of concept (ACC-11). Invitation accounts are `unverified` without verification. Password reset by email works only for verified addresses, and otherwise an admin creates a one-time link (ACC-02/03/09/10). |
| 2026-11-04 | Photo processing runs in a worker queue (PHO-13). |
| 2026-11-04 | German UI. i18n from the start, and content is stored with language keys (LANG-01/02). |
| 2026-11-04 | Privacy follows the Swiss FADP (revDSG). Shutdown flow: notice email, export, then automatic deletion. Whole site noindex (SEC-04–10). |
| 2026-11-04 | Out of scope v1: chat, platform administration (ROLE-10 withdrawn), multi-event installations (section 30). |
| 2026-11-04 | Order of work: 8 stages, deployed from stage 1, with admin functions built per topic (section 28). |
| 2026-11-04 | Value features added (section 2.3): RSVP with event parts (RSVP), every guest's avatar always present in the world, with a seating plan and table finder (PRES), and an event screen with photo wall and live rankings behind a read-only link (SCR). Also a QR treasure hunt (HUNT), minigames on smartphones and startable from the website or a QR code (MG-12/13), and a template map set (MAP-12–14). |
| 2026-11-04 | The spec stays a draft until the ratio between value and effort is accepted. |
| 2026-11-04 | No self-registration (ACC-02, ROLE-02, ACS-03, INV-13 withdrawn). Accounts come only from invitations or from an admin. |
| 2026-11-04 | Supersedes the earlier sign-in rule for uploads: photos and guestbook entries can be submitted anonymously through revocable upload links in the venue QR codes, with an optional name (PHO-14, ACS-04). |
| 2026-11-04 | Three roles: `vip` (every guest is treated as a VIP), `staff`, `admin`. The `visitor` role is removed, and guest groups handle subsets of guests (ROLE-01/03/09). |
| 2026-11-04 | No anonymous access. Website and game world require sign-in, except login, password reset, invitation redemption, privacy notice and upload-link pages. Long sessions keep sign-in rare (ACS-01/02 withdrawn, ACS-09, ACC-13). |
| 2026-11-04 | The game experience is the core: a portal to a website page opens it as an overlay above the paused game (GAME-11). |
| 2026-11-04 | The photo wall delay is configurable, with a default of 10 seconds (SCR-02). |
| 2026-11-04 | The project owner draws the template map art (MAP-12). |
| 2026-11-04 | Verification beyond CI: automate what is possible with Playwright, and record the rest in a manual test protocol (test-strategy.md 6.1). |
| 2026-11-04 | Game first: after sign-in, users land in the game world. The website is one click away, and direct links open their target (GAME-12). |
| 2026-11-04 | Accompanying persons get a static figure whose avatar their VIP chooses. Seat by default at the VIP's table, and the admin can override (PRES-07). |
| 2026-11-04 | Entering the game: guided first sign-in (avatar → RSVP → free play), always-visible button bar with RSVP badge, first map playable within 5 s over 4G (GAME-13/14, PERF-04). |
| 2026-11-04 | Map importer instead of level editor, so art can be improved without a redeployment. Portal targets are Tiled properties again, and the import warns about missing targets (MAP-03/05/08/10; MAP-07, MAP-11 withdrawn). |
| 2026-11-04 | VIPs request accompanying persons without an account. The VIP fills in name, avatar and RSVP before submitting, and the admin approves. Email invitation requests are withdrawn (RSVP-08/09; INV-15, INV-17–19 withdrawn). |
| 2026-11-04 | No real-time multiplayer. Attending guests (RSVP accepted) appear as figures wandering randomly in wander areas on the maps of their event parts (MP-01–06, PRES-03, ACS-08, PERF-02 withdrawn; PRES-01/02/08). |
| 2026-11-04 | Getting to know each other: VIPs add an optional profile photo and one-line greeting (also for accompanying persons). Walking up to or tapping a figure shows a speech bubble with name, photo and greeting. Both are moderated, and tablemates are shown in the table finder. No avatar generation from photos (PRES-09–12, MOD-01). |
| 2026-11-04 | Confirmed: accompanying persons are deleted with their VIP's account (RSVP-09), and the 5-second load target stays (PERF-04). |
| 2026-11-04 | Speech bubble opens automatically for the nearest figure when the player comes close, closes on walking away, and stays open when clicked. Profile photos and lines are not moderated, but the admin can remove them (PRES-10, PRES-14; PRES-11 withdrawn). |
| 2026-11-04 | One composer, two buttons: the guest adds a photo and/or text, then taps "Upload snapshot" (needs a photo) or "Upload keepsake" (photo, photo + text, or text). "Guestbook entry" is renamed to keepsake, with a keepsake page ("Gästebuch" in the German UI) and a printable keepsake book. The feature toggle is `keepsakes` (PHO-02, PHO-15–17). |
| 2026-11-04 | "How I know the couple": a choice from an admin-defined list (wedding defaults), in addition to the free line. Shown as a badge in the speech bubble and table finder (PRES-15). |
| 2026-11-04 | Live updates (event screen, moderation view, leaderboards) use Server-Sent Events (17.1). |
| 2026-11-04 | "Now / next" on the event day: structured schedule, current and next entry on the start page and the Programme button. Optional "Go there" to the map (WEB-07, WEB-08). |
| 2026-11-04 | RSVP without a "message to the hosts": messages belong in keepsakes. The song wish stays (RSVP-06). |
| 2026-11-04 | Release 1 (stages 1–3) goes live early with invitations and RSVP. The platform stays closed behind a waiting page ("We've got your RSVP — come back later") until the admin opens it. Staff and admins have full access (ACS-10, ACS-11). Backups move into stage 1. Accompanying persons' avatars are chosen when the world opens (RSVP-08, GAME-13). |
| 2026-11-04 | Snapshot and keepsake uploads are closed by default and opened separately by the admin. Nobody can upload before that (PHO-18). |
| 2026-11-04 | Allergies and dietary requirements are health data (FADP): only admins see them, they are named in the privacy notice and deleted at shutdown (SEC-11). |
| 2026-11-04 | The waiting page is a teaser: a pixel-art door ajar with figures building the world behind it, texts by RSVP status with name and number of waiting guests (DE defaults, editable), an optional countdown, and a "the door is open" email when the platform opens (ACS-11–14). |
| 2026-11-04 | The project owner draws the door scene for the waiting page. It is the first art task, needed for Release 1 (stage 3) before any maps (ACS-12). |
| 2026-11-04 | The backend stays TypeScript on Node.js, after Python (FastAPI) and Go were reconsidered once Colyseus was gone. Main reason: code shared between game and server (Tiled parsing, schemas, result structures), plus one language and toolchain (sw-architecture.md 15.1). Backend framework and database library are decided in stage 1. |
| 2026-11-04 | Spec approved. Implementation follows implementation-plan.md, with a status report after each completed stage. To avoid dependencies on later stages, ACS-04 moves to stage 7, WEB-08 to stage 5 and AVA-04 to stage 6. |
| 2026-11-04 | Releases aligned with stages. Stage 9 "Event Readiness" (load test, release checklist) completes Event-ready. New stage 10 "After the Event" holds export, shutdown and deletion (mandatory before the shutdown date) and automated deployment (quality of life). The release "Production-ready" is renamed "After the event". |
| 2026-11-04 | Everything guests contribute is moderated in one queue before it appears on the event screen, in the gallery or in the guestbook. Swipe right approves and left rejects, with undo and a rejected list (MOD-01–05, SCR-03 withdrawn). Approved guestbook entries can appear on the event screen (SCR-06). |
| 2026-11-04 | Hosting is out of scope: the project ships the image and the deployment bundle; the operator provides the hosts (prod on the operator's own server with a public IP and dynamic DNS, staging on the same machine on ports 8080/8443), network, router, firewall, SSH, domain, DNS and off-site backup storage (sw-architecture.md 21). OPS-03 now covers the ports the stack publishes; OPS-05 covers backup tools and documentation; OPS-07 withdrawn; step 1g dropped, Let's Encrypt is verified at the Release 1 go-live (3e). Replaces the VPS-related parts of the decisions below. |
| 2026-11-04 | Staging keeps Caddy's local CA; test devices accept the certificate warning once instead of installing the root certificate (optional). A public certificate via DNS challenge was considered and not chosen (sw-architecture.md 23.4). |
| 2026-11-04 | No branch protection on `main`: the project has a single developer (OPS-09 withdrawn). Release candidates still require a passing CI run for their commit (OPS-10). |
| 2026-11-04 | CI/CD follows the project owner's definitions: SemVer with build metadata, release candidates promoted without a rebuild, immutable `v*` tags, images in the GitHub Container Registry. Staging runs on the owner's LAN server, not reachable from the internet, with HTTPS from Caddy's local CA, and is restored from the latest off-site backup, which doubles as a restore drill (sw-architecture.md 23). |
| 2026-11-10 | **Invitation code: 6 characters with a global limit on failed attempts** (sw-architecture.md 9.6.1, INV-01, INV-12). The code is typed from a printed card, so it has to be short. Considered: 12 characters (60 bits) and 8 characters (40 bits), both safe with the per-address limit alone; 4 characters (20 bits), rejected because one guess hits a valid code with a probability of about 1 in 5,000 and a guesser with a few addresses would find a VIP account within days; 4 characters plus the guest name, rejected because names are not secret, it needs a per-invitation lockout that lets anyone lock a guest out, exact name matching, and a lookup by name instead of by code. Chosen: 6 characters from 32 letters and digits without look-alikes (30 bits, about 1 billion codes, a few hundred valid), no separator. One address can make 20 failed attempts per 15 minutes (about 7 years to find one code; successful ones do not count, since guests share the venue's address), but a guesser with many addresses would find one within days, so there is also a global limit of 100 failed attempts per hour across all addresses (a code that does not exist, or is redeemed, expired, revoked or replaced); beyond it every redemption call answers `429` until the hour is over, which makes the search take years. Successful redemptions do not count. The windows are fixed and kept in memory, so around a window boundary up to twice the limit passes and a restart resets them; the search still takes years. Accepted downside: someone can block all redemptions for an hour by failing on purpose; the admin can still hand a code over. Revisit if guests are often blocked, or if the number of invitations grows well beyond a few hundred. |
| 2026-11-10 | **UX mocks and the game world's interaction model** ([mocks/](mocks/README.md); GAME-05, GAME-06, GAME-14 – GAME-18, MAP-03, MAP-08, MAP-15). Clickable mocks were reviewed screen by screen; frontend steps follow them. In the game, the button bar stays at the top (Programme, RSVP, Upload, Website), with no buttons at the bottom and no event-day "now / next". Everything else is reached through the world: map objects are `portal` (to another scene, shown as a wobbling arrow), `clickable` (sparkles now and then; tapping walks the avatar there and runs its action) or `decoration`. Each map's clickable objects come from its Tiled file and the admin assigns their actions (page overlay, content, dialogue, minigame) per map in the view "Spielwelt", with Tiled presets as defaults; portal targets stay in Tiled. Considered: more buttons on top of the game (profile and table finder at the bottom), rejected because they cover the world. |
| 2026-11-10 | **Smaller requirement changes from the mock review.** Sign-in with username or verified email; a verified address belongs to one account; the email stays optional (ACC-16). The own figure can't be hidden (PRES-04). The programme shows only invited parts (WEB-09). Text limits 140 / 1000 characters (PHO-15). Photo download (PHO-19). Upload QR now and then on the event screen (SCR-07). Pending companion requests editable, with a note (RSVP-10). |

## Open points

- **Gift list (optional feature, undecided):** the couple's wishes, which guests reserve or pledge a share of (e.g. a travel fund). No payments through the platform: bank details or TWINT QR code only, and the platform records pledges. Other guests don't see who gave what, and the couple gets an overview. Estimated effort ~3–4 points, value +0.5 to 1. If wanted: feature toggle `giftList`, priority Could. Build it only if the couple wants a gift list.
- **Load test tool (PERF-01):** see `test-strategy.md`, section 6.2.
- **Make the repository public (OPS-12, decided, not done yet):** GitHub enforces tag rulesets on private repositories only with a paid Team plan. The repository is made public so the `v*` tag ruleset (no moving, no deleting) takes effect; the history was checked for secrets and personal data on 2026-11-04 (none found). Afterwards: allow workflows of fork pull requests only after approval, and decide whether the GHCR image becomes public too. OPS-12 is recorded in the manual test protocol once a candidate tag cannot be deleted.
