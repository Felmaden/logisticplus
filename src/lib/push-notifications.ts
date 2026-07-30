import { apiDelete, apiGet, apiPost, apiRequest } from "./api";

export type PushServerStatus = {
  enabled: boolean;
  publicKey: string | null;
  activeSubscriptionCount: number;
  devices: Array<{
    expirationTime: string | null;
    createdAt: string;
    updatedAt: string;
    lastSuccessAt: string | null;
  }>;
};

export type PushDeviceState = {
  supported: boolean;
  installed: boolean;
  isIos: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  server: PushServerStatus | null;
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

let installPrompt: InstallPromptEvent | null = null;

export function captureInstallPrompt(event: Event) {
  event.preventDefault();
  installPrompt = event as InstallPromptEvent;
  window.dispatchEvent(new CustomEvent("logisticplus:install-available"));
}

export function canPromptInstall() {
  return Boolean(installPrompt);
}

export async function promptInstall() {
  if (!installPrompt) return false;
  const prompt = installPrompt;
  await prompt.prompt();
  const result = await prompt.userChoice;
  if (result.outcome === "accepted") installPrompt = null;
  return result.outcome === "accepted";
}

export function isIosDevice() {
  const userAgent = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function supportsPushNotifications() {
  return window.isSecureContext
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

export async function registerPushServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

function serializeSubscription(subscription: PushSubscription) {
  return subscription.toJSON() as {
    endpoint: string;
    expirationTime?: number | null;
    keys: { p256dh: string; auth: string };
  };
}

export async function getPushDeviceState(): Promise<PushDeviceState> {
  const supported = supportsPushNotifications();
  const server = await apiGet<PushServerStatus>("/api/notifications/push/status");
  let subscribed = false;
  if (supported) {
    const registration = await registerPushServiceWorker();
    subscribed = Boolean(await registration?.pushManager.getSubscription());
  }
  return {
    supported,
    installed: isStandaloneApp(),
    isIos: isIosDevice(),
    permission: supported ? Notification.permission : "unsupported",
    subscribed,
    server,
  };
}

export async function syncCurrentPushSubscription() {
  if (!supportsPushNotifications() || Notification.permission !== "granted") return null;
  const registration = await registerPushServiceWorker();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return null;
  await apiRequest("/api/notifications/push/subscription", {
    method: "PUT",
    body: serializeSubscription(subscription),
  });
  return subscription;
}

export async function enablePushNotifications(publicKey: string) {
  if (!supportsPushNotifications()) throw new Error("مرورگر این دستگاه از اعلان وب پشتیبانی نمی‌کند.");
  if (isIosDevice() && !isStandaloneApp()) {
    throw new Error("در iPhone و iPad ابتدا LogisticPlus را به صفحه اصلی اضافه کنید.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(permission === "denied"
      ? "اجازه اعلان مسدود است. آن را از تنظیمات مرورگر فعال کنید."
      : "اجازه اعلان داده نشد.");
  }
  const registration = await registerPushServiceWorker();
  if (!registration) throw new Error("راه‌اندازی اعلان در این دستگاه ممکن نیست.");
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  await apiRequest("/api/notifications/push/subscription", {
    method: "PUT",
    body: serializeSubscription(subscription),
  });
  return subscription;
}

export async function disablePushNotifications() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await apiDelete("/api/notifications/push/subscription", {
    body: { endpoint: subscription.endpoint },
  });
  await subscription.unsubscribe();
}

export async function sendTestPushNotification() {
  return apiPost("/api/notifications/push/test");
}
