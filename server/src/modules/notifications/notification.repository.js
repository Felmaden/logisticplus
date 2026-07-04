import crypto from "node:crypto";
import { organizationScopeClause } from "../../shared/middleware/tenant.middleware.js";

const LEGACY_DEMO_NOTIFICATION_IDS = new Set(["n1", "n2", "n3", "n4"]);
const NOTIFICATION_TYPES = new Set(["INFO", "WARNING", "SUCCESS", "URGENT"]);

function isLegacyDemoNotification(row) {
  return LEGACY_DEMO_NOTIFICATION_IDS.has(String(row?.id || ""));
}

function normalizeNotificationType(type) {
  const value = String(type || "INFO").toUpperCase();
  return NOTIFICATION_TYPES.has(value) ? value : "INFO";
}

export function toUiNotification(row) {
  if (!row || isLegacyDemoNotification(row)) return null;
  return {
    id: row.id,
    title: row.title,
    message: row.body || "",
    type: normalizeNotificationType(row.type),
    isRead: Boolean(row.read_at),
    createdAt: row.created_at || new Date().toISOString(),
    link: row.legacy_data?.link || row.source_id || "/dashboard",
  };
}

export async function listNotifications(pool, { userId, organizationId, includeRead = false, limit = 50 } = {}) {
  const values = [userId];
  const organizationFilter = organizationScopeClause(
    values,
    organizationId,
    "organization_id",
    "listNotifications"
  );
  values.push(Boolean(includeRead), Math.min(Math.max(Number(limit) || 50, 1), 100));
  const includeReadParam = values.length - 1;
  const limitParam = values.length;

  const result = await pool.query(
    `SELECT *
     FROM notifications
     WHERE user_id = $1 ${organizationFilter}
       AND ($${includeReadParam}::boolean OR read_at IS NULL)
     ORDER BY created_at DESC
     LIMIT $${limitParam}`,
    values
  );

  return result.rows.map(toUiNotification).filter(Boolean);
}

export async function createShipmentCreatedNotifications(client, {
  organizationId,
  creatorUserId,
  shipmentId,
  shipmentCode,
} = {}) {
  const recipients = await client.query(
    `SELECT id
     FROM app_users
     WHERE organization_id = $1
       AND status = 'active'
       AND id <> $2
       AND COALESCE(notification_preferences->>'shipmentUpdates', 'true') <> 'false'`,
    [organizationId, creatorUserId]
  );

  for (const recipient of recipients.rows) {
    await client.query(
      `INSERT INTO notifications (
         id, organization_id, user_id, title, body, type, source_type, source_id, legacy_data, created_at
       )
       VALUES ($1, $2, $3, $4, $5, 'INFO', 'SHIPMENT', $6, $7::jsonb, NOW())`,
      [
        crypto.randomUUID(),
        organizationId,
        recipient.id,
        "محموله جدید ثبت شد",
        `محموله ${shipmentCode} به سامانه اضافه شد.`,
        shipmentId,
        JSON.stringify({ link: `/shipments/${shipmentId}` }),
      ]
    );
  }

  return recipients.rowCount;
}

export async function markNotificationRead(pool, notificationId, { userId, organizationId } = {}) {
  const values = [notificationId, userId];
  const organizationFilter = organizationScopeClause(
    values,
    organizationId,
    "organization_id",
    "markNotificationRead"
  );
  const result = await pool.query(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2 ${organizationFilter}
     RETURNING *`,
    values
  );

  return toUiNotification(result.rows[0]);
}

export async function markAllNotificationsRead(pool, { userId, organizationId } = {}) {
  const values = [userId];
  const organizationFilter = organizationScopeClause(
    values,
    organizationId,
    "organization_id",
    "markAllNotificationsRead"
  );
  await pool.query(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, NOW())
     WHERE user_id = $1 ${organizationFilter}
       AND read_at IS NULL`,
    values
  );

  return listNotifications(pool, { userId, organizationId, includeRead: true });
}
