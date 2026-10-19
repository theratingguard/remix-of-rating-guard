import { readFile, writeFile } from "node:fs/promises";

async function configuredPublicUrl() {
  for (const key of ["PUBLIC_APP_URL", "VITE_PUBLIC_APP_URL"]) {
    if (process.env[key]) return process.env[key];
  }
  for (const file of [".env.production", ".env"]) {
    let contents;
    try {
      contents = await readFile(file, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    for (const key of ["PUBLIC_APP_URL", "VITE_PUBLIC_APP_URL"]) {
      const line = contents.split(/\r?\n/).find((entry) => entry.startsWith(`${key}=`));
      if (line) {
        const value = line
          .slice(key.length + 1)
          .trim()
          .replace(/^(['"])(.*)\1$/, "$2");
        if (value) return value;
      }
    }
  }
  return "https://ratingguard.online";
}

const configuredUrl = await configuredPublicUrl();
const origin = new URL(configuredUrl);
if (origin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(origin.hostname)) {
  throw new Error("The public site URL must use HTTPS.");
}

const publicPaths = [
  "/",
  "/contact",
  "/get-started",
  "/join",
  "/privacy",
  "/responsible-use",
  "/terms",
];
const urls = publicPaths.map((path) => new URL(path, origin).toString());
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
  .map((url) => `  <url><loc>${url.replaceAll("&", "&amp;")}</loc></url>`)
  .join("\n")}\n</urlset>\n`;
if (!xml.startsWith('<?xml version="1.0"') || urls.some((url) => !url.startsWith(origin.origin))) {
  throw new Error("Generated sitemap validation failed.");
}
await writeFile("public/sitemap.xml", xml, "utf8");
await writeFile(
  "public/robots.txt",
  `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /dashboard\nSitemap: ${new URL("/sitemap.xml", origin)}\n`,
  "utf8",
);
console.info(`Generated sitemap with ${urls.length} public routes for ${origin.origin}.`);
