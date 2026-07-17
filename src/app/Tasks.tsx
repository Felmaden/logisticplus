import React, { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { 
  Plus, 
  Calendar, 
  AlertCircle, 
  Search, 
  Trash2, 
  Edit2, 
  Clock,
  Ship,
  TrendingUp,
  CheckCircle,
  Layout,
  Trash,
  History
} from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Task, TaskStatus } from "../types";
import { cn } from "@/lib/utils";
import { format, addDays } from "date-fns-jalali";
import { motion, AnimatePresence } from "motion/react";
import { DeleteConfirmDialog } from "@/src/components/DeleteConfirmDialog";
import { toast } from "sonner";
import { EmptyState, resetFiltersAction } from "@/src/components/EmptyState";
import { AnimatedNumber } from "@/src/components/AnimatedNumber";
import { getShamsiDatePart, getTehranTimePart, ShamsiDateTimeField } from "@/src/components/ShamsiDateTimeField";
import { TaskAssignmentHistory } from "@/src/components/tasks/TaskAssignmentHistory";
import type { TaskEvent } from "@/src/types";

const PriorityBadge = ({ priority }: { priority: string }) => {
  const styles: Record<string, string> = {
    LOW: "bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-300",
    MEDIUM: "bg-sky-500/10 text-sky-700 border-sky-500/25 dark:text-sky-300",
    HIGH: "bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-300",
    URGENT: "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-300",
  };
  const labels: Record<string, string> = {
    LOW: "عادی",
    MEDIUM: "متوسط",
    HIGH: "مهم",
    URGENT: "فوری",
  };
  const isUrgent = priority === "URGENT";
  return (
    <Badge variant="outline" className={cn(styles[priority] || "", "text-[11px] font-black px-2 py-0.5 h-5 border leading-none", isUrgent && "urgent-pulse")}>
      {labels[priority] || priority}
    </Badge>
  );
};

