import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { downloadFunctionFile, openFunctionPdf, supabase } from "../../lib/supabaseClient";
import { MOIS_LABELS } from "../../lib/mois";
import type { Facture, FactureStatut, Tenant } from "../../types/database";

const statutLabels: Record<FactureStatut, string> = {
  brouillon: "En attente",
  envoyee: "Envoyée",
  payee: "Payée",
  en_retard: "En retard",
  annulee: "Annulée",
};

function monthRange(year: number, monthNum: number) {
  const start = `${year}-${String(monthNum).padStart(2, "0")}-01`;
  const endDate = new Date(year, monthNum, 0);
  const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
  return { start, end };
}

function yearRange(year: number) {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

type FactureRow = Facture & { clients?: { name: string; short_code: string } };

export default function ComptabilitePage() {
  const [vue, setVue] = useState<"mensuel" | "annuel">("mensuel");
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthNum, setMonthNum] = useState(new Date().getMonth() + 1);
  const [error, setError] = useState<string | null>(null);
  const monthParam = `${year}-${String(monthNum).padStart(2, "0")}`;

  const { data: tenant } = useQuery({
    queryKey: ["tenant"],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase.from("tenants").select("*").single();
      if (fetchError) throw fetchError;
      return data as Tenant;
    },
  });

  const isMaster = tenant?.plan === "master";
  const { start, end } = vue === "mensuel" ? monthRange(year, monthNum) : yearRange(year);

  const { data: factures, isLoading } = useQuery({
    queryKey: ["comptabilite-factures", vue, year, monthNum],
    enabled: isMaster,
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from("factures")
        .select("*, clients(name, short_code)")
        .gte("date_facture", start)
        .lte("date_facture", end)
        .order("date_facture");
      if (fetchError) throw fetchError;
      return data as FactureRow[];
    },
  });

  const totals = useMemo(() => {
    const utiles = (factures ?? []).filter((f) => f.statut !== "annulee");
    return {
      count: utiles.length,
      ht: utiles.reduce((s, f) => s + f.total_ht, 0),
      tva: utiles.reduce((s, f) => s + f.tva_montant, 0),
      ttc: utiles.reduce((s, f) => s + f.total_ttc, 0),
    };
  }, [factures]);

  const monthlyBreakdown = useMemo(() => {
    if (vue !== "annuel") return [];
    return MOIS_LABELS.map((label, idx) => {
      const mIdx = idx + 1;
      const inMonth = (factures ?? []).filter((f) => {
        const d = new Date(f.date_facture);
        return d.getMonth() + 1 === mIdx && f.statut !== "annulee";
      });
      return {
        label,
        count: inMonth.length,
        ht: inMonth.reduce((s, f) => s + f.total_ht, 0),
        tva: inMonth.reduce((s, f) => s + f.tva_montant, 0),
        ttc: inMonth.reduce((s, f) => s + f.total_ttc, 0),
      };
    });
  }, [factures, vue]);

  const exportMutation = useMutation({
    mutationFn: async () => {
      if (vue === "mensuel") {
        await openFunctionPdf("comptabilite-pdf", { type: "mensuel", month: monthParam });
      } else {
        await openFunctionPdf("comptabilite-pdf", { type: "annuel", year: String(year) });
      }
    },
    onError: (err: Error) => setError(err.message),
  });

  const exportFacturesMutation = useMutation({
    mutationFn: async () => {
      await downloadFunctionFile(
        "comptabilite-factures-zip",
        { month: monthParam },
        `factures-${monthParam}.zip`,
      );
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-navy">Comptabilité</h1>
      <p className="mt-1 text-sm text-gray">
        Récapitulatif de vos factures, prêt à transmettre à votre comptable.
      </p>

      {!isMaster ? (
        <div className="mt-6 max-w-lg rounded-xl border border-line bg-white p-6 text-sm">
          <p className="font-semibold text-navy">Réservé au plan Master</p>
          <p className="mt-2 text-gray">
            Le tableau de comptabilité mensuel et annuel, avec export PDF pour votre comptable,
            fait partie du plan Master.
          </p>
          <a
            href="/billing"
            className="mt-4 inline-block rounded-md bg-electric px-4 py-2 text-sm font-semibold text-navy"
          >
            Découvrir le plan Master
          </a>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="flex rounded-md border border-line bg-white p-1">
              <button
                type="button"
                onClick={() => setVue("mensuel")}
                className={`rounded px-3 py-1.5 text-sm font-medium ${
                  vue === "mensuel" ? "bg-electric text-navy" : "text-gray"
                }`}
              >
                Mensuel
              </button>
              <button
                type="button"
                onClick={() => setVue("annuel")}
                className={`rounded px-3 py-1.5 text-sm font-medium ${
                  vue === "annuel" ? "bg-electric text-navy" : "text-gray"
                }`}
              >
                Annuel
              </button>
            </div>

            {vue === "mensuel" && (
              <select
                value={monthNum}
                onChange={(e) => setMonthNum(Number(e.target.value))}
                className="rounded-md border border-line px-3 py-2 text-sm"
              >
                {MOIS_LABELS.map((label, idx) => (
                  <option key={label} value={idx + 1}>
                    {label} {year}
                  </option>
                ))}
              </select>
            )}
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-24 rounded-md border border-line px-3 py-2 text-sm"
            />

            <div className="ml-auto flex flex-col gap-2 items-end">
              <button
                type="button"
                disabled={exportMutation.isPending}
                onClick={() => {
                  setError(null);
                  exportMutation.mutate();
                }}
                className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
              >
                {exportMutation.isPending ? "Génération…" : "Export du tableau PDF"}
              </button>
              {vue === "mensuel" && (
                <button
                  type="button"
                  disabled={exportFacturesMutation.isPending}
                  onClick={() => {
                    setError(null);
                    exportFacturesMutation.mutate();
                  }}
                  className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
                >
                  {exportFacturesMutation.isPending ? "Génération…" : "Export des factures en PDF"}
                </button>
              )}
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <div className="mt-4 grid grid-cols-4 gap-3 max-w-2xl">
            <div className="rounded-xl border border-line bg-white p-4">
              <p className="text-xs text-gray">Factures</p>
              <p className="mt-1 text-lg font-bold text-navy">{totals.count}</p>
            </div>
            <div className="rounded-xl border border-line bg-white p-4">
              <p className="text-xs text-gray">Total HT</p>
              <p className="mt-1 text-lg font-bold text-navy">{totals.ht.toFixed(2)} €</p>
            </div>
            <div className="rounded-xl border border-line bg-white p-4">
              <p className="text-xs text-gray">TVA</p>
              <p className="mt-1 text-lg font-bold text-navy">{totals.tva.toFixed(2)} €</p>
            </div>
            <div className="rounded-xl border border-line bg-white p-4">
              <p className="text-xs text-gray">Total TTC</p>
              <p className="mt-1 text-lg font-bold text-navy">{totals.ttc.toFixed(2)} €</p>
            </div>
          </div>

          {vue === "mensuel" ? (
            <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
              {isLoading ? (
                <p className="p-6 text-sm text-gray">Chargement…</p>
              ) : !factures || factures.length === 0 ? (
                <p className="p-6 text-sm text-gray">Aucune facture pour ce mois.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-gray">
                      <th className="px-4 py-3 font-medium">Numéro</th>
                      <th className="px-4 py-3 font-medium">Client</th>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Statut</th>
                      <th className="px-4 py-3 font-medium">Total HT</th>
                      <th className="px-4 py-3 font-medium">TVA</th>
                      <th className="px-4 py-3 font-medium">Total TTC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {factures.map((f) => (
                      <tr key={f.id} className="border-b border-line last:border-0">
                        <td className="px-4 py-3 font-medium text-navy">{f.numero}</td>
                        <td className="px-4 py-3 text-gray">{f.clients?.name ?? "—"}</td>
                        <td className="px-4 py-3 text-gray">{f.date_facture}</td>
                        <td className="px-4 py-3 text-gray">{statutLabels[f.statut]}</td>
                        <td className="px-4 py-3 text-gray">{f.total_ht.toFixed(2)} €</td>
                        <td className="px-4 py-3 text-gray">{f.tva_montant.toFixed(2)} €</td>
                        <td className="px-4 py-3 text-gray">{f.total_ttc.toFixed(2)} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {factures && factures.length > 0 && (
                <p className="border-t border-line px-4 py-2 text-xs text-gray">
                  Les factures annulées sont exclues des totaux.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
              {isLoading ? (
                <p className="p-6 text-sm text-gray">Chargement…</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-gray">
                      <th className="px-4 py-3 font-medium">Mois</th>
                      <th className="px-4 py-3 font-medium">Factures</th>
                      <th className="px-4 py-3 font-medium">Total HT</th>
                      <th className="px-4 py-3 font-medium">TVA</th>
                      <th className="px-4 py-3 font-medium">Total TTC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyBreakdown.map((m) => (
                      <tr key={m.label} className="border-b border-line last:border-0">
                        <td className="px-4 py-3 font-medium text-navy">{m.label}</td>
                        <td className="px-4 py-3 text-gray">{m.count}</td>
                        <td className="px-4 py-3 text-gray">{m.ht.toFixed(2)} €</td>
                        <td className="px-4 py-3 text-gray">{m.tva.toFixed(2)} €</td>
                        <td className="px-4 py-3 text-gray">{m.ttc.toFixed(2)} €</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-line font-semibold text-navy">
                      <td className="px-4 py-3">Total {year}</td>
                      <td className="px-4 py-3">{totals.count}</td>
                      <td className="px-4 py-3">{totals.ht.toFixed(2)} €</td>
                      <td className="px-4 py-3">{totals.tva.toFixed(2)} €</td>
                      <td className="px-4 py-3">{totals.ttc.toFixed(2)} €</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
