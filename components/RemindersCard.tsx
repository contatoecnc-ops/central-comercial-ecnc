import { Megaphone } from "lucide-react";
import type { SellerReminder } from "@/types/database";

/** Lembretes do gestor — somente leitura; não renderiza nada se não houver lembretes. */
export function RemindersCard({ reminders }: { reminders: SellerReminder[] }) {
  if (reminders.length === 0) return null;
  return (
    <section className="mb-8 rounded-lg border border-brand/50 bg-brand/10 p-5" aria-label="Lembrete do gestor">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
        <Megaphone size={16} className="text-brand" /> Lembrete do gestor
      </h2>
      <ul className="space-y-2">
        {reminders.map((r) => (
          <li key={r.id} className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/90">
            {reminders.length > 1 && <span className="mr-2 text-brand">•</span>}
            {r.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
