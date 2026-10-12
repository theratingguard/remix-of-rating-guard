export const REGIONS = [
  "UK",
  "EU",
  "DE",
  "IN",
  "US",
  "CA",
  "AU",
  "FR",
  "IT",
  "ES",
  "NL",
  "JP",
  "BR",
  "MX",
  "AE",
  "SG",
  "PH",
  "KE",
  "RW",
  "ZA",
  "NG",
  "AF",
  "OTHER",
] as const;

export type Region = (typeof REGIONS)[number];

export const REGION_OPTIONS: { value: Region; label: string }[] = [
  { value: "US", label: "United States" },
  { value: "UK", label: "United Kingdom" },
  { value: "IN", label: "India" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "IT", label: "Italy" },
  { value: "ES", label: "Spain" },
  { value: "NL", label: "Netherlands" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
  { value: "JP", label: "Japan" },
  { value: "SG", label: "Singapore" },
  { value: "PH", label: "Philippines" },
  { value: "AE", label: "United Arab Emirates" },
  { value: "KE", label: "Kenya" },
  { value: "RW", label: "Rwanda" },
  { value: "ZA", label: "South Africa" },
  { value: "NG", label: "Nigeria" },
  { value: "BR", label: "Brazil" },
  { value: "MX", label: "Mexico" },
  { value: "AF", label: "Other African jurisdiction" },
  { value: "OTHER", label: "Other / not determined" },
];

const EU_MEMBER_CODES = new Set([
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
]);
const AFRICAN_CODES = new Set([
  "AO",
  "BF",
  "BI",
  "BJ",
  "BW",
  "CD",
  "CF",
  "CG",
  "CI",
  "CM",
  "CV",
  "DJ",
  "DZ",
  "EG",
  "ER",
  "ET",
  "GA",
  "GH",
  "GM",
  "GN",
  "GQ",
  "GW",
  "KE",
  "KM",
  "LR",
  "LS",
  "LY",
  "MA",
  "MG",
  "ML",
  "MR",
  "MU",
  "MW",
  "MZ",
  "NA",
  "NE",
  "NG",
  "RW",
  "SC",
  "SD",
  "SL",
  "SN",
  "SO",
  "SS",
  "ST",
  "SZ",
  "TD",
  "TG",
  "TN",
  "TZ",
  "UG",
  "ZA",
  "ZM",
  "ZW",
]);

export function isRegion(value: unknown): value is Region {
  return typeof value === "string" && REGIONS.some((region) => region === value);
}

export function regionForCountryCode(countryCode: string | null | undefined): Region {
  const code = countryCode?.trim().toUpperCase();
  if (!code) return "OTHER";
  if (code === "US") return "US";
  if (code === "GB") return "UK";
  if (code === "IN") return "IN";
  if (code === "DE") return "DE";
  if (code === "FR") return "FR";
  if (code === "IT") return "IT";
  if (code === "ES") return "ES";
  if (code === "NL") return "NL";
  if (code === "JP") return "JP";
  if (code === "BR") return "BR";
  if (code === "MX") return "MX";
  if (EU_MEMBER_CODES.has(code)) return "EU";
  if (code === "CA") return "CA";
  if (code === "AU") return "AU";
  if (code === "AE") return "AE";
  if (code === "SG") return "SG";
  if (code === "PH") return "PH";
  if (code === "KE") return "KE";
  if (code === "RW") return "RW";
  if (code === "ZA") return "ZA";
  if (code === "NG") return "NG";
  if (AFRICAN_CODES.has(code)) return "AF";
  return "OTHER";
}

export type RegionalStrategy = {
  region: Region;
  jurisdiction: string;
  removalMethod: "google-policy-review";
  worker: string;
  policyUrl: "https://support.google.com/contributionpolicy/answer/7400114";
  legalGuidance: string;
};

const JURISDICTIONS: Record<Region, string> = {
  UK: "United Kingdom",
  EU: "European Union",
  DE: "Germany",
  IN: "India",
  US: "United States",
  CA: "Canada",
  AU: "Australia",
  FR: "France",
  IT: "Italy",
  ES: "Spain",
  NL: "Netherlands",
  JP: "Japan",
  BR: "Brazil",
  MX: "Mexico",
  AE: "United Arab Emirates",
  SG: "Singapore",
  PH: "Philippines",
  KE: "Kenya",
  RW: "Rwanda",
  ZA: "South Africa",
  NG: "Nigeria",
  AF: "Africa (country not specified)",
  OTHER: "Other / not determined",
};

export const COUNTRY_NAME_BY_CODE: Readonly<Record<string, string>> = {
  US: "United States",
  GB: "United Kingdom",
  UK: "United Kingdom",
  IN: "India",
  DE: "Germany",
  FR: "France",
  IT: "Italy",
  ES: "Spain",
  NL: "Netherlands",
  CA: "Canada",
  AU: "Australia",
  JP: "Japan",
  SG: "Singapore",
  PH: "Philippines",
  AE: "United Arab Emirates",
  KE: "Kenya",
  RW: "Rwanda",
  ZA: "South Africa",
  NG: "Nigeria",
  BR: "Brazil",
  MX: "Mexico",
};

export function regionForAddress(address: string | null | undefined): Region {
  const lastSegment = address?.split(",").at(-1)?.trim().toLowerCase();
  if (!lastSegment) return "OTHER";
  const aliases: Record<string, Region> = {
    "united states": "US",
    "united states of america": "US",
    usa: "US",
    "united kingdom": "UK",
    uk: "UK",
    britain: "UK",
    india: "IN",
    germany: "DE",
    deutschland: "DE",
    france: "FR",
    italy: "IT",
    spain: "ES",
    netherlands: "NL",
    "the netherlands": "NL",
    canada: "CA",
    australia: "AU",
    japan: "JP",
    singapore: "SG",
    philippines: "PH",
    "united arab emirates": "AE",
    uae: "AE",
    kenya: "KE",
    rwanda: "RW",
    "south africa": "ZA",
    nigeria: "NG",
    brazil: "BR",
    mexico: "MX",
  };
  return aliases[lastSegment] ?? "OTHER";
}

export function getRegionalStrategy(region: Region): RegionalStrategy {
  return {
    region,
    jurisdiction: JURISDICTIONS[region],
    removalMethod: "google-policy-review",
    worker: `${region.toLowerCase()}-policy-strategy`,
    policyUrl: "https://support.google.com/contributionpolicy/answer/7400114",
    legalGuidance:
      "Use Google's published content policies as the reporting basis. Jurisdiction-specific legal remedies require fact-specific review by qualified local counsel; do not allege a statutory violation or threaten legal action without that review.",
  };
}

export function regionFromPlace(
  countryCode: string | null | undefined,
  override?: Region | null,
): Region {
  const detected = regionForCountryCode(countryCode);
  return countryCode && detected !== "OTHER" ? detected : (override ?? detected);
}
