-- Tableau de capacités (unités de mesure) : chaque tenant coche les unités qu'il utilise
-- réellement (m2, u, h, jour...) ; ce jeu d'unités alimente le sélecteur d'unité du catalogue
-- au lieu d'un champ texte libre. Toutes cochées par défaut pour ne rien casser à l'existant.

alter table tenants add column unites_actives text[] not null default array[
  'm2', 'm3', 'm', 'cm', 'mm', 'km', 'ml', 't', 'kg', 'l', 'u', 'h', 'jour', 'forfait'
];
