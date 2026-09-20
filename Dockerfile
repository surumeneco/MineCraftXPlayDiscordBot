FROM node:24.17.0-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
# pict-node is a test-only dependency; its install hook needs Git/native build tools,
# which are intentionally absent from the production image.
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:24.17.0-bookworm-slim AS runtime

# Phase 5: use the OpenSSH client for strict known_hosts verification.
RUN apt-get update && apt-get install -y --no-install-recommends openssh-client \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

USER node

CMD ["node", "dist/index.js"]
