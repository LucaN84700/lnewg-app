import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import type {
  CatalogueArticle,
  Client,
  Devis,
  DevisInput,
  DevisLigne,
  DevisStatut,
} from "../../types/database";
import VoiceRecorder, { type VoiceDevisResult } from "./VoiceRecorder";

const emptyLigne: DevisLigne = { description: "", quantite: 1, unite: "u", prix_unitaire_ht: 0 };

function emptyForm(): DevisInput {
  return {
    client_id: "",
    objet: "",
    contexte: "",
    date_emission: new Date().toISOString().slice(0, 10),
    validite_jours: 30,
    lignes: [{ ...emptyLigne }],
    total_ht: 0,
  };
}

const statutLabels: Record<DevisStatut, string> = {
  brouillon: "Brouillon",
  envoye: "Envoyé",
  accepte: "Accepté",
  refuse: "Refusé",
  expire: "Expiré",
};

function computeTotal(lignes: DevisLigne[]) {
  return lignes.reduce((sum, l) => sum + l.quantite * l.prix_unitaire_ht, 0);
}

export default function DevisPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<DevisInput>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  const { data: devis, isLoading } = useQuery({
    queryKey: ["devis"],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from("devis")
        .select("*, clients(name, short_code)")
        .order("created_at", { ascending: false });
      if (fetchError) throw fetchError;
      return data as Devis[];
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

  const { data: catalogue } = useQuery({
    queryKey: ["catalogue"],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from("catalogue_articles")
        .select("*")
        .order("description");
      if (fetchError) throw fetchError;
      return data as CatalogueArticle[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (input: DevisInput) => {
      if (editingId) {
        const { error: updateError } = await supabase.from("devis").update(input).eq("id", editingId);
        if (updateError) throw updateError;
      } else {
        const { data: numero, error: numberError } = await supabase.rpc("get_next_document_number", {
          p_client_id: input.client_id,
          p_doc_type: "devis",
        });
        if (numberError) throw numberError;

        const client = clients?.find((c) => c.id === input.client_id);
        const fullNumero = `${client?.short_code ?? "DEVIS"}-${String(numero).padStart(3, "0")}`;

        const { error: insertError } = await supabase.from("devis").insert({ ...input, numero: fullNumero });
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devis"] });
      closeForm();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const statutMutation = useMutation({
    mutationFn: async ({ id, statut }: { id: string; statut: DevisStatut }) => {
      const { error: updateError } = await supabase.from("devis").update({ statut }).eq("id", id);
      if (updateError) throw updateError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["devis"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: deleteError } = await supabase.from("devis").delete().eq("id", id);
      if (deleteError) throw deleteError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["devis"] }),
  });

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
    setShowForm(true);
  }

  function openEditForm(d: Devis) {
    setEditingId(d.id);
    setForm({
      client_id: d.client_id,
      objet: d.objet ?? "",
      contexte: d.contexte ?? "",
      date_emission: d.date_emission,
      validite_jours: d.validite_jours,
      lignes: d.lignes.length > 0 ? d.lignes : [{ ...emptyLigne }],
      total_ht: d.total_ht,
    });
    setError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  function updateLigne(index: number, patch: Partial<DevisLigne>) {
    setForm((prev) => {
      const lignes = prev.lignes.map((l, i) => (i === index ? { ...l, ...patch } : l));
      return { ...prev, lignes, total_ht: computeTotal(lignes) };
    });
  }

  function addLigne() {
    setForm((prev) => ({ ...prev, lignes: [...prev.lignes, { ...emptyLigne }] }));
  }

  function addLigneFromCatalogue(articleId: string) {
    const article = catalogue?.find((a) => a.id === articleId);
    if (!article) return;
    setForm((prev) => {
      const existing = prev.lignes.filter((l) => l.description.trim() !== "");
      const lignes = [
        ...existing,
        {
          description: article.description,
          quantite: 1,
          unite: article.unite,
          prix_unitaire_ht: article.prix_unitaire_ht,
        },
      ];
      return { ...prev, lignes, total_ht: computeTotal(lignes) };
    });
  }

  function handleVoiceResult(result: VoiceDevisResult) {
    setForm((prev) => {
      const existingLignes = prev.lignes.filter((l) => l.description.trim() !== "");
      const lignes = [...existingLignes, ...result.lignes];
      return {
        ...prev,
        objet: prev.objet || result.objet,
        contexte: prev.contexte || result.contexte,
        lignes: lignes.length > 0 ? lignes : [{ ...emptyLigne }],
        total_ht: computeTotal(lignes),
      };
    });
  }

  function removeLigne(index: number) {
    setForm((prev) => {
      const lignes = prev.lignes.filter((_, i) => i !== index);
      return { ...prev, lignes, total_ht: computeTotal(lignes) };
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

  function handleDelete(d: Devis) {
    if (confirm(`Supprimer le devis "${d.numero}" ? Cette action est irréversible.`)) {
      deleteMutation.mutate(d.id);
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-navy">Devis</h1>
        <button
          type="button"
          onClick={openCreateForm}
          className="rounded-md bg-electric px-4 py-2 text-sm font-semibold text-navy"
        >
          + Nouveau devis
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-6 flex flex-col gap-3 rounded-xl border border-line bg-white p-6 max-w-2xl"
        >
          <h2 className="text-lg font-bold text-navy">
            {editingId ? "Modifier le devis" : "Nouveau devis"}
          </h2>

          <VoiceRecorder onResult={handleVoiceResult} />

          <label className="text-xs font-medium text-gray">Client *</label>
          <select
            required
            value={form.client_id}
            onChange={(e) => setForm((prev) => ({ ...prev, client_id: e.target.value }))}
            className="rounded-md border border-line px-3 py-2 text-sm"
          >
            <option value="">Sélectionner un client…</option>
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <label className="text-xs font-medium text-gray">Objet</label>
          <input
            type="text"
            placeholder="Objet du devis"
            value={form.objet}
            onChange={(e) => setForm((prev) => ({ ...prev, objet: e.target.value }))}
            className="rounded-md border border-line px-3 py-2 text-sm"
          />

          <label className="text-xs font-medium text-gray">Contexte</label>
          <textarea
            placeholder="Contexte, détails du chantier…"
            value={form.contexte}
            onChange={(e) => setForm((prev) => ({ ...prev, contexte: e.target.value }))}
            className="rounded-md border border-line px-3 py-2 text-sm"
            rows={2}
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray">Date d'émission</label>
              <input
                type="date"
                value={form.date_emission}
                onChange={(e) => setForm((prev) => ({ ...prev, date_emission: e.target.value }))}
                className="rounded-md border border-line px-3 py-2 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray">Validité (jours)</label>
              <input
                type="number"
                value={form.validite_jours}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, validite_jours: Number(e.target.value) }))
                }
                className="rounded-md border border-line px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between">
            <label className="text-xs font-medium text-gray">Lignes</label>
            <div className="flex items-center gap-3">
              {catalogue && catalogue.length > 0 && (
                <select
                  value=""
                  onChange={(e) => e.target.value && addLigneFromCatalogue(e.target.value)}
                  className="rounded-md border border-line px-2 py-1 text-xs"
                >
                  <option value="">+ Depuis le catalogue…</option>
                  {catalogue.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.description} ({a.prix_unitaire_ht.toFixed(2)} €/{a.unite})
                    </option>
                  ))}
                </select>
              )}
              <button type="button" onClick={addLigne} className="text-xs font-medium text-electric-dark">
                + Ajouter une ligne
              </button>
            </div>
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

          <div className="mt-2 text-right text-sm font-semibold text-navy">
            Total HT : {form.total_ht.toFixed(2)} €
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
        ) : !devis || devis.length === 0 ? (
          <p className="p-6 text-sm text-gray">Aucun devis pour l'instant.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-gray">
                <th className="px-4 py-3 font-medium">Numéro</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Total HT</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {devis.map((d) => (
                <tr key={d.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-navy">{d.numero}</td>
                  <td className="px-4 py-3 text-gray">{d.clients?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray">{d.date_emission}</td>
                  <td className="px-4 py-3 text-gray">{d.total_ht.toFixed(2)} €</td>
                  <td className="px-4 py-3">
                    <select
                      value={d.statut}
                      onChange={(e) =>
                        statutMutation.mutate({ id: d.id, statut: e.target.value as DevisStatut })
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
                      onClick={() => openEditForm(d)}
                      className="mr-3 text-electric-dark"
                    >
                      Modifier
                    </button>
                    <button type="button" onClick={() => handleDelete(d)} className="text-red-600">
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
