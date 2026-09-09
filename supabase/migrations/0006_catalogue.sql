-- Catalogue de prestations réutilisables par tenant (différenciation vs concurrents
-- self-service génériques : chaque entreprise construit sa propre base de prix).

create table catalogue_articles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  description text not null,
  unite text not null default 'u',
  prix_unitaire_ht numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table catalogue_articles enable row level security;
create policy "tenant isolation" on catalogue_articles for all using (tenant_id = public.current_tenant_id());

grant select, insert, update, delete on catalogue_articles to authenticated;
grant select on catalogue_articles to service_role;

alter table catalogue_articles alter column tenant_id set default public.current_tenant_id();
