import { createFileRoute, notFound } from "@tanstack/react-router";
import {
  defaultLocationLocale,
  loadLocationPage,
  LocationPageNotFoundError,
  locationPageHead,
} from "@/lib/seo/location-review-page";
import { LocationReviewPage } from "@/components/location-review-page";

export const Route = createFileRoute("/remove-google-review/$country/$city")({
  loader: async ({ params }) => {
    try {
      return await loadLocationPage(params.country, params.city, defaultLocationLocale());
    } catch (error) {
      if (error instanceof LocationPageNotFoundError) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => (loaderData ? locationPageHead(loaderData) : {}),
  component: LocationPage,
});

function LocationPage() {
  return <LocationReviewPage data={Route.useLoaderData()} />;
}
