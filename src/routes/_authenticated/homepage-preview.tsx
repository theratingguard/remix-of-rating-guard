import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { HomePage } from "@/components/home-page";
import { getDraftContent } from "@/lib/site-content.functions";
import { mergeContent } from "@/lib/site-content";

export const Route = createFileRoute("/_authenticated/homepage-preview")({
  component: HomepagePreview,
});

function HomepagePreview() {
  const load = useServerFn(getDraftContent);
  const query = useQuery({ queryKey: ["homepage-draft"], queryFn: () => load() });
  if (query.isLoading) return <p>Loading authorized draft preview...</p>;
  if (query.error) return <p role="alert">{query.error.message}</p>;
  if (!query.data) return <p role="alert">Draft preview unavailable.</p>;
  return (
    <HomePage
      c={mergeContent(
        Object.keys(query.data.draft ?? {}).length ? query.data.draft : query.data.published,
      )}
      preview
    />
  );
}
