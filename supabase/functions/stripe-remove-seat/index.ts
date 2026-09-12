// Edge Function : le owner retire un siège supplémentaire qu'il avait acheté (self-service),
// typiquement après avoir retiré un coéquipier et n'ayant plus besoin de payer ce siège en plus.
// Diminue la quantité de l'item d'add-on sur l'abonnement Stripe existant (ou le supprime si la
// quantité tombe à 0), avec un avoir au prorata. Comme pour stripe-add-seat, c'est le webhook
// customer.subscription.updated qui répercute ensuite le changement sur tenants.extra_seats.

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
  const extraSeatPriceId = Deno.env.get("STRIPE_EXTRA_SEAT_PRICE_ID");
  const extraSeatPriceIdAnnual = Deno.env.get("STRIPE_EXTRA_SEAT_PRICE_ID_ANNUAL");
  if (!stripeSecretKey || !extraSeatPriceId || !extraSeatPriceIdAnnual) {
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
      throw new Error("Seul le propriétaire du compte peut retirer un siège");
    }

    const { data: tenant, error: tenantError } = await callerClient
      .from("tenants")
      .select("stripe_subscription_id, extra_seats, plan")
      .eq("id", profile.tenant_id)
      .single();
    if (tenantError || !tenant) throw new Error("Tenant introuvable");
    if (!tenant.stripe_subscription_id || tenant.extra_seats <= 0) {
      throw new Error("Aucun siège supplémentaire à retirer");
    }

    const { data: plan } = await callerClient.from("plans").select("seat_limit").eq("id", tenant.plan).maybeSingle();
    const { count: memberCount } = await callerClient
      .from("profiles")
      .select("id", { count: "exact", head: true });

    const newCapacity = (plan?.seat_limit ?? 1) + (tenant.extra_seats - 1);
    if ((memberCount ?? 0) > newCapacity) {
      throw new Error(
        "Retire d'abord un coéquipier depuis Réglages > Équipe avant de diminuer le nombre de sièges",
      );
    }

    const subscription = await stripeGet(`subscriptions/${tenant.stripe_subscription_id}`, stripeSecretKey);
    const existingItem = subscription.items.data.find(
      (item: { price?: { id?: string } }) => item.price?.id === extraSeatPriceId || item.price?.id === extraSeatPriceIdAnnual,
    );
    if (!existingItem) throw new Error("Aucun siège supplémentaire trouvé sur l'abonnement");

    if ((existingItem.quantity ?? 0) > 1) {
      await stripePost(`subscription_items/${existingItem.id}`, stripeSecretKey, {
        quantity: String(existingItem.quantity - 1),
        proration_behavior: "create_prorations",
      });
    } else {
      await stripeDelete(`subscription_items/${existingItem.id}`, stripeSecretKey, {
        proration_behavior: "create_prorations",
      });
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 400);
  }
});
