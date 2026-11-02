import { createFileRoute, notFound } from "@tanstack/react-router";
import { ResellerLandingPage, resellerLandingHead } from "@/components/reseller-landing-page";
import { SEO_LOCALES } from "@/lib/seo/locales";

function countrySlug(country: string) {
  return country
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const supportedCountries = new Map(
  SEO_LOCALES.map(({ country }) => [countrySlug(country), country]),
);

export const Route = createFileRoute("/become-a-reseller/$country")({
  loader: ({ params }) => {
    const country = supportedCountries.get(params.country);
    if (!country) throw notFound();
    return { country };
  },
  head: ({ loaderData }) => (loaderData ? resellerLandingHead(loaderData.country) : {}),
  component: CountryResellerLandingPage,
});

function CountryResellerLandingPage() {
  const { country } = Route.useLoaderData();
  return <ResellerLandingPage country={country} />;
}
