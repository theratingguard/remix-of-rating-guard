import { createFileRoute, notFound } from "@tanstack/react-router";
import {
  defaultLocationLocale,
  loadLocationPage,
  LocationPageNotFoundError,
  locationPageHead,
} from "@/lib/seo/location-review-page";
import { getIndustryCountryPage, industryReviewHead } from "@/lib/seo/industry-seo";
import { IndustrySeoLandingPage } from "@/components/industry-seo-landing-page";
import { LocationReviewPage } from "@/components/location-review-page";

export const Route = createFileRoute("/remove-google-review/$country/$city")({
  loader: async ({ params }) => {
    const industryPage = getIndustryCountryPage(params.country, params.city);
    if (industryPage) return { kind: "industry" as const, data: industryPage };

    try {
      const locationPage = await loadLocationPage(
        params.country,
        params.city,
        defaultLocationLocale(),
      );
      return { kind: "location" as const, data: locationPage };
    } catch (error) {
      if (error instanceof LocationPageNotFoundError) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    return loaderData.kind === "industry"
      ? industryReviewHead(loaderData.data)
      : locationPageHead(loaderData.data);
  },
  component: LocationPage,
});

function LocationPage() {
  const result = Route.useLoaderData();
  return result.kind === "industry" ? (
    <IndustrySeoLandingPage kind="review" {...result.data} />
  ) : (
    <LocationReviewPage data={result.data} />
  );
}
