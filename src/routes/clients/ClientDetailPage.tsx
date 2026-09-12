import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { openFunctionPdf, supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../hooks/useAuth";
import RestrictedAccess from "../../components/RestrictedAccess";
import type { Client, Devis, DevisStatut, Facture, FactureStatut, Relance } from "../../types/database";

const devisStatutLabels: Record<DevisStatut, string> = {
  brouillon: "En attente",
  envoye: "Envoyé",
  accepte: "Accepté",
  refuse: "Refusé",
  expire: "Expiré",
};

const factureStatutLabels: Record<FactureStatut, string> = {
  brouillon: "En attente",
  envoyee: "Envoyée",
  payee: "Payée",
  en_retard: "En retard",
  annulee: "Annulée",
};

const relanceStatutLabels: Record<Relance["statut"], string> = {
  planifiee: "Planifiée",
  envoyee: "Envoyée",
  echec: "Échec",
};

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const hasAccessClients = !profile || profile.role === "owner" || profile.can_view_clients;

  const { data: client, isLoading: clientLoading } = useQuery({
    queryKey: ["client", id],
    enabled: !!id && hasAccessClients,
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Client;
    },
  });

  const { data: devisList, isLoading: devisLoading } = useQuery({
    queryKey: ["client-devis", id],
    enabled: !!id && hasAccessClients,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devis")
        .select("*")
        .eq("client_id", id)
        .order("date_emission", { ascending: false });
      if (error) throw error;
      return data as Devis[];
    },
  });

  const { data: factures, isLoading: facturesLoading } = useQuery({
    queryKey: ["client-factures", id],
    enabled: !!id && hasAccessClients,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("factures")
        .select("*")
        .eq("client_id", id)
        .order("date_facture", { ascending: false });
      if (error) throw error;
      return data as Facture[];
    },
  });

  const factureIds = (factures ?? []).map((f) => f.id);

  const { data: relances, isLoading: relancesLoading } = useQuery({
    queryKey: ["client-relances", id, factureIds.join(",")],
    enabled: factureIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("relances")
        .select("*, factures(numero, total_ttc)")
        .in("facture_id", factureIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Relance[];
    },
  });

  async function handleDownloadDevisPdf(d: Devis) {
    try {
      await openFunctionPdf("devis-pdf", { devis_id: d.id });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Échec de la génération du PDF");
    }
  }

  async function handleDownloadFacturePdf(f: Facture) {
    try {
      await openFunctionPdf("facture-pdf", { facture_id: f.id });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Échec de la génération du PDF");
    }
  }

  const impayees = (factures ?? []).filter(
    (f) => f.statut !== "payee" && f.statut !== "annulee" && f.statut !== "brouillon",
  );
  const totalImpaye = impayees.reduce((sum, f) => sum + f.total_ttc, 0);
  const totalFacture = (factures ?? [])
    .filter((f) => f.statut !== "annulee")
    .reduce((sum, f) => sum + f.total_ttc, 0);

  if (!hasAccessClients) {
    return (
      <RestrictedAccess
        title="Clients"
        message="L'accès aux clients vous a été désactivé par le propriétaire du compte."
      />
    );
  }

  if (clientLoading) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray">Chargement…</p>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray">Client introuvable.</p>
        <Link to="/clients" className="mt-2 inline-block text-sm text-electric-dark">
          ← Retour aux clients
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8">
      <Link to="/clients" className="text-sm text-electric-dark">
        ← Retour aux clients
      </Link>

      <div className="mt-3 flex items-start gap-4">
        {client.logo_url && (
          <img
            src={client.logo_url}
            alt=""
            className="h-14 w-14 rounded-md border border-line object-contain p-1"
          />
        )}
        <div>
          <h1 className="text-2xl font-bold text-navy">{client.name}</h1>
          {client.company_name && <p className="text-sm text-gray">{client.company_name}</p>}
          <p className="mt-1 text-sm text-gray">
            {[client.address, client.email, client.phone].filter(Boolean).join(" · ") || "Aucune coordonnée renseignée"}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-4 gap-3 max-w-2xl">
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="text-xs text-gray">Devis</p>
          <p className="mt-1 text-lg font-bold text-navy">{devisList?.length ?? 0}</p>
        </div>
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="text-xs text-gray">Factures</p>
          <p className="mt-1 text-lg font-bold text-navy">{factures?.length ?? 0}</p>
        </div>
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="text-xs text-gray">Total facturé</p>
          <p className="mt-1 text-lg font-bold text-navy">{totalFacture.toFixed(2)} €</p>
        </div>
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="text-xs text-gray">Impayé</p>
          <p className={`mt-1 text-lg font-bold ${totalImpaye > 0 ? "text-red-600" : "text-navy"}`}>
            {totalImpaye.toFixed(2)} €
          </p>
        </div>
      </div>

      <h2 className="mt-8 text-lg font-bold text-navy">Devis</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-line bg-white">
        {devisLoading ? (
          <p className="p-6 text-sm text-gray">Chargement…</p>
        ) : !devisList || devisList.length === 0 ? (
          <p className="p-6 text-sm text-gray">Aucun devis pour ce client.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-gray">
                <th className="px-4 py-3 font-medium">Numéro</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Total HT</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {devisList.map((d) => (
                <tr key={d.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-navy">{d.numero}</td>
                  <td className="px-4 py-3 text-gray">{d.date_emission}</td>
                  <td className="px-4 py-3 text-gray">{devisStatutLabels[d.statut]}</td>
                  <td className="px-4 py-3 text-gray">{d.total_ht.toFixed(2)} €</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => handleDownloadDevisPdf(d)} className="text-electric-dark">
                      PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="mt-8 text-lg font-bold text-navy">Factures</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-line bg-white">
        {facturesLoading ? (
          <p className="p-6 text-sm text-gray">Chargement…</p>
        ) : !factures || factures.length === 0 ? (
          <p className="p-6 text-sm text-gray">Aucune facture pour ce client.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-gray">
                <th className="px-4 py-3 font-medium">Numéro</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Échéance</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Total TTC</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {factures.map((f) => (
                <tr key={f.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-navy">{f.numero}</td>
                  <td className="px-4 py-3 text-gray">{f.date_facture}</td>
                  <td className="px-4 py-3 text-gray">{f.date_echeance}</td>
                  <td className="px-4 py-3">
                    {f.statut === "payee" ? (
                      <span className="text-xs font-semibold text-emerald-600">✓ Payée</span>
                    ) : f.statut === "brouillon" ? (
                      <span className="text-xs font-semibold text-gray">{factureStatutLabels[f.statut]}</span>
                    ) : (
                      <span className="text-xs font-semibold text-red-600">{factureStatutLabels[f.statut]}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray">{f.total_ttc.toFixed(2)} €</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => handleDownloadFacturePdf(f)} className="text-electric-dark">
                      PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="mt-8 text-lg font-bold text-navy">Relances</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-line bg-white">
        {relancesLoading ? (
          <p className="p-6 text-sm text-gray">Chargement…</p>
        ) : !relances || relances.length === 0 ? (
          <p className="p-6 text-sm text-gray">Aucune relance envoyée à ce client.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-gray">
                <th className="px-4 py-3 font-medium">Facture</th>
                <th className="px-4 py-3 font-medium">Niveau</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Envoyée le</th>
              </tr>
            </thead>
            <tbody>
              {relances.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-navy">{r.factures?.numero ?? "—"}</td>
                  <td className="px-4 py-3 text-gray">Niveau {r.niveau}</td>
                  <td className="px-4 py-3 text-gray">{relanceStatutLabels[r.statut]}</td>
                  <td className="px-4 py-3 text-gray">
                    {r.sent_at ? new Date(r.sent_at).toLocaleDateString("fr-FR") : "—"}
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
