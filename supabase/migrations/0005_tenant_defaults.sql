-- tenant_id est automatiquement rempli à partir de l'utilisateur connecté :
-- le frontend n'a jamais besoin de le préciser à la création d'un enregistrement.

alter table clients alter column tenant_id set default public.current_tenant_id();
alter table devis alter column tenant_id set default public.current_tenant_id();
alter table factures alter column tenant_id set default public.current_tenant_id();
alter table relances alter column tenant_id set default public.current_tenant_id();
