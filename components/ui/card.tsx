import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-card", className)} {...props} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-white/5", className)} />;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <Card className="border-dashed p-10 text-center text-sm text-muted">{children}</Card>
  );
}
