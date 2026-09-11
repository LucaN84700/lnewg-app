// Edge Function : le owner d'un tenant crée un compte pour un coéquipier (email + mot de passe
// temporaire). Nécessite le service role car auth.admin.createUser() n'est pas accessible au
// client, et parce que l'insertion dans auth.users déclenche handle_new_user() qui doit recevoir
// invited_tenant_id dans les métadonnées pour rattacher le nouveau compte au tenant du owner au
// lieu de lui créer son propre tenant (voir migration 0022).

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
    const { email, password, full_name } = await req.json();
    if (!email || !password || !full_name) {
      throw new Error("email, password et full_name sont requis");
    }
    if (String(password).length < 6) {
      throw new Error("Le mot de passe doit faire au moins 6 caractères");
    }

    const {
      data: { user: callerUser },
      error: callerError,
    } = await callerClient.auth.getUser();
    if (callerError || !callerUser) throw new Error("Session invalide");

    const { data: callerProfile, error: profileError } = await callerClient
      .from("profiles")
      .select("tenant_id, role")
      .eq("id", callerUser.id)
      .single();
    if (profileError || !callerProfile) throw new Error("Profil introuvable");
    if (callerProfile.role !== "owner") {
      throw new Error("Seul le propriétaire du compte peut ajouter un utilisateur");
    }

    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .select("plan, extra_seats")
      .eq("id", callerProfile.tenant_id)
      .single();
    if (tenantError || !tenant) throw new Error("Tenant introuvable");

    const { data: plan, error: planError } = await adminClient
      .from("plans")
      .select("seat_limit")
      .eq("id", tenant.plan)
      .maybeSingle();
    if (planError) throw new Error(planError.message);
    const seatLimit = (plan?.seat_limit ?? 1) + tenant.extra_seats;

    const { count: currentSeats, error: countError } = await adminClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", callerProfile.tenant_id);
    if (countError) throw new Error(countError.message);

    if ((currentSeats ?? 0) >= seatLimit) {
      throw new Error(
        `Limite de ${seatLimit} utilisateur${seatLimit > 1 ? "s" : ""} atteinte pour votre forfait`,
      );
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        invited_tenant_id: callerProfile.tenant_id,
      },
    });
    if (createError) throw new Error(createError.message);

    return jsonResponse({ id: created.user?.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 400);
  }
});
