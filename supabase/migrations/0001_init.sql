-- Schéma initial LNEWG App (SaaS BTP) : tenants, clients, devis, factures, relances

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  siret text,
  address text,
  email text,
  phone text,
  iban text,
  tva_regime text not null default 'franchise' check (tva_regime in ('franchise','reel')),
  tva_rate numeric(5,2) default 20.00,
  payment_terms_days int default 30,
  logo_url text,
  plan text not null default 'starter' check (plan in ('starter','pro','scale','enterprise')),
  subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing','active','past_due','canceled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  full_name text,
  role text not null default 'owner' check (role in ('owner','member')),
  created_at timestamptz not null default now()
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  company_name text,
  short_code text not null,
  address text,
  email text,
  phone text,
  logo_url text,
  payment_mode_default text default 'Virement bancaire',
  created_at timestamptz not null default now(),
  unique (tenant_id, short_code)
);

create table devis (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  client_id uuid not null references clients(id) on delete restrict,
  numero text not null,
  statut text not null default 'brouillon'
    check (statut in ('brouillon','envoye','accepte','refuse','expire')),
  date_emission date not null default current_date,
  validite_jours int default 30,
  objet text,
  contexte text,
  lignes jsonb not null default '[]',
  total_ht numeric(10,2) not null default 0,
  docx_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, numero)
);

create table factures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  client_id uuid not null references clients(id) on delete restrict,
  devis_id uuid references devis(id),
  numero text not null,
  statut text not null default 'brouillon'
    check (statut in ('brouillon','envoyee','payee','en_retard','annulee')),
  date_facture date not null default current_date,
  date_echeance date not null,
  lignes jsonb not null default '[]',
  total_ht numeric(10,2) not null default 0,
  tva_montant numeric(10,2) not null default 0,
  total_ttc numeric(10,2) not null default 0,
  mode_paiement text default 'Virement bancaire',
  docx_path text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, numero)
);

create table relances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  facture_id uuid not null references factures(id) on delete cascade,
  niveau int not null check (niveau in (1,2,3)),
  statut text not null default 'planifiee' check (statut in ('planifiee','envoyee','echec')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table numbering_counters (
  tenant_id uuid not null references tenants(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  doc_type text not null check (doc_type in ('devis','facture')),
  last_number int not null default 0,
  primary key (tenant_id, client_id, doc_type)
);

create table app_settings (
  key text primary key,
  value text not null
);
insert into app_settings (key, value) values
  ('taux_penalites_retard', '8,25 % l''an (3x le taux légal professionnel, 2e semestre 2026)'),
  ('indemnite_recouvrement', '40 € (article L441-10 du Code de commerce)');

create table plans (
  id text primary key,
  stripe_price_id text,
  label text not null,
  amount_cents int not null
);
insert into plans (id, label, amount_cents) values
  ('starter', 'Starter', 19700),
  ('pro', 'Pro', 39700),
  ('scale', 'Scale', 79700);
