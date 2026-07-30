import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  Circle,
  Download,
  Eye,
  FileIcon,
  Forward,
  ExternalLink,
  Image as ImageIcon,
  Link2,
  Loader2,
  MessageSquare,
  Mic,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings,
  Ship,
  Square,
  Trash2,
  Unlink,
  Users,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DeleteConfirmDialog } from "@/src/components/DeleteConfirmDialog";
import { EmptyState } from "@/src/components/EmptyState";
import { useAppStore } from "@/src/store/useAppStore";
import { PushNotificationControls } from "@/src/components/notifications/PushNotificationControls";

type ChatParticipant = {
  id: string;
  userId: string;
  name: string;
  displayName: string;
  email: string;
  role: string;
  roleName: string;
  avatar?: string;
  isOnline?: boolean;
  memberRole?: "owner" | "admin" | "member";
};

type ChatAttachment = {
  id: string;
  messageId: string;
  threadId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  fileSize: string;
  attachmentType: "image" | "document" | "audio";
  createdAt: string;
  deletedAt?: string | null;
  deletedReason?: string | null;
  downloadUrl?: string;
  previewUrl?: string;
};

type ChatMessage = {
  id: string;
  threadId: string;
  originThreadId?: string;
  senderId: string;
  senderName: string;
  body?: string;
  content?: string;
  clientMessageId?: string;
  attachments?: ChatAttachment[];
  shipmentMentions?: Array<{
    shipmentId: string;
    shipmentThreadId: string;
    shipmentCode: string;
    detailUrl?: string;
  }>;
  forwardedFrom?: {
    threadId: string;
    threadName: string;
    canOpenThread?: boolean;
  };
  forwardedTo?: {
    threadId: string;
    shipmentId?: string;
    shipmentCode: string;
    customerName?: string;
    shipmentStatus?: string;
    detailUrl?: string;
  };
  seenBy?: Array<{
    userId: string;
    name: string;
    avatar?: string;
    readAt: string;
  }>;
  createdAt: string;
};

type ActiveShipmentBridge = {
  id: string;
  groupThreadId: string;
  shipmentThreadId: string;
  shipmentId: string;
  shipmentCode: string;
  customerName?: string;
  shipmentStatus?: string;
  activatedById?: string | null;
  activatedByName?: string;
  activatedAt: string;
  canOpenShipment?: boolean;
};

type ChatShipmentOption = {
  id: string;
  code: string;
  customerName?: string;
  status?: string;
  detailUrl: string;
};

type SelectedAttachment = {
  id: string;
  file: File;
  previewUrl?: string;
  voiceDurationSeconds?: number;
};

type ChatThread = {
  id: string;
  type: "DM" | "GROUP" | "SHIPMENT";
  threadType?: string;
  name: string;
  description?: string;
  shipmentId?: string;
  shipmentCode?: string;
  shipmentStatus?: string;
  customerName?: string;
  shipmentDetailUrl?: string;
  shipment?: {
    id: string;
    code: string;
    status?: string;
    customerName?: string;
    detailUrl?: string;
  };
  unreadCount?: number;
  lastReadAt?: string | null;
  activeShipmentBridge?: ActiveShipmentBridge;
  members: ChatParticipant[];
  lastMessage?: ChatMessage | null;
  createdAt: string;
  updatedAt: string;
};

type ApiPayload<T> = {
  ok?: boolean;
  data?: T;
  error?: { code?: string; message?: string; retryAfterMs?: number };
};

type ChatRequestError = Error & {
  code?: string;
  retryAfterMs?: number;
};

type ChatCategory = "ALL" | "UNREAD" | ChatThread["type"];

const CHAT_MESSAGE_MAX_LENGTH = 3000;
const CHAT_MESSAGE_PAGE_SIZE = 20;
const CHAT_HISTORY_TOP_THRESHOLD_PX = 48;
const CHAT_BOTTOM_THRESHOLD_PX = 96;
const CHAT_TYPING_THROTTLE_MS = 2000;
const CHAT_RATE_LIMITED_MESSAGE = "تعداد پیام‌ها زیاد است. لطفاً چند لحظه صبر کنید.";
const CHAT_SEND_FAILED_MESSAGE = "پیام ارسال نشد. لطفاً دوباره تلاش کنید.";
const CHAT_FILE_DELETED_MESSAGE = "این فایل حذف شده است";
const CHAT_FILE_MANAGER_DELETED_MESSAGE = "فایل توسط مدیر حذف شده است";
const CHAT_FILE_TYPE_ERROR = "فرمت فایل مجاز نیست";
const CHAT_FILE_SIZE_ERROR = "حجم فایل بیش از حد مجاز است";
const CHAT_ATTACHMENT_ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.txt,.csv,.webm,.ogg,.m4a";
const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const CHAT_AUDIO_MAX_BYTES = 10 * 1024 * 1024;
const CHAT_FILE_MAX_BYTES = 15 * 1024 * 1024;
const CHAT_BATCH_MAX_BYTES = 40 * 1024 * 1024;
const CHAT_BATCH_MAX_FILES = 5;
const CHAT_VOICE_MAX_SECONDS = 5 * 60;
const CHAT_VOICE_UNSUPPORTED_MESSAGE = "مرورگر شما از ضبط پیام صوتی پشتیبانی نمی‌کند.";
const CHAT_VOICE_PERMISSION_MESSAGE = "دسترسی میکروفن داده نشد. لطفاً مجوز میکروفن را بررسی کنید.";
const CHAT_VOICE_EMPTY_MESSAGE = "پیام صوتی ضبط نشد. لطفاً دوباره تلاش کنید.";
const CHAT_VOICE_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg", "audio/mp4"];
const CHAT_CATEGORIES: Array<{ type: ChatCategory; label: string; shortLabel: string }> = [
  { type: "ALL", label: "همه گفتگوها", shortLabel: "همه" },
  { type: "UNREAD", label: "خوانده‌نشده‌ها", shortLabel: "نخوانده" },
  { type: "DM", label: "پیام‌های مستقیم", shortLabel: "مستقیم" },
  { type: "GROUP", label: "گروه‌ها", shortLabel: "گروه" },
  { type: "SHIPMENT", label: "محموله‌ها", shortLabel: "محموله" },
];

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as ApiPayload<T>;
  if (!response.ok || !payload.ok) {
    const error = new Error(payload.error?.message || "Chat request failed.") as ChatRequestError;
    error.code = payload.error?.code;
    error.retryAfterMs = payload.error?.retryAfterMs;
    throw error;
  }
  return payload.data as T;
}

async function apiFormData<T>(url: string, body: FormData): Promise<T> {
  const response = await fetch(url, { method: "POST", body });
  const payload = (await response.json().catch(() => ({}))) as ApiPayload<T>;
  if (!response.ok || !payload.ok) {
    const error = new Error(payload.error?.message || "Chat upload failed.") as ChatRequestError;
    error.code = payload.error?.code;
    error.retryAfterMs = payload.error?.retryAfterMs;
    throw error;
  }
  return payload.data as T;
}

function displayNameForThread(thread: ChatThread | null, currentUserId?: string) {
  if (!thread) return "";
  if (thread.type === "SHIPMENT") {
    return `محموله ${thread.shipmentCode || thread.shipment?.code || thread.name || thread.id}`;
  }
  if (thread.type === "DM") {
    const other = thread.members.find((member) => member.userId !== currentUserId);
    return other?.displayName || thread.name || "گفتگوی مستقیم";
  }
  return thread.name || "گروه";
}

function initials(name = "U") {
  return name.trim().slice(0, 2).toUpperCase() || "U";
}

function messageText(message: ChatMessage) {
  return message.body || message.content || "";
}

function messagePreviewText(message?: ChatMessage | null) {
  if (!message) return "";
  const body = messageText(message);
  if (body) return body;
  const firstAttachment = message.attachments?.[0];
  if (!firstAttachment) return "";
  if (firstAttachment.attachmentType === "image") return "تصویر";
  if (firstAttachment.attachmentType === "audio") return "پیام صوتی";
  return firstAttachment.filename || "فایل";
}

function voiceFileExtension(mimeType = "") {
  if (mimeType.startsWith("audio/mp4")) return "m4a";
  if (mimeType.startsWith("audio/ogg")) return "ogg";
  return "webm";
}

function recordingTimestamp(seconds = 0) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function attachmentDeletedLabel(attachment: ChatAttachment) {
  return attachment.deletedReason === "deleted_by_manager"
    ? CHAT_FILE_MANAGER_DELETED_MESSAGE
    : CHAT_FILE_DELETED_MESSAGE;
}

function validateAttachmentFile(file: File) {
  const extension = `.${file.name.split(".").pop() || ""}`.toLowerCase();
  const isImage = [".jpg", ".jpeg", ".png", ".webp"].includes(extension);
  const isAudio = [".webm", ".ogg", ".m4a"].includes(extension);
  const isDocument = [".pdf", ".docx", ".xlsx", ".txt", ".csv"].includes(extension);
  if (!isImage && !isAudio && !isDocument) return CHAT_FILE_TYPE_ERROR;
  if (isImage && file.size > CHAT_IMAGE_MAX_BYTES) return CHAT_FILE_SIZE_ERROR;
  if (isAudio && file.size > CHAT_AUDIO_MAX_BYTES) return CHAT_FILE_SIZE_ERROR;
  if (file.size > CHAT_FILE_MAX_BYTES) return CHAT_FILE_SIZE_ERROR;
  return "";
}

