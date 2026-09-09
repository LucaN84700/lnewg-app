// Edge Function : crée une session Stripe Checkout pour souscrire (ou changer de) plan.
// Respecte la RLS via le JWT de l'appelant, ne touche jamais qu'au tenant de l'utilisateur
// connecté. Crée le Customer Stripe au premier passage et le mémorise sur le tenant.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function stripeRequest(path: string, secretKey: string, body: Record<string, string>) {
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
    const { price_id, origin } = await req.json();
    if (!price_id) throw new Error("price_id manquant");

    const { data: tenant, error: tenantError } = await supabase.from("tenants").select("*").single();
    if (tenantError) throw tenantError;

    let customerId = tenant.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripeRequest("customers", stripeSecretKey, {
        name: tenant.name,
        ...(tenant.email ? { email: tenant.email } : {}),
        "metadata[tenant_id]": tenant.id,
      });
      customerId = customer.id;
      const { error: updateError } = await supabase
        .from("tenants")
        .update({ stripe_customer_id: customerId })
        .eq("id", tenant.id);
      if (updateError) throw updateError;
    }

    const baseUrl = origin || "https://app.lnewg.com";
    const session = await stripeRequest("checkout/sessions", stripeSecretKey, {
      customer: customerId!,
      mode: "subscription",
      "line_items[0][price]": price_id,
      "line_items[0][quantity]": "1",
      success_url: `${baseUrl}/billing?success=true`,
      cancel_url: `${baseUrl}/billing?canceled=true`,
      allow_promotion_codes: "true",
    });

    return new Response(JSON.stringify({ url: session.url }), {
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
