import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import type { CatalogueArticle, CatalogueArticleInput } from "../../types/database";

const emptyForm: CatalogueArticleInput = { description: "", unite: "u", prix_unitaire_ht: 0 };

export default function CataloguePage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CatalogueArticleInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const { data: articles, isLoading } = useQuery({
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

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Catalogue de prix</h1>
          <p className="mt-1 text-sm text-gray">
            Tes prestations habituelles, réutilisables directement dans les devis et factures.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="rounded-md bg-electric px-4 py-2 text-sm font-semibold text-navy"
        >
          + Ajouter une prestation
        </button>
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
            <input
              type="text"
              placeholder="Unité (u, m2, h, jour…)"
              value={form.unite}
              onChange={(e) => setForm((prev) => ({ ...prev, unite: e.target.value }))}
              className="rounded-md border border-line px-3 py-2 text-sm"
            />
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
    </div>
  );
}
