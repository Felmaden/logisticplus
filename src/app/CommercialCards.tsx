import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns-jalali";
import {
  AlertTriangle,
  Anchor,
  Archive,
  Banknote,
  Barcode,
  Building2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClockAlert,
  Eye,
  FileText,
  Hash,
  IdCard,
  Landmark,
  Loader2,
  Paperclip,
  Package,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Upload,
  UserRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ApiError } from "@/src/lib/api";
import { businessEntitiesApi } from "@/src/lib/businessEntitiesApi";
import { DeleteConfirmDialog } from "@/src/components/DeleteConfirmDialog";
import { EmptyState, resetFiltersAction } from "@/src/components/EmptyState";
import {
  getShamsiDatePart,
  parseShamsiDateTimeValue,
  ShamsiDateTimeField,
  toEnglishDigits,
  toPersianDigits,
} from "@/src/components/ShamsiDateTimeField";
import { useAppStore } from "@/src/store/useAppStore";
import type {
  BusinessEntityContact,
  BusinessEntityContactType,
  CommercialCard,
  CommercialCardDocument,
  CommercialCardStatus,
  MalvaniActiveStatus,
  MalvaniProfile,
  ShipmentV2CurrencyCode,
} from "@/src/types";

type ActiveTab = "commercialCards" | "malvani";
type StatusFilter = "ALL" | CommercialCardStatus | "NEEDS_ATTENTION";
type DeadlineAlertStatus = "NOT_SET" | "SETTLED" | "OVERDUE" | "DUE_SOON" | "ON_TRACK";

type CommercialCardFormState = {
  holderName: string;
  cardNumber: string;
  expirationDate: string;
  invoiceNumber: string;
  orderRegistrationNumber: string;
  totalValueAmount: string;
  totalValueCurrency: ShipmentV2CurrencyCode;
  bankName: string;
  bankBranch: string;
  allocationDate: string;
  commitmentSettlementDeadline: string;
  remainingCommitmentAmount: string;
  remainingCommitmentCurrency: ShipmentV2CurrencyCode;
  goodsDescription: string;
  tariffCode: string;
  orderRegistrationExpiryDate: string;
  nationalId: string;
  responsibleName: string;
  responsiblePhone: string;
  description: string;
  documents: CommercialCardDocument[];
  contacts: BusinessEntityContact[];
};

type MalvaniFormState = {
  displayName: string;
  captainName: string;
  lenjName: string;
  lenjRegistrationNumber: string;
  lenjType: string;
  homePort: string;
  activeStatus: MalvaniActiveStatus;
  note: string;
  contacts: BusinessEntityContact[];
};

type ContactFormState = {
  contactName: string;
  roleTitle: string;
  phoneNumber: string;
  phoneLabel: string;
  note: string;
  isPrimary: boolean;
};

type DocumentDraft = {
  title: string;
  description: string;
  file: File | null;
};

const emptyCardForm: CommercialCardFormState = {
  holderName: "",
  cardNumber: "",
  expirationDate: "",
  invoiceNumber: "",
  orderRegistrationNumber: "",
  totalValueAmount: "",
  totalValueCurrency: "IRR",
  bankName: "",
  bankBranch: "",
  allocationDate: "",
  commitmentSettlementDeadline: "",
  remainingCommitmentAmount: "",
  remainingCommitmentCurrency: "IRR",
  goodsDescription: "",
  tariffCode: "",
  orderRegistrationExpiryDate: "",
  nationalId: "",
  responsibleName: "",
  responsiblePhone: "",
  description: "",
  documents: [],
  contacts: [],
};

const emptyMalvaniForm: MalvaniFormState = {
  displayName: "",
  captainName: "",
  lenjName: "",
  lenjRegistrationNumber: "",
  lenjType: "",
  homePort: "",
  activeStatus: "ACTIVE",
  note: "",
  contacts: [],
};

const emptyContactForm: ContactFormState = {
  contactName: "",
  roleTitle: "",
  phoneNumber: "",
  phoneLabel: "",
  note: "",
  isPrimary: false,
};

const emptyDocumentDraft: DocumentDraft = {
  title: "",
  description: "",
  file: null,
};

const statusMeta: Record<CommercialCardStatus, { label: string; icon: typeof CheckCircle2; className: string }> = {
  VALID: {
    label: "معتبر",
    icon: CheckCircle2,
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
  },
  EXPIRING_SOON: {
    label: "نزدیک به انقضا",
    icon: ClockAlert,
    className: "border-amber-500/20 bg-amber-500/10 text-amber-700",
  },
  EXPIRED: {
    label: "منقضی‌شده",
    icon: XCircle,
    className: "border-rose-500/20 bg-rose-500/10 text-rose-700",
  },
};

const malvaniStatusMeta: Record<MalvaniActiveStatus, { label: string; className: string }> = {
  ACTIVE: { label: "فعال", className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700" },
  INACTIVE: { label: "غیرفعال", className: "border-slate-500/20 bg-slate-500/10 text-slate-700" },
  NEEDS_REVIEW: { label: "نیازمند بررسی", className: "border-amber-500/20 bg-amber-500/10 text-amber-700" },
};

const filterOptions: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "همه" },
  { value: "NEEDS_ATTENTION", label: "نیازمند اقدام" },
  { value: "VALID", label: "معتبر" },
  { value: "EXPIRING_SOON", label: "نزدیک به انقضا" },
  { value: "EXPIRED", label: "منقضی‌شده" },
];

const currencyOptions: ShipmentV2CurrencyCode[] = ["IRR", "USD", "EUR", "AED", "CNY"];
const currencyLabels: Record<ShipmentV2CurrencyCode, string> = {
  IRR: "ریال",
  USD: "دلار",
  EUR: "یورو",
  AED: "درهم",
  CNY: "یوان",
};

const deadlineAlertMeta: Record<DeadlineAlertStatus, {
  label: string;
  icon: typeof CheckCircle2;
  className: string;
}> = {
  NOT_SET: {
    label: "تاریخ ثبت نشده",
    icon: CalendarDays,
    className: "border-slate-500/20 bg-slate-500/10 text-slate-700",
  },
  SETTLED: {
    label: "تعهد تسویه شده",
    icon: CheckCircle2,
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
  },
  OVERDUE: {
    label: "مهلت گذشته",
    icon: AlertTriangle,
    className: "border-rose-500/20 bg-rose-500/10 text-rose-700",
  },
  DUE_SOON: {
    label: "نزدیک به سررسید",
    icon: ClockAlert,
    className: "border-amber-500/20 bg-amber-500/10 text-amber-700",
  },
  ON_TRACK: {
    label: "در مهلت",
    icon: CheckCircle2,
    className: "border-sky-500/20 bg-sky-500/10 text-sky-700",
  },
};

const activeStatusOptions: { value: MalvaniActiveStatus; label: string }[] = [
  { value: "ACTIVE", label: "فعال" },
  { value: "INACTIVE", label: "غیرفعال" },
  { value: "NEEDS_REVIEW", label: "نیازمند بررسی" },
];

const normalizeSearch = (value?: string) => toEnglishDigits(value || "").trim().toLowerCase();
const isArchivedCard = (card: CommercialCard) => Boolean(card.isArchived || card.archivedAt);
const parseDateStart = (value?: string) => parseShamsiDateTimeValue(value, "00:00");

const parseDateEnd = (value?: string) => {
  const date = parseShamsiDateTimeValue(value, "23:59");
  if (!date) return null;
  date.setHours(23, 59, 59, 999);
  return date;
};

const getCommercialCardStatus = (expirationDate: string): CommercialCardStatus => {
  const expiration = parseDateEnd(expirationDate);
  if (!expiration) return "EXPIRING_SOON";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntilExpiration = Math.ceil((expiration.getTime() - today.getTime()) / 86_400_000);
  if (daysUntilExpiration < 0) return "EXPIRED";
  if (daysUntilExpiration <= 30) return "EXPIRING_SOON";
  return "VALID";
};

const formatShamsiDate = (value?: string) => {
  const datePart = getShamsiDatePart(value);
  return datePart ? toPersianDigits(datePart) : "ثبت نشده";
};

const normalizeMoneyInput = (value: string) =>
  toEnglishDigits(value).trim().replace(/[\s,٬،]/g, "");

const parseOptionalMoney = (value: string) => {
  const normalized = normalizeMoneyInput(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const moneyFormValue = (value?: number | string | null) =>
  value === undefined || value === null ? "" : String(value);

const formatMoney = (amount?: number | null, currency: ShipmentV2CurrencyCode = "IRR") => {
  if (amount === undefined || amount === null || !Number.isFinite(Number(amount))) return "ثبت نشده";
  return `${Number(amount).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} ${currencyLabels[currency]}`;
};

const formatBankAndBranch = (bankName?: string, bankBranch?: string) => {
  const parts = [bankName?.trim(), bankBranch?.trim()].filter(Boolean);
  return parts.length ? parts.join(" — ") : "ثبت نشده";
};

const hasProvidedMoney = (value?: number | null) => value !== undefined && value !== null;

const getDeadlineAlert = (value?: string, settled = false) => {
  if (settled) return { status: "SETTLED" as const, daysRemaining: null };
  const deadline = parseDateStart(value);
  if (!deadline) return { status: "NOT_SET" as const, daysRemaining: null };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  deadline.setHours(0, 0, 0, 0);
  const daysRemaining = Math.round((deadline.getTime() - today.getTime()) / 86_400_000);
  if (daysRemaining < 0) return { status: "OVERDUE" as const, daysRemaining };
  if (daysRemaining <= 30) return { status: "DUE_SOON" as const, daysRemaining };
  return { status: "ON_TRACK" as const, daysRemaining };
};

const hasUrgentOperationalAlert = (card: CommercialCard) => {
  const commitmentSettled =
    hasProvidedMoney(card.remainingCommitmentAmount) &&
    Number(card.remainingCommitmentAmount) === 0;
  const alerts = [
    getDeadlineAlert(card.commitmentSettlementDeadline, commitmentSettled),
    getDeadlineAlert(card.orderRegistrationExpiryDate),
  ];
  return alerts.some(({ status }) => status === "OVERDUE" || status === "DUE_SOON");
};

const formatUploadDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ثبت نشده";
  return toPersianDigits(format(date, "yyyy/MM/dd"));
};

const formatIsoDate = (value?: string | null) => {
  if (!value) return "ثبت نشده";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ثبت نشده";
  return toPersianDigits(format(date, "yyyy/MM/dd"));
};

const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${toPersianDigits(bytes)} بایت`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${toPersianDigits(kilobytes.toFixed(1))} کیلوبایت`;
  return `${toPersianDigits((kilobytes / 1024).toFixed(1))} مگابایت`;
};

