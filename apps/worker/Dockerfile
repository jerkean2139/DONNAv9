# syntax=docker/dockerfile:1
# Railway deployable: DONNA durable-queue worker (@donna/worker).
# Built from the monorepo root as build context (Railway service: Root Directory
# = repo root, Dockerfile Path = apps/worker/Dockerfile).

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/worker
# Requires DATABASE_URL. graphile-worker installs and manages its own schema.
CMD ["node", "dist/main.js"]
