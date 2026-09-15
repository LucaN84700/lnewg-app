import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { functionErrorMessage, supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../hooks/useAuth";
import RestrictedAccess from "../../components/RestrictedAccess";
import type { Tenant } from "../../types/database";

const planLabels: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  master: "Master",
};

const statutLabels: Record<Tenant["subscription_status"], string> = {
  trialing: "Essai",
  active: "Actif",
  past_due: "Paiement en retard",
  canceled: "Annulé",
};

const statutColors: Record<Tenant["subscription_status"], string> = {
  trialing: "text-gray",
  active: "text-emerald-600",
  past_due: "text-red-600",
  canceled: "text-gray",
};

interface LastInvoice {
  status: string;
  amount_paid: number;
  currency: string;
  date: number;
}

interface AdminTenant extends Tenant {
  owner_email: string | null;
  owner_full_name: string | null;
  last_invoice: LastInvoice | null;
}

function LastPayment({ invoice }: { invoice: LastInvoice | null }) {
  if (!invoice) return <span className="text-gray">Aucun paiement</span>;
  const date = new Date(invoice.date * 1000).toLocaleDateString("fr-FR");
  const amount = (invoice.amount_paid / 100).toFixed(2);
  if (invoice.status === "paid") {
    return (
      <div>
        <span className="font-medium text-emerald-600">Payé le {date}</span>
        <div className="text-[11px] text-gray">{amount} {invoice.currency.toUpperCase()}</div>
      </div>
    );
  }
  if (invoice.status === "open") {
    return <span className="font-medium text-amber-600">En attente ({date})</span>;
  }
  return <span className="font-medium text-red-600">Échec ({date})</span>;
}

export default function AdminPage() {
  const { isPlatformAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: tenants, isLoading } = useQuery({
    queryKey: ["admin-tenants"],
    enabled: isPlatformAdmin,
    queryFn: async () => {
      const { data, error: invokeError } = await supabase.functions.invoke("admin-list-tenants");
      if (invokeError) throw new Error(await functionErrorMessage(invokeError));
      if (data?.error) throw new Error(data.error);
      return data.tenants as AdminTenant[];
    },
  });

  const blockMutation = useMutation({
    mutationFn: async ({ id, blocked }: { id: string; blocked: boolean }) => {
      const reason = blocked ? prompt("Raison du blocage (optionnel) :") ?? "" : null;
      const { data, error: invokeError } = await supabase.functions.invoke("admin-set-tenant-block", {
        body: { tenant_id: id, blocked, reason },
      });
      if (invokeError) throw new Error(await functionErrorMessage(invokeError));
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-tenants"] }),
    onError: (err: Error) => alert(err.message),
  });

  if (!isPlatformAdmin) {
    return <RestrictedAccess title="Administration" message="Cette page est réservée à l'administrateur de la plateforme." />;
  }

  const filtered = tenants?.filter((t) => {
    const q = search.toLowerCase();
    return t.name.toLowerCase().includes(q) || (t.owner_email ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-bold text-navy">Administration</h1>
      <p className="mt-1 text-sm text-gray">Tous les comptes clients du SaaS, leur contact, leur forfait et leur statut de paiement.</p>

      <input
        type="text"
        placeholder="Rechercher un compte ou un email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mt-4 w-full max-w-sm rounded-md border border-line px-3 py-2 text-sm"
      />

      <div className="mt-6 overflow-x-auto rounded-xl border border-line bg-white">
        {isLoading ? (
          <p className="p-6 text-sm text-gray">Chargement…</p>
        ) : !filtered || filtered.length === 0 ? (
          <p className="p-6 text-sm text-gray">Aucun compte pour l'instant.</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-gray">
                <th className="px-4 py-3 font-medium">Entreprise</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Forfait</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Dernier paiement</th>
                <th className="px-4 py-3 font-medium">Renouvellement</th>
                <th className="px-4 py-3 font-medium">Accès</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-navy">
                    {t.name}
                    {t.stripe_customer_id && <div className="text-[11px] font-normal text-gray">{t.stripe_customer_id}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray">
                    <div>{t.owner_email ?? "—"}</div>
                    <div className="text-[11px]">{t.phone || "Pas de téléphone renseigné"}</div>
                  </td>
                  <td className="px-4 py-3 text-gray">{planLabels[t.plan] ?? t.plan}</td>
                  <td className={`px-4 py-3 font-medium ${statutColors[t.subscription_status]}`}>
                    {statutLabels[t.subscription_status]}
                  </td>
                  <td className="px-4 py-3">
                    <LastPayment invoice={t.last_invoice} />
                  </td>
                  <td className="px-4 py-3 text-gray">
                    {t.current_period_end ? new Date(t.current_period_end).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {t.blocked_at ? (
                      <div>
                        <span className="text-xs font-semibold text-red-600">Bloqué</span>
                        {t.blocked_reason && <div className="text-[11px] text-gray">{t.blocked_reason}</div>}
                      </div>
                    ) : (
                      <span className="text-xs font-semibold text-emerald-600">Actif</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {t.blocked_at ? (
                      <button
                        type="button"
                        disabled={blockMutation.isPending}
                        onClick={() => blockMutation.mutate({ id: t.id, blocked: false })}
                        className="text-electric-dark disabled:opacity-50"
                      >
                        Débloquer
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={blockMutation.isPending}
                        onClick={() => blockMutation.mutate({ id: t.id, blocked: true })}
                        className="text-red-600 disabled:opacity-50"
                      >
                        Bloquer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
