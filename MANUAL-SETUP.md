# DONNA V2 — Manual Setup Checklist

This is the list of things **only you can do** — they need dashboards, live
accounts, secrets, or a production database that I can't (and shouldn't) touch
from here. Everything in the codebase that can be built without these is already
built and merged; this document is the manual wall.

Work top to bottom. Each section says **what**, **where**, and — for anything
you set locally — gives the **Windows PowerShell** command to set it.

> **Secrets note.** I do **not** generate any secrets or JWTs myself. Every
> secret below is issued by a provider (Clerk, GoHighLevel, Railway, Anthropic)
> — you copy it from their dashboard. The auth system is verify-only: Clerk owns
> login/MFA and signs the JWTs; DONNA only verifies them against Clerk's public
> JWKS. So there is nothing for you to run to "create" a key — only values to
> copy into environment variables. The PowerShell commands below are for putting
> those provider-issued values into your **local** environment for testing; in
> production they go into **Railway** (see §6).

---

## How environment variables work here

- **Locally (Windows PowerShell)** — set a variable for the current terminal
  session with `$env:NAME = "value"`. It lasts until you close that window.
  To persist it across reboots for your user account, use
  `[Environment]::SetEnvironmentVariable("NAME", "value", "User")` (then open a
  new terminal).
- **In production** — set the same variables in **Railway** → your service →
  **Variables** tab. Never commit any of these to the repo.

The apps degrade gracefully when a variable is missing (they log a warning and
fall back to a dev/in-memory mode), so you can bring them online one at a time.

---

## 1. Database — `DATABASE_URL` (required for anything durable)

**What:** the Postgres connection string. Without it the control-plane and
worker run in non-durable in-memory mode.

**Where:** Railway → add a **PostgreSQL** plugin/service → copy its connection
string (Railway exposes it as `DATABASE_URL` automatically to services in the
same project; for local use copy the public connection string).

**Local PowerShell:**

```powershell
$env:DATABASE_URL = "postgres://USER:PASSWORD@HOST:PORT/DBNAME"
```

### 1a. Apply the database migrations ⚠️ approval-gated — you run this

The schema lives in `packages/db/migrations/`. It must be applied to the
Railway Postgres **before** the API/worker will work durably. Migrations
`0000`–`0003` are in the repo (0002/0003 add the nullable `external_auth_id`
columns Clerk provisioning writes to).

Run from the repo root with `DATABASE_URL` pointing at the target database:

```powershell
$env:DATABASE_URL = "postgres://USER:PASSWORD@HOST:PORT/DBNAME"
pnpm --filter @donna/db run db:migrate
```

> The control-plane applies the **graphile-worker** queue schema itself on boot;
> the command above applies the **application** schema (organizations, users,
> objectives, tasks, events, etc.). Run it once against the production DB.
> I deliberately do **not** run migrations against your production database —
> applying schema changes to live data is your call. I have validated this exact
> migration set against a throwaway local Postgres 16 many times; it applies
> cleanly.

---

## 2. AI models — `ANTHROPIC_API_KEY` (required for AI capabilities)

**What:** the API key the Anthropic model adapter uses. Without it, AI work
orders can't execute (they resolve to no adapter).

**Where:** <https://console.anthropic.com> → **API Keys** → create key.

**Local PowerShell:**

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
```

Anthropic is the primary provider and the only one required for AI work. OpenAI
(§2a) and a local model (§2b) are **optional** additional providers — the Model
Router uses them for fallback and privacy-constrained routing. Any provider you
don't configure simply stays unavailable; nothing breaks.

### 2a. OpenAI (optional) — `OPENAI_API_KEY`

**What:** enables the OpenAI model adapter. Only wired when the key is set;
absent → the provider stays unavailable (no crash).

**Where:** <https://platform.openai.com/api-keys>.

| Variable          | Required?  | What it is                                       |
| ----------------- | ---------- | ------------------------------------------------ |
| `OPENAI_API_KEY`  | for OpenAI | OpenAI API key (Bearer)                          |
| `OPENAI_BASE_URL` | optional   | Override endpoint for an OpenAI-compatible proxy |

**Local PowerShell:**

```powershell
$env:OPENAI_API_KEY = "sk-..."
$env:OPENAI_BASE_URL = "https://your-proxy/v1"   # optional
```

### 2b. Local model (optional) — `LOCAL_MODEL_BASE_URL`

**What:** enables the local (self-hosted) model adapter for a model running
behind an **OpenAI-compatible** server on your own hardware (the Dell/Omen box) —
Ollama, vLLM, or LM Studio. Used for `requireLocal` / privacy-sensitive work.
Only wired when the endpoint is set.

**Where:** the URL your local server exposes, e.g. Ollama's
`http://127.0.0.1:11434/v1`. Most local servers ignore the API key, so
`LOCAL_MODEL_API_KEY` is optional (it defaults to a harmless placeholder).

