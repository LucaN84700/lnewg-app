import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { functionErrorMessage, supabase } from "../../lib/supabaseClient";
import type { Relance } from "../../types/database";

const niveauLabels: Record<1 | 2 | 3, string> = {
  1: "Niveau 1 — rappel",
  2: "Niveau 2 — relance ferme",
  3: "Niveau 3 — mise en demeure",
};

const statutLabels: Record<Relance["statut"], string> = {
  planifiee: "Planifiée",
  envoyee: "Envoyée",
  echec: "Échec",
};

interface RunResult {
  processed: number;
  results: Array<Record<string, unknown>>;
}

export default function RelancesPage() {
  const queryClient = useQueryClient();
  const [lastRun, setLastRun] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const { data: relances, isLoading } = useQuery({
    queryKey: ["relances"],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from("relances")
        .select("*, factures(numero, total_ttc, clients(name))")
        .order("created_at", { ascending: false });
      if (fetchError) throw fetchError;
      return data as Relance[];
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const { data, error: invokeError } = await supabase.functions.invoke("relances-envoi");
      if (invokeError) throw new Error(await functionErrorMessage(invokeError));
      if (data?.error) throw new Error(data.error);
      return data as RunResult;
    },
    onSuccess: (data) => {
      setLastRun(data);
      setRunError(null);
      queryClient.invalidateQueries({ queryKey: ["relances"] });
      queryClient.invalidateQueries({ queryKey: ["factures"] });
    },
    onError: (err: Error) => setRunError(err.message),
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Relances</h1>
          <p className="mt-1 text-sm text-gray">
            Rappel à J+1, relance ferme à J+15, mise en demeure à J+30 après l'échéance.
          </p>
        </div>
        <button
          type="button"
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          className="rounded-md bg-electric px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
        >
          {runMutation.isPending ? "Envoi en cours…" : "Envoyer les relances dues"}
        </button>
      </div>

      {runError && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {runError}
        </p>
      )}

      {lastRun && (
        <div className="mt-4 rounded-md border border-line bg-white p-4 text-sm">
          <p className="font-medium text-navy">
            {lastRun.processed === 0
              ? "Aucune relance due pour l'instant."
              : `${lastRun.processed} relance(s) traitée(s).`}
          </p>
          {lastRun.results.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-gray">
              {lastRun.results.map((r, i) => (
                <li key={i}>{JSON.stringify(r)}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-white">
        {isLoading ? (
          <p className="p-6 text-sm text-gray">Chargement…</p>
        ) : !relances || relances.length === 0 ? (
          <p className="p-6 text-sm text-gray">Aucune relance envoyée pour l'instant.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-gray">
                <th className="px-4 py-3 font-medium">Facture</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Niveau</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Envoyée le</th>
              </tr>
            </thead>
            <tbody>
              {relances.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-navy">{r.factures?.numero ?? "—"}</td>
                  <td className="px-4 py-3 text-gray">{r.factures?.clients?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray">{niveauLabels[r.niveau]}</td>
                  <td className="px-4 py-3 text-gray">{statutLabels[r.statut]}</td>
                  <td className="px-4 py-3 text-gray">
                    {r.sent_at ? new Date(r.sent_at).toLocaleString("fr-FR") : "—"}
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
