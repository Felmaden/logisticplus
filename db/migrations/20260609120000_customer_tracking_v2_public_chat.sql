-- V2 customer tracking public chat support.
-- Additive/idempotent: preserves existing links, staff chat, documents, and shipment data.

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS sender_type TEXT NOT NULL DEFAULT 'user';

ALTER TABLE chat_messages
  ALTER COLUMN sender_id DROP NOT NULL;

UPDATE chat_messages
SET sender_type = 'user'
WHERE sender_type IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_threads_type_check'
  ) THEN
    ALTER TABLE chat_threads DROP CONSTRAINT chat_threads_type_check;
  END IF;

  ALTER TABLE chat_threads
    ADD CONSTRAINT chat_threads_type_check CHECK (type IN ('DM', 'GROUP', 'CHANNEL', 'SHIPMENT', 'CUSTOMER_SHIPMENT'));
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_sender_type_check'
  ) THEN
    ALTER TABLE chat_messages
      ADD CONSTRAINT chat_messages_sender_type_check CHECK (sender_type IN ('user', 'customer'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_sender_identity_check'
  ) THEN
    ALTER TABLE chat_messages
      ADD CONSTRAINT chat_messages_sender_identity_check CHECK (
        (sender_type = 'user' AND sender_id IS NOT NULL)
        OR sender_type = 'customer'
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_org_customer_shipment_active_uidx
  ON chat_threads (organization_id, shipment_id)
  WHERE shipment_id IS NOT NULL
    AND type = 'CUSTOMER_SHIPMENT'
    AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS chat_messages_org_thread_sender_type_created_idx
  ON chat_messages (organization_id, thread_id, sender_type, created_at DESC);
