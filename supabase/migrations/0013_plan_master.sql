-- Palier Master (119,99€/mois) : comptabilité exportable + couleur d'accent personnalisée
-- sur les PDF. "scale" n'a jamais été utilisé en pratique (repricing Phase 7/8), remplacé.

alter table tenants drop constraint tenants_plan_check;
alter table tenants add constraint tenants_plan_check
  check (plan in ('starter','pro','master','enterprise'));

alter table tenants add column accent_color_hex text;
