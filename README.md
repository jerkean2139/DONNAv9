# DONNA V2

DONNA is an AI operating system for running a company through one intelligent
command interface. Donna is the **control-plane experience** that orchestrates
work — not an LLM, not a chatbot inside a project manager. Business/product
state lives in authoritative relational storage; models, agents, memory,
browsers and integrations are replaceable capabilities behind adapters.

This is a **greenfield** implementation (DONNA v9). The specification is the
**V2 Build Bible** (Google Drive: _DONNA - Codex Build Bible V2_, docs 00–18).
The approved design is [`GREENFIELD-V2-TECHNICAL-PLAN.md`](./GREENFIELD-V2-TECHNICAL-PLAN.md)
(see [ADR-0001](./docs/adr/0001-adopt-greenfield-v2-technical-plan.md)).

> Legacy repositories (`gdvansky/KOBTEAMLLM`, `jerkean2139/Kob-command-center-v2`)
> are reference material only — never the foundation. See
> [`DONNA-V2-GREENFIELD-BUILD-BRIEF.md`](./DONNA-V2-GREENFIELD-BUILD-BRIEF.md).

## Status

**Phase 0 — foundation scaffolding.** Monorepo tooling, CI boundary rules, the
pure `@donna/core-domain` package (types + durable Task state machine), a dev
Postgres+pgvector, env/secret conventions, and the ADR log. No product
behavior yet. Roadmap: Technical Plan §18.

## Prerequisites

- Node.js 22+ (see `.nvmrc`)
- pnpm 10 (`corepack enable`)
- Docker (for the local database)

## Getting started

```bash
pnpm install                                              # install workspace deps
cp .env.example .env                                      # local env (no real secrets)
docker compose -f infra/docker/docker-compose.yml up -d   # Postgres + pgvector
pnpm run check                                             # format + lint + typecheck + test
pnpm run build                                             # build all packages
```

## Workspace layout

See [`docs/repository-structure.md`](./docs/repository-structure.md). Current
packages:

- `packages/core-domain` — pure, dependency-free domain types and state
  machines (Objective, Task + lifecycle, Event, authority levels, compute-node
  modes). No runtime deps, no provider SDKs.

## Architecture boundaries (enforced in CI)

- Provider SDKs may only be imported inside `packages/adapters/*`.
- `packages/core-domain` stays dependency-free.
- `apps/web` calls the control-plane API; it never imports `db`/`policy`.

## Scripts

| Command                            | Description                                |
| ---------------------------------- | ------------------------------------------ |
| `pnpm run build`                   | Build all packages (Turborepo)             |
| `pnpm run typecheck`               | Type-check all packages                    |
| `pnpm run test`                    | Run unit tests (Vitest)                    |
| `pnpm run lint`                    | Lint (ESLint flat config + boundary rules) |
| `pnpm run format` / `format:check` | Prettier write / check                     |
| `pnpm run check`                   | format:check + lint + typecheck + test     |

## Security & conventions

Secrets never enter source control, logs, prompts, artifacts, or semantic
memory (Technical Plan §8). `.env` is git-ignored; only `.env.example` (names
only) is committed. External content is untrusted data and cannot change
policy or authority.
