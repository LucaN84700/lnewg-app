-- Numérotation devis/factures : format AAAA-CODECLIENT-D01 / F01, remis à zéro chaque année.

alter table numbering_counters add column year int not null default extract(year from current_date)::int;
alter table numbering_counters drop constraint numbering_counters_pkey;
alter table numbering_counters add primary key (tenant_id, client_id, doc_type, year);

create or replace function get_next_document_number(p_client_id uuid, p_doc_type text)
returns int language plpgsql security definer
set search_path = public
as $$
declare v_tenant_id uuid; v_next int; v_year int := extract(year from current_date)::int;
begin
  select tenant_id into v_tenant_id from public.clients where id = p_client_id;

  insert into public.numbering_counters (tenant_id, client_id, doc_type, year, last_number)
  values (v_tenant_id, p_client_id, p_doc_type, v_year, 1)
  on conflict (tenant_id, client_id, doc_type, year)
  do update set last_number = numbering_counters.last_number + 1
  returning last_number into v_next;

  return v_next;
end; $$;
