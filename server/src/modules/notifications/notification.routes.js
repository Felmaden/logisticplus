import {
  notificationListQuerySchema,
  notificationParamsSchema,
  pushSubscriptionBodySchema,
  pushSubscriptionDeleteBodySchema,
} from "./notification.validation.js";
import { parseRequestValue } from "../../shared/middleware/validate.middleware.js";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  createCanonicalNotification,
  toUiNotification,
} from "./notification.repository.js";
import {
  disablePushSubscription,
  getPushStatus,
  upsertPushSubscription,
} from "./push.repository.js";
import { getPublicPushConfiguration } from "./push.service.js";

export function registerNotificationRoutes(
  app,
  {
    createApiError,
    pool,
    requireAuthenticatedUser,
    requireTenantContext,
  }
) {
  app.get("/api/notifications", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const tenantContext = requireTenantContext(req, res, "list notifications");
      if (!tenantContext) return;
      const query = parseRequestValue(res, notificationListQuerySchema, req.query || {});
      if (!query) return;
      const data = await listNotifications(pool, {
        userId: user.id,
        organizationId: tenantContext.organizationId,
        includeRead: query.includeRead,
        limit: query.limit,
      });
      res.json({ ok: true, data });
    } catch (error) {
      console.error("List notifications failed:", error);
      createApiError(res, 500, "NOTIFICATIONS_LIST_FAILED", "Could not load notifications.");
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const tenantContext = requireTenantContext(req, res, "mark notification read");
      if (!tenantContext) return;
      const params = parseRequestValue(res, notificationParamsSchema, req.params);
      if (!params) return;
      const data = await markNotificationRead(pool, params.id, {
        userId: user.id,
        organizationId: tenantContext.organizationId,
      });
      if (!data) return createApiError(res, 404, "NOTIFICATION_NOT_FOUND", "Notification was not found.");
      res.json({ ok: true, data });
    } catch (error) {
      console.error("Mark notification read failed:", error);
      createApiError(res, 500, "NOTIFICATION_READ_FAILED", "Could not update notification.");
    }
  });

  app.patch("/api/notifications/read-all", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const tenantContext = requireTenantContext(req, res, "mark all notifications read");
      if (!tenantContext) return;
      const data = await markAllNotificationsRead(pool, {
        userId: user.id,
        organizationId: tenantContext.organizationId,
      });
      res.json({ ok: true, data });
    } catch (error) {
      console.error("Mark notifications read failed:", error);
      createApiError(res, 500, "NOTIFICATIONS_READ_FAILED", "Could not update notifications.");
    }
  });

  app.get("/api/notifications/push/status", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const tenantContext = requireTenantContext(req, res, "get push notification status");
      if (!tenantContext) return;
      const config = getPublicPushConfiguration();
      const subscriptions = await getPushStatus(pool, {
        organizationId: tenantContext.organizationId,
        userId: user.id,
      });
      res.json({
        ok: true,
        data: {
          enabled: config.enabled,
          publicKey: config.enabled ? config.publicKey : null,
          activeSubscriptionCount: subscriptions.length,
          devices: subscriptions.map((subscription) => ({
            expirationTime: subscription.expiration_time,
            createdAt: subscription.created_at,
            updatedAt: subscription.updated_at,
            lastSuccessAt: subscription.last_success_at,
          })),
        },
      });
    } catch (error) {
      console.error("Get push notification status failed:", error);
      createApiError(res, 500, "PUSH_STATUS_FAILED", "Could not load push notification status.");
    }
  });

  app.put("/api/notifications/push/subscription", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const tenantContext = requireTenantContext(req, res, "save push notification subscription");
      if (!tenantContext) return;
      const body = parseRequestValue(res, pushSubscriptionBodySchema, req.body || {});
      if (!body) return;
      const config = getPublicPushConfiguration();
      if (!config.enabled) {
        return createApiError(res, 503, "PUSH_DISABLED", "Push notifications are not enabled.");
      }
      const data = await upsertPushSubscription(pool, {
        organizationId: tenantContext.organizationId,
        userId: user.id,
        subscription: body,
        userAgent: req.get("user-agent"),
      });
      res.json({ ok: true, data: { active: true, updatedAt: data.updated_at } });
    } catch (error) {
      console.error("Save push notification subscription failed:", error);
      createApiError(res, 500, "PUSH_SUBSCRIPTION_SAVE_FAILED", "Could not enable push notifications.");
    }
  });

  app.delete("/api/notifications/push/subscription", async (req, res) => {
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const tenantContext = requireTenantContext(req, res, "disable push notification subscription");
      if (!tenantContext) return;
      const body = parseRequestValue(res, pushSubscriptionDeleteBodySchema, req.body || {});
      if (!body) return;
      const disabled = await disablePushSubscription(pool, {
        organizationId: tenantContext.organizationId,
        userId: user.id,
        endpoint: body.endpoint,
      });
      res.json({ ok: true, data: { active: false, disabled } });
    } catch (error) {
      console.error("Disable push notification subscription failed:", error);
      createApiError(res, 500, "PUSH_SUBSCRIPTION_DELETE_FAILED", "Could not disable push notifications.");
    }
  });

  app.post("/api/notifications/push/test", async (req, res) => {
    const client = await pool.connect();
    try {
      const user = await requireAuthenticatedUser(req, res);
      if (!user) return;
      const tenantContext = requireTenantContext(req, res, "send test push notification");
      if (!tenantContext) return;
      const config = getPublicPushConfiguration();
      if (!config.enabled) {
        return createApiError(res, 503, "PUSH_DISABLED", "Push notifications are not enabled.");
      }
      await client.query("BEGIN");
      const notification = await createCanonicalNotification(client, {
        organizationId: tenantContext.organizationId,
        userId: user.id,
        title: "اعلان آزمایشی LogisticPlus",
        body: "اعلان‌های این دستگاه به‌درستی فعال هستند.",
        sourceType: "PUSH_TEST",
        sourceId: user.id,
        link: "/profile?tab=notifications",
        eventKey: `push-test:${user.id}:${Date.now()}`,
      });
      await client.query("COMMIT");
      res.status(201).json({ ok: true, data: toUiNotification(notification) });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Send test push notification failed:", error);
      createApiError(res, 500, "PUSH_TEST_FAILED", "Could not queue the test notification.");
    } finally {
      client.release();
    }
  });
}
