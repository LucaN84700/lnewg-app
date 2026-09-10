// Edge Function : envoie un devis par email au client, en pièce jointe PDF.
// Réutilise devis-pdf en interne (appel HTTP avec le même JWT) plutôt que de dupliquer la
// génération du PDF. Envoi manuel, déclenché par l'utilisateur (bouton "Envoyer par email").

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
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
  if (!resendApiKey) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY non configurée" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  try {
    const { devis_id } = await req.json();
    if (!devis_id) throw new Error("devis_id manquant");

    const { data: tenant, error: tenantError } = await supabase.from("tenants").select("*").single();
    if (tenantError) throw tenantError;

    const { data: devis, error: devisError } = await supabase
      .from("devis")
      .select("numero, objet, statut, clients(name, email)")
      .eq("id", devis_id)
      .single();
    if (devisError) throw devisError;

    const clientEmail = devis.clients?.email;
    if (!clientEmail) throw new Error("Ce client n'a pas d'adresse email enregistrée");

    const pdfResponse = await fetch(`${supabaseUrl}/functions/v1/devis-pdf?devis_id=${devis_id}`, {
      headers: { Authorization: authHeader },
    });
    if (!pdfResponse.ok) throw new Error("Échec de la génération du PDF");
    const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());

    const sendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${tenant.name} <${fromEmail}>`,
        to: [clientEmail],
        reply_to: tenant.email || undefined,
        subject: `Devis ${devis.numero}${devis.objet ? ` - ${devis.objet}` : ""}`,
        html: `<p>Bonjour,</p>
<p>Veuillez trouver ci-joint notre devis <strong>${devis.numero}</strong>.</p>
<p>N'hésitez pas à nous contacter pour toute question.</p>
<p>Cordialement,<br>${tenant.name}</p>`,
        attachments: [{ filename: `${devis.numero}.pdf`, content: toBase64(pdfBytes) }],
      }),
    });

    if (!sendResponse.ok) {
      const detail = await sendResponse.text();
      throw new Error(`Échec de l'envoi : ${detail}`);
    }

    await supabase.from("devis").update({ statut: "envoye" }).eq("id", devis_id);

    return new Response(JSON.stringify({ sent: true }), {
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
