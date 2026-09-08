import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import type {
  Client,
  Devis,
  DevisLigne,
  Facture,
  FactureInput,
  FactureStatut,
  Tenant,
} from "../../types/database";

const emptyLigne: DevisLigne = { description: "", quantite: 1, unite: "u", prix_unitaire_ht: 0 };

const statutLabels: Record<FactureStatut, string> = {
  brouillon: "Brouillon",
  envoyee: "Envoyée",
  payee: "Payée",
  en_retard: "En retard",
  annulee: "Annulée",
};

function computeTotalHt(lignes: DevisLigne[]) {
  return lignes.reduce((sum, l) => sum + l.quantite * l.prix_unitaire_ht, 0);
}

function computeTva(totalHt: number, tenant?: Tenant) {
  if (!tenant || tenant.tva_regime === "franchise") return 0;
  return totalHt * ((tenant.tva_rate ?? 20) / 100);
}

function addDays(dateStr: string, days: number) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function emptyForm(tenant?: Tenant): FactureInput {
  const today = new Date().toISOString().slice(0, 10);
  return {
    client_id: "",
    devis_id: null,
    date_facture: today,
    date_echeance: addDays(today, tenant?.payment_terms_days ?? 30),
    lignes: [{ ...emptyLigne }],
    total_ht: 0,
    tva_montant: 0,
    total_ttc: 0,
    mode_paiement: "Virement bancaire",
  };
}

