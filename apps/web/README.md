# @donna/web

The command-first web experience (Technical Plan §8 / UX spec). Vite + React +
TypeScript + Tailwind. Donna dominates the shell — not a chat panel inside a
project manager (Build Bible V2-001).

## Design

"The Daily Brief" — Donna as a private morning paper written by your chief of
staff, not another dark-mode dashboard:

- **Type:** Instrument Serif headlines, Instrument Sans body, IBM Plex Mono
  labels — self-hosted in `public/fonts` (SIL OFL) so the installed app works
  offline and makes no third-party requests.
- **Color:** warm ink paper (`#0e0d0b`), cream type (`#efe8dc`), one ember
  accent (`#ff5b2e`), a film-grain overlay and an ember wash behind the masthead.
- **Voice:** Donna speaks in the first person ("Nothing's on fire. Tell me what
  we're getting done.").
- **Phone:** a masthead with the date, Donna's greeting and byline, a numbered
  agenda, a cream composer, and word-only tabs with an ember tick.
- **Desktop:** a numbered table-of-contents sidebar, the brief in a centered
  column, and a "By the numbers" box score on wide screens.

## Live data

- **Today** — objectives and control-plane health. Typing an outcome in the
  command bar creates the objective and (when the API has `ANTHROPIC_API_KEY`)
  Donna drafts a plan — client, project, sprint, tasks, subtasks — shown as a
  card to approve, trim or dismiss. On approval the records are created, and
  tasks Donna owns get drafted in the background; progress shows on Today and
  drafts appear on each task under "Donna's draft".
- **Clients → Projects → Sprints → Tasks → Subtasks** — the work hierarchy,
  with files (up to 10 MB, stored in Postgres) and links (Google Drive, Docs,
  Sheets, Slides, Dropbox, OneDrive, Notion, Figma, Loom, GitHub, any https URL)
  attachable at every level. Clients, Tasks and (under More) Projects are tabs;
  drilling down stays in the tab you started from.
- Sections without an API yet (Leads, People, Memory, Automations) show an
  honest "Not connected yet" state — no fabricated data.

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
