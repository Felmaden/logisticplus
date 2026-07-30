import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Headphones,
  LayoutDashboard,
  LockKeyhole,
  MessageCircle,
  MessageSquare,
  Mic,
  PackageCheck,
  Paperclip,
  Route,
  Search,
  Send,
  ShieldCheck,
  Ship,
  Sparkles,
  Truck,
  UserRoundCheck,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type DemoFormState = {
  companyName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  preferredContactMethod: "phone" | "email" | "either";
  message: string;
  website: string;
};

const emptyDemoForm: DemoFormState = {
  companyName: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  preferredContactMethod: "phone",
  message: "",
  website: "",
};

const navigation = [
  { label: "راهکارها", href: "#solutions" },
  { label: "امکانات", href: "#features" },
  { label: "گفت‌وگوی داخلی", href: "#internal-chat" },
  { label: "نحوه کار", href: "#workflow" },
  { label: "سوالات", href: "#faq" },
];

const productFootprint = [
  {
    icon: Building2,
    value: "۶",
    label: "شرکت فعال",
    detail: "در حال استفاده از لجستیک پلاس",
    testId: "metric-active-companies",
  },
  {
    icon: Users,
    value: "۶۸",
    label: "کاربر ثبت‌شده",
    detail: "همکاران تیم‌های عملیاتی",
    testId: "metric-users",
  },
  {
    icon: FileCheck2,
    value: "۱٬۲۱۴",
    label: "سند مدیریت‌شده",
    detail: "متصل به پرونده‌های عملیاتی",
    testId: "metric-documents",
  },
];

const operationalPains = [
  {
    icon: FileText,
    title: "اطلاعات پراکنده",
    text: "جزئیات بار میان فایل‌ها، پیام‌ها و پوشه‌های شخصی پخش می‌شود و پیدا کردن آخرین نسخه زمان می‌برد.",
  },
  {
    icon: Users,
    title: "مسئولیت نامشخص",
    text: "وقتی مرحله بعد و مسئول پیگیری روشن نیست، کارها بین اعضای تیم می‌ماند یا دوباره انجام می‌شود.",
  },
  {
    icon: Headphones,
    title: "پیگیری تکراری مشتری",
    text: "نبود یک نمای امن و به‌روز، تیم را درگیر تماس‌های مداوم درباره وضعیت بار و مدارک می‌کند.",
  },
];

const features = [
  {
    icon: Ship,
    title: "پرونده یکپارچه محموله",
    text: "مسیر، وضعیت، مشتری، مرحله فعلی و تاریخچه هر بار را در یک پرونده مشخص نگه دارید.",
  },
  {
    icon: FileCheck2,
    title: "مدیریت اسناد کنار بار",
    text: "بارنامه، فاکتور و مدارک عملیاتی به محموله درست متصل می‌شوند؛ با تفکیک فایل داخلی و قابل‌نمایش به مشتری.",
  },
  {
    icon: ClipboardCheck,
    title: "وظایف با مسئول و مهلت",
    text: "هر پیگیری به فرد مشخص سپرده می‌شود تا کارهای باز، فوری و عقب‌افتاده از دید تیم پنهان نماند.",
  },
  {
    icon: BarChart3,
    title: "وضعیت روزانه عملیات",
    text: "مدیر و تیم عملیات محموله‌های فعال، گلوگاه‌ها و اقدام بعدی هر پرونده را در یک نمای فشرده می‌بینند.",
  },
  {
    icon: LockKeyhole,
    title: "رهگیری امن برای مشتری",
    text: "مشتری از لینک اختصاصی فقط اطلاعات و اسناد تاییدشده همان محموله را می‌بیند؛ نه داده‌های داخلی شرکت.",
  },
  {
    icon: Search,
    title: "جست‌وجوی سریع عملیات",
    text: "محموله، مشتری و سند را سریع پیدا کنید و زمان تیم را از جست‌وجو در فایل‌ها و پیام‌ها پس بگیرید.",
  },
];

const workflowSteps = [
  {
    number: "۱",
    title: "پرونده را بسازید",
    text: "مشتری، مسیر، نوع بار و اطلاعات اصلی محموله را ثبت کنید.",
  },
  {
    number: "۲",
    title: "اسناد و کارها را وصل کنید",
    text: "مدارک، پیگیری‌ها، مسئول هر اقدام و مهلت انجام را کنار همان پرونده قرار دهید.",
  },
  {
    number: "۳",
    title: "عملیات را به‌روز نگه دارید",
    text: "مرحله فعلی، گلوگاه و اقدام بعدی را در وضعیت روزانه تیم ثبت و مرور کنید.",
  },
  {
    number: "۴",
    title: "مشتری را مطلع کنید",
    text: "لینک امن رهگیری را بفرستید تا مشتری بدون ورود به پنل داخلی وضعیت مجاز را ببیند.",
  },
];