export default function FacturesPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FactureInput>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  const { data: tenant } = useQuery({
    queryKey: ["tenant"],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase.from("tenants").select("*").single();
      if (fetchError) throw fetchError;
      return data as Tenant;
    },
  });

  const { data: factures, isLoading } = useQuery({
    queryKey: ["factures"],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from("factures")
        .select("*, clients(name, short_code)")
        .order("created_at", { ascending: false });
      if (fetchError) throw fetchError;
      return data as Facture[];
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase.from("clients").select("*").order("name");
      if (fetchError) throw fetchError;
      return data as Client[];
    },
  });

  const { data: devisAcceptes } = useQuery({
    queryKey: ["devis", "acceptes"],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from("devis")
        .select("*, clients(name, short_code)")
        .eq("statut", "accepte")
        .order("created_at", { ascending: false });
      if (fetchError) throw fetchError;
      return data as Devis[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (input: FactureInput) => {
      if (editingId) {
        const { error: updateError } = await supabase.from("factures").update(input).eq("id", editingId);
        if (updateError) throw updateError;
      } else {
        const { data: numero, error: numberError } = await supabase.rpc("get_next_document_number", {
          p_client_id: input.client_id,
          p_doc_type: "facture",
        });
        if (numberError) throw numberError;

        const client = clients?.find((c) => c.id === input.client_id);
        const fullNumero = `${client?.short_code ?? "FACT"}-F${String(numero).padStart(3, "0")}`;

        const { error: insertError } = await supabase
          .from("factures")
          .insert({ ...input, numero: fullNumero });
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["factures"] });
      closeForm();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const statutMutation = useMutation({
    mutationFn: async ({ id, statut }: { id: string; statut: FactureStatut }) => {
      const patch: { statut: FactureStatut; paid_at?: string } = { statut };
      if (statut === "payee") patch.paid_at = new Date().toISOString();
      const { error: updateError } = await supabase.from("factures").update(patch).eq("id", id);
      if (updateError) throw updateError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["factures"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: deleteError } = await supabase.from("factures").delete().eq("id", id);
      if (deleteError) throw deleteError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["factures"] }),
  });

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyForm(tenant));
    setError(null);
    setShowForm(true);
  }

  function openEditForm(f: Facture) {
    setEditingId(f.id);
    setForm({
      client_id: f.client_id,
      devis_id: f.devis_id,
      date_facture: f.date_facture,
      date_echeance: f.date_echeance,
      lignes: f.lignes.length > 0 ? f.lignes : [{ ...emptyLigne }],
      total_ht: f.total_ht,
      tva_montant: f.tva_montant,
      total_ttc: f.total_ttc,
      mode_paiement: f.mode_paiement ?? "Virement bancaire",
    });
    setError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm(tenant));
  }

  function recompute(lignes: DevisLigne[]) {
    const total_ht = computeTotalHt(lignes);
    const tva_montant = computeTva(total_ht, tenant);
    return { total_ht, tva_montant, total_ttc: total_ht + tva_montant };
  }

  function updateLigne(index: number, patch: Partial<DevisLigne>) {
    setForm((prev) => {
      const lignes = prev.lignes.map((l, i) => (i === index ? { ...l, ...patch } : l));
      return { ...prev, lignes, ...recompute(lignes) };
    });
  }

  function addLigne() {
    setForm((prev) => ({ ...prev, lignes: [...prev.lignes, { ...emptyLigne }] }));
  }

  function removeLigne(index: number) {
    setForm((prev) => {
      const lignes = prev.lignes.filter((_, i) => i !== index);
      return { ...prev, lignes, ...recompute(lignes) };
    });
  }

  function applyDevis(devisId: string) {
    const devis = devisAcceptes?.find((d) => d.id === devisId);
    setForm((prev) => {
      if (!devis) return { ...prev, devis_id: null };
      const lignes = devis.lignes.length > 0 ? devis.lignes : [{ ...emptyLigne }];
      return {
        ...prev,
        devis_id: devis.id,
        client_id: devis.client_id,
        lignes,
        ...recompute(lignes),
      };
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.client_id) {
      setError("Sélectionnez un client.");
      return;
    }
    saveMutation.mutate(form);
  }

  function handleDelete(f: Facture) {
    if (confirm(`Supprimer la facture "${f.numero}" ? Cette action est irréversible.`)) {
      deleteMutation.mutate(f.id);
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-navy">Factures</h1>
        <button
          type="button"
          onClick={openCreateForm}
          className="rounded-md bg-electric px-4 py-2 text-sm font-semibold text-navy"
        >
          + Nouvelle facture
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-6 flex flex-col gap-3 rounded-xl border border-line bg-white p-6 max-w-2xl"
        >
          <h2 className="text-lg font-bold text-navy">
            {editingId ? "Modifier la facture" : "Nouvelle facture"}
          </h2>

          {!editingId && devisAcceptes && devisAcceptes.length > 0 && (
            <>
              <label className="text-xs font-medium text-gray">
                Générer depuis un devis accepté (optionnel)
              </label>
              <select
                value={form.devis_id ?? ""}
                onChange={(e) => applyDevis(e.target.value)}
                className="rounded-md border border-line px-3 py-2 text-sm"
              >
                <option value="">Facture indépendante…</option>
                {devisAcceptes.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.numero} — {d.clients?.name} ({d.total_ht.toFixed(2)} € HT)
                  </option>
                ))}
              </select>
            </>
          )}

          <label className="text-xs font-medium text-gray">Client *</label>
          <select
            required
            disabled={!!form.devis_id}
            value={form.client_id}
            onChange={(e) => setForm((prev) => ({ ...prev, client_id: e.target.value }))}
            className="rounded-md border border-line px-3 py-2 text-sm disabled:opacity-60"
          >
            <option value="">Sélectionner un client…</option>
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray">Date de facture</label>
              <input
                type="date"
                value={form.date_facture}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    date_facture: e.target.value,
                    date_echeance: addDays(e.target.value, tenant?.payment_terms_days ?? 30),
                  }))
                }
                className="rounded-md border border-line px-3 py-2 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray">Date d'échéance</label>
              <input
                type="date"
                value={form.date_echeance}
                onChange={(e) => setForm((prev) => ({ ...prev, date_echeance: e.target.value }))}
                className="rounded-md border border-line px-3 py-2 text-sm"
              />
            </div>
          </div>

          <label className="text-xs font-medium text-gray">Mode de paiement</label>
          <input
            type="text"
            value={form.mode_paiement}
            onChange={(e) => setForm((prev) => ({ ...prev, mode_paiement: e.target.value }))}
            className="rounded-md border border-line px-3 py-2 text-sm"
          />

          <div className="mt-2 flex items-center justify-between">
            <label className="text-xs font-medium text-gray">Lignes</label>
            <button type="button" onClick={addLigne} className="text-xs font-medium text-electric-dark">
              + Ajouter une ligne
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {form.lignes.map((ligne, index) => (
              <div key={index} className="grid grid-cols-[1fr_70px_70px_100px_28px] gap-2">
                <input
                  type="text"
                  placeholder="Description"
                  required
                  value={ligne.description}
                  onChange={(e) => updateLigne(index, { description: e.target.value })}
                  className="rounded-md border border-line px-2 py-1.5 text-sm"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Qté"
                  value={ligne.quantite}
                  onChange={(e) => updateLigne(index, { quantite: Number(e.target.value) })}
                  className="rounded-md border border-line px-2 py-1.5 text-sm"
                />
                <input
                  type="text"
                  placeholder="Unité"
                  value={ligne.unite}
                  onChange={(e) => updateLigne(index, { unite: e.target.value })}
                  className="rounded-md border border-line px-2 py-1.5 text-sm"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="PU HT"
                  value={ligne.prix_unitaire_ht}
                  onChange={(e) => updateLigne(index, { prix_unitaire_ht: Number(e.target.value) })}
                  className="rounded-md border border-line px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeLigne(index)}
                  disabled={form.lignes.length === 1}
                  className="text-red-600 disabled:opacity-30"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="mt-2 flex flex-col items-end gap-0.5 text-sm text-navy">
            <span>Total HT : {form.total_ht.toFixed(2)} €</span>
            <span>
              TVA {tenant?.tva_regime === "franchise" ? "(franchise en base)" : `(${tenant?.tva_rate ?? 20}%)`} :{" "}
              {form.tva_montant.toFixed(2)} €
            </span>
            <span className="font-semibold">Total TTC : {form.total_ttc.toFixed(2)} €</span>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="mt-2 flex gap-2">
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="rounded-md bg-electric px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
            >
              {saveMutation.isPending ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-white">
        {isLoading ? (
          <p className="p-6 text-sm text-gray">Chargement…</p>
        ) : !factures || factures.length === 0 ? (
          <p className="p-6 text-sm text-gray">Aucune facture pour l'instant.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-gray">
                <th className="px-4 py-3 font-medium">Numéro</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Échéance</th>
                <th className="px-4 py-3 font-medium">Total TTC</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {factures.map((f) => (
                <tr key={f.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-navy">{f.numero}</td>
                  <td className="px-4 py-3 text-gray">{f.clients?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray">{f.date_echeance}</td>
                  <td className="px-4 py-3 text-gray">{f.total_ttc.toFixed(2)} €</td>
                  <td className="px-4 py-3">
                    <select
                      value={f.statut}
                      onChange={(e) =>
                        statutMutation.mutate({ id: f.id, statut: e.target.value as FactureStatut })
                      }
                      className="rounded-md border border-line px-2 py-1 text-xs"
                    >
                      {Object.entries(statutLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEditForm(f)}
                      className="mr-3 text-electric-dark"
                    >
                      Modifier
                    </button>
                    <button type="button" onClick={() => handleDelete(f)} className="text-red-600">
                      Supprimer
                    </button>
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
