-- profiles n'avait pas d'email : impossible pour le patron d'identifier ses coéquipiers dans la
-- liste "Équipe" (seul full_name existait). On copie l'email depuis auth.users à la création.

alter table public.profiles add column email text;

update public.profiles p set email = u.email from auth.users u where u.id = p.id;

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
    insert into public.profiles (id, tenant_id, full_name, role, email)
    values (new.id, v_invited_tenant_id, new.raw_user_meta_data->>'full_name', 'member', new.email);
  else
    insert into public.tenants (name)
    values (coalesce(new.raw_user_meta_data->>'company_name', 'Mon entreprise'))
    returning id into v_tenant_id;

    insert into public.profiles (id, tenant_id, full_name, role, email)
    values (new.id, v_tenant_id, new.raw_user_meta_data->>'full_name', 'owner', new.email);
  end if;

  return new;
end; $$;
