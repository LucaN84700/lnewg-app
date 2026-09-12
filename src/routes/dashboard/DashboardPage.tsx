import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../hooks/useAuth";
import RestrictedAccess from "../../components/RestrictedAccess";
import { MOIS_LABELS } from "../../lib/mois";
import type { Devis, Facture } from "../../types/database";

const devisActionLabels: Record<Devis["statut"], string> = {
  brouillon: "créé",
  envoye: "envoyé",
  accepte: "accepté",
  refuse: "refusé",
  expire: "expiré",
};

const factureActionLabels: Record<Facture["statut"], string> = {
  brouillon: "créée",
  envoyee: "envoyée",
  payee: "payée",
  en_retard: "en retard",
  annulee: "annulée",
};

interface ActivityItem {
  id: string;
  date: string;
  label: string;
  href: string;
  tone: "default" | "success" | "danger";
}

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: "danger" }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="text-xs font-medium text-gray">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone === "danger" ? "text-red-600" : "text-navy"}`}>{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [activityYear, setActivityYear] = useState(new Date().getFullYear());
  const [activityMonth, setActivityMonth] = useState(new Date().getMonth() + 1);

  const { profile } = useAuth();
  const hasAccessDashboard = !profile || profile.role === "owner" || profile.can_view_dashboard;

  const { data: devis, isLoading: devisLoading } = useQuery({
    queryKey: ["devis"],
    enabled: hasAccessDashboard,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devis")
        .select("*, clients(name, short_code)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Devis[];
    },
  });

  const { data: factures, isLoading: facturesLoading } = useQuery({
    queryKey: ["factures"],
    enabled: hasAccessDashboard,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("factures")
        .select("*, clients(name, short_code), devis(numero)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Facture[];
    },
  });

  if (!hasAccessDashboard) {
    return (
      <RestrictedAccess
        title="Tableau de bord"
        message="L'accès au tableau de bord vous a été désactivé par le propriétaire du compte."
      />
    );
  }

  const isLoading = devisLoading || facturesLoading;
  const now = new Date();
  const isThisMonth = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };

  const devisEnAttente = devis?.filter((d) => d.statut === "brouillon" || d.statut === "envoye").length ?? 0;
  const devisAcceptesCeMois =
    devis?.filter((d) => d.statut === "accepte" && isThisMonth(d.updated_at)).length ?? 0;
  const facturesEnRetard = factures?.filter((f) => f.statut === "en_retard").length ?? 0;
  const facturesImpayees =
    factures?.filter((f) => f.statut === "envoyee" || f.statut === "en_retard").length ?? 0;
  const caEncaisseCeMois =
    factures
      ?.filter((f) => f.statut === "payee" && f.paid_at && isThisMonth(f.paid_at))
      .reduce((sum, f) => sum + f.total_ttc, 0) ?? 0;

  const activity: ActivityItem[] = [
    ...(devis ?? []).map((d) => ({
      id: `devis-${d.id}`,
      date: d.updated_at,
      label: `Devis ${d.numero} (${d.clients?.name ?? "client"}) ${devisActionLabels[d.statut]}`,
      href: "/devis",
      tone: (d.statut === "accepte" ? "success" : d.statut === "refuse" ? "danger" : "default") as
        | "default"
        | "success"
        | "danger",
    })),
    ...(factures ?? []).map((f) => ({
      id: `facture-${f.id}`,
      date: f.updated_at,
      label: `Facture ${f.numero} (${f.clients?.name ?? "client"}) ${factureActionLabels[f.statut]}`,
      href: "/factures",
      tone: (f.statut === "payee" ? "success" : f.statut === "en_retard" ? "danger" : "default") as
        | "default"
        | "success"
        | "danger",
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const activityThisMonth = activity.filter((item) => {
    const d = new Date(item.date);
    return d.getFullYear() === activityYear && d.getMonth() + 1 === activityMonth;
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-navy">Tableau de bord</h1>

      {isLoading ? (
        <p className="mt-4 text-sm text-gray">Chargement…</p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-5">
            <StatCard label="Devis en attente" value={devisEnAttente} />
            <StatCard label="Devis acceptés ce mois" value={devisAcceptesCeMois} />
            <StatCard label="Factures impayées" value={facturesImpayees} />
            <StatCard label="Factures en retard" value={facturesEnRetard} tone={facturesEnRetard > 0 ? "danger" : undefined} />
            <StatCard label="Encaissé ce mois" value={`${caEncaisseCeMois.toFixed(2)} €`} />
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-navy">Activité</h2>
            <div className="flex items-center gap-2">
              <select
                value={activityMonth}
                onChange={(e) => setActivityMonth(Number(e.target.value))}
                className="rounded-md border border-line px-3 py-1.5 text-sm"
              >
                {MOIS_LABELS.map((label, idx) => (
                  <option key={label} value={idx + 1}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={activityYear}
                onChange={(e) => setActivityYear(Number(e.target.value))}
                className="w-20 rounded-md border border-line px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-line bg-white">
            {activityThisMonth.length === 0 ? (
              <p className="p-6 text-sm text-gray">Aucune activité pour ce mois.</p>
            ) : (
              <ul>
                {activityThisMonth.map((item) => (
                  <li key={item.id} className="border-b border-line last:border-0">
                    <Link to={item.href} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-bg-light">
                      <span
                        className={
                          item.tone === "success"
                            ? "text-emerald-600"
                            : item.tone === "danger"
                              ? "text-red-600"
                              : "text-navy"
                        }
                      >
                        {item.label}
                      </span>
                      <span className="text-xs text-gray">
                        {new Date(item.date).toLocaleString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
