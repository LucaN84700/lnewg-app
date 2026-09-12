import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { functionErrorMessage, supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../hooks/useAuth";
import { RUBRIQUES, type RubriqueField } from "../../lib/permissions";
import type { Plan, Profile, Tenant } from "../../types/database";

const emptyForm = { email: "", password: "", full_name: "" };

export default function TeamSection() {
  const queryClient = useQueryClient();
  const { isOwner } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const { data: tenant } = useQuery({
    queryKey: ["tenant"],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase.from("tenants").select("*").single();
      if (fetchError) throw fetchError;
      return data as Tenant;
    },
  });

  const { data: plan } = useQuery({
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

  const { data: members } = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at");
      if (fetchError) throw fetchError;
      return data as Profile[];
    },
  });

  const seatLimit = (plan?.seat_limit ?? 1) + (tenant?.extra_seats ?? 0);
  const currentSeats = members?.length ?? 0;
  const limitReached = currentSeats >= seatLimit;

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error: invokeError } = await supabase.functions.invoke("create-team-member", {
        body: form,
      });
      if (invokeError) throw new Error(await functionErrorMessage(invokeError));
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      setForm(emptyForm);
      setShowForm(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { data, error: invokeError } = await supabase.functions.invoke("remove-team-member", {
        body: { member_id: memberId },
      });
      if (invokeError) throw new Error(await functionErrorMessage(invokeError));
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-members"] }),
    onError: (err: Error) => alert(err.message),
  });

  const permissionMutation = useMutation({
    mutationFn: async ({
      memberId,
      field,
      value,
    }: {
      memberId: string;
      field: RubriqueField;
      value: boolean;
    }) => {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ [field]: value })
        .eq("id", memberId);
      if (updateError) throw updateError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-members"] }),
    onError: (err: Error) => alert(err.message),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    createMutation.mutate();
  }

  function handleRemove(member: Profile) {
    if (confirm(`Retirer ${member.full_name ?? member.email} du compte ? Cette action est irréversible.`)) {
      removeMutation.mutate(member.id);
    }
  }

  if (!isOwner) return null;

  return (
    <div className="mt-6 rounded-xl border border-line bg-white p-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-navy">Équipe</h2>
        <p className="text-xs text-gray">
          {currentSeats} / {seatLimit} utilisateur{seatLimit > 1 ? "s" : ""}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {members?.map((member) => (
          <div key={member.id} className="rounded-md border border-line p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-navy">
                  {member.full_name ?? "—"}
                  {member.role === "owner" && (
                    <span className="ml-1.5 rounded bg-electric/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-navy">
                      Propriétaire
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray">{member.email}</div>
              </div>
              {member.role !== "owner" && (
                <button
                  type="button"
                  onClick={() => handleRemove(member)}
                  disabled={removeMutation.isPending}
                  className="text-xs font-semibold text-red-600 disabled:opacity-50"
                >
                  Retirer
                </button>
              )}
            </div>

            {member.role !== "owner" && (
              <div className="mt-3 grid grid-cols-2 gap-y-1.5 gap-x-4 border-t border-line pt-3 sm:grid-cols-4">
                {RUBRIQUES.map(({ field, label }) => (
                  <label key={field} className="flex items-center gap-1.5 text-xs text-navy">
                    <input
                      type="checkbox"
                      disabled={permissionMutation.isPending}
                      checked={member[field]}
                      onChange={(e) =>
                        permissionMutation.mutate({ memberId: member.id, field, value: e.target.checked })
                      }
                      className="h-3.5 w-3.5 rounded border-line disabled:opacity-50"
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {showForm ? (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2 rounded-md border border-line p-4">
          <label className="text-xs font-medium text-gray">Nom</label>
          <input
            type="text"
            required
            value={form.full_name}
            onChange={(e) => setForm((prev) => ({ ...prev, full_name: e.target.value }))}
            className="rounded-md border border-line px-3 py-2 text-sm"
          />
          <label className="text-xs font-medium text-gray">Email</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            className="rounded-md border border-line px-3 py-2 text-sm"
          />
          <label className="text-xs font-medium text-gray">Mot de passe temporaire</label>
          <input
            type="text"
            required
            minLength={6}
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            className="rounded-md border border-line px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="mt-2 flex gap-2">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="rounded-md bg-electric px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
            >
              {createMutation.isPending ? "Création…" : "Créer l'utilisateur"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
              className="rounded-md border border-line px-4 py-2 text-sm font-semibold text-navy"
            >
              Annuler
            </button>
          </div>
        </form>
      ) : limitReached ? (
        <p className="mt-4 rounded-md border border-line bg-bg-light p-3 text-sm text-gray">
          Limite de {seatLimit} utilisateur{seatLimit > 1 ? "s" : ""} atteinte pour votre forfait.{" "}
          <Link to="/billing" className="text-electric-dark">
            Voir les options
          </Link>
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mt-4 rounded-md border border-line px-4 py-2 text-sm font-semibold text-navy"
        >
          + Ajouter un utilisateur
        </button>
      )}
    </div>
  );
}
