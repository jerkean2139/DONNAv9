import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration.
 *
 * `db:generate` produces reversible SQL migrations from the schema without a
 * live database. `db:migrate` applies them and needs DATABASE_URL (local dev
 * points at the docker Postgres+pgvector; see infra/docker). No destructive
 * migration runs without explicit approval (Technical Plan §17, Build Bible
 * doc 16 STOP conditions).
 */
export default defineConfig({
  dialect: 'postgresql',
  // Point at compiled output: drizzle-kit's loader does not resolve the `.js`
  // ESM specifiers our NodeNext TS source uses, so `db:generate` builds first.
  schema: './dist/schema/index.js',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://donna:donna@localhost:5432/donna',
  },
  strict: true,
  verbose: true,
});
