import Link from "next/link";
import { cn } from "@/lib/utils";

/** Filtro por categoria via query string (?categoria=...) — funciona em server components. */
export function CategoryFilter({
  categories,
  active,
  basePath,
  extraParams,
  param = "categoria",
  valueMap,
}: {
  categories: string[];
  active?: string;
  basePath: string;
  extraParams?: Record<string, string | undefined>;
  param?: string;
  /** rótulo exibido → valor na query string (padrão: o próprio rótulo) */
  valueMap?: Record<string, string>;
}) {
  const href = (value?: string) => {
    const qs = new URLSearchParams();
    Object.entries(extraParams ?? {}).forEach(([k, v]) => v && qs.set(k, v));
    if (value) qs.set(param, value);
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  const item = (label: string, value?: string) => {
    const selected = (active ?? "") === (value ?? "");
    return (
      <Link
        key={label}
        href={href(value && valueMap ? valueMap[value] : value)}
        className={cn(
          "rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors",
          selected ? "border-brand bg-brand text-white" : "border-border text-muted hover:border-white/30 hover:text-white"
        )}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      {item("Todas")}
      {categories.map((c) => item(c, c))}
    </div>
  );
}
