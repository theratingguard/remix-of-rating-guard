export const LEGAL_COUNTRIES = [
  "US",
  "UK",
  "IN",
  "DE",
  "FR",
  "IT",
  "ES",
  "NL",
  "CA",
  "AU",
  "JP",
  "SG",
  "PH",
  "AE",
  "KE",
  "RW",
  "ZA",
  "NG",
  "BR",
  "MX",
] as const;

export type LegalCountry = (typeof LEGAL_COUNTRIES)[number];
export function isLegalCountry(value: unknown): value is LegalCountry {
  return typeof value === "string" && LEGAL_COUNTRIES.some((country) => country === value);
}

export type CountryLaw = {
  name: string;
  citation: string;
  sourceUrl: string;
  scope: string;
  sourceStatus: "official-text-retrieved" | "official-source-reference";
};

export type CountryLegalInfo = {
  country: LegalCountry;
  name: string;
  laws: CountryLaw[];
  publicLawPortal: string;
  legalCaveat: string;
};

const reference = (
  name: string,
  citation: string,
  sourceUrl: string,
  scope: string,
  sourceStatus: CountryLaw["sourceStatus"] = "official-source-reference",
): CountryLaw => ({ name, citation, sourceUrl, scope, sourceStatus });

const noAutomaticRemoval =
  "Informational legal reference only; it does not establish a violation or automatically require Google to remove a review.";