const faqs = [
  {
    question: "برای شروع باید همه اطلاعات قبلی را وارد کنیم؟",
    answer:
      "خیر. می‌توانید با چند مشتری و محموله فعال شروع کنید، جریان واقعی تیم را بسنجید و سپس در صورت نیاز آرشیو قبلی را مرحله‌به‌مرحله اضافه کنید.",
  },
  {
    question: "آیا مشتری وارد پنل داخلی شرکت می‌شود؟",
    answer:
      "خیر. هر مشتری فقط از لینک امن همان محموله، اطلاعات و فایل‌هایی را می‌بیند که برای او مجاز شده‌اند. یادداشت‌ها، وظایف و اسناد خصوصی داخل شرکت می‌مانند.",
  },
  {
    question: "LogisticPlus برای چه نوع تیم‌هایی مناسب است؟",
    answer:
      "برای شرکت‌های حمل، فورواردری، ترخیص و خدمات لجستیکی و همچنین تیم‌های واردات و صادراتی که چند محموله، سند و پیگیری هم‌زمان دارند.",
  },
  {
    question: "آیا روی موبایل و تبلت هم قابل استفاده است؟",
    answer:
      "بله. رابط محصول و صفحه رهگیری مشتری برای نمایشگرهای مختلف طراحی شده‌اند تا تیم در دفتر یا حین عملیات به اطلاعات ضروری دسترسی داشته باشد.",
  },
  {
    question: "دموی محصول چگونه انجام می‌شود؟",
    answer:
      "پس از ثبت درخواست، نیاز و جریان کاری تیم شما مرور می‌شود و دمو روی سناریوهای نزدیک به عملیات واقعی شرکتتان ارائه خواهد شد.",
  },
];

function BrandMark({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link to="/" className="flex min-w-0 items-center gap-2.5 rounded-xl transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl shadow-sm", inverse ? "bg-white text-blue-700" : "bg-primary text-primary-foreground")}>
        <PackageCheck className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 leading-none">
        <span className={cn("block truncate text-sm font-black", inverse ? "text-white" : "text-foreground")}>لجستیک پلاس</span>
        <span className={cn("mt-1 block text-[9px] font-bold uppercase tracking-[0.18em]", inverse ? "text-blue-100" : "text-muted-foreground")}>Logistic Plus</span>
      </span>
    </Link>
  );
}

function SectionHeading({ eyebrow, title, text, align = "center" }: { eyebrow: string; title: string; text: string; align?: "center" | "right" }) {
  return (
    <div data-landing-reveal className={cn("landing-reveal max-w-3xl", align === "center" && "mx-auto text-center")}>
      <p className="text-xs font-black text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-black leading-[1.5] tracking-tight text-foreground sm:text-3xl lg:text-4xl">{title}</h2>
      <p className="mt-4 text-sm font-medium leading-8 text-slate-600 sm:text-base">{text}</p>
    </div>
  );
}

