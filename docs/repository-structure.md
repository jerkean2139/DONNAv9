# Repository structure

The repository layout began from Technical Plan §2 and is now evolving under ADR-0004, ADR-0005, and
the Agent Factory Master Plan. Entries marked planned are not yet implemented; check the repository
rather than treating this tree as proof that code exists.

```
DONNAv9/
├─ GREENFIELD-V2-TECHNICAL-PLAN.md      # approved design (ADR-0001)
├─ DONNA-V2-GREENFIELD-BUILD-BRIEF.md   # governing charter
├─ package.json  pnpm-workspace.yaml  turbo.json  tsconfig.base.json
├─ eslint.config.js  .prettierrc.json  .env.example
│
├─ apps/                                 # (added from Phase 1+)
│  ├─ web/            # Phase 2 ✅ React command-first shell (Vite + Tailwind)
│  ├─ control-plane/  # Phase 1 ✅ Fastify API (JWT auth + Clerk provisioning→policy→enqueue)
│  ├─ worker/         # Phase 1 ✅ durable job runtime + outbox; runs orchestrator
│  └─ node-agent/     # Phase 5 — Dell/Omen heartbeat + local inference
│
├─ packages/
│  ├─ core-domain/    # Phase 0 ✅ pure domain types + state machines
│  ├─ db/             # Phase 1 ✅ Drizzle schema, migrations, client, event mapper
│  ├─ policy/         # Phase 1 ✅ deterministic permission + approval engine
│  ├─ events/         # Phase 1 ✅ typed events + bus + transactional outbox
│  ├─ work-router/    # Phase 3 ✅ execution-class selection (above Model Router)
│  ├─ orchestrator/   # Phase 4 ✅ spine: policy→work→model/capability→ledger; catalog
│  ├─ model-router/   # Phase 4 ✅ model/node selection + fallback
│  ├─ cost-governor/  # Phase 4 ✅ budgets, usage ledger, model evaluation
│  ├─ context/        # Phase 4 ✅ Context Packet builder + budgeting
│  ├─ memory/         # v9 Phase 2 — persistent layered memory + lifecycle (planned)
│  ├─ knowledge/      # v9 Phase 2 — source ingestion + provenance (planned)
│  ├─ learning/       # v9 Phase 3 — policy-gated learning engine (planned)
│  ├─ skills/         # v9 Phase 4 — Skills 2.0 + Marketplace contracts (planned)
│  ├─ integration-registry/ # v9 Phase 5 — APIs/MCP/connectors/tool manifests (planned)
│  ├─ agent-factory/  # v9 Phase 6 — AgentSpec compiler (planned)
│  ├─ telemetry/      # Phase 4+ — OpenTelemetry + Donna Health
│  ├─ config/         # Phase 4 ✅ model registry, pricing, feature flags
│  ├─ security/       # Phase 3+ — untrusted-data tagging, injection guards
│  └─ adapters/       # Phase 3+ — one package per capability family (§7)
│     ├─ base/        # Phase 3 ✅ capability + model adapter contracts
│     ├─ capability-fn/  # Phase 4 ✅ deterministic in-process capability adapter
│     ├─ http/         # Phase 4 ✅ HTTP capability adapter (automation class, SSRF-safe)
│     ├─ ghl/          # Phase 4 ✅ GoHighLevel CRM adapter (concrete, on adapter-http)
│     ├─ model-anthropic/  # Phase 4 ✅ Claude ModelAdapter (@anthropic-ai/sdk)
│     ├─ model-openai/  model-local/
│     ├─ github/  browser/  research/  fathom/  slack/
│     ├─ gmail/  drive/  ghl-zenoflo/  lead-builder/
│     ├─ marketplace-github/ # approved KOB Marketplace skill/capability import
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

## Planned v9 architectural boundaries

- `memory` owns lifecycle-aware persistent memory, not authoritative business state.
- `learning` proposes evidence-backed changes; it cannot grant authority or silently rewrite policy.
- `integration-registry` describes capabilities; adapters execute them; `policy` authorizes them.
- Marketplace content is candidate capability content until validated and approved.
- Voice, chat, desktop/PWA, and API share the same control plane, memory, and authority model.
- Client archive state is excluded from normal active retrieval and revalidated before reactivation.
