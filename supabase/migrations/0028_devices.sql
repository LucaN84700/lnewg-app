-- Phase B du multi-utilisateurs : appareils connectés, comptés par tenant indépendamment des
-- utilisateurs (un même utilisateur peut avoir plusieurs appareils). Jeton généré côté client et
-- stocké en localStorage : un appareil reste compté même après déconnexion, seule une révocation
-- manuelle par le owner libère la place (voir edge functions register-device / revoke-device).

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  device_token text not null,
  label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (tenant_id, device_token)
);

alter table public.devices enable row level security;

create policy "tenant isolation" on public.devices for select using (tenant_id = public.current_tenant_id());

grant select on public.devices to authenticated;
grant select, insert, update, delete on public.devices to service_role;
