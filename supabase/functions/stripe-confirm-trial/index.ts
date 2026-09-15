// Edge Function : appelée quand le propriétaire clique "Continuer avec Master" (bandeau sur
// /billing en fin d'essai). Crée l'abonnement Stripe réel en utilisant la carte déjà enregistrée
// (trial_card_saved_at) — pas de redirection, pas de nouvelle saisie de carte. Met à jour le
// tenant directement à partir de la réponse Stripe plutôt que d'attendre le webhook, pour un
// retour instantané côté UI (le webhook fera de toute façon la même mise à jour ensuite, sans
// dégât si les deux écrivent la même chose).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

const statusMap: Record<string, string> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  canceled: "canceled",
  unpaid: "past_due",
  incomplete: "past_due",
  incomplete_expired: "canceled",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Authentification requise" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY non configurée" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const callerClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { data: tenant, error: tenantError } = await callerClient.from("tenants").select("*").single();
    if (tenantError) throw tenantError;

    if (tenant.stripe_subscription_id) {
      return new Response(JSON.stringify({ error: "Un abonnement est déjà actif sur ce compte." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!tenant.stripe_customer_id || !tenant.trial_card_saved_at) {
      return new Response(
        JSON.stringify({ error: "Aucune carte enregistrée. Ajoute une carte avant de continuer." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: masterPlan, error: planError } = await callerClient
      .from("plans")
      .select("stripe_price_id")
      .eq("id", "master")
      .single();
    if (planError) throw planError;

    const subscription = await stripePost("subscriptions", stripeSecretKey, {
      customer: tenant.stripe_customer_id,
      "items[0][price]": masterPlan.stripe_price_id,
      "items[0][quantity]": "1",
    });

    const currentPeriodEnd = subscription.items?.data?.[0]?.current_period_end ?? subscription.current_period_end;

    const { error: updateError } = await adminClient
      .from("tenants")
      .update({
        stripe_subscription_id: subscription.id,
        subscription_status: statusMap[subscription.status] ?? "active",
        ...(currentPeriodEnd ? { current_period_end: new Date(currentPeriodEnd * 1000).toISOString() } : {}),
        plan: "master",
      })
      .eq("id", tenant.id);
    if (updateError) throw updateError;

    return new Response(JSON.stringify({ ok: true, status: subscription.status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