function normalizeChatDigits(value = "") {
  return String(value)
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

function shipmentMentionToken(value: string, caret = value.length) {
  const beforeCaret = value.slice(0, caret);
  const match = beforeCaret.match(/(?:^|\s)@([0-9۰-۹٠-٩]{0,11})$/u);
  if (!match) return null;
  const atIndex = beforeCaret.lastIndexOf("@");
  return {
    start: atIndex,
    end: caret,
    query: normalizeChatDigits(match[1] || ""),
  };
}

function subtitleForThread(thread: ChatThread) {
  if (thread.type === "SHIPMENT") {
    if (thread.lastMessage) return messagePreviewText(thread.lastMessage);
    return [thread.customerName || thread.shipment?.customerName, thread.shipmentStatus || thread.shipment?.status]
      .filter(Boolean)
      .join(" · ") || "گفتگوی داخلی محموله";
  }
  return thread.lastMessage ? messagePreviewText(thread.lastMessage) : "هنوز پیامی ثبت نشده";
}

const MESSAGE_DATE_FORMATTER = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const MESSAGE_TIME_FORMATTER = new Intl.DateTimeFormat("fa-IR", {
  hour: "2-digit",
  minute: "2-digit",
});

function messageTimestamp(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${MESSAGE_DATE_FORMATTER.format(date)}، ${MESSAGE_TIME_FORMATTER.format(date)}`;
}

function messageTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : MESSAGE_TIME_FORMATTER.format(date);
}

function messageDateKey(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function conversationTimestamp(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  if (messageDateKey(value) === messageDateKey(today.toISOString())) return MESSAGE_TIME_FORMATTER.format(date);
  return MESSAGE_DATE_FORMATTER.format(date);
}

export default function Chat() {
  const currentUser = useAppStore((state) => state.currentUser);
  const receiveNotification = useAppStore((state) => state.receiveNotification);
  const canManageGroups = Boolean(currentUser?.permissions?.includes("chat.manage_groups"));
  const canDeleteMedia = Boolean(currentUser?.permissions?.includes("chat.media.delete"));
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeThreadId, setActiveThreadId] = useState(() => new URLSearchParams(window.location.search).get("threadId") || "");
  const [activeCategory, setActiveCategory] = useState<ChatCategory>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [selectedAttachments, setSelectedAttachments] = useState<SelectedAttachment[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [shipmentOptions, setShipmentOptions] = useState<ChatShipmentOption[]>([]);
  const [isShipmentSuggestionOpen, setIsShipmentSuggestionOpen] = useState(false);
  const [shipmentSuggestionIndex, setShipmentSuggestionIndex] = useState(0);
  const [openSeenMessageId, setOpenSeenMessageId] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sendLockedUntil, setSendLockedUntil] = useState(0);
  const [error, setError] = useState("");
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [isGroupPanelOpen, setIsGroupPanelOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupParticipantIds, setGroupParticipantIds] = useState<string[]>([]);
  const [isGroupSettingsOpen, setIsGroupSettingsOpen] = useState(false);
  const [groupMemberSearch, setGroupMemberSearch] = useState("");
  const [addingGroupMemberId, setAddingGroupMemberId] = useState("");
  const [groupToArchive, setGroupToArchive] = useState<ChatThread | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<ChatAttachment | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState("");
  const [isActiveContextReady, setIsActiveContextReady] = useState(false);
  const [showPushSetup, setShowPushSetup] = useState(
    () => window.localStorage.getItem("logisticplus.chat.push-setup.dismissed") !== "true"
  );
  const wsRef = useRef<WebSocket | null>(null);
  const activeThreadIdRef = useRef(activeThreadId);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const dragDepthRef = useRef(0);
  const readMarkRef = useRef("");
  const selectedAttachmentsRef = useRef<SelectedAttachment[]>([]);
  const pendingSendIdRef = useRef<string | null>(null);
  const sendTimeoutRef = useRef<number | null>(null);
  const lastTypingSentAtRef = useRef(0);
  const typingStopTimerRef = useRef<number | null>(null);
  const historyLoadingRef = useRef(false);
  const historyScrollRestoreRef = useRef<{
    previousHeight: number;
    previousTop: number;
    mode: "prepend" | "preserve";
  } | null>(null);
  const initialBottomScrollTimersRef = useRef<number[]>([]);
  const latestMessageBatchRef = useRef<{ length: number; lastMessageId: string }>({ length: 0, lastMessageId: "" });
  const pendingBottomScrollRef = useRef<ScrollBehavior | null>(null);
  const initialBottomScrolledThreadRef = useRef("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingSecondsRef = useRef(0);
  const recordingCancelledRef = useRef(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) || null,
    [activeThreadId, threads]
  );

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    selectedAttachmentsRef.current = selectedAttachments;
  }, [selectedAttachments]);

  useEffect(() => () => {
    selectedAttachmentsRef.current.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
  }, []);

  useEffect(() => {
    return () => {
      recordingCancelledRef.current = true;
      if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    setIsGroupSettingsOpen(false);
    setGroupMemberSearch("");
    selectedAttachmentsRef.current.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    setSelectedAttachments([]);
    setShipmentOptions([]);
    setIsShipmentSuggestionOpen(false);
    setOpenSeenMessageId("");
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    setRecordingSeconds(0);
    recordingSecondsRef.current = 0;
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (mediaRecorderRef.current?.state === "recording") {
      recordingCancelledRef.current = true;
      mediaRecorderRef.current.stop();
    }
  }, [activeThreadId]);

  useEffect(() => {
    if (!sendLockedUntil) return;
    const delay = Math.max(0, sendLockedUntil - Date.now());
    const timer = window.setTimeout(() => setSendLockedUntil(0), delay);
    return () => window.clearTimeout(timer);
  }, [sendLockedUntil]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setTypingUsers((items) => {
        const entries = Object.entries(items) as [string, number][];
        const next = Object.fromEntries(entries.filter(([, expiresAt]) => expiresAt > now)) as Record<string, number>;
        return Object.keys(next).length === Object.keys(items).length ? items : next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const directThreadsByUserId = useMemo(() => {
    const map = new Map<string, ChatThread>();
    for (const thread of threads) {
      if (thread.type !== "DM") continue;
      const other = thread.members.find((member) => member.userId !== currentUser?.id);
      if (other) map.set(other.userId, thread);
    }
    return map;
  }, [currentUser?.id, threads]);

  const threadCountsByCategory = useMemo(() => {
    return CHAT_CATEGORIES.reduce<Record<ChatCategory, { total: number; unread: number }>>(
      (counts, category) => {
        const categoryThreads = threads.filter((thread) => {
          if (category.type === "ALL") return true;
          if (category.type === "UNREAD") return Number(thread.unreadCount || 0) > 0;
          return thread.type === category.type;
        });
        counts[category.type] = {
          total: categoryThreads.length,
          unread: categoryThreads.reduce((sum, thread) => sum + Number(thread.unreadCount || 0), 0),
        };
        return counts;
      },
      {
        ALL: { total: 0, unread: 0 },
        UNREAD: { total: 0, unread: 0 },
        DM: { total: 0, unread: 0 },
        GROUP: { total: 0, unread: 0 },
        SHIPMENT: { total: 0, unread: 0 },
      }
    );
  }, [threads]);

  const filteredThreads = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return threads.filter((thread) => {
      if (activeCategory === "UNREAD" && Number(thread.unreadCount || 0) <= 0) return false;
      if (activeCategory !== "ALL" && activeCategory !== "UNREAD" && thread.type !== activeCategory) return false;
      if (!query) return true;
      const title = displayNameForThread(thread, currentUser?.id).toLowerCase();
      const details = `${thread.shipmentCode || ""} ${thread.customerName || ""} ${thread.shipmentStatus || ""} ${messagePreviewText(thread.lastMessage)}`.toLowerCase();
      return title.includes(query) || details.includes(query);
    }).sort((left, right) => (
      new Date(right.lastMessage?.createdAt || right.updatedAt).getTime()
      - new Date(left.lastMessage?.createdAt || left.updatedAt).getTime()
    ));
  }, [activeCategory, currentUser?.id, searchTerm, threads]);

  const filteredParticipants = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return participants.filter((participant) => {
      if (participant.userId === currentUser?.id) return false;
      if (!query) return true;
      return `${participant.displayName} ${participant.email} ${participant.roleName}`.toLowerCase().includes(query);
    });
  }, [currentUser?.id, participants, searchTerm]);

  const availableGroupParticipants = useMemo(() => {
    if (activeThread?.type !== "GROUP") return [];
    const memberIds = new Set(activeThread.members.map((member) => member.userId));
    const query = groupMemberSearch.trim().toLowerCase();
    return participants.filter((participant) => {
      if (memberIds.has(participant.userId)) return false;
      if (!query) return true;
      return `${participant.displayName} ${participant.email} ${participant.roleName}`.toLowerCase().includes(query);
    });
  }, [activeThread, groupMemberSearch, participants]);

  const isSendLocked = sendLockedUntil > Date.now();

  const activeTypingNames = useMemo(() => {
    const now = Date.now();
    return (Object.entries(typingUsers) as [string, number][])
      .filter(([key, expiresAt]) => key.startsWith(`${activeThreadId}:`) && expiresAt > now)
      .map(([key]) => key.slice(activeThreadId.length + 1))
      .filter((userId) => userId !== currentUser?.id)
      .map((userId) => participants.find((participant) => participant.userId === userId)?.displayName || "همکار")
      .slice(0, 2);
  }, [activeThreadId, currentUser?.id, participants, typingUsers]);

  const loadThreads = async () => {
    const data = await apiJson<ChatThread[]>("/api/chat/threads");
    const nextThreads = data || [];
    setThreads(nextThreads);
    const currentId = activeThreadIdRef.current;
    if (currentId && nextThreads.some((thread) => thread.id === currentId)) return;
    const fallbackId = nextThreads[0]?.id || "";
    activeThreadIdRef.current = fallbackId;
    setActiveThreadId(fallbackId);
    setMessages([]);
    window.history.replaceState(null, "", fallbackId ? `/chat?threadId=${encodeURIComponent(fallbackId)}` : "/chat");
  };

  const loadParticipants = async () => {
    const data = await apiJson<ChatParticipant[]>("/api/chat/participants?limit=100");
    setParticipants(data || []);
  };

  const loadMessages = async (threadId: string, options: { before?: string; mode?: "initial" | "history" } = {}) => {
    if (!threadId) {
      setMessages([]);
      setHasMoreMessages(false);
      return;
    }
    const params = new URLSearchParams({ limit: String(CHAT_MESSAGE_PAGE_SIZE) });
    if (options.before) params.set("before", options.before);
    const data = await apiJson<ChatMessage[]>(
      `/api/chat/threads/${encodeURIComponent(threadId)}/messages?${params.toString()}`
    );
    if (activeThreadIdRef.current !== threadId) return data || [];
    const nextMessages = data || [];
    setHasMoreMessages(nextMessages.length === CHAT_MESSAGE_PAGE_SIZE);
    if (options.mode === "history") {
      setMessages((items) => {
        const existingIds = new Set(items.map((item) => item.id));
        const olderMessages = nextMessages.filter((message) => !existingIds.has(message.id));
        return olderMessages.length ? [...olderMessages, ...items] : items;
      });
      return nextMessages;
    }
    const thread = threads.find((item) => item.id === threadId);
    const readThrough = thread?.lastReadAt ? new Date(thread.lastReadAt).getTime() : 0;
    const unreadMessage = nextMessages.find((message) => (
      message.senderId !== currentUser?.id
      && new Date(message.createdAt).getTime() > readThrough
    ));
    setFirstUnreadMessageId(unreadMessage?.id || "");
    pendingBottomScrollRef.current = "auto";
    setMessages(nextMessages);
    return nextMessages;
  };

  const isMessageListNearBottom = () => {
    const list = messageListRef.current;
    if (!list) return true;
    return list.scrollHeight - list.scrollTop - list.clientHeight <= CHAT_BOTTOM_THRESHOLD_PX;
  };

  const scrollMessageListToBottom = (behavior: ScrollBehavior) => {
    const applyScroll = () => {
      const list = messageListRef.current;
      messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
      if (!list) return;
      if (behavior === "smooth") {
        list.scrollTo({ top: list.scrollHeight, behavior });
        return;
      }
      list.scrollTop = list.scrollHeight;
    };
    applyScroll();
    window.requestAnimationFrame(() => {
      applyScroll();
      window.requestAnimationFrame(applyScroll);
    });
  };

  const clearInitialBottomScrollTimers = () => {
    for (const timer of initialBottomScrollTimersRef.current) {
      window.clearTimeout(timer);
    }
    initialBottomScrollTimersRef.current = [];
  };

  const loadOlderMessages = async () => {
    const oldestMessage = messages[0];
    if (!activeThreadId || !oldestMessage || !hasMoreMessages || historyLoadingRef.current) return;
    clearInitialBottomScrollTimers();
    const list = messageListRef.current;
    historyScrollRestoreRef.current = list
      ? { previousHeight: list.scrollHeight, previousTop: list.scrollTop, mode: "prepend" }
      : null;
    historyLoadingRef.current = true;
    try {
      const olderMessages = await loadMessages(activeThreadId, { before: oldestMessage.id, mode: "history" });
      if (!olderMessages?.length) {
        historyScrollRestoreRef.current = null;
      }
    } catch (nextError: any) {
      historyScrollRestoreRef.current = null;
      setError(nextError?.message || "خطا در بارگذاری پیام‌های قبلی");
    } finally {
      historyLoadingRef.current = false;
    }
  };

  const handleMessageListScroll = () => {
    const list = messageListRef.current;
    if (!list) return;
    const nearBottom = isMessageListNearBottom();
    setShowJumpToLatest(!nearBottom && list.scrollHeight > list.clientHeight);
    if (list.scrollHeight <= list.clientHeight) return;
    if (list.scrollTop <= CHAT_HISTORY_TOP_THRESHOLD_PX) {
      void loadOlderMessages();
    }
    if (nearBottom) {
      window.requestAnimationFrame(() => maybeMarkActiveThreadRead());
    }
  };

  const sendSocketEvent = (event: unknown) => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(event));
  };

  const clearSendTimeout = () => {
    if (sendTimeoutRef.current) {
      window.clearTimeout(sendTimeoutRef.current);
      sendTimeoutRef.current = null;
    }
  };

  const clearTypingStopTimer = () => {
    if (typingStopTimerRef.current) {
      window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
  };

  const applyChatError = (chatError?: { code?: string; message?: string; retryAfterMs?: number }) => {
    if (chatError?.code === "CHAT_RATE_LIMITED") {
      setError(CHAT_RATE_LIMITED_MESSAGE);
      const retryAfterMs = Math.max(250, Number(chatError.retryAfterMs || 0));
      setSendLockedUntil(Date.now() + retryAfterMs);
      return;
    }
    setError(chatError?.message || CHAT_SEND_FAILED_MESSAGE);
  };

  const sendTypingEvent = (type: "typing.start" | "typing.stop") => {
    const threadId = activeThreadIdRef.current;
    if (!threadId) return;
    sendSocketEvent({ type, payload: { threadId } });
  };

  const handleComposerChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setNewMessage(value);
    event.target.style.height = "0px";
    event.target.style.height = `${Math.min(event.target.scrollHeight, 128)}px`;
    if (!activeThreadIdRef.current || wsRef.current?.readyState !== WebSocket.OPEN) return;

    const now = Date.now();
    if (value.trim() && now - lastTypingSentAtRef.current >= CHAT_TYPING_THROTTLE_MS) {
      sendTypingEvent("typing.start");
      lastTypingSentAtRef.current = now;
    }
    clearTypingStopTimer();
    typingStopTimerRef.current = window.setTimeout(() => {
      sendTypingEvent("typing.stop");
    }, CHAT_TYPING_THROTTLE_MS);
  };

  const sendClientContext = () => {
    sendSocketEvent({
      type: "client.context",
      payload: {
        threadId: activeThreadIdRef.current || null,
        visibilityState: document.visibilityState === "visible" ? "visible" : "hidden",
        hasFocus: document.hasFocus(),
      },
    });
  };

  useEffect(() => {
    if (activeThread?.type !== "GROUP") {
      setShipmentOptions([]);
      setIsShipmentSuggestionOpen(false);
      return;
    }
    const token = shipmentMentionToken(newMessage, composerRef.current?.selectionStart ?? newMessage.length);
    if (!token) {
      setShipmentOptions([]);
      setIsShipmentSuggestionOpen(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      apiJson<ChatShipmentOption[]>(`/api/chat/shipment-options?q=${encodeURIComponent(token.query)}`)
        .then((options) => {
          if (cancelled) return;
          setShipmentOptions(options || []);
          setShipmentSuggestionIndex(0);
          setIsShipmentSuggestionOpen(true);
        })
        .catch(() => {
          if (!cancelled) {
            setShipmentOptions([]);
            setIsShipmentSuggestionOpen(false);
          }
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeThread?.type, newMessage]);

  const selectShipmentSuggestion = (option: ChatShipmentOption) => {
    const textarea = composerRef.current;
    const caret = textarea?.selectionStart ?? newMessage.length;
    const token = shipmentMentionToken(newMessage, caret);
    if (!token) return;
    const nextValue = `${newMessage.slice(0, token.start)}@${option.code} ${newMessage.slice(token.end)}`;
    setNewMessage(nextValue);
    setShipmentOptions([]);
    setIsShipmentSuggestionOpen(false);
    window.requestAnimationFrame(() => {
      const nextCaret = token.start + option.code.length + 2;
      textarea?.focus();
      textarea?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isShipmentSuggestionOpen && shipmentOptions.length) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setShipmentSuggestionIndex((index) => (index + 1) % shipmentOptions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setShipmentSuggestionIndex((index) => (index - 1 + shipmentOptions.length) % shipmentOptions.length);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setIsShipmentSuggestionOpen(false);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        selectShipmentSuggestion(shipmentOptions[shipmentSuggestionIndex]);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const markActiveThreadRead = async (threadId: string, messageId?: string) => {
    if (!threadId) return;
    const response = await fetch(`/api/chat/threads/${encodeURIComponent(threadId)}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    }).catch(() => null);
    if (!response?.ok) {
      readMarkRef.current = "";
      return;
    }
    setThreads((items) => items.map((thread) => (
      thread.id === threadId ? { ...thread, unreadCount: 0, lastReadAt: new Date().toISOString() } : thread
    )));
  };

  const maybeMarkActiveThreadRead = () => {
    const threadId = activeThreadIdRef.current;
    const lastMessage = latestMessageBatchRef.current.lastMessageId;
    if (!threadId || !lastMessage) return;
    if (document.visibilityState !== "visible" || !document.hasFocus() || !isMessageListNearBottom()) return;
    const key = `${threadId}:${lastMessage}`;
    if (readMarkRef.current === key) return;
    readMarkRef.current = key;
    void markActiveThreadRead(threadId, lastMessage);
  };

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    Promise.all([loadThreads(), loadParticipants()])
      .catch((nextError) => {
        if (!cancelled) setError(nextError.message || "خطا در بارگذاری چت");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    clearTypingStopTimer();
    lastTypingSentAtRef.current = 0;
    historyLoadingRef.current = false;
    historyScrollRestoreRef.current = null;
    clearInitialBottomScrollTimers();
    pendingBottomScrollRef.current = activeThreadId ? "auto" : null;
    initialBottomScrolledThreadRef.current = "";
    setShowJumpToLatest(false);
    setFirstUnreadMessageId("");
    setIsActiveContextReady(false);
    setHasMoreMessages(false);
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    setMessages([]);
    let cancelled = false;
    loadMessages(activeThreadId)
      .catch((nextError) => {
        if (!cancelled) setError(nextError.message || "خطا در بارگذاری پیام‌ها");
      });
    sendSocketEvent({ type: "thread.join", payload: { threadId: activeThreadId } });
    window.setTimeout(sendClientContext, 250);
    return () => {
      cancelled = true;
      clearInitialBottomScrollTimers();
      sendSocketEvent({ type: "thread.leave", payload: { threadId: activeThreadId } });
    };
  }, [activeThreadId]);

  useLayoutEffect(() => {
    latestMessageBatchRef.current = {
      length: messages.length,
      lastMessageId: messages[messages.length - 1]?.id || "",
    };
  }, [messages]);

  useLayoutEffect(() => {
    const list = messageListRef.current;
    if (!list || messages.length === 0) return;
    const restore = historyScrollRestoreRef.current;
    if (restore) {
      const applyRestore = () => {
        const currentList = messageListRef.current;
        if (!currentList) return;
        currentList.scrollTop = restore.mode === "prepend"
          ? currentList.scrollHeight - restore.previousHeight + restore.previousTop
          : restore.previousTop;
      };
      applyRestore();
      window.requestAnimationFrame(() => {
        applyRestore();
        window.requestAnimationFrame(applyRestore);
      });
      historyScrollRestoreRef.current = null;
    }
  }, [messages]);

  useLayoutEffect(() => {
    if (!activeThreadId || messages.length === 0) return;
    if (initialBottomScrolledThreadRef.current !== activeThreadId) {
      clearInitialBottomScrollTimers();
      scrollMessageListToBottom("auto");
      const initialBatch = {
        threadId: activeThreadId,
        length: messages.length,
        lastMessageId: messages[messages.length - 1]?.id || "",
      };
      const scrollIfStillInitialBatch = () => {
        const currentBatch = latestMessageBatchRef.current;
        if (activeThreadIdRef.current !== initialBatch.threadId) return;
        if (historyLoadingRef.current) return;
        if (currentBatch.length !== initialBatch.length || currentBatch.lastMessageId !== initialBatch.lastMessageId) return;
        scrollMessageListToBottom("auto");
      };
      initialBottomScrollTimersRef.current = [50, 150, 300].map((delay) =>
        window.setTimeout(scrollIfStillInitialBatch, delay)
      );
      pendingBottomScrollRef.current = null;
      initialBottomScrolledThreadRef.current = activeThreadId;
      return;
    }
    const behavior = pendingBottomScrollRef.current;
    if (!behavior) return;
    scrollMessageListToBottom(behavior);
    pendingBottomScrollRef.current = null;
  }, [activeThreadId, messages]);

  useEffect(() => {
    const timer = window.setTimeout(maybeMarkActiveThreadRead, 80);
    return () => window.clearTimeout(timer);
  }, [activeThreadId, messages]);

  useEffect(() => {
    const handleContextChange = () => {
      sendClientContext();
      maybeMarkActiveThreadRead();
    };
    window.addEventListener("focus", handleContextChange);
    window.addEventListener("blur", handleContextChange);
    document.addEventListener("visibilitychange", handleContextChange);
    return () => {
      window.removeEventListener("focus", handleContextChange);
      window.removeEventListener("blur", handleContextChange);
      document.removeEventListener("visibilitychange", handleContextChange);
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/chat`);
    wsRef.current = ws;

    ws.onopen = () => {
      const threadId = activeThreadIdRef.current;
      if (threadId) {
        ws.send(JSON.stringify({ type: "thread.join", payload: { threadId } }));
      }
      ws.send(JSON.stringify({
        type: "client.context",
        payload: {
          threadId: threadId || null,
          visibilityState: document.visibilityState === "visible" ? "visible" : "hidden",
          hasFocus: document.hasFocus(),
        },
      }));
    };

    ws.onmessage = (event) => {
      const incoming = JSON.parse(event.data);
      if (incoming.type === "connection.ready") {
        void loadThreads();
        if (activeThreadIdRef.current) {
          sendSocketEvent({ type: "thread.join", payload: { threadId: activeThreadIdRef.current } });
        }
        window.setTimeout(sendClientContext, 250);
        return;
      }
      if (incoming.type === "thread.joined") {
        sendClientContext();
        return;
      }
      if (incoming.type === "client.context.updated") {
        setIsActiveContextReady(
          incoming.payload?.threadId === activeThreadIdRef.current
          && incoming.payload?.visibilityState === "visible"
          && incoming.payload?.hasFocus === true
        );
        return;
      }
      if (incoming.type === "message.created") {
        const message = incoming.payload as ChatMessage;
        if (message.threadId === activeThreadIdRef.current) {
          const shouldScrollToBottom = message.senderId === currentUser?.id || isMessageListNearBottom();
          const list = messageListRef.current;
          const preserveReaderScroll = !shouldScrollToBottom && list
            ? { previousHeight: list.scrollHeight, previousTop: list.scrollTop, mode: "preserve" as const }
            : null;
          setShowJumpToLatest(!shouldScrollToBottom);
          setMessages((items) => {
            if (items.some((item) => item.id === message.id)) return items;
            if (shouldScrollToBottom) {
              pendingBottomScrollRef.current = "smooth";
            } else {
              pendingBottomScrollRef.current = null;
              historyScrollRestoreRef.current = preserveReaderScroll;
            }
            return [...items, message];
          });
        }
        void loadThreads();
        return;
      }
      if (incoming.type === "message.updated") {
        const { threadId, messageId, attachment } = incoming.payload || {};
        if (threadId === activeThreadIdRef.current && messageId && attachment) {
          setMessages((items) => items.map((item) => {
            if (item.id !== messageId) return item;
            const attachments = item.attachments || [];
            return {
              ...item,
              attachments: attachments.some((current) => current.id === attachment.id)
                ? attachments.map((current) => current.id === attachment.id ? attachment : current)
                : [...attachments, attachment],
            };
          }));
        }
        void loadThreads();
        return;
      }
      if (incoming.type === "message.ack") {
        const acknowledgedId = incoming.payload?.clientMessageId || incoming.requestId;
        if (!pendingSendIdRef.current || pendingSendIdRef.current === acknowledgedId) {
          pendingSendIdRef.current = null;
          clearSendTimeout();
          clearTypingStopTimer();
          setIsSending(false);
          setNewMessage("");
          setError("");
        }
        return;
      }
      if (incoming.type === "notification.created") {
        if (incoming.payload?.id) receiveNotification(incoming.payload);
        return;
      }
      if (incoming.type === "message.read") {
        const { threadId, userId, readAt, reader } = incoming.payload || {};
        if (threadId === activeThreadIdRef.current && userId && readAt) {
          const readerEntry = reader || {
            userId,
            name: participants.find((participant) => participant.userId === userId)?.displayName || "همکار",
            avatar: participants.find((participant) => participant.userId === userId)?.avatar || "",
            readAt,
          };
          const readTime = new Date(readAt).getTime();
          setMessages((items) => items.map((item) => {
            if (item.senderId === userId || new Date(item.createdAt).getTime() > readTime) return item;
            const seenBy = item.seenBy || [];
            return {
              ...item,
              seenBy: seenBy.some((entry) => entry.userId === userId)
                ? seenBy.map((entry) => entry.userId === userId ? { ...entry, ...readerEntry, readAt } : entry)
                : [...seenBy, { ...readerEntry, readAt }],
            };
          }));
        }
        return;
      }
      if (incoming.type === "shipment.bridge.updated") {
        const { threadId, activeShipmentBridge } = incoming.payload || {};
        setThreads((items) => items.map((thread) => (
          thread.id === threadId ? { ...thread, activeShipmentBridge: activeShipmentBridge || undefined } : thread
        )));
        return;
      }
      if (incoming.type === "thread.updated" || incoming.type === "participant.updated") {
        void loadThreads();
        void loadParticipants();
        return;
      }
      if (incoming.type === "typing.updated") {
        const { threadId, userId, isTyping } = incoming.payload || {};
        if (!threadId || !userId || userId === currentUser?.id) return;
        const key = `${threadId}:${userId}`;
        setTypingUsers((items) => {
          const next = { ...items };
          if (isTyping) {
            next[key] = Date.now() + CHAT_TYPING_THROTTLE_MS + 1500;
          } else {
            delete next[key];
          }
          return next;
        });
        return;
      }
      if (incoming.type === "presence.updated") {
        const { userId, isOnline } = incoming.payload || {};
        setParticipants((items) => items.map((item) => item.userId === userId ? { ...item, isOnline } : item));
        setThreads((items) => items.map((thread) => ({
          ...thread,
          members: thread.members.map((member) => member.userId === userId ? { ...member, isOnline } : member),
        })));
        return;
      }
      if (incoming.type === "error") {
        if (!incoming.requestId || pendingSendIdRef.current === incoming.requestId) {
          pendingSendIdRef.current = null;
          clearSendTimeout();
          setIsSending(false);
        }
        applyChatError(incoming.error);
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      pendingSendIdRef.current = null;
      clearSendTimeout();
      setIsSending(false);
    };

    return () => {
      clearSendTimeout();
      clearTypingStopTimer();
      ws.close();
      wsRef.current = null;
    };
  }, [currentUser]);

  const clearSelectedAttachment = () => {
    selectedAttachmentsRef.current.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    setSelectedAttachments([]);
    setRecordingSeconds(0);
    recordingSecondsRef.current = 0;
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeSelectedAttachment = (id: string) => {
    setSelectedAttachments((items) => {
      const removed = items.find((item) => item.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return items.filter((item) => item.id !== id);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const queueAttachmentFiles = (files: File[]) => {
    if (!files.length) return;
    const nextCount = selectedAttachmentsRef.current.length + files.length;
    if (nextCount > CHAT_BATCH_MAX_FILES) {
      setError(`حداکثر ${CHAT_BATCH_MAX_FILES} فایل را می‌توان در یک پیام فرستاد.`);
      return;
    }
    const validationError = files.map(validateAttachmentFile).find(Boolean);
    if (validationError) {
      setError(validationError);
      return;
    }
    const totalBytes = [
      ...selectedAttachmentsRef.current.map((item) => item.file),
      ...files,
    ].reduce((total, file) => total + file.size, 0);
    if (totalBytes > CHAT_BATCH_MAX_BYTES) {
      setError("حجم مجموع فایل‌ها نباید بیشتر از ۴۰ مگابایت باشد.");
      return;
    }
    const queued = files.map<SelectedAttachment>((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: file.type.startsWith("image/") || file.type.startsWith("audio/")
        ? URL.createObjectURL(file)
        : undefined,
    }));
    setSelectedAttachments((items) => [...items, ...queued]);
    setError("");
  };

  const releaseVoiceRecorder = () => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
  };

  const stopVoiceRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };

  const cancelVoiceRecording = () => {
    recordingCancelledRef.current = true;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }
    releaseVoiceRecorder();
    setIsRecordingVoice(false);
    setRecordingSeconds(0);
  };

  const startVoiceRecording = async () => {
    if (!activeThread || selectedAttachments.length || isRecordingVoice) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError(CHAT_VOICE_UNSUPPORTED_MESSAGE);
      return;
    }
    setError("");
    clearSelectedAttachment();
    recordingCancelledRef.current = false;
    recordingChunksRef.current = [];
    setRecordingSeconds(0);
    recordingSecondsRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      mediaStreamRef.current = stream;
      const mimeType = typeof MediaRecorder.isTypeSupported === "function"
        ? CHAT_VOICE_MIME_TYPES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || ""
        : "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        recordingCancelledRef.current = true;
        releaseVoiceRecorder();
        setIsRecordingVoice(false);
        setRecordingSeconds(0);
        setError(CHAT_VOICE_UNSUPPORTED_MESSAGE);
      };
      recorder.onstop = () => {
        const wasCancelled = recordingCancelledRef.current;
        const chunks = [...recordingChunksRef.current];
        const recordedMimeType = recorder.mimeType || mimeType || "audio/webm";
        releaseVoiceRecorder();
        setIsRecordingVoice(false);
        if (wasCancelled) {
          setRecordingSeconds(0);
          return;
        }
        const blob = new Blob(chunks, { type: recordedMimeType });
        if (!blob.size) {
          setError(CHAT_VOICE_EMPTY_MESSAGE);
          setRecordingSeconds(0);
          return;
        }
        if (blob.size > CHAT_AUDIO_MAX_BYTES) {
          setError(CHAT_FILE_SIZE_ERROR);
          setRecordingSeconds(0);
          return;
        }
        const extension = voiceFileExtension(recordedMimeType);
        const file = new File([blob], `voice-message-${Date.now()}.${extension}`, { type: recordedMimeType });
        setSelectedAttachments([{
          id: `voice-${Date.now()}`,
          file,
          previewUrl: URL.createObjectURL(file),
          voiceDurationSeconds: recordingSecondsRef.current,
        }]);
      };
      recorder.start(1000);
      setIsRecordingVoice(true);
      const startedAt = Date.now();
      recordingTimerRef.current = window.setInterval(() => {
        const elapsed = Math.min(CHAT_VOICE_MAX_SECONDS, Math.floor((Date.now() - startedAt) / 1000));
        recordingSecondsRef.current = elapsed;
        setRecordingSeconds(elapsed);
        if (elapsed >= CHAT_VOICE_MAX_SECONDS && recorder.state !== "inactive") recorder.stop();
      }, 250);
    } catch (nextError) {
      releaseVoiceRecorder();
      setIsRecordingVoice(false);
      setRecordingSeconds(0);
      setError(nextError instanceof DOMException && nextError.name === "NotAllowedError"
        ? CHAT_VOICE_PERMISSION_MESSAGE
        : CHAT_VOICE_UNSUPPORTED_MESSAGE);
    }
  };

  const selectThread = (threadId: string) => {
    if (isRecordingVoice) cancelVoiceRecording();
    clearSelectedAttachment();
    setActiveThreadId(threadId);
    window.history.replaceState(null, "", `/chat?threadId=${encodeURIComponent(threadId)}`);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  };

  const changeCategory = (category: ChatCategory) => {
    setActiveCategory(category);
    if (category !== "GROUP") setIsGroupPanelOpen(false);
  };

  const handleAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    queueAttachmentFiles(Array.from(event.target.files || []));
    event.target.value = "";
  };

  const handleConversationDragEnter = (event: React.DragEvent<HTMLElement>) => {
    if (!activeThread || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFiles(true);
  };

  const handleConversationDragOver = (event: React.DragEvent<HTMLElement>) => {
    if (!activeThread || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleConversationDragLeave = (event: React.DragEvent<HTMLElement>) => {
    if (!isDraggingFiles) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFiles(false);
  };

  const handleConversationDrop = (event: React.DragEvent<HTMLElement>) => {
    if (!activeThread) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    queueAttachmentFiles(Array.from(event.dataTransfer.files || []));
  };

  const stopShipmentBridge = async () => {
    if (activeThread?.type !== "GROUP" || !activeThread.activeShipmentBridge) return;
    setError("");
    try {
      await apiJson(`/api/chat/threads/${encodeURIComponent(activeThread.id)}/shipment-bridge`, {
        method: "DELETE",
      });
      setThreads((items) => items.map((thread) => (
        thread.id === activeThread.id ? { ...thread, activeShipmentBridge: undefined } : thread
      )));
    } catch (nextError: any) {
      setError(nextError?.message || CHAT_SEND_FAILED_MESSAGE);
    }
  };

  const openDirectThread = async (participant: ChatParticipant) => {
    setError("");
    const existing = directThreadsByUserId.get(participant.userId);
    if (existing) {
      selectThread(existing.id);
      return;
    }
    const data = await apiJson<{ id: string }>("/api/chat/direct", {
      method: "POST",
      body: JSON.stringify({ userId: participant.userId }),
    });
    await loadThreads();
    selectThread(data.id);
  };

  const createGroupThread = async () => {
    if (!groupName.trim() || groupParticipantIds.length === 0) return;
    setError("");
    const data = await apiJson<{ id: string }>("/api/chat/threads", {
      method: "POST",
      body: JSON.stringify({
        type: "GROUP",
        name: groupName.trim(),
        participantUserIds: groupParticipantIds,
      }),
    });
    setGroupName("");
    setGroupParticipantIds([]);
    setIsGroupPanelOpen(false);
    await loadThreads();
    selectThread(data.id);
  };

  const toggleGroupParticipant = (userId: string) => {
    setGroupParticipantIds((items) =>
      items.includes(userId) ? items.filter((item) => item !== userId) : [...items, userId]
    );
  };

  const addGroupMember = async (participant: ChatParticipant) => {
    if (activeThread?.type !== "GROUP" || addingGroupMemberId) return;
    setAddingGroupMemberId(participant.userId);
    setError("");
    try {
      await apiJson(`/api/chat/threads/${encodeURIComponent(activeThread.id)}/participants`, {
        method: "POST",
        body: JSON.stringify({ userId: participant.userId }),
      });
      setGroupMemberSearch("");
      await loadThreads();
    } catch (nextError: any) {
      setError(nextError?.message || CHAT_SEND_FAILED_MESSAGE);
    } finally {
      setAddingGroupMemberId("");
    }
  };

  const archiveGroup = async () => {
    if (!groupToArchive) return;
    const archivedId = groupToArchive.id;
    await apiJson<{ id: string; archivedAt: string }>(`/api/chat/threads/${encodeURIComponent(archivedId)}`, {
      method: "DELETE",
    });
    setIsGroupSettingsOpen(false);
    if (activeThreadIdRef.current === archivedId) {
      activeThreadIdRef.current = "";
      setActiveThreadId("");
      setMessages([]);
      window.history.replaceState(null, "", "/chat");
    }
    await loadThreads();
  };

  const applyAttachmentUpdate = (messageId: string, attachment: ChatAttachment) => {
    setMessages((items) => items.map((item) => {
      if (item.id !== messageId) return item;
      const attachments = item.attachments || [];
      return {
        ...item,
        attachments: attachments.some((current) => current.id === attachment.id)
          ? attachments.map((current) => current.id === attachment.id ? attachment : current)
          : [...attachments, attachment],
      };
    }));
  };

  const deleteAttachment = async (message: ChatMessage, attachment: ChatAttachment) => {
    if (!attachment.downloadUrl && !attachment.previewUrl) return;
    setError("");
    try {
      const data = await apiJson<{ attachment: ChatAttachment }>(
        `/api/chat/messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(attachment.id)}`,
        { method: "DELETE" }
      );
      if (data?.attachment) {
        applyAttachmentUpdate(message.id, data.attachment);
      }
      await loadThreads();
    } catch (nextError: any) {
      setError(nextError?.message || CHAT_SEND_FAILED_MESSAGE);
    }
  };

  const renderMessageBody = (message: ChatMessage) => {
    const body = messageText(message);
    if (!body) return null;
    const mentionsByCode = new Map(
      (message.shipmentMentions || []).map((mention) => [mention.shipmentCode, mention])
    );
    if (!mentionsByCode.size) return <div>{body}</div>;
    const nodes: React.ReactNode[] = [];
    const mentionPattern = /@([0-9۰-۹٠-٩]{11})(?![0-9۰-۹٠-٩])/gu;
    let cursor = 0;
    for (const match of body.matchAll(mentionPattern)) {
      const index = match.index || 0;
      if (index > cursor) nodes.push(body.slice(cursor, index));
      const normalizedCode = normalizeChatDigits(match[1]);
      const mention = mentionsByCode.get(normalizedCode);
      if (mention) {
        nodes.push(
          <a
            key={`${index}-${normalizedCode}`}
            href={mention.detailUrl || `/shipments/${encodeURIComponent(mention.shipmentId)}`}
            className="inline-flex items-center gap-1 rounded-sm bg-primary/10 px-1 font-black text-primary underline-offset-2 hover:underline"
            data-testid="chat-shipment-mention"
          >
            <Ship className="h-3 w-3" />
            @{normalizedCode}
          </a>
        );
      } else {
        nodes.push(match[0]);
      }
      cursor = index + match[0].length;
    }
    if (cursor < body.length) nodes.push(body.slice(cursor));
    return <div>{nodes}</div>;
  };

  const renderSeenBy = (message: ChatMessage) => {
    const seenBy = message.seenBy || [];
    if (!seenBy.length) return null;
    const isOpen = openSeenMessageId === message.id;
    return (
      <div className="relative mt-1 flex items-center px-1" data-testid="chat-seen-by">
        <button
          type="button"
          className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground"
          onClick={() => setOpenSeenMessageId(isOpen ? "" : message.id)}
          aria-expanded={isOpen}
          aria-label={`دیده‌شده توسط ${seenBy.length} نفر`}
        >
          <span className="flex -space-x-1.5 space-x-reverse">
            {seenBy.slice(0, 3).map((reader) => (
              <Avatar key={reader.userId} className="h-5 w-5 border-2 border-background">
                <AvatarImage src={reader.avatar} />
                <AvatarFallback className="text-[7px] font-black">{initials(reader.name)}</AvatarFallback>
              </Avatar>
            ))}
          </span>
          <span>{seenBy.length > 3 ? `+${seenBy.length - 3}` : "دیده شد"}</span>
        </button>
        {isOpen && (
          <div className="absolute bottom-7 right-0 z-30 w-64 max-w-[80vw] rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md">
            <p className="px-1 pb-2 text-[11px] font-black">دیده‌شده توسط</p>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {seenBy.map((reader) => (
                <div key={reader.userId} className="flex items-center gap-2 rounded-sm px-1 py-1">
                  <Avatar className="h-7 w-7 border border-border">
                    <AvatarImage src={reader.avatar} />
                    <AvatarFallback className="text-[8px] font-black">{initials(reader.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-black">{reader.name}</p>
                    <p className="text-[9px] font-bold text-muted-foreground">{messageTimestamp(reader.readAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderMessageAttachments = (message: ChatMessage, isMine: boolean) => {
    const attachments = message.attachments || [];
    if (!attachments.length) return null;
    return (
      <div className="mt-2 flex flex-col gap-2" data-testid="chat-message-attachments">
        {attachments.map((attachment) => {
          const isDeleted = Boolean(attachment.deletedAt);
          const canDeleteAttachment = !isDeleted && (isMine || canDeleteMedia);
          const isPdf = attachment.contentType.split(";")[0].trim().toLowerCase() === "application/pdf";
          if (isDeleted) {
            return (
              <div
                key={attachment.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-bold",
                  isMine ? "border-primary/20 bg-background/70" : "border-border bg-muted/40"
                )}
                data-testid="chat-attachment-deleted"
              >
                <FileIcon className="h-4 w-4 shrink-0" />
                <span>{attachmentDeletedLabel(attachment)}</span>
              </div>
            );
          }

          if (attachment.attachmentType === "audio" && attachment.previewUrl) {
            return (
              <div
                key={attachment.id}
                className={cn(
                  "min-w-[min(18rem,70vw)] space-y-2 rounded-lg border px-3 py-2",
                  isMine ? "border-primary/20 bg-background/70" : "border-border bg-muted/40"
                )}
                data-testid="chat-audio-attachment"
              >
                <audio controls preload="metadata" src={attachment.previewUrl} className="h-10 w-full max-w-full" />
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[10px] font-bold opacity-80">پیام صوتی · {attachment.fileSize}</span>
                  {canDeleteAttachment && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 rounded-lg text-destructive hover:text-destructive"
                      onClick={() => void deleteAttachment(message, attachment)}
                      aria-label="Delete attachment"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          }

          if (attachment.attachmentType === "image" && attachment.previewUrl) {
            return (
              <div key={attachment.id} className="space-y-2" data-testid="chat-image-attachment">
                <button
                  type="button"
                  onClick={() => setPreviewAttachment(attachment)}
                  className="block overflow-hidden rounded-lg border border-border/60 bg-background"
                  aria-label={attachment.filename}
                >
                  <img
                    src={attachment.previewUrl}
                    alt={attachment.filename}
                    className="max-h-64 w-full max-w-sm object-contain"
                    loading="lazy"
                  />
                </button>
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={() => setPreviewAttachment(attachment)}
                    aria-label="Preview attachment"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  {attachment.downloadUrl && (
                    <Button asChild variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                      <a href={attachment.downloadUrl} target="_blank" rel="noreferrer" aria-label="Download attachment">
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                  {canDeleteAttachment && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg text-destructive hover:text-destructive"
                      onClick={() => void deleteAttachment(message, attachment)}
                      aria-label="Delete attachment"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  <span className="min-w-0 truncate px-1 text-[10px] font-bold opacity-80">
                    {attachment.filename} · {attachment.fileSize}
                  </span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={attachment.id}
              className={cn(
                "flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2",
                isMine ? "border-primary/20 bg-background/70" : "border-border bg-muted/40"
              )}
              data-testid="chat-file-attachment"
            >
              <FileIcon className="h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-black">{attachment.filename}</p>
                <p className="text-[10px] font-bold opacity-75">{attachment.fileSize}</p>
              </div>
              {isPdf && attachment.previewUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-lg"
                  onClick={() => setPreviewAttachment(attachment)}
                  aria-label="Preview attachment"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              )}
              {attachment.downloadUrl && (
                <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-lg">
                  <a href={attachment.downloadUrl} target="_blank" rel="noreferrer" aria-label="Download attachment">
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
              )}
              {canDeleteAttachment && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-lg text-destructive hover:text-destructive"
                  onClick={() => void deleteAttachment(message, attachment)}
                  aria-label="Delete attachment"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = newMessage.trim();
    if ((!body && !selectedAttachments.length) || !activeThread || isSending || isSendLocked) return;
    setIsSending(true);
    setError("");
    const clientMessageId = `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (selectedAttachments.length) {
      try {
        clearTypingStopTimer();
        const formData = new FormData();
        selectedAttachments.forEach((item) => formData.append("files", item.file));
        formData.append("caption", body);
        formData.append("clientMessageId", clientMessageId);
        const message = await apiFormData<ChatMessage>(
          `/api/chat/threads/${encodeURIComponent(activeThread.id)}/attachments`,
          formData
        );
        pendingBottomScrollRef.current = "smooth";
        setMessages((items) => items.some((item) => item.id === message.id) ? items : [...items, message]);
        await loadThreads();
        setNewMessage("");
        clearSelectedAttachment();
      } catch (nextError: any) {
        applyChatError(nextError);
      } finally {
        setIsSending(false);
      }
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        pendingSendIdRef.current = clientMessageId;
        clearSendTimeout();
        clearTypingStopTimer();
        wsRef.current.send(JSON.stringify({
          type: "message.send",
          requestId: clientMessageId,
          payload: { threadId: activeThread.id, body, clientMessageId },
        }));
        sendTimeoutRef.current = window.setTimeout(() => {
          if (pendingSendIdRef.current !== clientMessageId) return;
          pendingSendIdRef.current = null;
          setIsSending(false);
          setError(CHAT_SEND_FAILED_MESSAGE);
        }, 10000);
      } catch (nextError: any) {
        pendingSendIdRef.current = null;
        clearSendTimeout();
        setIsSending(false);
        applyChatError({ message: nextError?.message || CHAT_SEND_FAILED_MESSAGE });
      }
      return;
    }

    try {
      clearTypingStopTimer();
      const message = await apiJson<ChatMessage>(`/api/chat/threads/${encodeURIComponent(activeThread.id)}/messages`, {
        method: "POST",
        body: JSON.stringify({ body, clientMessageId }),
      });
      pendingBottomScrollRef.current = "smooth";
      setMessages((items) => items.some((item) => item.id === message.id) ? items : [...items, message]);
      await loadThreads();
      setNewMessage("");
    } catch (nextError: any) {
      applyChatError(nextError);
    } finally {
      setIsSending(false);
    }
  };

  const renderParticipantAvatar = (participant: ChatParticipant, size = "h-10 w-10") => (
    <div className="relative shrink-0">
      <Avatar className={cn(size, "border border-border")}>
        <AvatarImage src={participant.avatar} />
        <AvatarFallback className="bg-muted text-xs font-black text-primary">{initials(participant.displayName)}</AvatarFallback>
      </Avatar>
      {participant.isOnline && (
        <span className="absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div
      className="h-[calc(100dvh-7.5rem)] max-h-[calc(100dvh-7.5rem)] min-h-0 max-w-full overflow-hidden bg-background font-sans lg:h-[calc(100dvh-3.5rem)] lg:max-h-[calc(100dvh-3.5rem)]"
      dir="rtl"
      data-testid="chat-page"
      data-active-context-ready={isActiveContextReady ? "true" : "false"}
    >
      <div className="flex h-full min-h-0 max-w-full overflow-hidden">
        <aside
          className={cn(
            "absolute inset-0 z-30 flex w-full max-w-full flex-col overflow-hidden border-l border-border bg-card transition lg:relative lg:z-0 lg:w-[23rem] lg:max-w-[23rem]",
            isSidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
          )}
          data-testid="chat-sidebar"
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-border p-3">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="جستجوی گفتگو یا همکار"
                className="h-10 rounded-lg pr-10 text-xs font-bold"
              />
            </div>
            {canManageGroups && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-lg"
                onClick={() => setIsGroupPanelOpen((value) => !value)}
                data-testid="chat-group-toggle"
                aria-label="ساخت گروه"
              >
                {isGroupPanelOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-lg lg:hidden"
              onClick={() => setIsSidebarOpen(false)}
              aria-label="بستن فهرست"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {showPushSetup && (
            <div className="shrink-0 border-b border-border p-2">
              <PushNotificationControls
                compact
                dismissible
                className="border-0 bg-muted/40 p-3"
                onDismiss={() => {
                  window.localStorage.setItem("logisticplus.chat.push-setup.dismissed", "true");
                  setShowPushSetup(false);
                }}
              />
            </div>
          )}

          <div className="shrink-0 border-b border-border bg-muted/20 px-2 py-2" data-testid="chat-category-tabs">
            <div className="grid grid-cols-5 gap-1">
              {CHAT_CATEGORIES.map((category) => {
                const counts = threadCountsByCategory[category.type];
                const isActive = activeCategory === category.type;
                return (
                  <button
                    key={category.type}
                    type="button"
                    className={cn(
                      "flex h-8 min-w-0 items-center justify-center gap-1 rounded-md px-1 text-[10px] font-black transition",
                      isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                    )}
                    onClick={() => changeCategory(category.type)}
                    data-testid={`chat-category-${category.type.toLowerCase()}`}
                    aria-pressed={isActive}
                  >
                    <span className="truncate">{category.shortLabel}</span>
                    {counts.unread > 0 && category.type !== "ALL" ? (
                      <span className={cn("rounded-full px-1 text-[9px]", isActive ? "bg-primary-foreground/20" : "bg-primary/10 text-primary")}>
                        {counts.unread}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {isGroupPanelOpen && (
            <div className="shrink-0 border-b border-border bg-muted/20 p-3" data-testid="chat-group-panel">
              <Input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="نام گروه"
                className="mb-3 h-10 rounded-lg text-xs font-bold"
                maxLength={120}
              />
              <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-background">
                {participants.slice(0, 30).map((participant) => (
                  <label key={participant.userId} className="flex cursor-pointer items-center gap-2 border-b border-border/50 p-2 text-xs font-bold last:border-b-0">
                    <input
                      type="checkbox"
                      checked={groupParticipantIds.includes(participant.userId)}
                      onChange={() => toggleGroupParticipant(participant.userId)}
                    />
                    <span className="truncate">{participant.displayName}</span>
                  </label>
                ))}
              </div>
              <Button
                type="button"
                className="mt-3 h-10 w-full rounded-lg text-xs font-black"
                disabled={!groupName.trim() || groupParticipantIds.length === 0}
                onClick={createGroupThread}
              >
                ساخت گروه
              </Button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mb-4">
              <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[11px] font-black text-muted-foreground">
                <span>{CHAT_CATEGORIES.find((category) => category.type === activeCategory)?.label || "گفتگوها"}</span>
                <Badge variant="secondary" className="rounded-md text-[10px]">
                  {threadCountsByCategory[activeCategory].total}
                </Badge>
              </div>
              <div className="divide-y divide-border/70" data-testid="chat-thread-list">
                {filteredThreads.map((thread) => {
                  const title = displayNameForThread(thread, currentUser?.id);
                  const isActive = thread.id === activeThreadId;
                  const typingNow = (Object.entries(typingUsers) as Array<[string, number]>).some(([key, expiresAt]) => (
                    key.startsWith(`${thread.id}:`) && expiresAt > Date.now()
                  ));
                  const preview = thread.lastMessage
                    ? `${thread.type !== "DM" && thread.lastMessage.senderName ? `${thread.lastMessage.senderName}: ` : ""}${messagePreviewText(thread.lastMessage)}`
                    : "هنوز پیامی ثبت نشده";
                  return (
                    <button
                      type="button"
                      key={thread.id}
                      onClick={() => selectThread(thread.id)}
                      className={cn(
                        "flex min-h-16 w-full items-center gap-3 px-3 py-2.5 text-right transition",
                        isActive ? "bg-primary/[0.08]" : "hover:bg-muted/70"
                      )}
                      data-testid="chat-thread-item"
                    >
                      {thread.type === "DM" ? (
                        renderParticipantAvatar(thread.members.find((member) => member.userId !== currentUser?.id) || thread.members[0] || { displayName: title, userId: thread.id, id: thread.id, name: title, email: "", role: "", roleName: "" })
                      ) : thread.type === "SHIPMENT" ? (
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600">
                          <Ship className="h-5 w-5" />
                        </span>
                      ) : (
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                          <Users className="h-5 w-5" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="block min-w-0 flex-1 truncate text-xs font-black">{title}</span>
                          <span className="shrink-0 text-[9px] font-bold text-muted-foreground">
                            {conversationTimestamp(thread.lastMessage?.createdAt || thread.updatedAt)}
                          </span>
                          {thread.type === "SHIPMENT" && (
                            <Badge variant="secondary" className="shrink-0 rounded-md text-[9px]" data-testid="chat-thread-shipment-badge">
                              محموله
                            </Badge>
                          )}
                        </span>
                        <span className={cn("block truncate text-[11px] font-bold", typingNow ? "text-primary" : "text-muted-foreground")}>
                          {typingNow ? "در حال نوشتن…" : preview}
                        </span>
                      </span>
                      {Number(thread.unreadCount || 0) > 0 && (
                        <Badge className="h-5 min-w-5 rounded-full px-1 text-[10px]">{thread.unreadCount}</Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {activeCategory === "DM" && (
            <div className="px-3">
              <div className="mb-2 px-1 text-[11px] font-black text-muted-foreground">همکاران</div>
              <div className="space-y-1" data-testid="chat-participant-list">
                {filteredParticipants.map((participant) => (
                  <button
                    type="button"
                    key={participant.userId}
                    onClick={() => openDirectThread(participant).catch((nextError) => setError(nextError.message))}
                    className="flex h-14 w-full items-center gap-3 rounded-lg px-3 text-right transition hover:bg-muted"
                    data-testid="chat-participant-item"
                  >
                    {renderParticipantAvatar(participant, "h-9 w-9")}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-black">{participant.displayName}</span>
                      <span className="block truncate text-[11px] font-bold text-muted-foreground">{participant.roleName}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            )}
          </div>
        </aside>

        <section
          className="relative flex min-w-0 max-w-full flex-1 flex-col overflow-hidden bg-muted/10"
          data-testid="chat-conversation"
          onDragEnter={handleConversationDragEnter}
          onDragOver={handleConversationDragOver}
          onDragLeave={handleConversationDragLeave}
          onDrop={handleConversationDrop}
        >
          {isDraggingFiles && activeThread && (
            <div
              className="pointer-events-none absolute inset-2 z-50 grid place-items-center rounded-md border-2 border-dashed border-primary bg-background/95"
              data-testid="chat-drop-overlay"
            >
              <div className="text-center">
                <Paperclip className="mx-auto h-8 w-8 text-primary" />
                <p className="mt-2 text-sm font-black">فایل‌ها را اینجا رها کنید</p>
                <p className="mt-1 text-[11px] font-bold text-muted-foreground">حداکثر ۵ فایل و مجموع ۴۰ مگابایت</p>
              </div>
            </div>
          )}
          <header className="flex h-16 min-w-0 shrink-0 items-center justify-between border-b border-border bg-card px-3 md:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-lg lg:hidden"
                onClick={() => setIsSidebarOpen(true)}
                aria-label="نمایش گفتگوها"
                data-testid="chat-mobile-back-button"
              >
                <ArrowRight className="h-5 w-5" />
              </Button>
              {activeThread ? (
                <>
                  {activeThread.type === "DM" ? (
                    renderParticipantAvatar(
                      activeThread.members.find((member) => member.userId !== currentUser?.id) ||
                        activeThread.members[0] ||
                        {
                          displayName: displayNameForThread(activeThread, currentUser?.id),
                          userId: activeThread.id,
                          id: activeThread.id,
                          name: activeThread.name,
                          email: "",
                          role: "",
                          roleName: "",
                        },
                      "h-10 w-10"
                    )
                  ) : activeThread.type === "SHIPMENT" ? (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600">
                      <Ship className="h-5 w-5" />
                    </span>
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Users className="h-5 w-5" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <h1 className="truncate text-sm font-black text-foreground">{displayNameForThread(activeThread, currentUser?.id)}</h1>
                    {activeThread.type === "SHIPMENT" && (
                      <div className="mt-1 flex min-w-0 items-center gap-2">
                        <Badge variant="secondary" className="shrink-0 rounded-md text-[10px]">
                          گفتگوی محموله
                        </Badge>
                        <span className="min-w-0 truncate text-[11px] font-bold text-muted-foreground">
                          {activeThread.shipmentCode || activeThread.shipment?.code}
                        </span>
                      </div>
                    )}
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
                      <Circle className="h-2 w-2 fill-current text-emerald-500" />
                      {activeThread.type === "GROUP" ? `${activeThread.members.length} عضو` : "گفتگوی داخلی شرکت"}
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                    <MessageSquare className="h-5 w-5" />
                  </span>
                  <h1 className="text-sm font-black text-foreground">چت شرکت</h1>
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {canManageGroups && activeThread?.type === "GROUP" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-lg"
                  onClick={() => setIsGroupSettingsOpen(true)}
                  data-testid="chat-group-settings-button"
                  aria-label="تنظیمات گروه"
                  title="تنظیمات گروه"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              )}
              {activeThread?.type === "SHIPMENT" && (activeThread.shipmentDetailUrl || activeThread.shipmentId) && (
                <Button
                  type="button"
                  variant="outline"
                  className="hidden h-10 shrink-0 gap-2 rounded-lg text-xs font-black sm:inline-flex"
                  onClick={() => {
                    window.location.href = activeThread.shipmentDetailUrl || `/shipments/${encodeURIComponent(activeThread.shipmentId || "")}`;
                  }}
                  data-testid="chat-open-shipment"
                >
                  <ExternalLink className="h-4 w-4" />
                  مشاهده محموله
                </Button>
              )}
            </div>
          </header>

          {activeThread?.type === "GROUP" && activeThread.activeShipmentBridge && (
            <div
              className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-b border-primary/20 bg-primary/5 px-3 py-2 md:px-5"
              data-testid="chat-active-shipment-bridge"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-sm bg-primary/10 text-primary">
                <Link2 className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-black text-foreground">
                  ارسال خودکار به محموله {activeThread.activeShipmentBridge.shipmentCode}
                </p>
                <p className="truncate text-[10px] font-bold text-muted-foreground">
                  {[activeThread.activeShipmentBridge.customerName, activeThread.activeShipmentBridge.shipmentStatus]
                    .filter(Boolean)
                    .join(" · ") || "همه پیام‌های بعدی به گفتگوی محموله نیز می‌روند"}
                </p>
              </div>
              {activeThread.activeShipmentBridge.canOpenShipment && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-sm px-2 text-[10px] font-black"
                  onClick={() => selectThread(activeThread.activeShipmentBridge!.shipmentThreadId)}
                  data-testid="chat-open-bridged-shipment"
                >
                  <ExternalLink className="ml-1 h-3.5 w-3.5" />
                  بازکردن چت
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-sm px-2 text-[10px] font-black text-destructive hover:text-destructive"
                onClick={() => void stopShipmentBridge()}
                data-testid="chat-stop-shipment-bridge"
              >
                <Unlink className="ml-1 h-3.5 w-3.5" />
                توقف
              </Button>
            </div>
          )}

          {error && (
            <div className="mx-4 mt-3 shrink-0 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive" data-testid="chat-error">
              {error}
            </div>
          )}

          <div
            ref={messageListRef}
            className="min-h-0 max-w-full flex-1 overflow-y-auto px-2.5 py-4 sm:px-4"
            data-testid="chat-message-list"
            onScroll={handleMessageListScroll}
          >
            {!activeThread ? (
              <EmptyState
                icon={MessageSquare}
                title="گفتگویی انتخاب نشده"
                description="از فهرست همکاران یک گفتگوی مستقیم شروع کنید یا یک گروه داخلی بسازید."
              />
            ) : messages.length === 0 ? (
              <div className="flex min-h-full items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <MessageSquare className="mx-auto mb-3 h-10 w-10 opacity-40" />
                  <p className="text-xs font-black">شروع گفتگو</p>
                </div>
              </div>
            ) : (
              <div className="mx-auto flex max-w-4xl flex-col">
                {messages.map((message, index) => {
                  const isMine = message.senderId === currentUser?.id;
                  const previous = messages[index - 1];
                  const showDate = !previous || messageDateKey(previous.createdAt) !== messageDateKey(message.createdAt);
                  const groupedWithPrevious = Boolean(
                    previous
                    && previous.senderId === message.senderId
                    && !showDate
                    && new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 5 * 60_000
                  );
                  const seen = (message.seenBy || []).some((reader) => reader.userId !== currentUser?.id);
                  return (
                    <React.Fragment key={message.id}>
                    {showDate && (
                      <div className="my-4 flex items-center justify-center" data-testid="chat-date-separator">
                        <span className="rounded-full border border-border bg-card/95 px-3 py-1 text-[10px] font-bold text-muted-foreground">
                          {MESSAGE_DATE_FORMATTER.format(new Date(message.createdAt))}
                        </span>
                      </div>
                    )}
                    {message.id === firstUnreadMessageId && (
                      <div className="my-3 flex items-center gap-3" data-testid="chat-unread-divider">
                        <span className="h-px flex-1 bg-primary/30" />
                        <span className="text-[10px] font-black text-primary">پیام‌های خوانده‌نشده</span>
                        <span className="h-px flex-1 bg-primary/30" />
                      </div>
                    )}
                    <div className={cn(
                      "flex min-w-0 max-w-full flex-col",
                      groupedWithPrevious ? "mt-0.5" : "mt-2.5",
                      isMine ? "items-start" : "items-end"
                    )}>
                      {message.forwardedFrom && (
                        <button
                          type="button"
                          disabled={!message.forwardedFrom.canOpenThread}
                          onClick={() => message.forwardedFrom?.canOpenThread && selectThread(message.forwardedFrom.threadId)}
                          className="mb-1 flex items-center gap-1 px-1 text-[10px] font-bold text-muted-foreground enabled:hover:text-primary disabled:cursor-default"
                          data-testid="chat-forwarded-from"
                        >
                          <Forward className="h-3 w-3" />
                          ارسال‌شده از {message.forwardedFrom.threadName}
                        </button>
                      )}
                      {!groupedWithPrevious && !isMine && activeThread.type !== "DM" && (
                        <span className="mb-1 px-1 text-[11px] font-black text-muted-foreground">{message.senderName}</span>
                      )}
                      <div
                        className={cn(
                          "max-w-[min(38rem,88%)] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-xs font-bold leading-6 [overflow-wrap:anywhere]",
                          isMine
                            ? "rounded-tr-sm bg-primary text-primary-foreground"
                            : "rounded-tl-sm border border-border bg-card text-foreground"
                        )}
                        data-testid="chat-message-bubble"
                      >
                        {renderMessageBody(message)}
                        {renderMessageAttachments(message, isMine)}
                      </div>
                      <div className="mt-1 flex max-w-[90%] flex-wrap items-center gap-x-2 px-1 text-[10px] font-bold text-muted-foreground">
                        <span>{messageTime(message.createdAt)}</span>
                        {isMine && (
                          seen
                            ? <CheckCheck className="h-3.5 w-3.5 text-primary" aria-label="دیده شده" />
                            : <Check className="h-3.5 w-3.5" aria-label="ارسال شده" />
                        )}
                        {message.forwardedTo && (
                          <a
                            href={message.forwardedTo.detailUrl || `/shipments/${encodeURIComponent(message.forwardedTo.shipmentId || "")}`}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                            data-testid="chat-forwarded-to"
                          >
                            <Forward className="h-3 w-3" />
                            محموله {message.forwardedTo.shipmentCode}
                          </a>
                        )}
                      </div>
                      {isMine && renderSeenBy(message)}
                    </div>
                    </React.Fragment>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {showJumpToLatest && activeThread && (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute bottom-24 left-1/2 z-20 h-10 w-10 -translate-x-1/2 rounded-full border border-border shadow-sm"
              onClick={() => {
                scrollMessageListToBottom("smooth");
                setShowJumpToLatest(false);
                window.setTimeout(maybeMarkActiveThreadRead, 200);
              }}
              data-testid="chat-jump-to-latest"
              aria-label="رفتن به آخرین پیام"
            >
              <ChevronDown className="h-5 w-5" />
            </Button>
          )}

          {activeTypingNames.length > 0 && (
            <div className="shrink-0 border-t border-border/70 bg-card px-4 pt-2 text-[11px] font-bold text-muted-foreground" data-testid="chat-typing-indicator">
              {activeTypingNames.join("، ")} در حال نوشتن است
            </div>
          )}

          <form onSubmit={sendMessage} className="shrink-0 border-t border-border bg-card px-2.5 pt-2.5 pb-[max(.625rem,env(safe-area-inset-bottom))] md:px-4 md:pt-3" data-testid="chat-composer">
            <div className="mx-auto w-full max-w-4xl rounded-2xl border border-border bg-background p-2 focus-within:border-primary/50">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={CHAT_ATTACHMENT_ACCEPT}
                multiple
                onChange={handleAttachmentChange}
                data-testid="chat-attachment-input"
              />
              {isRecordingVoice && (
                <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2" data-testid="chat-voice-recording">
                  <span className="relative flex h-3 w-3 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-60" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-destructive" />
                  </span>
                  <span className="min-w-0 flex-1 text-xs font-black">در حال ضبط پیام صوتی</span>
                  <span className="font-mono text-xs font-black tabular-nums" data-testid="chat-voice-timer">
                    {recordingTimestamp(recordingSeconds)} / 05:00
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-lg text-xs font-black"
                    onClick={cancelVoiceRecording}
                    data-testid="chat-voice-cancel"
                  >
                    <X className="ml-1 h-4 w-4" />
                    انصراف
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-8 rounded-lg text-xs font-black"
                    onClick={stopVoiceRecording}
                    data-testid="chat-voice-stop"
                  >
                    <Square className="ml-1 h-3.5 w-3.5 fill-current" />
                    توقف
                  </Button>
                </div>
              )}
              {selectedAttachments.length > 0 && (
                <div
                  className="mb-2 grid max-h-36 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2"
                  data-testid="chat-selected-attachments"
                >
                  {selectedAttachments.map((item) => (
                    <div
                      key={item.id}
                      className="flex min-w-0 items-center gap-2 rounded-sm border border-border bg-muted/30 px-2 py-1.5"
                      data-testid="chat-selected-attachment"
                    >
                      {item.file.type.startsWith("image/") && item.previewUrl ? (
                        <img src={item.previewUrl} alt={item.file.name} className="h-9 w-9 shrink-0 rounded-sm object-cover" />
                      ) : item.file.type.startsWith("audio/") && item.previewUrl ? (
                        <audio controls preload="metadata" src={item.previewUrl} className="h-8 min-w-0 flex-1" data-testid="chat-voice-preview" />
                      ) : (
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-background text-primary">
                          <FileIcon className="h-4 w-4" />
                        </span>
                      )}
                      {!item.file.type.startsWith("audio/") && (
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-black">{item.file.name}</p>
                          <p className="text-[9px] font-bold text-muted-foreground">{Math.ceil(item.file.size / 1024)} KB</p>
                        </div>
                      )}
                      {item.file.type.startsWith("audio/") && (
                        <span className="shrink-0 text-[9px] font-bold text-muted-foreground">
                          {recordingTimestamp(item.voiceDurationSeconds || 0)}
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 rounded-sm"
                        onClick={() => removeSelectedAttachment(item.id)}
                        aria-label={`حذف ${item.file.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="relative flex items-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-full"
                  disabled={!activeThread || isSending || isSendLocked || isRecordingVoice || selectedAttachments.length >= CHAT_BATCH_MAX_FILES}
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="chat-attach-button"
                  aria-label="پیوست فایل"
                  title="پیوست فایل"
                >
                  {selectedAttachments.some((item) => item.file.type.startsWith("image/"))
                    ? <ImageIcon className="h-4 w-4" />
                    : <Paperclip className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn("h-10 w-10 shrink-0 rounded-full", isRecordingVoice && "text-destructive")}
                  disabled={!activeThread || isSending || isSendLocked || isRecordingVoice || Boolean(selectedAttachments.length)}
                  onClick={() => void startVoiceRecording()}
                  data-testid="chat-voice-button"
                  aria-label="ضبط پیام صوتی"
                  title="ضبط پیام صوتی"
                >
                  <Mic className="h-4 w-4" />
                </Button>
                <textarea
                  ref={composerRef}
                  value={newMessage}
                  onChange={handleComposerChange}
                  onKeyDown={handleComposerKeyDown}
                  disabled={!activeThread || isRecordingVoice}
                  maxLength={CHAT_MESSAGE_MAX_LENGTH}
                  rows={1}
                  placeholder={activeThread ? "پیام داخلی خود را بنویسید..." : "ابتدا یک گفتگو انتخاب کنید"}
                  className="min-h-10 max-h-32 min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-2 py-2.5 text-xs font-bold leading-5 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="chat-message-input"
                />
                {isShipmentSuggestionOpen && shipmentOptions.length > 0 && (
                  <div
                    className="absolute bottom-12 right-20 z-40 w-[min(24rem,calc(100vw-3rem))] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
                    role="listbox"
                    aria-label="پیشنهاد محموله"
                    data-testid="chat-shipment-suggestions"
                  >
                    {shipmentOptions.map((option, index) => (
                      <button
                        key={option.id}
                        type="button"
                        role="option"
                        aria-selected={index === shipmentSuggestionIndex}
                        className={cn(
                          "flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-2 text-right",
                          index === shipmentSuggestionIndex ? "bg-primary/10 text-primary" : "hover:bg-muted"
                        )}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectShipmentSuggestion(option)}
                      >
                        <Ship className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] font-black">@{option.code}</span>
                          <span className="block truncate text-[9px] font-bold text-muted-foreground">
                            {[option.customerName, option.status].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <Button
                  type="submit"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-full"
                  disabled={!activeThread || isRecordingVoice || (!newMessage.trim() && !selectedAttachments.length) || isSending || isSendLocked}
                  data-testid="chat-send-button"
                  aria-label="ارسال پیام"
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </form>
        </section>
      </div>

      <Dialog open={isGroupSettingsOpen} onOpenChange={setIsGroupSettingsOpen}>
        <DialogContent className="flex max-h-[85dvh] w-[calc(100vw-1.5rem)] max-w-lg flex-col overflow-hidden p-0 sm:w-full" dir="rtl">
          <DialogHeader className="shrink-0 border-b border-border px-4 py-4 text-right">
            <DialogTitle className="text-base font-black">تنظیمات گروه</DialogTitle>
            <DialogDescription className="text-xs font-bold">
              اعضای فعلی را ببینید یا همکار جدیدی به گروه اضافه کنید.
            </DialogDescription>
          </DialogHeader>
          {activeThread?.type === "GROUP" && (
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
              <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="text-xs font-black">اعضای فعلی</h2>
                  <Badge variant="secondary" className="rounded-md text-[10px]">{activeThread.members.length} عضو</Badge>
                </div>
                <div className="space-y-1 rounded-lg border border-border p-2" data-testid="chat-group-member-list">
                  {activeThread.members.map((member) => (
                    <div key={member.userId} className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5">
                      {renderParticipantAvatar(member, "h-8 w-8")}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-black">{member.displayName}</p>
                        <p className="truncate text-[10px] font-bold text-muted-foreground">{member.roleName || member.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="mb-2 text-xs font-black">افزودن همکار</h2>
                <div className="relative mb-2">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={groupMemberSearch}
                    onChange={(event) => setGroupMemberSearch(event.target.value)}
                    placeholder="جستجوی نام، ایمیل یا نقش"
                    className="h-10 pr-10 text-xs font-bold"
                    data-testid="chat-group-member-search"
                  />
                </div>
                <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-border p-2" data-testid="chat-group-available-users">
                  {availableGroupParticipants.length ? availableGroupParticipants.map((participant) => (
                    <div key={participant.userId} className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60">
                      {renderParticipantAvatar(participant, "h-8 w-8")}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-black">{participant.displayName}</p>
                        <p className="truncate text-[10px] font-bold text-muted-foreground">
                          {[participant.roleName, participant.email].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0 rounded-lg px-3 text-[10px] font-black"
                        disabled={Boolean(addingGroupMemberId)}
                        onClick={() => void addGroupMember(participant)}
                        data-testid="chat-group-add-member"
                      >
                        {addingGroupMemberId === participant.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "افزودن"}
                      </Button>
                    </div>
                  )) : (
                    <p className="px-2 py-5 text-center text-[11px] font-bold text-muted-foreground">همکار واجد شرایط دیگری پیدا نشد.</p>
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <h2 className="text-xs font-black text-destructive">بایگانی گروه</h2>
                <p className="mt-1 text-[11px] font-bold leading-5 text-muted-foreground">
                  گروه از فهرست همه اعضا حذف می‌شود، اما پیام‌ها، فایل‌ها و سوابق آن حفظ خواهند شد.
                </p>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="mt-3 h-9 rounded-lg text-xs font-black"
                  onClick={() => {
                    setGroupToArchive(activeThread);
                    setIsGroupSettingsOpen(false);
                  }}
                  data-testid="chat-group-archive-button"
                >
                  <Trash2 className="ml-1.5 h-4 w-4" />
                  حذف گروه از فهرست
                </Button>
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewAttachment)} onOpenChange={(open) => !open && setPreviewAttachment(null)}>
        <DialogContent className="flex h-[min(88dvh,52rem)] w-[calc(100vw-1rem)] max-w-5xl flex-col overflow-hidden p-0" dir="rtl">
          <DialogHeader className="shrink-0 border-b border-border px-4 py-3 text-right">
            <DialogTitle className="truncate pl-10 text-sm font-black">{previewAttachment?.filename}</DialogTitle>
            <DialogDescription className="text-[11px] font-bold">پیش‌نمایش فایل در برنامه</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/30 p-2 sm:p-4" data-testid="chat-attachment-preview-dialog">
            {previewAttachment?.attachmentType === "image" && previewAttachment.previewUrl && (
              <img src={previewAttachment.previewUrl} alt={previewAttachment.filename} className="max-h-full max-w-full object-contain" />
            )}
            {previewAttachment?.contentType.split(";")[0].trim().toLowerCase() === "application/pdf" && previewAttachment.previewUrl && (
              <iframe
                src={previewAttachment.previewUrl}
                title={previewAttachment.filename}
                className="h-full min-h-[60dvh] w-full rounded-md border-0 bg-background"
                data-testid="chat-pdf-preview"
              />
            )}
          </div>
          {previewAttachment?.downloadUrl && (
            <div className="shrink-0 border-t border-border px-4 py-3">
              <Button asChild variant="outline" className="h-9 w-full rounded-lg text-xs font-black sm:w-auto">
                <a href={previewAttachment.downloadUrl} target="_blank" rel="noreferrer">
                  <Download className="ml-2 h-4 w-4" />
                  دانلود فایل
                </a>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        isOpen={Boolean(groupToArchive)}
        onClose={() => setGroupToArchive(null)}
        onConfirm={archiveGroup}
        title="حذف گروه از فهرست"
        description="این گروه برای همه اعضا بایگانی می‌شود. پیام‌ها، فایل‌ها و سوابق فعالیت حذف نخواهند شد."
        itemName={groupToArchive ? displayNameForThread(groupToArchive, currentUser?.id) : undefined}
        confirmLabel="تایید و بایگانی گروه"
        pendingLabel="در حال بایگانی..."
      />
    </div>
  );
}
