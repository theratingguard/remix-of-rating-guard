// Canonical public app URL. Override with VITE_PUBLIC_APP_URL in deployment config.
export const APP_URL: string = import.meta.env["VITE_PUBLIC_APP_URL"] || "";
export const APP_DOMAIN = APP_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
export const APP_NAME = "Rating Guard Remix";
