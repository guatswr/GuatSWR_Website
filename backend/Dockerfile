ARG IMAGE_REGISTRY=
FROM ${IMAGE_REGISTRY}node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203
WORKDIR /app
COPY package*.json ./
RUN apt-get update -o Acquire::Retries=3 \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates sqlite3 \
    && rm -rf /var/lib/apt/lists/*
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund
ENV BIND_HOST=0.0.0.0
EXPOSE 3000
RUN mkdir -p /app/data /app/uploads
CMD ["node", "dist/server.js"]
