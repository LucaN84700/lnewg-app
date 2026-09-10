// Primitives de mise en page partagées entre devis-pdf et facture-pdf, calquées sur la charte
// visuelle du devis de référence LNEWG (skill_LNEWG/lnewg-devis) : bandeau plein, blocs
// ÉMIS PAR / CLIENT en table à fond teinté, titres de section soulignés, ligne de total mise
// en évidence dans une cellule teintée. Deux couleurs Master indépendantes : accent_color_hex
// (couleur 1) pour les fonds pleins (bandeau, en-têtes), accent_color_secondary_hex (couleur 2)
// pour les fonds clairs (panneaux, cellule Total TTC) — la couleur 2 choisit la TEINTE, mais le
// fond appliqué est toujours cette teinte fortement éclaircie (jamais la couleur pleine).
// Le texte reste toujours noir, sur demande explicite de Luca — pas de bascule de contraste.

import { rgb } from "npm:pdf-lib@1.17.1";

// Sur demande explicite de Luca : le texte reste TOUJOURS noir (jamais blanc, jamais teinté
// par l'accent), quelle que soit la couleur de fond d'un bandeau/cellule — seuls les FONDS
// suivent la couleur d'accent. Pas de bascule de contraste ici : c'est un choix esthétique
// assumé, pas une règle de lisibilité automatique.
export const BLACK = rgb(0, 0, 0);
export const GRAY = rgb(0.353, 0.392, 0.447); // #5A6472
export const LINE = rgb(0.882, 0.898, 0.925); // #E1E5EC
// Bleu électrique LNEWG (#3DA5F5) : couleur d'accent par défaut hors plan Master.
export const DEFAULT_ACCENT = rgb(0.239, 0.647, 0.961);

export function hexToRgb(hex: string | null | undefined): ReturnType<typeof rgb> | null {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return rgb(r, g, b);
}

// Teinte très claire d'une couleur (fond de bloc), en mélangeant vers le blanc — reproduit le
// rapport visuel entre le bleu #2F6FEB et son fond clair #E8F0FE du devis de référence, mais
// calculé dynamiquement pour s'adapter à n'importe quelle couleur d'accent choisie.
export function lighten(color: ReturnType<typeof rgb>, amount = 0.88): ReturnType<typeof rgb> {
  // deno-lint-ignore no-explicit-any
  const c = color as any;
  const mix = (channel: number) => channel + (1 - channel) * amount;
  return rgb(mix(c.red), mix(c.green), mix(c.blue));
}

// Couleur 1 (fonds pleins : bandeau, en-têtes) : adoucie d'un cran (8%) par rapport à la
// teinte choisie — retour utilisateur : la couleur pleine paraissait "un poil" trop foncée.
// deno-lint-ignore no-explicit-any
export function accentFor(tenant: any): ReturnType<typeof rgb> {
  const chosen = tenant.plan === "master" ? hexToRgb(tenant.accent_color_hex) ?? DEFAULT_ACCENT : DEFAULT_ACCENT;
  return lighten(chosen, 0.08);
}

// Couleur 2 (fonds clairs : panneaux, cellule Total TTC) : le tenant choisit la TEINTE
// (Master), mais le fond appliqué est toujours cette teinte très éclaircie — jamais la couleur
// pleine — pour rester un "fond clair" quelle que soit la couleur choisie. Sans couleur 2
// personnalisée, on éclaircit la couleur 1 par défaut, pour que le rendu reste cohérent tant
// que le tenant n'a pas encore personnalisé la couleur 2.
// deno-lint-ignore no-explicit-any
export function secondaryAccentFor(tenant: any): ReturnType<typeof rgb> {
  const base =
    tenant.plan === "master" ? hexToRgb(tenant.accent_color_secondary_hex) ?? accentFor(tenant) : accentFor(tenant);
  return lighten(base, 0.92);
}
