import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  children,
  className,
}: {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-line bg-panel-strong/55 px-6 py-8 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-panel text-muted">
          {icon}
        </div>
      ) : null}
      {title ? <p className="font-semibold text-foreground">{title}</p> : null}
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      {children ? (
        <p className={cn("text-sm text-muted", (!!icon || !!title) && "mt-1")}>{children}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
