-- Enable the pgvector extension for semantic-memory indexes.
-- Semantic vectors are an INDEX over authoritative relational state, never the
-- system of record (Technical Plan §3.1/§12, Build Bible V2-005).
CREATE EXTENSION IF NOT EXISTS vector;

-- pgcrypto provides gen_random_uuid() for primary keys in later phases.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
