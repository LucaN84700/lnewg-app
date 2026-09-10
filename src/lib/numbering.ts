import type { SupabaseClient } from "@supabase/supabase-js";

// Une facture générée depuis un devis reprend le même numéro de séquence que ce devis
// (2026-CLIENT-D01 -> 2026-CLIENT-F01), pour que les deux documents concordent visuellement.
export function parseDevisSequence(devisNumero: string): number | null {
  const match = devisNumero.match(/-D(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

async function nextFactureNumeroFromCounter(supabase: SupabaseClient, clientId: string, clientShortCode: string) {
  const { data: numero, error } = await supabase.rpc("get_next_document_number", {
    p_client_id: clientId,
    p_doc_type: "facture",
  });
  if (error) throw error;
  return `${new Date().getFullYear()}-${clientShortCode}-F${String(numero).padStart(2, "0")}`;
}

export async function buildFactureNumeroFromDevis(
  supabase: SupabaseClient,
  devisNumero: string,
  clientId: string,
  clientShortCode: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const seq = parseDevisSequence(devisNumero);

  if (seq != null) {
    const candidate = `${year}-${clientShortCode}-F${String(seq).padStart(2, "0")}`;
    // le numéro souhaité peut déjà être pris par une facture indépendante (créée hors de tout
    // devis) : on vérifie avant d'insérer plutôt que de laisser la contrainte d'unicité échouer
    const { data: existing } = await supabase.from("factures").select("id").eq("numero", candidate).maybeSingle();
    if (!existing) {
      const { error } = await supabase.rpc("claim_document_number", {
        p_client_id: clientId,
        p_doc_type: "facture",
        p_number: seq,
      });
      if (error) throw error;
      return candidate;
    }
  }

  return nextFactureNumeroFromCounter(supabase, clientId, clientShortCode);
}
