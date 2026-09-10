import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import type { Tenant, TenantInput } from "../../types/database";

const emptyForm: TenantInput = {
  name: "",
  siret: "",
  address: "",
  email: "",
  phone: "",
  iban: "",
  tva_regime: "franchise",
  tva_rate: 20,
  payment_terms_days: 30,
  logo_url: "",
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TenantInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  const { data: tenant, isLoading } = useQuery({
    queryKey: ["tenant"],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase.from("tenants").select("*").single();
      if (fetchError) throw fetchError;
      return data as Tenant;
    },
  });

  useEffect(() => {
    if (tenant) {
      setForm({
        name: tenant.name,
        siret: tenant.siret ?? "",
        address: tenant.address ?? "",
        email: tenant.email ?? "",
        phone: tenant.phone ?? "",
        iban: tenant.iban ?? "",
        tva_regime: tenant.tva_regime,
        tva_rate: tenant.tva_rate ?? 20,
        payment_terms_days: tenant.payment_terms_days ?? 30,
        logo_url: tenant.logo_url ?? "",
      });
    }
  }, [tenant]);

  const saveMutation = useMutation({
    mutationFn: async (input: TenantInput) => {
      if (!tenant) throw new Error("Entreprise introuvable");
      const { error: updateError } = await supabase.from("tenants").update(input).eq("id", tenant.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    saveMutation.mutate(form);
  }

  async function handleLogoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !tenant) return;

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
      const ext = file.type === "image/png" ? "png" : "jpg";
      const path = `${tenant.id}/logo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("logos").getPublicUrl(path);
      const logoUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("tenants")
        .update({ logo_url: logoUrl })
        .eq("id", tenant.id);
      if (updateError) throw updateError;

      setForm((prev) => ({ ...prev, logo_url: logoUrl }));
      queryClient.invalidateQueries({ queryKey: ["tenant"] });
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Échec de l'envoi du logo");
    } finally {
      setUploadingLogo(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-navy">Réglages</h1>
      <p className="mt-1 text-sm text-gray">
        Ces informations apparaissent sur vos devis et factures.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 flex flex-col gap-3 rounded-xl border border-line bg-white p-6 max-w-lg"
      >
        <label className="text-xs font-medium text-gray">Nom de l'entreprise</label>
        <input
          type="text"
          required
          value={form.name ?? ""}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          className="rounded-md border border-line px-3 py-2 text-sm"
        />

        <label className="text-xs font-medium text-gray">SIRET</label>
        <input
          type="text"
          value={form.siret ?? ""}
          onChange={(e) => setForm((prev) => ({ ...prev, siret: e.target.value }))}
          className="rounded-md border border-line px-3 py-2 text-sm"
        />

        <label className="text-xs font-medium text-gray">Adresse</label>
        <input
          type="text"
          value={form.address ?? ""}
          onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
          className="rounded-md border border-line px-3 py-2 text-sm"
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray">Email</label>
            <input
              type="email"
              value={form.email ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              className="rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray">Téléphone</label>
            <input
              type="tel"
              value={form.phone ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              className="rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>
        </div>

        <label className="text-xs font-medium text-gray">IBAN</label>
        <input
          type="text"
          value={form.iban ?? ""}
          onChange={(e) => setForm((prev) => ({ ...prev, iban: e.target.value }))}
          className="rounded-md border border-line px-3 py-2 text-sm"
        />

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray">Régime TVA</label>
            <select
              value={form.tva_regime}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, tva_regime: e.target.value as "franchise" | "reel" }))
              }
              className="rounded-md border border-line px-3 py-2 text-sm"
            >
              <option value="franchise">Franchise en base</option>
              <option value="reel">Réel</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray">Taux TVA (%)</label>
            <input
              type="number"
              step="0.01"
              disabled={form.tva_regime === "franchise"}
              value={form.tva_rate ?? 20}
              onChange={(e) => setForm((prev) => ({ ...prev, tva_rate: Number(e.target.value) }))}
              className="rounded-md border border-line px-3 py-2 text-sm disabled:opacity-50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray">Délai paiement (j)</label>
            <input
              type="number"
              value={form.payment_terms_days ?? 30}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, payment_terms_days: Number(e.target.value) }))
              }
              className="rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>
        </div>

        <label className="text-xs font-medium text-gray">Logo</label>
        <div className="flex items-center gap-4">
          {form.logo_url ? (
            <img
              src={form.logo_url}
              alt="Logo"
              className="h-14 w-14 rounded-md border border-line object-contain p-1"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-line text-xs text-gray">
              Aucun
            </div>
          )}
          <div className="flex flex-col gap-1">
            <input
              type="file"
              accept="image/png,image/jpeg"
              disabled={uploadingLogo}
              onChange={handleLogoUpload}
              className="text-sm"
            />
            <p className="text-xs text-gray">PNG ou JPG, 2 Mo max.</p>
            {uploadingLogo && <p className="text-xs text-gray">Envoi en cours…</p>}
            {logoError && <p className="text-xs text-red-600">{logoError}</p>}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-emerald-600">Enregistré.</p>}

        <button
          type="submit"
          disabled={saveMutation.isPending}
          className="mt-2 rounded-md bg-electric px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
        >
          {saveMutation.isPending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>
    </div>
  );
}
