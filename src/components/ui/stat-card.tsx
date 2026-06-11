import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";

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
  return (
    <Card className="min-h-32">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted">{title}</p>
          <p className="mt-2 truncate text-3xl font-black tracking-normal text-foreground">
            {value}
          </p>
        </div>
        {icon ? (
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border",
              tone === "default" && "border-accent/20 bg-accent/10 text-accent",
              tone === "success" && "border-green-400/20 bg-green-400/10 text-green-300",
              tone === "warning" && "border-amber-400/20 bg-amber-400/10 text-amber-200",
              tone === "danger" && "border-red-400/20 bg-red-400/10 text-red-200",
            )}
          >
            {icon}
          </div>
        ) : null}
      </div>
      {note ? <p className="mt-2 text-sm text-zinc-400">{note}</p> : null}
    </Card>
  );
}
