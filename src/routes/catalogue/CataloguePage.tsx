import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../hooks/useAuth";
import RestrictedAccess from "../../components/RestrictedAccess";
import ImportModal, { type ImportField } from "../../components/ImportModal";
import { UNITES_DISPONIBLES } from "../../lib/unites";
import type { CatalogueArticle, CatalogueArticleInput, Tenant } from "../../types/database";

const importFields: ImportField[] = [
  { key: "description", label: "Description", required: true },
  { key: "unite", label: "Unité" },
  { key: "prix_unitaire_ht", label: "Prix unitaire HT", required: true },
];

const emptyForm: CatalogueArticleInput = { description: "", unite: "u", prix_unitaire_ht: 0 };

export default function CataloguePage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CatalogueArticleInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  const { profile } = useAuth();
  const hasAccessCatalogue = !profile || profile.role === "owner" || profile.can_view_catalogue;

  const { data: articles, isLoading } = useQuery({
    queryKey: ["catalogue"],
    enabled: hasAccessCatalogue,
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from("catalogue_articles")
        .select("*")
        .order("description");
      if (fetchError) throw fetchError;
      return data as CatalogueArticle[];
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

  const unitesOptions = [
    ...(tenant?.unites_actives && tenant.unites_actives.length > 0
      ? UNITES_DISPONIBLES.filter((u) => tenant.unites_actives.includes(u.code))
      : UNITES_DISPONIBLES),
    ...(tenant?.unites_personnalisees ?? []).map((u) => ({ code: u, label: u })),
  ];

  const saveMutation = useMutation({
    mutationFn: async (input: CatalogueArticleInput) => {
      if (editingId) {
        const { error: updateError } = await supabase
          .from("catalogue_articles")
          .update(input)
          .eq("id", editingId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from("catalogue_articles").insert(input);
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalogue"] });
      closeForm();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: deleteError } = await supabase.from("catalogue_articles").delete().eq("id", id);
      if (deleteError) throw deleteError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalogue"] }),
  });

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setShowForm(true);
  }

  function openEditForm(article: CatalogueArticle) {
    setEditingId(article.id);
    setForm({
      description: article.description,
      unite: article.unite,
      prix_unitaire_ht: article.prix_unitaire_ht,
    });
    setError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    saveMutation.mutate(form);
  }

  function handleDelete(article: CatalogueArticle) {
    if (confirm(`Supprimer "${article.description}" du catalogue ?`)) {
      deleteMutation.mutate(article.id);
    }
  }

  async function handleImport(rows: Record<string, string>[]) {
    const toInsert = rows
      .filter((r) => r.description.trim() !== "")
      .map((r) => ({
        description: r.description.trim(),
        unite: r.unite.trim() || "u",
        prix_unitaire_ht: Number(r.prix_unitaire_ht.replace(",", ".")) || 0,
      }));
    const skipped = rows.length - toInsert.length;
    if (toInsert.length > 0) {
      const { error: insertError } = await supabase.from("catalogue_articles").insert(toInsert);
      if (insertError) throw insertError;
    }
    queryClient.invalidateQueries({ queryKey: ["catalogue"] });
    return { success: toInsert.length, skipped };
  }

  if (!hasAccessCatalogue) {
    return (
      <RestrictedAccess
        title="Catalogue"
        message="L'accès au catalogue vous a été désactivé par le propriétaire du compte."
      />
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Catalogue de prix</h1>
          <p className="mt-1 text-sm text-gray">
            Tes prestations habituelles, réutilisables directement dans les devis et factures.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="rounded-md border border-line px-4 py-2 text-sm font-semibold text-navy"
          >
            Importer (Excel/CSV)
          </button>
          <button
            type="button"
            onClick={openCreateForm}
            className="rounded-md bg-electric px-4 py-2 text-sm font-semibold text-navy"
          >
            + Ajouter une prestation
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-6 flex flex-col gap-3 rounded-xl border border-line bg-white p-6 max-w-lg"
        >
          <h2 className="text-lg font-bold text-navy">
            {editingId ? "Modifier la prestation" : "Nouvelle prestation"}
          </h2>

          <input
            type="text"
            placeholder="Description *"
            required
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            className="rounded-md border border-line px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.unite}
              onChange={(e) => setForm((prev) => ({ ...prev, unite: e.target.value }))}
              className="rounded-md border border-line px-3 py-2 text-sm"
            >
              {!unitesOptions.some((u) => u.code === form.unite) && form.unite && (
                <option value={form.unite}>{form.unite} (non listée)</option>
              )}
              {unitesOptions.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              placeholder="Prix unitaire HT"
              value={form.prix_unitaire_ht}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, prix_unitaire_ht: Number(e.target.value) }))
              }
              className="rounded-md border border-line px-3 py-2 text-sm"
            />
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
        ) : !articles || articles.length === 0 ? (
          <p className="p-6 text-sm text-gray">
            Aucune prestation enregistrée. Ajoute tes prestations habituelles pour les réutiliser
            en un clic dans tes devis.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-gray">
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Unité</th>
                <th className="px-4 py-3 font-medium">Prix unitaire HT</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {articles.map((article) => (
                <tr key={article.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-navy">{article.description}</td>
                  <td className="px-4 py-3 text-gray">{article.unite}</td>
                  <td className="px-4 py-3 text-gray">{article.prix_unitaire_ht.toFixed(2)} €</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEditForm(article)}
                      className="mr-3 text-electric-dark"
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(article)}
                      className="text-red-600"
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showImport && (
        <ImportModal
          title="Importer des prestations"
          fields={importFields}
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
