-- Style de fond pour les PDF devis/facture (plan Master) : "plein" = bandeau/en-têtes en
-- couleur d'accent pleine (comportement actuel), "clair" = même couleur mais éclaircie en
-- teinte pastel (comme les encarts ÉMIS PAR/CLIENT et la cellule Total TTC déjà en place).

alter table tenants add column accent_style text not null default 'plein'
  check (accent_style in ('plein', 'clair'));
