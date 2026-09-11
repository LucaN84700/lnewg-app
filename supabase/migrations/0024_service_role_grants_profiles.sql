-- service_role n'avait aucun GRANT sur profiles (seulement TRUNCATE/REFERENCES/TRIGGER, hérités
-- d'ailleurs) : les edge functions create-team-member/remove-team-member utilisent le service
-- role pour lire/compter les profils du tenant, et échouaient avec "permission denied for table
-- profiles" (42501). service_role contourne RLS mais a quand même besoin des GRANTs de base.

grant select, insert, update, delete on public.profiles to service_role;