function ProductFootprint() {
  return (
    <section className="relative z-20 -mt-8 px-4 pb-5 lg:px-6" aria-label="آمار فعلی استفاده از لجستیک پلاس" data-testid="landing-metrics">
      <div className="mx-auto max-w-7xl rounded-[1.75rem] border border-white/90 bg-white/95 p-3 shadow-[0_22px_70px_rgba(37,99,235,0.13)] backdrop-blur-xl sm:p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {productFootprint.map((metric) => {
            const Icon = metric.icon;
            return (
              <article
                key={metric.label}
                data-landing-reveal
                data-testid={metric.testId}
                className="landing-reveal landing-metric-card flex min-w-0 items-center gap-4 rounded-2xl border border-blue-100 bg-[linear-gradient(135deg,#ffffff,#f7fbff)] p-4 sm:flex-col sm:items-start sm:gap-3 lg:flex-row lg:items-center lg:p-5"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-700 text-white shadow-lg shadow-blue-700/15">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 sm:flex-col sm:gap-0 lg:flex-row lg:gap-2">
                    <strong className="landing-metric-value text-2xl font-black tracking-tight text-slate-950 sm:text-3xl" aria-label={`${metric.value} ${metric.label}`}>{metric.value}</strong>
                    <span className="text-sm font-black text-slate-800">{metric.label}</span>
                  </div>
                  <p className="mt-1 truncate text-[11px] font-bold text-slate-500 sm:whitespace-normal">{metric.detail}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ProductPreview() {
  const rows = [
    { code: "LP-9804", customer: "پارس تجارت", status: "در مسیر", tone: "blue" },
    { code: "LP-9805", customer: "آرمان بازرگان", status: "اسناد", tone: "amber" },
    { code: "LP-9806", customer: "دریا جنوب", status: "ترخیص", tone: "emerald" },
  ];

  return (
    <div className="relative mx-auto w-full max-w-2xl" aria-label="نمای نمونه داشبورد لجستیک پلاس">
      <div className="absolute -inset-5 -z-10 rounded-[2rem] bg-blue-300/20 blur-3xl" aria-hidden="true" />
      <div data-landing-reveal className="landing-reveal landing-product-window landing-float overflow-hidden rounded-2xl border border-white/80 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.2)]">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/95 px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-white"><PackageCheck className="h-4 w-4" /></span>
            <div>
              <p className="text-[10px] font-black text-slate-900 sm:text-xs">مرکز عملیات</p>
              <p className="text-[8px] font-bold text-slate-500 sm:text-[9px]">نمای زنده محموله‌ها</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500 sm:text-[10px]">
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">جست‌وجوی محموله و سند</span>
          </div>
        </div>

        <div className="grid min-h-[320px] grid-cols-[1fr_58px] sm:grid-cols-[1fr_104px]">
          <div className="min-w-0 bg-[#f6f9fd] p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-black text-slate-950 sm:text-sm">وضعیت روزانه</p>
                <p className="mt-1 text-[8px] font-bold text-slate-500 sm:text-[9px]">تمرکز روی اقدام بعدی هر پرونده</p>
              </div>
              <span className="rounded-lg bg-blue-600 px-2 py-1.5 text-[8px] font-black text-white sm:text-[9px]">ثبت محموله</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {[
                ["محموله فعال", "۱۲"],
                ["کار باز", "۸"],
                ["سند امروز", "۵"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-white p-2 sm:p-2.5">
                  <p className="truncate text-[7px] font-bold text-slate-500 sm:text-[9px]">{label}</p>
                  <p className="mt-1 text-sm font-black text-slate-950 sm:text-lg">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 space-y-2">
              {rows.map((row) => (
                <div key={row.code} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 sm:grid-cols-[0.7fr_1fr_auto] sm:p-3">
                  <div>
                    <p className="font-mono text-[9px] font-black text-blue-700 sm:text-[11px]" dir="ltr">{row.code}</p>
                    <p className="mt-0.5 text-[7px] font-bold text-slate-500 sm:hidden">{row.customer}</p>
                  </div>
                  <p className="hidden truncate text-[9px] font-black text-slate-800 sm:block">{row.customer}</p>
                  <span className={cn(
                    "rounded-full px-2 py-1 text-[7px] font-black sm:text-[8px]",
                    row.tone === "blue" && "bg-blue-50 text-blue-700",
                    row.tone === "amber" && "bg-amber-50 text-amber-700",
                    row.tone === "emerald" && "bg-emerald-50 text-emerald-700",
                  )}>{row.status}</span>
                </div>
              ))}
            </div>

            <div className="landing-status-pulse mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-[8px] font-bold text-emerald-800 sm:text-[9px]">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              کارهای فوری امروز مشخص و به مسئول مربوطه سپرده شده‌اند.
            </div>
          </div>

          <aside className="border-r border-slate-200 bg-white p-2 sm:p-3" aria-label="منوی نمونه محصول">
            <div className="space-y-1.5">
              {[LayoutDashboard, Truck, FileText, ClipboardCheck, Users].map((Icon, index) => (
                <div key={index} className={cn("flex items-center gap-2 rounded-lg p-2 text-[8px] font-black sm:text-[9px]", index === 1 ? "bg-blue-50 text-blue-700" : "text-slate-500")}>
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">{["داشبورد", "محموله‌ها", "اسناد", "وظایف", "مشتریان"][index]}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function CustomerTrackingPreview() {
  return (
    <div className="mx-auto w-full max-w-sm rounded-[2rem] border-8 border-slate-900 bg-white p-1 shadow-2xl" aria-label="نمای نمونه رهگیری مشتری">
    <div data-landing-reveal className="landing-reveal landing-float landing-float-delayed overflow-hidden rounded-[1.45rem] bg-slate-50">
        <div className="bg-blue-700 px-5 py-5 text-white">
          <div className="flex items-center justify-between">
            <BrandMark inverse />
            <ShieldCheck className="h-5 w-5 text-blue-100" />
          </div>
          <p className="mt-6 text-[10px] font-bold text-blue-100">رهگیری محموله</p>
          <p className="mt-1 font-mono text-xl font-black" dir="ltr">LP-9804</p>
        </div>
        <div className="space-y-3 p-4">
          <div className="rounded-xl border border-blue-100 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[9px] font-bold text-slate-500">وضعیت فعلی</p>
                <p className="mt-1 text-sm font-black text-slate-950">در حال حمل به مقصد</p>
              </div>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-black text-blue-700">به‌روز</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="landing-progress h-full rounded-full bg-blue-600" /></div>
          </div>
          {["بارگیری انجام شد", "اسناد حمل تایید شد", "در مسیر مقصد"].map((item, index) => (
            <div key={item} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full", index < 2 ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700")}>
                {index < 2 ? <Check className="h-3.5 w-3.5" /> : <Route className="h-3.5 w-3.5" />}
              </span>
              <p className="text-[10px] font-black text-slate-800">{item}</p>
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-xl bg-blue-50 p-3 text-[9px] font-bold leading-5 text-blue-800">
            <LockKeyhole className="h-4 w-4 shrink-0" />
            فقط اطلاعات تاییدشده برای مشتری نمایش داده می‌شود.
          </div>
        </div>
      </div>
    </div>
  );
}

function InternalChatPreview() {
  const threads = [
    { icon: Ship, title: "محموله LP-9804", preview: "بارنامه نهایی در گفتگو ثبت شد", unread: "۳", active: true },
    { icon: Users, title: "تیم عملیات", preview: "پیگیری زمان تحویل انجام شد", unread: "", active: false },
    { icon: MessageCircle, title: "واحد اسناد", preview: "نسخه جدید فاکتور آماده است", unread: "۱", active: false },
  ];

  return (
    <div
      data-landing-reveal
      className="landing-reveal landing-chat-preview relative mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-white/15 bg-white shadow-[0_32px_100px_rgba(2,6,23,0.45)]"
      aria-label="نمای نمونه گفت‌وگوی داخلی لجستیک پلاس"
    >
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-700 text-white"><MessageSquare className="h-4 w-4" /></span>
          <div>
            <p className="text-xs font-black text-slate-950">مرکز گفت‌وگوی داخلی</p>
            <p className="mt-0.5 text-[9px] font-bold text-slate-500">پیام‌های مستقیم، گروه‌ها و محموله‌ها</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> متصل
        </span>
      </div>

      <div className="grid min-h-[420px] sm:grid-cols-[190px_minmax(0,1fr)]">
        <aside className="hidden border-l border-slate-200 bg-white p-3 sm:block" aria-label="فهرست نمونه گفتگوها">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[9px] font-bold text-slate-500">
            <Search className="h-3.5 w-3.5" /> جست‌وجوی گفتگو
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 text-center text-[8px] font-black text-slate-500">
            <span className="rounded-lg bg-white px-1 py-1.5 text-blue-700 shadow-sm">محموله</span>
            <span className="px-1 py-1.5">گروه</span>
            <span className="px-1 py-1.5">مستقیم</span>
          </div>
          <div className="mt-3 space-y-1.5">
            {threads.map((thread) => {
              const Icon = thread.icon;
              return (
                <div key={thread.title} className={cn("rounded-xl border p-2.5", thread.active ? "border-blue-200 bg-blue-50" : "border-transparent bg-white")}>
                  <div className="flex items-center gap-2">
                    <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", thread.active ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600")}><Icon className="h-3.5 w-3.5" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className="truncate text-[9px] font-black text-slate-900">{thread.title}</p>
                        {thread.unread ? <span className="grid h-4 min-w-4 place-items-center rounded-full bg-blue-600 px-1 text-[7px] font-black text-white">{thread.unread}</span> : null}
                      </div>
                      <p className="mt-1 truncate text-[8px] font-bold text-slate-500">{thread.preview}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <div className="flex min-w-0 flex-col bg-[#f5f8fc]">
          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-700"><Ship className="h-4 w-4" /></span>
              <div>
                <p className="text-[11px] font-black text-slate-950">گفت‌وگوی محموله LP-9804</p>
                <p className="mt-0.5 text-[8px] font-bold text-slate-500">۴ عضو · پارس تجارت</p>
              </div>
            </div>
            <span className="rounded-lg border border-blue-100 bg-blue-50 px-2 py-1 text-[8px] font-black text-blue-700">در مسیر مقصد</span>
          </div>

          <div className="flex-1 space-y-3 overflow-hidden p-3 sm:p-5">
            <div className="landing-chat-message flex max-w-[90%] items-start gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-100 text-[9px] font-black text-amber-800">ن ر</span>
              <div className="rounded-2xl rounded-tr-sm border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm">
                <div className="flex items-center justify-between gap-4"><p className="text-[9px] font-black text-slate-900">کارشناس اسناد</p><span className="text-[7px] font-bold text-slate-400">۱۰:۳۲</span></div>
                <p className="mt-1.5 text-[10px] font-bold leading-5 text-slate-700">مدارک ترخیص بررسی شد. نسخه نهایی بارنامه را همین‌جا قرار می‌دهم.</p>
              </div>
            </div>

            <div className="landing-chat-message mr-auto max-w-[86%] rounded-2xl rounded-tl-sm bg-blue-700 px-3.5 py-2.5 text-white shadow-lg shadow-blue-700/15">
              <div className="flex items-center justify-between gap-4"><p className="text-[9px] font-black">مسئول عملیات</p><span className="text-[7px] font-bold text-blue-200">۱۰:۳۴</span></div>
              <p className="mt-1.5 text-[10px] font-bold leading-5 text-blue-50">دریافت شد. بعد از تأیید، برای مشتری قابل نمایش می‌کنم.</p>
              <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 p-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/15"><FileText className="h-4 w-4" /></span>
                <div className="min-w-0"><p className="truncate text-[9px] font-black">بارنامه-LP-9804.pdf</p><p className="mt-0.5 text-[7px] font-bold text-blue-200">PDF · ۱.۸ مگابایت</p></div>
              </div>
            </div>

            <div className="landing-chat-message mx-auto flex w-fit items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-[8px] font-black text-blue-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> وظیفه «تأیید بارنامه» به مسئول عملیات سپرده شد
            </div>

            <div className="landing-chat-message flex max-w-[86%] items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-100 text-[9px] font-black text-emerald-800">م ک</span>
              <div className="landing-chat-typing flex items-center gap-1 rounded-2xl rounded-tr-sm border border-slate-200 bg-white px-4 py-3 shadow-sm" aria-label="یکی از اعضا در حال نوشتن است">
                <span /><span /><span />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5 text-slate-500">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white"><Paperclip className="h-3.5 w-3.5" /></span>
              <span className="min-w-0 flex-1 truncate px-1 text-[9px] font-bold text-slate-400">پیام داخلی خود را بنویسید...</span>
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white"><Mic className="h-3.5 w-3.5" /></span>
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-700 text-white"><Send className="h-3.5 w-3.5" /></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoRequestForm({ whatsappUrl }: { whatsappUrl: string | null }) {
  const [form, setForm] = React.useState<DemoFormState>(emptyDemoForm);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState("");

  const updateForm = (patch: Partial<DemoFormState>) => {
    setSubmitted(false);
    setError("");
    setForm((current) => ({ ...current, ...patch }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.companyName.trim() || !form.contactName.trim()) {
      setError("نام شرکت و نام فرد هماهنگ‌کننده را وارد کنید.");
      return;
    }
    if (!form.contactPhone.trim() && !form.contactEmail.trim()) {
      setError("حداقل شماره تماس یا ایمیل را وارد کنید.");
      return;
    }
    if (form.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) {
      setError("فرمت ایمیل واردشده درست نیست.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/contact-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok === false) {
        const friendlyMessage = response.status === 429
          ? "تعداد درخواست‌ها زیاد است. لطفا کمی بعد دوباره تلاش کنید."
          : response.status === 400
            ? "اطلاعات فرم را بررسی و دوباره ارسال کنید."
            : "ثبت درخواست انجام نشد. لطفا دوباره تلاش کنید.";
        throw new Error(friendlyMessage);
      }
      setSubmitted(true);
      setForm(emptyDemoForm);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "ثبت درخواست انجام نشد. لطفا دوباره تلاش کنید.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div data-landing-reveal className="landing-reveal landing-demo-card rounded-2xl border border-white/20 bg-white p-5 text-right text-slate-950 shadow-2xl sm:p-7 lg:p-8">
      <div className="mb-6">
        <p className="text-xs font-black text-blue-700">درخواست دموی محصول</p>
        <h3 className="mt-2 text-xl font-black leading-8 sm:text-2xl">جریان کاری تیم شما را بهتر بشناسیم</h3>
        <p className="mt-2 text-xs font-medium leading-6 text-slate-600 sm:text-sm">اطلاعات زیر فقط برای هماهنگی دمو و گفت‌وگو درباره LogisticPlus استفاده می‌شود.</p>
      </div>

      {submitted ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5" role="status" data-testid="demo-request-success">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white"><CheckCircle2 className="h-5 w-5" /></span>
            <div>
              <p className="font-black text-emerald-950">درخواست شما ثبت شد</p>
              <p className="mt-1 text-xs font-bold leading-6 text-emerald-800">برای هماهنگی زمان دمو با شما تماس می‌گیریم.</p>
            </div>
          </div>
          <Button type="button" variant="outline" className="mt-4 h-10 w-full rounded-xl border-emerald-300 text-xs font-black text-emerald-800" onClick={() => setSubmitted(false)}>
            ثبت درخواست دیگر
          </Button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit} data-testid="landing-demo-form" noValidate>
          <div className="pointer-events-none absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true">
            <label htmlFor="demo-website">وب‌سایت</label>
            <input id="demo-website" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => updateForm({ website: event.target.value })} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="demo-company">نام شرکت *</Label>
              <Input id="demo-company" data-testid="demo-company-name" required value={form.companyName} onChange={(event) => updateForm({ companyName: event.target.value })} maxLength={200} autoComplete="organization" className="h-11 bg-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="demo-contact">نام هماهنگ‌کننده *</Label>
              <Input id="demo-contact" data-testid="demo-contact-name" required value={form.contactName} onChange={(event) => updateForm({ contactName: event.target.value })} maxLength={200} autoComplete="name" className="h-11 bg-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="demo-phone">شماره تماس</Label>
              <Input id="demo-phone" data-testid="demo-contact-phone" dir="ltr" inputMode="tel" value={form.contactPhone} onChange={(event) => updateForm({ contactPhone: event.target.value })} maxLength={80} autoComplete="tel" placeholder="09..." className="h-11 text-left bg-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="demo-email">ایمیل</Label>
              <Input id="demo-email" data-testid="demo-contact-email" dir="ltr" type="email" inputMode="email" value={form.contactEmail} onChange={(event) => updateForm({ contactEmail: event.target.value })} maxLength={240} autoComplete="email" placeholder="name@company.com" className="h-11 text-left bg-white" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="demo-method">روش ارتباط ترجیحی</Label>
            <select
              id="demo-method"
              data-testid="demo-preferred-contact-method"
              value={form.preferredContactMethod}
              onChange={(event) => updateForm({ preferredContactMethod: event.target.value as DemoFormState["preferredContactMethod"] })}
              className="h-11 w-full rounded-lg border border-input bg-white px-3 text-sm font-bold outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35"
            >
              <option value="phone">تماس تلفنی</option>
              <option value="email">ایمیل</option>
              <option value="either">هر کدام</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="demo-message">درباره نیاز تیم شما</Label>
            <textarea
              id="demo-message"
              data-testid="demo-message"
              value={form.message}
              onChange={(event) => updateForm({ message: event.target.value })}
              maxLength={2000}
              rows={4}
              placeholder="مثلا تعداد محموله‌های فعال، روش فعلی پیگیری یا مهم‌ترین مسئله تیم..."
              className="w-full resize-y rounded-lg border border-input bg-white px-3 py-2.5 text-sm font-medium leading-7 outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35"
            />
          </div>

          {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700" role="alert">{error}</p> : null}

          <Button type="submit" disabled={submitting} className="landing-cta-primary h-12 w-full cursor-pointer rounded-xl text-sm font-black" data-testid="submit-demo-request">
            {submitting ? "در حال ثبت..." : <><Send className="ml-2 h-4 w-4" />ثبت درخواست دمو</>}
          </Button>
        </form>
      )}

      {whatsappUrl ? (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <Button asChild variant="outline" className="h-11 w-full cursor-pointer rounded-xl border-emerald-300 text-xs font-black text-emerald-700 hover:bg-emerald-50">
            <a href={whatsappUrl} target="_blank" rel="noreferrer" data-testid="landing-whatsapp-link">
              <MessageCircle className="ml-2 h-4 w-4" />
              گفت‌وگوی مستقیم در واتساپ
            </a>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export default function LandingPage() {
  React.useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-testid="landing-page"]');
    if (!root) return undefined;

    root.dataset.motionReady = "true";
    const revealItems = Array.from(root.querySelectorAll<HTMLElement>("[data-landing-reveal]"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      revealItems.forEach((item) => item.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });

    revealItems.forEach((item, index) => {
      item.style.setProperty("--landing-reveal-delay", `${Math.min(index % 4, 3) * 80}ms`);
      observer.observe(item);
    });

    return () => observer.disconnect();
  }, []);

  const whatsappNumber = String(import.meta.env.VITE_PUBLIC_WHATSAPP_NUMBER || "").replace(/\D/g, "");
  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent("سلام، برای دریافت دموی LogisticPlus پیام می‌دهم.")}`
    : null;

  return (
    <div className="landing-page min-h-screen overflow-x-hidden bg-[#f7fbff] text-slate-950" dir="rtl" data-testid="landing-page">
      <a href="#main-content" className="sr-only z-[100] rounded-lg bg-white px-4 py-2 font-bold text-blue-700 focus:not-sr-only focus:fixed focus:right-4 focus:top-4">رفتن به محتوای اصلی</a>

      <header className="landing-nav sticky top-0 z-50 border-b border-white/70 bg-[#f7fbff]/90 backdrop-blur-xl supports-[backdrop-filter]:bg-[#f7fbff]/78">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:h-[72px] lg:px-6">
          <BrandMark />

          <nav className="hidden items-center gap-1 rounded-xl border border-blue-100 bg-white/85 p-1 shadow-sm lg:flex" aria-label="ناوبری اصلی">
            {navigation.map((item) => (
              <a key={item.href} href={item.href} className="cursor-pointer rounded-lg px-3 py-2 text-xs font-black text-slate-600 transition-colors duration-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="ghost" className="h-10 cursor-pointer rounded-xl px-2 text-[11px] font-black text-slate-700 sm:px-3 sm:text-xs">
              <Link to="/login">ورود کاربران</Link>
            </Button>
            <Button asChild className="landing-cta-primary h-10 cursor-pointer rounded-xl px-2.5 text-[11px] font-black shadow-lg shadow-blue-600/15 sm:px-4 sm:text-xs">
              <a href="#demo">درخواست دمو <ArrowLeft className="mr-1 h-3.5 w-3.5" /></a>
            </Button>
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className="relative isolate overflow-hidden border-b border-blue-100 px-4 pb-16 pt-12 sm:pb-20 sm:pt-16 lg:px-6 lg:pb-24 lg:pt-20">
          <img src="/landing/logisticplus-hero-port.webp" alt="نمای بندر و عملیات حمل‌ونقل" className="absolute inset-0 -z-20 h-full w-full object-cover opacity-[0.12]" />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(247,251,255,0.96),rgba(247,251,255,0.88),rgba(247,251,255,0.76))]" aria-hidden="true" />
          <div className="landing-grid absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
          <div className="landing-hero-orb landing-hero-orb-one" aria-hidden="true" />
          <div className="landing-hero-orb landing-hero-orb-two" aria-hidden="true" />

          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:gap-14">
            <div data-landing-reveal className="landing-reveal max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/90 px-3 py-1.5 text-[11px] font-black text-blue-700 shadow-sm">
                <Sparkles className="landing-sparkle h-3.5 w-3.5" />
                پنل فارسی مدیریت عملیات لجستیک
              </div>
              <h1 className="mt-5 text-3xl font-black leading-[1.45] tracking-tight text-slate-950 sm:text-4xl lg:text-[3.25rem] lg:leading-[1.35]">
                هر محموله، سند و پیگیری را در یک جریان روشن مدیریت کنید
              </h1>
              <p className="mt-5 max-w-xl text-sm font-medium leading-8 text-slate-600 sm:text-base sm:leading-9">
                LogisticPlus به شرکت‌های لجستیکی و تیم‌های واردات و صادرات کمک می‌کند اطلاعات پراکنده را به پرونده‌های قابل پیگیری تبدیل کنند؛ از ثبت محموله تا اسناد، وظایف و رهگیری امن مشتری.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Button asChild className="landing-cta-primary h-12 cursor-pointer rounded-xl px-5 text-sm font-black shadow-xl shadow-blue-600/20">
                  <a href="#demo">درخواست دموی متناسب با تیم شما <ArrowLeft className="mr-2 h-4 w-4" /></a>
                </Button>
                <Button asChild variant="outline" className="h-12 cursor-pointer rounded-xl border-blue-200 bg-white/85 px-5 text-sm font-black text-blue-800">
                  <a href="#solutions">آشنایی با راهکار <ChevronLeft className="mr-1 h-4 w-4" /></a>
                </Button>
              </div>
              <div className="mt-7 grid gap-2.5 sm:grid-cols-3">
                {["فارسی و راست‌چین", "دسترسی امن مشتری", "مناسب تیم‌های عملیاتی"].map((item) => (
                  <div key={item} className="flex items-center gap-2 rounded-xl border border-blue-100 bg-white/80 px-3 py-2.5 text-[11px] font-black text-slate-700 shadow-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <ProductPreview />
          </div>
        </section>

        <ProductFootprint />

        <section className="px-4 py-16 sm:py-20 lg:px-6" id="solutions">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="از پراکندگی تا کنترل عملیاتی"
              title="وقتی اطلاعات در یک پرونده مشترک باشد، تیم سریع‌تر تصمیم می‌گیرد"
              text="LogisticPlus برای جایگزین کردن تماس‌ها و گزارش‌های دستی با یک منبع روشن از وضعیت عملیات ساخته شده است."
            />
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {operationalPains.map((item, index) => {
                const Icon = item.icon;
                return (
                    <article key={item.title} className="landing-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <div className="flex items-center justify-between gap-3">
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-700"><Icon className="h-5 w-5" /></span>
                      <span className="text-xs font-black text-slate-300">۰{index + 1}</span>
                    </div>
                    <h3 className="mt-5 text-lg font-black text-slate-950">{item.title}</h3>
                    <p className="mt-2 text-sm font-medium leading-7 text-slate-600">{item.text}</p>
                  </article>
                );
              })}
            </div>

            <div className="mt-5 grid gap-4 rounded-2xl border border-blue-200 bg-blue-700 p-5 text-white shadow-xl shadow-blue-700/10 sm:grid-cols-3 sm:p-6">
              {[
                ["یک پرونده مشترک", "اطلاعات اصلی، اسناد و کارها کنار همان محموله"],
                ["اقدام بعدی مشخص", "مسئول و مهلت هر پیگیری برای تیم روشن"],
                ["ارتباط امن با مشتری", "نمای جداگانه برای وضعیت و اسناد مجاز"],
              ].map(([title, text]) => (
                <div key={title} className="rounded-xl border border-white/15 bg-white/10 p-4">
                  <p className="text-sm font-black">{title}</p>
                  <p className="mt-2 text-xs font-medium leading-6 text-blue-100">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-blue-100 bg-white px-4 py-16 sm:py-20 lg:px-6" id="features">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="قابلیت‌های اصلی"
              title="ابزارهای روزمره تیم لجستیک، متصل به هم"
              text="هر بخش بر یک جریان واقعی عملیات تکیه دارد؛ بدون ساختن جزیره‌های اطلاعاتی تازه."
            />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                    <article key={feature.title} className="landing-card group rounded-2xl border border-blue-100 bg-[#fbfdff] p-5 transition-colors duration-200 hover:border-blue-300 hover:bg-blue-50/35 sm:p-6">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-100 text-blue-700 transition-colors duration-200 group-hover:bg-blue-600 group-hover:text-white"><Icon className="h-5 w-5" /></span>
                    <h3 className="mt-5 text-base font-black text-slate-950">{feature.title}</h3>
                    <p className="mt-2 text-sm font-medium leading-7 text-slate-600">{feature.text}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="relative isolate overflow-hidden border-y border-slate-800 bg-slate-950 px-4 py-16 text-white sm:py-20 lg:px-6" id="internal-chat" data-testid="landing-internal-chat">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_12%_18%,rgba(37,99,235,0.28),transparent_30%),radial-gradient(circle_at_88%_82%,rgba(14,165,233,0.16),transparent_32%)]" aria-hidden="true" />
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.76fr_1.24fr] lg:items-center lg:gap-14">
            <div data-landing-reveal className="landing-reveal max-w-xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-400/10 px-3 py-1.5 text-[11px] font-black text-blue-200">
                <MessageSquare className="h-3.5 w-3.5" /> گفت‌وگوی داخلی، متصل به عملیات
              </span>
              <h2 className="mt-5 text-3xl font-black leading-[1.5] tracking-tight text-white sm:text-4xl">تیم کنار همان محموله گفت‌وگو می‌کند؛ نه در پیام‌رسان‌های پراکنده</h2>
              <p className="mt-4 text-sm font-medium leading-8 text-slate-300 sm:text-base">گفت‌وگوهای مستقیم، گروهی و مخصوص هر محموله در محیط داخلی شرکت می‌مانند. اعضای تیم می‌توانند پیام، فایل و صدای مرتبط با کار را کنار همان جریان عملیاتی ثبت کنند.</p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {[
                  "گفت‌وگوی مستقیم، گروهی و مخصوص محموله",
                  "ارسال فایل، تصویر و پیام صوتی",
                  "جست‌وجوی سریع و نمایش پیام‌های خوانده‌نشده",
                  "حفظ سابقه گفتگو کنار پرونده عملیاتی",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.06] p-3 text-xs font-black leading-6 text-slate-100">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-cyan-300" />{item}
                  </div>
                ))}
              </div>
            </div>
            <InternalChatPreview />
          </div>
        </section>

        <section className="px-4 py-16 sm:py-20 lg:px-6">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_0.72fr] lg:items-center lg:gap-16">
            <div>
              <SectionHeading
                align="right"
                eyebrow="شفافیت برای مشتری، حریم امن برای تیم"
                title="اطلاعات لازم را به مشتری نشان دهید؛ داده‌های داخلی را داخل شرکت نگه دارید"
                text="برای هر محموله یک لینک اختصاصی ساخته می‌شود. مشتری وضعیت، مسیر کلی و فایل‌های مجاز را می‌بیند، بدون آنکه به پنل عملیاتی یا اطلاعات محرمانه دسترسی داشته باشد."
              />
              <div className="mt-7 space-y-3">
                {["نمایش فقط اطلاعات تاییدشده", "تفکیک سند عمومی و داخلی", "دسترسی بدون حساب کاربری داخلی", "قابل استفاده روی موبایل"].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-xl border border-blue-100 bg-white p-3.5 text-sm font-black text-slate-800 shadow-sm">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><Check className="h-4 w-4" /></span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <CustomerTrackingPreview />
          </div>
        </section>

        <section className="border-y border-blue-100 bg-blue-50/55 px-4 py-16 sm:py-20 lg:px-6" id="workflow">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="شروع ساده و مرحله‌ای"
              title="از چند محموله فعال شروع کنید"
              text="برای دیدن ارزش محصول لازم نیست کل آرشیو را یک‌باره منتقل کنید. جریان را روی کارهای واقعی امروز تیم بسازید."
            />
            <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {workflowSteps.map((step) => (
                <li key={step.number} className="landing-card relative rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-700 text-sm font-black text-white">{step.number}</span>
                  <h3 className="mt-5 text-base font-black text-slate-950">{step.title}</h3>
                  <p className="mt-2 text-sm font-medium leading-7 text-slate-600">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="px-4 py-16 sm:py-20 lg:px-6">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="برای دو سمت زنجیره عملیات"
              title="یک محصول برای ارائه‌دهندگان خدمات و تیم‌های صاحب کالا"
              text="پیام و جریان اصلی محصول برای هر دو گروه روشن می‌ماند، بدون آنکه تجربه یکی فدای دیگری شود."
            />
            <div className="mt-10 grid gap-5 lg:grid-cols-2">
              {[
                {
                  icon: Building2,
                  title: "شرکت‌های حمل و خدمات لجستیکی",
                  text: "برای فورواردری، حمل‌ونقل، ترخیص و خدمات بندری که چند مشتری و پرونده هم‌زمان را مدیریت می‌کنند.",
                  items: ["پرونده مجزا برای هر بار", "هماهنگی تیم و مسئولیت‌ها", "رهگیری امن برای مشتریان"],
                },
                {
                  icon: UserRoundCheck,
                  title: "تیم‌های واردات و صادرات",
                  text: "برای شرکت‌هایی که می‌خواهند وضعیت محموله، مدارک و پیگیری تامین‌کنندگان و کارگزاران را یکجا ببینند.",
                  items: ["دید مدیریتی روی محموله‌ها", "کنترل مدارک و موعدها", "کاهش گزارش‌گیری پراکنده"],
                },
              ].map((audience) => {
                const Icon = audience.icon;
                return (
                  <article key={audience.title} className="landing-card rounded-2xl border border-blue-100 bg-white p-6 shadow-sm sm:p-7">
                    <span className="grid h-12 w-12 place-items-center rounded-xl bg-blue-100 text-blue-700"><Icon className="h-6 w-6" /></span>
                    <h3 className="mt-5 text-xl font-black text-slate-950">{audience.title}</h3>
                    <p className="mt-3 text-sm font-medium leading-8 text-slate-600">{audience.text}</p>
                    <ul className="mt-5 grid gap-2.5 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                      {audience.items.map((item) => (
                        <li key={item} className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs font-black leading-6 text-slate-700">
                          <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600" />{item}
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-y border-blue-100 bg-white px-4 py-16 sm:py-20 lg:px-6" id="faq">
          <div className="mx-auto max-w-4xl">
            <SectionHeading
              eyebrow="سوالات متداول"
              title="پیش از درخواست دمو"
              text="پاسخ کوتاه به پرسش‌هایی که معمولا در شروع بررسی محصول مطرح می‌شوند."
            />
            <div className="mt-10 space-y-3">
              {faqs.map((faq) => (
                <details key={faq.question} className="group rounded-2xl border border-slate-200 bg-[#fbfdff] p-4 open:border-blue-200 open:bg-blue-50/35 sm:p-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-black text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-base">
                    {faq.question}
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-blue-700 shadow-sm transition-transform duration-200 group-open:rotate-90"><ChevronLeft className="h-4 w-4" /></span>
                  </summary>
                  <p className="mt-4 border-t border-blue-100 pt-4 text-sm font-medium leading-8 text-slate-600">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="relative isolate overflow-hidden bg-blue-800 px-4 py-16 text-white sm:py-20 lg:px-6" id="demo">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(56,189,248,0.28),transparent_35%),radial-gradient(circle_at_90%_80%,rgba(14,165,233,0.2),transparent_35%)]" aria-hidden="true" />
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:gap-14">
            <div className="lg:sticky lg:top-28">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-black text-blue-100"><MessageCircle className="h-3.5 w-3.5" />گفت‌وگوی کوتاه، دموی کاربردی</span>
              <h2 className="mt-5 text-3xl font-black leading-[1.5] sm:text-4xl">LogisticPlus را روی مسئله واقعی تیم خودتان ببینید</h2>
              <p className="mt-4 text-sm font-medium leading-8 text-blue-100 sm:text-base">درخواست را ثبت کنید تا دمو بر اساس نوع عملیات، تعداد محموله‌ها و مهم‌ترین گلوگاه تیم شما هماهنگ شود.</p>
              <div className="mt-7 space-y-3">
                {["بدون ثبت‌نام عمومی یا تعهد خرید", "تمرکز روی جریان واقعی عملیات شما", "امکان شروع پایلوت با چند پرونده فعال"].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 p-3 text-xs font-black text-white">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-300" />{item}
                  </div>
                ))}
              </div>
            </div>
            <DemoRequestForm whatsappUrl={whatsappUrl} />
          </div>
        </section>
      </main>

      <footer className="bg-slate-950 px-4 py-10 text-white lg:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <BrandMark inverse />
            <p className="mt-3 max-w-md text-xs font-medium leading-6 text-slate-400">مدیریت فارسی محموله، اسناد، وظایف و رهگیری امن مشتری برای تیم‌های لجستیکی.</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-xs font-black text-slate-300">
            <a href="#features" className="cursor-pointer transition-colors hover:text-white">امکانات</a>
            <a href="#faq" className="cursor-pointer transition-colors hover:text-white">سوالات</a>
            <a href="#demo" className="cursor-pointer transition-colors hover:text-white">درخواست دمو</a>
            <Link to="/login" className="cursor-pointer transition-colors hover:text-white">ورود کاربران</Link>
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-7xl border-t border-slate-800 pt-5 text-[11px] font-medium text-slate-500">
          © {new Date().getFullYear().toLocaleString("fa-IR", { useGrouping: false })} LogisticPlus. تمام حقوق محفوظ است.
        </div>
      </footer>
    </div>
  );
}
