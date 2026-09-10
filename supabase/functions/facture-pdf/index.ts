// Edge Function : génère un Factur-X (PDF lisible + XML CII EN16931 embarqué) pour une
// facture, à la volée, sans persistance. Respecte la RLS via le JWT de l'appelant, donc ne
// peut jamais générer une facture d'un autre tenant.
//
// Limite connue : l'attachement du XML (nom, AFRelationship=Data) suffit pour que la quasi-
// totalité des lecteurs Factur-X extraient les données structurées, mais ce PDF n'a pas la
// pleine conformité ISO PDF/A-3 (métadonnées XMP, profil colorimétrique) qu'exigerait une
// validation stricte par une Plateforme Agréée. À faire valider par un outil officiel
// (FNFE-MPE, Chorus Pro) avant toute transmission réelle — pas urgent, l'obligation
// d'émission pour les TPE/PME n'arrive qu'en septembre 2027.

import { createClient } from "npm:@supabase/supabase-js@2";
import { AFRelationship, PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { buildFacturXml } from "./facturx-xml.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Ligne {
  description: string;
  quantite: number;
  unite: string;
  prix_unitaire_ht: number;
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

// deno-lint-ignore no-explicit-any
async function buildInvoicePdf(facture: any, tenant: any, settings: Record<string, string>) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.043, 0.071, 0.126);
  const gray = rgb(0.35, 0.4, 0.45);
  const line = rgb(0.88, 0.89, 0.92);

  const { width, height } = page.getSize();
  const marginX = 50;
  let y = height - 60;

  function text(
    str: string,
    x: number,
    yPos: number,
    opts: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb> } = {},
  ) {
    page.drawText(str ?? "", {
      x,
      y: yPos,
      size: opts.size ?? 10,
      font: opts.f ?? font,
      color: opts.color ?? navy,
    });
  }

  function euros(n: number) {
    return `${n.toFixed(2).replace(".", ",")} EUR`;
  }

  // En-tête
  text(tenant.name, marginX, y, { size: 18, f: bold });
  y -= 18;
  if (tenant.address) {
    text(tenant.address, marginX, y, { size: 9, color: gray });
    y -= 12;
  }
  if (tenant.siret) {
    text(`SIRET ${tenant.siret}`, marginX, y, { size: 9, color: gray });
    y -= 12;
  }
  if (tenant.email || tenant.phone) {
    text([tenant.email, tenant.phone].filter(Boolean).join(" · "), marginX, y, { size: 9, color: gray });
    y -= 12;
  }

  text(`FACTURE ${facture.numero}`, width - marginX - 220, height - 60, { size: 14, f: bold });
  text(`Date d'émission : ${facture.date_facture}`, width - marginX - 220, height - 78, { size: 9, color: gray });
  text(`Date d'échéance : ${facture.date_echeance}`, width - marginX - 220, height - 92, { size: 9, color: gray });

  y -= 20;
  page.drawLine({ start: { x: marginX, y }, end: { x: width - marginX, y }, thickness: 1, color: line });
  y -= 24;

  // Client
  const clientBlockTop = y;
  text("Facturé à", marginX, y, { size: 9, f: bold, color: gray });
  y -= 14;
  const client = facture.clients;
  text(client?.company_name || client?.name || "", marginX, y, { size: 11, f: bold });
  y -= 14;
  if (client?.address) {
    text(client.address, marginX, y, { size: 9, color: gray });
    y -= 12;
  }
  if (client?.email) {
    text(client.email, marginX, y, { size: 9, color: gray });
    y -= 12;
  }
  if (client?.logo_url) {
    try {
      const logoRes = await fetch(client.logo_url);
      if (logoRes.ok) {
        const logoBytes = new Uint8Array(await logoRes.arrayBuffer());
        const contentType = logoRes.headers.get("content-type") || "";
        const image = contentType.includes("png")
          ? await doc.embedPng(logoBytes)
          : await doc.embedJpg(logoBytes);
        const maxDim = 50;
        const scale = Math.min(maxDim / image.width, maxDim / image.height, 1);
        const w = image.width * scale;
        const h = image.height * scale;
        page.drawImage(image, { x: width - marginX - w, y: clientBlockTop - h + 10, width: w, height: h });
      }
    } catch {
      // logo non embarqué en cas d'erreur (format non supporté, image inaccessible…), le PDF continue sans
    }
  }

  y -= 20;

  // Table header
  const colDesc = marginX;
  const colQte = 330;
  const colPu = 400;
  const colTotal = 480;

  text("Description", colDesc, y, { size: 9, f: bold, color: gray });
  text("Qté", colQte, y, { size: 9, f: bold, color: gray });
  text("PU HT", colPu, y, { size: 9, f: bold, color: gray });
  text("Total HT", colTotal, y, { size: 9, f: bold, color: gray });
  y -= 8;
  page.drawLine({ start: { x: marginX, y }, end: { x: width - marginX, y }, thickness: 1, color: line });
  y -= 18;

  for (const ligne of (facture.lignes ?? []) as Ligne[]) {
    text(ligne.description, colDesc, y, { size: 10 });
    text(`${ligne.quantite} ${ligne.unite}`, colQte, y, { size: 10 });
    text(euros(ligne.prix_unitaire_ht), colPu, y, { size: 10 });
    text(euros(ligne.quantite * ligne.prix_unitaire_ht), colTotal, y, { size: 10 });
    y -= 20;
  }

  y -= 10;
  page.drawLine({ start: { x: 330, y }, end: { x: width - marginX, y }, thickness: 1, color: line });
  y -= 20;

  text("Total HT", 400, y, { size: 10, color: gray });
  text(euros(facture.total_ht), colTotal, y, { size: 10 });
  y -= 16;

  const tvaLabel =
    tenant.tva_regime === "franchise"
      ? "TVA non applicable, art. 293 B du CGI"
      : `TVA (${tenant.tva_rate ?? 20}%)`;
  text(tvaLabel, 400, y, { size: 10, color: gray });
  if (tenant.tva_regime !== "franchise") {
    text(euros(facture.tva_montant), colTotal, y, { size: 10 });
  }
  y -= 16;

  text("Total TTC", 400, y, { size: 11, f: bold });
  text(euros(facture.total_ttc), colTotal, y, { size: 11, f: bold });
  y -= 30;

  page.drawLine({ start: { x: marginX, y }, end: { x: width - marginX, y }, thickness: 1, color: line });
  y -= 20;

  text(`Mode de paiement : ${facture.mode_paiement || "Virement bancaire"}`, marginX, y, { size: 9, color: gray });
  y -= 14;
  if (tenant.iban) {
    text(`IBAN : ${tenant.iban}`, marginX, y, { size: 9, color: gray });
    y -= 14;
  }

  y -= 20;
  const penalites = settings.taux_penalites_retard ?? "8,25 % l'an";
  const indemnite = settings.indemnite_recouvrement ?? "40 €";
  const mentions = `En cas de retard de paiement, une pénalité au taux de ${penalites} sera exigible, ainsi qu'une indemnité forfaitaire de recouvrement de ${indemnite}. Pas d'escompte pour paiement anticipé.`;

  const maxWidth = width - 2 * marginX;
  const words = mentions.split(" ");
  let lineStr = "";
  const mentionLines: string[] = [];
  for (const word of words) {
    const candidate = lineStr ? `${lineStr} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, 8) > maxWidth) {
      mentionLines.push(lineStr);
      lineStr = word;
    } else {
      lineStr = candidate;
    }
  }
  if (lineStr) mentionLines.push(lineStr);
  for (const l of mentionLines) {
    text(l, marginX, y, { size: 8, color: gray });
    y -= 11;
  }

  const facturXml = buildFacturXml(facture, tenant);
  await doc.attach(new TextEncoder().encode(facturXml), "factur-x.xml", {
    mimeType: "text/xml",
    description: "Factur-X CII EN16931",
    afRelationship: AFRelationship.Data,
  });

  return await doc.save();
}
