// Edge Function : résiliation (et réactivation) en libre-service, depuis /billing. La page
// annonce "Sans engagement" depuis le début — jusqu'ici rien ne permettait à un client de tenir
// cette promesse lui-même. `cancel: true` bascule cancel_at_period_end sur Stripe : l'abonnement
// reste actif et facturé jusqu'à la fin de la période déjà payée (pas de remboursement au
// prorata), puis se termine tout seul. `cancel: false` annule cette résiliation programmée.

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  try {
    const { cancel } = await req.json();
    if (typeof cancel !== "boolean") throw new Error("Paramètre 'cancel' manquant");

    const { data: tenant, error: tenantError } = await supabase.from("tenants").select("*").single();
    if (tenantError) throw tenantError;

    if (!tenant.stripe_subscription_id) {
      throw new Error("Aucun abonnement actif sur ce compte.");
    }

    const subscription = await stripePost(`subscriptions/${tenant.stripe_subscription_id}`, stripeSecretKey, {
      cancel_at_period_end: cancel ? "true" : "false",
    });

    const { error: updateError } = await supabase
      .from("tenants")
      .update({ cancel_at_period_end: subscription.cancel_at_period_end === true })
      .eq("id", tenant.id);
    if (updateError) throw updateError;

    return new Response(JSON.stringify({ ok: true, cancel_at_period_end: subscription.cancel_at_period_end }), {
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
