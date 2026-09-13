import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { functionErrorMessage, supabase } from "../../lib/supabaseClient";
import { getDeviceToken } from "../../lib/device";
import type { Plan, Tenant } from "../../types/database";

interface Device {
  id: string;
  device_token: string;
  label: string | null;
  created_at: string;
  last_seen_at: string;
}

export default function DevicesSection() {
  const queryClient = useQueryClient();
  const currentToken = getDeviceToken();

  const { data: tenant } = useQuery({
    queryKey: ["tenant"],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase.from("tenants").select("*").single();
      if (fetchError) throw fetchError;
      return data as Tenant;
    },
  });

  const { data: plan } = useQuery({
    queryKey: ["plan", tenant?.plan],
    enabled: !!tenant?.plan,
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from("plans")
        .select("*")
        .eq("id", tenant!.plan)
        .maybeSingle();
      if (fetchError) throw fetchError;
      return data as Plan | null;
    },
  });

  const { data: devices } = useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase.from("devices").select("*").order("created_at");
      if (fetchError) throw fetchError;
      return data as Device[];
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      const { data, error: invokeError } = await supabase.functions.invoke("revoke-device", {
        body: { device_id: deviceId },
      });
      if (invokeError) throw new Error(await functionErrorMessage(invokeError));
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      queryClient.invalidateQueries({ queryKey: ["device-count"] });
    },
    onError: (err: Error) => alert(err.message),
  });

  const deviceLimit = (plan?.device_limit ?? 1) + (tenant?.extra_devices ?? 0);
  const currentDevices = devices?.length ?? 0;
  const limitReached = currentDevices >= deviceLimit;

  function handleRevoke(device: Device) {
    const isCurrent = device.device_token === currentToken;
    const message = isCurrent
      ? "Cet appareil est celui que tu utilises actuellement : le révoquer va te déconnecter à ton prochain chargement. Continuer ?"
      : `Révoquer "${device.label ?? "cet appareil"}" ?`;
    if (confirm(message)) {
      revokeMutation.mutate(device.id);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-line bg-white p-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-navy">Appareils connectés</h2>
        <p className="text-xs text-gray">
          {currentDevices} / {deviceLimit} appareil{deviceLimit > 1 ? "s" : ""}
        </p>
      </div>
      <p className="mt-1 text-xs text-gray">
        Un appareil reste compté même après déconnexion, révoque-le ici pour libérer la place.
      </p>

      <div className="mt-4 flex flex-col gap-2">
        {devices?.map((device) => (
          <div key={device.id} className="flex items-center justify-between rounded-md border border-line p-3">
            <div>
              <div className="font-medium text-navy">
                {device.label ?? "Appareil"}
                {device.device_token === currentToken && (
                  <span className="ml-1.5 rounded bg-electric/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-navy">
                    Cet appareil
                  </span>
                )}
              </div>
              <div className="text-xs text-gray">
                Dernière activité le {new Date(device.last_seen_at).toLocaleDateString("fr-FR")}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleRevoke(device)}
              disabled={revokeMutation.isPending}
              className="text-xs font-semibold text-red-600 disabled:opacity-50"
            >
              Révoquer
            </button>
          </div>
        ))}
        {devices?.length === 0 && <p className="text-sm text-gray">Aucun appareil enregistré pour l'instant.</p>}
      </div>

      {limitReached && (
        <p className="mt-4 rounded-md border border-line bg-bg-light p-3 text-sm text-gray">
          Limite de {deviceLimit} appareil{deviceLimit > 1 ? "s" : ""} atteinte pour votre forfait.{" "}
          <Link to="/billing" className="text-electric-dark">
            Voir les options
          </Link>
        </p>
      )}
    </div>
  );
}
