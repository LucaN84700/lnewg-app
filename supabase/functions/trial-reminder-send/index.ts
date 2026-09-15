// Edge Function (cron quotidien, comme downgrade-expired-trials) : ~2 jours avant la fin de
// l'essai Master, envoie un email au propriétaire pour lui demander s'il veut continuer — sans
// jamais débiter automatiquement. S'il ne répond pas, downgrade-expired-trials repasse le compte
// en Starter à la date prévue, comme aujourd'hui. Ne concerne que les comptes avec une carte
// enregistrée (trial_card_saved_at) : sans carte, rien à débiter, donc rien à demander.

import { createClient } from "npm:@supabase/supabase-js@2";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function reminderHtml(prenom: string, joursRestants: number) {
  const greeting = prenom ? `, ${prenom}` : "";
  return `
  <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; color:#0B1E3D;">
    <p style="font-size: 20px; font-weight: 700; margin: 0 0 16px;">Ton essai Master se termine bientôt${greeting}</p>
    <p style="font-size: 15px; line-height: 1.6; margin: 0 0 14px;">
      Il te reste ${joursRestants} jour${joursRestants > 1 ? "s" : ""} d'essai. Si tu veux continuer à profiter de
      Master (devis, factures, relances automatiques, comptabilité), il te suffit de confirmer — ta carte est
      déjà enregistrée, tu n'as rien à ressaisir.
    </p>
    <p style="margin: 0 0 20px;">
      <a href="https://app.lnewg.com/billing" style="display:inline-block; background:#3DA5F5; color:#0B1E3D; font-weight:600; padding:10px 20px; border-radius:6px; text-decoration:none; font-size:14px;">
        Continuer avec Master
      </a>
    </p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0; color:#5A6472;">
      Tu ne fais rien ? Aucun souci, aucun débit n'aura lieu — ton compte repassera simplement sur le forfait
      Starter à la fin de l'essai. Une question ? Écris-nous à
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
  if (!resendApiKey) {
    return jsonResponse({ error: "RESEND_API_KEY non configurée" }, 500);
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const now = new Date();
    const in2Days = new Date(now.getTime() + 2 * 86_400_000);

    const { data: tenants, error: tenantsError } = await supabase
      .from("tenants")
      .select("id, name, trial_ends_at")
      .eq("plan", "master")
      .is("stripe_subscription_id", null)
      .not("trial_card_saved_at", "is", null)
      .is("trial_followup_sent_at", null)
      .lte("trial_ends_at", in2Days.toISOString())
      .gt("trial_ends_at", now.toISOString());
    if (tenantsError) throw tenantsError;

    let sent = 0;
    for (const tenant of tenants ?? []) {
      const { data: owner } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("tenant_id", tenant.id)
        .eq("role", "owner")
        .maybeSingle();
      if (!owner?.email) continue;

      const joursRestants = Math.max(
        1,
        Math.ceil((new Date(tenant.trial_ends_at).getTime() - now.getTime()) / 86_400_000),
      );
      const prenom = (owner.full_name ?? "").split(" ")[0] ?? "";

      const sendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `LNEWG <${fromEmail}>`,
          to: [owner.email],
          subject: "Ton essai Master se termine bientôt",
          html: reminderHtml(prenom, joursRestants),
        }),
      });
      if (!sendResponse.ok) continue;

      await supabase.from("tenants").update({ trial_followup_sent_at: now.toISOString() }).eq("id", tenant.id);
      sent += 1;
    }

    return jsonResponse({ sent });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
