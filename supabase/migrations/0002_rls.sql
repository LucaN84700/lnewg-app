-- Row Level Security : isolation stricte entre tenants

create or replace function public.current_tenant_id() returns uuid
language sql stable security definer as $$
  select tenant_id from profiles where id = auth.uid()
$$;

alter table tenants enable row level security;
alter table profiles enable row level security;
alter table clients enable row level security;
alter table devis enable row level security;
alter table factures enable row level security;
alter table relances enable row level security;
alter table numbering_counters enable row level security;

create policy "own tenant only" on tenants for select using (id = public.current_tenant_id());
create policy "own tenant update" on tenants for update using (id = public.current_tenant_id());

create policy "own profile" on profiles for select using (id = auth.uid());

create policy "tenant isolation" on clients for all using (tenant_id = public.current_tenant_id());
create policy "tenant isolation" on devis for all using (tenant_id = public.current_tenant_id());
create policy "tenant isolation" on factures for all using (tenant_id = public.current_tenant_id());
create policy "tenant isolation" on relances for all using (tenant_id = public.current_tenant_id());
create policy "tenant isolation" on numbering_counters for all using (tenant_id = public.current_tenant_id());

-- app_settings et plans : lecture publique (pas de données sensibles), pas d'écriture via l'API
alter table app_settings enable row level security;
alter table plans enable row level security;
create policy "public read" on app_settings for select using (true);
create policy "public read" on plans for select using (true);
