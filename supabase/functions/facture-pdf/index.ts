// Edge Function : génère un Factur-X (PDF lisible + XML CII EN16931 embarqué) pour une
// facture, à la volée, sans persistance. Respecte la RLS via le JWT de l'appelant, donc ne
// peut jamais générer une facture d'un autre tenant.
//
// La construction du PDF est mutualisée dans _shared/build-facture-pdf.ts, réutilisée aussi par
// comptabilite-factures-zip (export groupé de toutes les factures d'un mois).
//
// Limite connue : l'attachement du XML (nom, AFRelationship=Data) suffit pour que la quasi-
// totalité des lecteurs Factur-X extraient les données structurées, mais ce PDF n'a pas la
// pleine conformité ISO PDF/A-3 (métadonnées XMP, profil colorimétrique) qu'exigerait une
// validation stricte par une Plateforme Agréée. À faire valider par un outil officiel
// (FNFE-MPE, Chorus Pro) avant toute transmission réelle — pas urgent, l'obligation
// d'émission pour les TPE/PME n'arrive qu'en septembre 2027.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildInvoicePdf } from "../_shared/build-facture-pdf.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  const url = new URL(req.url);
  const factureId = url.searchParams.get("facture_id");
  if (!factureId) {
    return new Response(JSON.stringify({ error: "facture_id manquant" }), {
      status: 400,
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

    const { data: facture, error: factureError } = await supabase
      .from("factures")
      .select("*, clients(name, company_name, address, email, phone, logo_url)")
      .eq("id", factureId)
      .single();
    if (factureError) throw factureError;

    const pdfBytes = await buildInvoicePdf(facture, tenant, settings);

    return new Response(pdfBytes, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${facture.numero}.pdf"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
