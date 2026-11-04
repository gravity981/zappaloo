# Zappaloo

*Tiny world. Big moments.*

A reusable event platform (first use: a wedding): a browser-based pixel-art game world as the core experience, plus a classic event website. Guests redeem printed invitations, answer the RSVP, explore the venues with their avatar, share snapshots and keepsakes, and play minigames.

TypeScript throughout: React and Phaser 4 in the frontend, Fastify and SQLite (Drizzle) in the backend, deployed with Docker Compose behind Caddy.

## Quick start

You need VS Code with the Dev Containers extension and Docker. Everything else (Node.js, Playwright browsers, Mailpit, sqlite3) comes with the devcontainer.

1. Clone the repository and open it in VS Code: **Dev Containers: Reopen in Container**. The first build takes a few minutes; dependencies are installed automatically (`npm ci`).
2. Start backend and frontend, each in its own terminal:

   ```sh
   npm run dev:backend    # API on port 3000, restarts on change, migrates the dev database
   npm run dev:frontend   # Vite on port 5173, forwards /api to the backend
   ```

3. Open http://localhost:5173.

| Port | What |
|---|---|
| 5173 | Frontend (Vite dev server) |
| 3000 | Backend API, e.g. http://localhost:3000/api/health |
| 8025 | Mailpit: every email sent in development lands here |

Development data (SQLite database, uploads, maps) lives in the Docker volume `zappaloo-data-dev` at `/var/lib/zappaloo` and survives container rebuilds.

## Everyday commands

| Command | Does |
|---|---|
| `npm test` | Unit, component and integration tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright, desktop and mobile, Chromium and WebKit) |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run typecheck` | TypeScript in all workspaces |
| `npm run cli -- <command>` | The `zappaloo` CLI from source: `version`, `migrate`, `backup`, `restore` |
| `npm run db:generate -w backend` | New database migration after changing `backend/src/database/schema.ts` |
| `npm run req-report` | Requirement report: which requirement is verified by which test |
| `npm run check` | Everything CI does, including the Docker image and the deployment test (a few minutes) |

The full list is in [CLAUDE.md](CLAUDE.md#environment).

## Repository layout

```text
frontend/        React app, Phaser game (src/game), i18n messages (src/i18n/locales)
backend/         Fastify API, CLI, database schema and migrations (drizzle/)
shared/          Code used by both: API schemas (Zod), version scheme
e2e/             Playwright tests
scripts/         Tooling: requirement report, version, migration check, image cleanup
infrastructure/  Dockerfile, deployment bundle (compose.yaml, deploy.sh), image scripts
spec/            The specification – the source of truth
.github/         CI and release workflows
```

## How we work

- **The spec decides.** Requirements, architecture and decisions are in [spec/](spec/README.md). Code that disagrees with the spec is a bug, or a reason to change the spec first.
- **Every requirement has a test**, and the test names its requirement ID in its title: `it("[SEC-03] rejects invalid input", …)`. `npm run req-report` fails if an implemented requirement has no passing test. Requirements not built yet are listed in [spec/test-strategy.md](spec/test-strategy.md), section 5.
- **Stages and steps:** the work is planned in [spec/implementation-plan.md](spec/implementation-plan.md), one branch per stage (`feature/stage-<n>-…`), merged into `main` by pull request.
- **No hard-coded UI text:** all strings go through i18n (German for now); ESLint enforces it.
- **API input is always validated** with a Zod schema; a route without one stops the server at startup.

## CI and deployment

- Every pull request and push to `main` runs [ci.yml](.github/workflows/ci.yml): checks, all tests, the Docker image with smoke and deployment tests, and the requirement report. Images from `main` go to `ghcr.io/gravity981/zappaloo`.
- Version scheme, releases and environments: [spec/sw-architecture.md](spec/sw-architecture.md), section 23.
- Setting up a server, deploying, rolling back: the runbook in [infrastructure/deploy/README.md](infrastructure/deploy/README.md).
- Build and smoke-test the image locally: `npm run build:image`.
