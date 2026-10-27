FROM node:24.16.0-alpine AS build
WORKDIR /workspace
RUN apk add --no-cache python3 make g++
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY web/package.json ./web/package.json
COPY backend/package.json ./backend/package.json
COPY patches ./patches
RUN --mount=type=cache,id=guatswr-revamp-pnpm,target=/pnpm/store pnpm install --store-dir=/pnpm/store --frozen-lockfile --filter @guatswr/web...
COPY packages/shared ./packages/shared
COPY web ./web
# Literal Express route declarations are read-only contract-test inputs.
# They are never imported, executed, or copied into the final runtime image.
COPY backend/src/app.js ./backend/src/app.js
COPY backend/src/routes ./backend/src/routes
COPY backend/src/integrations/bot/api.ts backend/src/integrations/bot/member-sync-api.ts ./backend/src/integrations/bot/
COPY backend/src/modules/activities/revision-api.ts ./backend/src/modules/activities/revision-api.ts
COPY scripts/revamp ./scripts/revamp
RUN pnpm check:security && pnpm --filter @guatswr/shared build \
    && pnpm --filter @guatswr/shared --filter @guatswr/web -r typecheck \
    && pnpm --filter @guatswr/shared --filter @guatswr/web -r lint \
    && pnpm --filter @guatswr/shared --filter @guatswr/web -r test \
    && pnpm --filter @guatswr/shared --filter @guatswr/web -r build
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
