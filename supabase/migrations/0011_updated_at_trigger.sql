-- updated_at ne se mettait jamais à jour après la création (pas de trigger) : impossible de
-- savoir quand un devis a été accepté ou une facture payée. Nécessaire pour le tableau de bord
-- (activité récente).

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists devis_set_updated_at on devis;
create trigger devis_set_updated_at before update on devis
  for each row execute function set_updated_at();

drop trigger if exists factures_set_updated_at on factures;
create trigger factures_set_updated_at before update on factures
  for each row execute function set_updated_at();
