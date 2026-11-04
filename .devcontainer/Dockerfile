# Reads the Playwright version pinned in package-lock.json. A separate stage, so the
# browser layer below is rebuilt only when that version changes, not on every
# change of the dependencies. Until the project has a package-lock.json (stage 1
# creates it), PLAYWRIGHT_FALLBACK_VERSION is used.
FROM node:26.13.0-bookworm-slim AS playwright-version
ARG PLAYWRIGHT_FALLBACK_VERSION=1.64.1
# .devcontainer/Dockerfile always exists, so the wildcard may match no lock file yet
COPY .devcontainer/Dockerfile package-lock.jso[n] /tmp/ctx/
RUN node -e " \
      const fs = require('fs'); \
      let v = process.env.PLAYWRIGHT_FALLBACK_VERSION; \
      try { \
        const lock = JSON.parse(fs.readFileSync('/tmp/ctx/package-lock.json', 'utf8')); \
        v = lock.packages['node_modules/@playwright/test'].version || v; \
      } catch (e) {} \
      fs.writeFileSync('/tmp/playwright-version', v); \
      console.log('Playwright', v); \
    "

FROM mcr.microsoft.com/devcontainers/base:bookworm

# Mount point for the shared claude-config volume, owned by vscode so the
# empty volume inherits that ownership on first mount
RUN mkdir -p /home/vscode/.claude && chown vscode:vscode /home/vscode/.claude

# Mount point for the dev data volume (SQLite database, uploads, imported maps;
# see spec section 22.1), same ownership trick
RUN mkdir -p /var/lib/zappaloo && chown vscode:vscode /var/lib/zappaloo

# sqlite3 CLI to inspect the dev database; xz-utils to unpack Node.js
RUN apt-get update \
    && apt-get install -y --no-install-recommends sqlite3 xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Node.js (current LTS), installed here rather than as a devcontainer feature,
# because the Playwright browsers below need node while the image is built.
# Keep in sync with the Node version used in CI.
ARG NODE_VERSION=26.13.0
RUN case "$(dpkg --print-architecture)" in \
        amd64) arch=x64 ;; \
        arm64) arch=arm64 ;; \
        *) echo "unsupported architecture" >&2; exit 1 ;; \
    esac \
    && archive="node-v${NODE_VERSION}-linux-${arch}.tar.xz" \
    && cd /tmp \
    && curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/${archive}" \
    && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" | grep " ${archive}\$" | sha256sum -c - \
    && tar -xJf "${archive}" -C /usr/local --strip-components=1 --no-same-owner \
    && rm "${archive}" \
    && node --version && npm --version

# Browsers for the end-to-end tests (spec test-strategy.md): Chromium for desktop
# and Android viewports, WebKit for iOS viewports. Version as pinned in
# package-lock.json, with their system libraries.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=playwright-version /tmp/playwright-version /tmp/playwright-version
RUN npx --yes "playwright@$(cat /tmp/playwright-version)" install --with-deps chromium webkit \
    && chmod -R a+rX /ms-playwright \
    && rm -rf /root/.npm /tmp/playwright-version

# Mailpit: local SMTP server that catches all outgoing mail (verification,
# password reset, "the door is open", shutdown notice). Web UI on port 8025.
# Mailpit publishes no checksums; these were computed from the release archives.
ARG MAILPIT_VERSION=1.33.0
RUN case "$(dpkg --print-architecture)" in \
        amd64) sha=d0ec50080cbf3e7c1fa2cda2ee68125d7894175811084b1f8f47c6cfc6f487c8 ;; \
        arm64) sha=1d27c819e1a5dd2761ed9fd07022443e35a47793b2e92de5b49cf3656a649ef9 ;; \
        *) echo "unsupported architecture" >&2; exit 1 ;; \
    esac \
    && archive="mailpit-linux-$(dpkg --print-architecture).tar.gz" \
    && cd /tmp \
    && curl -fsSLO "https://github.com/axllent/mailpit/releases/download/v${MAILPIT_VERSION}/${archive}" \
    && echo "${sha}  ${archive}" | sha256sum -c - \
    && tar -xzf "${archive}" -C /usr/local/bin mailpit \
    && rm "${archive}" \
    && mailpit version
