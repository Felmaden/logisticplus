-- Persistent one-way bridges from internal group chats to canonical shipment chats.
-- Messages and attachments remain canonical in their source thread; delivery rows
-- make only the explicitly forwarded messages visible in the shipment thread.

CREATE TABLE IF NOT EXISTS chat_group_shipment_bridges (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  group_thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  shipment_thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  shipment_id TEXT REFERENCES shipments(id) ON DELETE SET NULL,
  activated_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  activated_by_message_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_by_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  deactivated_at TIMESTAMPTZ,
  deactivation_reason TEXT,
  CONSTRAINT chat_group_shipment_bridges_distinct_threads_check
    CHECK (group_thread_id <> shipment_thread_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_group_shipment_bridges_one_active_group_uidx
  ON chat_group_shipment_bridges (organization_id, group_thread_id)
  WHERE deactivated_at IS NULL;

CREATE INDEX IF NOT EXISTS chat_group_shipment_bridges_org_shipment_active_idx
  ON chat_group_shipment_bridges (organization_id, shipment_thread_id, activated_at DESC)
  WHERE deactivated_at IS NULL;

CREATE INDEX IF NOT EXISTS chat_group_shipment_bridges_org_group_history_idx
  ON chat_group_shipment_bridges (organization_id, group_thread_id, activated_at DESC);

CREATE TABLE IF NOT EXISTS chat_message_forward_deliveries (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  bridge_id TEXT REFERENCES chat_group_shipment_bridges(id) ON DELETE SET NULL,
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  source_thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  target_thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_message_forward_deliveries_distinct_threads_check
    CHECK (source_thread_id <> target_thread_id),
  UNIQUE (message_id, target_thread_id)
);

CREATE INDEX IF NOT EXISTS chat_message_forward_deliveries_org_target_created_idx
  ON chat_message_forward_deliveries (organization_id, target_thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_message_forward_deliveries_org_source_created_idx
  ON chat_message_forward_deliveries (organization_id, source_thread_id, created_at DESC);

ALTER TABLE chat_message_read_receipts
  DROP CONSTRAINT IF EXISTS chat_message_read_receipts_message_id_user_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chat_message_read_receipts_thread_message_user_key'
  ) THEN
    ALTER TABLE chat_message_read_receipts
      ADD CONSTRAINT chat_message_read_receipts_thread_message_user_key
      UNIQUE (thread_id, message_id, user_id);
  END IF;
END
$$;
