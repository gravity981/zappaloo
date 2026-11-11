# syntax=docker/dockerfile:1
# Application image: backend and built frontend (sw-architecture.md 23).
# Build from the repository root:
#   docker build -f infrastructure/docker/Dockerfile \
#     --build-arg APP_VERSION=<version> --build-arg APP_COMMIT=<commit> .
# Version and commit are set exactly once, here (23.6); the deployment never overrides them.

ARG NODE_IMAGE=node:26.13.0-bookworm-slim

# --- Frontend build (needs all dependencies) ---------------------------------
FROM ${NODE_IMAGE} AS frontend
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY scripts/version scripts/version
COPY shared shared
COPY frontend frontend
ARG APP_VERSION
RUN test -n "$APP_VERSION" || (echo "APP_VERSION build argument is required" >&2; exit 1)
RUN APP_VERSION="$APP_VERSION" npm run build -w frontend

# --- Production dependencies of the backend ----------------------------------
FROM ${NODE_IMAGE} AS backend-deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev --workspace backend --no-audit --no-fund

# --- Runtime ------------------------------------------------------------------
FROM ${NODE_IMAGE}
WORKDIR /app
ENV NODE_ENV=production

COPY --from=backend-deps /app/node_modules node_modules
COPY package.json ./
COPY shared/package.json shared/
COPY shared/src shared/src
COPY backend/package.json backend/
COPY backend/src backend/src
COPY backend/drizzle backend/drizzle
COPY --from=frontend /app/frontend/dist frontend/dist
COPY --chmod=755 infrastructure/docker/zappaloo /usr/local/bin/zappaloo

ARG APP_VERSION
ARG APP_COMMIT=unknown
ENV APP_VERSION=${APP_VERSION} \
    APP_COMMIT=${APP_COMMIT} \
    DATA_DIR=/data \
    FRONTEND_DIR=/app/frontend/dist \
    HOST=0.0.0.0 \
    PORT=3000
LABEL org.opencontainers.image.title="Zappaloo" \
      org.opencontainers.image.source="https://github.com/gravity981/zappaloo" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${APP_COMMIT}"

RUN echo "${APP_VERSION}" > /app/VERSION \
    && mkdir -p /data \
    && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "backend/src/server.ts"]
