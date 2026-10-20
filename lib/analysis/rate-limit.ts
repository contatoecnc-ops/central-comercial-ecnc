/**
 * Limite de requisições por IP, em memória do processo.
 * LIMITAÇÃO: em ambiente serverless (Vercel) cada instância tem o próprio contador e ele zera a cada cold start,
 * então o limite efetivo é "por instância", não global. Serve como freio a abuso casual e a força bruta lenta;
 * a defesa real do endpoint é o token longo (≥ 40 caracteres) comparado em tempo constante.
 */
const WINDOW_MS = 60 * 60 * 1000;
export const RATE_LIMIT = 30;

const hits = new Map<string, number[]>();

export function rateLimit(ip: string, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(ip, recent);
    return { ok: false, retryAfterSec: Math.ceil((recent[0] + WINDOW_MS - now) / 1000) };
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    hits.forEach((v, k) => {
      if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    });
  }
  return { ok: true, retryAfterSec: 0 };
}
