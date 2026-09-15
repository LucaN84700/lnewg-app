// Edge Function : envoie l'email de bienvenue (message d'accueil + fiche technique du SaaS en
// PDF joint) a un nouvel inscrit. Deux façons de l'appeler : (1) avec la service_role key et un
// { to, prenom } explicite dans le corps — usage interne/test, ex. l'envoi de prévisualisation à
// Luca ; (2) avec le JWT d'un utilisateur normal, juste après son inscription — l'email part
// alors automatiquement vers SA propre adresse (jamais une adresse arbitraire fournie par le
// client, pour éviter tout abus). Le PDF est régénéré à chaque envoi (pas de persistance) pour
// rester toujours a jour avec les fonctionnalités réelles du SaaS.

import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { BLACK, GRAY, DEFAULT_ACCENT, lighten } from "../_shared/pdf-style.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Feature {
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    title: "Tableau de bord",
    body: "L'historique complet de ce qui se passe dans votre compte : devis créés, factures émises, paiements reçus, relances envoyées. Toute l'activité de votre équipe, en un coup d'oeil.",
  },
  {
    title: "Clients",
    body: "Votre carnet d'adresses centralisé : coordonnées, historique des devis et factures liés à chaque client.",
  },
  {
    title: "Catalogue",
    body: "Enregistrez vos articles et prestations une seule fois (description, prix, unité), puis réutilisez-les en un clic dans vos devis et factures.",
  },
  {
    title: "Devis",
    body: "Créez des devis professionnels en quelques minutes, envoyez-les par email depuis l'app, suivez leur statut et transformez un devis accepté en facture en un clic.",
  },
  {
    title: "Factures",
    body: "Facturation classique, export PDF, suivi des paiements. Chaque facture reste liée à son client et à son devis d'origine.",
  },
  {
    title: "Relances automatiques (Pro et Master)",
    body: "Un barème de relance personnalisable (ex. J+1, J+15, J+30) : votre entreprise envoie automatiquement les emails de relance à vos clients, sans y penser, avec un ton qui se durcit progressivement.",
  },
  {
    title: "Comptabilité (Master)",
    body: "Tableau comptable mensuel et annuel généré automatiquement à partir de vos devis et factures, exportable en PDF pour votre comptable.",
  },
  {
    title: "Multi-utilisateurs",
    body: "Ajoutez les membres de votre équipe avec des droits d'accès personnalisables page par page.",
  },
  {
    title: "Multi-appareils",
    body: "Travaillez depuis plusieurs appareils, avec le même niveau de contrôle sur les accès.",
  },
  {
    title: "Personnalisation (Master)",
    body: "Votre logo et vos couleurs sur tous vos documents pour une image professionnelle et cohérente.",
  },
  {
    title: "Sécurité et simplicité",
    body: "Vos données sont hébergées de façon sécurisée, sauvegardées en continu, accessibles uniquement par vous et votre équipe.",
  },
];

function welcomeHtml(prenom: string) {
  const greeting = prenom ? `, ${prenom}` : "";
  return `
  <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; color:#0B1E3D;">
    <p style="font-size: 20px; font-weight: 700; margin: 0 0 16px;">Bienvenue chez LNEWG${greeting} 👋</p>
    <p style="font-size: 15px; line-height: 1.6; margin: 0 0 14px;">
      Votre compte est prêt. Vous avez 7 jours pour tester le forfait Master en entier — devis, factures,
      relances automatiques, comptabilité, tout est débloqué, sans limite.
    </p>
    <p style="font-size: 15px; line-height: 1.6; margin: 0 0 14px; font-weight: 600;">
      La plupart de nos clients gagnent plusieurs heures par semaine dès la première semaine d'utilisation
      — laissez-nous vous montrer pourquoi.
    </p>
    <p style="font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
      Vous trouverez en pièce jointe la fiche technique du logiciel : toutes les fonctionnalités,
      expliquées simplement.
    </p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0; color:#5A6472;">
      Un souci, une question ? Écrivez-nous à
      <a href="mailto:contact@lnewg.com" style="color:#3DA5F5;">contact@lnewg.com</a>, on répond au plus vite.
    </p>
  </div>`;
}

