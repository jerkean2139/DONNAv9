# @donna/web

The command-first web experience (Technical Plan §8 / UX spec). Vite + React +
TypeScript + Tailwind. Donna dominates the shell — not a chat panel inside a
project manager (Build Bible V2-001).

## Layout

Mobile-first, installable (PWA):

- **Phones** — an app bar with Donna and her live presence, the current
  section, the command composer, and a bottom tab bar (Today, Projects, Tasks,
  Leads, More).
- **Desktop** — a sidebar with every section, the same feed and composer in a
  centered column, and an "At a glance" summary on wide screens.

## Live data

Objectives (list + create from the command bar) and control-plane health are
live. Sections without an API yet (Projects, Tasks, Leads, People, Memory,
Automations) show an honest "Not connected yet" state — no fabricated data.
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
