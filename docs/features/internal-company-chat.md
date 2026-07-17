# Internal company chat

## Scope

Company chat supports three internal categories:

- Direct messages
- Internal groups
- Shipment chats

Shipment detail pages show the shipment chat panel above documents so operational discussion is visible before file handling. The compact shipment-detail panel is V1 text-only. Full attachment upload, preview, download, and deletion are available from the main `/chat` page.

## Group administration

Users with `chat.manage_groups` can create groups and administer groups where they are active members. The main chat group-settings dialog lists current members and active same-company users who can be added. Member removal is intentionally not exposed in this release.

`DELETE /api/chat/threads/:id` removes a group from members' active chat lists by setting `archived_at`. It does not delete group members, messages, attachments, chat events, or audit history. Direct-message and shipment threads cannot be archived through this route.

## Attachments

Chat attachments are stored separately from official shipment documents in `chat_message_attachments`.

Allowed types:

- Images: JPG, PNG, WebP up to 5 MB
- Files: PDF, DOCX, XLSX, TXT, CSV up to 15 MB
- Voice messages: WebM/Opus, Ogg/Opus, or M4A/MP4 up to 10 MB

Attachment previews and downloads always go through server routes:

- `GET /api/chat/messages/:messageId/attachments/:attachmentId/preview`
- `GET /api/chat/messages/:messageId/attachments/:attachmentId/download`

Images and PDFs open inside a responsive dialog on `/chat`; audio uses the browser's native player. Downloads remain available as a fallback. The frontend receives only allowlisted metadata and backend preview/download URLs. Storage keys, buckets, object keys, and local paths are never exposed in chat DTOs.

Voice recording uses the browser's `getUserMedia` and `MediaRecorder` APIs. The UI feature-detects WebM/Opus, Ogg/Opus, and Safari-compatible M4A/MP4, stops automatically after five minutes, releases microphone tracks after stop/cancel, and requires an explicit send. Captions are optional. Text and file chat continue to work if recording is unsupported or microphone permission is denied.

## Access Control

Attachment upload, preview, download, and sender deletion require normal chat membership checks. Shipment chat access also uses the existing shipment access guard. Group member changes and archival additionally require `chat.manage_groups`, active membership in that group, and the authenticated user's server-derived tenant scope.

The CEO-only media library lives in `/documents` under "رسانه‌ها و فایل‌های گفتگو" and includes image, document, and audio filters with inline audio playback. It requires:

- `chat.media.view`
- `chat.media.delete` for deleting any chat media item

Only the CEO role is seeded with these permissions.

## Deletion

Deleting a chat attachment soft-deletes the attachment row, removes its storage object/file when possible, and writes audit/chat events. Deleted attachments remain visible as placeholders in chat history and as deleted records in the CEO media library. Official document records are not changed by chat attachment deletion.

## Public Tracking

Public tracking responses must not include chat messages, chat attachments, filenames from internal chat media, or any chat storage metadata. Public tracking continues to use allowlisted public DTO fields only.
