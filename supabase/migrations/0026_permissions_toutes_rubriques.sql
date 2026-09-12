-- Étend le système de permissions par rubrique (migration 0021) à toutes les rubriques métier,
-- au lieu des 3 seules (comptabilité/factures/montants) existantes. Réglages et Abonnement restent
-- volontairement hors de ce système : ce sont des rubriques d'administration du compte, toujours
-- réservées au owner, jamais togglables.
--
-- "default false" verrouille aussi les coéquipiers déjà créés, décision assumée : leur accès à ces
-- rubriques (aujourd'hui ouvert sans aucun contrôle) repart à zéro tant que le owner ne le
-- réactive pas explicitement depuis Réglages > Équipe.
alter table public.profiles add column can_view_dashboard boolean not null default false;
alter table public.profiles add column can_view_clients boolean not null default false;
alter table public.profiles add column can_view_catalogue boolean not null default false;
alter table public.profiles add column can_view_devis boolean not null default false;
alter table public.profiles add column can_view_relances boolean not null default false;
