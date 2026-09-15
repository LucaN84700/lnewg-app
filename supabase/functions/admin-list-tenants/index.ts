// Edge Function : liste tous les tenants pour le panneau /admin. Volontairement pas géré via RLS
// côté client (voir migration 0032) — une policy select "is_platform_admin" sur tenants cassait
// toute requête .single() de l'app pour le compte admin lui-même, dès qu'elle voyait plus d'une
// ligne. Le service_role bypass RLS, la vérification is_platform_admin se fait ici.
//
// Enrichit chaque tenant avec l'email du propriétaire (profiles.role = 'owner') et son dernier
// paiement Stripe (si un abonnement existe), pour que Luca voie qui a réellement payé sans avoir
// à ouvrir le dashboard Stripe pour chaque compte.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function lastInvoiceFor(customerId: string, stripeSecretKey: string) {
  try {
    const response = await fetch(`https://api.stripe.com/v1/invoices?customer=${customerId}&limit=1`, {
      headers: { Authorization: `Bearer ${stripeSecretKey}` },
    });
    const data = await response.json();
    if (!response.ok) return null;
    const invoice = data.data?.[0];
    if (!invoice) return null;
    return {
      status: invoice.status as string,
      amount_paid: invoice.amount_paid as number,
      currency: invoice.currency as string,
      date: (invoice.status_transitions?.paid_at ?? invoice.created) as number,
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Authentification requise" }, 401);

  const callerClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

  try {
    const {
      data: { user: callerUser },
      error: callerError,
    } = await callerClient.auth.getUser();
    if (callerError || !callerUser) throw new Error("Session invalide");

    const { data: profile, error: profileError } = await callerClient
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", callerUser.id)
      .single();
    if (profileError || !profile?.is_platform_admin) {
      throw new Error("Accès réservé à l'administrateur de la plateforme");
    }

    const { data: tenants, error: tenantsError } = await adminClient
      .from("tenants")
      .select("*")
      .order("created_at", { ascending: false });
    if (tenantsError) throw tenantsError;

    const { data: owners, error: ownersError } = await adminClient
      .from("profiles")
      .select("tenant_id, email, full_name")
      .eq("role", "owner");
    if (ownersError) throw ownersError;

    const ownerByTenant = new Map((owners ?? []).map((o) => [o.tenant_id, o]));

    const enriched = await Promise.all(
      (tenants ?? []).map(async (t) => {
        const owner = ownerByTenant.get(t.id);
        const lastInvoice =
          t.stripe_customer_id && stripeSecretKey ? await lastInvoiceFor(t.stripe_customer_id, stripeSecretKey) : null;
        return {
          ...t,
          owner_email: owner?.email ?? null,
          owner_full_name: owner?.full_name ?? null,
          last_invoice: lastInvoice,
        };
      }),
    );

    return jsonResponse({ tenants: enriched });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 400);
  }
});
