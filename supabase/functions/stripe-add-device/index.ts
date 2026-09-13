// Edge Function : le owner ajoute un appareil supplémentaire (+5€/mois ou +54€/an selon
// l'intervalle de facturation en cours) à son abonnement Stripe existant, en self-service.
// Même principe que stripe-add-seat : modifie directement l'abonnement Stripe, c'est le webhook
// Stripe (customer.subscription.updated) qui répercute ensuite le changement sur
// tenants.extra_devices.

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

async function stripeGet(path: string, secretKey: string) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "Erreur Stripe");
  return data;
}

async function stripePost(path: string, secretKey: string, body: Record<string, string>) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "Erreur Stripe");
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Authentification requise" }, 401);
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const extraDevicePriceId = Deno.env.get("STRIPE_EXTRA_DEVICE_PRICE_ID");
  const extraDevicePriceIdAnnual = Deno.env.get("STRIPE_EXTRA_DEVICE_PRICE_ID_ANNUAL");
  if (!stripeSecretKey || !extraDevicePriceId || !extraDevicePriceIdAnnual) {
    return jsonResponse({ error: "Configuration Stripe incomplète" }, 500);
  }

  const callerClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  try {
    const {
      data: { user: callerUser },
      error: callerError,
    } = await callerClient.auth.getUser();
    if (callerError || !callerUser) throw new Error("Session invalide");

    const { data: profile, error: profileError } = await callerClient
      .from("profiles")
      .select("role, tenant_id")
      .eq("id", callerUser.id)
      .single();
    if (profileError || !profile) throw new Error("Profil introuvable");
    if (profile.role !== "owner") {
      throw new Error("Seul le propriétaire du compte peut ajouter un appareil");
    }

    const { data: tenant, error: tenantError } = await callerClient
      .from("tenants")
      .select("stripe_subscription_id")
      .eq("id", profile.tenant_id)
      .single();
    if (tenantError || !tenant) throw new Error("Tenant introuvable");
    if (!tenant.stripe_subscription_id) {
      throw new Error("Choisis d'abord un forfait avant d'ajouter un appareil");
    }

    const subscription = await stripeGet(`subscriptions/${tenant.stripe_subscription_id}`, stripeSecretKey);
    const baseInterval = subscription.items?.data?.[0]?.price?.recurring?.interval;
    const targetPriceId = baseInterval === "year" ? extraDevicePriceIdAnnual : extraDevicePriceId;

    const existingItem = subscription.items.data.find(
      (item: { price?: { id?: string } }) => item.price?.id === targetPriceId,
    );

    let newQuantity: number;
    if (existingItem) {
      newQuantity = (existingItem.quantity ?? 0) + 1;
      await stripePost(`subscription_items/${existingItem.id}`, stripeSecretKey, {
        quantity: String(newQuantity),
      });
    } else {
      newQuantity = 1;
      await stripePost("subscription_items", stripeSecretKey, {
        subscription: tenant.stripe_subscription_id,
        price: targetPriceId,
        quantity: "1",
      });
    }

    // Écrit extra_devices directement plutôt que d'attendre le webhook Stripe (asynchrone, peut
    // prendre plusieurs secondes) : l'UI reflète ainsi le changement sans délai. Le webhook reste
    // la source de vérité en cas de désaccord ultérieur (paiement refusé, etc.).
    const { error: syncError } = await callerClient
      .from("tenants")
      .update({ extra_devices: newQuantity })
      .eq("id", profile.tenant_id);
    if (syncError) console.error("Échec de la synchronisation immédiate d'extra_devices:", syncError);

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 400);
  }
});
