import type { ElementType, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EmptyStateAction = {
  label: string;
  onClick?: () => void;
  to?: string;
  icon?: ElementType;
  variant?: "default" | "outline" | "ghost";
};

type EmptyStateProps = {
  icon: ElementType;
  title: string;
  description: string;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  className?: string;
  compact?: boolean;
  children?: ReactNode;
};

function EmptyStateButton({ action }: { action: EmptyStateAction }) {
  const Icon = action.icon || ArrowLeft;
  const content = (
    <>
      {action.label}
      <Icon className="h-4 w-4" />
    </>
  );

  if (action.to) {
    return (
      <Button asChild variant={action.variant || "default"} className="h-10 rounded-xl text-xs font-black">
        <Link to={action.to}>{content}</Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={action.variant || "default"}
      onClick={action.onClick}
      className="h-10 rounded-xl text-xs font-black"
    >
      {content}
    </Button>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  className,
  compact = false,
  children,
}: EmptyStateProps) {
  return (
    <div
      data-empty-state
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/25 px-4 text-center",
        compact ? "py-8" : "py-12 md:py-14",
        className
      )}
      dir="rtl"
    >
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="text-sm font-black text-foreground md:text-base">{title}</h3>
      <p className="mt-2 max-w-xl text-xs font-bold leading-6 text-muted-foreground md:text-sm">{description}</p>
      {children ? <div className="mt-4 w-full max-w-2xl">{children}</div> : null}
      {(primaryAction || secondaryAction) && (
        <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
          {primaryAction ? <EmptyStateButton action={primaryAction} /> : null}
          {secondaryAction ? <EmptyStateButton action={secondaryAction} /> : null}
        </div>
      )}
    </div>
  );
}

export function EmptyTableRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-6">
        {children}
      </td>
    </tr>
  );
}

export const resetFiltersAction = (onClick: () => void): EmptyStateAction => ({
  label: "پاک کردن فیلترها",
  onClick,
  icon: RotateCcw,
  variant: "outline",
});
