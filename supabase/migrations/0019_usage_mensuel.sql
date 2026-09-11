-- Compteur d'usage mensuel infalsifiable : le nombre de devis/factures affiché (et utilisé pour
-- appliquer la limite du plan Starter) comptait jusqu'ici les lignes existantes du mois
-- (`count(*) where created_at >= début du mois`), donc supprimer un devis faisait redescendre
-- le compteur — un tenant malveillant pouvait ainsi créer/supprimer en boucle pour dépasser la
-- limite. Ce compteur s'incrémente uniquement à la création (trigger AFTER INSERT) et ne baisse
-- jamais, y compris si le document est supprimé ensuite.

create table public.usage_mensuel (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  annee_mois text not null,
  devis_crees integer not null default 0,
  factures_creees integer not null default 0,
  primary key (tenant_id, annee_mois)
);

alter table public.usage_mensuel enable row level security;

create policy "tenant isolation" on public.usage_mensuel for select using (tenant_id = public.current_tenant_id());

grant select on public.usage_mensuel to authenticated;

create or replace function public.increment_usage_devis() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.usage_mensuel (tenant_id, annee_mois, devis_crees)
  values (new.tenant_id, to_char(new.created_at, 'YYYY-MM'), 1)
  on conflict (tenant_id, annee_mois) do update set devis_crees = usage_mensuel.devis_crees + 1;
  return new;
end;
$$;

create trigger trg_increment_usage_devis
  after insert on public.devis
  for each row execute function public.increment_usage_devis();

create or replace function public.increment_usage_factures() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.usage_mensuel (tenant_id, annee_mois, factures_creees)
  values (new.tenant_id, to_char(new.created_at, 'YYYY-MM'), 1)
  on conflict (tenant_id, annee_mois) do update set factures_creees = usage_mensuel.factures_creees + 1;
  return new;
end;
$$;

create trigger trg_increment_usage_factures
  after insert on public.factures
  for each row execute function public.increment_usage_factures();

-- Limite de factures par mois, en miroir de devis_limit_per_month (même plafond que les devis
-- pour le plan Starter, illimité pour Pro/Master).
alter table public.plans add column factures_limit_per_month integer;
update public.plans set factures_limit_per_month = devis_limit_per_month;
