import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { functionErrorMessage, supabase } from "../../lib/supabaseClient";
import ScheduleEditor from "../../components/ScheduleEditor";
import type { Relance, Tenant } from "../../types/database";

function niveauLabel(niveau: number, total: number) {
  if (niveau === 1) return `Niveau 1 — rappel`;
  if (niveau === total) return `Niveau ${niveau} — mise en demeure`;
  return `Niveau ${niveau} — relance ferme`;
}

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
  const [schedule, setSchedule] = useState<number[]>([1, 15, 30]);
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const { data: tenant } = useQuery({
    queryKey: ["tenant"],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase.from("tenants").select("*").single();
      if (fetchError) throw fetchError;
      return data as Tenant;
    },
  });

  // ne synchronise le formulaire depuis le serveur qu'une seule fois : sans ce garde-fou, un
  // refetch de ['tenant'] pendant que l'utilisateur édite (ex: déclenché par une autre mutation
  // ailleurs dans l'app) écraserait silencieusement ses modifications non enregistrées
  const initialized = useRef(false);
  useEffect(() => {
    if (tenant && !initialized.current) {
      setSchedule(tenant.relance_schedule_jours ?? [1, 15, 30]);
      setAutoEnabled(tenant.relances_auto_enabled);
      initialized.current = true;
    }
  }, [tenant]);

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

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      if (!tenant) return;
      const sorted = [...schedule].sort((a, b) => a - b);
      const { error: updateError } = await supabase
        .from("tenants")
        .update({ relance_schedule_jours: sorted, relances_auto_enabled: autoEnabled })
        .eq("id", tenant.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant"] });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
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

  const isProOrAbove = tenant?.plan === "pro" || tenant?.plan === "master";

  if (!isProOrAbove) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-navy">Relances</h1>
        {tenant && (
          <div className="mt-6 max-w-lg rounded-xl border border-line bg-white p-6 text-sm">
            <p className="font-semibold text-navy">Réservé aux forfaits Pro et supérieurs</p>
            <p className="mt-2 text-gray">
              Les relances automatiques (email, barème personnalisable) font partie du forfait Pro.
            </p>
            <Link
              to="/billing"
              className="mt-4 inline-block rounded-md bg-electric px-4 py-2 text-sm font-semibold text-navy"
            >
              Découvrir le forfait Pro
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Relances</h1>
          <p className="mt-1 text-sm text-gray">
            Barème par défaut, personnalisable par client depuis la fiche client.
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

      <div className="mt-6 max-w-md rounded-xl border border-line bg-white p-6">
        <h2 className="text-sm font-semibold text-navy">Barème par défaut</h2>
        <div className="mt-3">
          <ScheduleEditor value={schedule} onChange={setSchedule} />
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-navy">
          <input
            type="checkbox"
            checked={autoEnabled}
            onChange={(e) => setAutoEnabled(e.target.checked)}
          />
          Envoi automatique quotidien
        </label>
        <p className="mt-1 text-xs text-gray">
          {autoEnabled
            ? "Les relances dues sont envoyées automatiquement chaque jour."
            : "Aucun envoi automatique : utilise le bouton \"Envoyer les relances dues\" quand tu veux relancer."}
        </p>

        <button
          type="button"
          onClick={() => saveSettingsMutation.mutate()}
          disabled={saveSettingsMutation.isPending}
          className="mt-4 rounded-md bg-electric px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
        >
          {saveSettingsMutation.isPending ? "Enregistrement…" : "Enregistrer le barème"}
        </button>
        {settingsSaved && <p className="mt-2 text-sm text-emerald-600">Enregistré.</p>}
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
                  <td className="px-4 py-3 text-gray">{niveauLabel(r.niveau, schedule.length)}</td>
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
