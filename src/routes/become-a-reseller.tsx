import { createFileRoute } from "@tanstack/react-router";
import { ResellerLandingPage, resellerLandingHead } from "@/components/reseller-landing-page";

export const Route = createFileRoute("/become-a-reseller")({
  head: () => resellerLandingHead(),
  component: ResellerLandingPage,
});
