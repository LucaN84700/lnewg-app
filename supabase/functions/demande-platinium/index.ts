// Edge Function : reçoit une demande de projet sur mesure (offre Platinium — agents IA /
// automatisations développés spécifiquement pour le client) depuis la page Abonnement, et
// l'envoie par email à LNEWG. Ce n'est pas un palier du SaaS (pas de tenant.plan associé) :
// c'est le cœur de métier de l'agence, vendu et scopé au cas par cas après ce premier contact.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function xmlEscapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
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
  const fromEmail = Deno.env.get("RELANCES_FROM_EMAIL") ?? "factures@mail.lnewg.com";
  const toEmail = Deno.env.get("PLATINIUM_TO_EMAIL") ?? "contact@lnewg.com";
  if (!resendApiKey) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY non configurée" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { besoin } = await req.json();
    if (!besoin || typeof besoin !== "string" || besoin.trim().length < 10) {
      return new Response(JSON.stringify({ error: "Merci de décrire votre besoin (10 caractères minimum)." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: tenant, error: tenantError } = await supabase.from("tenants").select("*").single();
    if (tenantError) throw tenantError;

    const html = `
<h2>Nouvelle demande Platinium</h2>
<p><strong>Entreprise :</strong> ${xmlEscapeHtml(tenant.name)}</p>
<p><strong>Email :</strong> ${tenant.email ? xmlEscapeHtml(tenant.email) : "—"}</p>
<p><strong>Téléphone :</strong> ${tenant.phone ? xmlEscapeHtml(tenant.phone) : "—"}</p>
<p><strong>Plan SaaS actuel :</strong> ${xmlEscapeHtml(tenant.plan)}</p>
<hr>
<p><strong>Besoin décrit :</strong></p>
<p>${xmlEscapeHtml(besoin.trim())}</p>`;

    const sendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `LNEWG SaaS <${fromEmail}>`,
        to: [toEmail],
        reply_to: tenant.email || undefined,
        subject: `Demande Platinium — ${tenant.name}`,
        html,
      }),
    });

    if (!sendResponse.ok) {
      const detail = await sendResponse.text();
      throw new Error(`Échec de l'envoi (${sendResponse.status}) : ${detail}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
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
