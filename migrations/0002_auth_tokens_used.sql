-- WP5 (rework plan §3.3): single-use login links.
-- Additive only: one new table. No existing data is modified or deleted.
--
-- Run BEFORE deploying the WP5 code:
--   wrangler d1 execute enviro-map-readings --remote --file=migrations/0002_auth_tokens_used.sql
--
-- Each login email JWT carries a unique jti; POST /api/v1/verify records it
-- here on first use and rejects replays. Expired rows are purged
-- opportunistically on each verify (login tokens live 15 minutes, so the
-- table stays tiny).

CREATE TABLE IF NOT EXISTS auth_tokens_used (
  jti        TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
) WITHOUT ROWID;
