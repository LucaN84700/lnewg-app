// Edge Function (cron quotidien) : ~4 jours avant chaque prélèvement automatique, prévient le
// propriétaire d'un abonnement payant actif (Starter/Pro/Master, pas l'essai — voir
// trial-reminder-send pour ça) du montant et de la date, avec un lien vers /billing pour gérer
// ou résilier. Montant réel récupéré via l'API Stripe (upcoming invoice) plutôt que recalculé à
// la main, pour rester exact avec les sièges/appareils supplémentaires et le mensuel/annuel.

import { createClient } from "npm:@supabase/supabase-js@2";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function stripeGet(path: string, secretKey: string) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "Erreur Stripe");
  return data;
}

const planLabels: Record<string, string> = { starter: "Starter", pro: "Pro", master: "Master" };

function reminderHtml(prenom: string, planLabel: string, montant: string, dateStr: string) {
  const greeting = prenom ? `, ${prenom}` : "";
  return `
  <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; color:#0B1E3D;">
    <p style="font-size: 20px; font-weight: 700; margin: 0 0 16px;">Ton prochain prélèvement approche${greeting}</p>
    <p style="font-size: 15px; line-height: 1.6; margin: 0 0 14px;">
      Un paiement automatique de <strong>${montant}</strong> aura lieu le <strong>${dateStr}</strong> pour ton
      abonnement ${planLabel}.
    </p>
    <p style="margin: 0 0 20px;">
      <a href="https://app.lnewg.com/billing" style="display:inline-block; background:#3DA5F5; color:#0B1E3D; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none; font-size:14px;">
        Gérer mon abonnement
      </a>
    </p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0; color:#5A6472;">
      Tu peux résilier à tout moment depuis cette page — sans engagement, ton accès reste actif jusqu'à la fin de
      la période déjà payée. Une question ? Écris-nous à
      <a href="mailto:contact@lnewg.com" style="color:#3DA5F5;">contact@lnewg.com</a>, on répond au plus vite.
    </p>
  </div>`;
}

Deno.serve(async (req: Request) => {
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedCronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || !expectedCronSecret || cronSecret !== expectedCronSecret) {
    return jsonResponse({ error: "Non autorisé" }, 401);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RELANCES_FROM_EMAIL") ?? "factures@mail.lnewg.com";
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!resendApiKey) return jsonResponse({ error: "RESEND_API_KEY non configurée" }, 500);
  if (!stripeSecretKey) return jsonResponse({ error: "STRIPE_SECRET_KEY non configurée" }, 500);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const now = new Date();
    const in4Days = new Date(now.getTime() + 4 * 86_400_000);

    const { data: tenants, error: tenantsError } = await supabase
      .from("tenants")
      .select("id, plan, current_period_end, stripe_subscription_id, renewal_reminder_sent_for")
      .eq("subscription_status", "active")
      .not("stripe_subscription_id", "is", null)
      .not("current_period_end", "is", null)
      .lte("current_period_end", in4Days.toISOString())
      .gt("current_period_end", now.toISOString());
    if (tenantsError) throw tenantsError;

    let sent = 0;
    for (const tenant of tenants ?? []) {
      // Ne renvoie jamais deux fois pour le même cycle de facturation, mais se réarme
      // automatiquement dès que current_period_end avance au mois suivant.
      if (tenant.renewal_reminder_sent_for === tenant.current_period_end) continue;

      const { data: owner } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("tenant_id", tenant.id)
        .eq("role", "owner")
        .maybeSingle();
      if (!owner?.email) continue;

      let montant = "";
      try {
        const upcoming = await stripeGet(
          `invoices/upcoming?subscription=${tenant.stripe_subscription_id}`,
          stripeSecretKey,
        );
        montant = `${(upcoming.amount_due / 100).toFixed(2).replace(".", ",")} ${(upcoming.currency ?? "eur").toUpperCase()}`;
      } catch {
        continue; // pas de montant fiable, on ne devine pas — on retentera au prochain passage du cron
      }

      const dateStr = new Date(tenant.current_period_end).toLocaleDateString("fr-FR");
      const prenom = (owner.full_name ?? "").split(" ")[0] ?? "";
      const planLabel = planLabels[tenant.plan] ?? tenant.plan;

      const sendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `LNEWG <${fromEmail}>`,
          to: [owner.email],
          subject: "Ton prochain prélèvement approche",
          html: reminderHtml(prenom, planLabel, montant, dateStr),
        }),
      });
      if (!sendResponse.ok) continue;

      await supabase
        .from("tenants")
        .update({ renewal_reminder_sent_for: tenant.current_period_end })
        .eq("id", tenant.id);
      sent += 1;
    }

    return jsonResponse({ sent });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
