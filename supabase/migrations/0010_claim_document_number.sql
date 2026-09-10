-- Permet à une facture générée depuis un devis de reprendre exactement le même numéro de
-- séquence que ce devis (D01 -> F01), pour que les deux documents "concordent" visuellement.
-- Contrairement à get_next_document_number (auto-incrémente), celle-ci fixe le compteur à une
-- valeur précise si elle est supérieure à l'actuelle, pour qu'une future facture indépendante
-- (non issue d'un devis) ne réutilise jamais accidentellement ce même numéro.

create or replace function claim_document_number(p_client_id uuid, p_doc_type text, p_number int)
returns void language plpgsql security definer
set search_path = public
as $$
declare v_tenant_id uuid; v_year int := extract(year from current_date)::int;
begin
  select tenant_id into v_tenant_id from public.clients where id = p_client_id;

  insert into public.numbering_counters (tenant_id, client_id, doc_type, year, last_number)
  values (v_tenant_id, p_client_id, p_doc_type, v_year, p_number)
  on conflict (tenant_id, client_id, doc_type, year)
  do update set last_number = greatest(numbering_counters.last_number, excluded.last_number);
end; $$;

grant execute on function claim_document_number(uuid, text, int) to authenticated;
