# syntax=docker/dockerfile:1
# Railway deployable: DONNA control-plane API (@donna/control-plane).
# Built from the monorepo root as build context (Railway service: Root Directory
# = repo root, Dockerfile Path = apps/control-plane/Dockerfile).

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
# The whole built workspace is copied so pnpm's symlinked workspace deps resolve.
COPY --from=build /app /app
WORKDIR /app/apps/control-plane
# Fastify listens on process.env.PORT (Railway injects PORT). Health: GET /health
EXPOSE 3000
CMD ["node", "dist/main.js"]
