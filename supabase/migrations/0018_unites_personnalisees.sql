-- Remplace l'unité personnalisée unique par une liste, pour permettre à un tenant d'ajouter
-- plusieurs unités "autre" (ex: "sac", "palette", "rouleau") au lieu d'une seule à la fois.

alter table tenants drop column unite_personnalisee;
alter table tenants add column unites_personnalisees text[] not null default '{}';
