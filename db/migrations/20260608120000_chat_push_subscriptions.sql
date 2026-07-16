-- Additive only: opt-in browser push subscriptions for internal chat.

CREATE TABLE IF NOT EXISTS chat_push_subscriptions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  endpoint_hash TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  expiration_time TIMESTAMPTZ,
  user_agent TEXT,
  disabled_at TIMESTAMPTZ,
  disabled_reason TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_push_subscriptions_failure_count_check CHECK (failure_count >= 0),
  CONSTRAINT chat_push_subscriptions_endpoint_hash_check CHECK (char_length(endpoint_hash) = 64)
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_push_subscriptions_endpoint_hash_uidx
  ON chat_push_subscriptions (endpoint_hash);

CREATE INDEX IF NOT EXISTS chat_push_subscriptions_org_user_active_idx
  ON chat_push_subscriptions (organization_id, user_id, disabled_at)
  WHERE disabled_at IS NULL;

CREATE INDEX IF NOT EXISTS chat_push_subscriptions_org_updated_idx
  ON chat_push_subscriptions (organization_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS chat_push_subscriptions_failure_idx
  ON chat_push_subscriptions (organization_id, failure_count DESC, last_failure_at DESC)
  WHERE disabled_at IS NULL;
