import {
  COUNTRY_LEGAL_INFO,
  LEGAL_COUNTRIES,
  isLegalCountry,
  type CountryLegalInfo,
  type LegalCountry,
} from "./legal-laws/country-laws";
import { getCountryTemplates } from "./legal-templates/country-templates";
import { BaseLegalWorker } from "../../workers/legal/base.worker";

export class CountryLegalWorker extends BaseLegalWorker {
  readonly country: LegalCountry;
  readonly laws: CountryLegalInfo["laws"];
  readonly templates = getCountryTemplates();
  protected readonly legalNote: string;

  constructor(info: CountryLegalInfo) {
    super();
    this.country = info.country;
    this.laws = info.laws;
    this.legalNote = info.legalCaveat;
  }
}

export const LEGAL_WORKERS: ReadonlyMap<LegalCountry, CountryLegalWorker> = new Map(
  LEGAL_COUNTRIES.map((country) => [country, new CountryLegalWorker(COUNTRY_LEGAL_INFO[country])]),
);

export function getLegalWorker(country: string | null | undefined) {
  return isLegalCountry(country) ? LEGAL_WORKERS.get(country) : undefined;
}
