// Edge Function : le owner retire un coéquipier de son tenant. Supprime le compte auth via le
// service role (auth.admin.deleteUser), ce qui cascade automatiquement sur profiles
// (profiles.id -> auth.users.id on delete cascade), libérant ainsi un siège.

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
    const { member_id } = await req.json();
    if (!member_id) throw new Error("member_id manquant");

    const {
      data: { user: callerUser },
      error: callerError,
    } = await callerClient.auth.getUser();
    if (callerError || !callerUser) throw new Error("Session invalide");

    if (member_id === callerUser.id) {
      throw new Error("Vous ne pouvez pas vous retirer vous-même");
    }

    const { data: callerProfile, error: profileError } = await callerClient
      .from("profiles")
      .select("tenant_id, role")
      .eq("id", callerUser.id)
      .single();
    if (profileError || !callerProfile) throw new Error("Profil introuvable");
    if (callerProfile.role !== "owner") {
      throw new Error("Seul le propriétaire du compte peut retirer un utilisateur");
    }

    const { data: targetProfile, error: targetError } = await adminClient
      .from("profiles")
      .select("tenant_id")
      .eq("id", member_id)
      .single();
    if (targetError || !targetProfile) throw new Error("Utilisateur introuvable");
    if (targetProfile.tenant_id !== callerProfile.tenant_id) {
      throw new Error("Cet utilisateur n'appartient pas à votre compte");
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(member_id);
    if (deleteError) throw new Error(deleteError.message);

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 400);
  }
});
