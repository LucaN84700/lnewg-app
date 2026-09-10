// Edge Function : transcrit un enregistrement vocal (artisan sur chantier) et le structure
// en devis exploitable par le formulaire. Trois appels :
// 1) Whisper transcrit l'audio (biaisé avec le nom des clients/prestations connus du tenant,
//    pour mieux reconnaître les noms propres)
// 2) On récupère les clients et le catalogue de prix du tenant (RLS)
// 3) Un modèle texte structure la dictée en JSON, en réutilisant le catalogue pour les prix
//    et en essayant de faire correspondre le client cité à la base existante
// Le transcript brut est toujours renvoyé pour que l'artisan puisse vérifier ce qui a été compris.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DevisLigne {
  description: string;
  quantite: number;
  unite: string;
  prix_unitaire_ht: number;
}

interface StructuredDevis {
  objet: string;
  contexte: string;
  client_id: string | null;
  client_name: string;
  lignes: DevisLigne[];
}

// Exemple few-shot injecté avant la dictée réelle : gpt-4o-mini suit beaucoup plus fidèlement
// un exemple concret de comportement attendu que les règles textuelles seules. Sans lui, le
// modèle a une tendance mesurée à "caser" chaque ligne dans une entrée du catalogue existante
// (même sans rapport avec ce qui a été dicté) plutôt que d'inventer une nouvelle ligne, et à
// retomber sur le prix catalogue au lieu du prix explicitement dicté par l'artisan.
const FEW_SHOT_EXAMPLE = [
  {
    role: "user" as const,
    content:
      "Devis pour Martin Dupuis. Il faut que je pose une fenêtre en alu, ce n'est pas dans mon catalogue habituel, je vais la facturer 800€. Et il faut aussi refaire la peinture du salon à 25€ le mètre carré, il y a à peu près 30m2.",
  },
  {
    role: "assistant" as const,
    content: JSON.stringify({
      objet: "Pose fenêtre et peinture salon",
      contexte:
        "Le client Martin Dupuis souhaite la pose d'une fenêtre en aluminium ainsi que la remise en peinture de son salon, d'environ 30m2.",
      client_id: null,
      client_name: "Martin Dupuis",
      lignes: [
        { description: "Pose de fenêtre en aluminium", quantite: 1, unite: "u", prix_unitaire_ht: 800 },
        { description: "Peinture", quantite: 30, unite: "m2", prix_unitaire_ht: 25 },
      ],
    }),
  },
];

