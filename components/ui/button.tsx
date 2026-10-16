import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const variants = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  outline: "border border-border bg-transparent text-white hover:bg-white/5",
  ghost: "text-muted hover:text-white hover:bg-white/5",
  danger: "border border-red-900 text-red-400 hover:bg-red-950/50",
} as const;

const sizes = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
} as const;

type Style = { variant?: keyof typeof variants; size?: keyof typeof sizes };

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60";

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & Style) {
  return <button className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}

export function ButtonLink({
  className,
  variant = "primary",
  size = "md",
  ...props
}: React.ComponentProps<typeof Link> & Style) {
  return <Link className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}
