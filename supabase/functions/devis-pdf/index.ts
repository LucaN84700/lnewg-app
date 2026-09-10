// Edge Function : génère le PDF d'un devis à la volée (pas de persistance, régénéré à chaque
// téléchargement). Respecte la RLS via le JWT de l'appelant. Pas de XML structuré ici : la
// réforme facturation électronique ne couvre que les factures, pas les devis.

import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

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

  const echeanceDate = new Date(devis.date_emission);
  echeanceDate.setDate(echeanceDate.getDate() + (devis.validite_jours ?? 30));
  const validiteStr = echeanceDate.toISOString().slice(0, 10);

  text(`DEVIS ${devis.numero}`, width - marginX - 220, height - 60, { size: 14, f: bold });
  text(`Date d'émission : ${devis.date_emission}`, width - marginX - 220, height - 78, { size: 9, color: gray });
  text(`Valable jusqu'au : ${validiteStr}`, width - marginX - 220, height - 92, { size: 9, color: gray });

  y -= 20;
  page.drawLine({ start: { x: marginX, y }, end: { x: width - marginX, y }, thickness: 1, color: line });
  y -= 24;

  // Client
  const clientBlockTop = y;
  text("Devis établi pour", marginX, y, { size: 9, f: bold, color: gray });
  y -= 14;
  const client = devis.clients;
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

  y -= 10;
  if (devis.objet) {
    text(devis.objet, marginX, y, { size: 11, f: bold });
    y -= 16;
  }
  if (devis.contexte) {
    for (const l of wrap(devis.contexte, width - 2 * marginX, 9)) {
      text(l, marginX, y, { size: 9, color: gray });
      y -= 12;
    }
    y -= 6;
  }

  y -= 10;

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

  for (const ligne of (devis.lignes ?? []) as Ligne[]) {
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
  text(euros(devis.total_ht), colTotal, y, { size: 10 });
  y -= 16;

  if (tenant.tva_regime === "franchise") {
    text("TVA non applicable, art. 293 B du CGI", 400, y, { size: 10, color: gray });
    y -= 16;
    text("Total TTC", 400, y, { size: 11, f: bold });
    text(euros(devis.total_ht), colTotal, y, { size: 11, f: bold });
  } else {
    const rate = tenant.tva_rate ?? 20;
    const tva = devis.total_ht * (rate / 100);
    text(`TVA (${rate}%)`, 400, y, { size: 10, color: gray });
    text(euros(tva), colTotal, y, { size: 10 });
    y -= 16;
    text("Total TTC", 400, y, { size: 11, f: bold });
    text(euros(devis.total_ht + tva), colTotal, y, { size: 11, f: bold });
  }
  y -= 40;

  page.drawLine({ start: { x: marginX, y }, end: { x: width - marginX, y }, thickness: 1, color: line });
  y -= 24;

  text(
    `Devis valable ${devis.validite_jours ?? 30} jours à compter du ${devis.date_emission}. Sans réponse passé ce délai, le devis sera considéré comme caduc.`,
    marginX,
    y,
    { size: 8, color: gray },
  );
  y -= 40;

  text("Bon pour accord", marginX, y, { size: 10, f: bold });
  y -= 14;
  text("Date et signature du client, précédées de la mention « Bon pour accord » :", marginX, y, {
    size: 9,
    color: gray,
  });
  y -= 60;
  page.drawRectangle({
    x: marginX,
    y,
    width: 220,
    height: 55,
    borderColor: line,
    borderWidth: 1,
  });

  return await doc.save();
}
