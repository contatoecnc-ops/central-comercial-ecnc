import { createClient } from "@supabase/supabase-js";

/** Somente no servidor. Ignora RLS — usar apenas após validar que o usuário é admin. */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
