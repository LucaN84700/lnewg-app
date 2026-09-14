// Edge Function : liste tous les tenants pour le panneau /admin. Volontairement pas géré via RLS
// côté client (voir migration 0032) — une policy select "is_platform_admin" sur tenants cassait
// toute requête .single() de l'app pour le compte admin lui-même, dès qu'elle voyait plus d'une
// ligne. Le service_role bypass RLS, la vérification is_platform_admin se fait ici.

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

    const { data: tenants, error: tenantsError } = await adminClient
      .from("tenants")
      .select("*")
      .order("created_at", { ascending: false });
    if (tenantsError) throw tenantsError;

    return jsonResponse({ tenants });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 400);
  }
});