function TaskListSkeleton() {
  return (
    <div className="flex flex-col gap-3" data-testid="tasks-list-skeleton">
      {Array.from({ length: 5 }).map((_, index) => (
        <Card key={index} className="rounded-xl border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)] dark:border-border/90 dark:bg-card dark:shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-48 max-w-[55vw]" />
                <Skeleton className="h-5 w-16 rounded-lg" />
              </div>
              <Skeleton className="h-3 w-72 max-w-[70vw]" />
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-4 lg:flex lg:items-center lg:gap-8">
              <Skeleton className="h-9 w-20 rounded-lg" />
              <Skeleton className="h-9 w-24 rounded-lg" />
              <Skeleton className="h-9 w-28 rounded-lg" />
              <Skeleton className="h-9 w-28 rounded-lg" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function shipmentCustomerCode(shipment: any) {
  return shipment?.customerCode || shipment?.customerId || shipment?.customerName || "";
}

const TaskListItem = ({ 
  task, 
  onEdit, 
  onDelete,
  onStatusChange,
  onHistory,
}: { 
  task: Task, 
  onEdit: (task: Task) => void,
  onDelete: (id: string) => void,
  onStatusChange: (task: Task, status: TaskStatus) => void,
  onHistory: (task: Task) => void,
  key?: React.Key
}) => {
  const users = useAppStore(state => state.users);
  const shipments = useAppStore(state => state.shipments);
  
  const assignedUser = React.useMemo(() => users.find(u => u.id === task.assignedToUserId), [users, task.assignedToUserId]);
  const linkedShipment = React.useMemo(() => shipments.find(s => s.id === task.shipmentId), [shipments, task.shipmentId]);

  const statusConfig = {
    TODO: { label: "در انتظار", color: "text-slate-700 bg-slate-100 border-slate-300 dark:text-slate-300 dark:bg-slate-900/50 dark:border-slate-800" },
    ASSIGNED: { label: "ارجاع شده", color: "text-sky-700 bg-sky-500/10 border-sky-500/25 dark:text-sky-300" },
    IN_PROGRESS: { label: "در حال انجام", color: "text-primary bg-primary/10 border-primary/25" },
    WAITING: { label: "در انتظار", color: "text-amber-700 bg-amber-500/10 border-amber-500/25 dark:text-amber-300" },
    DONE: { label: "تکمیل شده", color: "text-emerald-700 bg-emerald-500/10 border-emerald-500/25 dark:text-emerald-300" }
  };

  const extendedStatusConfig = {
    ...statusConfig,
    BLOCKED: { label: "مسدود", color: "text-rose-700 bg-rose-500/10 border-rose-500/25 dark:text-rose-300" },
    CANCELLED: { label: "لغو شده", color: "text-slate-600 bg-slate-100 border-slate-300 dark:text-slate-300 dark:bg-slate-900/50 dark:border-slate-800" }
  };

  const config = extendedStatusConfig[task.status] || extendedStatusConfig.TODO;
  const isUrgent = task.priority === "URGENT";

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="group"
    >
      <div
        className={cn(
          "flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-[0_16px_34px_rgba(15,23,42,0.12)] md:flex-row md:items-center dark:border-border/90 dark:bg-card dark:shadow-[0_10px_24px_rgba(15,23,42,0.06)] dark:hover:border-primary/35 dark:hover:bg-muted/35 dark:hover:shadow-[0_16px_34px_rgba(37,99,235,0.11)]",
          isUrgent && "urgent-pulse border-rose-300/80 bg-rose-50/80 dark:bg-rose-950/20"
        )}
      >
        {/* Title & Description Column */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h4 className="text-sm font-bold text-slate-950 transition-colors group-hover:text-primary dark:text-foreground">
              {task.title}
            </h4>
            <Badge variant="outline" className={cn("text-[11px] font-black px-2 py-0.5 h-5 border leading-none shrink-0", config.color)}>
              {config.label}
            </Badge>
          </div>
          {task.description && (
            <p className="text-[11px] text-muted-foreground line-clamp-1 opacity-80 leading-relaxed font-medium">
              {task.description}
            </p>
          )}
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 lg:flex lg:items-center gap-4 lg:gap-8 shrink-0">
          {/* Shipment Link */}
          {linkedShipment && (
            <div className="flex flex-col lg:w-24">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1 font-sans">رهگیری بار</span>
              <div className="flex items-center gap-1.5 text-primary">
                <Ship className="w-3 h-3" />
                <span className="text-xs font-bold font-mono">{linkedShipment.trackingNumber}</span>
              </div>
            </div>
          )}

          {/* Priority */}
          <div className="flex flex-col lg:w-20">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1 font-sans">اولویت</span>
            <PriorityBadge priority={task.priority} />
          </div>

          {/* Assigned User */}
          <div className="flex flex-col lg:w-32">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1 font-sans">مسئول</span>
            <div className="flex items-center gap-2">
              <Avatar className="w-5 h-5 border border-border/50">
                <AvatarImage src={assignedUser?.avatar} />
                <AvatarFallback className="bg-muted text-[10px] text-muted-foreground">
                  {assignedUser?.name?.[0] || '؟'}
                </AvatarFallback>
              </Avatar>
              <span className="truncate text-xs font-bold text-slate-800 dark:text-foreground">{assignedUser?.name || "بدون مشخص"}</span>
            </div>
          </div>

          {/* Deadline */}
          <div className="flex flex-col lg:w-28">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1 font-sans">مهلت نهایی</span>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="w-3 h-3" />
                <span className="text-xs font-mono font-bold tracking-tight">{task.dueDate}</span>
              </div>
              {task.deadline && (
                <div className="flex items-center gap-1.5 text-rose-500">
                  <Clock className="w-3 h-3" />
                  <span className="text-xs font-bold tracking-tight">{task.deadline}</span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 justify-end">
            {task.status !== "DONE" && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="تکمیل وظیفه"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-500"
                onClick={() => onStatusChange(task, "DONE")}
              >
                <CheckCircle className="w-4 h-4" />
              </Button>
            )}
            {task.status !== "IN_PROGRESS" && task.status !== "DONE" && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="شروع وظیفه"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary"
                onClick={() => onStatusChange(task, "IN_PROGRESS")}
              >
                <Clock className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="تاریخچه وظیفه"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => onHistory(task)}
            >
              <History className="w-4 h-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              aria-label="ویرایش وظیفه"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => onEdit(task)}
            >
              <Edit2 className="w-4 h-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              aria-label="حذف وظیفه"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
              onClick={() => onDelete(task.id)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default function Tasks() {
  const allTasks = useAppStore(state => state.tasks);
  const currentUser = useAppStore(state => state.currentUser);
  const softDelete = useAppStore(state => state.softDelete);
  const users = useAppStore(state => state.users);
  const shipments = useAppStore(state => state.shipments);
  const organizationMembers = useAppStore(state => state.organizationMembers);
  const refreshTasks = useAppStore(state => state.refreshTasks);
  const fetchOrganizationMembers = useAppStore(state => state.fetchOrganizationMembers);
  const updateTaskStatusRemote = useAppStore(state => state.updateTaskStatusRemote);
  const fetchTaskEvents = useAppStore(state => state.fetchTaskEvents);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | TaskStatus>("ALL");
  const [taskScope, setTaskScope] = useState<"all" | "assignedToMe" | "assignedByMe" | "overdue" | "shipment" | "blocked">("all");
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [historyTask, setHistoryTask] = useState<Task | null>(null);
  const [historyEvents, setHistoryEvents] = useState<TaskEvent[]>([]);
  const [isTasksLoading, setIsTasksLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "MEDIUM" as const,
    assignedToUserId: "",
    dueDate: "",
    deadline: "",
    status: "TODO" as TaskStatus,
    shipmentId: ""
  });

  useEffect(() => {
    let isMounted = true;
    setIsTasksLoading(true);

    Promise.allSettled([refreshTasks(), fetchOrganizationMembers()])
      .then(([tasksResult, membersResult]) => {
        if (tasksResult.status === "rejected") {
          console.error("Could not refresh tasks.", tasksResult.reason);
        }
        if (membersResult.status === "rejected") {
          console.error("Could not load organization members.", membersResult.reason);
        }
      })
      .finally(() => {
        if (isMounted) setIsTasksLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [refreshTasks, fetchOrganizationMembers]);

  const assigneeOptions = useMemo(() => {
    if (organizationMembers.length) {
      return organizationMembers
        .filter((member) => member.active)
        .map((member) => ({
          id: member.userId,
          name: member.displayName,
          role: member.roleName,
        }));
    }
    return users.map((user) => ({ id: user.id, name: user.name, role: user.role }));
  }, [organizationMembers, users]);

  const isTaskOverdue = (task: Task) => {
    if (!task.dueDate || task.status === "DONE" || task.status === "CANCELLED") return false;
    const parsed = new Date(String(task.dueDate).replace(/\//g, "-"));
    if (Number.isNaN(parsed.getTime())) return false;
    return parsed.getTime() < Date.now();
  };

  const filteredTasks = useMemo(() => {
    return allTasks.filter(t => {
      const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           t.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesPriority = priorityFilter === "ALL" || t.priority === priorityFilter;
      const matchesStatus = statusFilter === "ALL" || t.status === statusFilter;
      const matchesScope =
        taskScope === "all" ||
        (taskScope === "assignedToMe" && t.assignedToUserId === currentUser?.id) ||
        (taskScope === "assignedByMe" && t.assignedByUserId === currentUser?.id) ||
        (taskScope === "overdue" && isTaskOverdue(t)) ||
        (taskScope === "shipment" && Boolean(t.shipmentId)) ||
        (taskScope === "blocked" && t.status === "BLOCKED");
      return matchesSearch && matchesPriority && matchesStatus && matchesScope;
    });
  }, [allTasks, searchTerm, priorityFilter, statusFilter, taskScope, currentUser?.id]);
  const resetTaskFilters = () => {
    setSearchTerm("");
    setPriorityFilter("ALL");
    setStatusFilter("ALL");
    setTaskScope("all");
  };

  const handleOpenAdd = () => {
    setEditingTask(null);
    setFormData({
      title: "",
      description: "",
      priority: "MEDIUM",
      assignedToUserId: assigneeOptions[0]?.id || "",
      dueDate: format(addDays(new Date(), 15), "yyyy/MM/dd"),
      deadline: "09:00",
      status: "TODO",
      shipmentId: ""
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || "",
      priority: task.priority as any,
      assignedToUserId: task.assignedToUserId || "",
      dueDate: getShamsiDatePart(task.dueDate) || "",
      deadline: task.deadline || getTehranTimePart(task.dueDate),
      status: task.status,
      shipmentId: task.shipmentId || ""
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.title) return;
    const assignedUser = assigneeOptions.find(u => u.id === formData.assignedToUserId);
    const finalData = {
      ...formData,
      assignedToName: assignedUser?.name || "",
      assignedByName: "مدیر سیستم"
    };
    try {
      const response = await fetch(editingTask ? `/api/tasks/${editingTask.id}` : "/api/tasks", {
        method: editingTask ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalData),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error?.message || "Could not save task.");
      }
      await refreshTasks();
      toast.success(editingTask ? "Task updated" : "Task created");
      setIsDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save task.");
    }
  };

  const handleTaskStatusChange = async (task: Task, status: TaskStatus) => {
    try {
      await updateTaskStatusRemote(task.id, { status });
      await refreshTasks();
      toast.success("Task status updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update task status.");
    }
  };

  const handleOpenHistory = async (task: Task) => {
    setHistoryTask(task);
    setHistoryEvents([]);
    setIsHistoryLoading(true);
    try {
      const events = await fetchTaskEvents(task.id);
      setHistoryEvents(events);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load task history.");
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const stats = [
    { label: "کل فعالیت‌ها", value: allTasks.length, icon: Layout, color: "text-muted-foreground", bg: "bg-muted" },
    { label: "در جریان", value: allTasks.filter(t => t.status === "IN_PROGRESS").length, icon: TrendingUp, color: "text-primary", bg: "bg-primary/5" },
    { label: "تکمیل شده", value: allTasks.filter(t => t.status === "DONE").length, icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-500/5" },
    { label: "اولویت بالا", value: allTasks.filter(t => t.priority === "HIGH" || t.priority === "URGENT").length, icon: AlertCircle, color: "text-rose-500", bg: "bg-rose-500/5" },
  ];

  return (
    <div className="app-page min-h-full flex flex-col gap-5 font-sans" dir="rtl">
      {/* Header & Stats Dashboard */}
      <div className="flex flex-col gap-4 shrink-0">
        <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] sm:flex-row sm:items-center md:p-5 dark:border-border/90 dark:bg-card dark:shadow-[0_12px_28px_rgba(15,23,42,0.07)]">
          <div className="space-y-1.5">
            <h1 className="text-xl md:text-2xl font-black text-foreground tracking-tight">لیست وظایف عملیاتی</h1>
            <p className="text-xs font-medium text-slate-600 md:text-sm dark:text-muted-foreground">پایش و مدیریت هوشمند تمام وظایف پرسنل در یک نگاه.</p>
          </div>
          <Button data-testid="open-task-dialog" onClick={handleOpenAdd} className="bg-primary hover:bg-primary/90 text-primary-foreground font-black h-10 px-5 rounded-xl shadow-sm transition-all active:scale-95 text-xs">
            <Plus className="w-5 h-5 ml-2 stroke-[3]" />
            ثبت فعالیت جدید
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1, duration: 0.4 }}
            >
              <Card className="relative rounded-xl border-slate-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-[0_16px_34px_rgba(15,23,42,0.12)] dark:border-border/90 dark:bg-card dark:shadow-[0_10px_24px_rgba(15,23,42,0.06)] dark:hover:border-primary/35 dark:hover:bg-muted/35 dark:hover:shadow-[0_16px_34px_rgba(37,99,235,0.11)]">
                <div className="relative z-10 flex items-center gap-4">
                  <div className={cn("rounded-xl border border-border/60 p-2.5", stat.bg)}>
                    <stat.icon className={cn("w-5 h-5", stat.color)} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-600 dark:text-muted-foreground">{stat.label}</p>
                    <AnimatedNumber value={stat.value} className="block text-2xl font-black text-slate-950 dark:text-foreground" />
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4 shrink-0 px-1">
        <div className="relative flex-1 group">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input 
            placeholder="جستجوی در عنوان یا شرح وظایف..." 
            className="h-12 w-full rounded-2xl border-slate-200 bg-white pr-12 text-sm shadow-[0_8px_20px_rgba(15,23,42,0.06)] focus:ring-2 focus:ring-primary/20 dark:border-border dark:bg-card"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_8px_20px_rgba(15,23,42,0.06)] dark:border-border dark:bg-card dark:shadow-sm">
          <div className="flex gap-1 border-l border-border pl-2">
            {[
              { id: "ALL", label: "همه وضعیت‌ها" },
              { id: "TODO", label: "در انتظار" },
              { id: "ASSIGNED", label: "ارجاع شده" },
              { id: "IN_PROGRESS", label: "در حال انجام" },
              { id: "WAITING", label: "در انتظار" },
              { id: "DONE", label: "تکمیل شده" }
            ].concat([
              { id: "BLOCKED", label: "مسدود" },
              { id: "CANCELLED", label: "لغو شده" }
            ]).map((s) => (
              <button
                key={s.id}
                onClick={() => setStatusFilter(s.id as any)}
                className={cn(
                  "px-3 py-2 rounded-lg text-xs font-bold transition-all",
                  statusFilter === s.id 
                    ? "bg-primary/20 text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 mr-auto">
            {["ALL", "LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={cn(
                  "px-3 py-2 rounded-lg text-xs font-bold transition-all",
                  priorityFilter === p 
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/10" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {p === "ALL" ? "همه اولویت‌ها" : p === "LOW" ? "عادی" : p === "MEDIUM" ? "متوسط" : p === "HIGH" ? "مهم" : "فوری"}
              </button>
            ))}
          </div>
        </div>
      </div>

        <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_8px_20px_rgba(15,23,42,0.06)] dark:border-border dark:bg-card dark:shadow-sm">
        {[
          { id: "all", label: "همه وظایف" },
          { id: "assignedToMe", label: "وظایف ارجاع شده به من" },
          { id: "assignedByMe", label: "وظایفی که من ارجاع داده‌ام" },
          { id: "overdue", label: "وظایف عقب‌افتاده" },
          { id: "shipment", label: "وظایف مرتبط با محموله" },
          { id: "blocked", label: "وظایف مسدود" },
        ].map((scope) => (
          <button
            key={scope.id}
            onClick={() => setTaskScope(scope.id as typeof taskScope)}
            className={cn(
              "rounded-lg px-3 py-2 text-xs font-black transition-colors",
              taskScope === scope.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {scope.label}
          </button>
        ))}
      </div>

      {/* Task List Content */}
      <div className="flex-1">
        <div className="flex flex-col gap-3">
          {isTasksLoading ? (
            <TaskListSkeleton />
          ) : (
            <AnimatePresence mode="popLayout">
              {filteredTasks.length > 0 ? (
                filteredTasks.map(task => (
                  <TaskListItem
                    key={task.id}
                    task={task}
                    onEdit={handleEdit}
                    onDelete={(id) => {
                      setTaskToDelete(id);
                      setIsDeleteDialogOpen(true);
                    }}
                    onStatusChange={handleTaskStatusChange}
                    onHistory={handleOpenHistory}
                  />
                ))
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-xl bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)] dark:bg-card dark:shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
                >
                  <EmptyState
                    icon={Layout}
                    title={allTasks.length === 0 ? "همه چیز مرتب است." : "نتیجه‌ای برای این فیلترها نیست."}
                    description={allTasks.length === 0 ? "در حال حاضر وظیفه فوری یا باز برای تیم شما ثبت نشده است." : "عبارت جستجو، وضعیت یا اولویت را کمی تغییر دهید تا وظایف مرتبط دوباره دیده شوند."}
                    primaryAction={allTasks.length === 0 ? { label: "تعریف وظیفه جدید", onClick: handleOpenAdd, icon: Plus } : resetFiltersAction(resetTaskFilters)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>


      {/* Edit/Create Modal */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground sm:max-w-md rounded-xl p-5 md:p-6 shadow-lg max-h-[92vh] overflow-y-auto custom-scrollbar" dir="rtl">
          <DialogHeader className="mb-4 md:mb-6">
            <DialogTitle className="text-xl md:text-2xl font-black flex items-center gap-3 md:gap-4">
              <div className="p-2 md:p-3 bg-primary/10 rounded-xl md:rounded-2xl">
                {editingTask ? <Edit2 className="w-5 h-5 md:w-6 md:h-6 text-primary" /> : <Plus className="w-5 h-5 md:w-6 md:h-6 text-primary" />}
              </div>
              <div className="flex flex-col text-right">
                <span>{editingTask ? "ویرایش فعالیت" : "تعریف جدید"}</span>
                <span className="text-[11px] font-bold text-muted-foreground mt-0.5 md:mt-1 uppercase tracking-wide leading-none">Ops Management System</span>
              </div>
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-4 md:gap-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">عنوان فعالیت</Label>
              <Input 
                className="bg-background border-border h-10 md:h-12 text-sm focus:ring-1 focus:ring-primary/50 rounded-xl md:rounded-2xl shadow-inner" 
                value={formData.title}
                onChange={e => setFormData({...formData, title: e.target.value})}
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">توضیحات تکمیلی</Label>
              <textarea 
                className="w-full bg-background border-border border rounded-xl md:rounded-2xl p-4 text-sm min-h-[80px] md:min-h-[100px] outline-none focus:ring-1 focus:ring-primary/50 resize-none shadow-inner"
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">اولویت</Label>
                <select 
                  className="w-full bg-background border border-border rounded-xl md:rounded-2xl h-10 md:h-12 text-sm px-4 appearance-none focus:ring-1 focus:ring-primary/50 shadow-inner"
                  value={formData.priority}
                  onChange={e => setFormData({...formData, priority: e.target.value as any})}
                >
                  <option value="LOW">عادی</option>
                  <option value="MEDIUM">متوسط</option>
                  <option value="HIGH">مهم</option>
                  <option value="URGENT">فوری</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">مسئول انجام</Label>
                <select 
                  className="w-full bg-background border border-border rounded-xl md:rounded-2xl h-10 md:h-12 text-sm px-4 appearance-none focus:ring-1 focus:ring-primary/50 shadow-inner"
                  value={formData.assignedToUserId}
                  onChange={e => setFormData({...formData, assignedToUserId: e.target.value})}
                >
                  {assigneeOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>

            <ShamsiDateTimeField
              label="تاریخ و ساعت ددلاین"
              date={formData.dueDate}
              time={formData.deadline}
              onDateChange={(dueDate) => setFormData((current) => ({ ...current, dueDate }))}
              onTimeChange={(deadline) => setFormData((current) => ({ ...current, deadline }))}
              triggerClassName="h-10 md:h-12 rounded-xl md:rounded-2xl text-sm"
            />

            <div className="space-y-2">
              <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">وضعیت کنونی</Label>
              <select 
                className="w-full bg-background border border-border rounded-xl md:rounded-2xl h-10 md:h-12 text-sm px-4 appearance-none focus:ring-1 focus:ring-primary/50 shadow-inner"
                value={formData.status}
                onChange={e => setFormData({...formData, status: e.target.value as any})}
              >
                <option value="TODO">در انتظار</option>
                <option value="ASSIGNED">ارجاع شده</option>
                <option value="IN_PROGRESS">در حال انجام</option>
                <option value="WAITING">در انتظار</option>
                <option value="BLOCKED">مسدود</option>
                <option value="DONE">تکمیل شده</option>
                <option value="CANCELLED">لغو شده</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">ارجاع به بارنامه</Label>
              <select 
                className="w-full bg-background border border-border rounded-xl md:rounded-2xl h-10 md:h-12 text-sm px-4 appearance-none focus:ring-1 focus:ring-primary/50 shadow-inner"
                value={formData.shipmentId}
                onChange={e => setFormData({...formData, shipmentId: e.target.value})}
              >
                <option value="">بدون ارجاع</option>
                {shipments.map(s => (
                  <option key={s.id} value={s.id}>{s.trackingNumber} - {shipmentCustomerCode(s)}</option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter className="gap-3 mt-6 md:mt-8">
            <Button variant="ghost" className="flex-1 text-muted-foreground hover:text-foreground h-10 md:h-12" onClick={() => setIsDialogOpen(false)}>انصراف</Button>
            <Button className="flex-[2] bg-primary text-primary-foreground font-black h-12 md:h-14 rounded-xl md:rounded-2xl shadow-xl shadow-primary/10" onClick={handleSubmit}>
              {editingTask ? "بروزرسانی نهایی" : "تایید و ثبت"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TaskAssignmentHistory
        open={Boolean(historyTask)}
        onOpenChange={(open) => {
          if (!open) setHistoryTask(null);
        }}
        taskTitle={historyTask?.title}
        events={historyEvents}
        isLoading={isHistoryLoading}
      />

      <DeleteConfirmDialog 
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => {
          if (taskToDelete) {
            softDelete(taskToDelete, "TASK");
            toast.message("وظیفه به سطل زباله منتقل شد", {
              description: "می‌توانید تا ۷ روز آینده آن را از بخش بایگانی بازیابی کنید.",
              icon: <Trash className="w-4 h-4 text-red-500" />
            });
          }
        }}
        itemName={allTasks.find(t => t.id === taskToDelete)?.title}
      />
    </div>
  );
}
