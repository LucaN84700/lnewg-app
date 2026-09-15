-- Deux ajouts liés à l'abonnement payant (distinct de l'essai, voir migration 0033) :
-- 1. Relance de renouvellement : 4 jours avant chaque prélèvement automatique, tous les abonnés
--    actifs (Starter/Pro/Master) reçoivent un email les prévenant du montant et de la date, avec
--    un lien vers /billing. renewal_reminder_sent_for mémorise le current_period_end pour lequel
--    la relance a déjà été envoyée, pour ne jamais la renvoyer deux fois sur le même cycle tout en
--    se réarmant automatiquement à chaque renouvellement suivant.
-- 2. Résiliation en libre-service : jusqu'ici aucun moyen pour un client de résilier lui-même
--    (page Billing annonce "Sans engagement" mais rien ne permettait de tenir cette promesse).
--    cancel_at_period_end reflète l'état réel côté Stripe (l'abonnement reste actif et facturé
--    jusqu'à la fin de la période déjà payée, pas de remboursement au prorata, conforme à l'usage).

alter table public.tenants
  add column if not exists renewal_reminder_sent_for timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false;

select cron.schedule(
  'renewal-reminder-daily',
  '0 8 * * *',
  $cron$
  select net.http_post(
    url := 'https://ixdayyjhxspxfxjybtvg.supabase.co/functions/v1/renewal-reminder-send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_B6ufdgZRkvr-3GASnaRU1w_2PAzd1-V',
      'x-cron-secret', '426060617b7bf5eeea949dbded5bb91ce3e08e007f3583b4'
    ),
    body := '{}'::jsonb
  );
  $cron$
);
