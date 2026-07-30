import { createCanonicalNotification } from "./notification.repository.js";
import { processPushOutbox } from "./push.service.js";
import { parse as parseJalali, subMonths, subWeeks } from "date-fns-jalali";

const PUSH_INTERVAL_MS = 10_000;
const REMINDER_SCAN_INTERVAL_MS = 5 * 60_000;
const TASK_REMINDER_LOCK_ID = 731_946_204;
const COMMERCIAL_CARD_EXPIRY_LOCK_ID = 731_946_205;
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

function normalizeReminderDigits(value = "") {
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  return String(value).replace(/[۰-۹٠-٩]/g, (digit) => {
    const persianIndex = persian.indexOf(digit);
    if (persianIndex >= 0) return String(persianIndex);
    const arabicIndex = arabic.indexOf(digit);
    return arabicIndex >= 0 ? String(arabicIndex) : digit;
  });
}

function parseReminderAt(value, { defaultHour = 9, defaultMinute = 0 } = {}) {
  const normalized = normalizeReminderDigits(value).trim();
  if (!normalized) return null;
  if (/[zZ]$|[+-][0-9]{2}:[0-9]{2}$/.test(normalized)) {
    const instant = new Date(normalized);
    return Number.isNaN(instant.getTime()) ? null : instant;
  }
  const match = normalized.match(/^([0-9]{4})[/-]([0-9]{1,2})[/-]([0-9]{1,2})(?:[ T]([0-9]{1,2}):([0-9]{1,2}))?/);
  if (!match) return null;
  const inputYear = Number(match[1]);
  const hour = Math.min(23, Math.max(0, Number(match[4] ?? defaultHour)));
  const minute = Math.min(59, Math.max(0, Number(match[5] ?? defaultMinute)));
  let year = inputYear;
  let month = Number(match[2]);
  let day = Number(match[3]);
  if (inputYear < 1700) {
    const jalali = parseJalali(
      `${match[1]}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`,
      "yyyy/MM/dd",
      new Date()
    );
    if (Number.isNaN(jalali.getTime())) return null;
    year = jalali.getFullYear();
    month = jalali.getMonth() + 1;
    day = jalali.getDate();
  }
  const timestamp = Date.UTC(year, month - 1, day, hour, minute) - TEHRAN_OFFSET_MS;
  const dueAt = new Date(timestamp);
  return Number.isNaN(dueAt.getTime()) ? null : dueAt;
}

export async function scanTaskRemindersOnce(pool) {
  const client = await pool.connect();
  let locked = false;
  try {
    const lockResult = await client.query(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [TASK_REMINDER_LOCK_ID]
    );
    locked = Boolean(lockResult.rows[0]?.locked);
    if (!locked) return 0;

    const tasks = await client.query(
      `SELECT
         task.id,
         task.organization_id,
         task.assigned_to_id,
         task.title,
         task.shipment_id,
         task.due_at
       FROM tasks task
       JOIN app_users recipient
         ON recipient.id = task.assigned_to_id
        AND recipient.organization_id = task.organization_id
        AND recipient.status = 'active'
       WHERE task.assigned_to_id IS NOT NULL
         AND task.due_at IS NOT NULL
         AND UPPER(COALESCE(task.status, 'TODO')) NOT IN ('DONE', 'COMPLETED', 'CANCELLED', 'CANCELED')
         AND COALESCE(recipient.notification_preferences->>'taskDeadlines', 'true') <> 'false'`
    );

    let created = 0;
    for (const task of tasks.rows) {
      const parsedDueAt = parseReminderAt(task.due_at);
      if (!parsedDueAt || parsedDueAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) continue;
      const dueAt = parsedDueAt.toISOString();
      const overdue = parsedDueAt.getTime() <= Date.now();
      const eventKind = overdue ? "overdue" : "due-soon";
      const notification = await createCanonicalNotification(client, {
        organizationId: task.organization_id,
        userId: task.assigned_to_id,
        title: overdue ? "مهلت انجام کار گذشته است" : "مهلت انجام کار نزدیک است",
        body: task.title || "یک کار نیاز به پیگیری دارد.",
        type: overdue ? "URGENT" : "WARNING",
        sourceType: overdue ? "TASK_OVERDUE" : "TASK_DUE_SOON",
        sourceId: task.id,
        link: task.shipment_id ? `/shipments/${task.shipment_id}` : "/tasks",
        eventKey: `task-${eventKind}:${task.id}:${dueAt}`,
      });
      if (notification) created += 1;
    }
    return created;
  } finally {
    if (locked) {
      await client.query("SELECT pg_advisory_unlock($1)", [TASK_REMINDER_LOCK_ID]).catch(() => {});
    }
    client.release();
  }
}

