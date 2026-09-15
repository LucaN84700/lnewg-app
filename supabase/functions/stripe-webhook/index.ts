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
      if (session.mode === "setup") {
        await applySetupCompletion(supabase, stripeSecretKey, session);
      } else {
        const subscription = await stripeGet(`subscriptions/${session.subscription}`, stripeSecretKey);
        await applySubscription(supabase, session.customer, subscription);
      }
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
async function applySetupCompletion(supabase: any, stripeSecretKey: string, session: any) {
  const setupIntentId = session.setup_intent;
  if (!setupIntentId) return;

  const setupIntent = await stripeGet(`setup_intents/${setupIntentId}`, stripeSecretKey);
  const paymentMethodId = setupIntent.payment_method;
  if (!paymentMethodId) return;

  await stripePost(`customers/${session.customer}`, stripeSecretKey, {
    "invoice_settings[default_payment_method]": paymentMethodId,
  });

  const { data: tenantRow, error } = await supabase
    .from("tenants")
    .update({ trial_card_saved_at: new Date().toISOString() })
    .eq("stripe_customer_id", session.customer)
    .select("subscription_status, stripe_subscription_id")
    .maybeSingle();
  if (error) throw error;

  // Carte mise à jour alors que le compte était en impayé (voir le bouton "Mettre à jour ma
  // carte" sur /billing, qui réutilise ce même flux de setup) : on retente le paiement de la
  // dernière facture ouverte automatiquement, plutôt que d'attendre la prochaine relance Stripe
  // (Smart Retries), qui peut prendre plusieurs jours.
  if (tenantRow?.subscription_status === "past_due" && tenantRow.stripe_subscription_id) {
    try {
      const invoices = await stripeGet(`invoices?customer=${session.customer}&status=open&limit=1`, stripeSecretKey);
      const openInvoice = invoices.data?.[0];
      if (openInvoice) {
        await stripePost(`invoices/${openInvoice.id}/pay`, stripeSecretKey, {});
      }
    } catch {
      // Échec du nouveau prélèvement (carte encore invalide) : le statut reste past_due, le
      // client reste sur l'écran de mise à jour de carte, Stripe retentera aussi de son côté.
    }
  }
}

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
  const extraDevicePriceId = Deno.env.get("STRIPE_EXTRA_DEVICE_PRICE_ID");
  const extraDevicePriceIdAnnual = Deno.env.get("STRIPE_EXTRA_DEVICE_PRICE_ID_ANNUAL");

  let planId: string | null = null;
  let extraSeats = 0;
  let extraDevices = 0;
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
    } else if (priceId === extraDevicePriceId || priceId === extraDevicePriceIdAnnual) {
      extraDevices = item.quantity ?? 0;
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
  const newStatus = statusMap[subscription.status] ?? "active";

  const { data: previousTenant } = await supabase
    .from("tenants")
    .select("id, subscription_status, past_due_notified_at")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  const { error: updateError } = await supabase
    .from("tenants")
    .update({
      stripe_subscription_id: subscription.id,
      subscription_status: newStatus,
      ...(currentPeriodEnd ? { current_period_end: new Date(currentPeriodEnd * 1000).toISOString() } : {}),
      extra_seats: extraSeats,
      extra_devices: extraDevices,
      ...(planId ? { plan: planId } : {}),
      cancel_at_period_end: subscription.cancel_at_period_end === true,
      // Sort de l'état past_due : on efface le repère pour qu'un futur impayé notifie à nouveau.
      ...(newStatus !== "past_due" && previousTenant?.past_due_notified_at ? { past_due_notified_at: null } : {}),
    })
    .eq("stripe_customer_id", customerId);
  if (updateError) throw updateError;

  // Un seul email par épisode d'impayé (Stripe retente automatiquement plusieurs fois sur
  // quelques jours — Smart Retries — et chaque tentative déclenche ce webhook).
  if (newStatus === "past_due" && previousTenant && !previousTenant.past_due_notified_at) {
    await notifyPastDue(supabase, previousTenant.id);
  }
}

// deno-lint-ignore no-explicit-any
async function notifyPastDue(supabase: any, tenantId: string) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RELANCES_FROM_EMAIL") ?? "factures@mail.lnewg.com";
  if (!resendApiKey) return;

  const { data: owner } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .maybeSingle();
  if (!owner?.email) return;

  const greeting = owner.full_name ? `, ${owner.full_name.split(" ")[0]}` : "";
  const html = `
  <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; color:#0B1E3D;">
    <p style="font-size: 20px; font-weight: 700; margin: 0 0 16px;">Ton dernier paiement a échoué${greeting}</p>
    <p style="font-size: 15px; line-height: 1.6; margin: 0 0 14px;">
      Le prélèvement automatique pour ton abonnement LNEWG n'a pas pu être effectué. Ton accès est suspendu en
      attendant la mise à jour de ta carte.
    </p>
    <p style="margin: 0 0 20px;">
      <a href="https://app.lnewg.com/billing" style="display:inline-block; background:#3DA5F5; color:#0B1E3D; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none; font-size:14px;">
        Mettre à jour ma carte
      </a>
    </p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0; color:#5A6472;">
      Ton accès est rétabli automatiquement dès que le paiement passe. Une question ? Écris-nous à
      <a href="mailto:contact@lnewg.com" style="color:#3DA5F5;">contact@lnewg.com</a>, on répond au plus vite.
    </p>
  </div>`;

  const sendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `LNEWG <${fromEmail}>`,
      to: [owner.email],
      subject: "Ton dernier paiement a échoué",
      html,
    }),
  });
  if (!sendResponse.ok) return;

  await supabase.from("tenants").update({ past_due_notified_at: new Date().toISOString() }).eq("id", tenantId);
}
