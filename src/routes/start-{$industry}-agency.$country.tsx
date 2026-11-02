import { createFileRoute, notFound } from "@tanstack/react-router";
import { IndustrySeoLandingPage } from "@/components/industry-seo-landing-page";
import { agencyHead, getAgencyPage } from "@/lib/seo/industry-seo";

export const Route = createFileRoute("/start-{$industry}-agency/$country")({
  loader: ({ params }) => {
    const data = getAgencyPage(params.industry, params.country);
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => (loaderData ? agencyHead(loaderData) : {}),
  component: AgencyLandingPage,
});

function AgencyLandingPage() {
  return <IndustrySeoLandingPage kind="agency" {...Route.useLoaderData()} />;
}