function commercialCardExpiryMilestone(expiration, now = new Date()) {
  if (expiration.getTime() <= now.getTime()) return null;
  if (now.getTime() >= subWeeks(expiration, 1).getTime()) {
    return {
      key: "one-week",
      title: "یک هفته تا انقضای کارت بازرگانی",
      sourceType: "COMMERCIAL_CARD_EXPIRY_1_WEEK",
      type: "URGENT",
    };
  }
  if (now.getTime() >= subMonths(expiration, 1).getTime()) {
    return {
      key: "one-month",
      title: "یک ماه تا انقضای کارت بازرگانی",
      sourceType: "COMMERCIAL_CARD_EXPIRY_1_MONTH",
      type: "WARNING",
    };
  }
  if (now.getTime() >= subMonths(expiration, 2).getTime()) {
    return {
      key: "two-months",
      title: "دو ماه تا انقضای کارت بازرگانی",
      sourceType: "COMMERCIAL_CARD_EXPIRY_2_MONTHS",
      type: "WARNING",
    };
  }
  return null;
}

export async function scanCommercialCardExpiryRemindersOnce(pool) {
  const client = await pool.connect();
  let locked = false;
  try {
    const lockResult = await client.query(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [COMMERCIAL_CARD_EXPIRY_LOCK_ID]
    );
    locked = Boolean(lockResult.rows[0]?.locked);
    if (!locked) return 0;

    const cards = await client.query(
      `SELECT DISTINCT ON (record.organization_id, record.item_id)
         record.organization_id,
         record.item_id,
         record.data
       FROM user_records record
       WHERE record.organization_id IS NOT NULL
         AND record.collection = 'commercialCards'
         AND COALESCE(record.data->>'expirationDate', '') <> ''
         AND COALESCE(record.data->>'isArchived', 'false') <> 'true'
         AND COALESCE(record.data->>'archivedAt', '') = ''
       ORDER BY record.organization_id, record.item_id, record.updated_at DESC`
    );

    const now = new Date();
    let created = 0;
    for (const card of cards.rows) {
      const expirationValue = String(card.data?.expirationDate || "").trim();
      const expiration = parseReminderAt(expirationValue, { defaultHour: 23, defaultMinute: 59 });
      if (!expiration) continue;
      const milestone = commercialCardExpiryMilestone(expiration, now);
      if (!milestone) continue;

      const recipients = await client.query(
        `SELECT id
         FROM app_users
         WHERE organization_id = $1
           AND status = 'active'
           AND COALESCE(notification_preferences->>'commercialCardExpiry', 'true') <> 'false'`,
        [card.organization_id]
      );
      const cardId = String(card.data?.id || card.item_id);
      const holderName = String(card.data?.holderName || "کارت بازرگانی").trim();
      const expirationDate = normalizeReminderDigits(expirationValue).split(/[ T]/)[0];
      const expirationKey = expiration.toISOString();
      for (const recipient of recipients.rows) {
        const notification = await createCanonicalNotification(client, {
          organizationId: card.organization_id,
          userId: recipient.id,
          title: milestone.title,
          body: `${holderName} در تاریخ ${expirationDate} منقضی می‌شود.`,
          type: milestone.type,
          sourceType: milestone.sourceType,
          sourceId: cardId,
          link: "/commercial-cards",
          eventKey: `commercial-card-expiry:${cardId}:${expirationKey}:${milestone.key}`,
        });
        if (notification) created += 1;
      }
    }
    return created;
  } finally {
    if (locked) {
      await client.query("SELECT pg_advisory_unlock($1)", [COMMERCIAL_CARD_EXPIRY_LOCK_ID]).catch(() => {});
    }
    client.release();
  }
}

export function startNotificationWorker(pool) {
  let pushRunning = false;
  let reminderRunning = false;

  const runPush = async () => {
    if (pushRunning) return;
    pushRunning = true;
    try {
      await processPushOutbox(pool);
    } catch (error) {
      console.error("Notification push worker failed:", error?.message || String(error));
    } finally {
      pushRunning = false;
    }
  };

  const runReminderScan = async () => {
    if (reminderRunning) return;
    reminderRunning = true;
    try {
      await scanTaskRemindersOnce(pool);
      await scanCommercialCardExpiryRemindersOnce(pool);
      await runPush();
    } catch (error) {
      console.error("Notification reminder scan failed:", error?.message || String(error));
    } finally {
      reminderRunning = false;
    }
  };

  const pushTimer = setInterval(() => void runPush(), PUSH_INTERVAL_MS);
  const reminderTimer = setInterval(() => void runReminderScan(), REMINDER_SCAN_INTERVAL_MS);
  pushTimer.unref?.();
  reminderTimer.unref?.();
  void runReminderScan();
  return () => {
    clearInterval(pushTimer);
    clearInterval(reminderTimer);
  };
}
