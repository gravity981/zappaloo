# Zappaloo – Specification

Zappaloo is a reusable digital event platform (e.g. for weddings) that combines a classic, responsive event website with a browser-based multiplayer pixel-art game world. Both draw on one central content and data base. Guests can explore the event venues with their own avatar, meet other guests, play minigames with central highscores, and upload photos via QR codes.

This folder is the **source of truth**. The code implements the spec. When the code and the spec disagree, either the code gets fixed or the spec gets changed explicitly. Silent deviations are not allowed.

## Document index

| Document | Content |
|---|---|
| [README.md](README.md) | Purpose, document index, conventions, topic status, decisions |
| [sw-architecture.md](sw-architecture.md) | Concept, architecture, technology choices, and all requirement tables |
| [test-strategy.md](test-strategy.md) | Test levels, tooling, requirement traceability, "not yet implemented" list |

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
| GAME | Game world, movement, interactive objects | 3 | 11 | 4 | specified |
| MP | Multiplayer | 3, 17.1 | 6 | 5 | specified |
| MG | Minigames, results, highscores | 4 | 11 | 7 | specified |
| WEB | Classic website | 5 | 6 | 3, 6, 7 | specified |
| LANG | Language and i18n | 5.3 | 2 | 1, 3 | specified |
| CNT | Shared content base, Markdown editing | 6 | 5 | 3 | specified |
| ACC | User accounts, authentication, email | 7 | 12 | 2 | specified |
| AVA | Avatars | 7.3 | 4 | 4 | specified |
| ROLE | Roles and staff capabilities | 8 | 9 (1 withdrawn) | 2 | specified |
| INV | VIP invitation system | 9 | 14 | 2 | specified |
| ACS | Anonymous access, self-registration, access control | 10, 11 | 8 | 2, 5 | specified |
| GRP | Guest groups | 12 | 2 | 2 | specified |
| PHO | Photo upload and gallery | 13 | 12 (1 withdrawn) | 6 | specified |
| GB | Guestbook | 13.6 | 4 | 6 | specified |
| MAP | Tiled maps and level editor | 14 | 11 | 4 | specified |
| DATA | Database and data model | 18 | 4 | 1, 2 | specified |
| CFG | Event configuration, installation model | 19, 20 | 5 | 2, 3 | specified |
| OPS | Hosting, deployment, backups, CI/CD | 21–23 | 7 | 1, 8 | specified |
| SEC | Security and privacy (Swiss FADP) | 24 | 10 | 1, 2, 3, 8 | specified |
| PERF | Performance and load | 25 | 3 | 5, 6, 8 | specified |
| | **Total** | | **146** (148 IDs, 2 withdrawn) | | |

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
| 2026-11-04 | Maps are imported at runtime through an admin level editor. Portal targets (map/spawn, minigame, website page) are assigned in the editor (MAP-05–11). |
| 2026-11-04 | Website content is edited in the browser as Markdown (CNT-05). `events/<slug>/` only bootstraps an installation, and settings can be changed at runtime (CFG-02, CFG-05). |
| 2026-11-04 | Email goes through SMTP, with Infomaniak mail as proof of concept (ACC-11). Invitation accounts are `unverified` without verification. Password reset by email works only for verified addresses, and otherwise an admin creates a one-time link (ACC-02/03/09/10). |
| 2026-11-04 | Invitations are printed with a QR code and exported at creation time (INV-14). |
| 2026-11-04 | Features that add data (photo upload, guestbook, minigame results) and the gallery require sign-in. Anonymous upload is withdrawn (ACS-04, PHO-04). |
| 2026-11-04 | Guestbook: text plus optional photo, moderated, website only, reachable through portals (GB-01–04). |
| 2026-11-04 | Photo processing runs in a worker queue (PHO-13). |
| 2026-11-04 | German UI. i18n from the start, and content is stored with language keys (LANG-01/02). |
| 2026-11-04 | Privacy follows the Swiss FADP (revDSG). Shutdown flow: notice email, export, then automatic deletion. Whole site noindex (SEC-04–10). |
| 2026-11-04 | Out of scope v1: chat, platform administration (ROLE-10 withdrawn), multi-event installations (section 30). |
| 2026-11-04 | Order of work: 8 stages, deployed from stage 1, with admin functions built per topic (section 28). |

## Open points

- **Guestbook moderation:** the spec currently reuses the `moderatePhotos` capability for guestbook entries (ROLE-06, GB-02). Should there be a separate `moderateGuestbook` capability instead?
- **Unverified self-registered accounts:** what can a self-registered user do before verifying their email (ACC-02)? Everything, sign-in only, or nothing?
- **Anonymous players in the game world:** with `anonymousAccess` enabled, which avatar and name do anonymous players show to others? Or do they appear at all?
- **Portal to a website page:** does the page open as an overlay above the paused game, or does the browser navigate to the website (GAME-11)?
- **Verifying requirements that can't be fully automated** and the load test tool: see `test-strategy.md`, section 6.
