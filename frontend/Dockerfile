# Development image (docker compose up dev): source is bind-mounted, dependencies live in volumes.
# Unused when building for Cloud Run — the last stage ("run") is the production image.
FROM node:24-slim AS dev
WORKDIR /app
RUN corepack enable && mkdir -p node_modules .next && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["sh", "-c", "pnpm install --frozen-lockfile && pnpm dev --hostname 0.0.0.0"]

# Production image for Cloud Run (Next.js standalone output).
FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER node
EXPOSE 8080
CMD ["node", "server.js"]
