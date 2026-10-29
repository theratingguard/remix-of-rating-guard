export function youtubeVideoId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (host === "youtu.be") return url.pathname.slice(1).match(/^[\w-]{11}$/)?.[0] ?? null;
    if (!["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) return null;
    if (url.pathname === "/watch")
      return url.searchParams.get("v")?.match(/^[\w-]{11}$/)?.[0] ?? null;
    return url.pathname.match(/^\/(?:embed|shorts)\/([\w-]{11})$/)?.[1] ?? null;
  } catch {
    return null;
  }
}