export const COUNTRY_LEGAL_INFO: Record<LegalCountry, CountryLegalInfo> = {
  US: {
    country: "US",
    name: "United States",
    laws: [
      reference(
        "FTC Consumer Reviews and Testimonials Rule",
        "16 C.F.R. Part 465",
        "https://www.ecfr.gov/current/title-16/chapter-I/subchapter-D/part-465",
        `Addresses specified deceptive commercial review and testimonial practices. ${noAutomaticRemoval}`,
      ),
    ],
    publicLawPortal: "https://uscode.house.gov/",
    legalCaveat:
      "State defamation laws vary; the federal commercial rule is not a general review-removal right.",
  },
  UK: {
    country: "UK",
    name: "United Kingdom",
    laws: [
      reference(
        "Digital Markets, Competition and Consumers Act 2024",
        "2024 c. 13, Part 4, Chapter 1 and Schedule 20",
        "https://www.legislation.gov.uk/ukpga/2024/13/contents",
        `Covers specified consumer unfair-commercial-practice and fake-review conduct. ${noAutomaticRemoval}`,
      ),
    ],
    publicLawPortal: "https://www.legislation.gov.uk/",
    legalCaveat:
      "Do not rely on the replaced Consumer Protection from Unfair Trading Regulations 2008 for the current regime.",
  },
  IN: {
    country: "IN",
    name: "India",
    laws: [
      reference(
        "Consumer Protection Act 2019",
        "Act 35 of 2019",
        "https://www.indiacode.nic.in/handle/123456789/15256",
        `General consumer-protection law; no review-specific national takedown entitlement is identified here. ${noAutomaticRemoval}`,
      ),
      reference(
        "Consumer Protection (E-Commerce) Rules 2020",
        "G.S.R. 462(E), 23 July 2020",
        "https://consumeraffairs.nic.in/",
        `Applies within its e-commerce scope. ${noAutomaticRemoval}`,
      ),
    ],
    publicLawPortal: "https://www.indiacode.nic.in/",
    legalCaveat:
      "Use current law; do not rely on repealed IPC section 66A or treat a consumer rule as automatic review removal.",
  },
  DE: {
    country: "DE",
    name: "Germany",
    laws: [
      reference(
        "Act Against Unfair Competition (UWG)",
        "Section 5b(3), section 3(3), Annex items 23b–23c",
        "https://www.gesetze-im-internet.de/uwg_2004/__5b.html",
        `Addresses trader review-verification disclosures and certain fake-review practices; verified official text. ${noAutomaticRemoval}`,
        "official-text-retrieved",
      ),
    ],
    publicLawPortal: "https://www.gesetze-im-internet.de/",
    legalCaveat:
      "These consumer-commerce provisions do not automatically impose a takedown duty on Google.",
  },
  FR: {
    country: "FR",
    name: "France",
    laws: [
      reference(
        "Code de la consommation",
        "Articles L. 121-4 and L. 111-7-2",
        "https://www.legifrance.gouv.fr/codes/id/LEGITEXT000006069565/",
        `Addresses specified unfair practices and covered platform consumer-review transparency. ${noAutomaticRemoval}`,
      ),
    ],
    publicLawPortal: "https://www.legifrance.gouv.fr/",
    legalCaveat:
      "Scope depends on the conduct and the entity's role; no automatic review removal follows.",
  },
  IT: {
    country: "IT",
    name: "Italy",
    laws: [
      reference(
        "Consumer Code (Codice del consumo)",
        "Legislative Decree No. 206/2005, Article 23, as amended by Legislative Decree No. 26/2023",
        "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2005-09-06;206",
        `Addresses specified unfair commercial practices including fake or unverified consumer reviews. ${noAutomaticRemoval}`,
      ),
    ],
    publicLawPortal: "https://www.normattiva.it/",
    legalCaveat:
      "This concerns covered commercial conduct, not a general right to compel Google to remove a review.",
  },
  ES: {
    country: "ES",
    name: "Spain",
    laws: [
      reference(
        "Unfair Competition Act",
        "Ley 3/1991, Article 27, as amended",
        "https://www.boe.es/buscar/act.php?id=BOE-A-1991-628",
        `Addresses unfair commercial practices, including specified review-related practices. ${noAutomaticRemoval}`,
      ),
    ],
    publicLawPortal: "https://www.boe.es/legislacion/",
    legalCaveat:
      "Applies to covered commercial conduct and does not automatically require removal of a Google review.",
  },
  NL: {
    country: "NL",
    name: "Netherlands",
    laws: [
      reference(
        "Dutch Civil Code, Book 6",
        "Article 6:193g and EU fake-review rules as implemented in Dutch law",
        "https://wetten.overheid.nl/BWBR0005289/",
        `Addresses specified unfair commercial practices. ${noAutomaticRemoval}`,
      ),
    ],
    publicLawPortal: "https://wetten.overheid.nl/",
    legalCaveat:
      "The commercial-practice provisions do not themselves establish an automatic Google takedown obligation.",
  },
  CA: {
    country: "CA",
    name: "Canada",
    laws: [
      reference(
        "Competition Act",
        "R.S.C. 1985, c. C-34, subsection 74.01(1)(a)",
        "https://laws-lois.justice.gc.ca/eng/acts/C-34/FullText.html",
        `Covers materially false or misleading representations to the public in their commercial context; official consolidated text retrieved. ${noAutomaticRemoval}`,
        "official-text-retrieved",
      ),
    ],
    publicLawPortal: "https://laws-lois.justice.gc.ca/",
    legalCaveat:
      "Provincial or territorial rules may also apply; federal competition law is not an automatic removal right.",
  },
  AU: {
    country: "AU",
    name: "Australia",
    laws: [
      reference(
        "Competition and Consumer Act 2010 / Australian Consumer Law",
        "Schedule 2, sections 18 and 29",
        "https://www.legislation.gov.au/C2004A00109/latest/text",
        `Addresses misleading or deceptive conduct and specified false representations. ${noAutomaticRemoval}`,
      ),
    ],
    publicLawPortal: "https://www.legislation.gov.au/",
    legalCaveat:
      "Defamation provisions are state/territory based; verify the applicable jurisdiction and current amendments.",
  },
  JP: {
    country: "JP",
    name: "Japan",
    laws: [
      reference(
        "Act against Unjustifiable Premiums and Misleading Representations",
        "Act No. 134 of 1962, Article 5; stealth-marketing designation effective 1 October 2023",
        "https://elaws.e-gov.go.jp/document?lawid=337AC0000000134",
        `Addresses specified misleading representations and undisclosed advertising, not every disputed review. ${noAutomaticRemoval}`,
      ),
    ],
    publicLawPortal: "https://elaws.e-gov.go.jp/",
    legalCaveat:
      "Ordinary negative or disputed reviews are not automatically unlawful under this statute.",
  },
  SG: {
    country: "SG",
    name: "Singapore",
    laws: [
      reference(
        "Consumer Protection (Fair Trading) Act 2003",
        "Section 4 and related provisions",
        "https://sso.agc.gov.sg/Act/CPFTA2003",
        `Addresses unfair practices and misleading representations in covered consumer transactions. ${noAutomaticRemoval}`,
      ),
    ],
    publicLawPortal: "https://sso.agc.gov.sg/",
    legalCaveat:
      "The Protection from Online Falsehoods Act is not a general route for removing ordinary negative reviews.",
  },
  PH: {
    country: "PH",
    name: "Philippines",
    laws: [
      reference(
        "Consumer Act of the Philippines",
        "Republic Act No. 7394 (1992), Article 50",
        "https://www.officialgazette.gov.ph/1992/04/13/republic-act-no-7394-s-1992/",
        `Article 50 concerns deceptive sales acts or practices. ${noAutomaticRemoval}`,
      ),
    ],
    publicLawPortal: "https://www.officialgazette.gov.ph/",
    legalCaveat:
      "This is not a general review-removal mechanism or an automatic Google takedown rule.",
  },
  AE: {
    country: "AE",
    name: "United Arab Emirates",
    laws: [
      reference(
        "Federal Consumer Protection Law",
        "Federal Law No. 15 of 2020, amended by Federal Decree-Law No. 14 of 2023; Cabinet Resolution No. 66 of 2023",
        "https://uaelegislation.gov.ae/en/legislations/1529",
        `Consumer protections apply subject to statutory scope and implementing regulations. ${noAutomaticRemoval}`,
      ),
    ],
    publicLawPortal: "https://uaelegislation.gov.ae/",
    legalCaveat:
      "Do not characterize ordinary criticism as unlawful; confirm current text and scope with UAE counsel.",
  },
  KE: {
    country: "KE",
    name: "Kenya",
    laws: [
      reference(
        "Consumer Protection Act",
        "No. 46 of 2012",
        "https://kenyalaw.org/akn/ke/act/2012/46/eng@2022-12-31",
        `Includes protections concerning false or misleading representations; official text retrieved. ${noAutomaticRemoval}`,
        "official-text-retrieved",
      ),
    ],
    publicLawPortal: "https://kenyalaw.org/",
    legalCaveat:
      "The Act's application depends on the facts and does not create an automatic Google review removal entitlement.",
  },
  RW: {
    country: "RW",
    name: "Rwanda",
    laws: [
      reference(
        "Law governing competition and consumer protection",
        "Law No. 31/2023 of 25 July 2023",
        "https://www.minijust.gov.rw/",
        `A review-specific national takedown provision has not been identified. ${noAutomaticRemoval}`,
      ),
    ],
    publicLawPortal: "https://www.minijust.gov.rw/",
    legalCaveat:
      "Law No. 36/2012 is superseded; verify the current text of Law No. 31/2023 with Rwandan counsel.",
  },
  ZA: {
    country: "ZA",
    name: "South Africa",
    laws: [
      reference(
        "Consumer Protection Act 68 of 2008",
        "Sections 29 and 41",
        "https://www.gov.za/documents/consumer-protection-act",
        `Addresses marketing and false or misleading representations in its scope. ${noAutomaticRemoval}`,
      ),
    ],
    publicLawPortal: "https://www.gov.za/documents",
    legalCaveat:
      "These provisions do not themselves create an automatic Google review takedown duty.",
  },
  NG: {
    country: "NG",
    name: "Nigeria",
    laws: [
      reference(
        "Federal Competition and Consumer Protection Act 2018",
        "Federal Act of 2018",
        "https://fccpc.gov.ng/",
        `Addresses specified false or misleading representations within the Act's enforcement framework. ${noAutomaticRemoval}`,
      ),
    ],
    publicLawPortal: "https://fccpc.gov.ng/",
    legalCaveat:
      "The Consumer Protection Council Act 1992 was repealed; state-specific law may also be relevant.",
  },
  BR: {
    country: "BR",
    name: "Brazil",
    laws: [
      reference(
        "Consumer Defence Code",
        "Law No. 8,078/1990, Articles 36–38",
        "https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm",
        `Articles address identification and misleading or abusive advertising. ${noAutomaticRemoval}`,
      ),
    ],
    publicLawPortal: "https://www.planalto.gov.br/ccivil_03/",
    legalCaveat:
      "Advertising provisions apply according to facts and do not automatically require Google to remove a review.",
  },
  MX: {
    country: "MX",
    name: "Mexico",
    laws: [
      reference(
        "Federal Consumer Protection Law",
        "Articles 32 and 76 Bis",
        "https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPC.pdf",
        `Addresses truthful, verifiable advertising and specified online consumer transactions. ${noAutomaticRemoval}`,
      ),
    ],
    publicLawPortal: "https://www.diputados.gob.mx/LeyesBiblio/",
    legalCaveat:
      "The provisions apply within their scope and are not an automatic Google review removal mechanism.",
  },
};
