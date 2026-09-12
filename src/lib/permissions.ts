import type { Profile } from "../types/database";

// Source unique des rubriques que le owner peut activer/désactiver pour un coéquipier.
// Réglages et Abonnement n'y figurent pas : ils restent toujours réservés au owner.
export const RUBRIQUES = [
  { field: "can_view_dashboard", label: "Tableau de bord" },
  { field: "can_view_clients", label: "Clients" },
  { field: "can_view_catalogue", label: "Catalogue" },
  { field: "can_view_devis", label: "Devis" },
  { field: "can_view_factures", label: "Factures" },
  { field: "can_view_relances", label: "Relances" },
  { field: "can_view_comptabilite", label: "Comptabilité" },
  { field: "can_view_montants", label: "Montants (prix HT/TTC)" },
] as const satisfies ReadonlyArray<{ field: keyof Profile; label: string }>;

export type RubriqueField = (typeof RUBRIQUES)[number]["field"];
