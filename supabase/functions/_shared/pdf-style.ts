// Primitives de mise en page partagées entre devis-pdf et facture-pdf, calquées sur la charte
// visuelle du devis de référence LNEWG (skill_LNEWG/lnewg-devis) : bandeau navy plein, blocs
// ÉMIS PAR / CLIENT en table à fond teinté, titres de section soulignés en couleur d'accent,
// ligne de total mise en évidence dans une cellule pleine. L'objectif : que changer la couleur
// d'accent (plan Master) recolore des ÉLÉMENTS DE STRUCTURE (bandeaux, soulignés, cellule de
// total) plutôt que du texte brut sur fond blanc — ce qui reste "pro" quelle que soit la teinte.

import { rgb } from "npm:pdf-lib@1.17.1";

export const NAVY = rgb(0.043, 0.071, 0.126); // #0B1220
export const GRAY = rgb(0.353, 0.392, 0.447); // #5A6472
export const LINE = rgb(0.882, 0.898, 0.925); // #E1E5EC
export const WHITE = rgb(1, 1, 1);
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

// Texte blanc ou navy selon la luminance du fond, pour rester lisible même si le tenant choisit
// une couleur d'accent claire (ex: jaune) comme fond de cellule pleine.
export function contrastText(bg: ReturnType<typeof rgb>): ReturnType<typeof rgb> {
  // deno-lint-ignore no-explicit-any
  const c = bg as any;
  const luminance = 0.299 * c.red + 0.587 * c.green + 0.114 * c.blue;
  return luminance > 0.6 ? NAVY : WHITE;
}
