import React from "react";

import { cn } from "@/lib/utils";

type AnimatedNumberProps = {
  value: number;
  format?: (value: number) => React.ReactNode;
  className?: string;
  durationMs?: number;
};

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AnimatedNumber({
  value,
  format = (nextValue) => nextValue.toLocaleString("fa-IR"),
  className,
  durationMs = 700,
}: AnimatedNumberProps) {
  const initialValue = prefersReducedMotion() ? value : 0;
  const [displayValue, setDisplayValue] = React.useState(initialValue);
  const currentValueRef = React.useRef(initialValue);

  React.useEffect(() => {
    if (prefersReducedMotion() || durationMs <= 0) {
      currentValueRef.current = value;
      setDisplayValue(value);
      return;
    }

    const startValue = currentValueRef.current;
    const difference = value - startValue;
    let startedAt: number | null = null;
    let frameId = 0;

    const tick = (timestamp: number) => {
      startedAt ??= timestamp;
      const progress = Math.min((timestamp - startedAt) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = startValue + difference * eased;

      currentValueRef.current = nextValue;
      setDisplayValue(nextValue);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
        return;
      }

      currentValueRef.current = value;
      setDisplayValue(value);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [durationMs, value]);

  return <span className={cn("tabular-nums", className)}>{format(Math.round(displayValue))}</span>;
}
