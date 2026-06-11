import {
  forwardRef,
  type ButtonHTMLAttributes,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

const variants = {
  primary:
    "bg-accent text-white shadow-[0_10px_24px_rgba(47,125,244,0.22)] hover:bg-blue-400 focus-visible:outline-accent",
  success:
    "bg-accent-2 text-black shadow-[0_10px_24px_rgba(67,209,124,0.16)] hover:bg-green-300 focus-visible:outline-accent-2",
  secondary:
    "border border-line bg-panel-strong text-foreground hover:border-accent/45 hover:bg-[#1c222c] focus-visible:outline-accent",
  danger:
    "bg-danger text-white shadow-[0_10px_24px_rgba(240,82,82,0.16)] hover:bg-red-400 focus-visible:outline-danger",
  warning:
    "bg-warning text-black hover:bg-amber-300 focus-visible:outline-warning",
  ghost: "text-muted hover:bg-white/6 hover:text-foreground",
};

const sizes = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-5 text-base",
  xl: "min-h-14 px-6 text-base",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition duration-200 active:scale-[0.98] disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});

type LinkButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children: ReactNode;
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export function LinkButton({
  href,
  className,
  variant = "secondary",
  size = "md",
  children,
  ...props
}: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition duration-200 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
