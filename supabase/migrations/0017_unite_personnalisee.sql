-- Permet à un tenant de définir une unité de mesure "autre", non couverte par la liste
-- standard (unites_actives), pour l'ajouter au sélecteur d'unité du catalogue.

alter table tenants add column unite_personnalisee text;
