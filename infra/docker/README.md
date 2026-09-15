# Local development infrastructure

LOCAL-only infrastructure for DONNA V2 development. This is **not** a
production topology — production uses managed Postgres (Supabase), a secrets
manager, object storage, and an always-on container host for the worker tier
(Technical Plan §14).

## Postgres + pgvector

One Postgres 16 instance carries both the authoritative relational state and
the `pgvector` semantic-memory index for local dev. Semantic vectors are an
index over authoritative state, never the system of record (Build Bible
V2-005).

### Start / stop

```bash
docker compose -f infra/docker/docker-compose.yml up -d
docker compose -f infra/docker/docker-compose.yml down       # keep data
docker compose -f infra/docker/docker-compose.yml down -v    # wipe data
```

Connection string for local dev (see `.env.example`):

```
postgresql://donna:donna@localhost:5432/donna
```

The `initdb/` scripts run once on first volume creation and enable the
`vector` and `pgcrypto` extensions.
