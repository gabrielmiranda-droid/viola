import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EmptyState({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-line bg-panel-strong/55 p-6 text-center text-sm text-muted",
        className,
      )}
    >
      {children}
    </div>
  );
}
