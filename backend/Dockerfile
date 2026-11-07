ARG IMAGE_REGISTRY=
FROM ${IMAGE_REGISTRY}postgres:18.6-bookworm@sha256:f1ea2a1a4fb7b68d4836be1fdcb8a6466a89b072158bf9d97663600538c294c5 AS postgres-client
RUN set -eu; mkdir -p /bundle/bin /bundle/lib; \
    for tool in pg_dump pg_restore; do \
      cp /usr/lib/postgresql/18/bin/$tool /bundle/bin/; \
      ldd /usr/lib/postgresql/18/bin/$tool | awk '/=> \// {print $3} /^[[:space:]]*\// {print $1}' | \
        while read library; do cp -L "$library" /bundle/lib/; done; \
    done

FROM ${IMAGE_REGISTRY}node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203 AS build
WORKDIR /workspace
RUN apt-get update -o Acquire::Retries=3 \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.25.0 --registry=https://registry.npmmirror.com --no-audit --no-fund
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY backend/package.json ./backend/package.json
COPY web/package.json ./web/package.json
COPY patches ./patches
RUN pnpm install --frozen-lockfile --filter guiair-backend...
COPY packages/shared ./packages/shared
COPY backend ./backend
RUN pnpm --filter @guatswr/shared build && pnpm --filter guiair-backend build \
    && pnpm --filter guiair-backend deploy --prod /runtime

FROM ${IMAGE_REGISTRY}node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203 AS runtime
WORKDIR /app
RUN apt-get update -o Acquire::Retries=3 \
    && apt-get install -y --no-install-recommends python3 sqlite3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ARG SOURCE_REVISION=unknown
LABEL org.opencontainers.image.revision=$SOURCE_REVISION
ENV SOURCE_REVISION=$SOURCE_REVISION
COPY --from=build /runtime ./
COPY --from=postgres-client /bundle /opt/postgres
COPY backend/scripts/postgres/client-wrapper.sh /usr/local/bin/pg_dump
COPY backend/scripts/postgres/client-wrapper.sh /usr/local/bin/pg_restore
RUN chmod 755 /usr/local/bin/pg_dump /usr/local/bin/pg_restore && pg_dump --version && pg_restore --version
RUN mkdir -p /app/data /app/backups \
    && chown node:node /app/data /app/backups \
    && chmod 700 /app/data /app/backups
USER node:node
ENV NODE_ENV=production BIND_HOST=0.0.0.0 DATA_DIR=/app/data PUBLIC_DIR=/app/data/public BACKUP_ROOT=/app/backups
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 CMD ["node", "scripts/healthcheck.cjs"]
CMD ["node", "dist/server.js"]
