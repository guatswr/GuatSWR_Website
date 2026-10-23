FROM node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203
WORKDIR /consumer
COPY shared.tgz ./shared.tgz
RUN npm init -y && npm install --save-exact ./shared.tgz typescript@6.0.2 --ignore-scripts --no-audit --no-fund
COPY consumer.cjs consumer.cts consumer.mts ./
RUN node node_modules/typescript/bin/tsc --noEmit --strict --module Node16 --moduleResolution Node16 --target ES2023 consumer.cts consumer.mts
CMD ["node", "consumer.cjs"]
