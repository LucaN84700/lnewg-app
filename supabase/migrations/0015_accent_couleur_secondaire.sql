-- Remplace le choix "fond plein / fond clair" (une seule couleur, deux rendus dérivés) par
-- deux couleurs indépendantes que le tenant choisit lui-même : accent_color_hex (couleur 1,
-- fonds pleins : bandeau, en-têtes) et accent_color_secondary_hex (couleur 2, fonds clairs :
-- panneaux teintés, cellule Total TTC). Retour utilisateur : la bascule plein/clair sur UNE
-- couleur ne donnait pas assez de contrôle ; il veut choisir les deux couleurs lui-même.

alter table tenants drop column accent_style;
alter table tenants add column accent_color_secondary_hex text;
