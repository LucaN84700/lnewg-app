const DEVICE_TOKEN_KEY = "lnewg-device-token";

export function getDeviceToken(): string {
  let token = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
  }
  return token;
}

// Étiquette lisible pour aider le owner à reconnaître l'appareil dans Réglages > Appareils
// (ex: "Chrome sur Mac") : une aide visuelle, pas une empreinte technique fiable.
export function getDeviceLabel(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Navigateur";
  const os = /Mac OS X/.test(ua)
    ? "Mac"
    : /Windows/.test(ua)
      ? "Windows"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "appareil inconnu";
  return `${browser} sur ${os}`;
}
