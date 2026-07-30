import { useCallback, useEffect, useState } from "react";
import { BellRing, Download, RefreshCw, Send, Smartphone, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  canPromptInstall,
  disablePushNotifications,
  enablePushNotifications,
  getPushDeviceState,
  promptInstall,
  sendTestPushNotification,
  type PushDeviceState,
} from "@/src/lib/push-notifications";
import { cn } from "@/lib/utils";

type Props = {
  compact?: boolean;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
};

export function PushNotificationControls({ compact = false, dismissible = false, onDismiss, className }: Props) {
  const [state, setState] = useState<PushDeviceState | null>(null);
  const [busy, setBusy] = useState(false);
  const [installAvailable, setInstallAvailable] = useState(canPromptInstall());

  const refresh = useCallback(async () => {
    try {
      setState(await getPushDeviceState());
    } catch {
      setState((previous) => previous ? { ...previous, server: null } : null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const handleInstall = () => setInstallAvailable(true);
    window.addEventListener("logisticplus:install-available", handleInstall);
    return () => window.removeEventListener("logisticplus:install-available", handleInstall);
  }, [refresh]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "انجام این عملیات ممکن نشد.");
    } finally {
      setBusy(false);
    }
  };

  const blocked = state?.permission === "denied";
  const needsIosInstall = Boolean(state?.isIos && !state.installed);
  const active = Boolean(state?.subscribed && state.permission === "granted");

  return (
    <section className={cn("relative rounded-xl border border-border bg-card p-4", className)} aria-label="اعلان‌های این دستگاه">
      {dismissible && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute left-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="بستن راهنمای اعلان"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BellRing className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-black">اعلان‌های LogisticPlus</h3>
            <span className={cn(
              "rounded-md px-2 py-0.5 text-[10px] font-bold",
              active ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"
            )}>
              {active ? "فعال روی این دستگاه" : "غیرفعال"}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            پیام‌های چت، تغییرات محموله و مهلت وظایف را دریافت کنید. متن پیام و اطلاعات خصوصی روی صفحه قفل نمایش داده نمی‌شود.
          </p>

          {needsIosInstall && (
            <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-xs leading-5">
              در iPhone یا iPad از منوی Share گزینه «Add to Home Screen» را بزنید، برنامه را از صفحه اصلی باز کنید و سپس اعلان را فعال کنید.
            </p>
          )}
          {blocked && (
            <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              اعلان‌ها در مرورگر مسدود شده‌اند. از تنظیمات Site Settings مرورگر، Notifications را روی Allow بگذارید.
            </p>
          )}
          {state && !state.supported && !needsIosInstall && (
            <p className="mt-2 text-xs text-muted-foreground">این مرورگر یا اتصال فعلی از اعلان امن وب پشتیبانی نمی‌کند.</p>
          )}

          <div className={cn("mt-3 flex flex-wrap gap-2", compact && "mt-2")}>
            {!state?.installed && (installAvailable || !state?.isIos) && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || !installAvailable}
                onClick={() => void run(promptInstall, "برنامه نصب شد.")}
              >
                <Download className="h-4 w-4" />
                نصب برنامه
              </Button>
            )}
            {!active ? (
              <Button
                type="button"
                size="sm"
                disabled={busy || blocked || needsIosInstall || !state?.supported || !state.server?.enabled}
                onClick={() => void run(
                  () => enablePushNotifications(state?.server?.publicKey || ""),
                  "اعلان‌های این دستگاه فعال شد."
                )}
              >
                <Smartphone className="h-4 w-4" />
                فعال‌سازی اعلان
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run(sendTestPushNotification, "اعلان آزمایشی ارسال شد.")}
                >
                  <Send className="h-4 w-4" />
                  ارسال تست
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void run(disablePushNotifications, "اعلان این دستگاه غیرفعال شد.")}
                >
                  غیرفعال‌سازی
                </Button>
              </>
            )}
            <Button type="button" size="icon" variant="ghost" disabled={busy} onClick={() => void refresh()} aria-label="به‌روزرسانی وضعیت">
              <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
