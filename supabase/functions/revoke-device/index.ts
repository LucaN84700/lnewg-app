// Edge Function : le owner révoque un appareil connecté, libérant un slot d'appareil. Si
// l'appareil révoqué est celui utilisé par la personne encore connectée dessus, elle devra
// repasser par register-device (donc par la vérification de limite) à son prochain chargement.

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
    const { device_id } = await req.json();
    if (!device_id) throw new Error("device_id manquant");

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
      throw new Error("Seul le propriétaire du compte peut révoquer un appareil");
    }

    const { data: device, error: deviceError } = await adminClient
      .from("devices")
      .select("tenant_id")
      .eq("id", device_id)
      .single();
    if (deviceError || !device) throw new Error("Appareil introuvable");
    if (device.tenant_id !== callerProfile.tenant_id) {
      throw new Error("Cet appareil n'appartient pas à votre compte");
    }

    const { error: deleteError } = await adminClient.from("devices").delete().eq("id", device_id);
    if (deleteError) throw deleteError;

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 400);
  }
});