| Variable               | Required? | What it is                            |
| ---------------------- | --------- | ------------------------------------- |
| `LOCAL_MODEL_BASE_URL` | for local | Local OpenAI-compatible endpoint URL  |
| `LOCAL_MODEL_API_KEY`  | optional  | Key if your local server enforces one |

**Local PowerShell:**

```powershell
$env:LOCAL_MODEL_BASE_URL = "http://127.0.0.1:11434/v1"
$env:LOCAL_MODEL_API_KEY = "not-needed"   # optional
```

> The model ids/pricing for OpenAI and local entries in the registry are still
> placeholders (`available: false`) pending your confirmation of the exact model
> pool — see `packages/config/src/models.ts`. Set those before relying on either
> provider in routing.

---

## 3. Production auth (Clerk) — JWT verification

DONNA verifies Clerk-issued JWTs against Clerk's public JWKS. If
`AUTH_JWKS_URL` is unset, the control-plane falls back to the **dev header
shim** (logs a loud warning — never use it in production).

### 3a. Environment variables

| Variable           | Required?               | What it is                               | Example                                                     |
| ------------------ | ----------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| `AUTH_JWKS_URL`    | **Yes** (for prod auth) | Clerk's JWKS endpoint                    | `https://YOUR-APP.clerk.accounts.dev/.well-known/jwks.json` |
| `AUTH_ISSUER`      | Recommended             | Expected token issuer                    | `https://YOUR-APP.clerk.accounts.dev`                       |
| `AUTH_AUDIENCE`    | Optional                | Expected audience claim                  | your API identifier                                         |
| `AUTH_REQUIRE_MFA` | Optional                | `"true"` to reject non-MFA sessions      | `true`                                                      |
| `AUTH_MFA_CLAIM`   | Optional                | JWT claim that signals MFA was satisfied | `mfa`                                                       |

**Where to find the values:** Clerk Dashboard → **API Keys** / **Show JWT
public key** and **Frontend API URL**. The JWKS URL is your Clerk Frontend API
URL + `/.well-known/jwks.json`.

**Local PowerShell:**

```powershell
$env:AUTH_JWKS_URL   = "https://YOUR-APP.clerk.accounts.dev/.well-known/jwks.json"
$env:AUTH_ISSUER     = "https://YOUR-APP.clerk.accounts.dev"
$env:AUTH_AUDIENCE   = "your-api-audience"      # optional
$env:AUTH_REQUIRE_MFA = "true"                  # optional
$env:AUTH_MFA_CLAIM  = "mfa"                     # optional, only if you add the claim below
```

### 3b. MFA session-token claim (only if you set `AUTH_REQUIRE_MFA=true`)

In the Clerk Dashboard → **Sessions** → **Customize session token**, add a
claim that reflects MFA state, e.g.:

```json
{ "mfa": "{{user.two_factor_enabled}}" }
```

Then set `AUTH_MFA_CLAIM=mfa`. The verifier rejects tokens where this claim is
missing/false when `AUTH_REQUIRE_MFA=true`.

---

## 4. Clerk provisioning webhook — `CLERK_WEBHOOK_SECRET`

DONNA auto-provisions organizations, users, and memberships from Clerk events
(so your tenant tables stay in sync with your identity provider). This only
activates when the signing secret is set.

### 4a. Create the webhook endpoint in Clerk

1. Deploy the control-plane (Railway gives it a public URL).
2. Clerk Dashboard → **Webhooks** → **Add Endpoint**.
3. **Endpoint URL:** `https://YOUR-CONTROL-PLANE-URL/webhooks/clerk`
4. **Subscribe to these events** (exactly the ones DONNA handles):
   - `organization.created`, `organization.updated`
   - `user.created`, `user.updated`, `user.deleted`
   - `organizationMembership.created`, `organizationMembership.updated`,
     `organizationMembership.deleted`
5. Copy the endpoint's **Signing Secret** (starts with `whsec_`).

### 4b. Environment variable

**Local PowerShell:**

```powershell
$env:CLERK_WEBHOOK_SECRET = "whsec_..."
```

Set the same value in Railway. Without it, the `/webhooks/clerk` route is not
registered at all (fail-closed).

---

## 5. GoHighLevel CRM adapter — `GHL_TOKEN` (+ optional `GHL_LOCATION_ID`)

The worker registers a GoHighLevel CRM capability when `GHL_TOKEN` is present.

| Variable          | Required?     | What it is                                                    |
| ----------------- | ------------- | ------------------------------------------------------------- |
| `GHL_TOKEN`       | Yes (for CRM) | GHL / LeadConnector v2 API access token (Bearer)              |
| `GHL_LOCATION_ID` | Optional      | Default location/sub-account id used when a request omits one |

