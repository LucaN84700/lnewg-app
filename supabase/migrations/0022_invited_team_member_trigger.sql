-- handle_new_user() créait jusqu'ici systématiquement un NOUVEAU tenant à chaque insertion dans
-- auth.users. Ça casse la création de coéquipiers (create-team-member utilise
-- supabase.auth.admin.createUser, qui insère aussi dans auth.users et déclenche ce trigger) : le
-- nouveau membre se serait retrouvé avec son propre tenant au lieu de rejoindre celui du patron.
-- On passe désormais 'invited_tenant_id' dans les métadonnées pour ce cas précis, et le membre
-- rejoint ce tenant avec role='member' au lieu de créer un tenant avec role='owner'.

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
    insert into public.tenants (name)
    values (coalesce(new.raw_user_meta_data->>'company_name', 'Mon entreprise'))
    returning id into v_tenant_id;

    insert into public.profiles (id, tenant_id, full_name, role)
    values (new.id, v_tenant_id, new.raw_user_meta_data->>'full_name', 'owner');
  end if;

  return new;
end; $$;
