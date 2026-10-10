const MAP_HOSTS = new Set([
  "google.com",
  "www.google.com",
  "maps.google.com",
  "google.co.in",
  "www.google.co.in",
  "maps.google.co.in",
  "google.co.uk",
  "www.google.co.uk",
  "maps.google.co.uk",
  "google.de",
  "www.google.de",
  "maps.google.de",
  "google.fr",
  "www.google.fr",
  "maps.google.fr",
  "google.ca",
  "www.google.ca",
  "maps.google.ca",
  "google.com.au",
  "www.google.com.au",
  "maps.google.com.au",
]);
export const GOOGLE_SHORT_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "g.page",
  "g.co",
  "share.google",
]);

export function isGoogleShareBridge(url: URL): boolean {
  return (
    url.hostname === "www.google.com" &&
    url.pathname === "/share.google" &&
    /^[A-Za-z0-9]+$/.test(url.searchParams.get("q") ?? "")
  );
}

export function isGoogleMapsUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      (GOOGLE_SHORT_HOSTS.has(url.hostname) ||
        isGoogleShareBridge(url) ||
        (MAP_HOSTS.has(url.hostname) && /^\/maps(?:\/|$)/.test(url.pathname)))
    );
  } catch {
    return false;
  }
}

export function normalizeGoogleUrl(raw: string): string {
  const url = new URL(raw.trim());
  url.hash = "";
  return url.toString();
}
