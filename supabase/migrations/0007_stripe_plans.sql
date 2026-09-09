-- Repricing (2026-09-09) : Starter 49,99€/mois (30 devis/mois max) et Pro 89,99€/mois
-- (illimité), tarif annuel -10%. Remplace les anciens plans starter/pro/scale.

alter table plans add column if not exists stripe_price_id_annual text;
alter table plans add column if not exists devis_limit_per_month int;

delete from plans;

insert into plans (id, stripe_price_id, stripe_price_id_annual, label, amount_cents, devis_limit_per_month) values
  ('starter', 'price_1UDo0G0RLlAEhDtx7sbvxQj5', 'price_1UDo0g0RLlAEhDtx5NPgMGvR', 'Starter', 4999, 30),
  ('pro', 'price_1UDo0G0RLlAEhDtxOqhMTQo0', 'price_1UDo0h0RLlAEhDtxIVjGI9KF', 'Pro', 8999, null);
