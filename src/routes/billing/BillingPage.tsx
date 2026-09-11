import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { functionErrorMessage, supabase } from "../../lib/supabaseClient";
import type { Plan, Tenant } from "../../types/database";

const statutLabels: Record<Tenant["subscription_status"], string> = {
  trialing: "Essai",
  active: "Actif",
  past_due: "Paiement en retard",
  canceled: "Annulé",
};

const planFeatures: Record<string, string[]> = {
  starter: [
    "Devis, factures, catalogue de prix",
    "Relances clients automatiques",
    "Jusqu'à 30 devis par mois",
  ],
  pro: [
    "Devis, factures, catalogue de prix",
    "Relances clients automatiques",
    "Devis illimités",
  ],
  master: [
    "Tout le Pro, devis illimités",
    "Tableau comptable mensuel et annuel, export PDF",
    "Couleur personnalisée sur les documents",
  ],
};

export default function BillingPage() {
  const [annual, setAnnual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const params = new URLSearchParams(window.location.search);
  const justSucceeded = params.get("success") === "true";
  const justCanceled = params.get("canceled") === "true";

  const { data: tenant } = useQuery({
    queryKey: ["tenant"],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase.from("tenants").select("*").single();
      if (fetchError) throw fetchError;
      return data as Tenant;
    },
  });

  const { data: plans } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from("plans")
        .select("*")
        .in("id", ["starter", "pro", "master"])
        .order("amount_cents");
      if (fetchError) throw fetchError;
      return data as Plan[];
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async (priceId: string) => {
      const { data, error: invokeError } = await supabase.functions.invoke("stripe-checkout", {
        body: { price_id: priceId, origin: window.location.origin },
      });
      if (invokeError) throw new Error(await functionErrorMessage(invokeError));
      if (data?.error) throw new Error(data.error);
      return data.url as string;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-navy">Abonnement</h1>

      {justSucceeded && (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          Paiement confirmé, ton abonnement est en cours d'activation.
        </p>
      )}
      {justCanceled && (
        <p className="mt-4 rounded-md border border-line bg-bg-light p-3 text-sm text-gray">
          Paiement annulé, aucun changement n'a été effectué.
        </p>
      )}

      {tenant && (
        <div className="mt-4 rounded-md border border-line bg-white p-4 text-sm">
          <p>
            Forfait actuel : <span className="font-semibold text-navy">{tenant.plan}</span> —{" "}
            {statutLabels[tenant.subscription_status]}
          </p>
          {tenant.current_period_end && (
            <p className="mt-1 text-gray">
              Renouvellement le {new Date(tenant.current_period_end).toLocaleDateString("fr-FR")}
            </p>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <span className={`text-sm ${!annual ? "font-semibold text-navy" : "text-gray"}`}>Mensuel</span>
        <button
          type="button"
          onClick={() => setAnnual((v) => !v)}
          className="relative h-6 w-11 rounded-full bg-line"
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-electric transition-all ${
              annual ? "left-5" : "left-0.5"
            }`}
          />
        </button>
        <span className={`text-sm ${annual ? "font-semibold text-navy" : "text-gray"}`}>
          Annuel <span className="text-emerald-600">(-10%)</span>
        </span>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 grid grid-cols-3 gap-4 max-w-4xl">
        {plans?.map((plan) => {
          const priceId = annual ? plan.stripe_price_id_annual ?? plan.stripe_price_id : plan.stripe_price_id;
          const monthlyEquivalent = annual ? (plan.amount_cents * 12 * 0.9) / 12 / 100 : plan.amount_cents / 100;
          const isCurrent = tenant?.plan === plan.id && tenant?.subscription_status === "active";

          return (
            <div key={plan.id} className="rounded-xl border border-line bg-white p-6">
              <h2 className="text-lg font-bold text-navy">{plan.label}</h2>
              <p className="mt-2 text-2xl font-bold text-navy">
                {monthlyEquivalent.toFixed(2)} €<span className="text-sm font-normal text-gray">/mois</span>
              </p>
              {annual && (
                <p className="text-xs text-gray">
                  Facturé {(plan.amount_cents * 12 * 0.9 / 100).toFixed(2)} €/an
                </p>
              )}
              <ul className="mt-4 flex flex-col gap-1.5 text-sm text-gray">
                {(planFeatures[plan.id] ?? []).map((f) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
              <button
                type="button"
                disabled={isCurrent || checkoutMutation.isPending}
                onClick={() => {
                  setError(null);
                  checkoutMutation.mutate(priceId);
                }}
                className="mt-4 w-full rounded-md bg-electric px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
              >
                {isCurrent ? "Forfait actuel" : checkoutMutation.isPending ? "Redirection…" : "Choisir ce forfait"}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-8 max-w-2xl text-sm text-gray">
        Besoin d'un accompagnement personnalisé pour le lancement de votre compte ?{" "}
        <a href="mailto:contact@lnewg.com" className="text-electric-dark">Contactez-nous</a>{" "}
        ou{" "}
        <a
          href="https://calendly.com/contact-lnewg/30min"
          target="_blank"
          rel="noopener noreferrer"
          className="text-electric-dark"
        >
          Prenez rendez-vous
        </a>
        .
      </p>
    </div>
  );
}
