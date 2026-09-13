-- migrate:up

-- Refresh tokens rotate on every use. A token presented after it was rotated means it
-- leaked, so the whole family (every token descended from one login) is revoked.
CREATE TABLE refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users (id),
  family_id  UUID NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash)
);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);

-- migrate:down

DO $$ BEGIN RAISE EXCEPTION 'Migrations are forward-only: write a new migration instead of rolling back'; END $$;
