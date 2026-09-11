-- Régénérer la facture d'un devis (après une suppression accidentelle, via le bouton
-- "Régénérer la facture" sur Devis, ou via "Générer depuis un devis accepté" sur Factures) ne
-- doit pas compter comme une nouvelle création pour la limite mensuelle : le tenant avait déjà
-- créé cette facture une première fois (déjà comptée), il ne fait que la récupérer. On marque le
-- devis dès la première facture générée, et le trigger ne recompte plus les générations suivantes
-- pour ce même devis.

alter table public.devis add column facture_deja_generee boolean not null default false;

create or replace function public.increment_usage_factures() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  already_counted boolean := false;
begin
  if new.devis_id is not null then
    select facture_deja_generee into already_counted from public.devis where id = new.devis_id;
  end if;

  if not coalesce(already_counted, false) then
    insert into public.usage_mensuel (tenant_id, annee_mois, factures_creees)
    values (new.tenant_id, to_char(new.created_at, 'YYYY-MM'), 1)
    on conflict (tenant_id, annee_mois) do update set factures_creees = usage_mensuel.factures_creees + 1;
  end if;

  if new.devis_id is not null then
    update public.devis set facture_deja_generee = true where id = new.devis_id;
  end if;

  return new;
end;
$$;
