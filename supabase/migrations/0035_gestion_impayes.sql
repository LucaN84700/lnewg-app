-- Gestion des paiements refusés au renouvellement : jusqu'ici un abonnement qui passait en
-- "past_due" côté Stripe n'avait aucune consequence cote app (acces garde indefiniment, aucune
-- notification). past_due_notified_at evite de spammer un email a chaque tentative de relance
-- Stripe (Smart Retries) : un seul email par episode d'impaye, remis a zero des que le compte
-- redevient actif, pour notifier a nouveau si un futur episode survient.

alter table public.tenants
  add column if not exists past_due_notified_at timestamptz;
