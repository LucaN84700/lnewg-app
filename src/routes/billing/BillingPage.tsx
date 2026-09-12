import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { functionErrorMessage, supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../hooks/useAuth";
import RestrictedAccess from "../../components/RestrictedAccess";
import type { Plan, Tenant } from "../../types/database";

const statutLabels: Record<Tenant["subscription_status"], string> = {
  trialing: "Essai",
  active: "Actif",
  past_due: "Paiement en retard",
  canceled: "Annulé",
};

const planLabels: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  master: "Master",
};

const planFeatures: Record<string, string[]> = {
  starter: [
    "Tableau de bord, clients, catalogue de prix",
    "Devis et factures, jusqu'à 30 par mois",
    "Réglages essentiels",
    "1 utilisateur inclus",
  ],
  pro: [
    "Tout Starter, devis et factures illimités",
    "Relances clients automatiques",
    "Unités de mesure personnalisées dans Réglages",
    "2 utilisateurs inclus",
  ],
  master: [
    "Tout Pro",
    "Tableau comptable mensuel et annuel, export PDF",
    "Couleurs personnalisées sur vos documents",
    "3 utilisateurs inclus",
  ],
};

export default function BillingPage() {
  const queryClient = useQueryClient();
  const [annual, setAnnual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seatError, setSeatError] = useState<string | null>(null);
  const [besoin, setBesoin] = useState("");
  const [besoinError, setBesoinError] = useState<string | null>(null);
  const [besoinSent, setBesoinSent] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const justSucceeded = params.get("success") === "true";
  const justCanceled = params.get("canceled") === "true";

  const { isOwner } = useAuth();

  const { data: tenant } = useQuery({
    queryKey: ["tenant"],
    enabled: isOwner,
    queryFn: async () => {
      const { data, error: fetchError } = await supabase.from("tenants").select("*").single();
      if (fetchError) throw fetchError;
      return data as Tenant;
    },
  });

  const { data: plans } = useQuery({
    queryKey: ["plans"],
    enabled: isOwner,
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

  const { data: currentPlan } = useQuery({
    queryKey: ["plan", tenant?.plan],
    enabled: isOwner && !!tenant?.plan,
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from("plans")
        .select("*")
        .eq("id", tenant!.plan)
        .maybeSingle();
      if (fetchError) throw fetchError;
      return data as Plan | null;
    },
  });

  const { data: memberCount } = useQuery({
    queryKey: ["team-size"],
    enabled: isOwner,
    queryFn: async () => {
      const { count, error: fetchError } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true });
      if (fetchError) throw fetchError;
      return count ?? 1;
    },
  });

  const addSeatMutation = useMutation({
    mutationFn: async () => {
      const { data, error: invokeError } = await supabase.functions.invoke("stripe-add-seat");
      if (invokeError) throw new Error(await functionErrorMessage(invokeError));
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant"] });
      queryClient.invalidateQueries({ queryKey: ["team-size"] });
    },
    onError: (err: Error) => setSeatError(err.message),
  });

  const removeSeatMutation = useMutation({
    mutationFn: async () => {
      const { data, error: invokeError } = await supabase.functions.invoke("stripe-remove-seat");
      if (invokeError) throw new Error(await functionErrorMessage(invokeError));
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant"] });
      queryClient.invalidateQueries({ queryKey: ["team-size"] });
    },
    onError: (err: Error) => setSeatError(err.message),
  });

  function handleRemoveSeat() {
    setSeatError(null);
    if (
      confirm(
        "Retirer un siège supplémentaire ? Un avoir au prorata sera appliqué sur ta prochaine facture.",
      )
    ) {
      removeSeatMutation.mutate();
    }
  }

  function handleAddSeat() {
    setSeatError(null);
    if (
      confirm(
        "Ajouter un siège supplémentaire pour +5€/mois (facturé immédiatement au prorata) ?",
      )
    ) {
      addSeatMutation.mutate();
    }
  }

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

  const platiniumMutation = useMutation({
    mutationFn: async () => {
      const { data, error: invokeError } = await supabase.functions.invoke("demande-platinium", {
        body: { besoin },
      });
      if (invokeError) throw new Error(await functionErrorMessage(invokeError));
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      setBesoin("");
      setBesoinSent(true);
      setTimeout(() => setBesoinSent(false), 6000);
    },
    onError: (err: Error) => setBesoinError(err.message),
  });

  if (!isOwner) {
    return (
      <RestrictedAccess
        title="Abonnement"
        message="L'abonnement est réservé au propriétaire du compte."
      />
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-navy">Abonnement</h1>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
          Sans engagement
        </span>
      </div>

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
            Forfait actuel :{" "}
            <span className="font-semibold text-navy">{planLabels[tenant.plan] ?? tenant.plan}</span> —{" "}
            {statutLabels[tenant.subscription_status]}
          </p>
          {tenant.current_period_end && (
            <p className="mt-1 text-gray">
              Renouvellement le {new Date(tenant.current_period_end).toLocaleDateString("fr-FR")}
            </p>
          )}
        </div>
      )}

      {tenant && currentPlan && (
        <div className="mt-4 max-w-lg rounded-md border border-line bg-white p-4 text-sm">
          <p>
            Utilisateurs :{" "}
            <span className="font-semibold text-navy">
              {memberCount ?? "…"} / {(currentPlan.seat_limit ?? 1) + tenant.extra_seats}
            </span>{" "}
            siège{(currentPlan.seat_limit ?? 1) + tenant.extra_seats > 1 ? "s" : ""}
            {tenant.extra_seats > 0 && ` (dont ${tenant.extra_seats} supplémentaire${tenant.extra_seats > 1 ? "s" : ""})`}
          </p>
          {seatError && <p className="mt-2 text-sm text-red-600">{seatError}</p>}
          {tenant.stripe_subscription_id ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={addSeatMutation.isPending}
                onClick={handleAddSeat}
                className="rounded-md border border-line px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
              >
                {addSeatMutation.isPending ? "Ajout…" : "+ Ajouter un siège (+5€/mois)"}
              </button>
              {tenant.extra_seats > 0 && (
                <button
                  type="button"
                  disabled={removeSeatMutation.isPending}
                  onClick={handleRemoveSeat}
                  className="rounded-md border border-line px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
                >
                  {removeSeatMutation.isPending ? "Retrait…" : "− Retirer un siège"}
                </button>
              )}
            </div>
          ) : (
            <p className="mt-2 text-gray">Choisis d'abord un forfait ci-dessous pour pouvoir ajouter des sièges.</p>
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

      <div className="mt-6 max-w-4xl rounded-xl border border-navy bg-navy p-6 text-white">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold">Platinium</h2>
          <span className="rounded-full bg-electric/20 px-2.5 py-0.5 text-xs font-semibold uppercase text-electric">
            Sur devis
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-white/80">
          Le cœur de métier de LNEWG : au-delà du logiciel, nos équipes conçoivent et développent
          des agents IA et des automatisations sur mesure pour votre entreprise — adaptés à vos
          outils, vos process et vos objectifs, et non l'inverse.
        </p>
        <ul className="mt-4 flex flex-col gap-1.5 text-sm text-white/90">
          <li>✓ Analyse de vos besoins et de vos processus actuels</li>
          <li>✓ Conception et développement d'agents IA sur mesure</li>
          <li>✓ Intégration avec vos outils et logiciels existants</li>
          <li>✓ Accompagnement et support dédiés par l'équipe LNEWG</li>
        </ul>

        <div className="mt-5 max-w-xl">
          <label className="text-xs font-medium text-white/70">
            Décrivez votre besoin, nous vous recontactons rapidement
          </label>
          <textarea
            value={besoin}
            onChange={(e) => setBesoin(e.target.value)}
            rows={3}
            placeholder="Ex : automatiser la relance de mes prospects, générer mes rapports de chantier, connecter mon CRM à..."
            className="mt-1.5 w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40"
          />
          {besoinError && <p className="mt-2 text-sm text-red-300">{besoinError}</p>}
          {besoinSent && (
            <p className="mt-2 text-sm text-emerald-300">
              Demande envoyée, nous revenons vers vous rapidement.
            </p>
          )}
          <button
            type="button"
            disabled={platiniumMutation.isPending}
            onClick={() => {
              setBesoinError(null);
              platiniumMutation.mutate();
            }}
            className="mt-3 rounded-md bg-electric px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
          >
            {platiniumMutation.isPending ? "Envoi…" : "Envoyer ma demande"}
          </button>
        </div>
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
