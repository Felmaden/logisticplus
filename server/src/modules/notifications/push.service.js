import webpush from "web-push";
import { isWebPushEnabled } from "./notification.repository.js";

const MAX_ATTEMPTS = 5;
const CLAIM_LIMIT = 50;
const SAFE_LINK_PATTERN = /^\/(?:chat|shipments|tasks|profile|dashboard)(?:\/|[?#]|$)/;

function webPushConfig(env = process.env) {
  return {
    enabled: isWebPushEnabled(env),
    publicKey: String(env.WEB_PUSH_VAPID_PUBLIC_KEY || "").trim(),
    privateKey: String(env.WEB_PUSH_VAPID_PRIVATE_KEY || "").trim(),
    subject: String(env.WEB_PUSH_VAPID_SUBJECT || "").trim(),
  };
}

export function getPublicPushConfiguration(env = process.env) {
  const config = webPushConfig(env);
  return {
    enabled: config.enabled && Boolean(config.publicKey && config.privateKey && config.subject),
    publicKey: config.publicKey,
  };
}

export function configureWebPush(env = process.env) {
  const config = webPushConfig(env);
  if (!config.enabled) return false;
  if (!config.publicKey || !config.privateKey || !config.subject) {
    throw new Error("Web Push is enabled but VAPID configuration is incomplete.");
  }
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return true;
}

function allowlistedLink(notification) {
  const candidate = String(notification.link || "/dashboard");
  return SAFE_LINK_PATTERN.test(candidate) ? candidate : "/dashboard";
}

function safePayload(row) {
  const sourceType = String(row.source_type || "").toUpperCase();
  const isChat = sourceType === "CHAT";
  const isTask = sourceType === "TASK" || sourceType.startsWith("TASK_");
  return {
    notificationId: row.notification_id,
    title: row.title || (isChat ? "پیام جدید" : "به‌روزرسانی LogisticPlus"),
    body: isChat
      ? (row.body || "یک پیام جدید در گفتگو دارید.")
      : isTask
        ? "یک وظیفه نیاز به بررسی دارد."
        : (row.body || "یک اعلان عملیاتی جدید دارید."),
    link: allowlistedLink({ link: row.legacy_data?.link }),
    type: row.notification_type || "INFO",
    tag: `logisticplus:${row.notification_id}`,
    unreadCount: Math.max(1, Number(row.unread_count) || 1),
  };
}

async function claimDeliveries(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `WITH candidates AS (
         SELECT delivery.id
         FROM notification_push_deliveries delivery
         WHERE (
           delivery.status = 'pending'
           OR (
             delivery.status = 'processing'
             AND delivery.locked_at < NOW() - INTERVAL '5 minutes'
           )
         )
           AND delivery.next_attempt_at <= NOW()
         ORDER BY delivery.created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE notification_push_deliveries delivery
       SET status = 'processing',
           locked_at = NOW(),
           attempt_count = delivery.attempt_count + 1,
           updated_at = NOW()
       FROM candidates
       WHERE delivery.id = candidates.id
       RETURNING delivery.*`,
      [CLAIM_LIMIT]
    );
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function loadDelivery(pool, deliveryId) {
  const result = await pool.query(
    `SELECT
       delivery.id,
       delivery.organization_id,
       delivery.notification_id,
       delivery.subscription_id,
       delivery.attempt_count,
       subscription.endpoint,
       subscription.p256dh,
       subscription.auth,
       notification.title,
       notification.body,
       notification.type AS notification_type,
       notification.source_type,
       notification.legacy_data,
       (
         SELECT COUNT(*)::integer
         FROM notifications unread
         WHERE unread.organization_id = notification.organization_id
           AND unread.user_id = notification.user_id
           AND unread.read_at IS NULL
       ) AS unread_count
     FROM notification_push_deliveries delivery
     JOIN chat_push_subscriptions subscription
       ON subscription.id = delivery.subscription_id
      AND subscription.organization_id = delivery.organization_id
      AND subscription.disabled_at IS NULL
     JOIN notifications notification
       ON notification.id = delivery.notification_id
      AND notification.organization_id = delivery.organization_id
     WHERE delivery.id = $1`,
    [deliveryId]
  );
  return result.rows[0] || null;
}

function retryDelaySeconds(attemptCount) {
  return Math.min(3600, 30 * (2 ** Math.max(0, attemptCount - 1)));
}

async function markDeliverySent(pool, row) {
  await pool.query(
    `WITH sent AS (
       UPDATE notification_push_deliveries
       SET status = 'sent', sent_at = NOW(), locked_at = NULL, last_error = NULL, updated_at = NOW()
       WHERE id = $1
       RETURNING subscription_id
     )
     UPDATE chat_push_subscriptions subscription
     SET last_attempt_at = NOW(), last_success_at = NOW(), failure_count = 0,
         last_failure_reason = NULL, updated_at = NOW()
     FROM sent
     WHERE subscription.id = sent.subscription_id`,
    [row.id]
  );
}

async function markDeliveryFailed(pool, row, error) {
  const statusCode = Number(error?.statusCode || 0);
  const terminalSubscription = statusCode === 404 || statusCode === 410;
  const terminalDelivery = terminalSubscription || row.attempt_count >= MAX_ATTEMPTS;
  const reason = String(error?.message || "Web Push delivery failed.").slice(0, 500);
  const delaySeconds = retryDelaySeconds(row.attempt_count);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE notification_push_deliveries
       SET status = $2,
           next_attempt_at = CASE WHEN $2 = 'pending' THEN NOW() + ($3 * INTERVAL '1 second') ELSE next_attempt_at END,
           locked_at = NULL,
           last_error = $4,
           updated_at = NOW()
       WHERE id = $1`,
      [row.id, terminalDelivery ? "failed" : "pending", delaySeconds, reason]
    );
    await client.query(
      `UPDATE chat_push_subscriptions
       SET last_attempt_at = NOW(),
           last_failure_at = NOW(),
           last_failure_reason = $2,
           failure_count = failure_count + 1,
           disabled_at = CASE WHEN $3::boolean THEN NOW() ELSE disabled_at END,
           disabled_reason = CASE WHEN $3::boolean THEN 'provider_gone' ELSE disabled_reason END,
           updated_at = NOW()
       WHERE id = $1`,
      [row.subscription_id, reason, terminalSubscription]
    );
    await client.query("COMMIT");
  } catch (transactionError) {
    await client.query("ROLLBACK").catch(() => {});
    throw transactionError;
  } finally {
    client.release();
  }
}

export async function processPushOutbox(pool, {
  sendNotification = webpush.sendNotification.bind(webpush),
  env = process.env,
} = {}) {
  if (!getPublicPushConfiguration(env).enabled) return { claimed: 0, sent: 0, failed: 0 };
  configureWebPush(env);
  const claims = await claimDeliveries(pool);
  let sent = 0;
  let failed = 0;
  for (const claim of claims) {
    const row = await loadDelivery(pool, claim.id);
    if (!row) {
      await pool.query(
        `UPDATE notification_push_deliveries
         SET status = 'failed', locked_at = NULL, last_error = 'Subscription is unavailable.', updated_at = NOW()
         WHERE id = $1`,
        [claim.id]
      );
      failed += 1;
      continue;
    }
    try {
      await sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        JSON.stringify(safePayload(row)),
        { TTL: 60 * 60, urgency: "high" }
      );
      await markDeliverySent(pool, row);
      sent += 1;
    } catch (error) {
      await markDeliveryFailed(pool, row, error);
      failed += 1;
    }
  }
  return { claimed: claims.length, sent, failed };
}
