// Edge Function (cron uniquement, appelée chaque jour comme relances-envoi) : à la fin de la
// semaine d'essai offerte en Master (trial_ends_at fixé à l'inscription, voir migration 0029),
// repasse le tenant en Starter s'il n'a jamais pris un abonnement Stripe réel entre-temps. Un
// tenant qui a payé pour Master pendant sa semaine d'essai a un stripe_subscription_id renseigné
// et n'est donc jamais touché ici.

import { createClient } from "npm:@supabase/supabase-js@2";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedCronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || !expectedCronSecret || cronSecret !== expectedCronSecret) {
    return jsonResponse({ error: "Non autorisé" }, 401);
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { data, error } = await supabase
      .from("tenants")
      .update({ plan: "starter" })
      .eq("plan", "master")
      .is("stripe_subscription_id", null)
      .lt("trial_ends_at", new Date().toISOString())
      .select("id");
    if (error) throw error;

    return jsonResponse({ downgraded: data?.length ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
