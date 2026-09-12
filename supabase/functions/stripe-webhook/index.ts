// Edge Function : reçoit les webhooks Stripe (checkout terminé, abonnement modifié/annulé)
// et met à jour le tenant correspondant. Pas de JWT utilisateur (appelé par Stripe), la
// signature Stripe fait office d'authentification. Utilise le service_role pour écrire sur
// n'importe quel tenant (mappé via stripe_customer_id / stripe_subscription_id).

import { createClient } from "npm:@supabase/supabase-js@2";

async function verifyStripeSignature(payload: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) throw new Error("Signature Stripe malformée");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signedPayload = `${timestamp}.${payload}`;
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expected !== signature) throw new Error("Signature Stripe invalide");

  const age = Date.now() / 1000 - Number(timestamp);
  if (age > 300) throw new Error("Timestamp Stripe trop ancien");
}

async function stripeGet(path: string, secretKey: string) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "Erreur Stripe");
  return data;
}

Deno.serve(async (req: Request) => {
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    return new Response(JSON.stringify({ error: "STRIPE_WEBHOOK_SECRET non configurée" }), { status: 500 });
  }

  const payload = await req.text();
  const signatureHeader = req.headers.get("stripe-signature");
  if (!signatureHeader) {
    return new Response(JSON.stringify({ error: "Signature manquante" }), { status: 400 });
  }

  try {
    await verifyStripeSignature(payload, signatureHeader, webhookSecret);
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 400,
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const event = JSON.parse(payload);

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const subscription = await stripeGet(`subscriptions/${session.subscription}`, stripeSecretKey);
      await applySubscription(supabase, session.customer, subscription);
    } else if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object;
      await applySubscription(supabase, subscription.customer, subscription);
    } else if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      await supabase
        .from("tenants")
        .update({ subscription_status: "canceled" })
        .eq("stripe_customer_id", subscription.customer);
    }

    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});

// deno-lint-ignore no-explicit-any
async function applySubscription(supabase: any, customerId: string, subscription: any) {
  const items = (subscription.items?.data ?? []) as Array<{
    quantity?: number;
    price?: { id?: string };
    current_period_end?: number;
  }>;

  const { data: plans } = await supabase.from("plans").select("id, stripe_price_id, stripe_price_id_annual");
  const extraSeatPriceId = Deno.env.get("STRIPE_EXTRA_SEAT_PRICE_ID");
  const extraSeatPriceIdAnnual = Deno.env.get("STRIPE_EXTRA_SEAT_PRICE_ID_ANNUAL");

  let planId: string | null = null;
  let extraSeats = 0;
  let currentPeriodEnd: number | undefined;
  for (const item of items) {
    const priceId = item.price?.id;
    if (!priceId) continue;
    const matchingPlan = (plans ?? []).find(
      (p: { stripe_price_id?: string; stripe_price_id_annual?: string }) =>
        p.stripe_price_id === priceId || p.stripe_price_id_annual === priceId,
    );
    if (matchingPlan) {
      planId = matchingPlan.id;
      currentPeriodEnd = item.current_period_end;
    } else if (priceId === extraSeatPriceId || priceId === extraSeatPriceIdAnnual) {
      extraSeats = item.quantity ?? 0;
    }
  }
  // API Stripe récente : current_period_end vit sur chaque item, plus sur l'abonnement lui-même.
  currentPeriodEnd ??= items[0]?.current_period_end ?? subscription.current_period_end;

  const statusMap: Record<string, string> = {
    active: "active",
    trialing: "trialing",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "past_due",
    incomplete_expired: "canceled",
  };

  const { error: updateError } = await supabase
    .from("tenants")
    .update({
      stripe_subscription_id: subscription.id,
      subscription_status: statusMap[subscription.status] ?? "active",
      ...(currentPeriodEnd ? { current_period_end: new Date(currentPeriodEnd * 1000).toISOString() } : {}),
      extra_seats: extraSeats,
      ...(planId ? { plan: planId } : {}),
    })
    .eq("stripe_customer_id", customerId);
  if (updateError) throw updateError;
}
