# Security policy

## Reporting a vulnerability

Please do **not** open a public issue. Report it privately through GitHub: on the
repository page, *Security → Report a vulnerability*
([direct link](https://github.com/gravity981/zappaloo/security/advisories/new)).

Include what is affected, how to reproduce it, and the version (shown in the website
footer and at `/api/version`). You will get an answer as soon as possible; this is a
spare-time project, so it may take a few days. Fixes are released as a new patch version,
and the advisory is published once a fix is available.

## Supported versions

Only the latest release gets security fixes.

## Scope and known limits

Zappaloo holds personal data of event guests (names, email addresses, photos). Running
it safely is partly the operator's job:

- Hosting, network, firewall, SSH, operating system updates, the domain and the off-site
  storage of backups are the operator's. The project ships the image and the deployment
  bundle only; the stack publishes only Caddy's ports.
- Backups contain personal data. Keep them readable only by the operator and delete them
  together with all other personal data when the event is over.
- **Staging** uses a certificate from Caddy's local CA, so browsers show a warning, and
  it holds a copy of real guest data while a release candidate is verified. Keep it
  unreachable from the internet and delete its data afterwards.
- Session cookies are signed with a secret that `deploy.sh` creates in
  `secrets/session_secret`; anyone who can read that file can forge sessions.

Reports about these documented limits are welcome as ideas, but are not vulnerabilities.
