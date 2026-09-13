import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être définis dans .env.local",
  );
}

// "Rester connecté" (coché par défaut à la connexion) : la session est écrite dans localStorage
// et survit à la fermeture du navigateur. Décoché, elle va dans sessionStorage et disparaît à la
// fermeture de l'onglet. Le choix est mémorisé dans localStorage pour être lu avant même que la
// session existe (le storage adapter de supabase-js y consulte cette préférence à chaque accès).
const REMEMBER_ME_KEY = "lnewg-remember-me";

export function setRememberMe(remember: boolean) {
  localStorage.setItem(REMEMBER_ME_KEY, remember ? "1" : "0");
}

function isRemembered() {
  return localStorage.getItem(REMEMBER_ME_KEY) !== "0";
}

const authStorage = {
  getItem: (key: string) => (isRemembered() ? localStorage : sessionStorage).getItem(key),
  setItem: (key: string, value: string) => (isRemembered() ? localStorage : sessionStorage).setItem(key, value),
  removeItem: (key: string) => (isRemembered() ? localStorage : sessionStorage).removeItem(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { storage: authStorage } });
export { supabaseUrl };

export async function openFunctionPdf(functionName: string, params: Record<string, string>) {
  // Ouvre l'onglet tout de suite, de façon synchrone, pendant qu'on est encore dans le geste
  // utilisateur (le clic) : Safari et les navigateurs mobiles bloquent silencieusement un
  // window.open() appelé après un await (fetch, getSession...), qui n'est plus considéré comme
  // déclenché par l'utilisateur. On redirige cet onglet une fois le PDF prêt.
  const tab = window.open("", "_blank");

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error("Session expirée, reconnecte-toi.");

    const query = new URLSearchParams(params).toString();
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}?${query}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error ?? `Échec de la génération (${response.status})`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    // Naviguer l'onglet directement vers l'URL blob échoue silencieusement dans Chrome/Safari
    // récents (une "top-level navigation" vers un blob: créé par un autre document est bloquée) :
    // on l'affiche donc dans un <iframe> plein écran, ce qui n'est pas soumis à cette restriction.
    if (tab) {
      tab.document.write(
        `<!doctype html><title>Document</title><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe src="${url}"></iframe>`,
      );
      tab.document.close();
    } else {
      window.open(url, "_blank");
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}

// Comme openFunctionPdf, mais pour un fichier non affichable dans un onglet (ex: un ZIP) :
// déclenche un vrai téléchargement plutôt que d'ouvrir un onglet vide.
export async function downloadFunctionFile(functionName: string, params: Record<string, string>, filename: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Session expirée, reconnecte-toi.");

  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}?${query}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Échec de la génération (${response.status})`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Traduit une erreur de suppression Postgres en message compréhensible. Le cas le plus
// fréquent est la contrainte de clé étrangère (23503) : on empêche volontairement de supprimer
// un client/devis référencé par des documents existants, pour ne jamais perdre un historique
// comptable — mais l'erreur brute de Postgres n'est pas lisible pour un utilisateur.
export function friendlyDeleteError(error: unknown, entityLabel: string): string {
  const code = (error as { code?: string })?.code;
  if (code === "23503") {
    return `Impossible de supprimer ce ${entityLabel} : il est lié à d'autres documents (devis, factures...) qu'il faut conserver. Supprime d'abord ces documents si tu veux vraiment le supprimer.`;
  }
  return error instanceof Error ? error.message : String(error);
}

// supabase-js only exposes a generic "non-2xx status code" message for Edge Function
// errors; the actual reason is in the response body, so we pull it out here.
export async function functionErrorMessage(invokeError: unknown): Promise<string> {
  const context = (invokeError as { context?: Response })?.context;
  if (context) {
    try {
      const body = await context.clone().json();
      if (body?.error) return body.error as string;
    } catch {
      // response body wasn't JSON, fall through to the generic message
    }
  }
  return invokeError instanceof Error ? invokeError.message : String(invokeError);
}
