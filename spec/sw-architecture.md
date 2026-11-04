# Zappaloo – Software Architecture and Implementation Concept

**Claim:** Tiny world. Big moments.

**Platform description:** A playful digital world for shared experiences and special occasions.

> **How to read this document.** The prose describes the concept and architecture. Binding requirements are listed in a **Requirements** table at the end of each topic section. Requirement IDs follow the scheme `<PREFIX>-<nn>` (see [README.md](README.md)); they are never renumbered or reused. Priorities: **Must** (mandatory for the first production event), **Should** (expected, may be deferred with good reason), **Could** (optional).

---

# Contents

- [1. Project Vision](#1-project-vision)
- [2. Core Concept and User Experience](#2-core-concept-and-user-experience)
  - [2.1 Two Ways In](#21-two-ways-in)
  - [2.2 Connection Between Website and Game World](#22-connection-between-website-and-game-world)
- [3. Game World](#3-game-world)
  - [3.1 Top-Down Pixel-Art World](#31-top-down-pixel-art-world)
  - [3.2 Representation of the Real Venues](#32-representation-of-the-real-venues)
  - [3.3 Multiplayer](#33-multiplayer)
  - [3.4 Interactive Objects and NPCs](#34-interactive-objects-and-npcs)
  - [3.5 Movement and Controls](#35-movement-and-controls)
  - [3.6 Requirements](#36-requirements)
- [4. Minigames and Central Result Management](#4-minigames-and-central-result-management)
  - [4.1 Technical Implementation](#41-technical-implementation)
  - [4.2 Data Exchange Between Zappaloo and Minigames](#42-data-exchange-between-zappaloo-and-minigames)
  - [4.3 Central Minigame API](#43-central-minigame-api)
  - [4.4 Central Highscore Management](#44-central-highscore-management)
  - [4.5 Result Storage](#45-result-storage)
  - [4.6 Security and Tamper Protection](#46-security-and-tamper-protection)
  - [4.7 Requirements](#47-requirements)
- [5. Classic Website](#5-classic-website)
  - [5.1 Possible Pages and Content](#51-possible-pages-and-content)
  - [5.2 Responsive Design](#52-responsive-design)
  - [5.3 Language](#53-language)
  - [5.4 Requirements](#54-requirements)
- [6. Shared Content and Data Base](#6-shared-content-and-data-base)
  - [6.1 Requirements](#61-requirements)
- [7. User Accounts, Registration and Avatars](#7-user-accounts-registration-and-avatars)
  - [7.1 User Accounts](#71-user-accounts)
  - [7.2 Registration and Invitations](#72-registration-and-invitations)
  - [7.3 Avatar Editor](#73-avatar-editor)
  - [7.4 Requirements](#74-requirements)
- [8. Roles and Permissions](#8-roles-and-permissions)
  - [8.1 Visitor](#81-visitor)
  - [8.2 VIP](#82-vip)
  - [8.3 Staff](#83-staff)
  - [8.4 Admin](#84-admin)
  - [8.5 Combining and Revoking Roles](#85-combining-and-revoking-roles)
  - [8.6 Platform Administration](#86-platform-administration)
  - [8.7 Requirements](#87-requirements)
- [9. VIP Invitation System](#9-vip-invitation-system)
  - [9.1 Properties of Personal Invitation Codes](#91-properties-of-personal-invitation-codes)
  - [9.2 Redeeming a Code](#92-redeeming-a-code)
  - [9.3 VIP Status After Redemption](#93-vip-status-after-redemption)
  - [9.4 VIP Assignment by an Admin](#94-vip-assignment-by-an-admin)
  - [9.5 Security](#95-security)
  - [9.6 Requirements](#96-requirements)
- [10. Anonymous Access and Self-Registration](#10-anonymous-access-and-self-registration)
  - [10.1 Shared Setting anonymousAccess](#101-shared-setting-anonymousaccess)
  - [10.2 Self-Registration visitorSelfRegistration](#102-self-registration-visitorselfregistration)
  - [10.3 Features That Add Data](#103-features-that-add-data)
- [11. Access Control and Unlock Conditions](#11-access-control-and-unlock-conditions)
  - [11.1 Server-Side Enforcement](#111-server-side-enforcement)
  - [11.2 Requirements (Sections 10 and 11)](#112-requirements-sections-10-and-11)
- [12. Guest Groups](#12-guest-groups)
  - [12.1 Requirements](#121-requirements)
- [13. Photo Upload, Photo Gallery and Guestbook](#13-photo-upload-photo-gallery-and-guestbook)
  - [13.1 QR Code Upload](#131-qr-code-upload)
  - [13.2 Upload Flow](#132-upload-flow)
  - [13.3 Sign-In for Upload](#133-sign-in-for-upload)
  - [13.4 Photo Security and Processing](#134-photo-security-and-processing)
  - [13.5 Photo Gallery and Publication](#135-photo-gallery-and-publication)
  - [13.6 Guestbook](#136-guestbook)
  - [13.7 Requirements](#137-requirements)
- [14. Map Editor: Tiled](#14-map-editor-tiled)
  - [14.1 Map Structure](#141-map-structure)
  - [14.2 Object Properties](#142-object-properties)
  - [14.3 Export and Import](#143-export-and-import)
  - [14.4 Level Editor](#144-level-editor)
  - [14.5 Requirements](#145-requirements)
- [15. Technology Stack](#15-technology-stack)
- [16. Frontend Architecture](#16-frontend-architecture)
- [17. Backend Architecture](#17-backend-architecture)
  - [17.1 Multiplayer Server](#171-multiplayer-server)
  - [17.2 API](#172-api)
- [18. Database and Data Model](#18-database-and-data-model)
  - [18.1 Event Reference](#181-event-reference)
  - [18.2 Requirements](#182-requirements)
- [19. Reusability and Event Configuration](#19-reusability-and-event-configuration)
  - [19.1 Basic Principle](#191-basic-principle)
  - [19.2 Example Bootstrap Directory](#192-example-bootstrap-directory)
  - [19.3 Example event.json](#193-example-eventjson)
  - [19.4 Configurability](#194-configurability)
- [20. Installation and Operating Model](#20-installation-and-operating-model)
  - [20.1 Later Multi-Event Extension](#201-later-multi-event-extension)
  - [20.2 Requirements (Sections 19 and 20)](#202-requirements-sections-19-and-20)
- [21. Hosting and Server Infrastructure](#21-hosting-and-server-infrastructure)
  - [21.1 Domain](#211-domain)
  - [21.2 HTTPS and WebSockets](#212-https-and-websockets)
  - [21.3 Firewall](#213-firewall)
- [22. Docker and Deployment](#22-docker-and-deployment)
  - [22.1 Persistent Data](#221-persistent-data)
  - [22.2 Backups](#222-backups)
- [23. GitHub and CI/CD](#23-github-and-cicd)
  - [23.1 Requirements (Sections 21–23)](#231-requirements-sections-2123)
- [24. Security and Privacy](#24-security-and-privacy)
  - [24.1 Requirements](#241-requirements)
- [25. Performance, Scaling and Tests](#25-performance-scaling-and-tests)
  - [25.1 Performance Measures](#251-performance-measures)
  - [25.2 Test Areas](#252-test-areas)
  - [25.3 Requirements](#253-requirements)
- [26. Proposed Project Structure](#26-proposed-project-structure)
- [27. Summary of Architecture Decisions](#27-summary-of-architecture-decisions)
- [28. Development Strategy and Order of Work](#28-development-strategy-and-order-of-work)
  - [Stage 1 – Walking Skeleton and Deployment](#stage-1--walking-skeleton-and-deployment)
  - [Stage 2 – Accounts, Roles and Access](#stage-2--accounts-roles-and-access)
  - [Stage 3 – Content and Website](#stage-3--content-and-website)
  - [Stage 4 – Game World and Level Editor](#stage-4--game-world-and-level-editor)
  - [Stage 5 – Multiplayer](#stage-5--multiplayer)
  - [Stage 6 – Photos and Guestbook](#stage-6--photos-and-guestbook)
  - [Stage 7 – Minigames and Highscores](#stage-7--minigames-and-highscores)
  - [Stage 8 – Event Readiness and Shutdown](#stage-8--event-readiness-and-shutdown)
  - [Event Operation and Follow-Up (not a development stage)](#event-operation-and-follow-up-not-a-development-stage)
- [29. Guiding Idea and Core Principles of Zappaloo](#29-guiding-idea-and-core-principles-of-zappaloo)
  - [Zappaloo accompanies an event before, during and after](#zappaloo-accompanies-an-event-before-during-and-after)
  - [One platform, many individual worlds](#one-platform-many-individual-worlds)
  - [Core principles](#core-principles)
- [30. Out of Scope for the First Version](#30-out-of-scope-for-the-first-version)

---

# 1. Project Vision

Zappaloo is a reusable digital event platform that combines a classic event website with an interactive multiplayer pixel-art game world.

The platform is meant to do more than provide information about a wedding or another private occasion: it accompanies guests before, during and after the event.

Zappaloo consists of two connected experiences:

1. **Interactive pixel-art game world:** Guests move freely with their own avatar through a digital representation of the event venues, meet other guests, interact with objects and NPCs, and discover minigames.
2. **Classic website:** All important information about the event is accessible in a clear, responsive way, without the game world.

Both parts use the same central data and content base. Information therefore only needs to be maintained once and is available both on the website and in the game world.

Zappaloo aims to create an experience that goes beyond an ordinary event website: it informs, connects people, entertains and preserves shared memories.

---

# 2. Core Concept and User Experience

## 2.1 Two Ways In

The platform offers two equivalent ways in:

**Pixel-art game world**
- Top-down perspective.
- Individually customisable avatars.
- Multiplayer with other guests.
- Several connected areas.
- Interactive objects, NPCs and information points.
- Minigames and easter eggs.
- Shared exploration of the digital event world.

**Classic website**
- Responsive layout for desktop, tablet and smartphone.
- Event information.
- Programme and schedule.
- Venues and directions.
- Parking and accommodation.
- FAQ and contact information.
- Photo upload, photo gallery and guestbook.
- Further event-related content.

The website must remain fully usable for anyone who does not want to use the game world.

## 2.2 Connection Between Website and Game World

The website and the game world are not independent products.

They use the same event data. Information stored for an NPC in the game world, for example, can also appear on a classic information page.

Examples:
- An NPC explains the schedule of the day.
- The same information is available on the website under "Programme".
- A building in the game world represents the actual venue.
- The corresponding website page contains the address, directions and other practical information.
- A minigame stores its results centrally in Zappaloo.
- A highscore list can be shown both in the minigame and on the website.

---

# 3. Game World

## 3.1 Top-Down Pixel-Art World

The game world is shown in a classic top-down perspective.

Guests move their personal avatar through a digital world modelled on the actual event venues.

The environment consists of:
- Paths and squares.
- Buildings and interiors.
- Plants, trees and decorations.
- Furniture and items.
- NPCs and interactive objects.
- Transitions between areas.

The game world should have its own visual character and invite exploration.

## 3.2 Representation of the Real Venues

The digital areas follow the actual sequence of the event.

Example for a wedding:

1. Church
2. Garden for the aperitif
3. Banquet hall for dinner
4. Party area

The areas are connected in a logical order.

The game world can be fully explored before the event. By default it is not automatically locked or unlocked according to the real schedule.

## 3.3 Multiplayer

Each area, or map, is its own multiplayer room.

Guests on the same map can see each other and move around together.

Functions:
- See other avatars.
- Watch other players move.
- Explore together.
- Interact with objects.
- Meet other guests.

The server manages the multiplayer rooms and synchronises the relevant game state.

## 3.4 Interactive Objects and NPCs

The game world contains several kinds of interactive objects.

Examples:
- NPCs with dialogues.
- Information signs.
- Buildings with further information.
- Items with easter eggs.
- Transitions to other areas.
- Portals to minigames and website pages.

Objects are defined through generic types:

- `portal`: leads to another map (at a spawn point), to a minigame, or to a website page (e.g. guestbook, photo upload, gallery, programme).
- `dialog`: shows a dialogue, e.g. an NPC conversation.
- `information`: shows a content item that is shared with the website.
- `decoration`: no interaction.

The concrete behaviour is determined by the object type and its configuration. Objects are placed in Tiled; portal targets are assigned in the admin level editor (see section 14).

## 3.5 Movement and Controls

Avatars move smoothly in all directions, not tile by tile.

- **Desktop:** arrow keys; pressing two keys moves diagonally.
- **Smartphone and tablet:** tap-to-move. The client computes a path around the map's collision areas and the avatar walks it.

Avatars collide with the collision areas of the map. There are **no collisions between players**: avatars can pass through each other. This prevents players from blocking doors and portals and keeps synchronisation simple (see 17.1).

## 3.6 Requirements

| ID | Requirement | Prio |
|---|---|---|
| GAME-01 | The game world is rendered in the browser as a top-down pixel-art world using Phaser. | Must |
| GAME-02 | Avatars move smoothly in all directions and collide with the collision areas of the map; the camera follows the player's avatar. | Must |
| GAME-03 | The world consists of several maps (areas) that are connected in a logical order via portals. | Must |
| GAME-04 | The whole world can be explored before the event; by default no area is locked or unlocked automatically according to the real schedule. | Must |
| GAME-05 | Interactive objects are defined through the generic types `portal`, `dialog`, `information` and `decoration`; their behaviour is determined by type and configuration. | Must |
| GAME-06 | Interacting with an object can open a dialogue or show a content item shared with the website; a portal leads to another map at a spawn point, starts a minigame, or opens a website page. | Must |
| GAME-07 | Controls and display of the game world are suitable for the intended screen sizes (desktop and smartphone). | Must |
| GAME-08 | The world can contain easter eggs (hidden interactive objects with special content). | Could |
| GAME-09 | On desktop, the avatar is controlled with the arrow keys; pressing two keys moves diagonally. | Must |
| GAME-10 | On touch devices, the avatar is controlled by tap-to-move: the client computes a path around the map's collision areas and the avatar walks it. | Must |
| GAME-11 | When a portal opens a website page, the player can return to the game world at the previous position. | Must |
| MP-01 | Each map is a separate multiplayer room managed by the server. | Must |
| MP-02 | Players on the same map see the avatars and movements of the other players in that room in near real time. | Must |
| MP-03 | Passing through a portal moves the player from the current room to the target map's room at the configured target spawn point. | Must |
| MP-04 | Each client simulates its own avatar's movement; the server validates every position update (speed within the limit, no crossing of collision areas, inside the map) and, if a check fails, keeps the last valid position and sends it back to the client. | Must |
| MP-05 | The movement of other players is interpolated between server updates so that it appears smooth. | Must |
| MP-06 | There are no collisions between players; avatars can pass through each other. | Must |

---

# 4. Minigames and Central Result Management

Minigames are a separate part of Zappaloo. They do not work in isolation; they communicate with the central platform.

## 4.1 Technical Implementation

Minigames are implemented as separate Phaser scenes.

Minigames ship with the platform: their code and their content (questions, tasks, levels) are part of the platform code and change only with a deployment. Each minigame is registered under a unique `minigameId`. In the game world, a minigame is started through a portal whose target is set to that minigame in the level editor.

When a minigame starts:
1. The current game world is paused.
2. The minigame is started as its own scene.
3. Zappaloo provides the necessary data.
4. The minigame runs independently of the main world movement.
5. When it ends, the minigame is closed.
6. The main world resumes at the previous position.

This allows different minigames to be developed without changing the underlying game world.

## 4.2 Data Exchange Between Zappaloo and Minigames

Data exchange must work in both directions.

**Zappaloo passes to a minigame:**
- User ID.
- User name.
- Avatar or relevant profile information.
- Event ID and event information.
- Minigame ID.
- Existing results and progress, where relevant.

Only the data that the minigame actually needs is passed.

**A minigame passes to Zappaloo:**
- Score.
- Game result.
- Time taken.
- Number of attempts.
- Answers and quiz results.
- Collected items.
- Progress.
- Achievements.
- Other minigame-specific results.

The platform must not be limited to one particular minigame format. The result structure must therefore be sufficiently flexible.

## 4.3 Central Minigame API

Communication goes through a central minigame API, i.e. a dedicated backend module.

This module is responsible for:

- Providing the required user and event data.
- Providing existing results and progress.
- Accepting new results.
- Validating submitted results on the server.
- Storing results.
- Computing personal bests.
- Building highscore lists and leaderboards.
- Making results available to other parts of the platform.

Minigames do not access the database directly. They communicate with the backend through the designated interfaces.

## 4.4 Central Highscore Management

Highscores are managed centrally by Zappaloo and not stored or computed separately by each minigame.

Leaderboards can therefore be shown in several places:

- Directly inside a minigame.
- As a leaderboard on the classic website.
- As an information panel in the game world.
- As personal statistics of a user.

Possible views:
- Best results of an event.
- Personal best.
- Current rank of a player.
- Top players of a minigame.
- Number of attempts played.
- Further statistics.

The platform should support multiple attempts per user. Both the best result and the individual attempts can be stored.

## 4.5 Result Storage

A result record must contain at least:

| Field | Description |
|---|---|
| `eventId` | Associated event |
| `userId` | Player |
| `minigameId` | Associated minigame |
| `score` | Score achieved |
| `duration` | Play time |
| `resultData` | Further results and metadata |
| `createdAt` | Time of storage |

The structure can be extended with further fields if needed.

The data must be structured so that different minigames can store their own results without a separate database structure per minigame.

## 4.6 Security and Tamper Protection

Submitted results must not be accepted blindly as correct.

The backend must check at least:
- Is the user authenticated?
- Does the user belong to the event?
- Is the minigame accessible to this user?
- Is the submitted minigame ID valid?
- Are score, duration and results plausible?
- Is the submission allowed for this attempt?

Protection is proportionate to a private event:

- Every attempt starts with a server-issued attempt ID; a result is accepted only for an open attempt of the same user.
- Each minigame defines a plausibility profile, e.g. maximum score and minimum duration, which the server checks.
- For quizzes, answers are checked on the server and the correct answers are never sent to the client.

## 4.7 Requirements

| ID | Requirement | Prio |
|---|---|---|
| MG-01 | Minigames run as separate Phaser scenes; the game world is paused when a minigame starts and resumes at the previous position when it ends. | Must |
| MG-02 | The platform passes to a minigame only the data it needs, from: user ID, user name, avatar/profile info, event ID and info, minigame ID, and existing results/progress. | Must |
| MG-03 | A minigame submits its results through the central minigame API; the result structure is flexible (score, result, duration, attempts, answers, items, progress, achievements, minigame-specific data). | Must |
| MG-04 | Minigames never access the database directly; all reads and writes go through backend interfaces. | Must |
| MG-05 | Each result record contains at least `eventId`, `userId`, `minigameId`, `score`, `duration`, `resultData` and `createdAt`; all minigames share one generic storage structure. | Must |
| MG-06 | Multiple attempts per user are supported; individual attempts are stored and the personal best is derived from them. | Must |
| MG-07 | The server rejects a result submission unless the user is authenticated, belongs to the event, may access the minigame, the minigame ID is valid, score/duration/results are plausible, and the submission is allowed for this attempt. | Must |
| MG-08 | Each attempt starts with a server-issued attempt ID and a result is accepted only for an open attempt of the same user; the server checks each minigame's plausibility profile (e.g. maximum score, minimum duration); quiz answers are checked on the server and correct answers are never sent to the client. | Must |
| MG-09 | Highscores are managed centrally: best results of the event, personal best, current rank, top players per minigame and number of attempts. | Must |
| MG-10 | Leaderboards can be shown inside a minigame, on the website, as an information panel in the game world, and as personal statistics. | Should |
| MG-11 | Minigames, including their content, ship with the platform code and are registered under a unique `minigameId`; the level editor offers all registered minigames as portal targets. | Must |

---

# 5. Classic Website

The website is a full part of the platform, not just an add-on to the game world.

It must work independently of Phaser and make all important information accessible.

## 5.1 Possible Pages and Content

- Home page.
- Event description.
- Programme and schedule.
- Venues.
- Travel and directions.
- Parking.
- Accommodation.
- FAQ.
- Contact.
- Guest information.
- Photo upload.
- Photo gallery.
- Guestbook.
- Highscore and minigame overviews.
- Further event-related pages.

The actual pages and content can differ per event.

## 5.2 Responsive Design

The website must work well on:
- Smartphones.
- Tablets.
- Desktop computers.

Photo upload is optimised especially for smartphones.

The game world can also be opened in the browser. Its controls and display must suit the intended screen sizes.

## 5.3 Language

The UI is in German. Translation is planned from the start: all UI strings are externalised through an i18n framework, and every content item is stored with a language key (see section 6). Further languages can then be added without code changes.

## 5.4 Requirements

| ID | Requirement | Prio |
|---|---|---|
| WEB-01 | The website is fully usable without the game world and does not depend on Phaser. | Must |
| WEB-02 | The website provides pages for: home, event description, programme/schedule, venues, travel/directions, parking, accommodation, FAQ, contact and guest information. | Must |
| WEB-03 | The set of pages and their content is configurable per event. | Must |
| WEB-04 | The website renders and is usable on smartphones, tablets and desktop computers. | Must |
| WEB-05 | The website offers highscore and minigame overview pages. | Should |
| WEB-06 | The website gives access to photo upload, photo gallery and guestbook (see PHO, GB). | Must |
| LANG-01 | All UI strings are externalised through an i18n framework; German is the default and initially only UI language. | Must |
| LANG-02 | Every content item (pages, dialogues, NPC texts, information objects) is stored with a language key; initially only German (`de`) is maintained. | Must |

---

# 6. Shared Content and Data Base

Website and game world use the same central event data base.

Content must not have to be maintained twice.

Example content areas:
- Event information.
- Schedule.
- Places and addresses.
- Dialogues.
- NPC texts.
- Information objects.
- FAQ.
- Website pages.
- Photo albums.
- Unlock conditions.

The data is stored in a structured way and served by the backend.

Website pages and other texts are edited in the browser using Markdown with a preview, by admins and by staff with `editWebsiteContent`. Changes are live without a redeployment. Rendered Markdown is sanitised.

A piece of content may be presented differently depending on context. A venue, for example, can appear as an information page on the website and as an interactive building in the game world.

The platform therefore separates:
- Content and data.
- Presentation on the website.
- Presentation in the game world.
- Interaction logic.

## 6.1 Requirements

| ID | Requirement | Prio |
|---|---|---|
| CNT-01 | Website and game world use one central event content base; each piece of content is maintained once. | Must |
| CNT-02 | The content base covers event information, schedule, places/addresses, dialogues, NPC texts, information objects, FAQ, website pages, photo albums and unlock conditions. | Must |
| CNT-03 | Content is separate from its presentation; the same content item can be shown as a website page and referenced from a game-world object (e.g. via `contentId`). | Must |
| CNT-04 | Content is stored in a structured form and served through the backend API. | Must |
| CNT-05 | Admins and staff with `editWebsiteContent` edit website pages and other content texts in the browser using Markdown with a preview; changes are live without a redeployment. | Must |

---

# 7. User Accounts, Registration and Avatars

## 7.1 User Accounts

Guests can create their own user account and sign in.

Planned functions:
- Registration.
- Login and logout.
- Email verification.
- Password reset.
- User profile.
- Management of one's own avatar.
- Event memberships and roles.

Authentication is done on the server through secure sessions.

Passwords are stored only using a suitable password-hashing algorithm.

**Email**

- Emails (verification, password reset, shutdown notice) are sent through an SMTP provider configured per installation. Infomaniak mail is used for the first installation (proof of concept).
- Self-registered accounts must verify their email address.
- Accounts created by redeeming an invitation (printed card with QR code) need no verification. Their email status stays `unverified` until the user verifies it voluntarily from the profile.
- Password reset by email is only offered for verified addresses. Otherwise a mistyped address would let a stranger take over the account. Users without a verified address ask an admin, who can create a one-time password-reset link and hand it over.

Users can delete their own account and their own content at any time.

## 7.2 Registration and Invitations

Registration can be restricted per event.

Possible settings:
- Public self-registration.
- Registration only with a valid invitation.
- Registration via a personal invitation link or invitation code.

Disabled self-registration must not prevent the redemption of a valid personal VIP invitation.

A user may already have an account and redeem an invitation later.

In that case the existing account is used. No second account is created.

## 7.3 Avatar Editor

Every signed-in user can design their own pixel-art avatar.

Possible customisations:
- Skin colour.
- Hairstyle.
- Hair colour.
- Clothing.
- Clothing colours.
- Accessories.
- Predefined templates.

The avatar configuration is stored with the user or their event membership.

Avatars are based on prepared pixel-art graphics. No AI API is required.

## 7.4 Requirements

| ID | Requirement | Prio |
|---|---|---|
| ACC-01 | Users can register, log in and log out. | Must |
| ACC-02 | Self-registered accounts must verify their email address. | Must |
| ACC-03 | Users with a verified email address can reset a forgotten password by email; no reset email is sent to unverified addresses. | Must |
| ACC-04 | Users have a profile they can view and edit. | Must |
| ACC-05 | Authentication uses server-side sessions with secure session cookies. | Must |
| ACC-06 | Passwords are stored only as hashes produced by a suitable password-hashing algorithm. | Must |
| ACC-07 | A user who already has an account and redeems an invitation keeps that account; no second account is created. | Must |
| ACC-08 | An admin can create user accounts. | Must |
| ACC-09 | Accounts created by redeeming an invitation need no email verification; their email status is `unverified` until the user verifies it from the profile. | Must |
| ACC-10 | An admin can create a one-time password-reset link for a user and hand it over. | Must |
| ACC-11 | Emails are sent through an SMTP provider configured per installation (host, port, credentials, sender address); Infomaniak mail is the first provider. | Must |
| ACC-12 | Users can delete their own account and their own photos and guestbook entries at any time. | Must |
| AVA-01 | A signed-in user can design a pixel-art avatar in an avatar editor (skin colour, hairstyle, hair colour, clothing, clothing colours, accessories, predefined templates). | Must |
| AVA-02 | The avatar configuration is stored with the user or their event membership. | Must |
| AVA-03 | Avatars are composed from prepared pixel-art assets; no AI API is used. | Must |
| AVA-04 | The configured avatar is rendered in the game world for the user and for other players. | Must |

---

# 8. Roles and Permissions

Role management is deliberately kept simple.

There are exactly four fixed roles:

- `visitor`
- `vip`
- `staff`
- `admin`

Roles are per event and can be combined. They are not mutually exclusive.

There is no role editor and no freely definable permissions.

## 8.1 Visitor

Visitor is the normal base role of a registered guest.

A user who self-registers gets the Visitor role by default, provided self-registration is enabled.

Visitor grants normal access to the functions and areas intended for guests.

## 8.2 VIP

VIP extends the normal Visitor rights.

A VIP automatically also has the normal Visitor rights.

VIP can, for example, grant access to exclusive game areas or special content, if configured accordingly.

A VIP can additionally be Staff and/or Admin.

VIP status persists until an administrator explicitly revokes it.

## 8.3 Staff

Staff is a role of its own.

Staff gets access to designated internal areas, for example staff-only areas in the game world.

Staff does not automatically mean VIP.

Additional, fixed capabilities can be enabled for Staff:

- `editWebsiteContent`: create and edit website content (Markdown).
- `moderatePhotos`: review, approve and delete photos and guestbook entries.

These capabilities are defined by the platform. Event administrators can enable or disable them for individual staff members, but cannot create their own permissions.

A "content creator" is therefore not a separate role type but a staff member with `editWebsiteContent` enabled.

## 8.4 Admin

Admin gets the administrative functions for the event.

These include:
- User management.
- Role management.
- Invitation management.
- Event settings.
- Content management.
- Map management in the level editor.
- Photo, gallery and guestbook management.
- Management of event features.
- Data export and shutdown.

Admin does not, however, automatically mean VIP or Staff.

An admin therefore does not automatically get access to VIP or Staff areas of the game world. These accesses must be configured independently of the administrative role.

## 8.5 Combining and Revoking Roles

A user can have, for example, the following combinations:

- Visitor.
- Visitor + VIP.
- Visitor + Staff.
- Visitor + VIP + Staff.
- Visitor + Admin.
- Visitor + VIP + Admin.
- Visitor + VIP + Staff + Admin.

Revoking one role must not change the other roles.

If VIP is revoked, the user remains Visitor. Existing Staff or Admin rights also remain.

## 8.6 Platform Administration

Besides event administration there is a separate platform administration.

The platform administrator can manage all events and installations.

This role is not the same as the per-event Admin role.

Platform administration is out of scope for the first version, since each installation serves one event (see section 30).

## 8.7 Requirements

| ID | Requirement | Prio |
|---|---|---|
| ROLE-01 | There are exactly four fixed roles — `visitor`, `vip`, `staff`, `admin` — assigned per event and freely combinable; there is no role editor and no custom permission. | Must |
| ROLE-02 | A self-registered user gets the `visitor` role. | Must |
| ROLE-03 | `vip` includes all `visitor` rights and can grant access to areas and content configured for VIPs. | Must |
| ROLE-04 | VIP status persists until an admin explicitly revokes it. | Must |
| ROLE-05 | `staff` grants access to staff-only areas and does not imply `vip`. | Must |
| ROLE-06 | An admin can enable or disable the fixed capabilities `editWebsiteContent` (website content) and `moderatePhotos` (photos and guestbook entries) per staff member; only staff members with the capability can use the corresponding function. | Must |
| ROLE-07 | `admin` grants the event administration functions: users, roles, invitations, guest groups, event settings and features, website content, maps (level editor), photos/gallery/guestbook, data export and shutdown. | Must |
| ROLE-08 | `admin` does not imply `vip` or `staff`; an admin without those roles has no access to VIP or staff areas. | Must |
| ROLE-09 | Revoking one role leaves all other roles of the user unchanged; a user whose VIP is revoked remains Visitor. | Must |
| ROLE-10 | ~~A separate platform administrator, distinct from the event `admin` role, can manage all events and installations.~~ (withdrawn: out of scope, see section 30) | – |

---

# 9. VIP Invitation System

Every invited guest basically receives a personal VIP invitation code or a personal invitation link.

A code can be redeemed exactly once.

## 9.1 Properties of Personal Invitation Codes

- Each code has a unique, randomly generated token.
- Only a hash of the token is stored in the database.
- Each code belongs to one personal invitation.
- A code can be redeemed only once.
- A code can have an expiry date.
- A code can be revoked by an admin.
- A code can be replaced or regenerated.
- When a code is replaced, the old code becomes invalid.

Invitations are printed, e.g. on cards, with the code and a QR code containing the personal invitation link. Because only the hash is stored, the plain token is available only when the invitation is created or regenerated. Printing uses that output; a lost card is replaced by regenerating the code.

Possible status values:

- `active`
- `redeemed`
- `expired`
- `revoked`
- `replaced`

## 9.2 Redeeming a Code

A code can be redeemed in two ways:

1. A new guest registers and redeems their personal code in the process.
2. An already registered Visitor signs in and then redeems the code.

In the second case the existing account is upgraded to VIP.

Assigning the VIP role and marking the code as redeemed must happen atomically in one database transaction.

This prevents the same code from being redeemed by several users at the same time.

## 9.3 VIP Status After Redemption

The invitation code and VIP status are independent of each other.

After successful redemption, VIP status remains even if:
- the code later expires,
- the code is later revoked,
- the code is replaced.

VIP status is removed only by an explicit administrative revocation.

A redeemed code remains permanently recorded as redeemed and cannot be reused.

## 9.4 VIP Assignment by an Admin

An administrator can promote an existing Visitor directly to VIP.

No invitation code is needed for this.

This action is recorded in the audit log.

The data must distinguish whether VIP was granted through an invitation code or through direct admin assignment.

Example:

- `assignment_method = invitation_code`
- `assignment_method = admin_promotion`

With a direct admin promotion, no invitation code is created or marked as redeemed.

An existing invitation remains manageable independently.

## 9.5 Security

- Rate limiting for code redemption attempts.
- No storage of plain-text tokens.
- Unique database constraints.
- Logging of administrative actions.
- Server-side validation of all redemptions.

## 9.6 Requirements

| ID | Requirement | Prio |
|---|---|---|
| INV-01 | An admin can create a personal invitation per guest, each with a unique, randomly generated token usable as code or link. | Must |
| INV-02 | Only a hash of the invitation token is stored; plain-text tokens are never persisted. | Must |
| INV-03 | An invitation code can be redeemed exactly once. | Must |
| INV-04 | An invitation code can have an expiry date after which it cannot be redeemed. | Must |
| INV-05 | An admin can revoke a code, and can replace/regenerate it; the replaced code becomes invalid. | Must |
| INV-06 | Each invitation code has exactly one of the statuses `active`, `redeemed`, `expired`, `revoked`, `replaced`. | Must |
| INV-07 | A code can be redeemed either during registration of a new account or by an already signed-in Visitor, whose account is then upgraded to VIP. | Must |
| INV-08 | Assigning VIP and marking the code as redeemed happen atomically in one database transaction; concurrent redemption of the same code by several users is impossible. | Must |
| INV-09 | Once granted, VIP status is independent of the code: later expiry, revocation or replacement of the code does not remove it. | Must |
| INV-10 | A redeemed code stays permanently recorded as redeemed and cannot be reused. | Must |
| INV-11 | An admin can promote a Visitor directly to VIP without a code; the action is audit-logged, the assignment method (`invitation_code` / `admin_promotion`) is recorded, and no code is created or consumed. | Must |
| INV-12 | Code redemption attempts are rate-limited and validated on the server; uniqueness is enforced by database constraints. | Must |
| INV-13 | A valid personal VIP invitation can be redeemed even when `visitorSelfRegistration` is disabled. | Must |
| INV-14 | When invitations are created or regenerated, the admin can export them for printing (code plus QR code with the personal invitation link); the plain token is not available afterwards. | Must |

---

# 10. Anonymous Access and Self-Registration

Anonymous access is controlled by one shared setting for website and game world.

There are no separate settings for anonymous website access and anonymous game world access.

## 10.1 Shared Setting `anonymousAccess`

When `anonymousAccess` is enabled:
- Users who are not signed in can open the classic website.
- Users who are not signed in can enter the public game world.

When `anonymousAccess` is disabled:
- Sign-in is required for both website and game world.

Private or protected areas remain protected either way.

## 10.2 Self-Registration `visitorSelfRegistration`

This setting is independent of `anonymousAccess`.

When `visitorSelfRegistration` is enabled:
- Visitors can create a user account themselves.
- After successful registration they get the Visitor role by default.

When `visitorSelfRegistration` is disabled:
- New accounts can only be created with a valid invitation or by an admin.

A valid personal VIP invitation can be redeemed even when normal self-registration is disabled.

## 10.3 Features That Add Data

Features that add data — photo upload, guestbook, minigame results — and the photo gallery always require sign-in, regardless of `anonymousAccess`.

A QR code at a venue therefore leads to sign-in or registration first, then to the upload page.

---

# 11. Access Control and Unlock Conditions

Not every area and function needs to be accessible to all users.

The platform therefore needs a simple but flexible access system.

Possible conditions:

- Sign-in required.
- Specific role required.
- Membership in a specific guest group.
- Time-based unlock.
- Manual release by an admin.
- Related feature enabled.

Conditions are combined with AND by default.

Where alternative ways in are explicitly intended, they can be combined with OR.

Example:

An area requires:
- Sign-in.
- VIP role.
- Manual release.

All three conditions must be met.

Another area can be released for VIP or Staff as alternatives.

The system must also support combinations such as "sign-in required AND manual release".

## 11.1 Server-Side Enforcement

Access rights must not be checked only in the frontend.

The backend must check permissions in particular for:

- API calls.
- Joining multiplayer rooms.
- Access to private content.
- Access to protected game areas.
- Photo uploads and photo management.
- Minigame starts and result submissions.
- Administrative actions.

When a role is revoked from a user, the corresponding permissions must be re-checked on existing connections as well.

## 11.2 Requirements (Sections 10 and 11)

| ID | Requirement | Prio |
|---|---|---|
| ACS-01 | A single event setting `anonymousAccess` controls anonymous access for both website and game world: when enabled, users who are not signed in can open the website and enter the public game world; when disabled, sign-in is required for both. | Must |
| ACS-02 | Private or protected areas and content stay protected regardless of `anonymousAccess`. | Must |
| ACS-03 | An event setting `visitorSelfRegistration`, independent of `anonymousAccess`, controls self-registration: when enabled, anyone can register and gets `visitor`; when disabled, new accounts can only be created via a valid invitation or by an admin. | Must |
| ACS-04 | Photo upload, photo gallery, guestbook and minigame result submission always require sign-in, regardless of `anonymousAccess`. | Must |
| ACS-05 | Areas, content and functions can be protected by the conditions: sign-in required, role required, guest group membership, time-based unlock, manual admin release, and related feature enabled. | Must |
| ACS-06 | Access conditions are combined with AND by default; explicitly defined alternatives can be combined with OR. | Must |
| ACS-07 | Permissions are enforced on the server for API calls, multiplayer room joins, private content, protected game areas, photo upload and management, minigame start and result submission, and administrative actions. | Must |
| ACS-08 | When a role is revoked, permissions are re-checked on the user's existing connections (e.g. open multiplayer sessions). | Must |

---

# 12. Guest Groups

Besides roles, guest groups can be used for organisation.

Examples:
- Family.
- Friends.
- Best men / bridesmaids.
- Children.
- Team.
- Special guests.

Guest groups are independent of roles.

They can be used, for example, to release certain information or game areas only for a specific group.

Group membership can be managed by an admin.

## 12.1 Requirements

| ID | Requirement | Prio |
|---|---|---|
| GRP-01 | An admin can create guest groups and manage their membership; groups are independent of roles. | Must |
| GRP-02 | Guest group membership can be used as an access condition for content and game areas (see ACS-05). | Must |

---

# 13. Photo Upload, Photo Gallery and Guestbook

Zappaloo lets guests upload photos easily during the event.

The focus is on particularly simple operation on a smartphone.

## 13.1 QR Code Upload

QR codes can be placed at various venues.

Examples:
- Church.
- Aperitif.
- Dinner.
- Party.
- General photo upload.

A QR code opens a matching upload page.

Example:

`https://domain.ch/photos?location=aperitif`

The location is preselected and the photo can be assigned to the matching album.

## 13.2 Upload Flow

The intended flow:

1. The guest scans the QR code.
2. The upload page opens in the browser, after sign-in or registration if needed.
3. The guest taps "Take photo".
4. Camera or file picker opens.
5. The guest sees a preview.
6. The guest confirms the upload.
7. The photo is uploaded.
8. A confirmation is shown.
9. The guest can take another photo right away.

Upload works without a native app.

Important: for security reasons, browsers and operating systems do not allow a QR code to start the camera automatically without user interaction. At least one tap and possibly a permission prompt are necessary.

For camera selection, for example:

`<input type="file" accept="image/*" capture="environment">`

The behaviour must be tested on iOS and Android.

## 13.3 Sign-In for Upload

Upload requires sign-in. Each photo is linked to the uploading user's account.

A guest who scans a QR code without being signed in signs in or registers first and is then taken to the upload page with the location preselected.

## 13.4 Photo Security and Processing

The server must:
- Check file types.
- Limit file sizes.
- Validate uploads.
- Convert images where needed.
- Compress images.
- Create previews and thumbnails.
- Limit abusive uploads.
- Allow moderation and deletion.

Image processing (conversion, compression, thumbnails) runs in a background worker queue with limited concurrency, so that photo uploads don't slow down the multiplayer server.

Supported formats must include in particular JPEG, PNG and HEIC.

The image files themselves are stored on persistent file storage.

Only metadata is stored in SQLite.

## 13.5 Photo Gallery and Publication

The gallery can be managed per event and album.

Possible functions:
- Group photos by location.
- Review and approve photos.
- Delete photos.
- Publish the gallery fully or partially.
- Publish at a specific time.
- Manual release by an admin.

One possible configuration: photos can be uploaded during the event, but the public gallery is only released after the event.

This publication must be controllable without redeploying the platform.

## 13.6 Guestbook

Signed-in guests can write a guestbook entry: a text with an optional photo.

- Entries are moderated: they become visible only after approval by an admin or a staff member with `moderatePhotos`.
- The guestbook is a website page and only accessible to signed-in users. It is not integrated into the game world; a portal can open the guestbook page.
- An optional photo goes through the same validation and processing as photo uploads.

## 13.7 Requirements

| ID | Requirement | Prio |
|---|---|---|
| PHO-01 | A QR code per location leads to the upload page with the location preselected (e.g. `?location=aperitif`), via sign-in or registration if the guest is not signed in; uploaded photos are assigned to the matching album. | Must |
| PHO-02 | The mobile upload flow is: tap "Take photo" → camera or file picker → preview → confirm → upload → confirmation → option to take another photo. | Must |
| PHO-03 | Upload works in the mobile browser without a native app, using a file input with camera capture, on current iOS and Android devices. | Must |
| PHO-04 | ~~Anonymous upload is possible using restricted, revocable upload tokens that grant no other access to the platform.~~ (withdrawn: upload requires sign-in, see ACS-04) | – |
| PHO-05 | Every upload is linked to the uploading user's account. | Must |
| PHO-06 | The server checks the file type, limits the file size and validates each upload; invalid uploads are rejected. | Must |
| PHO-07 | JPEG, PNG and HEIC are accepted; the server converts where needed, compresses, and creates previews and thumbnails. | Must |
| PHO-08 | Abusive uploads are limited (e.g. rate limiting per user). | Must |
| PHO-09 | Image files are stored on persistent file storage; only metadata is stored in SQLite. | Must |
| PHO-10 | The gallery is organised per event and album and can group photos by location. | Must |
| PHO-11 | Admins and staff with `moderatePhotos` can review, approve and delete photos. | Must |
| PHO-12 | The gallery can be published fully or partially, at a scheduled time or by manual admin release, without redeploying the platform. | Must |
| PHO-13 | Image processing runs in a background worker queue with limited concurrency so that uploads don't affect multiplayer responsiveness. | Must |
| GB-01 | Signed-in users can write a guestbook entry consisting of text and an optional photo. | Must |
| GB-02 | A guestbook entry becomes visible only after approval by an admin or a staff member with `moderatePhotos`, who can also delete entries. | Must |
| GB-03 | The guestbook is a website page accessible only to signed-in users; it is not integrated into the game world, but a portal can open it. | Must |
| GB-04 | A guestbook photo is validated and processed like a photo upload (PHO-06, PHO-07, PHO-13). | Must |

---

# 14. Map Editor: Tiled

The game world maps are created with the external map editor **Tiled**.

Website: https://www.mapeditor.org/

Tiled is a free, cross-platform 2D map editor.

It lets maps be assembled visually from individual tiles.

Examples:
- Grass.
- Paths.
- Trees.
- Flowers.
- Buildings.
- Tables.
- Decorations.
- Interiors.

## 14.1 Map Structure

Maps consist of several layers, for example:

- Background.
- Ground.
- Decoration.
- Objects.
- Foreground.
- Collision areas.

Object layers can also be used.

They define, for example:
- Spawn points.
- Collisions.
- Portals.
- NPCs.
- Interaction points.
- Protected zones.

## 14.2 Object Properties

In Tiled, each object gets a `type`, a unique name and the properties that belong to the map itself. Examples:

- Information point: `type = information`, `contentId = parking-info`
- NPC: `type = dialog`, `contentId = npc-pastor`
- Spawn point: `type = spawn`, name e.g. `entrance`
- Portal: `type = portal` (only placed in Tiled)

Portal targets are not set in Tiled but assigned in the level editor (see 14.4). A portal can lead to:

- another map, at a named spawn point;
- a minigame (by `minigameId`);
- a website page (e.g. guestbook, photo upload, gallery, programme).

The engine interprets these generic object types and executes the associated behaviour.

## 14.3 Export and Import

Tiled exports the map as a JSON file. The admin imports it, together with its tilesets, through the level editor; no redeployment is needed.

Phaser loads this data and interprets the layers, objects and properties. The server reads the collision layer to validate movement.

Tiled is only needed to create maps and is not part of the running server.

## 14.4 Level Editor

The admin dashboard contains a simple level editor. It is not a drawing tool, since maps are drawn in Tiled. It manages the maps of the event:

- Import a map (Tiled JSON plus tilesets) as a new map or as a new version of an existing map.
- Validate the import: format, required layers, referenced tilesets, spawn points and portal objects. An invalid import is rejected and the active version stays unchanged.
- Assign each portal's target from lists: map and spawn point, minigame, or website page.
- Flag portals without a target or with a target that no longer exists, e.g. after a map was deleted.
- Set the start map and each map's default spawn point.
- Keep the previous version of each map and allow rollback.

When a map is re-imported while players are on it, they get the new version the next time they enter the map. The admin can force a reload, which moves the players on that map to the default spawn point of the new version.

## 14.5 Requirements

| ID | Requirement | Prio |
|---|---|---|
| MAP-01 | Maps are drawn in Tiled, exported as JSON and imported at runtime through the admin level editor; Tiled is not part of the running system. | Must |
| MAP-02 | The engine supports tile layers (background, ground, decoration, objects, foreground, collision) and object layers defining spawn points, collisions, portals, NPCs, interaction points and protected zones. | Must |
| MAP-03 | The engine interprets the object properties `type` and `contentId` and executes the corresponding behaviour; portal targets come from the level editor. | Must |
| MAP-04 | New or changed maps and tilesets can be imported without a redeployment or code change. | Must |
| MAP-05 | The level editor lists the event's maps and lets the admin import a new map or a new version of an existing map, delete a map, set the start map and set each map's default spawn point. | Must |
| MAP-06 | An import is validated (format, required layers, referenced tilesets, spawn points, portal objects); an invalid import is rejected and the active version stays unchanged. | Must |
| MAP-07 | The admin assigns each portal's target in the level editor: another map at a spawn point, a minigame, or a website page. | Must |
| MAP-08 | The level editor flags portals without a target or with a target that no longer exists. | Must |
| MAP-09 | The previous version of each map is kept and the admin can roll back to it. | Should |
| MAP-10 | When a map is re-imported, players on it get the new version the next time they enter the map; the admin can force a reload that moves them to the default spawn point of the new version. | Must |
| MAP-11 | The server reads each map's collision layer on import and uses it to validate movement (MP-04). | Must |

---

# 15. Technology Stack

The platform is built on a modern TypeScript stack.

| Area | Technology |
|---|---|
| Frontend | React |
| Programming language | TypeScript |
| Build tool | Vite |
| Routing | React Router |
| Game engine | Phaser 4 |
| Map editor | Tiled |
| Backend | Node.js |
| Backend language | TypeScript |
| Multiplayer | Colyseus |
| Real-time communication | WebSockets |
| Database | SQLite |
| Web server / reverse proxy | Caddy |
| Containers | Docker Engine |
| Container orchestration | Docker Compose |
| Version control | GitHub |
| CI/CD | GitHub Actions |
| Unit / integration tests | Vitest |
| End-to-end tests | Playwright |
| Operating system | Ubuntu Server |

The concrete version of each library is pinned in the project's package management.

---

# 16. Frontend Architecture

The frontend is based on React, TypeScript and Vite.

React handles:
- Classic website pages.
- Navigation.
- Login and registration.
- User profiles.
- Avatar editor.
- Dialogues and information windows.
- Admin dashboard.
- Photo upload.
- Photo gallery.
- Guestbook.
- Level editor.
- Highscore views.
- Other UI elements.

Phaser handles:
- Rendering of the game world.
- Player movement.
- Camera.
- Collisions.
- Animations.
- Rendering of avatars.
- Display of other players.
- Interactions within the game world.
- Running minigame scenes.

React and Phaser are connected through clearly defined interfaces.

Example:

`location:open`

Phaser can emit this event when a player interacts with an information object.

React then renders the corresponding dialogue or information panel.

Further possible events:
- `game:interaction`
- `game:portal`
- `game:minigame:start`
- `game:minigame:end`
- `game:player:update`
- `minigame:result:submitted`

---

# 17. Backend Architecture

The backend is initially built as a modular monolith.

There is one central Node.js server with clearly separated functional modules.

Planned modules:

- `auth`
- `users`
- `events`
- `memberships`
- `roles`
- `invitations`
- `avatars`
- `permissions`
- `features`
- `rooms`
- `photos`
- `albums`
- `admin`
- `content`
- `maps`
- `guestbook`
- `minigames`
- `game-results`
- `mail`
- `jobs` (background worker queue)
- `database`
- `services`
- `api`

The modules are logically separated but initially run inside the same application.

This keeps the architecture clear and allows extension later if needed.

A microservice architecture and Kubernetes are not planned for the first version.

## 17.1 Multiplayer Server

Colyseus manages the multiplayer rooms.

The server is responsible for the relevant game state.

This includes:
- Players in a room.
- Player positions.
- Movement states.
- Room changes.
- Synchronisation.
- Relevant interactions.

Movement model:

- Each client simulates its own avatar's movement against the map's collision areas and sends its position to the server.
- The server validates each update: the speed is within the limit, the path from the last position does not cross a collision area, and the position is inside the map. If a check fails, the server keeps the last valid position and sends it back, and the client snaps back.
- Colyseus synchronises the validated positions to the other players in the room, whose clients interpolate between updates.
- There are no collisions between players, so no server-side physics simulation is needed.

The server reads the collision layer of each map when it is imported (see section 14). Other actions (portal use, access to protected zones) are also validated on the server.

## 17.2 API

The classic website, the game world and the minigames communicate with the backend through defined interfaces.

The API provides, among other things:
- Event data.
- User information.
- Content.
- Permissions.
- Game world information.
- Photo and album functions.
- Minigame configurations.
- Minigame results.
- Highscores.

The API must check authentication and permissions on the server.

---

# 18. Database and Data Model

The first version uses SQLite.

For a single event installation, SQLite is a simple and resource-efficient solution.

The database stores, for example:
- Users.
- Events.
- Memberships.
- Roles.
- Guest groups.
- Invitations.
- Avatar configurations.
- Event settings.
- Access rules.
- Content.
- Photo metadata.
- Album information.
- Guestbook entries.
- Map metadata and versions.
- Minigame results.
- Highscores, or the result data needed for them.
- Audit logs.

The actual image files and imported map files (Tiled JSON, tilesets) are not stored in SQLite but on persistent file storage.

## 18.1 Event Reference

The data structure takes an `eventId` into account from the start.

Even though the first version manages only one event installation, this eases later extension.

Event-related records must be unambiguously assignable to one event.

These include in particular:
- Memberships.
- Roles.
- Groups.
- Permissions.
- Content.
- Maps.
- Photos.
- Albums.
- Minigame results.
- Settings.

## 18.2 Requirements

| ID | Requirement | Prio |
|---|---|---|
| DATA-01 | Application data is stored in SQLite; image files and imported map files are stored on persistent file storage, not in the database. | Must |
| DATA-02 | Every event-related record (memberships, roles, groups, permissions, content, maps, photos, albums, minigame results, settings) carries an `eventId`. | Must |
| DATA-03 | Administrative actions are recorded in an audit log (who, what, when). | Must |
| DATA-04 | Database schema changes are applied through versioned migrations that preserve existing data. | Must |

---

# 19. Reusability and Event Configuration

Zappaloo is developed as a generic platform.

The technical base must not have to be reprogrammed for each wedding.

Instead, the shared platform code is adapted through event-specific content, graphics and configuration.

## 19.1 Basic Principle

There are two levels:

**Platform core**
- Game engine.
- Website system.
- Backend.
- User management.
- Roles and permissions.
- Multiplayer.
- Minigame system and all minigames, including their content.
- Photo management.
- Content management.
- Admin dashboard.

**Event configuration**
- Event name.
- Colours and design.
- Website content.
- Maps.
- Tilesets.
- Avatars and graphics.
- NPCs.
- Dialogues.
- Interactive objects.
- Guest groups.
- Unlock conditions.
- Photo albums.
- Schedule.

The platform provides generic functions. The concrete event is shaped through configuration and content.

Event configuration is managed at runtime. Settings, website content, guest groups and maps are edited through the admin dashboard and the level editor and stored in the database and on persistent file storage. The `events/<slug>/` directory only bootstraps a new installation: event identity, theme, initial settings, and static graphics that are not imported through the level editor.

## 19.2 Example Bootstrap Directory

```text
events/
  event-muster/
    event.json
    theme.json
    assets/
      sprites/
      avatars/
      audio/
```

## 19.3 Example `event.json`

```json
{
  "id": "event-muster",
  "name": "Event Muster",
  "slug": "event-muster",
  "timezone": "Europe/Zurich",

  "defaultLanguage": "de",

  "theme": {
    "config": "theme.json"
  },

  "features": {
    "multiplayer": true,
    "minigames": true,
    "photoUpload": true,
    "photoGallery": true,
    "guestbook": true
  },

  "registration": {
    "visitorSelfRegistration": false
  },

  "access": {
    "anonymousAccess": true
  }
}
```

The actual configuration is validated on the server. The values in `features`, `registration` and `access` are initial values; the admin can change them at runtime. Maps and the start map are managed in the level editor.

## 19.4 Configurability

Not every function needs to be freely configurable.

Stable technical mechanics stay in the platform code.

Event-specific content and settings are controlled through data and configuration.

This prevents the platform from becoming unnecessarily complex through too many freely definable options.

---

# 20. Installation and Operating Model

The first version uses a separate installation per event.

An event gets:
- Its own domain or subdomain.
- Its own database.
- Its own photos and uploads.
- Its own users and guests.
- Its own content.
- Its own maps and graphics.
- Its own configuration.

In the first version, one installation manages one event.

The codebase is the same for all installations.

## 20.1 Later Multi-Event Extension

Extending to several events within one installation is possible later but not part of the initial scope.

The architecture is already prepared for it:
- `eventId` in relevant data.
- Per-event permissions.
- Per-event content.
- Per-event memberships.
- Clear separation of data.

A later multi-tenant version could run several events within the same installation.

Strict data separation must then be guaranteed.

An event admin may manage only their own event. A platform admin can manage all events.

A global user account could later be assigned to several events, with different roles in each event.

## 20.2 Requirements (Sections 19 and 20)

| ID | Requirement | Prio |
|---|---|---|
| CFG-01 | The platform core is generic; an event is shaped only through configuration and content (name, theme, website content, maps, tilesets, sprites, NPCs, dialogues, objects, guest groups, unlock conditions, albums, schedule). | Must |
| CFG-02 | An installation is bootstrapped from an `events/<slug>/` directory (`event.json`, `theme.json`, static assets) that is validated on the server at startup; an invalid configuration is rejected with a clear error. | Must |
| CFG-03 | The features `multiplayer`, `minigames`, `photoUpload`, `photoGallery` and `guestbook` can be enabled or disabled per event; disabled features are unavailable in UI and API. | Must |
| CFG-04 | Each installation serves exactly one event with its own domain, database, uploads, users, content, maps and configuration; all installations share the same codebase. | Must |
| CFG-05 | Event settings (`anonymousAccess`, `visitorSelfRegistration`, feature toggles) are initialised from `event.json` and can be changed by the admin at runtime without a redeployment. | Must |

Multi-event operation in one installation (section 20.1) is out of scope for the first version (see section 30).

---

# 21. Hosting and Server Infrastructure

A VPS at Infomaniak is planned for the start.

Planned initial configuration:

- 2 vCPU.
- 4 GB RAM.
- 60 GB NVMe storage.
- Ubuntu Server.
- SSH access.
- Root or administrative rights.

This is meant as a starting point and must be checked by load tests.

In particular the number of concurrently active players, the synchronisation rate and photo uploads drive resource needs.

## 21.1 Domain

The domain is registered separately.

A `.ch` domain can be registered at Infomaniak.

The domain points to the VPS's IPv4 address through a DNS A record.

An AAAA record can be added if IPv6 is used.

## 21.2 HTTPS and WebSockets

Caddy acts as reverse proxy.

Caddy:
- Receives public HTTP and HTTPS requests.
- Forwards requests to the appropriate internal containers.
- Provides HTTPS certificates via Let's Encrypt.
- Renews certificates automatically.
- Supports WebSocket connections for multiplayer.

Only the necessary web ports are publicly reachable.

## 21.3 Firewall

The firewall opens only the necessary ports.

Typically:
- Port 80 for HTTP and certificate validation.
- Port 443 for HTTPS and WSS.
- SSH as restricted as possible, for example from a fixed IP or through a secure access path.

Database and internal backend ports are not exposed publicly.

---

# 22. Docker and Deployment

The application is run with Docker and Docker Compose.

Docker Engine is installed manually on the VPS.

Docker Compose manages the application containers.

Possible containers:
- Frontend / web server.
- Backend.
- Multiplayer server, if run separately.
- Caddy as reverse proxy.

In the first version, backend and multiplayer server can also run together inside one modular application, if the technical implementation supports this well.

## 22.1 Persistent Data

Data that must survive a container restart or an update is stored outside the container file system.

This includes:
- SQLite database.
- Photos.
- Uploads.
- Imported maps and tilesets.
- Other persistent files.

This data is mounted through Docker volumes or suitable host directories.

## 22.2 Backups

Regular external backups are made.

Backups include:
- Database.
- Photos.
- Uploads.
- Imported maps and tilesets.
- Event configuration.
- Relevant assets.

Backups must not be stored only on the same VPS.

Restoring must be tested regularly.

---

# 23. GitHub and CI/CD

The source code is managed in a GitHub repository.

GitHub Actions runs automated checks and deployments.

Possible flow:

1. A developer creates a commit or pull request.
2. GitHub Actions runs the tests.
3. TypeScript checks run.
4. Frontend and backend are built.
5. If all checks pass, a deployment is prepared.
6. The application is updated on the VPS.
7. The containers are restarted or updated.
8. The deployment status is verified.

Production data and uploads must never be overwritten or deleted by a deployment.

Before larger database changes, backups and suitable migrations are required.

## 23.1 Requirements (Sections 21–23)

| ID | Requirement | Prio |
|---|---|---|
| OPS-01 | The application runs with Docker Compose; Caddy is the reverse proxy in front of the application containers. | Must |
| OPS-02 | All public traffic uses HTTPS/WSS with Let's Encrypt certificates that are obtained and renewed automatically; WebSocket connections for multiplayer work through the proxy. | Must |
| OPS-03 | Only ports 80 and 443 are publicly open, SSH is restricted; database and internal backend ports are not publicly reachable. | Must |
| OPS-04 | Persistent data (database, photos, uploads, imported maps and tilesets) lives outside the container file system and survives container restarts, updates and deployments unchanged. | Must |
| OPS-05 | Regular backups of database, photos, uploads, imported maps and tilesets, event configuration and relevant assets are stored off the VPS; restoring from a backup is tested regularly. | Must |
| OPS-06 | On every commit and pull request, GitHub Actions runs the tests, the TypeScript checks, the builds and the requirement report. | Must |
| OPS-07 | After successful checks, GitHub Actions deploys to the VPS and verifies the deployment status. | Should |

---

# 24. Security and Privacy

Security must be considered from the start.

Key measures:

- Secure password hashes.
- Server-side sessions.
- Secure session cookies.
- HTTPS for all public connections.
- CSRF protection where needed.
- Rate limiting.
- Server-side permission checks.
- Input validation.
- Protection against unauthorised file uploads.
- Secure storage of invitation tokens.
- Audit logs for administrative actions.
- Regular backups.
- Restriction of public server ports.

The platform follows the Swiss Federal Act on Data Protection (FADP / revDSG):

- Only personal data needed for operation is stored.
- A privacy notice is reachable from every page, also without sign-in.
- Users can delete their own account and content at any time (ACC-12).
- The whole site is excluded from search engines.
- Website content written in Markdown is sanitised before rendering.

**Shutdown and deletion.** The platform runs only for a limited time after the event. When the admin plans to shut it down:

1. The admin sets a shutdown date.
2. The platform emails all users that they can view the content until that date.
3. The admin can export photos and guestbook entries for the hosts.
4. On the shutdown date all personal data (accounts, photos, guestbook entries, minigame results, audit logs) is deleted automatically.

The concrete privacy notice and the legal review are required before production use.

## 24.1 Requirements

Measures already covered elsewhere (password hashing ACC-06, sessions ACC-05, HTTPS OPS-02, permission checks ACS-07, token storage INV-02, audit log DATA-03, backups OPS-05, ports OPS-03) are not repeated here.

| ID | Requirement | Prio |
|---|---|---|
| SEC-01 | State-changing requests that rely on cookie authentication are protected against CSRF. | Must |
| SEC-02 | Login, registration, password reset, invitation redemption and photo upload are rate-limited. | Must |
| SEC-03 | All API and real-time inputs are validated on the server against a schema; invalid input is rejected. | Must |
| SEC-04 | Only personal data needed for operation is stored (Swiss FADP / revDSG). | Must |
| SEC-05 | Markdown content is sanitised before rendering; raw HTML and scripts are not executed. | Must |
| SEC-06 | An admin can export all photos and guestbook entries with their metadata (e.g. as a ZIP archive). | Must |
| SEC-07 | An admin can set a shutdown date; the platform then emails all users that the content is available until that date. | Must |
| SEC-08 | On the shutdown date, all personal data (accounts, photos, guestbook entries, minigame results, audit logs) is deleted automatically. | Must |
| SEC-09 | A privacy notice is reachable from every page, also without sign-in. | Must |
| SEC-10 | The whole site is excluded from search engine indexing (`robots.txt` disallowing all, and an `X-Robots-Tag: noindex` header on every response). | Must |

The privacy policy and legal review are an organisational precondition for production use, not a software requirement; they are tracked in [test-strategy.md](test-strategy.md) under "Release checklist".

---

# 25. Performance, Scaling and Tests

The platform is initially designed for a single event with a manageable number of guests.

A load test must be carried out before a production event.

About 30–50 concurrently active players is a sensible first test value.

This is not a guaranteed capacity. Actual capacity depends among other things on:
- Number of concurrently connected players.
- Number of players per multiplayer room.
- Synchronisation rate.
- Size of the synchronised state.
- Number of concurrent photo uploads.
- Server resources.

## 25.1 Performance Measures

- Synchronise only necessary game state.
- Manage multiplayer rooms separately.
- Load assets efficiently.
- Compress images.
- Create previews.
- Process images in a background worker queue.
- Avoid unnecessary API calls.
- Optimise database queries.
- Check permissions efficiently on the server.

## 25.2 Test Areas

Before the event the following areas in particular must be tested:

**Website**
- Responsive layout.
- Navigation.
- Content.
- Login and registration.

**Game world**
- Movement.
- Collisions.
- Map changes.
- Interactions.
- Multiplayer synchronisation.

**Minigames**
- Start and return to the game world.
- Passing user data.
- Submitting results.
- Server-side validation.
- Storing highscores.
- Showing leaderboards.

**User management**
- Registration.
- Invitation codes.
- VIP assignment.
- Role combinations.
- Role revocation.
- Access control.

**Photos**
- QR code.
- Smartphone camera.
- Upload.
- Image processing.
- Moderation.
- Gallery release.

**Infrastructure**
- HTTPS.
- WebSockets.
- Container restart.
- Backups.
- Restore.
- Load tests.

How these areas are tested is defined in [test-strategy.md](test-strategy.md).

## 25.3 Requirements

| ID | Requirement | Prio |
|---|---|---|
| PERF-01 | On the target VPS configuration, the system supports at least 30–50 concurrently active players with smooth movement synchronisation, verified by a load test before the production event. | Must |
| PERF-02 | Only the game state needed by clients is synchronised, per room. | Should |
| PERF-03 | Images are delivered as compressed versions and thumbnails rather than originals where possible. | Should |

---

# 26. Proposed Project Structure

A possible repository structure:

```text
zappaloo/
  frontend/
    src/
      app/
      pages/
      components/
      game/
      auth/
      admin/
      photos/
      minigames/
      services/
      styles/

  backend/
    src/
      auth/
      users/
      events/
      memberships/
      roles/
      invitations/
      avatars/
      permissions/
      features/
      rooms/
      photos/
      albums/
      content/
      minigames/
      game-results/
      admin/
      database/
      services/
      api/

  shared/
    types/
    schemas/
    events/

  events/
    event-muster/
      event.json
      theme.json
      content/
      game/
      photos/

  infrastructure/
    docker/
    caddy/
    scripts/
    backups/

  spec/
  docs/
    api/
    conventions/

  docker-compose.yml
  README.md
```

The structure is a proposal and may be adapted during development.

What matters is a clear separation between:
- Frontend.
- Backend.
- Shared types and data structures.
- Event-specific content.
- Infrastructure.
- Specification and documentation.

---

# 27. Summary of Architecture Decisions

| Area | Decision |
|---|---|
| Product | Zappaloo |
| Claim | Tiny world. Big moments. |
| Platform | Interactive pixel-art game world + classic website |
| Access | Browser, no native app |
| Frontend | React + TypeScript + Vite |
| Routing | React Router |
| Game engine | Phaser 4 |
| Map editor | Tiled |
| Backend | Node.js + TypeScript |
| Multiplayer | Colyseus + WebSockets |
| Database | SQLite |
| Movement | Smooth, all directions; arrow keys on desktop, tap-to-move on touch devices |
| Collisions | With the map only, not between players |
| Movement validation | Client simulates, server validates positions |
| Minigames | Separate Phaser scenes, shipped with the platform |
| Minigame communication | Central minigame API |
| Results | Stored centrally by Zappaloo |
| Highscores | Centrally managed leaderboards |
| Roles | Visitor, VIP, Staff, Admin |
| Role model | Four fixed, combinable roles |
| Staff extra rights | Fixed capabilities as toggles |
| VIP invitations | Personal single-use codes |
| VIP assignment | Invitation code or direct admin promotion |
| Anonymous access | One shared setting for website and game world |
| Self-registration | Separate setting |
| Photos | QR code upload, sign-in required, worker queue for processing |
| Guestbook | Text plus optional photo, moderated, website only |
| Maps | Drawn in Tiled, imported at runtime via the level editor |
| Website content | Edited in the browser as Markdown |
| Language | German, i18n from the start, content with language keys |
| Email | SMTP, Infomaniak mail first |
| Privacy | Swiss FADP; shutdown notice, export, then deletion; no search indexing |
| Gallery | Scheduled or manual release |
| Installation | One separate installation per event |
| Reuse | One generic codebase with event configurations |
| Hosting | Infomaniak VPS |
| Web server | Caddy |
| Containers | Docker Engine + Docker Compose |
| CI/CD | GitHub Actions |
| Tests | Vitest (unit/integration) + Playwright (E2E) |
| Data storage | SQLite and persistent file storage |
| Scaling | Initially one event per installation |

---

# 28. Development Strategy and Order of Work

Implementation proceeds in stages. The system is deployed to the VPS from the first stage on, so that infrastructure problems (TLS, WebSockets, volumes) show up early. Admin functions are built in each stage together with their topic, not in a separate admin stage.

The concrete steps of each stage are agreed before the stage starts (see CLAUDE.md).

## Stage 1 – Walking Skeleton and Deployment

- Monorepo with `frontend`, `backend`, `shared`.
- React, TypeScript, Vite; Phaser integrated; Node.js backend; Colyseus server.
- SQLite with versioned migrations.
- i18n framework set up.
- Docker Compose with Caddy; deployed to the VPS with HTTPS and WebSockets.
- GitHub Actions: tests, type checks, builds, requirement report.

Requirements: OPS-01–04, OPS-06, DATA-01, DATA-04, LANG-01, SEC-03, SEC-10.

## Stage 2 – Accounts, Roles and Access

- Registration, login, sessions, email via SMTP, verification, password reset.
- Four roles, staff capabilities, guest groups.
- Invitations with printable export.
- Event settings, access conditions, server-side enforcement.
- Admin pages for users, roles, invitations, groups and settings.

Requirements: ACC, ROLE, INV, ACS (except ACS-08), GRP, CFG-02, CFG-03, CFG-05, DATA-02, DATA-03, SEC-01, SEC-02.

## Stage 3 – Content and Website

- Content model with language keys.
- Website pages, responsive layout, Markdown editing.
- Privacy notice.

Requirements: CNT, WEB (except WEB-05, WEB-06), LANG-02, CFG-01, CFG-04, SEC-05, SEC-09.

## Stage 4 – Game World and Level Editor

- Map import and level editor.
- Smooth movement with map collisions, arrow keys and tap-to-move.
- Interactive objects, portals, avatars and avatar editor.

Requirements: GAME, MAP, AVA.

## Stage 5 – Multiplayer

- Rooms per map, position validation, interpolation.
- Room changes through portals.
- Re-checking access on live connections.

Requirements: MP, ACS-08, PERF-02.

## Stage 6 – Photos and Guestbook

- QR upload, worker queue, HEIC handling, albums.
- Moderation and gallery release.
- Guestbook.

Requirements: PHO, GB, WEB-06, PERF-03.

## Stage 7 – Minigames and Highscores

- Scene framework, minigame registry, minigame API.
- Attempt IDs and plausibility profiles.
- Highscores and leaderboards.

Requirements: MG, WEB-05.

## Stage 8 – Event Readiness and Shutdown

- Off-site backups and restore drill; automated deployment.
- Export, shutdown notice and deletion.
- Load test.

Requirements: OPS-05, OPS-07, SEC-04, SEC-06–08, PERF-01.

## Event Operation and Follow-Up (not a development stage)

- Finish content and maps for the concrete event.
- Print and distribute invitations.
- Create and place QR codes.
- Run functional tests on smartphones.
- Test multiplayer, minigames, photo upload and guestbook.
- Prepare gallery release.
- After the event, make photos and memories accessible; later announce the shutdown, export, and delete.

---

# 29. Guiding Idea and Core Principles of Zappaloo

Zappaloo should be more than an ordinary event website and more than a small browser game.

The platform combines an interactive digital world with a practical information platform. It should bring people together, spark curiosity, create shared experiences and capture memories.

The pixel-art game world is the emotional heart of Zappaloo. It invites guests to discover an event playfully, meet other guests, find small surprises and experience something together.

At the same time Zappaloo remains a full information platform. All important information about the real event must always be easy to find and clearly presented — whether or not someone uses the game world.

Both worlds belong together and complement each other. The game world makes information tangible, while the classic website provides orientation and overview. Both draw on the same content and data.

## Zappaloo accompanies an event before, during and after

**Before the event**, Zappaloo helps with preparation. Guests can discover information, explore the game world, design their avatar and connect with other guests ahead of the occasion.

**During the event**, Zappaloo becomes an interactive companion. Guests can look up information, play together, discover minigames, meet other guests and share photos.

**After the event**, Zappaloo remains a digital place of memories. Photos, highscores, small discoveries and shared experiences can stay accessible and keep the occasion in special memory.

## One platform, many individual worlds

Zappaloo is technically developed as a reusable platform. Each event, however, gets its own identity.

The design, the game world, the content, the characters, the interactions and the small surprises can be customised individually without redeveloping the technical base each time.

The same platform can thus become a very personal digital world for a wedding, a birthday, an anniversary or another special occasion.

The platform deliberately balances reusability and individuality: the technical foundations stay stable, while every event's experience can be unique.

## Core principles

1. **Experience rather than mere information:** Zappaloo should not just provide information, but invite people to discover and experience something.

2. **Game and information belong together:** The game world and the classic website are two ways into the same platform. Neither is an isolated add-on.

3. **Community at the centre:** Zappaloo should enable encounters, connect guests and foster shared experiences.

4. **Easy access:** The platform works directly in the browser. Installing an app is not necessary. Important information must remain reachable without using the game world.

5. **Individual design:** Every event should get its own digital identity — from design to maps, content and minigames.

6. **One shared technical foundation:** Website, game world, user management, photos, content and minigames build on one shared platform and central data base.

7. **Memories beyond the event:** Zappaloo should not lose its purpose when the event ends. It should create a digital place where shared moments and memories live on.

**Zappaloo turns a special occasion into a small digital world — a world you don't just visit, but experience together.**

*Tiny world. Big moments.*

---

# 30. Out of Scope for the First Version

| Topic | Note |
|---|---|
| Chat | No text or voice chat between players. |
| Platform administration | Each installation serves one event (ROLE-10 withdrawn). |
| Multiple events per installation | Prepared through `eventId`, not implemented (section 20.1). |
| Collisions between players | Avatars pass through each other (MP-06). |
| Editing minigames at runtime | Minigames and their content ship with the platform (MG-11). |
| Drawing maps in the browser | Maps are drawn in Tiled and imported (section 14). |
| Anonymous photo upload | Upload requires sign-in (PHO-04 withdrawn). |
| Native apps | Browser only. |
