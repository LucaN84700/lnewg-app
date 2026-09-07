// Edge Function : transcrit un enregistrement vocal (artisan sur chantier) et le structure
// en lignes de devis exploitables par le formulaire. Deux appels OpenAI :
// 1) Whisper transcrit l'audio en texte brut (français)
// 2) Un modèle texte structure ce texte en JSON (objet, contexte, lignes)
// Le transcript brut est toujours renvoyé pour que l'artisan puisse vérifier ce qui a été compris.

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
  lignes: DevisLigne[];
}

const STRUCTURING_PROMPT = `Tu extrais les informations d'un devis BTP à partir d'une dictée orale d'un artisan (français).
Réponds uniquement en JSON avec ce format exact :
{
  "objet": "résumé court du devis (5-8 mots)",
  "contexte": "contexte/détails du chantier en une ou deux phrases, ou chaîne vide si rien de plus",
  "lignes": [
    { "description": "string", "quantite": number, "unite": "string (ex: u, m2, m, h, jour)", "prix_unitaire_ht": number }
  ]
}
Règles :
- Une ligne par prestation ou fourniture distincte mentionnée.
- Si un prix n'est pas mentionné pour une ligne, mets prix_unitaire_ht à 0.
- Si aucune quantité n'est mentionnée, mets quantite à 1.
- N'invente aucune prestation qui ne serait pas dans le texte.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiApiKey) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY non configurée" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const formData = await req.formData();
    const audio = formData.get("audio");
    if (!(audio instanceof File)) {
      return new Response(JSON.stringify({ error: "Fichier audio manquant (champ 'audio')" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const whisperForm = new FormData();
    whisperForm.set("file", audio, audio.name || "audio.webm");
    whisperForm.set("model", "whisper-1");
    whisperForm.set("language", "fr");
    whisperForm.set("response_format", "text");

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
          { role: "system", content: STRUCTURING_PROMPT },
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
