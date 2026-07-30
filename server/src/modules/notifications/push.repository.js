import crypto from "node:crypto";

function endpointHash(endpoint) {
  return crypto.createHash("sha256").update(endpoint).digest("hex");
}

export async function getPushStatus(pool, { organizationId, userId } = {}) {
  const result = await pool.query(
    `SELECT endpoint, expiration_time, created_at, updated_at, last_success_at
     FROM chat_push_subscriptions
     WHERE organization_id = $1
       AND user_id = $2
       AND disabled_at IS NULL
     ORDER BY updated_at DESC`,
    [organizationId, userId]
  );
  return result.rows;
}

export async function upsertPushSubscription(pool, {
  organizationId,
  userId,
  subscription,
  userAgent = null,
} = {}) {
  const endpoint = subscription.endpoint;
  const hash = endpointHash(endpoint);
  const result = await pool.query(
    `INSERT INTO chat_push_subscriptions (
       id, organization_id, user_id, endpoint, endpoint_hash, p256dh, auth,
       expiration_time, user_agent, disabled_at, disabled_reason, failure_count,
       last_failure_reason, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, NULL, 0, NULL, NOW(), NOW())
     ON CONFLICT (endpoint_hash) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       user_id = EXCLUDED.user_id,
       endpoint = EXCLUDED.endpoint,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       expiration_time = EXCLUDED.expiration_time,
       user_agent = EXCLUDED.user_agent,
       disabled_at = NULL,
       disabled_reason = NULL,
       failure_count = 0,
       last_failure_reason = NULL,
       updated_at = NOW()
     RETURNING id, endpoint, expiration_time, created_at, updated_at, last_success_at`,
    [
      crypto.randomUUID(),
      organizationId,
      userId,
      endpoint,
      hash,
      subscription.keys.p256dh,
      subscription.keys.auth,
      subscription.expirationTime ? new Date(subscription.expirationTime) : null,
      userAgent ? String(userAgent).slice(0, 500) : null,
    ]
  );
  return result.rows[0];
}

export async function disablePushSubscription(pool, {
  organizationId,
  userId,
  endpoint,
  reason = "user_disabled",
} = {}) {
  const result = await pool.query(
    `UPDATE chat_push_subscriptions
     SET disabled_at = COALESCE(disabled_at, NOW()),
         disabled_reason = $4,
         updated_at = NOW()
     WHERE organization_id = $1
       AND user_id = $2
       AND endpoint_hash = $3
       AND disabled_at IS NULL
     RETURNING id`,
    [organizationId, userId, endpointHash(endpoint), reason]
  );
  return result.rowCount > 0;
}
