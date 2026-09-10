import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyDeleteError, functionErrorMessage, openFunctionPdf, supabase } from "../../lib/supabaseClient";
import { matchesSearch } from "../../lib/search";
import { Link } from "react-router-dom";
import type {
  CatalogueArticle,
  Client,
  Devis,
  DevisInput,
  DevisLigne,
  DevisStatut,
  Plan,
  Tenant,
} from "../../types/database";
import VoiceRecorder, { type VoiceDevisResult } from "./VoiceRecorder";

const emptyLigne: DevisLigne = { description: "", quantite: 1, unite: "u", prix_unitaire_ht: 0 };

function slugifyShortCode(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 8);
}

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

// Accepté/Refusé ne sont plus choisis dans ce menu : ce sont des décisions définitives prises
// via les boutons dédiés (qui déclenchent en plus la génération de la facture pour "Accepté").
const selectableStatuts: DevisStatut[] = ["brouillon", "envoye", "expire"];

function computeTva(totalHt: number, tenant?: Tenant) {
  if (!tenant || tenant.tva_regime === "franchise") return 0;
  return totalHt * ((tenant.tva_rate ?? 20) / 100);
}

function addDays(dateStr: string, days: number) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function computeTotal(lignes: DevisLigne[]) {
  return lignes.reduce((sum, l) => sum + l.quantite * l.prix_unitaire_ht, 0);
}

