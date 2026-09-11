import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient";
import { resizeImageFile } from "../../lib/image";
import { UNITES_DISPONIBLES } from "../../lib/unites";
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
  accent_color_hex: "",
  accent_color_secondary_hex: "",
  unites_actives: UNITES_DISPONIBLES.map((u) => u.code),
  unites_personnalisees: [],
};

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TenantInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [newUnite, setNewUnite] = useState("");

  const { data: tenant, isLoading } = useQuery({
    queryKey: ["tenant"],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase.from("tenants").select("*").single();
      if (fetchError) throw fetchError;
      return data as Tenant;
    },
  });

  const isMaster = tenant?.plan === "master";

  // ne synchronise le formulaire depuis le serveur qu'une seule fois : sans ce garde-fou, le
  // refetch de ['tenant'] déclenché par l'upload du logo (entre autres) écraserait
  // silencieusement les autres champs si l'utilisateur était en train de les modifier
  const initialized = useRef(false);
  useEffect(() => {
    if (tenant && !initialized.current) {
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
        accent_color_hex: tenant.accent_color_hex ?? "",
        accent_color_secondary_hex: tenant.accent_color_secondary_hex ?? "",
        unites_actives: tenant.unites_actives,
        unites_personnalisees: tenant.unites_personnalisees,
      });
      initialized.current = true;
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
    if (form.accent_color_hex && !HEX_COLOR_RE.test(form.accent_color_hex)) {
      setError("Couleur d'accent invalide (format attendu : #RRGGBB).");
      return;
    }
    if (form.accent_color_secondary_hex && !HEX_COLOR_RE.test(form.accent_color_secondary_hex)) {
      setError("Couleur secondaire invalide (format attendu : #RRGGBB).");
      return;
    }
    saveMutation.mutate(form);
  }

  function toggleUnite(code: string) {
    setForm((prev) => {
      const current = prev.unites_actives ?? [];
      const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
      return { ...prev, unites_actives: next };
    });
  }

  function addUnitePersonnalisee() {
    const value = newUnite.trim();
    if (!value) return;
    setForm((prev) => {
      const current = prev.unites_personnalisees ?? [];
      if (current.includes(value)) return prev;
      return { ...prev, unites_personnalisees: [...current, value] };
    });
    setNewUnite("");
  }

  function removeUnitePersonnalisee(value: string) {
    setForm((prev) => ({
      ...prev,
      unites_personnalisees: (prev.unites_personnalisees ?? []).filter((u) => u !== value),
    }));
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
      const resized = await resizeImageFile(file);
      const ext = resized.type === "image/png" ? "png" : "jpg";
      const path = `${tenant.id}/logo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(path, resized, { upsert: true, contentType: resized.type });
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

        <label className="text-xs font-medium text-gray">Unités de mesure utilisées</label>
        <p className="-mt-2 text-xs text-gray">
          Cochez les unités que vous utilisez : elles alimentent la liste proposée dans le catalogue.
        </p>
        <div className="rounded-md border border-line p-3">
          <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 sm:grid-cols-4">
            {UNITES_DISPONIBLES.map((u) => (
              <label key={u.code} className="flex items-center gap-2 text-sm text-navy">
                <input
                  type="checkbox"
                  checked={(form.unites_actives ?? []).includes(u.code)}
                  onChange={() => toggleUnite(u.code)}
                  className="h-3.5 w-3.5 rounded border-line"
                />
                {u.label}
              </label>
            ))}
          </div>
          <div className="mt-2 border-t border-line pt-2">
            <p className="text-sm font-medium text-navy">Autre</p>
            <p className="text-xs text-gray">
              Ajoutez autant d'unités personnalisées que nécessaire (ex : sac, palette, rouleau…).
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="text"
                placeholder="Nouvelle unité…"
                value={newUnite}
                onChange={(e) => setNewUnite(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addUnitePersonnalisee();
                  }
                }}
                className="w-full max-w-xs rounded-md border border-line px-3 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={addUnitePersonnalisee}
                className="rounded-md border border-line px-3 py-1.5 text-sm font-semibold text-navy"
              >
                Ajouter
              </button>
            </div>
            {(form.unites_personnalisees ?? []).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(form.unites_personnalisees ?? []).map((u) => (
                  <span
                    key={u}
                    className="flex items-center gap-1.5 rounded-full border border-line bg-bg-light px-2.5 py-1 text-xs text-navy"
                  >
                    {u}
                    <button
                      type="button"
                      title={`Supprimer "${u}"`}
                      onClick={() => removeUnitePersonnalisee(u)}
                      className="text-gray hover:text-red-600"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
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

        <label className="text-xs font-medium text-gray">
          Couleurs des documents{" "}
          <span className="rounded bg-electric/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-navy">
            Master
          </span>
        </label>
        {isMaster ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.accent_color_hex && HEX_COLOR_RE.test(form.accent_color_hex) ? form.accent_color_hex : "#0a1f44"}
                onChange={(e) => setForm((prev) => ({ ...prev, accent_color_hex: e.target.value }))}
                className="h-9 w-14 cursor-pointer rounded-md border border-line p-1"
              />
              <input
                type="text"
                placeholder="#0A1F44"
                value={form.accent_color_hex ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, accent_color_hex: e.target.value }))}
                className="w-32 rounded-md border border-line px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray">Couleur 1 : bandeau et en-têtes (fonds pleins).</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={
                  form.accent_color_secondary_hex && HEX_COLOR_RE.test(form.accent_color_secondary_hex)
                    ? form.accent_color_secondary_hex
                    : "#e8f0fe"
                }
                onChange={(e) => setForm((prev) => ({ ...prev, accent_color_secondary_hex: e.target.value }))}
                className="h-9 w-14 cursor-pointer rounded-md border border-line p-1"
              />
              <input
                type="text"
                placeholder="#E8F0FE"
                value={form.accent_color_secondary_hex ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, accent_color_secondary_hex: e.target.value }))}
                className="w-32 rounded-md border border-line px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray">
                Couleur 2 : panneaux et total TTC. Toujours appliquée en fond très éclairci (teinte
                pastel), quelle que soit la teinte choisie.
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({ ...prev, accent_color_hex: "", accent_color_secondary_hex: "" }))
                }
                className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-navy"
              >
                Par défaut
              </button>
              <p className="mt-1 text-xs text-gray">
                Réinitialise les deux couleurs : mêmes couleurs que sur le plan Starter.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray">
            Personnalisez les couleurs de vos devis et factures avec le plan Master.{" "}
            <a href="/billing" className="text-electric-dark">Découvrir</a>
          </p>
        )}

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
