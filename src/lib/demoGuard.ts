export const DEMO_MODE_MESSAGE =
  "Mode démo : cette action est désactivée. Créez votre compte gratuit pour l'utiliser réellement.";

export function assertNotDemo(isDemo: boolean | null | undefined) {
  if (isDemo) throw new Error(DEMO_MODE_MESSAGE);
}
