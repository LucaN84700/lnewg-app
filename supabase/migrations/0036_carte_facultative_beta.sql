-- Un code bêta est un cadeau (3 semaines offertes) : pas de carte bancaire exigée à l'inscription
-- pour ces comptes, contrairement aux inscriptions standard (requires_card_setup=true depuis la
-- migration 0033). Le blocage en fin d'essai reste inchangé et s'applique quand même à tous les
-- comptes (bêta compris) : ProtectedRoute.tsx bloque dès que trial_ends_at est dépassé ET qu'il
-- n'y a pas d'abonnement Stripe actif, indépendamment de requires_card_setup — donc un compte
-- bêta qui arrive en fin des 3 semaines est bien bloqué et ne peut repartir qu'en payant un
-- forfait (ce qui implique forcément d'entrer une carte à ce moment-là).

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_tenant_id uuid;
  v_invited_tenant_id uuid;
  v_beta_code text;
  v_trial_days integer := 7;
begin
  v_invited_tenant_id := (new.raw_user_meta_data->>'invited_tenant_id')::uuid;

  if v_invited_tenant_id is not null then
    insert into public.profiles (id, tenant_id, full_name, role, email)
    values (new.id, v_invited_tenant_id, new.raw_user_meta_data->>'full_name', 'member', new.email);
  else
    v_beta_code := nullif(trim(new.raw_user_meta_data->>'beta_code'), '');

    if v_beta_code is not null then
      select trial_days into v_trial_days
      from public.beta_codes
      where code = v_beta_code and redeemed_at is null
      for update;

      if v_trial_days is null then
        v_trial_days := 7;
        v_beta_code := null;
      end if;
    end if;

    insert into public.tenants (name, plan, trial_ends_at, requires_card_setup)
    values (
      coalesce(new.raw_user_meta_data->>'company_name', 'Mon entreprise'),
      'master',
      now() + (v_trial_days || ' days')::interval,
      v_beta_code is null
    )
    returning id into v_tenant_id;

    if v_beta_code is not null then
      update public.beta_codes
      set redeemed_at = now(), redeemed_by_tenant_id = v_tenant_id
      where code = v_beta_code;
    end if;

    insert into public.profiles (id, tenant_id, full_name, role, email)
    values (new.id, v_tenant_id, new.raw_user_meta_data->>'full_name', 'owner', new.email);
  end if;

  return new;
end;
$function$;
