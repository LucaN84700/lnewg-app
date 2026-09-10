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

function buildStructuringPrompt(
  clients: { id: string; name: string }[],
  catalogue: { description: string; unite: string; prix_unitaire_ht: number }[],
) {
  return `Tu extrais les informations d'un devis BTP à partir d'une dictée orale d'un artisan (français).
Réponds uniquement en JSON avec ce format exact :
{
  "objet": "résumé court du devis (5-8 mots)",
  "contexte": "contexte et détails du chantier en 2-3 phrases si des précisions sont données (dates, contraintes, particularités) ; chaîne vide sinon",
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

Règles :
- Une ligne par prestation ou fourniture distincte mentionnée.
- Pour chaque ligne dictée, si elle correspond clairement à une prestation du catalogue (même
  formulée différemment), réutilise EXACTEMENT la description, l'unité et le prix_unitaire_ht de
  cette entrée du catalogue plutôt que ceux de la dictée, sauf si un prix différent a été dicté
  explicitement (dans ce cas garde le prix dicté).
- Si aucune correspondance catalogue et qu'aucun prix n'est mentionné dans la dictée, mets
  prix_unitaire_ht à 0.
- Si aucune quantité n'est mentionnée, mets quantite à 1.
- N'invente aucune prestation qui ne serait pas dans le texte.`;
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
