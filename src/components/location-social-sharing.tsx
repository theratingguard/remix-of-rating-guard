type LocationSocialSharingProps = {
  title: string;
  url: string;
  hashtags: string[];
};

export function LocationSocialSharing({ title, url, hashtags }: LocationSocialSharingProps) {
  const tags = hashtags.slice(0, 5);
  const text = [title, ...tags].join(" ");
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;

  return (
    <section aria-labelledby="suggested-hashtags-heading" className="space-y-5 border-t border-border pt-8">
      <div className="space-y-2">
        <h2 id="suggested-hashtags-heading" className="text-2xl font-semibold text-foreground">
          Suggested hashtags
        </h2>
        <p className="text-sm text-muted-foreground">
          Country-specific topics for sharing this public page. These are suggestions, not live trend rankings.
        </p>
        <ul className="flex flex-wrap gap-2">
          {tags.map((hashtag) => (
            <li key={hashtag}>
              <a
                href={`https://twitter.com/search?q=${encodeURIComponent(hashtag)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded-full border border-border px-3 py-1.5 text-sm text-primary hover:bg-muted/50"
              >
                {hashtag}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <nav aria-label="Share this page" className="flex flex-wrap gap-2">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
        >
          Share on WhatsApp
        </a>
        <a
          href={twitterUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
        >
          Share on X
        </a>
        <a
          href={linkedinUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
        >
          Share on LinkedIn
        </a>
      </nav>
    </section>
  );
}
