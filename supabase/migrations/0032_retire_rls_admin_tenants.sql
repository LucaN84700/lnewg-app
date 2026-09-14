-- Retire les policies "platform admin reads/updates all tenants" ajoutées en 0030 : en donnant à
-- l'admin le droit de SELECT sur tous les tenants, elles cassaient toute requête app
-- `.from("tenants").select("*").single()` (utilisée partout — AppShell, Réglages, Abonnement,
-- Devis, Factures...) pour le compte admin lui-même, puisque single() plante dès que la RLS
-- laisse remonter plus d'une ligne. La liste/le blocage cross-tenant passe désormais par des
-- edge functions dédiées (service_role, vérifiant is_platform_admin côté serveur) au lieu de
-- RLS côté client — voir admin-list-tenants et admin-set-tenant-block.

drop policy if exists "platform admin reads all tenants" on public.tenants;
drop policy if exists "platform admin updates all tenants" on public.tenants;
