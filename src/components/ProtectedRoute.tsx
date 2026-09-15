import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { functionErrorMessage, supabase } from "../lib/supabaseClient";
import { getDeviceLabel, getDeviceToken } from "../lib/device";
import type { Plan, Tenant } from "../types/database";

const planLabels: Record<string, string> = { starter: "Starter", pro: "Pro", master: "Master" };

// Enregistre l'appareil courant à chaque chargement de l'app (voir register-device) : un
// appareil déjà connu est toujours accepté, seul un appareil vraiment nouveau peut être refusé
// s'il dépasse la limite du forfait. Ça évite de jamais bloquer un appareil déjà en usage.
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading, isOwner } = useAuth();
  const [deviceChecked, setDeviceChecked] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [cardRedirecting, setCardRedirecting] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    (async () => {
      const { data, error: invokeError } = await supabase.functions.invoke("register-device", {
        body: { device_token: getDeviceToken(), label: getDeviceLabel() },
      });
      if (cancelled) return;
      if (invokeError) {
        setDeviceError(await functionErrorMessage(invokeError));
      } else if (data?.error) {
        setDeviceError(data.error as string);
      }
      setDeviceChecked(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

  // Même clé que la requête ["tenant"] utilisée ailleurs (AppShell, Billing...) : une seule
  // requête réseau réellement exécutée, react-query partage le cache entre les deux.
  const { data: tenant } = useQuery({
    queryKey: ["tenant"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("*").single();
      if (error) throw error;
      return data as Tenant;
    },
  });

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-gray">Chargement…</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!deviceChecked) {
    return <div className="flex min-h-screen items-center justify-center text-gray">Chargement…</div>;
  }

  if (deviceError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-md rounded-xl border border-line bg-white p-6 text-center text-sm">
          <p className="font-semibold text-navy">Appareil non autorisé</p>
          <p className="mt-2 text-gray">{deviceError}</p>
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="mt-4 rounded-md border border-line px-4 py-2 text-sm font-semibold text-navy"
          >
            Déconnexion
          </button>
        </div>
      </div>
    );
  }

  // Essai terminé sans abonnement payé : aucun forfait n'est gratuit (choix explicite de Luca,
  // 2026-09-15) — plus d'accès Starter offert par défaut. Vérifié avant introduction : aucun
  // tenant existant n'était encore dans cet état (tous les essais en cours étaient encore dans
  // leur fenêtre), donc ce changement ne bloque personne rétroactivement par surprise.
  const trialExpiredNoSubscription =
    !!tenant &&
    !tenant.stripe_subscription_id &&
    !!tenant.trial_ends_at &&
    new Date(tenant.trial_ends_at) <= new Date();

  const { data: plans } = useQuery({
    queryKey: ["plans"],
    enabled: trialExpiredNoSubscription && isOwner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .in("id", ["starter", "pro", "master"])
        .order("amount_cents");
      if (error) throw error;
      return data as Plan[];
    },
  });

  const planCheckoutMutation = useMutation({
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
    onError: (err: Error) => setPlanError(err.message),
  });

  if (trialExpiredNoSubscription) {
    if (!isOwner) {
      return (
        <div className="flex min-h-screen items-center justify-center p-8">
          <div className="max-w-md rounded-xl border border-line bg-white p-6 text-center text-sm">
            <p className="font-semibold text-navy">Essai terminé</p>
            <p className="mt-2 text-gray">
              L'essai gratuit de ce compte est terminé. Le propriétaire du compte doit choisir un forfait pour
              continuer.
            </p>
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="mt-4 block w-full rounded-md px-4 py-2 text-sm font-medium text-gray"
            >
              Déconnexion
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-3xl w-full rounded-xl border border-line bg-white p-6 text-center">
          <p className="text-lg font-semibold text-navy">Ton essai gratuit est terminé</p>
          <p className="mt-2 text-sm text-gray">
            Choisis un forfait pour continuer à utiliser ton compte — aucun accès gratuit après l'essai.
          </p>
          {planError && <p className="mt-3 text-sm text-red-600">{planError}</p>}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3 text-left">
            {plans?.map((plan) => (
              <div key={plan.id} className="rounded-xl border border-line p-5">
                <h2 className="text-base font-bold text-navy">{planLabels[plan.id] ?? plan.label}</h2>
                <p className="mt-2 text-xl font-bold text-navy">
                  {(plan.amount_cents / 100).toFixed(2)} €<span className="text-sm font-normal text-gray">/mois</span>
                </p>
                <button
                  type="button"
                  disabled={planCheckoutMutation.isPending}
                  onClick={() => {
                    setPlanError(null);
                    planCheckoutMutation.mutate(plan.stripe_price_id);
                  }}
                  className="mt-4 w-full rounded-md bg-electric px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
                >
                  {planCheckoutMutation.isPending ? "Redirection…" : "Choisir ce forfait"}
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="mt-6 text-sm font-medium text-gray"
          >
            Déconnexion
          </button>
        </div>
      </div>
    );
  }

  // Essai Master avec carte obligatoire (voir migration 0033) : ne concerne que les comptes créés
  // après cette fonctionnalité (requires_card_setup) — jamais les comptes existants, qui n'ont
  // jamais eu cette étape (LNEWG, Demo SaaS, bêta-testeurs déjà inscrits...).
  const needsCardSetup =
    tenant?.requires_card_setup && !tenant.stripe_subscription_id && !tenant.trial_card_saved_at;

  async function handleAddCard() {
    setCardError(null);
    setCardRedirecting(true);
    const { data, error: invokeError } = await supabase.functions.invoke("stripe-save-card", {
      body: { origin: window.location.origin },
    });
    if (invokeError) {
      setCardError(await functionErrorMessage(invokeError));
      setCardRedirecting(false);
      return;
    }
    if (data?.error) {
      setCardError(data.error as string);
      setCardRedirecting(false);
      return;
    }
    window.location.href = data.url as string;
  }

  if (needsCardSetup) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-md rounded-xl border border-line bg-white p-6 text-center text-sm">
          <p className="font-semibold text-navy">Une dernière étape avant ton essai Master</p>
          <p className="mt-2 text-gray">
            Ajoute une carte bancaire pour démarrer tes 7 jours d'essai — aucun débit ne sera effectué avant
            la fin de l'essai, et seulement si tu confirmes vouloir continuer.
          </p>
          {cardError && <p className="mt-2 text-red-600">{cardError}</p>}
          <button
            type="button"
            disabled={cardRedirecting}
            onClick={handleAddCard}
            className="mt-4 rounded-md bg-electric px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
          >
            {cardRedirecting ? "Redirection…" : "Ajouter ma carte"}
          </button>
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="mt-2 block w-full rounded-md px-4 py-2 text-sm font-medium text-gray"
          >
            Déconnexion
          </button>
        </div>
      </div>
    );
  }

  if (tenant?.blocked_at) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-md rounded-xl border border-line bg-white p-6 text-center text-sm">
          <p className="font-semibold text-navy">Compte suspendu</p>
          <p className="mt-2 text-gray">
            {tenant.blocked_reason || "L'accès à ce compte a été suspendu. Contacte-nous pour le réactiver."}
          </p>
          <a
            href="mailto:contact@lnewg.com"
            className="mt-4 inline-block rounded-md border border-line px-4 py-2 text-sm font-semibold text-navy"
          >
            Contacter le support
          </a>
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="mt-2 block w-full rounded-md px-4 py-2 text-sm font-medium text-gray"
          >
            Déconnexion
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
