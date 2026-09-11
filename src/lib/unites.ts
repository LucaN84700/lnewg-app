// Liste complète des unités de mesure proposées dans le tableau de capacités (Réglages).
// Chaque tenant coche celles qu'il utilise ; le sélecteur d'unité du catalogue n'affiche que
// ces unités-là, au lieu d'un champ texte libre.
export const UNITES_DISPONIBLES = [
  { code: "m2", label: "m² (mètre carré)" },
  { code: "m3", label: "m³ (mètre cube)" },
  { code: "m", label: "m (mètre)" },
  { code: "cm", label: "cm (centimètre)" },
  { code: "mm", label: "mm (millimètre)" },
  { code: "km", label: "km (kilomètre)" },
  { code: "ml", label: "ml (mètre linéaire)" },
  { code: "t", label: "t (tonne)" },
  { code: "kg", label: "kg (kilogramme)" },
  { code: "l", label: "L (litre)" },
  { code: "u", label: "u (unité)" },
  { code: "h", label: "h (heure)" },
  { code: "jour", label: "jour" },
  { code: "forfait", label: "forfait" },
] as const;
