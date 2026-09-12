-- Même bug que profiles/plans (migrations 0024/0025) : service_role n'avait aucun GRANT UPDATE
-- sur tenants (seulement SELECT/TRUNCATE/REFERENCES/TRIGGER). La edge function stripe-webhook
-- utilise le service role pour écrire le plan/statut d'abonnement/sièges suite à un paiement, et
-- échouait avec "permission denied for table tenants" (42501) -- silencieusement, car le code de
-- applySubscription() ne vérifiait pas l'erreur retournée par .update(). Découvert en testant la
-- fonctionnalité de siège supplémentaire : aucune mise à jour de tenant depuis Stripe n'a donc
-- jamais fonctionné en production depuis la Phase 8.

grant update on public.tenants to service_role;
