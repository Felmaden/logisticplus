const APP_ICON = "/icons/logisticplus-app.svg";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let payload = {};
    try {
      payload = event.data?.json() || {};
    } catch {
      payload = {};
    }

    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    const focusedWindow = windows.find((client) => client.focused && client.visibilityState === "visible");
    for (const client of windows) {
      client.postMessage({ type: "notification.created", payload });
    }

    if (self.navigator?.setAppBadge && Number(payload.unreadCount) > 0) {
      await self.navigator.setAppBadge(Number(payload.unreadCount)).catch(() => {});
    }
    if (focusedWindow) return;

    await self.registration.showNotification(payload.title || "LogisticPlus", {
      body: payload.body || "یک اعلان جدید دارید.",
      icon: APP_ICON,
      badge: APP_ICON,
      tag: payload.tag || `logisticplus:${payload.notificationId || Date.now()}`,
      renotify: false,
      dir: "rtl",
      lang: "fa",
      data: {
        link: payload.link || "/dashboard",
        notificationId: payload.notificationId || null,
      },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const link = String(event.notification.data?.link || "/dashboard");
    const notificationId = event.notification.data?.notificationId;
    const target = new URL(link, self.location.origin);
    if (notificationId) target.searchParams.set("notificationId", notificationId);

    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      if ("navigate" in existing) await existing.navigate(target.href);
      return;
    }
    await self.clients.openWindow(target.href);
  })());
});
