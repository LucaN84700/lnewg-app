-- Numérotation atomique par tenant + client + type de document
create or replace function get_next_document_number(p_client_id uuid, p_doc_type text)
returns int language plpgsql security definer as $$
declare v_tenant_id uuid; v_next int;
begin
  select tenant_id into v_tenant_id from clients where id = p_client_id;

  insert into numbering_counters (tenant_id, client_id, doc_type, last_number)
  values (v_tenant_id, p_client_id, p_doc_type, 1)
  on conflict (tenant_id, client_id, doc_type)
  do update set last_number = numbering_counters.last_number + 1
  returning last_number into v_next;

  return v_next;
end; $$;

-- À l'inscription : crée automatiquement un tenant + un profil pour le nouvel utilisateur
-- Le nom de l'entreprise doit être passé dans les metadata du signup (company_name)
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
declare v_tenant_id uuid;
begin
  insert into tenants (name)
  values (coalesce(new.raw_user_meta_data->>'company_name', 'Mon entreprise'))
  returning id into v_tenant_id;

  insert into profiles (id, tenant_id, full_name, role)
  values (new.id, v_tenant_id, new.raw_user_meta_data->>'full_name', 'owner');

  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
