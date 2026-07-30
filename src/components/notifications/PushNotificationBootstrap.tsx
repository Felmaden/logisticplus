import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import {
  captureInstallPrompt,
  registerPushServiceWorker,
  syncCurrentPushSubscription,
} from "@/src/lib/push-notifications";
import { useAppStore } from "@/src/store/useAppStore";
import type { Notification as AppNotification } from "@/src/types";

type WorkerNotificationPayload = {
  notificationId?: string;
  title?: string;
  body?: string;
  link?: string;
  type?: string;
};

function toAppNotification(payload: WorkerNotificationPayload): AppNotification | null {
  if (!payload.notificationId) return null;
  const allowedTypes = new Set(["INFO", "WARNING", "SUCCESS", "URGENT"]);
  return {
    id: payload.notificationId,
    title: payload.title || "اعلان جدید",
    message: payload.body || "",
    type: allowedTypes.has(String(payload.type).toUpperCase())
      ? String(payload.type).toUpperCase() as AppNotification["type"]
      : "INFO",
    isRead: false,
    createdAt: new Date().toISOString(),
    link: payload.link || "/dashboard",
  };
}

export function PushNotificationBootstrap() {
  const currentUser = useAppStore((state) => state.currentUser);
  const receiveNotification = useAppStore((state) => state.receiveNotification);
  const markNotificationRead = useAppStore((state) => state.markNotificationRead);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    void registerPushServiceWorker().catch(() => {});
    return () => window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    void syncCurrentPushSubscription().catch(() => {});
  }, [currentUser?.id]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handleMessage = (event: MessageEvent<{ type?: string; payload?: WorkerNotificationPayload }>) => {
      if (event.data?.type !== "notification.created") return;
      const notification = toAppNotification(event.data.payload || {});
      if (!notification) return;
      receiveNotification(notification);
      toast(notification.title, { description: notification.message });
    };
    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, [receiveNotification]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const notificationId = params.get("notificationId");
    if (!notificationId) return;
    if (!currentUser) {
      window.sessionStorage.setItem(
        "logisticplus.notification.returnTo",
        `${location.pathname}${location.search}${location.hash}`
      );
      return;
    }
    void markNotificationRead(notificationId).catch(() => {});
    params.delete("notificationId");
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash}`, { replace: true });
  }, [currentUser?.id, location.hash, location.pathname, location.search, markNotificationRead, navigate]);

  return null;
}
