// Edge Function : génère le tableau comptable (mensuel ou annuel) en PDF, prêt à transmettre
// à un comptable. Réservé au plan Master — vérifié côté serveur (pas seulement dans l'UI) pour
// qu'un appel direct à l'API ne puisse pas contourner la restriction.

import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const moisLabels = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

const statutLabels: Record<string, string> = {
  brouillon: "Brouillon",
  envoyee: "Envoyée",
  payee: "Payée",
  en_retard: "En retard",
  annulee: "Annulée",
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
  const type = url.searchParams.get("type") === "annuel" ? "annuel" : "mensuel";
  const month = url.searchParams.get("month");
  const yearParam = url.searchParams.get("year");

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

    let start: string;
    let end: string;
    let title: string;

    if (type === "mensuel") {
      if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        return new Response(JSON.stringify({ error: "Paramètre month invalide (attendu YYYY-MM)" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const [y, m] = month.split("-").map(Number);
      start = `${y}-${String(m).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      title = `Tableau comptable — ${moisLabels[m - 1]} ${y}`;
    } else {
      const year = Number(yearParam);
      if (!year || year < 2000 || year > 2100) {
        return new Response(JSON.stringify({ error: "Paramètre year invalide" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      start = `${year}-01-01`;
      end = `${year}-12-31`;
      title = `Bilan comptable — Année ${year}`;
    }

    const { data: factures, error: facturesError } = await supabase
      .from("factures")
      .select("*, clients(name, short_code)")
      .gte("date_facture", start)
      .lte("date_facture", end)
      .order("date_facture");
    if (facturesError) throw facturesError;

    const pdfBytes =
      type === "mensuel"
        ? await buildMonthlyPdf(title, factures ?? [], tenant)
        : await buildAnnualPdf(title, factures ?? [], tenant, Number(yearParam));

    const filename = type === "mensuel" ? `comptabilite-${month}.pdf` : `comptabilite-${yearParam}.pdf`;

    return new Response(pdfBytes, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
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
type FactureRow = any;

function makeDoc() {
  return { navy: rgb(0.043, 0.071, 0.126), gray: rgb(0.35, 0.4, 0.45), line: rgb(0.88, 0.89, 0.92) };
}

function euros(n: number) {
  return `${n.toFixed(2).replace(".", ",")} €`;
}

// deno-lint-ignore no-explicit-any
async function buildMonthlyPdf(title: string, factures: FactureRow[], tenant: any) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { navy, gray, line } = makeDoc();
  const { width, height } = page.getSize();
  const marginX = 50;
  let y = height - 60;

  function text(
    str: string,
    x: number,
    yPos: number,
    opts: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb> } = {},
  ) {
    page.drawText(str ?? "", { x, y: yPos, size: opts.size ?? 10, font: opts.f ?? font, color: opts.color ?? navy });
  }

  text(tenant.name, marginX, y, { size: 16, f: bold });
  y -= 18;
  if (tenant.siret) {
    text(`SIRET ${tenant.siret}`, marginX, y, { size: 9, color: gray });
    y -= 12;
  }
  text(`Généré le ${new Date().toISOString().slice(0, 10)}`, marginX, y, { size: 9, color: gray });
  y -= 26;

  text(title, marginX, y, { size: 14, f: bold });
  y -= 24;
  page.drawLine({ start: { x: marginX, y }, end: { x: width - marginX, y }, thickness: 1, color: line });
  y -= 20;

  const colNumero = marginX;
  const colClient = 150;
  const colDate = 290;
  const colStatut = 350;
  const colHt = 420;
  const colTtc = 490;

  text("Numéro", colNumero, y, { size: 8, f: bold, color: gray });
  text("Client", colClient, y, { size: 8, f: bold, color: gray });
  text("Date", colDate, y, { size: 8, f: bold, color: gray });
  text("Statut", colStatut, y, { size: 8, f: bold, color: gray });
  text("Total HT", colHt, y, { size: 8, f: bold, color: gray });
  text("Total TTC", colTtc, y, { size: 8, f: bold, color: gray });
  y -= 8;
  page.drawLine({ start: { x: marginX, y }, end: { x: width - marginX, y }, thickness: 1, color: line });
  y -= 16;

  let totalHt = 0;
  let totalTva = 0;
  let totalTtc = 0;

  for (const f of factures) {
    if (y < 80) {
      y = height - 60;
      doc.addPage([595.28, 841.89]);
    }
    text(f.numero, colNumero, y, { size: 9 });
    text((f.clients?.name ?? "—").slice(0, 22), colClient, y, { size: 9 });
    text(f.date_facture, colDate, y, { size: 9 });
    text(statutLabels[f.statut] ?? f.statut, colStatut, y, { size: 9 });
    text(euros(f.total_ht), colHt, y, { size: 9 });
    text(euros(f.total_ttc), colTtc, y, { size: 9 });
    if (f.statut !== "annulee") {
      totalHt += f.total_ht;
      totalTva += f.tva_montant;
      totalTtc += f.total_ttc;
    }
    y -= 18;
  }

  y -= 10;
  page.drawLine({ start: { x: colStatut, y }, end: { x: width - marginX, y }, thickness: 1, color: line });
  y -= 18;
  text("Total HT", colStatut, y, { size: 10, f: bold });
  text(euros(totalHt), colHt, y, { size: 10, f: bold });
  y -= 16;
  text("TVA", colStatut, y, { size: 10, color: gray });
  text(euros(totalTva), colHt, y, { size: 10 });
  y -= 16;
  text("Total TTC", colStatut, y, { size: 11, f: bold });
  text(euros(totalTtc), colTtc, y, { size: 11, f: bold });
  y -= 20;
  text("Les factures annulées sont exclues des totaux.", marginX, y, { size: 8, color: gray });

  return await doc.save();
}

// deno-lint-ignore no-explicit-any
async function buildAnnualPdf(title: string, factures: FactureRow[], tenant: any, year: number) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { navy, gray, line } = makeDoc();
  const { width, height } = page.getSize();
  const marginX = 50;
  let y = height - 60;

  function text(
    str: string,
    x: number,
    yPos: number,
    opts: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb> } = {},
  ) {
    page.drawText(str ?? "", { x, y: yPos, size: opts.size ?? 10, font: opts.f ?? font, color: opts.color ?? navy });
  }

  text(tenant.name, marginX, y, { size: 16, f: bold });
  y -= 18;
  if (tenant.siret) {
    text(`SIRET ${tenant.siret}`, marginX, y, { size: 9, color: gray });
    y -= 12;
  }
  text(`Généré le ${new Date().toISOString().slice(0, 10)}`, marginX, y, { size: 9, color: gray });
  y -= 26;

  text(title, marginX, y, { size: 14, f: bold });
  y -= 24;
  page.drawLine({ start: { x: marginX, y }, end: { x: width - marginX, y }, thickness: 1, color: line });
  y -= 20;

  const colMois = marginX;
  const colNb = 200;
  const colHt = 290;
  const colTva = 390;
  const colTtc = 480;

  text("Mois", colMois, y, { size: 9, f: bold, color: gray });
  text("Factures", colNb, y, { size: 9, f: bold, color: gray });
  text("Total HT", colHt, y, { size: 9, f: bold, color: gray });
  text("TVA", colTva, y, { size: 9, f: bold, color: gray });
  text("Total TTC", colTtc, y, { size: 9, f: bold, color: gray });
  y -= 8;
  page.drawLine({ start: { x: marginX, y }, end: { x: width - marginX, y }, thickness: 1, color: line });
  y -= 20;

  let grandHt = 0;
  let grandTva = 0;
  let grandTtc = 0;

  for (let m = 1; m <= 12; m++) {
    const inMonth = factures.filter((f: FactureRow) => {
      const d = new Date(f.date_facture);
      return d.getMonth() + 1 === m && f.statut !== "annulee";
    });
    const ht = inMonth.reduce((s: number, f: FactureRow) => s + f.total_ht, 0);
    const tva = inMonth.reduce((s: number, f: FactureRow) => s + f.tva_montant, 0);
    const ttc = inMonth.reduce((s: number, f: FactureRow) => s + f.total_ttc, 0);
    grandHt += ht;
    grandTva += tva;
    grandTtc += ttc;

    text(moisLabels[m - 1], colMois, y, { size: 10 });
    text(String(inMonth.length), colNb, y, { size: 10 });
    text(euros(ht), colHt, y, { size: 10 });
    text(euros(tva), colTva, y, { size: 10 });
    text(euros(ttc), colTtc, y, { size: 10 });
    y -= 20;
  }

  y -= 6;
  page.drawLine({ start: { x: marginX, y }, end: { x: width - marginX, y }, thickness: 2, color: navy });
  y -= 22;
  text(`Total ${year}`, colMois, y, { size: 11, f: bold });
  const totalCount = factures.filter((f: FactureRow) => f.statut !== "annulee").length;
  text(String(totalCount), colNb, y, { size: 11, f: bold });
  text(euros(grandHt), colHt, y, { size: 11, f: bold });
  text(euros(grandTva), colTva, y, { size: 11, f: bold });
  text(euros(grandTtc), colTtc, y, { size: 11, f: bold });
  y -= 26;
  text("Les factures annulées sont exclues des totaux.", marginX, y, { size: 8, color: gray });

  return await doc.save();
}
