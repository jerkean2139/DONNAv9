# Repository structure

The target monorepo layout from the Technical Plan §2. Packages/apps are added
as their phase lands (plan §18) — this document is the map; only what a phase
needs is created, so the tree below is partly aspirational and marked per
phase.

```
DONNAv9/
├─ GREENFIELD-V2-TECHNICAL-PLAN.md      # approved design (ADR-0001)
├─ DONNA-V2-GREENFIELD-BUILD-BRIEF.md   # governing charter
├─ package.json  pnpm-workspace.yaml  turbo.json  tsconfig.base.json
├─ eslint.config.js  .prettierrc.json  .env.example
│
├─ apps/                                 # (added from Phase 1+)
│  ├─ web/            # Phase 2 ✅ React command-first shell (Vite + Tailwind)
│  ├─ control-plane/  # Phase 1 ✅ Fastify API skeleton (identity→policy→objective)
│  ├─ worker/         # Phase 1 ✅ durable job runtime (graphile-worker) + outbox
│  └─ node-agent/     # Phase 5 — Dell/Omen heartbeat + local inference
│
├─ packages/
│  ├─ core-domain/    # Phase 0 ✅ pure domain types + state machines
│  ├─ db/             # Phase 1 ✅ Drizzle schema, migrations, client
│  ├─ policy/         # Phase 1 ✅ deterministic permission + approval engine
│  ├─ events/         # Phase 1 ✅ typed events + bus + transactional outbox
│  ├─ work-router/    # Phase 3 — execution-class selection
│  ├─ model-router/   # Phase 4 — model/node selection + fallback
│  ├─ cost-governor/  # Phase 4 — budgets, usage ledger, model evaluation
│  ├─ context/        # Phase 4 — Context Packet builder + budgeting
│  ├─ memory/         # Phase 6 — semantic memory adapter (pgvector)
│  ├─ knowledge/      # Phase 6 — source ingestion + provenance
│  ├─ skills/         # Phase 8 — Skill Registry + SOP promotion
│  ├─ telemetry/      # Phase 4+ — OpenTelemetry + Donna Health
│  ├─ config/         # Phase 4 — model registry, pricing, feature flags
│  ├─ security/       # Phase 3+ — untrusted-data tagging, injection guards
│  └─ adapters/       # Phase 3+ — one package per capability family (§7)
│     ├─ base/  model-anthropic/  model-openai/  model-local/
│     ├─ github/  browser/  research/  fathom/  slack/
│     ├─ gmail/  drive/  ghl-zenoflo/  lead-builder/
│     └─ coding-agent/  automation-mcp/
│
├─ infra/
│  ├─ docker/         # Phase 0 ✅ dev Postgres + pgvector
│  ├─ migrations/     # Phase 1 — reviewed, reversible SQL
│  └─ deploy/         # per-environment host config
│
├─ docs/
│  ├─ adr/            # Phase 0 ✅ decision records (mirror Decisions Log)
│  ├─ build-bible-v2/ # read-only reference mirror (optional)
│  └─ runbooks/       # DR restore, kill-switch, incident, node onboarding
│
└─ tests/             # acceptance / tenant-isolation / provider-independence /
                      # injection / durability (plan §16)
```

## Enforced boundaries (CI)

- Feature/domain packages may not import provider SDKs — only
  `packages/adapters/*` may (`eslint.config.js`).
- `packages/core-domain` stays dependency-free (no `@donna/*`, no SDKs).
- `apps/web` may not import `@donna/db` or `@donna/policy` — it calls the
  control-plane API.
