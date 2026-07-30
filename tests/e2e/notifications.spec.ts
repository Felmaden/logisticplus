import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import pg from "pg";
import { addDays, format } from "date-fns-jalali";
import {
  scanCommercialCardExpiryRemindersOnce,
  scanTaskRemindersOnce,
} from "../../server/src/modules/notifications/push.worker.js";
import { processPushOutbox } from "../../server/src/modules/notifications/push.service.js";
import {
  USER_PASSWORD,
  disposeContexts,
  expectUnavailable,
  loginApi,
  nextValidShipmentCode,
  readOk,
  uniqueEmail,
} from "./helpers";

const { Client } = pg;
type DbClient = InstanceType<typeof Client>;
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";

const allowedNotificationKeys = ["createdAt", "id", "isRead", "link", "message", "title", "type"];

async function ownerOrganizationId(client: DbClient) {
  const result = await client.query("SELECT organization_id FROM app_users WHERE id = 'u1'");
  return result.rows[0]?.organization_id;
}

async function insertNotification(
  client: DbClient,
  {
    id,
    organizationId,
    userId = "u1",
    title = "E2E live notification",
    read = false,
  }: {
    id: string;
    organizationId: string;
    userId?: string;
    title?: string;
    read?: boolean;
  }
) {
  await client.query(
    `INSERT INTO notifications (
       id, organization_id, user_id, title, body, type, source_type, source_id, legacy_data, read_at, created_at
     )
     VALUES ($1, $2, $3, $4, 'Canonical notification body', 'INFO', 'E2E', '/tasks', $5::jsonb, $6, NOW())
     ON CONFLICT (id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       user_id = EXCLUDED.user_id,
       title = EXCLUDED.title,
       body = EXCLUDED.body,
       type = EXCLUDED.type,
       source_type = EXCLUDED.source_type,
       source_id = EXCLUDED.source_id,
       legacy_data = EXCLUDED.legacy_data,
       read_at = EXCLUDED.read_at,
       created_at = NOW()`,
    [
      id,
      organizationId,
      userId,
      title,
      JSON.stringify({ link: "/tasks" }),
      read ? new Date() : null,
    ]
  );
}

async function createCompanyUser(owner: Awaited<ReturnType<typeof loginApi>>, prefix: string) {
  const email = uniqueEmail(prefix.toLowerCase().replace(/\s+/g, "-"));
  const user = await readOk<any>(await owner.post("/api/users", {
    data: { name: prefix, email, password: USER_PASSWORD, role: "OPERATIONS" },
  }));
  return { id: user.id, email };
}

