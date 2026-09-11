// Edge Function : regroupe le PDF Factur-X de chaque facture d'un mois donné dans une seule
// archive ZIP, à donner au comptable en plus du tableau récapitulatif (comptabilite-pdf).
// Réservé au plan Master, vérifié côté serveur (pas seulement dans l'UI).

import { createClient } from "npm:@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";
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
  const month = url.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return new Response(JSON.stringify({ error: "Paramètre month invalide (attendu YYYY-MM)" }), {
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

    if (tenant.plan !== "master") {
      return new Response(JSON.stringify({ error: "Fonctionnalité réservée au plan Master" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: appSettings } = await supabase.from("app_settings").select("key, value");
    const settings = Object.fromEntries((appSettings ?? []).map((s) => [s.key, s.value]));

    const [y, m] = month.split("-").map(Number);
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const { data: factures, error: facturesError } = await supabase
      .from("factures")
      .select("*, clients(name, company_name, address, email, phone, logo_url)")
      .gte("date_facture", start)
      .lte("date_facture", end)
      .order("date_facture");
    if (facturesError) throw facturesError;

    if (!factures || factures.length === 0) {
      return new Response(JSON.stringify({ error: "Aucune facture pour ce mois" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const zip = new JSZip();
    const usedNames = new Set<string>();
    for (const facture of factures) {
      const bytes = await buildInvoicePdf(facture, tenant, settings);
      let filename = `${facture.numero}.pdf`;
      let suffix = 2;
      while (usedNames.has(filename)) {
        filename = `${facture.numero}-${suffix}.pdf`;
        suffix += 1;
      }
      usedNames.add(filename);
      zip.file(filename, bytes);
    }

    const zipBytes = await zip.generateAsync({ type: "uint8array" });

    return new Response(zipBytes, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="factures-${month}.zip"`,
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
