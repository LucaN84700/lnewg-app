export interface Tenant {
  id: string;
  name: string;
  siret: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  iban: string | null;
  tva_regime: "franchise" | "reel";
  tva_rate: number | null;
  payment_terms_days: number | null;
  logo_url: string | null;
  plan: "starter" | "pro" | "master" | "scale" | "enterprise";
  subscription_status: "trialing" | "active" | "past_due" | "canceled";
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  relance_schedule_jours: number[];
  relances_auto_enabled: boolean;
  accent_color_hex: string | null;
  accent_color_secondary_hex: string | null;
  unites_actives: string[];
  unites_personnalisees: string[];
  extra_seats: number;
  extra_devices: number;
}

export interface Plan {
  id: string;
  stripe_price_id: string;
  stripe_price_id_annual: string | null;
  label: string;
  amount_cents: number;
  devis_limit_per_month: number | null;
  factures_limit_per_month: number | null;
  seat_limit: number | null;
  device_limit: number | null;
}

export interface UsageMensuel {
  tenant_id: string;
  annee_mois: string;
  devis_crees: number;
  factures_creees: number;
}

export interface Profile {
  id: string;
  tenant_id: string;
  full_name: string | null;
  email: string | null;
  role: "owner" | "member";
  can_view_comptabilite: boolean;
  can_view_factures: boolean;
  can_view_montants: boolean;
  created_at: string;
}

export interface Client {
  id: string;
  tenant_id: string;
  name: string;
  company_name: string | null;
  short_code: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  payment_mode_default: string | null;
  relance_schedule_jours: number[] | null;
  created_at: string;
}

export type ClientInput = Pick<Client, "name" | "short_code"> &
  Partial<
    Pick<
      Client,
      "company_name" | "address" | "email" | "phone" | "payment_mode_default" | "logo_url" | "relance_schedule_jours"
    >
  >;

export type TenantInput = Partial<
  Pick<
    Tenant,
    | "name"
    | "siret"
    | "address"
    | "email"
    | "phone"
    | "iban"
    | "tva_regime"
    | "tva_rate"
    | "payment_terms_days"
    | "logo_url"
    | "accent_color_hex"
    | "accent_color_secondary_hex"
    | "unites_actives"
    | "unites_personnalisees"
  >
>;

export interface DevisLigne {
  description: string;
  quantite: number;
  unite: string;
  prix_unitaire_ht: number;
}

export type DevisStatut = "brouillon" | "envoye" | "accepte" | "refuse" | "expire";

export interface Devis {
  id: string;
  tenant_id: string;
  client_id: string;
  numero: string;
  statut: DevisStatut;
  date_emission: string;
  validite_jours: number;
  objet: string | null;
  contexte: string | null;
  lignes: DevisLigne[];
  total_ht: number;
  docx_path: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  clients?: Pick<Client, "name" | "short_code">;
  created_by_profile?: Pick<Profile, "full_name"> | null;
}

export interface DevisInput {
  client_id: string;
  objet: string;
  contexte: string;
  date_emission: string;
  validite_jours: number;
  lignes: DevisLigne[];
  total_ht: number;
}

export type FactureStatut = "brouillon" | "envoyee" | "payee" | "en_retard" | "annulee";

export interface Facture {
  id: string;
  tenant_id: string;
  client_id: string;
  devis_id: string | null;
  numero: string;
  statut: FactureStatut;
  date_facture: string;
  date_echeance: string;
  lignes: DevisLigne[];
  total_ht: number;
  tva_montant: number;
  total_ttc: number;
  mode_paiement: string | null;
  docx_path: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  clients?: Pick<Client, "name" | "short_code">;
  devis?: Pick<Devis, "numero"> | null;
  created_by_profile?: Pick<Profile, "full_name"> | null;
}

export interface FactureInput {
  client_id: string;
  devis_id: string | null;
  date_facture: string;
  date_echeance: string;
  lignes: DevisLigne[];
  total_ht: number;
  tva_montant: number;
  total_ttc: number;
  mode_paiement: string;
}

export interface CatalogueArticle {
  id: string;
  tenant_id: string;
  description: string;
  unite: string;
  prix_unitaire_ht: number;
  created_at: string;
}

export type CatalogueArticleInput = Pick<CatalogueArticle, "description" | "unite" | "prix_unitaire_ht">;

export type RelanceStatut = "planifiee" | "envoyee" | "echec";

export interface Relance {
  id: string;
  tenant_id: string;
  facture_id: string;
  niveau: number;
  statut: RelanceStatut;
  sent_at: string | null;
  created_at: string;
  factures?: Pick<Facture, "numero" | "total_ttc"> & { clients?: Pick<Client, "name"> | null };
}
