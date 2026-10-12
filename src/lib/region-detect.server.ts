import { isRegion, regionForAddress, regionForCountryCode, type Region } from "./regional-routing";

export type RegionDetection = {
  region: Region;
  source: "google_places" | "address" | "manual" | "unresolved";
};

export function detectBusinessRegion(input: {
  countryCode?: string | null;
  formattedAddress?: string | null;
  manualSelection?: Region | null;
}): RegionDetection {
  const googleRegion = regionForCountryCode(input.countryCode);
  if (input.countryCode && googleRegion !== "OTHER")
    return { region: googleRegion, source: "google_places" };

  const addressRegion = regionForAddress(input.formattedAddress);
  if (addressRegion !== "OTHER") return { region: addressRegion, source: "address" };
  if (input.countryCode) return { region: googleRegion, source: "google_places" };
  if (isRegion(input.manualSelection)) return { region: input.manualSelection, source: "manual" };
  return { region: "OTHER", source: "unresolved" };
}
