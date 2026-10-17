/** Normaliza nomes para comparação: sem acentos, minúsculas, espaços únicos. */
export function normalizeName(s: string) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
