import crypto from "node:crypto";
import { pool } from "../../db/pool.js";
import { toUiContactRequest } from "./contact-request.mapper.js";

function nullableText(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export async function createContactRequest(request) {
  const result = await pool.query(
    `INSERT INTO contact_requests (
       id, company_name, contact_name, contact_email, contact_phone,
       preferred_contact_method, message, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'new')
     RETURNING *`,
    [
      crypto.randomUUID(),
      request.companyName,
      request.contactName,
      nullableText(request.contactEmail),
      nullableText(request.contactPhone),
      request.preferredContactMethod,
      nullableText(request.message),
    ]
  );
  return toUiContactRequest(result.rows[0]);
}

export async function listContactRequests({ status, limit = 100 } = {}) {
  const values = [];
  const conditions = [];
  if (status) {
    values.push(status);
    conditions.push(`cr.status = $${values.length}`);
  }
  values.push(Math.min(Math.max(Number(limit) || 100, 1), 250));
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT cr.*, resolver.name AS resolved_by_name
     FROM contact_requests cr
     LEFT JOIN app_users resolver ON resolver.id = cr.resolved_by_id
     ${where}
     ORDER BY cr.created_at DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows.map(toUiContactRequest);
}

export async function resolveContactRequest(requestId, resolverUserId) {
  const result = await pool.query(
    `WITH resolved AS (
       UPDATE contact_requests
       SET status = 'resolved',
           resolved_by_id = $2,
           resolved_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *
     )
     SELECT resolved.*, resolver.name AS resolved_by_name
     FROM resolved
     LEFT JOIN app_users resolver ON resolver.id = resolved.resolved_by_id`,
    [requestId, resolverUserId]
  );
  return toUiContactRequest(result.rows[0]);
}