const normalizeContactPhone = (value: string) => {
  const normalized = toEnglishDigits(value)
    .trim()
    .replace(/^00/, "+")
    .replace(/[()\s\-._]/g, "");
  return normalized;
};

const validateContactDraft = (draft: ContactFormState) => {
  if (!draft.contactName.trim()) return "نام مخاطب را وارد کنید.";
  if (!draft.roleTitle.trim()) return "نقش / عنوان را وارد کنید.";
  const phone = normalizeContactPhone(draft.phoneNumber);
  if (!/^\+?[0-9]{6,20}$/.test(phone)) return "شماره تماس معتبر نیست.";
  return "";
};

const contactDraftFromContact = (contact: BusinessEntityContact): ContactFormState => ({
  contactName: contact.contactName || "",
  roleTitle: contact.roleTitle || "",
  phoneNumber: contact.phoneNumber || "",
  phoneLabel: contact.phoneLabel || "",
  note: contact.note || "",
  isPrimary: Boolean(contact.isPrimary),
});

const makeContactFromDraft = (
  draft: ContactFormState,
  {
    entityType,
    entityId,
    existing,
    sortOrder,
  }: {
    entityType: BusinessEntityContactType;
    entityId: string;
    existing?: BusinessEntityContact;
    sortOrder: number;
  }
): BusinessEntityContact => {
  const now = new Date().toISOString();
  return {
    id: existing?.id || `bec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    organizationId: existing?.organizationId,
    entityType,
    entityId,
    contactName: draft.contactName.trim(),
    roleTitle: draft.roleTitle.trim(),
    phoneNumber: normalizeContactPhone(draft.phoneNumber),
    phoneLabel: draft.phoneLabel.trim(),
    note: draft.note.trim(),
    isPrimary: Boolean(draft.isPrimary),
    sortOrder: existing?.sortOrder ?? sortOrder,
    createdById: existing?.createdById || null,
    updatedById: existing?.updatedById || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    archivedAt: null,
  };
};

const toFormState = (card: CommercialCard): CommercialCardFormState => ({
  holderName: card.holderName || "",
  cardNumber: card.cardNumber || "",
  expirationDate: card.expirationDate || "",
  invoiceNumber: card.invoiceNumber || "",
  orderRegistrationNumber: card.orderRegistrationNumber || "",
  totalValueAmount: moneyFormValue(card.totalValueAmount),
  totalValueCurrency: card.totalValueCurrency || "IRR",
  bankName: card.bankName || "",
  bankBranch: card.bankBranch || "",
  allocationDate: card.allocationDate || "",
  commitmentSettlementDeadline: card.commitmentSettlementDeadline || "",
  remainingCommitmentAmount: moneyFormValue(card.remainingCommitmentAmount),
  remainingCommitmentCurrency: card.remainingCommitmentCurrency || "IRR",
  goodsDescription: card.goodsDescription || "",
  tariffCode: card.tariffCode || "",
  orderRegistrationExpiryDate: card.orderRegistrationExpiryDate || "",
  nationalId: card.nationalId || "",
  responsibleName: card.responsibleName || "",
  responsiblePhone: card.responsiblePhone || "",
  description: card.description || "",
  documents: card.documents || [],
  contacts: (card.contacts || []).filter((contact) => !contact.archivedAt),
});

const toMalvaniFormState = (profile: MalvaniProfile): MalvaniFormState => ({
  displayName: profile.displayName || "",
  captainName: profile.captainName || "",
  lenjName: profile.lenjName || "",
  lenjRegistrationNumber: profile.lenjRegistrationNumber || "",
  lenjType: profile.lenjType || "",
  homePort: profile.homePort || "",
  activeStatus: profile.activeStatus || "ACTIVE",
  note: profile.note || "",
  contacts: (profile.contacts || []).filter((contact) => !contact.archivedAt),
});

function StatusBadge({ status }: { status: CommercialCardStatus }) {
  const meta = statusMeta[status];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn("h-7 gap-1.5 rounded-full px-3 text-[11px] font-black", meta.className)}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </Badge>
  );
}

function MalvaniStatusBadge({ status }: { status: MalvaniActiveStatus }) {
  const meta = malvaniStatusMeta[status] || malvaniStatusMeta.NEEDS_REVIEW;
  return (
    <Badge variant="outline" className={cn("h-7 rounded-full px-3 text-[11px] font-black", meta.className)}>
      {meta.label}
    </Badge>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[11px] font-bold text-destructive">{message}</p>;
}

function MoneyInputField({
  id,
  label,
  amount,
  currency,
  error,
  onAmountChange,
  onCurrencyChange,
}: {
  id: string;
  label: string;
  amount: string;
  currency: ShipmentV2CurrencyCode;
  error?: string;
  onAmountChange: (value: string) => void;
  onCurrencyChange: (value: ShipmentV2CurrencyCode) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-bold text-muted-foreground">{label}</Label>
      <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-2">
        <Input
          id={id}
          data-testid={`${id}-amount`}
          value={amount}
          onChange={(event) => onAmountChange(event.target.value)}
          inputMode="decimal"
          placeholder="۰"
          className="h-10 min-w-0 rounded-xl border-border bg-muted text-left text-xs font-bold"
          dir="ltr"
          aria-invalid={Boolean(error)}
        />
        <select
          data-testid={`${id}-currency`}
          value={currency}
          onChange={(event) => onCurrencyChange(event.target.value as ShipmentV2CurrencyCode)}
          aria-label={`نوع ارز ${label}`}
          className="h-10 min-w-0 rounded-xl border border-border bg-muted px-2 text-xs font-black text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-primary/20"
        >
          {currencyOptions.map((option) => (
            <option key={option} value={option}>{currencyLabels[option]}</option>
          ))}
        </select>
      </div>
      <FieldError message={error} />
    </div>
  );
}

function OperationalInfoBox({
  label,
  value,
  icon: Icon,
  testId,
}: {
  label: string;
  value?: React.ReactNode;
  icon: typeof CheckCircle2;
  testId: string;
}) {
  const hasValue = value !== undefined && value !== null && value !== "" && value !== "ثبت نشده";
  return (
    <div
      data-testid={testId}
      className="min-w-0 rounded-lg border border-border bg-muted/30 p-2.5"
    >
      <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span className="truncate text-[10px] font-black">{label}</span>
      </div>
      <p className={cn(
        "mt-1.5 break-words text-[11px] font-black leading-5",
        hasValue ? "text-foreground" : "text-muted-foreground"
      )}>
        {hasValue ? value : "ثبت نشده"}
      </p>
    </div>
  );
}

function DeadlineInfoBox({
  label,
  value,
  settled = false,
  testId,
}: {
  label: string;
  value?: string;
  settled?: boolean;
  testId: string;
}) {
  const alert = getDeadlineAlert(value, settled);
  const meta = deadlineAlertMeta[alert.status];
  const Icon = meta.icon;
  const remainingLabel = alert.daysRemaining === null
    ? null
    : alert.daysRemaining < 0
      ? `${toPersianDigits(Math.abs(alert.daysRemaining))} روز از مهلت گذشته`
      : alert.daysRemaining === 0
        ? "سررسید امروز"
        : `${toPersianDigits(alert.daysRemaining)} روز مانده`;

  return (
    <div
      data-testid={testId}
      className={cn(
        "col-span-2 min-w-0 rounded-lg border p-2.5",
        meta.className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="text-[10px] font-black">{label}</span>
          </div>
          <p className="mt-1.5 text-xs font-black text-foreground">{formatShamsiDate(value)}</p>
        </div>
        <Badge
          variant="outline"
          className={cn("h-7 shrink-0 rounded-full px-2.5 text-[10px] font-black", meta.className)}
        >
          {meta.label}
        </Badge>
      </div>
      {remainingLabel ? <p className="mt-1.5 text-[10px] font-black">{remainingLabel}</p> : null}
    </div>
  );
}

function CommercialCardOperationalGrid({ card }: { card: CommercialCard }) {
  const commitmentSettled =
    hasProvidedMoney(card.remainingCommitmentAmount) &&
    Number(card.remainingCommitmentAmount) === 0;

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="commercial-card-operational-info">
      <OperationalInfoBox
        label="شماره فاکتور"
        value={card.invoiceNumber ? toPersianDigits(card.invoiceNumber) : undefined}
        icon={FileText}
        testId="commercial-card-invoice-number"
      />
      <OperationalInfoBox
        label="ثبت سفارش"
        value={card.orderRegistrationNumber ? toPersianDigits(card.orderRegistrationNumber) : undefined}
        icon={Hash}
        testId="commercial-card-order-registration"
      />
      <OperationalInfoBox
        label="ارزش کل"
        value={formatMoney(card.totalValueAmount, card.totalValueCurrency || "IRR")}
        icon={CircleDollarSign}
        testId="commercial-card-total-value"
      />
      <OperationalInfoBox
        label="بانک و شعبه"
        value={formatBankAndBranch(card.bankName, card.bankBranch)}
        icon={Landmark}
        testId="commercial-card-bank-branch"
      />
      <OperationalInfoBox
        label="تاریخ تخصیص"
        value={formatShamsiDate(card.allocationDate)}
        icon={CalendarClock}
        testId="commercial-card-allocation-date"
      />
      <OperationalInfoBox
        label="مانده تعهد"
        value={formatMoney(card.remainingCommitmentAmount, card.remainingCommitmentCurrency || "IRR")}
        icon={Banknote}
        testId="commercial-card-remaining-commitment"
      />
      <OperationalInfoBox
        label="کالا"
        value={card.goodsDescription}
        icon={Package}
        testId="commercial-card-goods"
      />
      <OperationalInfoBox
        label="تعرفه"
        value={card.tariffCode ? toPersianDigits(card.tariffCode) : undefined}
        icon={Barcode}
        testId="commercial-card-tariff-code"
      />
      <DeadlineInfoBox
        label="آلارم مهلت رفع تعهد"
        value={card.commitmentSettlementDeadline}
        settled={commitmentSettled}
        testId="commercial-card-commitment-deadline-alert"
      />
      <DeadlineInfoBox
        label="آلارم انقضای ثبت سفارش"
        value={card.orderRegistrationExpiryDate}
        testId="commercial-card-order-expiry-alert"
      />
    </div>
  );
}

function ContactList({ contacts }: { contacts: BusinessEntityContact[] }) {
  if (!contacts.length) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-background p-4 text-center text-xs font-bold text-muted-foreground">
        شماره تکمیلی ثبت نشده است.
      </p>
    );
  }
  return (
    <div className="grid gap-2">
      {contacts.map((contact) => (
        <div key={contact.id} className="rounded-lg border border-border bg-background p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-black text-foreground">{contact.contactName}</p>
                <Badge variant="outline" className="rounded-full border-border bg-muted/50 text-[10px] font-black">
                  {contact.roleTitle}
                </Badge>
                {contact.isPrimary ? (
                  <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/10 text-[10px] font-black text-primary">
                    اصلی
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 font-mono text-xs font-bold text-foreground" dir="ltr">{contact.phoneNumber}</p>
              {contact.phoneLabel || contact.note ? (
                <p className="mt-1 text-[11px] font-bold leading-5 text-muted-foreground">
                  {[contact.phoneLabel, contact.note].filter(Boolean).join(" - ")}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ContactManager({
  title,
  contacts,
  draft,
  editingContactId,
  testPrefix,
  onDraftChange,
  onSaveDraft,
  onEditContact,
  onRemoveContact,
}: {
  title: string;
  contacts: BusinessEntityContact[];
  draft: ContactFormState;
  editingContactId: string | null;
  testPrefix: string;
  onDraftChange: (draft: ContactFormState) => void;
  onSaveDraft: () => void;
  onEditContact: (contact: BusinessEntityContact) => void;
  onRemoveContact: (contactId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/25 p-3" data-testid={`${testPrefix}-contacts-section`}>
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-black text-foreground">{title}</h3>
        </div>
        <Badge variant="outline" className="w-fit rounded-full border-border bg-background px-3 text-[11px] font-black">
          {toPersianDigits(contacts.length)} شماره
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${testPrefix}-contact-name`} className="text-xs font-bold text-muted-foreground">نام مخاطب</Label>
          <Input
            id={`${testPrefix}-contact-name`}
            data-testid={`${testPrefix}-contact-name`}
            value={draft.contactName}
            onChange={(event) => onDraftChange({ ...draft, contactName: event.target.value })}
            className="h-10 rounded-xl border-border bg-background text-xs font-bold"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${testPrefix}-contact-role`} className="text-xs font-bold text-muted-foreground">نقش / عنوان</Label>
          <Input
            id={`${testPrefix}-contact-role`}
            data-testid={`${testPrefix}-contact-role`}
            value={draft.roleTitle}
            onChange={(event) => onDraftChange({ ...draft, roleTitle: event.target.value })}
            className="h-10 rounded-xl border-border bg-background text-xs font-bold"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${testPrefix}-contact-phone`} className="text-xs font-bold text-muted-foreground">شماره تماس</Label>
          <Input
            id={`${testPrefix}-contact-phone`}
            data-testid={`${testPrefix}-contact-phone`}
            value={draft.phoneNumber}
            onChange={(event) => onDraftChange({ ...draft, phoneNumber: event.target.value })}
            className="h-10 rounded-xl border-border bg-background text-left text-xs font-bold"
            dir="ltr"
            inputMode="tel"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${testPrefix}-contact-label`} className="text-xs font-bold text-muted-foreground">برچسب شماره</Label>
          <Input
            id={`${testPrefix}-contact-label`}
            data-testid={`${testPrefix}-contact-label`}
            value={draft.phoneLabel}
            onChange={(event) => onDraftChange({ ...draft, phoneLabel: event.target.value })}
            placeholder="واتساپ، اضطراری، دفتر"
            className="h-10 rounded-xl border-border bg-background text-xs font-bold"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${testPrefix}-contact-note`} className="text-xs font-bold text-muted-foreground">توضیح</Label>
          <textarea
            id={`${testPrefix}-contact-note`}
            data-testid={`${testPrefix}-contact-note`}
            value={draft.note}
            onChange={(event) => onDraftChange({ ...draft, note: event.target.value })}
            className="min-h-20 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-primary/20"
          />
        </div>
        <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-xs font-black text-foreground">
            <Checkbox
              data-testid={`${testPrefix}-contact-primary`}
              checked={draft.isPrimary}
              onCheckedChange={(checked) => onDraftChange({ ...draft, isPrimary: Boolean(checked) })}
            />
            اصلی؟
          </label>
          <Button
            type="button"
            variant="outline"
            data-testid={`${testPrefix}-contact-save`}
            className="h-10 rounded-xl text-xs font-black"
            onClick={onSaveDraft}
          >
            <Plus className="h-4 w-4" />
            {editingContactId ? "ویرایش شماره" : "افزودن شماره"}
          </Button>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {contacts.length ? contacts.map((contact) => (
          <div key={contact.id} className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <span className="text-xs font-black text-foreground">{contact.contactName}</span>
                <Badge variant="outline" className="rounded-full border-border bg-muted/50 text-[10px] font-black">{contact.roleTitle}</Badge>
                {contact.isPrimary ? <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/10 text-[10px] font-black text-primary">اصلی</Badge> : null}
              </div>
              <p className="mt-1 font-mono text-xs font-bold text-foreground" dir="ltr">{contact.phoneNumber}</p>
              {contact.phoneLabel || contact.note ? (
                <p className="mt-1 text-[11px] font-bold leading-5 text-muted-foreground">
                  {[contact.phoneLabel, contact.note].filter(Boolean).join(" - ")}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg text-xs font-black" onClick={() => onEditContact(contact)}>
                <Pencil className="h-3.5 w-3.5" />
                ویرایش
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg text-xs font-black text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => onRemoveContact(contact.id)}>
                <Archive className="h-3.5 w-3.5" />
                غیرفعال‌سازی
              </Button>
            </div>
          </div>
        )) : (
          <p className="rounded-xl border border-dashed border-border bg-background p-4 text-center text-xs font-bold text-muted-foreground">
            شماره تکمیلی ثبت نشده است.
          </p>
        )}
      </div>
    </div>
  );
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export default function CommercialCards() {
  const commercialCards = useAppStore((state) => state.commercialCards);
  const addCommercialCard = useAppStore((state) => state.addCommercialCard);
  const updateCommercialCard = useAppStore((state) => state.updateCommercialCard);
  const deleteCommercialCard = useAppStore((state) => state.deleteCommercialCard);

  const [activeTab, setActiveTab] = useState<ActiveTab>("commercialCards");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CommercialCardFormState>(emptyCardForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [documentDraft, setDocumentDraft] = useState<DocumentDraft>(emptyDocumentDraft);
  const [commercialContactDraft, setCommercialContactDraft] = useState<ContactFormState>(emptyContactForm);
  const [editingCommercialContactId, setEditingCommercialContactId] = useState<string | null>(null);
  const [viewingCard, setViewingCard] = useState<CommercialCard | null>(null);
  const [cardToDelete, setCardToDelete] = useState<CommercialCard | null>(null);
  const [isSavingCommercialCard, setIsSavingCommercialCard] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [malvaniProfiles, setMalvaniProfiles] = useState<MalvaniProfile[]>([]);
  const [malvaniSearchTerm, setMalvaniSearchTerm] = useState("");
  const [malvaniLoading, setMalvaniLoading] = useState(false);
  const [malvaniError, setMalvaniError] = useState("");
  const [isMalvaniFormOpen, setIsMalvaniFormOpen] = useState(false);
  const [editingMalvaniProfile, setEditingMalvaniProfile] = useState<MalvaniProfile | null>(null);
  const [malvaniOriginalContacts, setMalvaniOriginalContacts] = useState<BusinessEntityContact[]>([]);
  const [malvaniFormData, setMalvaniFormData] = useState<MalvaniFormState>(emptyMalvaniForm);
  const [malvaniFormErrors, setMalvaniFormErrors] = useState<Record<string, string>>({});
  const [malvaniContactDraft, setMalvaniContactDraft] = useState<ContactFormState>(emptyContactForm);
  const [editingMalvaniContactId, setEditingMalvaniContactId] = useState<string | null>(null);
  const [viewingMalvaniProfile, setViewingMalvaniProfile] = useState<MalvaniProfile | null>(null);
  const [profileToArchive, setProfileToArchive] = useState<MalvaniProfile | null>(null);
  const [isSavingMalvani, setIsSavingMalvani] = useState(false);

  const activeCommercialCards = useMemo(
    () => commercialCards.filter((card) => !isArchivedCard(card)),
    [commercialCards]
  );

  const cardsWithStatus = useMemo(
    () =>
      activeCommercialCards.map((card) => ({
        card,
        status: getCommercialCardStatus(card.expirationDate),
        expirationTime: parseDateEnd(card.expirationDate)?.getTime() ?? Number.MAX_SAFE_INTEGER,
      })),
    [activeCommercialCards]
  );

  const filteredCards = useMemo(() => {
    const term = normalizeSearch(searchTerm);
    return cardsWithStatus
      .filter(({ card, status }) => {
        const matchesStatus =
          statusFilter === "ALL" ||
          (statusFilter === "NEEDS_ATTENTION" ? hasUrgentOperationalAlert(card) : status === statusFilter);
        if (!matchesStatus) return false;
        if (!term) return true;
        const searchable = [
          card.holderName,
          card.cardNumber,
          card.invoiceNumber,
          card.orderRegistrationNumber,
          card.totalValueAmount === undefined || card.totalValueAmount === null ? "" : String(card.totalValueAmount),
          card.totalValueCurrency,
          card.bankName,
          card.bankBranch,
          card.goodsDescription,
          card.tariffCode,
          card.remainingCommitmentAmount === undefined || card.remainingCommitmentAmount === null
            ? ""
            : String(card.remainingCommitmentAmount),
          card.remainingCommitmentCurrency,
          card.responsibleName,
          card.nationalId,
          ...(card.contacts || []).flatMap((contact) => [contact.contactName, contact.roleTitle, contact.phoneNumber]),
        ]
          .map(normalizeSearch)
          .join(" ");
        return searchable.includes(term);
      })
      .sort((left, right) => left.expirationTime - right.expirationTime)
      .map(({ card }) => card);
  }, [cardsWithStatus, searchTerm, statusFilter]);

  const filteredMalvaniProfiles = useMemo(() => {
    const term = normalizeSearch(malvaniSearchTerm);
    return malvaniProfiles.filter((profile) => {
      if (!term) return true;
      const searchable = [
        profile.displayName,
        profile.captainName,
        profile.lenjName,
        profile.lenjRegistrationNumber,
        profile.homePort,
        ...(profile.contacts || []).flatMap((contact) => [contact.contactName, contact.roleTitle, contact.phoneNumber]),
      ].map(normalizeSearch).join(" ");
      return searchable.includes(term);
    });
  }, [malvaniProfiles, malvaniSearchTerm]);

  const stats = useMemo(() => {
    const totalDocuments = activeCommercialCards.reduce((sum, card) => sum + (card.documents?.length || 0), 0);
    const totalContacts = activeCommercialCards.reduce((sum, card) => sum + (card.contacts?.filter((contact) => !contact.archivedAt).length || 0), 0);
    return [
      { label: "کل کارت‌ها", value: activeCommercialCards.length, icon: IdCard, tone: "bg-primary/10 text-primary" },
      { label: "نزدیک به انقضا", value: cardsWithStatus.filter((item) => item.status === "EXPIRING_SOON").length, icon: ClockAlert, tone: "bg-amber-500/10 text-amber-700" },
      { label: "منقضی‌شده", value: cardsWithStatus.filter((item) => item.status === "EXPIRED").length, icon: XCircle, tone: "bg-rose-500/10 text-rose-700" },
      { label: "مخاطبین تکمیلی", value: totalContacts, icon: Phone, tone: "bg-emerald-500/10 text-emerald-700" },
      { label: "اسناد مرتبط", value: totalDocuments, icon: Paperclip, tone: "bg-sky-500/10 text-sky-700" },
    ];
  }, [activeCommercialCards, cardsWithStatus]);

  const malvaniStats = useMemo(() => {
    const totalContacts = malvaniProfiles.reduce((sum, profile) => sum + (profile.contacts?.length || profile.contactsCount || 0), 0);
    return [
      { label: "پروفایل‌ها", value: malvaniProfiles.length, icon: Anchor, tone: "bg-primary/10 text-primary" },
      { label: "فعال", value: malvaniProfiles.filter((profile) => profile.activeStatus === "ACTIVE").length, icon: CheckCircle2, tone: "bg-emerald-500/10 text-emerald-700" },
      { label: "نیازمند بررسی", value: malvaniProfiles.filter((profile) => profile.activeStatus === "NEEDS_REVIEW").length, icon: ClockAlert, tone: "bg-amber-500/10 text-amber-700" },
      { label: "شماره‌ها", value: totalContacts, icon: Phone, tone: "bg-sky-500/10 text-sky-700" },
    ];
  }, [malvaniProfiles]);

  const loadMalvaniProfiles = useCallback(async () => {
    setMalvaniLoading(true);
    setMalvaniError("");
    try {
      const profiles = await businessEntitiesApi.listMalvaniProfiles();
      setMalvaniProfiles(profiles);
      setViewingMalvaniProfile((current) => {
        if (!current) return null;
        return profiles.find((profile) => profile.id === current.id) || null;
      });
    } catch (error) {
      setMalvaniError(apiErrorMessage(error, "بارگیری پروفایل‌های ملوانی ناموفق بود."));
    } finally {
      setMalvaniLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "malvani") void loadMalvaniProfiles();
  }, [activeTab, loadMalvaniProfiles]);

  const resetFilters = () => {
    setSearchTerm("");
    setStatusFilter("ALL");
  };

  const resetForm = () => {
    setEditingCardId(null);
    setFormData(emptyCardForm);
    setFormErrors({});
    setDocumentDraft(emptyDocumentDraft);
    setCommercialContactDraft(emptyContactForm);
    setEditingCommercialContactId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetMalvaniForm = () => {
    setEditingMalvaniProfile(null);
    setMalvaniOriginalContacts([]);
    setMalvaniFormData(emptyMalvaniForm);
    setMalvaniFormErrors({});
    setMalvaniContactDraft(emptyContactForm);
    setEditingMalvaniContactId(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEditDialog = (card: CommercialCard) => {
    setEditingCardId(card.id);
    setFormData(toFormState(card));
    setFormErrors({});
    setDocumentDraft(emptyDocumentDraft);
    setCommercialContactDraft(emptyContactForm);
    setEditingCommercialContactId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsFormOpen(true);
  };

  const openCreateMalvaniDialog = () => {
    resetMalvaniForm();
    setIsMalvaniFormOpen(true);
  };

  const openEditMalvaniDialog = (profile: MalvaniProfile) => {
    setEditingMalvaniProfile(profile);
    setMalvaniOriginalContacts(profile.contacts || []);
    setMalvaniFormData(toMalvaniFormState(profile));
    setMalvaniFormErrors({});
    setMalvaniContactDraft(emptyContactForm);
    setEditingMalvaniContactId(null);
    setIsMalvaniFormOpen(true);
  };

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};
    const holderName = formData.holderName.trim();
    const cardNumber = formData.cardNumber.trim();
    const expirationDate = formData.expirationDate.trim();

    if (!holderName) nextErrors.holderName = "وارد کردن نام شرکت / دارنده کارت الزامی است.";
    if (!cardNumber) nextErrors.cardNumber = "وارد کردن شماره کارت بازرگانی الزامی است.";
    if (!expirationDate) nextErrors.expirationDate = "وارد کردن تاریخ انقضا الزامی است.";

    const totalValue = normalizeMoneyInput(formData.totalValueAmount);
    const remainingCommitment = normalizeMoneyInput(formData.remainingCommitmentAmount);
    if (totalValue && !/^\d+(?:\.\d+)?$/.test(totalValue)) {
      nextErrors.totalValueAmount = "ارزش کل باید یک عدد غیرمنفی معتبر باشد.";
    }
    if (remainingCommitment && !/^\d+(?:\.\d+)?$/.test(remainingCommitment)) {
      nextErrors.remainingCommitmentAmount = "مانده تعهد باید یک عدد غیرمنفی معتبر باشد.";
    }

    setFormErrors(nextErrors);
    return nextErrors;
  };

  const validateMalvaniForm = () => {
    const nextErrors: Record<string, string> = {};
    if (!malvaniFormData.displayName.trim()) nextErrors.displayName = "نام نمایشی الزامی است.";
    if (!malvaniFormData.captainName.trim()) nextErrors.captainName = "نام ناخدا الزامی است.";
    if (!malvaniFormData.lenjName.trim()) nextErrors.lenjName = "نام لنج الزامی است.";
    if (!malvaniFormData.lenjRegistrationNumber.trim()) nextErrors.lenjRegistrationNumber = "شماره/شناسه لنج الزامی است.";
    setMalvaniFormErrors(nextErrors);
    return nextErrors;
  };

  const upsertLocalContact = (
    contacts: BusinessEntityContact[],
    draft: ContactFormState,
    editingContactId: string | null,
    entityType: BusinessEntityContactType,
    entityId: string
  ) => {
    const error = validateContactDraft(draft);
    if (error) {
      toast.error(error);
      return null;
    }
    const existing = editingContactId ? contacts.find((contact) => contact.id === editingContactId) : undefined;
    const nextContact = makeContactFromDraft(draft, {
      entityType,
      entityId,
      existing,
      sortOrder: contacts.length * 10,
    });
    let nextContacts = editingContactId
      ? contacts.map((contact) => contact.id === editingContactId ? nextContact : contact)
      : [...contacts, nextContact];
    if (nextContact.isPrimary) {
      nextContacts = nextContacts.map((contact) => contact.id === nextContact.id ? contact : { ...contact, isPrimary: false });
    }
    return nextContacts;
  };

  const handleSaveCommercialContact = () => {
    const entityId = editingCardId || "pending-commercial-card";
    const nextContacts = upsertLocalContact(
      formData.contacts,
      commercialContactDraft,
      editingCommercialContactId,
      "commercial_card",
      entityId
    );
    if (!nextContacts) return;
    setFormData((current) => ({ ...current, contacts: nextContacts }));
    setCommercialContactDraft(emptyContactForm);
    setEditingCommercialContactId(null);
  };

  const handleSaveMalvaniContact = () => {
    const entityId = editingMalvaniProfile?.id || "pending-malvani-profile";
    const nextContacts = upsertLocalContact(
      malvaniFormData.contacts,
      malvaniContactDraft,
      editingMalvaniContactId,
      "malvani",
      entityId
    );
    if (!nextContacts) return;
    setMalvaniFormData((current) => ({ ...current, contacts: nextContacts }));
    setMalvaniContactDraft(emptyContactForm);
    setEditingMalvaniContactId(null);
  };

  const handleSaveCard = async () => {
    if (isSavingCommercialCard) return;
    const errors = validateForm();
    const firstError = Object.values(errors)[0];
    if (firstError) {
      toast.error(firstError);
      return;
    }

    const cardId = editingCardId || `cc${Date.now()}`;
    const now = new Date().toISOString();
    const contacts = formData.contacts.map((contact, index) => ({
      ...contact,
      entityType: "commercial_card" as const,
      entityId: cardId,
      sortOrder: contact.sortOrder ?? index * 10,
      updatedAt: now,
      archivedAt: null,
    }));
    const payload = {
      id: cardId,
      holderName: formData.holderName.trim(),
      cardNumber: formData.cardNumber.trim(),
      expirationDate: formData.expirationDate.trim(),
      invoiceNumber: formData.invoiceNumber.trim(),
      orderRegistrationNumber: formData.orderRegistrationNumber.trim(),
      totalValueAmount: parseOptionalMoney(formData.totalValueAmount),
      totalValueCurrency: formData.totalValueCurrency,
      bankName: formData.bankName.trim(),
      bankBranch: formData.bankBranch.trim(),
      allocationDate: formData.allocationDate.trim(),
      commitmentSettlementDeadline: formData.commitmentSettlementDeadline.trim(),
      remainingCommitmentAmount: parseOptionalMoney(formData.remainingCommitmentAmount),
      remainingCommitmentCurrency: formData.remainingCommitmentCurrency,
      goodsDescription: formData.goodsDescription.trim(),
      tariffCode: formData.tariffCode.trim(),
      orderRegistrationExpiryDate: formData.orderRegistrationExpiryDate.trim(),
      nationalId: formData.nationalId.trim(),
      responsibleName: formData.responsibleName.trim(),
      responsiblePhone: formData.responsiblePhone.trim(),
      description: formData.description.trim(),
      documents: formData.documents,
      contacts,
      isArchived: false,
      archivedAt: "",
    };

    setIsSavingCommercialCard(true);
    try {
      if (editingCardId) {
        await updateCommercialCard(editingCardId, payload);
        toast.success("کارت بازرگانی با موفقیت ویرایش شد.");
      } else {
        await addCommercialCard(payload);
        toast.success("کارت بازرگانی با موفقیت ثبت شد.");
      }
      setIsFormOpen(false);
      resetForm();
    } catch (error) {
      toast.error(apiErrorMessage(error, "ذخیره کارت بازرگانی ناموفق بود. لطفاً دوباره تلاش کنید."));
    } finally {
      setIsSavingCommercialCard(false);
    }
  };

  const handleAddDocument = () => {
    const title = documentDraft.title.trim() || documentDraft.file?.name || "";
    if (!title) {
      toast.error("عنوان سند را وارد کنید.");
      return;
    }

    const document: CommercialCardDocument = {
      id: `ccd${Date.now()}`,
      title,
      fileName: documentDraft.file?.name,
      fileSize: documentDraft.file ? formatFileSize(documentDraft.file.size) : undefined,
      description: documentDraft.description.trim(),
      uploadedAt: new Date().toISOString(),
    };
    setFormData((current) => ({ ...current, documents: [...current.documents, document] }));
    setDocumentDraft(emptyDocumentDraft);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveDocument = (documentId: string) => {
    setFormData((current) => ({
      ...current,
      documents: current.documents.filter((document) => document.id !== documentId),
    }));
  };

  const syncMalvaniContacts = async (profileId: string, nextContacts: BusinessEntityContact[]) => {
    const nextIds = new Set(nextContacts.map((contact) => contact.id));
    for (const contact of malvaniOriginalContacts) {
      if (!nextIds.has(contact.id)) await businessEntitiesApi.archiveContact(contact.id);
    }
    for (const [index, contact] of nextContacts.entries()) {
      const payload = {
        contactName: contact.contactName,
        roleTitle: contact.roleTitle,
        phoneNumber: contact.phoneNumber,
        phoneLabel: contact.phoneLabel || null,
        note: contact.note || null,
        isPrimary: Boolean(contact.isPrimary),
        sortOrder: contact.sortOrder ?? index * 10,
      };
      if (malvaniOriginalContacts.some((item) => item.id === contact.id)) {
        await businessEntitiesApi.updateContact(contact.id, payload);
      } else {
        await businessEntitiesApi.createContact({
          ...payload,
          entityType: "malvani",
          entityId: profileId,
        });
      }
    }
  };

  const handleSaveMalvaniProfile = async () => {
    const errors = validateMalvaniForm();
    const firstError = Object.values(errors)[0];
    if (firstError) {
      toast.error(firstError);
      return;
    }
    setIsSavingMalvani(true);
    try {
      const payload = {
        displayName: malvaniFormData.displayName.trim(),
        captainName: malvaniFormData.captainName.trim(),
        lenjName: malvaniFormData.lenjName.trim(),
        lenjRegistrationNumber: malvaniFormData.lenjRegistrationNumber.trim(),
        lenjType: malvaniFormData.lenjType.trim() || null,
        homePort: malvaniFormData.homePort.trim() || null,
        activeStatus: malvaniFormData.activeStatus,
        note: malvaniFormData.note.trim(),
      };
      const profile = editingMalvaniProfile
        ? await businessEntitiesApi.updateMalvaniProfile(editingMalvaniProfile.id, payload)
        : await businessEntitiesApi.createMalvaniProfile(payload);
      await syncMalvaniContacts(profile.id, malvaniFormData.contacts);
      toast.success(editingMalvaniProfile ? "پروفایل ملوانی ویرایش شد." : "پروفایل ملوانی ثبت شد.");
      setIsMalvaniFormOpen(false);
      resetMalvaniForm();
      await loadMalvaniProfiles();
    } catch (error) {
      toast.error(apiErrorMessage(error, "ذخیره پروفایل ملوانی ناموفق بود."));
    } finally {
      setIsSavingMalvani(false);
    }
  };

  const selectedDeleteName = cardToDelete?.holderName || cardToDelete?.cardNumber;

  return (
    <div className="app-page space-y-5 font-sans text-right text-foreground" dir="rtl">
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:p-5">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-primary">
            {activeTab === "malvani" ? <Anchor className="h-5 w-5" /> : <IdCard className="h-5 w-5" />}
            <span className="text-[11px] font-black uppercase tracking-widest">کارت‌های بازرگانی</span>
          </div>
          <h1 className="text-xl font-black text-foreground md:text-2xl">کارت‌های بازرگانی و ملوانی</h1>
          <p className="mt-1 text-xs font-bold leading-6 text-muted-foreground md:text-sm">
            ثبت کارت‌های بازرگانی، پروفایل لنج و ناخدا، و شماره‌های تکمیلی عملیاتی.
          </p>
        </div>
        <Button
          type="button"
          data-testid={activeTab === "malvani" ? "malvani-add-button" : "commercial-card-add-button"}
          className="h-10 w-full rounded-xl bg-primary px-5 text-xs font-black text-primary-foreground hover:bg-primary/90 md:w-auto"
          onClick={activeTab === "malvani" ? openCreateMalvaniDialog : openCreateDialog}
        >
          <Plus className="h-4 w-4" />
          {activeTab === "malvani" ? "افزودن ملوانی" : "افزودن کارت بازرگانی"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-2 shadow-sm sm:w-fit">
        <Button
          type="button"
          data-testid="commercial-cards-tab"
          variant={activeTab === "commercialCards" ? "default" : "ghost"}
          className="h-10 rounded-lg px-4 text-xs font-black"
          onClick={() => setActiveTab("commercialCards")}
        >
          <IdCard className="h-4 w-4" />
          کارت‌های بازرگانی
        </Button>
        <Button
          type="button"
          data-testid="malvani-tab"
          variant={activeTab === "malvani" ? "default" : "ghost"}
          className="h-10 rounded-lg px-4 text-xs font-black"
          onClick={() => setActiveTab("malvani")}
        >
          <Anchor className="h-4 w-4" />
          ملوانی
        </Button>
      </div>

      {activeTab === "commercialCards" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <Card key={stat.label} className="rounded-xl border-border bg-card shadow-sm">
                  <CardContent className="flex items-start justify-between gap-3 p-4">
                    <div>
                      <p className="text-[11px] font-black text-muted-foreground">{stat.label}</p>
                      <p className="mt-2 text-2xl font-black text-foreground">{toPersianDigits(stat.value)}</p>
                    </div>
                    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", stat.tone)}>
                      <Icon className="h-5 w-5" />
                    </span>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="rounded-xl border-border bg-card shadow-sm">
            <CardContent className="space-y-3 p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="جستجو در شرکت، فاکتور، ثبت سفارش، کالا، بانک، تعرفه یا مخاطبین..."
                    className="h-10 rounded-xl border-border bg-muted pr-10 text-xs font-bold"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  {filterOptions.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant={statusFilter === option.value ? "default" : "outline"}
                      data-testid={`commercial-card-filter-${option.value}`}
                      className="h-10 rounded-xl px-4 text-xs font-black"
                      onClick={() => setStatusFilter(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {filteredCards.length === 0 ? (
            <Card className="rounded-xl border-border bg-card shadow-sm">
              <CardContent className="p-6">
                <EmptyState
                  icon={IdCard}
                  title={activeCommercialCards.length === 0 ? "هنوز هیچ کارت بازرگانی ثبت نشده است." : "کارتی با این جستجو یا فیلتر پیدا نشد."}
                  description={activeCommercialCards.length === 0 ? "اولین کارت بازرگانی را ثبت کنید تا تاریخ انقضا و مدارک آن قابل پیگیری باشد." : "عبارت جستجو یا فیلتر وضعیت را تغییر دهید."}
                  primaryAction={activeCommercialCards.length === 0 ? { label: "افزودن کارت بازرگانی", onClick: openCreateDialog, icon: Plus } : resetFiltersAction(resetFilters)}
                />
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {filteredCards.map((card) => {
                const status = getCommercialCardStatus(card.expirationDate);
                const contacts = (card.contacts || []).filter((contact) => !contact.archivedAt);
                return (
                  <Card
                    key={card.id}
                    className={cn(
                      "rounded-xl border-border bg-card shadow-sm",
                      hasUrgentOperationalAlert(card) && "border-amber-500/35"
                    )}
                    data-testid="commercial-card-item"
                  >
                    <CardContent className="space-y-4 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h2 className="break-words text-sm font-black text-foreground">{card.holderName}</h2>
                          <p className="mt-1 font-mono text-xs font-bold text-muted-foreground" dir="ltr">{card.cardNumber}</p>
                          {card.responsibleName ? <p className="mt-1 text-[11px] font-bold text-muted-foreground">مسئول: {card.responsibleName}</p> : null}
                        </div>
                        <StatusBadge status={status} />
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs font-bold text-muted-foreground">
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                          <span className="block text-[10px] font-black">انقضا</span>
                          <span className="mt-1 block text-foreground">{formatShamsiDate(card.expirationDate)}</span>
                        </div>
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                          <span className="block text-[10px] font-black">اسناد</span>
                          <span className="mt-1 block text-foreground">{toPersianDigits(card.documents?.length || 0)}</span>
                        </div>
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                          <span className="block text-[10px] font-black">شماره‌ها</span>
                          <span className="mt-1 block text-foreground">{toPersianDigits(contacts.length)}</span>
                        </div>
                      </div>
                      <CommercialCardOperationalGrid card={card} />
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" className="h-9 rounded-xl text-xs font-black" onClick={() => setViewingCard(card)}>
                          <Eye className="h-3.5 w-3.5" />
                          مشاهده
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-9 rounded-xl text-xs font-black" onClick={() => openEditDialog(card)}>
                          <Pencil className="h-3.5 w-3.5" />
                          ویرایش
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-9 rounded-xl border-destructive/30 text-xs font-black text-destructive hover:bg-destructive/10" onClick={() => setCardToDelete(card)}>
                          <Archive className="h-3.5 w-3.5" />
                          غیرفعال‌سازی
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {malvaniStats.map((stat) => {
              const Icon = stat.icon;
              return (
                <Card key={stat.label} className="rounded-xl border-border bg-card shadow-sm">
                  <CardContent className="flex items-start justify-between gap-3 p-4">
                    <div>
                      <p className="text-[11px] font-black text-muted-foreground">{stat.label}</p>
                      <p className="mt-2 text-2xl font-black text-foreground">{toPersianDigits(stat.value)}</p>
                    </div>
                    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", stat.tone)}>
                      <Icon className="h-5 w-5" />
                    </span>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="rounded-xl border-border bg-card shadow-sm">
            <CardContent className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={malvaniSearchTerm}
                  onChange={(event) => setMalvaniSearchTerm(event.target.value)}
                  placeholder="جستجو در نام ملوانی، ناخدا، لنج، بندر یا شماره‌ها..."
                  className="h-10 rounded-xl border-border bg-muted pr-10 text-xs font-bold"
                />
              </div>
              <Button type="button" variant="outline" className="h-10 rounded-xl text-xs font-black" onClick={loadMalvaniProfiles} disabled={malvaniLoading}>
                {malvaniLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                بروزرسانی
              </Button>
            </CardContent>
          </Card>

          {malvaniError ? (
            <p className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs font-bold text-destructive">
              {malvaniError}
            </p>
          ) : null}

          {malvaniLoading && malvaniProfiles.length === 0 ? (
            <Card className="rounded-xl border-border bg-card shadow-sm">
              <CardContent className="flex items-center justify-center gap-2 p-8 text-xs font-black text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                در حال بارگیری
              </CardContent>
            </Card>
          ) : filteredMalvaniProfiles.length === 0 ? (
            <Card className="rounded-xl border-border bg-card shadow-sm">
              <CardContent className="p-6">
                <EmptyState
                  icon={Anchor}
                  title={malvaniProfiles.length === 0 ? "هنوز پروفایل ملوانی ثبت نشده است." : "پروفایل ملوانی پیدا نشد."}
                  description={malvaniProfiles.length === 0 ? "اطلاعات لنج و ناخدا را ثبت کنید." : "عبارت جستجو را تغییر دهید."}
                  primaryAction={malvaniProfiles.length === 0 ? { label: "افزودن ملوانی", onClick: openCreateMalvaniDialog, icon: Plus } : resetFiltersAction(() => setMalvaniSearchTerm(""))}
                />
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {filteredMalvaniProfiles.map((profile) => {
                const contactsCount = profile.contacts?.length || profile.contactsCount || 0;
                return (
                  <Card key={profile.id} className="rounded-xl border-border bg-card shadow-sm" data-testid="malvani-profile-item">
                    <CardContent className="space-y-4 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h2 className="break-words text-sm font-black text-foreground">{profile.displayName}</h2>
                          <p className="mt-1 text-xs font-bold text-muted-foreground">ناخدا: {profile.captainName}</p>
                        </div>
                        <MalvaniStatusBadge status={profile.activeStatus} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs font-bold text-muted-foreground md:grid-cols-4">
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                          <span className="block text-[10px] font-black">نام لنج</span>
                          <span className="mt-1 block break-words text-foreground">{profile.lenjName || "ثبت نشده"}</span>
                        </div>
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                          <span className="block text-[10px] font-black">شناسه لنج</span>
                          <span className="mt-1 block break-words text-foreground">{profile.lenjRegistrationNumber || "ثبت نشده"}</span>
                        </div>
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                          <span className="block text-[10px] font-black">بندر اصلی</span>
                          <span className="mt-1 block break-words text-foreground">{profile.homePort || "ثبت نشده"}</span>
                        </div>
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                          <span className="block text-[10px] font-black">شماره‌ها</span>
                          <span className="mt-1 block text-foreground">{toPersianDigits(contactsCount)}</span>
                        </div>
                      </div>
                      <p className="text-[11px] font-bold text-muted-foreground">آخرین بروزرسانی: {formatIsoDate(profile.updatedAt)}</p>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" className="h-9 rounded-xl text-xs font-black" onClick={() => setViewingMalvaniProfile(profile)}>
                          <Eye className="h-3.5 w-3.5" />
                          مشاهده
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-9 rounded-xl text-xs font-black" onClick={() => openEditMalvaniDialog(profile)}>
                          <Pencil className="h-3.5 w-3.5" />
                          ویرایش
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-9 rounded-xl border-destructive/30 text-xs font-black text-destructive hover:bg-destructive/10" onClick={() => setProfileToArchive(profile)}>
                          <Archive className="h-3.5 w-3.5" />
                          غیرفعال‌سازی
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <Dialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-xl border-border bg-card text-right text-foreground sm:max-w-3xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-black">
              <IdCard className="h-5 w-5 text-primary" />
              {editingCardId ? "ویرایش کارت بازرگانی" : "افزودن کارت بازرگانی"}
            </DialogTitle>
            <DialogDescription className="text-right text-xs font-bold leading-6 text-muted-foreground">
              اطلاعات کارت، تاریخ انقضا، اسناد و شماره‌های تکمیلی را ثبت کنید.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="commercial-holder-name" className="text-xs font-bold text-muted-foreground">نام شرکت / دارنده کارت</Label>
              <Input
                id="commercial-holder-name"
                value={formData.holderName}
                onChange={(event) => setFormData((current) => ({ ...current, holderName: event.target.value }))}
                className="h-10 rounded-xl border-border bg-muted text-xs font-bold"
              />
              <FieldError message={formErrors.holderName} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="commercial-card-number" className="text-xs font-bold text-muted-foreground">شماره کارت بازرگانی</Label>
              <Input
                id="commercial-card-number"
                value={formData.cardNumber}
                onChange={(event) => setFormData((current) => ({ ...current, cardNumber: event.target.value }))}
                className="h-10 rounded-xl border-border bg-muted text-left text-xs font-bold"
                dir="ltr"
              />
              <FieldError message={formErrors.cardNumber} />
            </div>
            <div className="space-y-1.5">
              <ShamsiDateTimeField
                id="commercial-expiration-date"
                label="تاریخ انقضا"
                value={formData.expirationDate}
                onChange={(expirationDate) => setFormData((current) => ({ ...current, expirationDate }))}
                showTime={false}
                required
                triggerClassName="bg-muted"
              />
              <FieldError message={formErrors.expirationDate} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="commercial-national-id" className="text-xs font-bold text-muted-foreground">کد ملی / شناسه ملی</Label>
              <Input
                id="commercial-national-id"
                value={formData.nationalId}
                onChange={(event) => setFormData((current) => ({ ...current, nationalId: event.target.value }))}
                className="h-10 rounded-xl border-border bg-muted text-left text-xs font-bold"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="commercial-responsible-name" className="text-xs font-bold text-muted-foreground">نام شخص مسئول</Label>
              <Input
                id="commercial-responsible-name"
                value={formData.responsibleName}
                onChange={(event) => setFormData((current) => ({ ...current, responsibleName: event.target.value }))}
                className="h-10 rounded-xl border-border bg-muted text-xs font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="commercial-responsible-phone" className="text-xs font-bold text-muted-foreground">شماره تماس مسئول</Label>
              <Input
                id="commercial-responsible-phone"
                value={formData.responsiblePhone}
                onChange={(event) => setFormData((current) => ({ ...current, responsiblePhone: event.target.value }))}
                className="h-10 rounded-xl border-border bg-muted text-left text-xs font-bold"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="commercial-description" className="text-xs font-bold text-muted-foreground">توضیحات</Label>
              <textarea
                id="commercial-description"
                value={formData.description}
                onChange={(event) => setFormData((current) => ({ ...current, description: event.target.value }))}
                className="min-h-24 w-full rounded-xl border border-border bg-muted px-3 py-2 text-xs font-bold text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-primary/20"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/25 p-3">
            <div className="mb-3 flex items-start gap-2">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-black text-foreground">اطلاعات بازرگانی و تعهدات</h3>
                <p className="mt-1 text-[11px] font-bold leading-5 text-muted-foreground">
                  تاریخ‌های مهلت رفع تعهد و انقضای ثبت سفارش، آلارم‌های روی کارت را فعال می‌کنند.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="commercial-invoice-number" className="text-xs font-bold text-muted-foreground">شماره فاکتور</Label>
                <Input
                  id="commercial-invoice-number"
                  data-testid="commercial-invoice-number"
                  value={formData.invoiceNumber}
                  onChange={(event) => setFormData((current) => ({ ...current, invoiceNumber: event.target.value }))}
                  className="h-10 rounded-xl border-border bg-muted text-left text-xs font-bold"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="commercial-order-registration-number" className="text-xs font-bold text-muted-foreground">ثبت سفارش</Label>
                <Input
                  id="commercial-order-registration-number"
                  data-testid="commercial-order-registration-number"
                  value={formData.orderRegistrationNumber}
                  onChange={(event) => setFormData((current) => ({ ...current, orderRegistrationNumber: event.target.value }))}
                  className="h-10 rounded-xl border-border bg-muted text-left text-xs font-bold"
                  dir="ltr"
                />
              </div>

              <MoneyInputField
                id="commercial-total-value"
                label="ارزش کل"
                amount={formData.totalValueAmount}
                currency={formData.totalValueCurrency}
                error={formErrors.totalValueAmount}
                onAmountChange={(totalValueAmount) => setFormData((current) => ({ ...current, totalValueAmount }))}
                onCurrencyChange={(totalValueCurrency) => setFormData((current) => ({ ...current, totalValueCurrency }))}
              />
              <MoneyInputField
                id="commercial-remaining-commitment"
                label="مانده تعهد"
                amount={formData.remainingCommitmentAmount}
                currency={formData.remainingCommitmentCurrency}
                error={formErrors.remainingCommitmentAmount}
                onAmountChange={(remainingCommitmentAmount) => setFormData((current) => ({ ...current, remainingCommitmentAmount }))}
                onCurrencyChange={(remainingCommitmentCurrency) => setFormData((current) => ({ ...current, remainingCommitmentCurrency }))}
              />

              <div className="space-y-1.5">
                <Label htmlFor="commercial-bank-name" className="text-xs font-bold text-muted-foreground">بانک</Label>
                <Input
                  id="commercial-bank-name"
                  data-testid="commercial-bank-name"
                  value={formData.bankName}
                  onChange={(event) => setFormData((current) => ({ ...current, bankName: event.target.value }))}
                  className="h-10 rounded-xl border-border bg-muted text-xs font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="commercial-bank-branch" className="text-xs font-bold text-muted-foreground">شعبه</Label>
                <Input
                  id="commercial-bank-branch"
                  data-testid="commercial-bank-branch"
                  value={formData.bankBranch}
                  onChange={(event) => setFormData((current) => ({ ...current, bankBranch: event.target.value }))}
                  className="h-10 rounded-xl border-border bg-muted text-xs font-bold"
                />
              </div>

              <ShamsiDateTimeField
                id="commercial-allocation-date"
                label="تاریخ تخصیص"
                value={formData.allocationDate}
                onChange={(allocationDate) => setFormData((current) => ({ ...current, allocationDate }))}
                showTime={false}
                triggerClassName="bg-muted"
              />
              <ShamsiDateTimeField
                id="commercial-commitment-deadline"
                label="مهلت رفع تعهد"
                value={formData.commitmentSettlementDeadline}
                onChange={(commitmentSettlementDeadline) => setFormData((current) => ({ ...current, commitmentSettlementDeadline }))}
                showTime={false}
                triggerClassName="bg-muted"
              />

              <ShamsiDateTimeField
                id="commercial-order-registration-expiry"
                label="تاریخ انقضای ثبت سفارش"
                value={formData.orderRegistrationExpiryDate}
                onChange={(orderRegistrationExpiryDate) => setFormData((current) => ({ ...current, orderRegistrationExpiryDate }))}
                showTime={false}
                triggerClassName="bg-muted"
              />
              <div className="space-y-1.5">
                <Label htmlFor="commercial-tariff-code" className="text-xs font-bold text-muted-foreground">تعرفه</Label>
                <Input
                  id="commercial-tariff-code"
                  data-testid="commercial-tariff-code"
                  value={formData.tariffCode}
                  onChange={(event) => setFormData((current) => ({ ...current, tariffCode: event.target.value }))}
                  className="h-10 rounded-xl border-border bg-muted text-left text-xs font-bold"
                  dir="ltr"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="commercial-goods-description" className="text-xs font-bold text-muted-foreground">کالا</Label>
                <Input
                  id="commercial-goods-description"
                  data-testid="commercial-goods-description"
                  value={formData.goodsDescription}
                  onChange={(event) => setFormData((current) => ({ ...current, goodsDescription: event.target.value }))}
                  placeholder="نام یا شرح کالا / محصول"
                  className="h-10 rounded-xl border-border bg-muted text-xs font-bold"
                />
              </div>
            </div>
          </div>

          <ContactManager
            title="شماره‌ها و مخاطبین تکمیلی"
            contacts={formData.contacts}
            draft={commercialContactDraft}
            editingContactId={editingCommercialContactId}
            testPrefix="commercial-card"
            onDraftChange={setCommercialContactDraft}
            onSaveDraft={handleSaveCommercialContact}
            onEditContact={(contact) => {
              setCommercialContactDraft(contactDraftFromContact(contact));
              setEditingCommercialContactId(contact.id);
            }}
            onRemoveContact={(contactId) => {
              setFormData((current) => ({ ...current, contacts: current.contacts.filter((contact) => contact.id !== contactId) }));
              if (editingCommercialContactId === contactId) {
                setEditingCommercialContactId(null);
                setCommercialContactDraft(emptyContactForm);
              }
            }}
          />

          <div className="rounded-xl border border-border bg-muted/25 p-3">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-black text-foreground">اسناد مرتبط</h3>
              </div>
              <Badge variant="outline" className="w-fit rounded-full border-border bg-background px-3 text-[11px] font-black">
                {toPersianDigits(formData.documents.length)} سند
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="commercial-document-title" className="text-xs font-bold text-muted-foreground">عنوان سند</Label>
                <Input
                  id="commercial-document-title"
                  value={documentDraft.title}
                  onChange={(event) => setDocumentDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="تصویر کارت بازرگانی"
                  className="h-10 rounded-xl border-border bg-background text-xs font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="commercial-document-file" className="text-xs font-bold text-muted-foreground">فایل سند</Label>
                <Input
                  ref={fileInputRef}
                  id="commercial-document-file"
                  type="file"
                  onChange={(event) => setDocumentDraft((current) => ({ ...current, file: event.target.files?.[0] || null }))}
                  className="h-10 rounded-xl border-border bg-background text-xs font-bold"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="commercial-document-description" className="text-xs font-bold text-muted-foreground">توضیحات اختیاری</Label>
                <Input
                  id="commercial-document-description"
                  value={documentDraft.description}
                  onChange={(event) => setDocumentDraft((current) => ({ ...current, description: event.target.value }))}
                  placeholder="نامه تمدید، رسید پرداخت، مدارک هویتی یا سایر مدارک"
                  className="h-10 rounded-xl border-border bg-background text-xs font-bold"
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="button" variant="outline" className="h-10 w-full rounded-xl text-xs font-black" onClick={handleAddDocument}>
                  <Upload className="h-4 w-4" />
                  افزودن سند
                </Button>
              </div>
            </div>

            {formData.documents.length > 0 ? (
              <div className="mt-3 space-y-2">
                {formData.documents.map((document) => (
                  <div key={document.id} className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="truncate text-xs font-black text-foreground">{document.title}</span>
                      </div>
                      <p className="mt-1 text-[11px] font-bold text-muted-foreground">
                        {document.fileName || "فایل انتخاب نشده"} {document.fileSize ? `- ${document.fileSize}` : ""} - {formatUploadDate(document.uploadedAt)}
                      </p>
                      {document.description ? <p className="mt-1 text-[11px] font-bold text-muted-foreground">{document.description}</p> : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-lg text-xs font-black text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleRemoveDocument(document.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      حذف سند
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="button" variant="ghost" className="h-10 rounded-xl text-xs font-black text-muted-foreground" onClick={() => setIsFormOpen(false)} disabled={isSavingCommercialCard}>
              انصراف
            </Button>
            <Button type="button" data-testid="commercial-card-submit" className="h-10 rounded-xl bg-primary text-xs font-black text-primary-foreground hover:bg-primary/90" onClick={() => void handleSaveCard()} disabled={isSavingCommercialCard}>
              {isSavingCommercialCard ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  در حال ذخیره...
                </>
              ) : "ذخیره"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isMalvaniFormOpen}
        onOpenChange={(open) => {
          setIsMalvaniFormOpen(open);
          if (!open) resetMalvaniForm();
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-xl border-border bg-card text-right text-foreground sm:max-w-3xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-black">
              <Anchor className="h-5 w-5 text-primary" />
              {editingMalvaniProfile ? "ویرایش ملوانی" : "افزودن ملوانی"}
            </DialogTitle>
            <DialogDescription className="text-right text-xs font-bold leading-6 text-muted-foreground">
              اطلاعات لنج و ناخدا
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="malvani-display-name" className="text-xs font-bold text-muted-foreground">نام نمایشی</Label>
              <Input
                id="malvani-display-name"
                data-testid="malvani-display-name"
                value={malvaniFormData.displayName}
                onChange={(event) => setMalvaniFormData((current) => ({ ...current, displayName: event.target.value }))}
                className="h-10 rounded-xl border-border bg-muted text-xs font-bold"
              />
              <FieldError message={malvaniFormErrors.displayName} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="malvani-captain-name" className="text-xs font-bold text-muted-foreground">نام ناخدا</Label>
              <Input
                id="malvani-captain-name"
                data-testid="malvani-captain-name"
                value={malvaniFormData.captainName}
                onChange={(event) => setMalvaniFormData((current) => ({ ...current, captainName: event.target.value }))}
                className="h-10 rounded-xl border-border bg-muted text-xs font-bold"
              />
              <FieldError message={malvaniFormErrors.captainName} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="malvani-lenj-name" className="text-xs font-bold text-muted-foreground">نام لنج</Label>
              <Input
                id="malvani-lenj-name"
                data-testid="malvani-lenj-name"
                value={malvaniFormData.lenjName}
                onChange={(event) => setMalvaniFormData((current) => ({ ...current, lenjName: event.target.value }))}
                className="h-10 rounded-xl border-border bg-muted text-xs font-bold"
              />
              <FieldError message={malvaniFormErrors.lenjName} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="malvani-lenj-registration" className="text-xs font-bold text-muted-foreground">شماره/شناسه لنج</Label>
              <Input
                id="malvani-lenj-registration"
                data-testid="malvani-lenj-registration"
                value={malvaniFormData.lenjRegistrationNumber}
                onChange={(event) => setMalvaniFormData((current) => ({ ...current, lenjRegistrationNumber: event.target.value }))}
                className="h-10 rounded-xl border-border bg-muted text-left text-xs font-bold"
                dir="ltr"
              />
              <FieldError message={malvaniFormErrors.lenjRegistrationNumber} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="malvani-lenj-type" className="text-xs font-bold text-muted-foreground">نوع لنج</Label>
              <Input
                id="malvani-lenj-type"
                data-testid="malvani-lenj-type"
                value={malvaniFormData.lenjType}
                onChange={(event) => setMalvaniFormData((current) => ({ ...current, lenjType: event.target.value }))}
                className="h-10 rounded-xl border-border bg-muted text-xs font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="malvani-home-port" className="text-xs font-bold text-muted-foreground">بندر اصلی</Label>
              <Input
                id="malvani-home-port"
                data-testid="malvani-home-port"
                value={malvaniFormData.homePort}
                onChange={(event) => setMalvaniFormData((current) => ({ ...current, homePort: event.target.value }))}
                className="h-10 rounded-xl border-border bg-muted text-xs font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="malvani-active-status" className="text-xs font-bold text-muted-foreground">وضعیت</Label>
              <select
                id="malvani-active-status"
                data-testid="malvani-active-status"
                value={malvaniFormData.activeStatus}
                onChange={(event) => setMalvaniFormData((current) => ({ ...current, activeStatus: event.target.value as MalvaniActiveStatus }))}
                className="h-10 w-full rounded-xl border border-border bg-muted px-3 text-xs font-bold text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-primary/20"
              >
                {activeStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="malvani-note" className="text-xs font-bold text-muted-foreground">یادداشت</Label>
              <textarea
                id="malvani-note"
                data-testid="malvani-note"
                value={malvaniFormData.note}
                onChange={(event) => setMalvaniFormData((current) => ({ ...current, note: event.target.value }))}
                className="min-h-24 w-full rounded-xl border border-border bg-muted px-3 py-2 text-xs font-bold text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-primary/20"
              />
            </div>
          </div>

          <ContactManager
            title="شماره‌ها و مخاطبین تکمیلی"
            contacts={malvaniFormData.contacts}
            draft={malvaniContactDraft}
            editingContactId={editingMalvaniContactId}
            testPrefix="malvani"
            onDraftChange={setMalvaniContactDraft}
            onSaveDraft={handleSaveMalvaniContact}
            onEditContact={(contact) => {
              setMalvaniContactDraft(contactDraftFromContact(contact));
              setEditingMalvaniContactId(contact.id);
            }}
            onRemoveContact={(contactId) => {
              setMalvaniFormData((current) => ({ ...current, contacts: current.contacts.filter((contact) => contact.id !== contactId) }));
              if (editingMalvaniContactId === contactId) {
                setEditingMalvaniContactId(null);
                setMalvaniContactDraft(emptyContactForm);
              }
            }}
          />

          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="button" variant="ghost" className="h-10 rounded-xl text-xs font-black text-muted-foreground" onClick={() => setIsMalvaniFormOpen(false)} disabled={isSavingMalvani}>
              انصراف
            </Button>
            <Button type="button" data-testid="malvani-submit" className="h-10 rounded-xl bg-primary text-xs font-black text-primary-foreground hover:bg-primary/90" onClick={handleSaveMalvaniProfile} disabled={isSavingMalvani}>
              {isSavingMalvani ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewingCard)} onOpenChange={(open) => !open && setViewingCard(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-xl border-border bg-card text-right text-foreground sm:max-w-3xl" dir="rtl">
          {viewingCard ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg font-black">
                  <IdCard className="h-5 w-5 text-primary" />
                  {viewingCard.holderName}
                </DialogTitle>
                <DialogDescription className="text-right text-xs font-bold text-muted-foreground">
                  جزئیات کارت بازرگانی
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["شماره کارت بازرگانی", viewingCard.cardNumber],
                  ["تاریخ انقضا", formatShamsiDate(viewingCard.expirationDate)],
                  ["کد ملی / شناسه ملی", viewingCard.nationalId || "ثبت نشده"],
                  ["نام شخص مسئول", viewingCard.responsibleName || "ثبت نشده"],
                  ["شماره تماس مسئول", viewingCard.responsiblePhone || "ثبت نشده"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-border bg-muted/30 p-3">
                    <p className="text-[10px] font-black text-muted-foreground">{label}</p>
                    <p className="mt-1 break-words text-xs font-black text-foreground">{value}</p>
                  </div>
                ))}
                <div className="rounded-xl border border-border bg-muted/30 p-3 sm:col-span-2">
                  <p className="text-[10px] font-black text-muted-foreground">وضعیت</p>
                  <div className="mt-2">
                    <StatusBadge status={getCommercialCardStatus(viewingCard.expirationDate)} />
                  </div>
                </div>
                {viewingCard.description ? (
                  <div className="rounded-xl border border-border bg-muted/30 p-3 sm:col-span-2">
                    <p className="text-[10px] font-black text-muted-foreground">توضیحات</p>
                    <p className="mt-1 text-xs font-bold leading-6 text-foreground">{viewingCard.description}</p>
                  </div>
                ) : null}
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <div className="mb-3 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
                  <h3 className="text-sm font-black text-foreground">اطلاعات بازرگانی و تعهدات</h3>
                </div>
                <CommercialCardOperationalGrid card={viewingCard} />
              </div>
              <div className="rounded-xl border border-border bg-muted/25 p-3">
                <div className="mb-3 flex items-center gap-2">
                  <Phone className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-black text-foreground">شماره‌ها و مخاطبین تکمیلی</h3>
                </div>
                <ContactList contacts={(viewingCard.contacts || []).filter((contact) => !contact.archivedAt)} />
              </div>
              <div className="rounded-xl border border-border bg-muted/25 p-3">
                <div className="mb-3 flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-black text-foreground">اسناد پیوست‌شده</h3>
                </div>
                {viewingCard.documents?.length ? (
                  <div className="space-y-2">
                    {viewingCard.documents.map((document) => (
                      <div key={document.id} className="rounded-xl border border-border bg-background p-3">
                        <p className="text-xs font-black text-foreground">{document.title}</p>
                        <p className="mt-1 text-[11px] font-bold text-muted-foreground">
                          {document.fileName || "فایل انتخاب نشده"} {document.fileSize ? `- ${document.fileSize}` : ""} - {formatUploadDate(document.uploadedAt)}
                        </p>
                        {document.description ? <p className="mt-1 text-[11px] font-bold text-muted-foreground">{document.description}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-border bg-background p-4 text-center text-xs font-bold text-muted-foreground">
                    هیچ سندی برای این کارت ثبت نشده است.
                  </p>
                )}
              </div>
              <DialogFooter className="gap-2 sm:justify-start">
                <Button type="button" variant="outline" className="h-10 rounded-xl text-xs font-black" onClick={() => setViewingCard(null)}>
                  انصراف
                </Button>
                <Button type="button" className="h-10 rounded-xl text-xs font-black" onClick={() => {
                  const card = viewingCard;
                  setViewingCard(null);
                  openEditDialog(card);
                }}>
                  <Pencil className="h-4 w-4" />
                  ویرایش
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewingMalvaniProfile)} onOpenChange={(open) => !open && setViewingMalvaniProfile(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-xl border-border bg-card text-right text-foreground sm:max-w-2xl" dir="rtl">
          {viewingMalvaniProfile ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg font-black">
                  <Anchor className="h-5 w-5 text-primary" />
                  {viewingMalvaniProfile.displayName}
                </DialogTitle>
                <DialogDescription className="text-right text-xs font-bold text-muted-foreground">
                  پروفایل ملوانی
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["نام ناخدا", viewingMalvaniProfile.captainName],
                  ["نام لنج", viewingMalvaniProfile.lenjName],
                  ["شماره/شناسه لنج", viewingMalvaniProfile.lenjRegistrationNumber],
                  ["نوع لنج", viewingMalvaniProfile.lenjType || "ثبت نشده"],
                  ["بندر اصلی", viewingMalvaniProfile.homePort || "ثبت نشده"],
                  ["آخرین بروزرسانی", formatIsoDate(viewingMalvaniProfile.updatedAt)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-border bg-muted/30 p-3">
                    <p className="text-[10px] font-black text-muted-foreground">{label}</p>
                    <p className="mt-1 break-words text-xs font-black text-foreground">{value}</p>
                  </div>
                ))}
                <div className="rounded-xl border border-border bg-muted/30 p-3 sm:col-span-2">
                  <p className="text-[10px] font-black text-muted-foreground">وضعیت</p>
                  <div className="mt-2">
                    <MalvaniStatusBadge status={viewingMalvaniProfile.activeStatus} />
                  </div>
                </div>
                {viewingMalvaniProfile.note ? (
                  <div className="rounded-xl border border-border bg-muted/30 p-3 sm:col-span-2">
                    <p className="text-[10px] font-black text-muted-foreground">یادداشت</p>
                    <p className="mt-1 text-xs font-bold leading-6 text-foreground">{viewingMalvaniProfile.note}</p>
                  </div>
                ) : null}
              </div>
              <div className="rounded-xl border border-border bg-muted/25 p-3">
                <div className="mb-3 flex items-center gap-2">
                  <Phone className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-black text-foreground">شماره‌ها و مخاطبین تکمیلی</h3>
                </div>
                <ContactList contacts={viewingMalvaniProfile.contacts || []} />
              </div>
              <DialogFooter className="gap-2 sm:justify-start">
                <Button type="button" variant="outline" className="h-10 rounded-xl text-xs font-black" onClick={() => setViewingMalvaniProfile(null)}>
                  انصراف
                </Button>
                <Button type="button" className="h-10 rounded-xl text-xs font-black" onClick={() => {
                  const profile = viewingMalvaniProfile;
                  setViewingMalvaniProfile(null);
                  openEditMalvaniDialog(profile);
                }}>
                  <Pencil className="h-4 w-4" />
                  ویرایش
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        isOpen={Boolean(cardToDelete)}
        onClose={() => setCardToDelete(null)}
        onConfirm={async () => {
          if (!cardToDelete) return;
          await deleteCommercialCard(cardToDelete.id);
          toast.success("کارت بازرگانی غیرفعال شد.");
        }}
        title="غیرفعال‌سازی کارت بازرگانی"
        description="این کارت از فهرست فعال حذف می‌شود اما داده آن برای سابقه عملیاتی نگهداری می‌شود."
        itemName={selectedDeleteName}
        confirmLabel="غیرفعال‌سازی"
        pendingLabel="در حال غیرفعال‌سازی..."
      />

      <DeleteConfirmDialog
        isOpen={Boolean(profileToArchive)}
        onClose={() => setProfileToArchive(null)}
        onConfirm={async () => {
          if (!profileToArchive) return;
          const archived = await businessEntitiesApi.archiveMalvaniProfile(profileToArchive.id);
          toast.success("پروفایل ملوانی غیرفعال شد.");
          setMalvaniProfiles((current) => current.filter((profile) => profile.id !== archived.id));
          setProfileToArchive(null);
          if (viewingMalvaniProfile?.id === archived.id) setViewingMalvaniProfile(null);
        }}
        title="غیرفعال‌سازی ملوانی"
        description="این پروفایل آرشیو می‌شود و از فهرست فعال نمایش داده نمی‌شود."
        itemName={profileToArchive?.displayName}
        confirmLabel="غیرفعال‌سازی"
        pendingLabel="در حال غیرفعال‌سازی..."
      />
    </div>
  );
}
