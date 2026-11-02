import { createFileRoute, notFound } from "@tanstack/react-router";
import {
  loadLocationPage,
  LocationPageNotFoundError,
  locationPageHead,
} from "@/lib/seo/location-review-page";
import { LocationReviewPage } from "@/components/location-review-page";
import { isSeoLocale } from "@/lib/seo/locales";

export const Route = createFileRoute("/$locale/remove-google-review/$country/$city")({
  loader: async ({ params }) => {
    if (!isSeoLocale(params.locale)) throw notFound();
    try {
      return await loadLocationPage(params.country, params.city, params.locale);
    } catch (error) {
      if (error instanceof LocationPageNotFoundError) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => (loaderData ? locationPageHead(loaderData) : {}),
  component: LocalizedLocationPage,
});

function LocalizedLocationPage() {
  return <LocationReviewPage data={Route.useLoaderData()} />;
}
