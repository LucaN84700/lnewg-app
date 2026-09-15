-- Essai Master avec carte bancaire obligatoire : la carte est enregistrée (sans débit) juste
-- après l'inscription, puis un email est envoyé ~2 jours avant la fin des 7 jours pour demander
-- confirmation avant de facturer réellement (voir stripe-save-card, stripe-confirm-trial,
-- trial-reminder-send). Ne s'applique qu'aux NOUVEAUX comptes (requires_card_setup, false par
-- défaut) pour ne jamais bloquer les comptes existants qui n'ont jamais eu cette étape — LNEWG,
-- Demo SaaS, les bêta-testeurs déjà inscrits, etc.

alter table public.tenants
  add column if not exists requires_card_setup boolean not null default false,
  add column if not exists trial_card_saved_at timestamptz,
  add column if not exists trial_followup_sent_at timestamptz;

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
      true
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

select cron.schedule(
  'trial-reminder-daily',
  '30 7 * * *',
  $cron$
  select net.http_post(
    url := 'https://ixdayyjhxspxfxjybtvg.supabase.co/functions/v1/trial-reminder-send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_B6ufdgZRkvr-3GASnaRU1w_2PAzd1-V',
      'x-cron-secret', '426060617b7bf5eeea949dbded5bb91ce3e08e007f3583b4'
    ),
    body := '{}'::jsonb
  );
  $cron$
);
