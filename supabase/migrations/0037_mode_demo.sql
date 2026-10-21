-- Mode démo : un tenant public, permanent, avec des données d'exemple, où les visiteurs du
-- site peuvent explorer la vraie interface mais ne peuvent jamais créer, modifier ni supprimer
-- quoi que ce soit (bloqué au niveau base, pas seulement caché côté interface — donc valable
-- même si quelqu'un appelle l'API Supabase directement depuis les outils de dev du navigateur).

alter table public.tenants add column if not exists is_demo boolean not null default false;

create or replace function public.is_demo_tenant() returns boolean
language sql stable security definer as $$
  select coalesce((select is_demo from tenants where id = public.current_tenant_id()), false)
$$;

-- tenants : le tenant démo lui-même ne peut jamais être modifié par sa propre session
drop policy if exists "own tenant update" on public.tenants;
create policy "own tenant update" on public.tenants
  for update
  using (id = public.current_tenant_id() and not is_demo)
  with check (id = public.current_tenant_id() and not is_demo);

-- clients, devis, factures, relances, catalogue_articles : la police "tenant isolation" (ALL)
-- est remplacée par une lecture ouverte + une écriture bloquée pour le tenant démo.
do $$
declare
  t text;
begin
  foreach t in array array['clients', 'devis', 'factures', 'relances', 'catalogue_articles'] loop
    execute format('drop policy if exists "tenant isolation" on public.%I', t);
    execute format(
      'create policy "tenant read" on public.%I for select using (tenant_id = public.current_tenant_id())',
      t
    );
    execute format(
      'create policy "tenant insert" on public.%I for insert with check (tenant_id = public.current_tenant_id() and not public.is_demo_tenant())',
      t
    );
    execute format(
      'create policy "tenant update" on public.%I for update using (tenant_id = public.current_tenant_id() and not public.is_demo_tenant()) with check (tenant_id = public.current_tenant_id() and not public.is_demo_tenant())',
      t
    );
    execute format(
      'create policy "tenant delete" on public.%I for delete using (tenant_id = public.current_tenant_id() and not public.is_demo_tenant())',
      t
    );
  end loop;
end $$;

-- numbering_counters : même tenant isolation ALL, mais c'est une table purement interne
-- (jamais lue/affichée) — on bloque juste l'écriture pour le tenant démo par cohérence.
drop policy if exists "tenant isolation" on public.numbering_counters;
create policy "tenant read" on public.numbering_counters
  for select using (tenant_id = public.current_tenant_id());
create policy "tenant insert" on public.numbering_counters
  for insert with check (tenant_id = public.current_tenant_id() and not public.is_demo_tenant());
create policy "tenant update" on public.numbering_counters
  for update using (tenant_id = public.current_tenant_id() and not public.is_demo_tenant())
  with check (tenant_id = public.current_tenant_id() and not public.is_demo_tenant());
