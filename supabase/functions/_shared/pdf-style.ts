// Primitives de mise en page partagées entre devis-pdf et facture-pdf, calquées sur la charte
// visuelle du devis de référence LNEWG (skill_LNEWG/lnewg-devis) : bandeau plein, blocs
// ÉMIS PAR / CLIENT en table à fond teinté, titres de section soulignés en couleur d'accent,
// ligne de total mise en évidence dans une cellule pleine. La couleur d'accent (plan Master)
// recolore uniquement les FONDS (bandeaux, en-têtes, cellule de total, soulignés) ; le texte
// reste toujours noir, sur demande explicite de Luca — pas de bascule de contraste automatique.

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

// deno-lint-ignore no-explicit-any
export function accentFor(tenant: any): ReturnType<typeof rgb> {
  if (tenant.plan === "master") {
    return hexToRgb(tenant.accent_color_hex) ?? DEFAULT_ACCENT;
  }
  return DEFAULT_ACCENT;
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
