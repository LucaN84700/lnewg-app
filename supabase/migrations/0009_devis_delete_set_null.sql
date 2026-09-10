-- Un devis déjà transformé en facture ne devrait pas être bloqué à la suppression : la facture
-- est le document qui fait foi une fois émise, le devis n'a plus qu'une valeur de traçabilité.
-- On passe donc factures.devis_id en ON DELETE SET NULL au lieu de bloquer (NO ACTION).
-- Les liens client_id (clients -> devis/factures) restent en RESTRICT : on ne veut jamais
-- perdre silencieusement l'historique comptable d'un client en le supprimant.

alter table factures drop constraint factures_devis_id_fkey;
alter table factures add constraint factures_devis_id_fkey
  foreign key (devis_id) references devis(id) on delete set null;
