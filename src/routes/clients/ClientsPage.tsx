import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import type { Client, ClientInput } from "../../types/database";

const emptyForm: ClientInput = {
  name: "",
  short_code: "",
  company_name: "",
  address: "",
  email: "",
  phone: "",
  payment_mode_default: "Virement bancaire",
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 8);
}

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ClientInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (fetchError) throw fetchError;
      return data as Client[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (input: ClientInput) => {
      if (editingId) {
        const { error: updateError } = await supabase.from("clients").update(input).eq("id", editingId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from("clients").insert(input);
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      closeForm();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: deleteError } = await supabase.from("clients").delete().eq("id", id);
      if (deleteError) throw deleteError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setShowForm(true);
  }

  function openEditForm(client: Client) {
    setEditingId(client.id);
    setForm({
      name: client.name,
      short_code: client.short_code,
      company_name: client.company_name ?? "",
      address: client.address ?? "",
      email: client.email ?? "",
      phone: client.phone ?? "",
      payment_mode_default: client.payment_mode_default ?? "Virement bancaire",
    });
    setError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function handleNameChange(name: string) {
    setForm((prev) => ({
      ...prev,
      name,
      short_code: editingId ? prev.short_code : slugify(name),
    }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    saveMutation.mutate(form);
  }

  function handleDelete(client: Client) {
    if (confirm(`Supprimer le client "${client.name}" ? Cette action est irréversible.`)) {
      deleteMutation.mutate(client.id);
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-navy">Clients</h1>
        <button
          type="button"
          onClick={openCreateForm}
          className="rounded-md bg-electric px-4 py-2 text-sm font-semibold text-navy"
        >
          + Ajouter un client
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-6 flex flex-col gap-3 rounded-xl border border-line bg-white p-6 max-w-lg"
        >
          <h2 className="text-lg font-bold text-navy">
            {editingId ? "Modifier le client" : "Nouveau client"}
          </h2>

          <input
            type="text"
            placeholder="Nom du client *"
            required
            value={form.name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="rounded-md border border-line px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Code court (référence devis/factures) *"
            required
            maxLength={8}
            value={form.short_code}
            onChange={(e) => setForm((prev) => ({ ...prev, short_code: slugify(e.target.value) }))}
            className="rounded-md border border-line px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Raison sociale"
            value={form.company_name ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, company_name: e.target.value }))}
            className="rounded-md border border-line px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Adresse"
            value={form.address ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
            className="rounded-md border border-line px-3 py-2 text-sm"
          />
          <input
            type="email"
            placeholder="Email"
            value={form.email ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            className="rounded-md border border-line px-3 py-2 text-sm"
          />
          <input
            type="tel"
            placeholder="Téléphone"
            value={form.phone ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            className="rounded-md border border-line px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Mode de paiement par défaut"
            value={form.payment_mode_default ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, payment_mode_default: e.target.value }))}
            className="rounded-md border border-line px-3 py-2 text-sm"
          />

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
        ) : !clients || clients.length === 0 ? (
          <p className="p-6 text-sm text-gray">Aucun client pour l'instant.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-gray">
                <th className="px-4 py-3 font-medium">Nom</th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Téléphone</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-navy">{client.name}</div>
                    {client.company_name && (
                      <div className="text-xs text-gray">{client.company_name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray">{client.short_code}</td>
                  <td className="px-4 py-3 text-gray">{client.email ?? "—"}</td>
                  <td className="px-4 py-3 text-gray">{client.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEditForm(client)}
                      className="mr-3 text-electric-dark"
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(client)}
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
