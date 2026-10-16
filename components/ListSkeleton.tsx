import { Skeleton } from "@/components/ui/card";

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div>
      <Skeleton className="mb-8 h-10 w-64" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}
