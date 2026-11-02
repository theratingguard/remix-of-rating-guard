import { createFileRoute, notFound } from "@tanstack/react-router";
import { IndustrySeoLandingPage } from "@/components/industry-seo-landing-page";
import { getCountry, partnerHead } from "@/lib/seo/industry-seo";

export const Route = createFileRoute("/partners/$country")({
  loader: ({ params }) => {
    const country = getCountry(params.country);
    if (!country) throw notFound();
    return { country };
  },
  head: ({ loaderData }) => (loaderData ? partnerHead(loaderData) : {}),
  component: PartnerLandingPage,
});

function PartnerLandingPage() {
  return <IndustrySeoLandingPage kind="partners" {...Route.useLoaderData()} />;
}
