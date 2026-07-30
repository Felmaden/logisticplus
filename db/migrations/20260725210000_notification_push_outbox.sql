-- Durable, idempotent Web Push delivery for canonical in-app notifications.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS event_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_org_user_event_key_uidx
  ON notifications (organization_id, user_id, event_key)
  WHERE event_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS notification_push_deliveries (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES chat_push_subscriptions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_push_deliveries_status_check
    CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  CONSTRAINT notification_push_deliveries_attempt_count_check
    CHECK (attempt_count >= 0),
  UNIQUE (notification_id, subscription_id)
);

CREATE INDEX IF NOT EXISTS notification_push_deliveries_pending_idx
  ON notification_push_deliveries (status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS notification_push_deliveries_org_status_idx
  ON notification_push_deliveries (organization_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS notification_push_deliveries_notification_idx
  ON notification_push_deliveries (notification_id);
