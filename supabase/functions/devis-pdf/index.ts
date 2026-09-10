// Edge Function : génère le PDF d'un devis à la volée (pas de persistance, régénéré à chaque
// téléchargement). Respecte la RLS via le JWT de l'appelant. Pas de XML structuré ici : la
// réforme facturation électronique ne couvre que les factures, pas les devis.
//
// Mise en page calquée sur la charte du devis de référence LNEWG (skill_LNEWG/lnewg-devis) :
// bandeau navy plein en en-tête, blocs ÉMIS PAR / CLIENT en table teintée, titres de section
// soulignés en couleur d'accent, total mis en évidence dans une cellule pleine plutôt qu'en
// texte coloré isolé — pour que la couleur d'accent (plan Master) recolore une vraie mise en
// page structurée, et pas seulement des mots ici et là.

import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { accentFor, contrastText, GRAY, lighten, LINE, NAVY, WHITE } from "../_shared/pdf-style.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BANNER_SUBTEXT = rgb(0.62, 0.75, 0.95);

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
  const devisId = url.searchParams.get("devis_id");
  if (!devisId) {
    return new Response(JSON.stringify({ error: "devis_id manquant" }), {
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

    const { data: devis, error: devisError } = await supabase
      .from("devis")
      .select("*, clients(name, company_name, address, email, phone, logo_url)")
      .eq("id", devisId)
      .single();
    if (devisError) throw devisError;

    const pdfBytes = await buildDevisPdf(devis, tenant);

    return new Response(pdfBytes, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${devis.numero}.pdf"`,
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
async function buildDevisPdf(devis: any, tenant: any) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const accent = accentFor(tenant);
  const tint = lighten(accent);
  const accentText = contrastText(accent);

  const { width, height } = page.getSize();
  const marginX = 50;
  const contentWidth = width - marginX * 2;

  function text(
    str: string,
    x: number,
    yPos: number,
    opts: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb> } = {},
  ) {
    page.drawText(str ?? "", { x, y: yPos, size: opts.size ?? 10, font: opts.f ?? font, color: opts.color ?? NAVY });
  }

  function centeredText(str: string, yPos: number, opts: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb> } = {}) {
    const f = opts.f ?? font;
    const size = opts.size ?? 10;
    const w = f.widthOfTextAtSize(str, size);
    text(str, (width - w) / 2, yPos, opts);
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

  function sectionHeading(label: string, yPos: number) {
    text(label, marginX, yPos, { size: 11, f: bold, color: NAVY });
    page.drawLine({
      start: { x: marginX, y: yPos - 5 },
      end: { x: width - marginX, y: yPos - 5 },
      thickness: 1.5,
      color: accent,
    });
    return yPos - 20;
  }

  let y = height;

  // ---------------------------------------------------------------------
  // Bandeau en-tête (navy plein, logo + identité de l'entreprise)
  // ---------------------------------------------------------------------
  const bannerHeight = 64;
  page.drawRectangle({ x: 0, y: height - bannerHeight, width, height: bannerHeight, color: NAVY });

  const tenantLogo = tenant.logo_url ? await embedLogo(tenant.logo_url) : null;
  let bannerTextX = marginX;
  if (tenantLogo) {
    const box = 42;
    const scale = Math.min(box / tenantLogo.width, box / tenantLogo.height, 1);
    const lw = tenantLogo.width * scale;
    const lh = tenantLogo.height * scale;
    page.drawImage(tenantLogo, { x: marginX, y: height - bannerHeight + (bannerHeight - lh) / 2, width: lw, height: lh });
    bannerTextX = marginX + box + 14;
  }
  text(tenant.name, bannerTextX, height - 30, { size: 16, f: bold, color: WHITE });
  const contactLine = [tenant.address, tenant.siret ? `SIRET ${tenant.siret}` : null, tenant.email, tenant.phone]
    .filter(Boolean)
    .join("  ·  ");
  if (contactLine) {
    text(contactLine, bannerTextX, height - 45, { size: 7.5, color: BANNER_SUBTEXT });
  }

  y = height - bannerHeight - 26;

  // ---------------------------------------------------------------------
  // Titre
  // ---------------------------------------------------------------------
  centeredText(`DEVIS ${devis.numero}`, y, { size: 16, f: bold, color: NAVY });
  y -= 18;

  const echeanceDate = new Date(devis.date_emission);
  echeanceDate.setDate(echeanceDate.getDate() + (devis.validite_jours ?? 30));
  const validiteStr = echeanceDate.toISOString().slice(0, 10);
  centeredText(
    `Date d'émission : ${devis.date_emission}   ·   Valable jusqu'au : ${validiteStr}`,
    y,
    { size: 9.5, f: bold, color: accent },
  );
  y -= 24;

  // ---------------------------------------------------------------------
  // Panneau ÉMIS PAR / CLIENT
  // ---------------------------------------------------------------------
  const half = contentWidth / 2;
  const headerRowH = 18;
  const linePitch = 12;
  const bodyPadTop = 12;
  const bodyPadBottom = 10;

  const client = devis.clients;
  const clientLogo = client?.logo_url ? await embedLogo(client.logo_url) : null;

  const tenantLines = [tenant.address, tenant.siret ? `SIRET ${tenant.siret}` : null, tenant.email, tenant.phone].filter(
    Boolean,
  ) as string[];
  const clientName = client?.company_name ? `${client?.name ?? ""} — ${client.company_name}` : client?.name ?? "";
  const clientLines = [client?.address, client?.email, client?.phone].filter(Boolean) as string[];

  const bodyLineCount = Math.max(tenantLines.length + 1, clientLines.length + 1);
  const bodyRowH = bodyPadTop + bodyLineCount * linePitch + bodyPadBottom;

  const panelTop = y;
  page.drawRectangle({ x: marginX, y: panelTop - headerRowH, width: contentWidth, height: headerRowH, color: NAVY });
  text("ÉMIS PAR", marginX + 10, panelTop - headerRowH + 6, { size: 9, f: bold, color: WHITE });
  text("CLIENT", marginX + half + 10, panelTop - headerRowH + 6, { size: 9, f: bold, color: WHITE });

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
  text(tenant.name, marginX + 10, ty, { size: 9.5, f: bold, color: NAVY });
  ty -= linePitch;
  for (const l of tenantLines) {
    text(l, marginX + 10, ty, { size: 8.5, color: GRAY });
    ty -= linePitch;
  }

  if (clientLogo) {
    const box = 32;
    const scale = Math.min(box / clientLogo.width, box / clientLogo.height, 1);
    const lw = clientLogo.width * scale;
    const lh = clientLogo.height * scale;
    page.drawImage(clientLogo, { x: marginX + contentWidth - lw - 10, y: panelTop - headerRowH - lh - 8, width: lw, height: lh });
  }
  let cy = bodyTop - bodyPadTop - 9;
  text(clientName, marginX + half + 10, cy, { size: 9.5, f: bold, color: NAVY });
  cy -= linePitch;
  for (const l of clientLines) {
    text(l, marginX + half + 10, cy, { size: 8.5, color: GRAY });
    cy -= linePitch;
  }

  y = bodyTop - bodyRowH - 22;

  // ---------------------------------------------------------------------
  // Objet / Contexte
  // ---------------------------------------------------------------------
  if (devis.objet) {
    y = sectionHeading("OBJET", y);
    for (const l of wrap(devis.objet, contentWidth, 10)) {
      text(l, marginX, y, { size: 10, color: GRAY });
      y -= 13;
    }
    y -= 8;
  }

  if (devis.contexte) {
    y = sectionHeading("CONTEXTE", y);
    for (const l of wrap(devis.contexte, contentWidth, 9.5)) {
      text(l, marginX, y, { size: 9.5, color: GRAY });
      y -= 12;
    }
    y -= 8;
  }

  // ---------------------------------------------------------------------
  // Table des prestations
  // ---------------------------------------------------------------------
  const colDesc = marginX + 8;
  const colQte = marginX + 300;
  const colPu = marginX + 370;
  const colTotal = marginX + 450;

  const tableHeaderH = 20;
  page.drawRectangle({ x: marginX, y: y - tableHeaderH, width: contentWidth, height: tableHeaderH, color: NAVY });
  text("Description", colDesc, y - tableHeaderH + 7, { size: 8.5, f: bold, color: WHITE });
  text("Qté", colQte, y - tableHeaderH + 7, { size: 8.5, f: bold, color: WHITE });
  text("PU HT", colPu, y - tableHeaderH + 7, { size: 8.5, f: bold, color: WHITE });
  text("Total HT", colTotal, y - tableHeaderH + 7, { size: 8.5, f: bold, color: WHITE });
  y -= tableHeaderH;

  for (const ligne of (devis.lignes ?? []) as Ligne[]) {
    if (y < 140) {
      y = height - 60;
      doc.addPage([595.28, 841.89]);
    }
    const rowH = 22;
    text(ligne.description, colDesc, y - rowH + 8, { size: 9.5, color: NAVY });
    text(`${ligne.quantite} ${ligne.unite}`, colQte, y - rowH + 8, { size: 9.5, color: GRAY });
    text(euros(ligne.prix_unitaire_ht), colPu, y - rowH + 8, { size: 9.5, color: GRAY });
    text(euros(ligne.quantite * ligne.prix_unitaire_ht), colTotal, y - rowH + 8, { size: 9.5, f: bold, color: NAVY });
    page.drawLine({ start: { x: marginX, y: y - rowH }, end: { x: width - marginX, y: y - rowH }, thickness: 0.75, color: LINE });
    y -= rowH;
  }

  y -= 16;

  // ---------------------------------------------------------------------
  // Totaux — Total TTC mis en évidence dans une cellule pleine (couleur d'accent)
  // ---------------------------------------------------------------------
  const totalsX = marginX + 300;
  const totalsW = contentWidth - 300;

  text("Total HT", totalsX, y, { size: 9.5, color: GRAY });
  text(euros(devis.total_ht), colTotal, y, { size: 9.5, color: NAVY });
  y -= 16;

  let totalTtc = devis.total_ht;
  if (tenant.tva_regime === "franchise") {
    text("TVA non applicable, art. 293 B du CGI", totalsX, y, { size: 8.5, color: GRAY });
    y -= 14;
  } else {
    const rate = tenant.tva_rate ?? 20;
    const tva = devis.total_ht * (rate / 100);
    text(`TVA (${rate}%)`, totalsX, y, { size: 9.5, color: GRAY });
    text(euros(tva), colTotal, y, { size: 9.5, color: NAVY });
    totalTtc = devis.total_ht + tva;
    y -= 16;
  }

  y -= 6;
  const ttcCellH = 26;
  page.drawRectangle({ x: totalsX, y: y - ttcCellH, width: totalsW, height: ttcCellH, color: accent });
  text("TOTAL TTC", totalsX + 10, y - ttcCellH + 9, { size: 10, f: bold, color: accentText });
  const ttcValueStr = euros(totalTtc);
  const ttcValueW = bold.widthOfTextAtSize(ttcValueStr, 11);
  text(ttcValueStr, totalsX + totalsW - ttcValueW - 10, y - ttcCellH + 8, { size: 11, f: bold, color: accentText });
  y -= ttcCellH + 20;

  // ---------------------------------------------------------------------
  // Note de validité
  // ---------------------------------------------------------------------
  text(
    `Devis valable ${devis.validite_jours ?? 30} jours à compter du ${devis.date_emission}. Sans réponse passé ce délai, le devis sera considéré comme caduc.`,
    marginX,
    y,
    { size: 8, color: GRAY },
  );
  y -= 30;

  // ---------------------------------------------------------------------
  // Bon pour accord — deux blocs signature teintés, comme la charte LNEWG
  // ---------------------------------------------------------------------
  if (y < 130) {
    y = height - 60;
    doc.addPage([595.28, 841.89]);
  }
  y = sectionHeading("BON POUR ACCORD", y);

  const sigBoxH = 70;
  page.drawRectangle({ x: marginX, y: y - sigBoxH, width: half, height: sigBoxH, color: tint });
  page.drawRectangle({ x: marginX + half, y: y - sigBoxH, width: half, height: sigBoxH, color: tint });
  text(`Pour ${tenant.name}`, marginX + 10, y - 16, { size: 9.5, f: bold, color: NAVY });
  text("Date et signature", marginX + 10, y - 30, { size: 8.5, color: GRAY });
  const clientLabel = client?.company_name || client?.name || "le client";
  text(`Pour ${clientLabel}`, marginX + half + 10, y - 16, { size: 9.5, f: bold, color: NAVY });
  text("Date et signature", marginX + half + 10, y - 30, { size: 8.5, color: GRAY });

  return await doc.save();
}
