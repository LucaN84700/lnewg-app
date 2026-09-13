import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { functionErrorMessage, supabase } from "../lib/supabaseClient";
import { getDeviceLabel, getDeviceToken } from "../lib/device";

// Enregistre l'appareil courant à chaque chargement de l'app (voir register-device) : un
// appareil déjà connu est toujours accepté, seul un appareil vraiment nouveau peut être refusé
// s'il dépasse la limite du forfait. Ça évite de jamais bloquer un appareil déjà en usage.
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const [deviceChecked, setDeviceChecked] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    (async () => {
      const { data, error: invokeError } = await supabase.functions.invoke("register-device", {
        body: { device_token: getDeviceToken(), label: getDeviceLabel() },
      });
      if (cancelled) return;
      if (invokeError) {
        setDeviceError(await functionErrorMessage(invokeError));
      } else if (data?.error) {
        setDeviceError(data.error as string);
      }
      setDeviceChecked(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-gray">Chargement…</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!deviceChecked) {
    return <div className="flex min-h-screen items-center justify-center text-gray">Chargement…</div>;
  }

  if (deviceError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-md rounded-xl border border-line bg-white p-6 text-center text-sm">
          <p className="font-semibold text-navy">Appareil non autorisé</p>
          <p className="mt-2 text-gray">{deviceError}</p>
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="mt-4 rounded-md border border-line px-4 py-2 text-sm font-semibold text-navy"
          >
            Déconnexion
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
