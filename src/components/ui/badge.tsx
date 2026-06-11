import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const variants = {
  neutral: "border-line bg-white/5 text-slate-300",
  success: "border-green-400/25 bg-green-400/10 text-green-300",
  warning: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  danger: "border-red-400/25 bg-red-400/10 text-red-200",
  info: "border-accent/25 bg-accent/10 text-blue-200",
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: keyof typeof variants;
};

export function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
