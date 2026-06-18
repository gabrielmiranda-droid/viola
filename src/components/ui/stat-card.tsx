import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";

const toneStyles = {
  default: {
    border: "border-t-accent/60",
    icon: "border-accent/20 bg-accent/10 text-accent shadow-[0_0_18px_rgba(212,175,55,0.22)]",
  },
  success: {
    border: "border-t-green-400/60",
    icon: "border-green-400/20 bg-green-400/10 text-green-300 shadow-[0_0_18px_rgba(67,209,124,0.18)]",
  },
  warning: {
    border: "border-t-amber-400/60",
    icon: "border-amber-400/20 bg-amber-400/10 text-amber-200 shadow-[0_0_18px_rgba(245,165,36,0.18)]",
  },
  danger: {
    border: "border-t-red-400/60",
    icon: "border-red-400/20 bg-red-400/10 text-red-200 shadow-[0_0_18px_rgba(240,82,82,0.18)]",
  },
};

export function StatCard({
  title,
  value,
  note,
  icon,
  tone = "default",
}: {
  title: string;
  value: string;
  note?: string;
  icon?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const styles = toneStyles[tone];

  return (
    <Card className={cn("min-h-32 border-t-2", styles.border)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted">{title}</p>
          <p className="mt-2 truncate text-4xl font-black tracking-tight text-foreground">
            {value}
          </p>
        </div>
        {icon ? (
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border",
              styles.icon,
            )}
          >
            {icon}
          </div>
        ) : null}
      </div>
      {note ? <p className="mt-3 text-sm text-zinc-400">{note}</p> : null}
    </Card>
  );
}
