// Edge Function : bloque/débloque un tenant depuis le panneau /admin. Même raisonnement que
// admin-list-tenants — pas de RLS cross-tenant côté client, tout passe par le service_role ici.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Authentification requise" }, 401);

  const callerClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const {
      data: { user: callerUser },
      error: callerError,
    } = await callerClient.auth.getUser();
    if (callerError || !callerUser) throw new Error("Session invalide");

    const { data: profile, error: profileError } = await callerClient
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", callerUser.id)
      .single();
    if (profileError || !profile?.is_platform_admin) {
      throw new Error("Accès réservé à l'administrateur de la plateforme");
    }

    const { tenant_id, blocked, reason } = await req.json();
    if (!tenant_id) throw new Error("tenant_id manquant");

    const { error: updateError } = await adminClient
      .from("tenants")
      .update({
        blocked_at: blocked ? new Date().toISOString() : null,
        blocked_reason: blocked ? reason ?? null : null,
      })
      .eq("id", tenant_id);
    if (updateError) throw updateError;

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 400);
  }
});