**Where:** GoHighLevel → **Settings → API / Private Integrations** (or your
LeadConnector app's OAuth token). The token must have contacts + conversations
scopes for the mapped operations (contact upsert/get/search, message send).

**Local PowerShell:**

```powershell
$env:GHL_TOKEN       = "your-ghl-access-token"
$env:GHL_LOCATION_ID = "your-default-location-id"   # optional
```

### 5a. Live smoke test (your call — hits the real GHL account)

I've verified the adapter's request _mapping_ in unit tests, but I can't run a
live call without your token. Once `GHL_TOKEN` is set, a `contact.upsert` work
order should create/update a contact in your GHL sub-account. Do this against a
test location first.

---

## 6. Railway service configuration

DONNA runs as **two processes**, so you need **two Railway services** in the same
project, both deploying this repo:

| Service | Runs                                                  | Config file (set in service → Settings → **Config File**) |
| ------- | ----------------------------------------------------- | --------------------------------------------------------- |
| API     | the control-plane (HTTP API, migrates the DB on boot) | `railway.control-plane.json`                              |
| Worker  | the worker (processes queued jobs)                    | `railway.worker.json`                                     |

Those two committed config files pin the build command (`pnpm run build`), the
start command (`pnpm --filter @donna/<app> start`), and — for the API — the
`/health` healthcheck. Without a config file Railway's autodetect fails on this
monorepo (`No start command detected`), so **point each service at its file** in
**Settings → Config File** (a.k.a. "Railway Config File" / config-as-code path).
Leave **Root Directory** at the repo root `/` for both.

Then, in each service → **Variables**, set what that service needs:

- **API (control-plane):** `DATABASE_URL`, `AUTH_JWKS_URL` (+ the other `AUTH_*`),
  `CLERK_WEBHOOK_SECRET`. Do **not** set `PORT` — Railway injects it and the app
  reads it automatically.
- **Worker:** `DATABASE_URL`, `ANTHROPIC_API_KEY`, `GHL_TOKEN`
  (+ `GHL_LOCATION_ID` if used), and optionally `OPENAI_API_KEY` /
  `LOCAL_MODEL_BASE_URL` to enable those providers.

Wire `DATABASE_URL` by **reference**, not by pasting the secret: in the Variables
editor type `${{` and pick your Postgres service's `DATABASE_URL` (it becomes
`${{Postgres.DATABASE_URL}}`).

---

## Quick reference — every environment variable

| Variable               | Service       | Required                | Source                                        |
| ---------------------- | ------------- | ----------------------- | --------------------------------------------- |
| `DATABASE_URL`         | both          | for durability          | Railway Postgres                              |
| `ANTHROPIC_API_KEY`    | worker        | for AI                  | console.anthropic.com                         |
| `OPENAI_API_KEY`       | worker        | optional (OpenAI)       | platform.openai.com/api-keys                  |
| `OPENAI_BASE_URL`      | worker        | optional                | OpenAI-compatible proxy URL                   |
| `LOCAL_MODEL_BASE_URL` | worker        | optional (local model)  | your local server, e.g. Ollama `/v1`          |
| `LOCAL_MODEL_API_KEY`  | worker        | optional                | only if your local server enforces one        |
| `AUTH_JWKS_URL`        | control-plane | for prod auth           | Clerk Frontend API + `/.well-known/jwks.json` |
| `AUTH_ISSUER`          | control-plane | recommended             | Clerk Frontend API URL                        |
| `AUTH_AUDIENCE`        | control-plane | optional                | your API audience                             |
| `AUTH_REQUIRE_MFA`     | control-plane | optional                | `"true"` to enforce                           |
| `AUTH_MFA_CLAIM`       | control-plane | optional                | claim name you added in Clerk                 |
| `CLERK_WEBHOOK_SECRET` | control-plane | for provisioning        | Clerk → Webhooks → Signing Secret             |
| `GHL_TOKEN`            | worker        | for CRM                 | GoHighLevel API                               |
| `GHL_LOCATION_ID`      | worker        | optional                | GoHighLevel sub-account id                    |
| `PORT`                 | control-plane | optional (default 3000) | you choose                                    |

---

## What's done vs. what's waiting on you

**Done (in the repo, no action needed):** monorepo + strict TS/lint/CI, Work
Router, Model Router, orchestrator, durable-queue worker, transactional outbox,
control-plane API + enqueue path, DB-backed persistence, tenant-scoped reads,
integration test harness (now runs against live Postgres in CI), capability
adapter contract, SSRF-safe HTTP adapter, Anthropic + OpenAI + local model
adapters (all wired into the worker's resolver), cross-class capability fallback,
Clerk JWT verification + provisioning webhook, GoHighLevel CRM adapter (wired
into the worker).

**Waiting on you (this document):** provider accounts + secrets (§2–§5),
applying migrations to the production DB (§1a), the Clerk dashboard config
(§3b, §4a), the live GHL smoke test (§5a), and Railway variable setup (§6).

Once these are in place, the system is deployable end to end.
