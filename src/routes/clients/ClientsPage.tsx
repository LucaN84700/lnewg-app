import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyDeleteError, supabase } from "../../lib/supabaseClient";
import { matchesSearch } from "../../lib/search";
import { resizeImageFile } from "../../lib/image";
import ScheduleEditor from "../../components/ScheduleEditor";
import ImportModal, { type ImportField } from "../../components/ImportModal";
import type { Client, ClientInput } from "../../types/database";

const importFields: ImportField[] = [
  { key: "name", label: "Nom", required: true },
  { key: "company_name", label: "Raison sociale" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Téléphone" },
  { key: "address", label: "Adresse" },
];

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
  const [search, setSearch] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

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
    onError: (err) => alert(friendlyDeleteError(err, "client")),
  });

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setLogoError(null);
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
      logo_url: client.logo_url ?? "",
      relance_schedule_jours: client.relance_schedule_jours,
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

  async function handleLogoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editingId) return;

    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setLogoError("Formats acceptés : PNG ou JPG.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("Image trop lourde (2 Mo max).");
      return;
    }

    setLogoError(null);
    setUploadingLogo(true);
    try {
      const resized = await resizeImageFile(file);
      const { data: clientRow, error: clientRowError } = await supabase
        .from("clients")
        .select("tenant_id")
        .eq("id", editingId)
        .single();
      if (clientRowError) throw clientRowError;
      const path = `${clientRow.tenant_id}/clients/${editingId}/logo.${resized.type === "image/png" ? "png" : "jpg"}`;

      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(path, resized, { upsert: true, contentType: resized.type });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("logos").getPublicUrl(path);
      const logoUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("clients")
        .update({ logo_url: logoUrl })
        .eq("id", editingId);
      if (updateError) throw updateError;

      setForm((prev) => ({ ...prev, logo_url: logoUrl }));
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Échec de l'envoi du logo");
    } finally {
      setUploadingLogo(false);
    }
  }

  function handleDelete(client: Client) {
    if (confirm(`Supprimer le client "${client.name}" ? Cette action est irréversible.`)) {
      deleteMutation.mutate(client.id);
    }
  }

  async function handleImport(rows: Record<string, string>[]) {
    const usedCodes = new Set((clients ?? []).map((c) => c.short_code));
    let success = 0;
    let skipped = 0;

    for (const row of rows) {
      const name = row.name.trim();
      if (!name) {
        skipped += 1;
        continue;
      }

      let code = slugify(name) || "CLIENT";
      let suffix = 2;
      while (usedCodes.has(code)) {
        code = `${slugify(name).slice(0, 6)}${suffix}`;
        suffix += 1;
      }
      usedCodes.add(code);

      const { error: insertError } = await supabase.from("clients").insert({
        name,
        short_code: code,
        company_name: row.company_name || null,
        email: row.email || null,
        phone: row.phone || null,
        address: row.address || null,
      });
      if (insertError) {
        skipped += 1;
      } else {
        success += 1;
      }
    }

    queryClient.invalidateQueries({ queryKey: ["clients"] });
    return { success, skipped };
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-navy">Clients</h1>
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
            + Ajouter un client
          </button>
        </div>
      </div>

      <input
        type="text"
        placeholder="Rechercher un client (nom, code, email...)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mt-4 w-full max-w-sm rounded-md border border-line px-3 py-2 text-sm"
      />

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

          <div className="flex flex-col gap-1 rounded-md border border-line p-3">
            <label className="flex items-center gap-2 text-sm text-navy">
              <input
                type="checkbox"
                checked={form.relance_schedule_jours != null}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    relance_schedule_jours: e.target.checked ? [1, 15, 30] : null,
                  }))
                }
              />
              Personnaliser le barème de relances pour ce client
            </label>
            {form.relance_schedule_jours != null && (
              <div className="mt-2">
                <ScheduleEditor
                  value={form.relance_schedule_jours}
                  onChange={(schedule) => setForm((prev) => ({ ...prev, relance_schedule_jours: schedule }))}
                />
              </div>
            )}
          </div>

          {editingId ? (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray">Logo du client (optionnel)</label>
              <div className="flex items-center gap-3">
                {form.logo_url ? (
                  <img
                    src={form.logo_url}
                    alt=""
                    className="h-10 w-10 rounded border border-line object-contain p-0.5"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded border border-dashed border-line text-[10px] text-gray">
                    Aucun
                  </div>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={uploadingLogo}
                  onChange={handleLogoUpload}
                  className="text-sm"
                />
              </div>
              {uploadingLogo && <p className="text-xs text-gray">Envoi en cours…</p>}
              {logoError && <p className="text-xs text-red-600">{logoError}</p>}
            </div>
          ) : (
            <p className="text-xs text-gray">Le logo du client pourra être ajouté après l'enregistrement.</p>
          )}

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
        const filteredClients = clients?.filter((c) =>
          matchesSearch(search, [c.name, c.company_name, c.short_code, c.email, c.phone]),
        );
        return (
      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-white">
        {isLoading ? (
          <p className="p-6 text-sm text-gray">Chargement…</p>
        ) : !filteredClients || filteredClients.length === 0 ? (
          <p className="p-6 text-sm text-gray">
            {clients && clients.length > 0 ? "Aucun résultat pour cette recherche." : "Aucun client pour l'instant."}
          </p>
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
              {filteredClients.map((client) => (
                <tr key={client.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <Link to={`/clients/${client.id}`} className="font-medium text-navy hover:text-electric-dark hover:underline">
                      {client.name}
                    </Link>
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
        );
      })()}

      {showImport && (
        <ImportModal
          title="Importer des clients"
          fields={importFields}
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