async function buildFicheTechniquePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  let page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const accent = lighten(DEFAULT_ACCENT, 0.14);
  const marginX = 50;
  let { width, height } = page.getSize();
  const contentWidth = width - marginX * 2;
  let y = height;

  function text(
    str: string,
    x: number,
    yPos: number,
    opts: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb> } = {},
  ) {
    page.drawText(str, { x, y: yPos, size: opts.size ?? 10, font: opts.f ?? font, color: opts.color ?? BLACK });
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

  function ensureSpace(needed: number) {
    if (y - needed < 60) {
      page = doc.addPage([595.28, 841.89]);
      ({ width, height } = page.getSize());
      y = height - 50;
    }
  }

  async function embedLogo() {
    try {
      const res = await fetch("https://app.lnewg.com/lnewg-icon.png");
      if (!res.ok) return null;
      const bytes = new Uint8Array(await res.arrayBuffer());
      return await doc.embedPng(bytes);
    } catch {
      return null;
    }
  }

  const WHITE = rgb(1, 1, 1);
  const bannerHeight = 74;
  page.drawRectangle({ x: 0, y: height - bannerHeight, width, height: bannerHeight, color: BLACK });

  const logoImg = await embedLogo();
  let bannerTextX = marginX;
  if (logoImg) {
    const box = 50;
    const scale = Math.min(box / logoImg.width, box / logoImg.height, 1);
    const lw = logoImg.width * scale;
    const lh = logoImg.height * scale;
    page.drawImage(logoImg, { x: marginX, y: height - bannerHeight + (bannerHeight - lh) / 2, width: lw, height: lh });
    bannerTextX = marginX + box + 14;
  }

  // Wordmark LNEWG : "NEW" en bleu électrique LNEWG, "L" et "G" en noir — reprend le style du
  // wordmark utilisé dans la sidebar de l'app (AppShell.tsx).
  const wordmarkSize = 22;
  let cursorX = bannerTextX;
  text("L", cursorX, height - 34, { size: wordmarkSize, f: bold, color: WHITE });
  cursorX += bold.widthOfTextAtSize("L", wordmarkSize);
  text("NEW", cursorX, height - 34, { size: wordmarkSize, f: bold, color: DEFAULT_ACCENT });
  cursorX += bold.widthOfTextAtSize("NEW", wordmarkSize);
  text("G", cursorX, height - 34, { size: wordmarkSize, f: bold, color: WHITE });

  text("Le logiciel de gestion tout-en-un pour votre entreprise", bannerTextX, height - 52, { size: 9.5, color: WHITE });
  y = height - bannerHeight - 30;

  text("Fiche technique", marginX, y, { size: 16, f: bold, color: BLACK });
  y -= 26;

  for (const feature of FEATURES) {
    ensureSpace(50);
    text(feature.title, marginX, y, { size: 11.5, f: bold, color: BLACK });
    page.drawLine({ start: { x: marginX, y: y - 5 }, end: { x: width - marginX, y: y - 5 }, thickness: 1, color: accent });
    y -= 18;
    const lines = wrap(feature.body, contentWidth, 9.5);
    for (const line of lines) {
      ensureSpace(14);
      text(line, marginX, y, { size: 9.5, color: GRAY });
      y -= 13;
    }
    y -= 10;
  }

  return await doc.save();
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  try {
    let to: string;
    let prenom: string;

    if (serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`) {
      // Appel interne (test manuel / envoi piloté côté serveur) : l'adresse est fournie explicitement.
      const body = await req.json().catch(() => ({}));
      if (!body.to || typeof body.to !== "string") {
        return new Response(JSON.stringify({ error: "Adresse email manquante" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      to = body.to;
      prenom = typeof body.prenom === "string" ? body.prenom : "";
    } else {
      // Appel utilisateur normal (juste après l'inscription) : on envoie uniquement à SA propre
      // adresse, jamais à une adresse fournie par le client, pour éviter tout abus de la fonction
      // comme relais d'envoi d'emails arbitraires.
      const callerClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
        error: userError,
      } = await callerClient.auth.getUser();
      if (userError || !user?.email) {
        return new Response(JSON.stringify({ error: "Session invalide" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: profile } = await callerClient.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      to = user.email;
      prenom = (profile?.full_name ?? "").split(" ")[0] ?? "";
    }

    const pdfBytes = await buildFicheTechniquePdf();
    const pdfBase64 = base64FromBytes(pdfBytes);

    const sendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `LNEWG <${fromEmail}>`,
        to: [to],
        subject: "Bienvenue chez LNEWG — votre essai Master a commencé",
        html: welcomeHtml(prenom ?? ""),
        attachments: [{ filename: "fiche-technique-lnewg.pdf", content: pdfBase64 }],
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
