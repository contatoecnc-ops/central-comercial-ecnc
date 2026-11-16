import { createSign } from "crypto";

const PEM_BEGIN = "-----BEGIN PRIVATE KEY-----";
const PEM_END = "-----END PRIVATE KEY-----";
export const INVALID_KEY_MESSAGE = "Chave privada do Google em formato inválido (confira a variável na Vercel)";

/** Normaliza a chave vinda de variável de ambiente e valida o formato PEM. Nunca inclui a chave em erros. */
export function normalizeGooglePrivateKey(raw: string): string {
  const key = raw
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
  if (!key.startsWith(PEM_BEGIN) || !key.endsWith(PEM_END)) throw new Error(INVALID_KEY_MESSAGE);
  // reconstrói o PEM (corpo em linhas de 64) para tolerar corpo colado em uma linha só
  const body = key.slice(PEM_BEGIN.length, key.length - PEM_END.length).replace(/\s+/g, "");
  if (!body || !/^[A-Za-z0-9+/]+=*$/.test(body)) throw new Error(INVALID_KEY_MESSAGE);
  return `${PEM_BEGIN}\n${body.match(/.{1,64}/g)!.join("\n")}\n${PEM_END}\n`;
}

export function hasGooglePrivateKey(): boolean {
  return !!(process.env.GOOGLE_PRIVATE_KEY?.trim() || process.env.GOOGLE_PRIVATE_KEY_BASE64?.trim());
}

/** Usa GOOGLE_PRIVATE_KEY_BASE64 (PEM inteiro em base64) quando existir; senão GOOGLE_PRIVATE_KEY. */
export function getGooglePrivateKey(): string {
  const b64 = process.env.GOOGLE_PRIVATE_KEY_BASE64?.trim();
  const raw = b64
    ? Buffer.from(b64.replace(/^["']+|["']+$/g, "").replace(/\s+/g, ""), "base64").toString("utf8")
    : process.env.GOOGLE_PRIVATE_KEY;
  if (!raw?.trim()) throw new Error("Credenciais do Google não configuradas");
  return normalizeGooglePrivateKey(raw);
}

/** Token OAuth de service account (JWT bearer). Somente servidor. */
export async function getGoogleAccessToken(scopes: string[]): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  if (!email || !hasGooglePrivateKey()) throw new Error("Credenciais do Google não configuradas");

  const key = getGooglePrivateKey();
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: email,
    scope: scopes.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  let signature: string;
  try {
    signature = createSign("RSA-SHA256").update(unsigned).sign(key).toString("base64url");
  } catch {
    // a mensagem original do OpenSSL não é repassada
    throw new Error(INVALID_KEY_MESSAGE);
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao autenticar no Google (${res.status}). Verifique e-mail e chave da service account.`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}
