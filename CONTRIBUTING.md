# Contributing

Thank you for helping. This project is maintained in spare time, so please be patient
with answers, and keep changes focused.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Security
problems are reported privately, see [SECURITY.md](SECURITY.md).

## Before you start

- **Bugs and ideas** go into an issue first, using the templates. For larger changes, wait for a short
  agreement in the issue before writing code.
- **Behaviour is specified first.** The requirements live in
  [spec/sw-architecture.md](spec/sw-architecture.md), each with an ID (e.g. `OPS-19`).
  A change in behaviour changes or adds a requirement in the same pull request. Where the
  spec is open or ambiguous, ask in the issue instead of assuming.
- **Never include real guest data** (names, email addresses, invitation codes, photos)
  or secrets in issues, tests or examples.

## Development

The [README](README.md) explains the devcontainer, running the app, and the checks. In
short, from the repository root: `npm run lint`, `npm run format:check`,
`npm run typecheck`, `npm test`, `npm run test:e2e`, and `npm run check` for everything
in CI order.

- **Tests:** every test names the requirements it verifies — `it("[OPS-19] …")` in
  Vitest, `test("[OPS-19] …")` in Playwright. Every requirement needs at least one
  passing test ([test strategy](spec/test-strategy.md)); `npm run req-report` checks it.
- **Stages:** the work is planned in [spec/implementation-plan.md](spec/implementation-plan.md),
  one branch per stage (`feature/stage-<n>-…`).
- **Database changes** come with a Drizzle migration (`npm run db:generate -w backend`)
  that also works on existing data; `npm run migration-check` verifies it.
- **UI text** goes through i18n, never hard-coded in components.
- **Dependencies:** pinned to exact versions; prefer releases that are at least two
  weeks old.

## Commit messages and release notes

The release notes list the commit messages since the previous release, so write each
first line for the people who use the app. Start with `feat:` (or `Add`) for something
new and `fix:` (or `Fix`) for a fix; other commits are listed as changes.
Housekeeping that users don't care about starts with `chore:`, `docs:`, `test:`, `ci:`
or `build:` and is left out, as is a bare `step 1d`. Dependabot's commits are listed
separately. Details: [spec/sw-architecture.md](spec/sw-architecture.md), section 23.3.1.

## Pull requests

- Branch from `main`, one topic per pull request, with a description of what and why.
- CI must be green; it runs all checks and tests.
- Contributions are licensed under the project's license, the
  [GNU Affero General Public License v3.0 or later](LICENSE) (inbound = outbound); there
  is no separate contributor agreement.
