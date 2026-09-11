-- Phase A du multi-utilisateurs : rôles/permissions par employé, limites de sièges par forfait,
-- et traçabilité de qui a créé quel devis/facture.

alter table public.plans add column seat_limit integer;
alter table public.plans add column device_limit integer;
update public.plans set seat_limit = 1, device_limit = 1 where id = 'starter';
update public.plans set seat_limit = 2, device_limit = 3 where id = 'pro';
update public.plans set seat_limit = 3, device_limit = 5 where id = 'master';

alter table public.tenants add column extra_seats integer not null default 0;
alter table public.tenants add column extra_devices integer not null default 0;

-- Un "owner" (celui qui paie l'abonnement) a toujours tout, ces colonnes ne s'appliquent qu'aux
-- membres ('member') et sont ignorées côté UI pour un owner.
alter table public.profiles add column can_view_comptabilite boolean not null default false;
alter table public.profiles add column can_view_factures boolean not null default false;
alter table public.profiles add column can_view_montants boolean not null default false;

create or replace function public.current_user_role() returns text
language sql stable security definer as $$
  select role from public.profiles where id = auth.uid()
$$;

grant execute on function public.current_user_role() to authenticated;

-- Les coéquipiers doivent se voir dans la liste "Équipe" : select tenant-scope au lieu de
-- "seulement sa propre ligne".
drop policy if exists "own profile" on public.profiles;
create policy "tenant isolation" on public.profiles for select using (tenant_id = public.current_tenant_id());

-- Seul le owner peut modifier les permissions d'un coéquipier (jamais son propre rôle/tenant).
create policy "owner updates team permissions" on public.profiles for update
  using (tenant_id = public.current_tenant_id() and public.current_user_role() = 'owner')
  with check (tenant_id = public.current_tenant_id() and public.current_user_role() = 'owner');

grant update on public.profiles to authenticated;

-- Traçabilité : qui a créé le devis/la facture. "on delete set null" pour ne pas bloquer le
-- retrait d'un coéquipier qui a déjà créé des documents (l'historique reste, l'attribution
-- s'efface simplement).
alter table public.devis add column created_by uuid references public.profiles(id) on delete set null default auth.uid();
alter table public.factures add column created_by uuid references public.profiles(id) on delete set null default auth.uid();
