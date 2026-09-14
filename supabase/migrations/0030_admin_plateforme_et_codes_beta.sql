-- Compte administrateur plateforme (Luca) : vue sur tous les tenants, statut d'abonnement, et
-- possibilité de bloquer l'accès d'un tenant qui n'a pas payé. Un seul flag booléen sur le
-- profil plutôt qu'un rôle séparé, pour rester simple (pas de hiérarchie de rôles prévue).
alter table public.profiles add column is_platform_admin boolean not null default false;

alter table public.tenants add column blocked_at timestamptz;
alter table public.tenants add column blocked_reason text;

create policy "platform admin reads all tenants" on public.tenants for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_platform_admin)
);

create policy "platform admin updates all tenants" on public.tenants for update using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_platform_admin)
);

-- Codes d'accès bêta : donnés à des testeurs pour prolonger leur semaine d'essai Master standard
-- (voir migration 0029) à une durée plus longue choisie par Luca, décomptée à partir de
-- l'activation du code (pas de sa création) — pour ne jamais avoir à regénérer des codes si un
-- testeur s'inscrit tard.
create table public.beta_codes (
  code text primary key,
  trial_days integer not null default 21,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by_tenant_id uuid references public.tenants(id) on delete set null
);

alter table public.beta_codes enable row level security;
-- Pas de policy select/insert pour authenticated : uniquement lu/écrit par handle_new_user()
-- (security definer) côté inscription, et par Luca via le service_role pour la génération.
grant select, insert, update on public.beta_codes to service_role;

create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_invited_tenant_id uuid;
  v_beta_code text;
  v_trial_days integer := 7;
begin
  v_invited_tenant_id := (new.raw_user_meta_data->>'invited_tenant_id')::uuid;

  if v_invited_tenant_id is not null then
    insert into public.profiles (id, tenant_id, full_name, role, email)
    values (new.id, v_invited_tenant_id, new.raw_user_meta_data->>'full_name', 'member', new.email);
  else
    v_beta_code := nullif(trim(new.raw_user_meta_data->>'beta_code'), '');

    if v_beta_code is not null then
      select trial_days into v_trial_days
      from public.beta_codes
      where code = v_beta_code and redeemed_at is null
      for update;

      if v_trial_days is null then
        v_trial_days := 7;
        v_beta_code := null;
      end if;
    end if;

    insert into public.tenants (name, plan, trial_ends_at)
    values (
      coalesce(new.raw_user_meta_data->>'company_name', 'Mon entreprise'),
      'master',
      now() + (v_trial_days || ' days')::interval
    )
    returning id into v_tenant_id;

    if v_beta_code is not null then
      update public.beta_codes
      set redeemed_at = now(), redeemed_by_tenant_id = v_tenant_id
      where code = v_beta_code;
    end if;

    insert into public.profiles (id, tenant_id, full_name, role, email)
    values (new.id, v_tenant_id, new.raw_user_meta_data->>'full_name', 'owner', new.email);
  end if;

  return new;
end; $$;
