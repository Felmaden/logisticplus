-- Allow browser-recorded voice messages in the existing private chat attachment pipeline.

ALTER TABLE chat_message_attachments
  DROP CONSTRAINT IF EXISTS chat_message_attachments_type_check;

ALTER TABLE chat_message_attachments
  ADD CONSTRAINT chat_message_attachments_type_check
  CHECK (attachment_type IN ('image', 'document', 'audio'))
  NOT VALID;

ALTER TABLE chat_message_attachments
  VALIDATE CONSTRAINT chat_message_attachments_type_check;