function buildStructuringPrompt(
  clients: { id: string; name: string }[],
  catalogue: { description: string; unite: string; prix_unitaire_ht: number }[],
) {
  return `Tu extrais les informations d'un devis BTP à partir d'une dictée orale d'un artisan (français).
Réponds uniquement en JSON avec ce format exact :
{
  "objet": "résumé court du devis (5-8 mots)",
  "contexte": "reformulation en 1-3 phrases de ce que l'artisan a dicté (chantier, prestations, précisions utiles) ; ne laisse vide que si la dictée ne contient vraiment rien au-delà du strict prix/quantité",
  "client_id": "id du client s'il correspond à un de la liste ci-dessous, sinon null",
  "client_name": "nom du client tel que compris dans la dictée, chaîne vide si aucun client mentionné",
  "lignes": [
    { "description": "string", "quantite": number, "unite": "string (ex: u, m2, m, h, jour)", "prix_unitaire_ht": number }
  ]
}

Clients existants de cet artisan (fais correspondre même en cas d'approximation ou de faute de
prononciation/transcription — ex: "Sobeleza" doit être rapproché de "So Belezaa" s'il est dans la liste) :
${JSON.stringify(clients)}

Catalogue de prestations habituelles de cet artisan, avec leurs prix :
${JSON.stringify(catalogue)}

Règles impératives, dans cet ordre de priorité :
1. Base-toi UNIQUEMENT sur ce que l'artisan a dicté. Chaque ligne du devis correspond à une
   prestation ou fourniture EXPLICITEMENT mentionnée dans le texte. N'ajoute JAMAIS une ligne
   pour une entrée du catalogue qui n'a pas été dictée, même si le catalogue est court : le
   catalogue sert uniquement à retrouver le prix/l'unité d'une prestation DÉJÀ mentionnée, jamais
   à en inventer une nouvelle. Le nombre de lignes du devis doit être exactement le nombre de
   prestations distinctes dictées, pas plus.
2. Une prestation dictée ne correspond à une entrée du catalogue que si elles décrivent le MÊME
   travail (ex: "dallage en béton" correspond à "Pose de dalles béton" — reformulation du même
   geste). Un nom de catalogue qui ne correspond pas au sens de ce qui est dicté n'est jamais
   utilisé, même s'il ne reste "que lui" dans le catalogue.
3. Si un prix a été dicté explicitement pour une ligne (ex: "à 1500€", "je vais mettre 4000€"),
   utilise TOUJOURS ce prix, même si la ligne correspond aussi à une entrée du catalogue avec un
   prix différent. N'utilise le prix du catalogue que si aucun prix n'a été dicté pour cette ligne.
4. Si le prix dicté semble être un montant total pour toute la prestation plutôt qu'un prix par
   unité (le montant est annoncé avant ou après une quantité en m2/m/h sans dire "le mètre" ou
   "de l'heure"), calcule prix_unitaire_ht = montant / quantité. Si le prix dicté est clairement
   déjà un prix unitaire ("50€ le mètre carré", "30€/h"), utilise-le tel quel.
5. Si une prestation dictée ne correspond à AUCUNE entrée du catalogue, crée quand même une
   ligne avec une description reformulée proprement à partir de la dictée, la quantité et le
   prix dictés (prix_unitaire_ht à 0 seulement si vraiment aucun prix n'a été donné pour elle).
6. Si aucune quantité n'est mentionnée pour une ligne, mets quantite à 1.`;
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

  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiApiKey) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY non configurée" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  try {
    const formData = await req.formData();
    const audio = formData.get("audio");
    if (!(audio instanceof File)) {
      return new Response(JSON.stringify({ error: "Fichier audio manquant (champ 'audio')" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: clients }, { data: catalogue }] = await Promise.all([
      supabase.from("clients").select("id, name").order("name"),
      supabase.from("catalogue_articles").select("description, unite, prix_unitaire_ht").order("description"),
    ]);

    const vocabHint = [...(clients ?? []).map((c) => c.name), ...(catalogue ?? []).map((a) => a.description)]
      .join(", ")
      .slice(0, 800);

    const whisperForm = new FormData();
    whisperForm.set("file", audio, audio.name || "audio.webm");
    whisperForm.set("model", "whisper-1");
    whisperForm.set("language", "fr");
    whisperForm.set("response_format", "text");
    if (vocabHint) whisperForm.set("prompt", vocabHint);

    const transcriptionResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiApiKey}` },
      body: whisperForm,
    });

    if (!transcriptionResponse.ok) {
      const detail = await transcriptionResponse.text();
      throw new Error(`Échec de la transcription (${transcriptionResponse.status}) : ${detail}`);
    }

    const transcript = (await transcriptionResponse.text()).trim();

    if (!transcript) {
      return new Response(JSON.stringify({ error: "Aucune parole détectée dans l'enregistrement" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const structuringResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildStructuringPrompt(clients ?? [], catalogue ?? []) },
          ...FEW_SHOT_EXAMPLE,
          { role: "user", content: transcript },
        ],
        temperature: 0.1,
      }),
    });

    if (!structuringResponse.ok) {
      const detail = await structuringResponse.text();
      throw new Error(`Échec de la structuration (${structuringResponse.status}) : ${detail}`);
    }

    const structuringJson = await structuringResponse.json();
    const structured = JSON.parse(structuringJson.choices[0].message.content) as StructuredDevis;

    return new Response(JSON.stringify({ transcript, ...structured }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
