import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { setRememberMe, supabase } from "../../lib/supabaseClient";

// Identifiants du compte démo public : pas un secret à protéger (la vraie protection, c'est
// que le tenant est marqué is_demo = true côté base — toute écriture lui est refusée par RLS,
// quels que soient les identifiants utilisés pour s'y connecter).
const DEMO_EMAIL = "demo@lnewg.com";
const DEMO_PASSWORD = "WHfHw2UdmKDdCy5DB34gMmmI";

export default function DemoPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setRememberMe(false);
      await supabase.auth.signOut();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });
      if (cancelled) return;
      if (signInError) {
        setError("Impossible de lancer la démo pour le moment. Réessayez dans un instant.");
        return;
      }
      navigate("/", { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 text-center">
        <img src="/lnewg-icon.png" alt="" className="mx-auto h-14 w-14 object-contain" />
        {error ? (
          <>
            <p className="mt-4 text-sm font-semibold text-navy">{error}</p>
            <a href="https://lnewg.com" className="mt-4 inline-block text-sm font-medium text-electric-dark">
              Retour au site
            </a>
          </>
        ) : (
          <p className="mt-4 text-sm text-gray">Préparation de la démo…</p>
        )}
      </div>
    </div>
  );
}
