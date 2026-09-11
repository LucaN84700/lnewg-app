-- Même problème que pour profiles (migration 0024) : service_role n'avait pas de SELECT sur
-- plans. create-team-member lisait donc plan.seat_limit en silence comme null (la requête
-- .maybeSingle() ignorait l'erreur de permission), et retombait sur la limite par défaut de 1
-- utilisateur même pour un tenant Master (qui devrait avoir 3 sièges).

grant select on public.plans to service_role;
