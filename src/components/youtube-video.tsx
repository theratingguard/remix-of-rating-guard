import type { SeoVideo } from "@/lib/seo/seo-head";
import { youtubeVideoId } from "@/lib/seo/youtube";

export function isSeoVideo(value: unknown): value is SeoVideo {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const video = value as {
    youtubeUrl?: unknown;
    name?: unknown;
    description?: unknown;
    uploadDate?: unknown;
    duration?: unknown;
  };
  return (
    typeof video["youtubeUrl"] === "string" &&
    youtubeVideoId(video["youtubeUrl"]) !== null &&
    typeof video["name"] === "string" &&
    video["name"].trim().length > 0 &&
    typeof video["description"] === "string" &&
    video["description"].trim().length > 0 &&
    typeof video["uploadDate"] === "string" &&
    Number.isFinite(Date.parse(video["uploadDate"])) &&
    typeof video["duration"] === "string" &&
    /^PT(?:(?:\d+)H)?(?:(?:\d+)M)?(?:(?:\d+)S)?$/.test(video["duration"]) &&
    video["duration"] !== "PT"
  );
}

export function YouTubeVideo({ video }: { video: SeoVideo }) {
  const id = youtubeVideoId(video.youtubeUrl);
  if (!id) return null;

  return (
    <section aria-label={video.name} className="space-y-3">
      <h2 className="text-2xl font-semibold text-foreground">{video.name}</h2>
      <p className="leading-7 text-muted-foreground">{video.description}</p>
      <div className="aspect-video overflow-hidden rounded-xl border border-border">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}`}
          title={video.name}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="size-full"
        />
      </div>
    </section>
  );
}
