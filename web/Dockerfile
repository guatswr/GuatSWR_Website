FROM node:24.16.0-alpine AS build
WORKDIR /workspace
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY web/package.json ./web/package.json
RUN --mount=type=cache,id=guatswr-revamp-pnpm,target=/pnpm/store pnpm install --store-dir=/pnpm/store --frozen-lockfile
COPY packages/shared ./packages/shared
COPY web ./web
# Read-only reference bytes used by the login asset parity test. These never
# enter the runtime image; all other legacy sources stay out of the context.
COPY frontend/src/bg/login ./frontend/src/bg/login
# Literal Express route declarations are read-only contract-test inputs.
# They are never imported, executed, or copied into the final runtime image.
COPY backend/src/app.js ./backend/src/app.js
COPY backend/src/routes ./backend/src/routes
RUN pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm -r build
COPY scripts/revamp/check-artifacts.mjs ./scripts/revamp/check-artifacts.mjs
RUN node scripts/revamp/check-artifacts.mjs

FROM node:24.16.0-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3100
WORKDIR /app
COPY --from=build --chown=node:node /workspace/web/.output ./.output
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3100/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
