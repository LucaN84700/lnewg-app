-- Barème de relance configurable : par défaut au niveau du tenant, avec option de
-- personnalisation par client. Plus de limite à 3 niveaux (J+1/15/30 fixes) : l'entreprise
-- choisit ses propres paliers (ex: J+3, J+10, J+15, J+60, J+90). Ajoute aussi un interrupteur
-- pour désactiver l'envoi automatique quotidien et ne relancer que manuellement si souhaité.

alter table tenants add column relance_schedule_jours int[] not null default '{1,15,30}';
alter table tenants add column relances_auto_enabled boolean not null default true;

alter table clients add column relance_schedule_jours int[];

alter table relances drop constraint relances_niveau_check;
alter table relances add constraint relances_niveau_check check (niveau > 0);
