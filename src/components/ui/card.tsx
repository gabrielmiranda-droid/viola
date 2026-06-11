import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-line/90 bg-panel p-4 shadow-[0_1px_0_rgba(255,255,255,0.03)]",
        className,
      )}
      {...props}
    />
  );
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn("mx-auto w-full max-w-[1540px] px-4 py-5 sm:px-5 lg:px-7", className)}
      {...props}
    />
  );
}
