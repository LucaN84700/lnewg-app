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
  plan: "starter" | "pro" | "scale" | "enterprise";
  subscription_status: "trialing" | "active" | "past_due" | "canceled";
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
  created_at: string;
}

export type ClientInput = Pick<Client, "name" | "short_code"> &
  Partial<Pick<Client, "company_name" | "address" | "email" | "phone" | "payment_mode_default">>;

export type TenantInput = Partial<
  Pick<
    Tenant,
    "name" | "siret" | "address" | "email" | "phone" | "iban" | "tva_regime" | "tva_rate" | "payment_terms_days" | "logo_url"
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
  clients?: Pick<Client, "name" | "short_code">;
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
