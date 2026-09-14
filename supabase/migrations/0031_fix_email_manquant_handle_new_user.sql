-- Corrige une régression introduite par les migrations 0029 et 0030 : chacune a recréé
-- handle_new_user() en repartant d'une version antérieure à la migration 0023, oubliant la
-- colonne email à chaque fois. Tout compte créé depuis (signups réels comme testeurs bêta) a un
-- profil sans email, ce qui casse l'affichage de l'équipe (Réglages > Équipe) entre autres.

update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;

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
