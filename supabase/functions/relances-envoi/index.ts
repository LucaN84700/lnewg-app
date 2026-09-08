// Edge Function : envoie les relances dues pour les factures en retard du tenant appelant.
// Respecte la RLS (utilise le JWT de l'utilisateur qui appelle), donc ne traite jamais que
// les données du tenant connecté. Escalade automatique sur 3 niveaux :
//   niveau 1 dès J+1 après l'échéance, niveau 2 à J+15, niveau 3 (mise en demeure) à J+30.
// Un niveau n'est envoyé qu'une fois qu'aucune relance de ce niveau (ou supérieur) n'existe déjà
// pour la facture, donc on peut appeler cette fonction aussi souvent que voulu sans doublons.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Tenant {
  name: string;
  email: string | null;
}

interface Client {
  name: string;
  email: string | null;
}

interface Facture {
  id: string;
  numero: string;
  total_ttc: number;
  date_echeance: string;
  statut: string;
  clients: Client | null;
}

function niveauForDaysLate(daysLate: number): 0 | 1 | 2 | 3 {
  if (daysLate >= 30) return 3;
  if (daysLate >= 15) return 2;
  if (daysLate >= 1) return 1;
  return 0;
}

function buildEmail(
  niveau: 1 | 2 | 3,
  tenant: Tenant,
  facture: Facture,
  settings: Record<string, string>,
) {
  const montant = facture.total_ttc.toFixed(2);
  const echeance = facture.date_echeance;

  if (niveau === 1) {
    return {
      subject: `Rappel : facture ${facture.numero} arrivée à échéance`,
      html: `<p>Bonjour,</p>
<p>Sauf erreur de notre part, la facture <strong>${facture.numero}</strong> d'un montant de <strong>${montant} €</strong>, arrivée à échéance le ${echeance}, ne semble pas encore réglée.</p>
<p>Pourriez-vous procéder au règlement dans les meilleurs délais ? N'hésitez pas à nous contacter si ce message croise votre paiement.</p>
<p>Cordialement,<br>${tenant.name}</p>`,
    };
  }

  if (niveau === 2) {
    return {
      subject: `2e rappel : facture ${facture.numero} toujours impayée`,
      html: `<p>Bonjour,</p>
<p>Malgré notre précédent message, la facture <strong>${facture.numero}</strong> d'un montant de <strong>${montant} €</strong>, échue le ${echeance}, reste impayée à ce jour.</p>
<p>Merci de bien vouloir régulariser la situation rapidement, ou de nous contacter en cas de difficulté.</p>
<p>Cordialement,<br>${tenant.name}</p>`,
    };
  }

  return {
    subject: `Mise en demeure : facture ${facture.numero} en retard de paiement`,
    html: `<p>Bonjour,</p>
<p>Malgré nos relances précédentes, la facture <strong>${facture.numero}</strong> d'un montant de <strong>${montant} €</strong>, échue le ${echeance}, demeure impayée à ce jour.</p>
<p>Nous vous mettons en demeure de procéder au règlement sous 8 jours.</p>
<p>Conformément à l'article L441-10 du Code de commerce, tout retard de paiement entraîne de plein droit une pénalité de retard au taux de ${settings.taux_penalites_retard ?? "8,25 % l'an"}, ainsi qu'une indemnité forfaitaire de recouvrement de ${settings.indemnite_recouvrement ?? "40 €"}.</p>
<p>Cordialement,<br>${tenant.name}</p>`,
  };
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

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const relancesFromEmail = Deno.env.get("RELANCES_FROM_EMAIL") ?? "factures@mail.lnewg.com";
  if (!resendApiKey) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY non configurée" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  try {
    const { data: tenant, error: tenantError } = await supabase.from("tenants").select("*").single();
    if (tenantError) throw tenantError;

    const { data: appSettings } = await supabase.from("app_settings").select("key, value");
    const settings = Object.fromEntries((appSettings ?? []).map((s) => [s.key, s.value]));

    const todayStr = new Date().toISOString().slice(0, 10);
    const { data: factures, error: facturesError } = await supabase
      .from("factures")
      .select("id, numero, total_ttc, date_echeance, statut, clients(name, email)")
      .in("statut", ["envoyee", "en_retard"])
      .lt("date_echeance", todayStr);
    if (facturesError) throw facturesError;

    const results: Array<Record<string, unknown>> = [];

    for (const facture of (factures ?? []) as unknown as Facture[]) {
      const daysLate = Math.floor(
        (Date.now() - new Date(facture.date_echeance).getTime()) / 86_400_000,
      );
      const targetNiveau = niveauForDaysLate(daysLate);
      if (targetNiveau === 0) continue;

      const { data: existing } = await supabase
        .from("relances")
        .select("niveau")
        .eq("facture_id", facture.id);
      const maxSent = (existing ?? []).reduce((m, r) => Math.max(m, r.niveau as number), 0);
      const niveauToSend = (maxSent + 1) as 1 | 2 | 3;
      if (niveauToSend > targetNiveau) continue;

      if (!facture.clients?.email) {
        results.push({ facture: facture.numero, skipped: "client sans email" });
        continue;
      }

      const { subject, html } = buildEmail(niveauToSend, tenant, facture, settings);

      const sendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${tenant.name} <${relancesFromEmail}>`,
          to: [facture.clients.email],
          reply_to: tenant.email || undefined,
          subject,
          html,
        }),
      });

      if (!sendResponse.ok) {
        const detail = await sendResponse.text();
        await supabase.from("relances").insert({ facture_id: facture.id, niveau: niveauToSend, statut: "echec" });
        results.push({ facture: facture.numero, niveau: niveauToSend, error: detail });
        continue;
      }

      await supabase.from("relances").insert({
        facture_id: facture.id,
        niveau: niveauToSend,
        statut: "envoyee",
        sent_at: new Date().toISOString(),
      });
      if (facture.statut !== "en_retard") {
        await supabase.from("factures").update({ statut: "en_retard" }).eq("id", facture.id);
      }
      results.push({ facture: facture.numero, niveau: niveauToSend, sent: true });
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