export default function DevisPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<DevisInput>(emptyForm());
  const [newClientName, setNewClientName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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

  const { data: tenant } = useQuery({
    queryKey: ["tenant"],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase.from("tenants").select("*").single();
      if (fetchError) throw fetchError;
      return data as Tenant;
    },
  });

  const { data: currentPlan } = useQuery({
    queryKey: ["plan", tenant?.plan],
    enabled: !!tenant?.plan,
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

  const now = new Date();
  const devisThisMonth =
    devis?.filter((d) => {
      const created = new Date(d.created_at);
      return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
    }).length ?? 0;
  const monthlyLimit = currentPlan?.devis_limit_per_month ?? null;
  const limitReached = monthlyLimit != null && devisThisMonth >= monthlyLimit;

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
    mutationFn: async ({ input, newClientName: pendingClientName }: { input: DevisInput; newClientName: string }) => {
      let clientId = input.client_id;
      let clientShortCode: string | undefined;

      if (!clientId && pendingClientName.trim()) {
        const { data: newClient, error: clientError } = await supabase
          .from("clients")
          .insert({ name: pendingClientName.trim(), short_code: slugifyShortCode(pendingClientName) })
          .select()
          .single();
        if (clientError) throw clientError;
        clientId = newClient.id;
        clientShortCode = newClient.short_code;
      }

      const finalInput = { ...input, client_id: clientId };

      if (editingId) {
        const { error: updateError } = await supabase.from("devis").update(finalInput).eq("id", editingId);
        if (updateError) throw updateError;
      } else {
        const { data: numero, error: numberError } = await supabase.rpc("get_next_document_number", {
          p_client_id: clientId,
          p_doc_type: "devis",
        });
        if (numberError) throw numberError;

        const client = clientShortCode ?? clients?.find((c) => c.id === clientId)?.short_code;
        const year = new Date().getFullYear();
        const fullNumero = `${year}-${client ?? "DEVIS"}-D${String(numero).padStart(2, "0")}`;

        const { error: insertError } = await supabase.from("devis").insert({ ...finalInput, numero: fullNumero });
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devis"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
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

  const refuseMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: updateError } = await supabase.from("devis").update({ statut: "refuse" }).eq("id", id);
      if (updateError) throw updateError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["devis"] }),
    onError: (err: Error) => alert(err.message),
  });

  const acceptMutation = useMutation({
    mutationFn: async (d: Devis) => {
      const { error: updateError } = await supabase.from("devis").update({ statut: "accepte" }).eq("id", d.id);
      if (updateError) throw updateError;

      const { data: numero, error: numberError } = await supabase.rpc("get_next_document_number", {
        p_client_id: d.client_id,
        p_doc_type: "facture",
      });
      if (numberError) throw numberError;

      const client = clients?.find((c) => c.id === d.client_id);
      const year = new Date().getFullYear();
      const fullNumero = `${year}-${client?.short_code ?? "FACT"}-F${String(numero).padStart(2, "0")}`;
      const today = new Date().toISOString().slice(0, 10);
      const tvaMontant = computeTva(d.total_ht, tenant ?? undefined);

      const { error: insertError } = await supabase.from("factures").insert({
        client_id: d.client_id,
        devis_id: d.id,
        numero: fullNumero,
        date_facture: today,
        date_echeance: addDays(today, tenant?.payment_terms_days ?? 30),
        lignes: d.lignes,
        total_ht: d.total_ht,
        tva_montant: tvaMontant,
        total_ttc: d.total_ht + tvaMontant,
        mode_paiement: client?.payment_mode_default ?? "Virement bancaire",
      });
      if (insertError) throw insertError;

      return fullNumero;
    },
    onSuccess: (fullNumero) => {
      queryClient.invalidateQueries({ queryKey: ["devis"] });
      queryClient.invalidateQueries({ queryKey: ["factures"] });
      alert(`Devis accepté, facture ${fullNumero} créée automatiquement.`);
    },
    onError: (err: Error) => alert(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: deleteError } = await supabase.from("devis").delete().eq("id", id);
      if (deleteError) throw deleteError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["devis"] }),
    onError: (err) => alert(friendlyDeleteError(err, "devis")),
  });

  const sendMutation = useMutation({
    mutationFn: async (devisId: string) => {
      const { data, error: invokeError } = await supabase.functions.invoke("devis-envoyer", {
        body: { devis_id: devisId },
      });
      if (invokeError) throw new Error(await functionErrorMessage(invokeError));
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["devis"] }),
    onError: (err: Error) => alert(err.message),
  });

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyForm());
    setNewClientName("");
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
    setNewClientName("");
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
        client_id: prev.client_id || result.client_id || "",
        lignes: lignes.length > 0 ? lignes : [{ ...emptyLigne }],
        total_ht: computeTotal(lignes),
      };
    });
    if (!form.client_id && !result.client_id && result.client_name) {
      setNewClientName(result.client_name);
    }
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
    if (!form.client_id && !newClientName.trim()) {
      setError("Sélectionnez un client ou saisis le nom d'un nouveau client.");
      return;
    }
    saveMutation.mutate({ input: form, newClientName });
  }

  function handleDelete(d: Devis) {
    if (confirm(`Supprimer le devis "${d.numero}" ? Cette action est irréversible.`)) {
      deleteMutation.mutate(d.id);
    }
  }

  async function handleDownloadPdf(d: Devis) {
    try {
      await openFunctionPdf("devis-pdf", { devis_id: d.id });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Échec de la génération du PDF");
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Devis</h1>
          {monthlyLimit != null && (
            <p className="mt-1 text-xs text-gray">
              {devisThisMonth} / {monthlyLimit} devis ce mois-ci
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          disabled={limitReached}
          className="rounded-md bg-electric px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
        >
          + Nouveau devis
        </button>
      </div>

      <input
        type="text"
        placeholder="Rechercher un devis (numéro, objet, client...)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mt-4 w-full max-w-sm rounded-md border border-line px-3 py-2 text-sm"
      />

      {limitReached && (
        <p className="mt-4 rounded-md border border-line bg-bg-light p-3 text-sm text-gray">
          Limite de {monthlyLimit} devis/mois atteinte pour le plan Starter.{" "}
          <Link to="/billing" className="text-electric-dark">
            Passer au plan Pro (illimité)
          </Link>
        </p>
      )}

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
            value={form.client_id}
            disabled={!!newClientName}
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
          <input
            type="text"
            placeholder="Ou nouveau client (pas encore dans ta base)"
            value={newClientName}
            disabled={!!form.client_id}
            onChange={(e) => setNewClientName(e.target.value)}
            className="rounded-md border border-line px-3 py-2 text-sm disabled:opacity-60"
          />
          {newClientName && (
            <p className="text-xs text-gray">
              "{newClientName}" sera ajouté à ta base clients à l'enregistrement du devis.
            </p>
          )}

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

      {(() => {
        const filteredDevis = devis?.filter((d) =>
          matchesSearch(search, [d.numero, d.objet, d.clients?.name]),
        );
        return (
      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-white">
        {isLoading ? (
          <p className="p-6 text-sm text-gray">Chargement…</p>
        ) : !filteredDevis || filteredDevis.length === 0 ? (
          <p className="p-6 text-sm text-gray">
            {devis && devis.length > 0 ? "Aucun résultat pour cette recherche." : "Aucun devis pour l'instant."}
          </p>
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
              {filteredDevis.map((d) => (
                <tr key={d.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-navy">{d.numero}</td>
                  <td className="px-4 py-3 text-gray">{d.clients?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray">{d.date_emission}</td>
                  <td className="px-4 py-3 text-gray">{d.total_ht.toFixed(2)} €</td>
                  <td className="px-4 py-3">
                    {d.statut === "accepte" || d.statut === "refuse" ? (
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-semibold ${
                            d.statut === "accepte" ? "text-emerald-600" : "text-red-600"
                          }`}
                        >
                          {statutLabels[d.statut]}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <select
                          value={d.statut}
                          onChange={(e) =>
                            statutMutation.mutate({ id: d.id, statut: e.target.value as DevisStatut })
                          }
                          className="rounded-md border border-line px-2 py-1 text-xs"
                        >
                          {selectableStatuts.map((value) => (
                            <option key={value} value={value}>
                              {statutLabels[value]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          title="Accepter (génère la facture)"
                          disabled={acceptMutation.isPending}
                          onClick={() => acceptMutation.mutate(d)}
                          className="text-xs font-semibold text-emerald-600 disabled:opacity-50"
                        >
                          ✓ Accepter
                        </button>
                        <button
                          type="button"
                          title="Refuser"
                          disabled={refuseMutation.isPending}
                          onClick={() => refuseMutation.mutate(d.id)}
                          className="text-xs font-semibold text-red-600 disabled:opacity-50"
                        >
                          ✗ Refuser
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDownloadPdf(d)}
                      className="mr-3 text-electric-dark"
                    >
                      PDF
                    </button>
                    <button
                      type="button"
                      disabled={sendMutation.isPending}
                      onClick={() => sendMutation.mutate(d.id)}
                      className="mr-3 text-electric-dark disabled:opacity-50"
                    >
                      Envoyer
                    </button>
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
        );
      })()}
    </div>
  );
}
