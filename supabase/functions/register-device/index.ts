// Edge Function : enregistre l'appareil courant (jeton généré côté client et stocké en
// localStorage) pour compter les appareils connectés au tenant. Un appareil déjà connu est
// toujours accepté (met juste à jour last_seen_at) ; seul un appareil réellement nouveau peut
// être refusé s'il dépasserait la limite du forfait, pour ne jamais bloquer un appareil déjà en
// usage (voir aussi ProtectedRoute côté client, qui appelle cette fonction à chaque chargement).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Authentification requise" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { device_token, label } = await req.json();
    if (!device_token) throw new Error("device_token manquant");

    const {
      data: { user: callerUser },
      error: callerError,
    } = await callerClient.auth.getUser();
    if (callerError || !callerUser) throw new Error("Session invalide");

    const { data: profile, error: profileError } = await callerClient
      .from("profiles")
      .select("tenant_id")
      .eq("id", callerUser.id)
      .single();
    if (profileError || !profile) throw new Error("Profil introuvable");

    const { data: existing } = await adminClient
      .from("devices")
      .select("id")
      .eq("tenant_id", profile.tenant_id)
      .eq("device_token", device_token)
      .maybeSingle();

    if (existing) {
      const { error: updateError } = await adminClient
        .from("devices")
        .update({ last_seen_at: new Date().toISOString(), profile_id: callerUser.id })
        .eq("id", existing.id);
      if (updateError) throw updateError;
      return jsonResponse({ ok: true });
    }

    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .select("plan, extra_devices")
      .eq("id", profile.tenant_id)
      .single();
    if (tenantError || !tenant) throw new Error("Tenant introuvable");

    const { data: plan } = await adminClient
      .from("plans")
      .select("device_limit")
      .eq("id", tenant.plan)
      .maybeSingle();

    const { count } = await adminClient
      .from("devices")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", profile.tenant_id);

    const limit = (plan?.device_limit ?? 1) + (tenant.extra_devices ?? 0);
    if ((count ?? 0) >= limit) {
      throw new Error(
        "Limite d'appareils connectés atteinte pour votre forfait. Demandez au propriétaire du compte de révoquer un appareil ou d'en ajouter un depuis Abonnement.",
      );
    }

    const { error: insertError } = await adminClient.from("devices").insert({
      tenant_id: profile.tenant_id,
      profile_id: callerUser.id,
      device_token,
      label: label ?? null,
    });
    if (insertError) throw insertError;

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 400);
  }
});
