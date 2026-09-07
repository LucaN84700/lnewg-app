-- Les policies RLS ne suffisent pas : Postgres exige aussi des GRANT explicites
-- au niveau table pour que le rôle authenticated puisse même tenter d'y accéder.

grant usage on schema public to authenticated, anon;

grant select, update on tenants to authenticated;
grant select on profiles to authenticated;
grant select, insert, update, delete on clients to authenticated;
grant select, insert, update, delete on devis to authenticated;
grant select, insert, update, delete on factures to authenticated;
grant select, insert, update, delete on relances to authenticated;
grant select, insert, update on numbering_counters to authenticated;

grant select on plans to authenticated, anon;
grant select on app_settings to authenticated, anon;

grant execute on function public.current_tenant_id() to authenticated;
grant execute on function get_next_document_number(uuid, text) to authenticated;
