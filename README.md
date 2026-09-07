# LNEWG App — SaaS BTP

Application SaaS LNEWG pour les entreprises du BTP : devis, factures, relances client. Déployée sur `app.lnewg.com`.

## Stack

- Vite + React + TypeScript
- Tailwind CSS v4
- React Router
- Supabase (base de données, authentification, stockage)
- Stripe (abonnements)

## Développement local

```bash
npm install
cp .env.example .env.local   # puis renseigner les vraies valeurs
npm run dev
```

## Déploiement

Netlify, build automatique sur push vers `main` (voir `netlify.toml`). Aucune variable secrète dans le repo — les clés Supabase/Stripe sont configurées côté Netlify (variables d'environnement du site) et en local dans `.env.local` (ignoré par git).

## Structure

Voir le plan du projet pour le détail de l'architecture (schéma Supabase, fonctions Stripe, automatisation des relances).
