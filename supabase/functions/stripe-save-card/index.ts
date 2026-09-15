// Edge Function : crée une session Stripe Checkout en mode "setup" (aucun débit) pour
// enregistrer la carte du tenant juste après l'inscription — ou pour réessayer si la première
// tentative a été annulée. Le paiement réel n'a lieu que plus tard, via stripe-confirm-trial,
// quand le propriétaire confirme vouloir continuer sur Master.

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
    const { origin } = await req.json().catch(() => ({ origin: undefined }));

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
      mode: "setup",
      currency: "eur",
      "payment_method_types[0]": "card",
      success_url: `${baseUrl}/?carte=ok`,
      cancel_url: `${baseUrl}/?carte=annulee`,
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
