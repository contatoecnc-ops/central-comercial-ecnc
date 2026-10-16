import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const tones = {
  default: "text-white",
  danger: "text-red-400",
  warn: "text-yellow-400",
  ok: "text-emerald-400",
} as const;

export function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: keyof typeof tones;
}) {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={cn("mt-2 text-4xl font-extrabold tabular-nums", tones[tone])}>{value}</p>
    </Card>
  );
}
