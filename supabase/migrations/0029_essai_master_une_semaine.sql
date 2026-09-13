-- Semaine d'essai offerte en Master pour toute nouvelle inscription : le tenant démarre en
-- plan Master (au lieu de Starter) pendant 7 jours, pour découvrir toutes les fonctionnalités
-- avant de choisir un forfait. Ne s'applique qu'à la création d'un tout nouveau tenant, jamais
-- à un coéquipier invité qui rejoint un tenant existant (voir invited_tenant_id, migration 0022).
-- Le retour automatique en Starter à la fin de la semaine est géré par l'edge function
-- downgrade-expired-trials (cron quotidien), pas ici.

alter table public.tenants add column trial_ends_at timestamptz;

create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_invited_tenant_id uuid;
begin
  v_invited_tenant_id := (new.raw_user_meta_data->>'invited_tenant_id')::uuid;

  if v_invited_tenant_id is not null then
    insert into public.profiles (id, tenant_id, full_name, role)
    values (new.id, v_invited_tenant_id, new.raw_user_meta_data->>'full_name', 'member');
  else
    insert into public.tenants (name, plan, trial_ends_at)
    values (
      coalesce(new.raw_user_meta_data->>'company_name', 'Mon entreprise'),
      'master',
      now() + interval '7 days'
    )
    returning id into v_tenant_id;

    insert into public.profiles (id, tenant_id, full_name, role)
    values (new.id, v_tenant_id, new.raw_user_meta_data->>'full_name', 'owner');
  end if;

  return new;
end; $$;
