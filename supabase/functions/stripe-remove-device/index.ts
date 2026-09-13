// Edge Function : le owner retire un appareil supplémentaire qu'il avait acheté (self-service),
// typiquement après avoir révoqué un appareil dans Réglages et n'ayant plus besoin de payer ce
// slot en plus. Même principe que stripe-remove-seat : avoir au prorata, mise à jour de
// tenants.extra_devices répercutée par le webhook Stripe.

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

async function stripeDelete(path: string, secretKey: string, body: Record<string, string>) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "DELETE",
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
      throw new Error("Seul le propriétaire du compte peut retirer un appareil");
    }

    const { data: tenant, error: tenantError } = await callerClient
      .from("tenants")
      .select("stripe_subscription_id, extra_devices, plan")
      .eq("id", profile.tenant_id)
      .single();
    if (tenantError || !tenant) throw new Error("Tenant introuvable");
    if (!tenant.stripe_subscription_id || tenant.extra_devices <= 0) {
      throw new Error("Aucun appareil supplémentaire à retirer");
    }

    const { data: plan } = await callerClient.from("plans").select("device_limit").eq("id", tenant.plan).maybeSingle();
    const { count: deviceCount } = await callerClient
      .from("devices")
      .select("id", { count: "exact", head: true });

    const newCapacity = (plan?.device_limit ?? 1) + (tenant.extra_devices - 1);
    if ((deviceCount ?? 0) > newCapacity) {
      throw new Error(
        "Révoque d'abord un appareil depuis Réglages > Appareils avant de diminuer le nombre d'appareils",
      );
    }

    const subscription = await stripeGet(`subscriptions/${tenant.stripe_subscription_id}`, stripeSecretKey);
    const existingItem = subscription.items.data.find(
      (item: { price?: { id?: string } }) =>
        item.price?.id === extraDevicePriceId || item.price?.id === extraDevicePriceIdAnnual,
    );
    if (!existingItem) throw new Error("Aucun appareil supplémentaire trouvé sur l'abonnement");

    const newQuantity = (existingItem.quantity ?? 0) - 1;
    if (newQuantity > 0) {
      await stripePost(`subscription_items/${existingItem.id}`, stripeSecretKey, {
        quantity: String(newQuantity),
        proration_behavior: "create_prorations",
      });
    } else {
      await stripeDelete(`subscription_items/${existingItem.id}`, stripeSecretKey, {
        proration_behavior: "create_prorations",
      });
    }

    // Écrit extra_devices directement plutôt que d'attendre le webhook Stripe (asynchrone, peut
    // prendre plusieurs secondes) : l'UI reflète ainsi le changement sans délai. Le webhook reste
    // la source de vérité en cas de désaccord ultérieur.
    await callerClient.from("tenants").update({ extra_devices: Math.max(newQuantity, 0) }).eq("id", profile.tenant_id);

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 400);
  }
});