test.describe.serial("notifications API", () => {
  let client: DbClient;
  const insertedIds: string[] = [];
  const otherOrganizationId = `org-e2e-notifications-${Date.now()}`;
  const otherUserId = `u-e2e-notifications-${Date.now()}`;

  test.beforeAll(async () => {
    client = new Client({ connectionString: testDatabaseUrl });
    await client.connect();
  });

  test.afterAll(async () => {
    await client.query("DELETE FROM notifications WHERE id = ANY($1::text[])", [insertedIds]);
    await client.query("DELETE FROM chat_push_subscriptions WHERE endpoint LIKE 'https://push.example.test/e2e-%'");
    await client.query("DELETE FROM app_users WHERE id = $1", [otherUserId]);
    await client.query("DELETE FROM organizations WHERE id = $1", [otherOrganizationId]);
    await client.end();
  });

  test("lists canonical notifications with an allowlisted payload and filters legacy demo rows", async () => {
    const organizationId = await ownerOrganizationId(client);
    const notificationId = `notif-e2e-${crypto.randomUUID()}`;
    insertedIds.push(notificationId);

    await insertNotification(client, {
      id: "n1",
      organizationId,
      title: "Legacy demo notification should stay hidden",
    });
    await insertNotification(client, { id: notificationId, organizationId });

    const owner = await loginApi();
    try {
      const data = await readOk<any[]>(
        await owner.get("/api/notifications?includeRead=true&limit=50")
      );
      expect(data.some((notification) => notification.id === "n1")).toBe(false);
      const notification = data.find((item) => item.id === notificationId);
      expect(notification).toBeTruthy();
      expect(Object.keys(notification).sort()).toEqual(allowedNotificationKeys);
      expect(notification).toMatchObject({
        id: notificationId,
        title: "E2E live notification",
        message: "Canonical notification body",
        type: "INFO",
        isRead: false,
        link: "/tasks",
      });
      expect(JSON.stringify(notification)).not.toContain("organization_id");
      expect(JSON.stringify(notification)).not.toContain("user_id");
      expect(JSON.stringify(notification)).not.toContain("legacy_data");
    } finally {
      await disposeContexts(owner);
    }
  });

  test("persists notification read state", async () => {
    const organizationId = await ownerOrganizationId(client);
    const notificationId = `notif-e2e-${crypto.randomUUID()}`;
    insertedIds.push(notificationId);
    await insertNotification(client, { id: notificationId, organizationId });

    const owner = await loginApi();
    try {
      const data = await readOk<any>(
        await owner.patch(`/api/notifications/${notificationId}/read`)
      );
      expect(data.id).toBe(notificationId);
      expect(data.isRead).toBe(true);

      const persisted = await client.query("SELECT read_at FROM notifications WHERE id = $1", [notificationId]);
      expect(persisted.rows[0]?.read_at).toBeTruthy();
    } finally {
      await disposeContexts(owner);
    }
  });

  test("does not allow another tenant notification to be marked read", async () => {
    const notificationId = `notif-e2e-${crypto.randomUUID()}`;
    insertedIds.push(notificationId);
    await client.query(
      `INSERT INTO organizations (id, name, slug, status, updated_at)
       VALUES ($1, 'E2E Notifications Tenant', $2, 'active', NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'active', updated_at = NOW()`,
      [otherOrganizationId, otherOrganizationId]
    );
    await client.query(
      `INSERT INTO app_users (id, name, email, password_hash, role, status, organization_id, updated_at)
       VALUES ($1, 'Other Tenant User', $2, 'not-a-login-password', 'CEO', 'active', $3, NOW())
       ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, updated_at = NOW()`,
      [otherUserId, `${otherUserId}@example.test`, otherOrganizationId]
    );
    await insertNotification(client, {
      id: notificationId,
      organizationId: otherOrganizationId,
      userId: otherUserId,
      title: "Other tenant notification",
    });

    const owner = await loginApi();
    try {
      await expectUnavailable(await owner.patch(`/api/notifications/${notificationId}/read`));
      const persisted = await client.query("SELECT read_at FROM notifications WHERE id = $1", [notificationId]);
      expect(persisted.rows[0]?.read_at).toBeFalsy();
    } finally {
      await disposeContexts(owner);
    }
  });

  test("serves an installable push-only PWA shell", async ({ request }) => {
    const manifestResponse = await request.get("/manifest.webmanifest");
    expect(manifestResponse.ok()).toBe(true);
    const manifest = await manifestResponse.json();
    expect(manifest).toMatchObject({
      start_url: "/chat",
      scope: "/",
      display: "standalone",
      dir: "rtl",
      lang: "fa",
    });
    expect(manifest.shortcuts.map((shortcut: any) => shortcut.url)).toEqual(["/chat", "/shipments", "/tasks"]);
    expect(manifest.icons.some((icon: any) => String(icon.purpose).includes("maskable"))).toBe(true);
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "/icons/logisticplus-app-192.png", sizes: "192x192", type: "image/png" }),
      expect.objectContaining({ src: "/icons/logisticplus-app-512.png", sizes: "512x512", type: "image/png" }),
    ]));
    for (const iconPath of [
      "/icons/logisticplus-app-180.png",
      "/icons/logisticplus-app-192.png",
      "/icons/logisticplus-app-512.png",
    ]) {
      const iconResponse = await request.get(iconPath);
      expect(iconResponse.ok()).toBe(true);
      expect(iconResponse.headers()["content-type"]).toContain("image/png");
    }

    const workerResponse = await request.get("/sw.js");
    expect(workerResponse.ok()).toBe(true);
    const worker = await workerResponse.text();
    expect(worker).toContain('addEventListener("push"');
    expect(worker).toContain('addEventListener("notificationclick"');
    expect(worker).not.toContain('addEventListener("fetch"');
    expect(worker).not.toContain("caches.open");
  });

  test("upserts, reports, and disables only the authenticated user's push device", async () => {
    const owner = await loginApi();
    const organizationId = await ownerOrganizationId(client);
    const endpoint = `https://push.example.test/e2e-${crypto.randomUUID()}`;
    try {
      const initial = await readOk<any>(await owner.get("/api/notifications/push/status"));
      expect(initial.enabled).toBe(true);
      expect(initial.publicKey).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(JSON.stringify(initial)).not.toContain("PRIVATE");
      expect(JSON.stringify(initial)).not.toContain("p256dh");
      expect(JSON.stringify(initial)).not.toContain('"auth"');

      const saved = await readOk<any>(await owner.put("/api/notifications/push/subscription", {
        data: {
          endpoint,
          expirationTime: null,
          keys: {
            p256dh: "e2e-p256dh-material-that-is-long-enough",
            auth: "e2e-auth-material",
          },
        },
      }));
      expect(saved.active).toBe(true);

      const stored = await client.query(
        `SELECT organization_id, user_id, endpoint_hash, disabled_at
         FROM chat_push_subscriptions
         WHERE endpoint = $1`,
        [endpoint]
      );
      expect(stored.rows[0]).toMatchObject({
        organization_id: organizationId,
        user_id: "u1",
        disabled_at: null,
      });
      expect(stored.rows[0].endpoint_hash).toMatch(/^[a-f0-9]{64}$/);

      const active = await readOk<any>(await owner.get("/api/notifications/push/status"));
      expect(active.activeSubscriptionCount).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(active.devices)).not.toContain(endpoint);

      const disabled = await readOk<any>(await owner.delete("/api/notifications/push/subscription", {
        data: { endpoint },
      }));
      expect(disabled).toEqual({ active: false, disabled: true });
      const disabledRow = await client.query(
        "SELECT disabled_at, disabled_reason FROM chat_push_subscriptions WHERE endpoint = $1",
        [endpoint]
      );
      expect(disabledRow.rows[0].disabled_at).toBeTruthy();
      expect(disabledRow.rows[0].disabled_reason).toBe("user_disabled");
    } finally {
      await disposeContexts(owner);
    }
  });

  test("creates idempotent Shamsi due-soon and overdue task reminders", async () => {
    const owner = await loginApi();
    const recipient = await createCompanyUser(owner, "E2E task reminder recipient");
    const organizationId = await ownerOrganizationId(client);
    const dueSoonTaskId = `task-due-soon-${crypto.randomUUID()}`;
    const overdueTaskId = `task-overdue-${crypto.randomUUID()}`;
    const ignoredTaskId = `task-ignored-${crypto.randomUUID()}`;
    const dueSoon = format(new Date(Date.now() + 2 * 60 * 60 * 1000), "yyyy/MM/dd HH:mm");
    const overdue = format(new Date(Date.now() - 2 * 60 * 60 * 1000), "yyyy/MM/dd HH:mm");
    const taskIds = [dueSoonTaskId, overdueTaskId, ignoredTaskId];
    const reminderPool = new pg.Pool({ connectionString: testDatabaseUrl });
    try {
      for (const [id, dueAt, status] of [
        [dueSoonTaskId, dueSoon, "ASSIGNED"],
        [overdueTaskId, overdue, "IN_PROGRESS"],
        [ignoredTaskId, overdue, "DONE"],
      ]) {
        await client.query(
          `INSERT INTO tasks (
             id, organization_id, owner_user_id, title, status, priority,
             assigned_to_id, assigned_to_name, due_at, source_type, legacy_data, created_at, updated_at
           )
           VALUES ($1, $2, 'u1', $3, $4, 'MEDIUM', $5, 'Reminder recipient', $6, 'manual', '{}'::jsonb, NOW(), NOW())`,
          [id, organizationId, `Reminder ${id}`, status, recipient.id, dueAt]
        );
      }

      expect(await scanTaskRemindersOnce(reminderPool)).toBeGreaterThanOrEqual(2);
      expect(await scanTaskRemindersOnce(reminderPool)).toBe(0);
      const reminders = await client.query(
        `SELECT source_id, source_type, event_key
         FROM notifications
         WHERE user_id = $1
           AND source_id = ANY($2::text[])
         ORDER BY source_id`,
        [recipient.id, taskIds]
      );
      expect(reminders.rows).toHaveLength(2);
      expect(reminders.rows).toEqual(expect.arrayContaining([
        expect.objectContaining({ source_id: dueSoonTaskId, source_type: "TASK_DUE_SOON" }),
        expect.objectContaining({ source_id: overdueTaskId, source_type: "TASK_OVERDUE" }),
      ]));
      expect(reminders.rows.some((row) => row.source_id === ignoredTaskId)).toBe(false);
      expect(new Set(reminders.rows.map((row) => row.event_key)).size).toBe(2);
    } finally {
      await reminderPool.end();
      await client.query("DELETE FROM notifications WHERE source_id = ANY($1::text[])", [taskIds]);
      await client.query("DELETE FROM tasks WHERE id = ANY($1::text[])", [taskIds]);
      await client.query(
        "UPDATE app_users SET status = 'suspended', email = CONCAT('archived-', id, '-', email) WHERE id = $1",
        [recipient.id]
      );
      await disposeContexts(owner);
    }
  });

  test("creates one deduplicated Commercial Card reminder at each expiry milestone", async () => {
    const owner = await loginApi();
    const recipient = await createCompanyUser(owner, "E2E commercial card reminder recipient");
    const organizationId = await ownerOrganizationId(client);
    const suffix = crypto.randomUUID();
    const cards = [
      {
        id: `card-two-months-${suffix}`,
        holderName: "کارت یادآوری دو ماهه",
        expirationDate: format(addDays(new Date(), 45), "yyyy/MM/dd"),
        sourceType: "COMMERCIAL_CARD_EXPIRY_2_MONTHS",
      },
      {
        id: `card-one-month-${suffix}`,
        holderName: "کارت یادآوری یک ماهه",
        expirationDate: format(addDays(new Date(), 20), "yyyy/MM/dd"),
        sourceType: "COMMERCIAL_CARD_EXPIRY_1_MONTH",
      },
      {
        id: `card-one-week-${suffix}`,
        holderName: "کارت یادآوری یک هفته‌ای",
        expirationDate: format(addDays(new Date(), 3), "yyyy/MM/dd"),
        sourceType: "COMMERCIAL_CARD_EXPIRY_1_WEEK",
      },
    ];
    const cardIds = cards.map((card) => card.id);
    const reminderPool = new pg.Pool({ connectionString: testDatabaseUrl });
    try {
      for (const card of cards) {
        await client.query(
          `INSERT INTO user_records (
             owner_user_id, organization_id, collection, item_id, data, updated_at
           )
           VALUES ('u1', $1, 'commercialCards', $2, $3::jsonb, NOW())
           ON CONFLICT (owner_user_id, collection, item_id)
           DO UPDATE SET data = EXCLUDED.data, organization_id = EXCLUDED.organization_id, updated_at = NOW()`,
          [
            organizationId,
            card.id,
            JSON.stringify({
              id: card.id,
              holderName: card.holderName,
              cardNumber: `CC-${card.id}`,
              expirationDate: card.expirationDate,
              documents: [],
              isArchived: false,
            }),
          ]
        );
      }

      expect(await scanCommercialCardExpiryRemindersOnce(reminderPool)).toBeGreaterThanOrEqual(3);
      expect(await scanCommercialCardExpiryRemindersOnce(reminderPool)).toBe(0);

      const reminders = await client.query(
        `SELECT source_id, source_type, event_key
         FROM notifications
         WHERE user_id = $1
           AND source_id = ANY($2::text[])
         ORDER BY source_id`,
        [recipient.id, cardIds]
      );
      expect(reminders.rows).toHaveLength(3);
      for (const card of cards) {
        expect(reminders.rows).toContainEqual(expect.objectContaining({
          source_id: card.id,
          source_type: card.sourceType,
        }));
      }
      expect(new Set(reminders.rows.map((row) => row.event_key)).size).toBe(3);
    } finally {
      await reminderPool.end();
      await client.query("DELETE FROM notifications WHERE source_id = ANY($1::text[])", [cardIds]);
      await client.query(
        "DELETE FROM user_records WHERE collection = 'commercialCards' AND item_id = ANY($1::text[])",
        [cardIds]
      );
      await client.query(
        "UPDATE app_users SET status = 'suspended', email = CONCAT('archived-', id, '-', email) WHERE id = $1",
        [recipient.id]
      );
      await disposeContexts(owner);
    }
  });

  test("tracks push success, retries transient failures, and disables gone subscriptions", async () => {
    const organizationId = await ownerOrganizationId(client);
    const deliveryPool = new pg.Pool({ connectionString: testDatabaseUrl });
    const suffix = crypto.randomUUID();
    const cases = ["success", "retry", "gone"] as const;
    const notificationIds = cases.map((kind) => `push-notification-${kind}-${suffix}`);
    const subscriptionIds = cases.map((kind) => `push-subscription-${kind}-${suffix}`);
    const deliveryIds = cases.map((kind) => `push-delivery-${kind}-${suffix}`);
    const providerPayloads: Array<{ body?: string }> = [];
    try {
      for (let index = 0; index < cases.length; index += 1) {
        const kind = cases[index];
        await client.query(
          `INSERT INTO chat_push_subscriptions (
             id, organization_id, user_id, endpoint, endpoint_hash, p256dh, auth, created_at, updated_at
           )
           VALUES ($1, $2, 'u1', $3, $4, 'mock-p256dh', 'mock-auth', NOW(), NOW())`,
          [
            subscriptionIds[index],
            organizationId,
            `https://push.example.test/${kind}-${suffix}`,
            crypto.createHash("sha256").update(`https://push.example.test/${kind}-${suffix}`).digest("hex"),
          ]
        );
        await client.query(
          `INSERT INTO notifications (
             id, organization_id, user_id, title, body, type, source_type, source_id,
             legacy_data, event_key, created_at
           )
             VALUES ($1, $2, 'u1', 'Push delivery test', 'PRIVATE CUSTOMER TASK TITLE', 'INFO', 'TASK', $3,
                   '{"link":"/tasks"}'::jsonb, $4, NOW())`,
          [notificationIds[index], organizationId, kind, `push-delivery-test:${kind}:${suffix}`]
        );
        await client.query(
          `INSERT INTO notification_push_deliveries (
             id, organization_id, notification_id, subscription_id, status, next_attempt_at, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, 'pending', NOW(), NOW(), NOW())`,
          [deliveryIds[index], organizationId, notificationIds[index], subscriptionIds[index]]
        );
      }

      const result = await processPushOutbox(deliveryPool, {
        env: {
          CHAT_PUSH_ENABLED: "true",
          WEB_PUSH_VAPID_PUBLIC_KEY: "BLBjqYXfSM1AS2VTNODmuOdb4RsbmcNmh-ABRGOOJ3zxMxZiG4EPf69w8Afj4yxgN1z6-nGB230rAqDpOhr6zq8",
          WEB_PUSH_VAPID_PRIVATE_KEY: "aL6uvDKd4gFp1Xu0Fr3shIQT-rDCaU8NNTtsIQSihI0",
          WEB_PUSH_VAPID_SUBJECT: "mailto:test@logisticplus.local",
        },
        sendNotification: async (subscription: { endpoint: string }, payload: string) => {
          providerPayloads.push(JSON.parse(payload));
          if (subscription.endpoint.includes("/gone-")) {
            throw Object.assign(new Error("Subscription no longer exists."), { statusCode: 410 });
          }
          if (subscription.endpoint.includes("/retry-")) {
            throw Object.assign(new Error("Provider temporarily unavailable."), { statusCode: 503 });
          }
          return { statusCode: 201 };
        },
      });
      expect(result).toEqual({ claimed: 3, sent: 1, failed: 2 });
      expect(providerPayloads).toHaveLength(3);
      expect(JSON.stringify(providerPayloads)).not.toContain("PRIVATE CUSTOMER TASK TITLE");

      type PushDeliveryRow = {
        id: string;
        status: string;
        attempt_count: number;
        next_attempt_at: string | Date | null;
        sent_at: string | Date | null;
      };
      const deliveries = await client.query<PushDeliveryRow>(
        `SELECT id, status, attempt_count, next_attempt_at, sent_at
         FROM notification_push_deliveries
         WHERE id = ANY($1::text[])`,
        [deliveryIds]
      );
      const byId = new Map<string, PushDeliveryRow>(deliveries.rows.map((row) => [row.id, row]));
      expect(byId.get(deliveryIds[0])).toMatchObject({ status: "sent", attempt_count: 1 });
      expect(byId.get(deliveryIds[0])?.sent_at).toBeTruthy();
      expect(byId.get(deliveryIds[1])).toMatchObject({ status: "pending", attempt_count: 1 });
      expect(new Date(byId.get(deliveryIds[1])?.next_attempt_at).getTime()).toBeGreaterThan(Date.now());
      expect(byId.get(deliveryIds[2])).toMatchObject({ status: "failed", attempt_count: 1 });

      type PushSubscriptionRow = {
        id: string;
        disabled_at: string | Date | null;
        disabled_reason: string | null;
        failure_count: number;
        last_success_at: string | Date | null;
      };
      const subscriptions = await client.query<PushSubscriptionRow>(
        `SELECT id, disabled_at, disabled_reason, failure_count, last_success_at
         FROM chat_push_subscriptions
         WHERE id = ANY($1::text[])`,
        [subscriptionIds]
      );
      const subscriptionsById = new Map<string, PushSubscriptionRow>(
        subscriptions.rows.map((row) => [row.id, row])
      );
      expect(subscriptionsById.get(subscriptionIds[0])?.last_success_at).toBeTruthy();
      expect(subscriptionsById.get(subscriptionIds[1])).toMatchObject({ disabled_at: null, failure_count: 1 });
      expect(subscriptionsById.get(subscriptionIds[2])?.disabled_at).toBeTruthy();
      expect(subscriptionsById.get(subscriptionIds[2])?.disabled_reason).toBe("provider_gone");
    } finally {
      await deliveryPool.end();
      await client.query("DELETE FROM notifications WHERE id = ANY($1::text[])", [notificationIds]);
      await client.query("DELETE FROM chat_push_subscriptions WHERE id = ANY($1::text[])", [subscriptionIds]);
    }
  });

  test("notifies eligible coworkers when legacy and V2 shipments are created", async () => {
    const owner = await loginApi();
    const eligible = await createCompanyUser(owner, "E2E shipment notification eligible");
    const optedOut = await createCompanyUser(owner, "E2E shipment notification opted out");
    const inactive = await createCompanyUser(owner, "E2E shipment notification inactive");
    const shipmentIds: string[] = [];
    let customerId = "";
    try {
      await client.query(
        `UPDATE app_users
         SET notification_preferences = CASE
           WHEN id = $1 THEN '{"shipmentUpdates":false}'::jsonb
           ELSE notification_preferences
         END,
         status = CASE WHEN id = $2 THEN 'suspended' ELSE status END
         WHERE id = ANY($3::text[])`,
        [optedOut.id, inactive.id, [optedOut.id, inactive.id]]
      );

      const customer = await readOk<any>(await owner.post("/api/customers", {
        data: {
          name: "E2E shipment notification customer",
          company: "E2E shipment notification company",
          email: uniqueEmail("e2e-shipment-notification-customer"),
          phone: "09120000000",
        },
      }));
      customerId = customer.id;

      const legacy = await readOk<any>(await owner.post("/api/shipments", {
        data: {
          trackingNumber: await nextValidShipmentCode(),
          customerId,
          origin: "Dubai",
          destination: "Tehran",
        },
      }));
      shipmentIds.push(legacy.id);

      const v2 = await readOk<any>(await owner.post("/api/shipments/v2", {
        data: {
          flowCode: "IMPORT_SHIP",
          customerId,
          origin: "Dubai",
          dischargePort: "Bandar Abbas",
          deliveryPort: "Tehran",
        },
      }));
      shipmentIds.push(v2.shipment.id);

      const rows = await client.query(
        `SELECT user_id, source_id, title, body, legacy_data
         FROM notifications
         WHERE source_type = 'SHIPMENT' AND source_id = ANY($1::text[])`,
        [shipmentIds]
      );
      const eligibleRows = rows.rows.filter((row) => row.user_id === eligible.id);
      expect(eligibleRows).toHaveLength(2);
      expect(eligibleRows.map((row) => row.source_id).sort()).toEqual([...shipmentIds].sort());
      expect(rows.rows.every((row) => row.title === "محموله جدید ثبت شد")).toBe(true);
      expect(rows.rows.every((row) => row.body.includes("محموله") && !row.body.includes("customer"))).toBe(true);
      expect(rows.rows.every((row) => row.legacy_data.link === `/shipments/${row.source_id}`)).toBe(true);

      const eligibleApi = await loginApi(eligible.email, USER_PASSWORD);
      try {
        const notifications = await readOk<any[]>(await eligibleApi.get("/api/notifications?includeRead=true&limit=50"));
        for (const shipmentId of shipmentIds) {
          expect(notifications).toContainEqual(expect.objectContaining({
            title: "محموله جدید ثبت شد",
            link: `/shipments/${shipmentId}`,
            isRead: false,
          }));
        }
      } finally {
        await disposeContexts(eligibleApi);
      }

      expect(rows.rows.some((row) => row.user_id === "u1")).toBe(false);
      expect(rows.rows.some((row) => row.user_id === optedOut.id)).toBe(false);
      expect(rows.rows.some((row) => row.user_id === inactive.id)).toBe(false);
      expect(rows.rows.some((row) => row.user_id === otherUserId)).toBe(false);
    } finally {
      if (shipmentIds.length) {
        await client.query("DELETE FROM notifications WHERE source_id = ANY($1::text[])", [shipmentIds]);
        await client.query("DELETE FROM shipments WHERE id = ANY($1::text[])", [shipmentIds]);
      }
      if (customerId) await client.query("DELETE FROM customers WHERE id = $1", [customerId]);
      await client.query(
        `UPDATE app_users
         SET status = 'suspended', email = CONCAT('archived-', id, '-', email)
         WHERE id = ANY($1::text[])`,
        [[eligible.id, optedOut.id, inactive.id]]
      );
      await disposeContexts(owner);
    }
  });
});
