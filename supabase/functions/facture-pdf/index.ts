// Edge Function : génère un Factur-X (PDF lisible + XML CII EN16931 embarqué) pour une
// facture, à la volée, sans persistance. Respecte la RLS via le JWT de l'appelant, donc ne
// peut jamais générer une facture d'un autre tenant.
//
// Mise en page calquée sur la charte du devis de référence LNEWG (skill_LNEWG/lnewg-devis),
// adaptée à la facture : bandeau, bloc ÉMIS PAR / FACTURÉ À en table teintée, total TTC mis en
// évidence dans une cellule pleine, encart mode de paiement en callout teinté. La couleur
// d'accent (plan Master) recolore uniquement les FONDS ; le texte reste toujours noir, sur
// demande explicite de Luca — pas de bascule de contraste automatique.
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
import { accentFor, BLACK, GRAY, LINE, secondaryAccentFor } from "../_shared/pdf-style.ts";

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
  const accent = accentFor(tenant);
  const tint = secondaryAccentFor(tenant);

  const { width, height } = page.getSize();
  const marginX = 50;
  const contentWidth = width - marginX * 2;

  function text(
    str: string,
    x: number,
    yPos: number,
    opts: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb> } = {},
  ) {
    page.drawText(str ?? "", { x, y: yPos, size: opts.size ?? 10, font: opts.f ?? font, color: opts.color ?? BLACK });
  }

  function centeredText(str: string, yPos: number, opts: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb> } = {}) {
    const f = opts.f ?? font;
    const size = opts.size ?? 10;
    const w = f.widthOfTextAtSize(str, size);
    text(str, (width - w) / 2, yPos, opts);
  }

  // Aligne le texte sur son bord droit à rightX — utilisé pour les colonnes de prix, pour que
  // les montants (et le "EUR" qui les suit) tombent tous à la même verticale d'une ligne à
  // l'autre, plutôt que de dériver selon le nombre de chiffres.
  function rightText(str: string, rightX: number, yPos: number, opts: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb> } = {}) {
    const f = opts.f ?? font;
    const size = opts.size ?? 10;
    const w = f.widthOfTextAtSize(str, size);
    text(str, rightX - w, yPos, opts);
  }

  function euros(n: number) {
    return `${n.toFixed(2).replace(".", ",")} EUR`;
  }

  function wrap(str: string, maxWidth: number, size: number, f = font) {
    const words = str.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (f.widthOfTextAtSize(candidate, size) > maxWidth) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  async function embedLogo(url: string) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const bytes = new Uint8Array(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") || "";
      return contentType.includes("png") ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    } catch {
      return null;
    }
  }

  let y = height;

  // ---------------------------------------------------------------------
  // Bandeau en-tête
  // ---------------------------------------------------------------------
  const bannerHeight = 74;
  page.drawRectangle({ x: 0, y: height - bannerHeight, width, height: bannerHeight, color: accent });

  const tenantLogo = tenant.logo_url ? await embedLogo(tenant.logo_url) : null;
  let bannerTextX = marginX;
  if (tenantLogo) {
    const box = 58;
    const scale = Math.min(box / tenantLogo.width, box / tenantLogo.height, 1);
    const lw = tenantLogo.width * scale;
    const lh = tenantLogo.height * scale;
    page.drawImage(tenantLogo, { x: marginX, y: height - bannerHeight + (bannerHeight - lh) / 2, width: lw, height: lh });
    bannerTextX = marginX + box + 14;
  }
  text(tenant.name, bannerTextX, height - 30, { size: 16, f: bold, color: BLACK });
  const contactLine = [tenant.address, tenant.siret ? `SIRET ${tenant.siret}` : null, tenant.email, tenant.phone]
    .filter(Boolean)
    .join("  ·  ");
  if (contactLine) {
    text(contactLine, bannerTextX, height - 45, { size: 7.5, color: BLACK });
  }

  y = height - bannerHeight - 26;

  // ---------------------------------------------------------------------
  // Titre
  // ---------------------------------------------------------------------
  centeredText(`FACTURE ${facture.numero}`, y, { size: 16, f: bold, color: BLACK });
  y -= 18;
  centeredText(
    `Date d'émission : ${facture.date_facture}   ·   Échéance : ${facture.date_echeance}`,
    y,
    { size: 9.5, f: bold, color: BLACK },
  );
  y -= 24;

  // ---------------------------------------------------------------------
  // Panneau ÉMIS PAR / FACTURÉ À
  // ---------------------------------------------------------------------
  const half = contentWidth / 2;
  const headerRowH = 18;
  const linePitch = 12;
  const bodyPadTop = 12;
  const bodyPadBottom = 10;

  const client = facture.clients;
  const clientLogo = client?.logo_url ? await embedLogo(client.logo_url) : null;

  const tenantLines = [tenant.address, tenant.siret ? `SIRET ${tenant.siret}` : null, tenant.email, tenant.phone].filter(
    Boolean,
  ) as string[];
  const clientName = client?.company_name ? `${client?.name ?? ""} — ${client.company_name}` : client?.name ?? "";
  const clientLines = [client?.address, client?.email, client?.phone].filter(Boolean) as string[];

  const clientLogoBox = 60;
  const bodyLineCount = Math.max(tenantLines.length + 1, clientLines.length + 1);
  const bodyRowH = Math.max(
    bodyPadTop + bodyLineCount * linePitch + bodyPadBottom,
    clientLogo ? clientLogoBox + 16 : 0,
  );

  const panelTop = y;
  page.drawRectangle({ x: marginX, y: panelTop - headerRowH, width: contentWidth, height: headerRowH, color: accent });
  text("ÉMIS PAR", marginX + 10, panelTop - headerRowH + 6, { size: 9, f: bold, color: BLACK });
  text("FACTURÉ À", marginX + half + 10, panelTop - headerRowH + 6, { size: 9, f: bold, color: BLACK });

  const bodyTop = panelTop - headerRowH;
  page.drawRectangle({ x: marginX, y: bodyTop - bodyRowH, width: contentWidth, height: bodyRowH, color: tint });
  page.drawRectangle({
    x: marginX,
    y: bodyTop - bodyRowH,
    width: contentWidth,
    height: headerRowH + bodyRowH,
    borderColor: LINE,
    borderWidth: 1,
  });
  page.drawLine({ start: { x: marginX + half, y: bodyTop - bodyRowH }, end: { x: marginX + half, y: panelTop }, thickness: 1, color: LINE });

  let ty = bodyTop - bodyPadTop - 9;
  text(tenant.name, marginX + 10, ty, { size: 9.5, f: bold, color: BLACK });
  ty -= linePitch;
  for (const l of tenantLines) {
    text(l, marginX + 10, ty, { size: 8.5, color: GRAY });
    ty -= linePitch;
  }

  if (clientLogo) {
    const box = clientLogoBox;
    const scale = Math.min(box / clientLogo.width, box / clientLogo.height, 1);
    const lw = clientLogo.width * scale;
    const lh = clientLogo.height * scale;
    page.drawImage(clientLogo, { x: marginX + contentWidth - lw - 10, y: panelTop - headerRowH - lh - 8, width: lw, height: lh });
  }
  let cy = bodyTop - bodyPadTop - 9;
  text(clientName, marginX + half + 10, cy, { size: 9.5, f: bold, color: BLACK });
  cy -= linePitch;
  for (const l of clientLines) {
    text(l, marginX + half + 10, cy, { size: 8.5, color: GRAY });
    cy -= linePitch;
  }

  y = bodyTop - bodyRowH - 22;

  // ---------------------------------------------------------------------
  // Table des prestations
  // ---------------------------------------------------------------------
  const colDesc = marginX + 8;
  const colQte = marginX + 230;
  const puColRight = marginX + 375;
  const totalColRight = width - marginX - 10;

  const tableHeaderH = 20;
  page.drawRectangle({ x: marginX, y: y - tableHeaderH, width: contentWidth, height: tableHeaderH, color: accent });
  text("Description", colDesc, y - tableHeaderH + 7, { size: 8.5, f: bold, color: BLACK });
  text("Qté", colQte, y - tableHeaderH + 7, { size: 8.5, f: bold, color: BLACK });
  rightText("PU HT", puColRight, y - tableHeaderH + 7, { size: 8.5, f: bold, color: BLACK });
  rightText("Total HT", totalColRight, y - tableHeaderH + 7, { size: 8.5, f: bold, color: BLACK });
  y -= tableHeaderH;

  for (const ligne of (facture.lignes ?? []) as Ligne[]) {
    if (y < 140) {
      y = height - 60;
      doc.addPage([595.28, 841.89]);
    }
    const rowH = 22;
    text(ligne.description, colDesc, y - rowH + 8, { size: 9.5, color: BLACK });
    text(`${ligne.quantite} ${ligne.unite}`, colQte, y - rowH + 8, { size: 9.5, color: GRAY });
    rightText(euros(ligne.prix_unitaire_ht), puColRight, y - rowH + 8, { size: 9.5, color: GRAY });
    rightText(euros(ligne.quantite * ligne.prix_unitaire_ht), totalColRight, y - rowH + 8, { size: 9.5, f: bold, color: BLACK });
    page.drawLine({ start: { x: marginX, y: y - rowH }, end: { x: width - marginX, y: y - rowH }, thickness: 0.75, color: LINE });
    y -= rowH;
  }

  y -= 16;

  // ---------------------------------------------------------------------
  // Totaux — Total TTC mis en évidence dans une cellule teintée
  // ---------------------------------------------------------------------
  const totalsX = marginX + 300;
  const totalsW = contentWidth - 300;

  text("Total HT", totalsX, y, { size: 9.5, color: GRAY });
  rightText(euros(facture.total_ht), totalColRight, y, { size: 9.5, color: BLACK });
  y -= 16;

  if (tenant.tva_regime === "franchise") {
    text("TVA non applicable, art. 293 B du CGI", totalsX, y, { size: 8.5, color: GRAY });
    y -= 14;
  } else {
    text(`TVA (${tenant.tva_rate ?? 20}%)`, totalsX, y, { size: 9.5, color: GRAY });
    rightText(euros(facture.tva_montant), totalColRight, y, { size: 9.5, color: BLACK });
    y -= 16;
  }

  y -= 6;
  const ttcCellH = 26;
  page.drawRectangle({ x: totalsX, y: y - ttcCellH, width: totalsW, height: ttcCellH, color: tint });
  text("TOTAL TTC", totalsX + 10, y - ttcCellH + 9, { size: 10, f: bold, color: BLACK });
  rightText(euros(facture.total_ttc), totalColRight, y - ttcCellH + 8, { size: 11, f: bold, color: BLACK });
  y -= ttcCellH + 22;

  // ---------------------------------------------------------------------
  // Encart mode de paiement (callout teinté, filet d'accent à gauche)
  // ---------------------------------------------------------------------
  if (y < 130) {
    y = height - 60;
    doc.addPage([595.28, 841.89]);
  }
  const paymentLines = [`Mode de paiement : ${facture.mode_paiement || "Virement bancaire"}`];
  if (tenant.iban) paymentLines.push(`IBAN : ${tenant.iban}`);
  const calloutH = 14 + paymentLines.length * 14 + 10;
  page.drawRectangle({ x: marginX, y: y - calloutH, width: contentWidth, height: calloutH, color: tint });
  page.drawRectangle({ x: marginX, y: y - calloutH, width: 3, height: calloutH, color: accent });
  let py = y - 16;
  for (const l of paymentLines) {
    text(l, marginX + 14, py, { size: 9.5, color: BLACK });
    py -= 14;
  }
  y -= calloutH + 20;

  // ---------------------------------------------------------------------
  // Mentions légales
  // ---------------------------------------------------------------------
  const penalites = settings.taux_penalites_retard ?? "8,25 % l'an";
  const indemnite = settings.indemnite_recouvrement ?? "40 €";
  const mentions = `En cas de retard de paiement, une pénalité au taux de ${penalites} sera exigible, ainsi qu'une indemnité forfaitaire de recouvrement de ${indemnite}. Pas d'escompte pour paiement anticipé.`;

  for (const l of wrap(mentions, contentWidth, 8)) {
    text(l, marginX, y, { size: 8, color: GRAY });
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
