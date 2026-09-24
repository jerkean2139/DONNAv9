# @donna/web

The command-first web experience (Technical Plan §8 / UX spec). Vite + React +
TypeScript + Tailwind. Donna dominates the shell — not a chat panel inside a
project manager (Build Bible V2-001).

## Layout (the five regions)

- **Top** — health/status bar: control plane, active jobs, node modes/health.
- **Left** — context navigation: Today, Projects, People, Leads, Tasks,
  Memory & Knowledge, Automations.
- **Center** — Active Workspace: current objective, active work, and outcomes
  you express via the command bar (staged as draft objectives).
- **Right** — Donna Rail: objective, active work, blockers, approvals, alerts,
  next recommended action.
- **Bottom** — the persistent command bar: express an outcome; Donna turns it
  into an objective.

## Live data

Objectives (list + create from the command bar) and control-plane health are
live. The remaining panels (active work, approvals, alerts, nodes) still render
from `src/data/mock.ts` and are labeled "(sample)" until their APIs exist.
`apps/web` stays behind the API boundary — it never imports `@donna/db` or
`@donna/policy` (enforced in CI).

Auth comes from `GET /client-config`: with `CLERK_PUBLISHABLE_KEY` set the app
signs in with Clerk and sends its JWT; under `APP_ENV=development` it uses the
dev workspace identity the control-plane bootstraps. Clerk is lazy-loaded, so
the dev path never downloads it.

## Deployment

The root `pnpm run build` produces `apps/web/dist`, and the control-plane
serves it at `/` (API routes take precedence; set `WEB_DIST_DIR` to override the
path). So the Railway control-plane URL shows this UI — no separate service.

## Commands

```bash
pnpm --filter @donna/web dev        # local dev server
pnpm --filter @donna/web build      # production bundle
pnpm --filter @donna/web test       # Vitest + Testing Library (jsdom)
```
