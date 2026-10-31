export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "sw", label: "Swahili (Kenya, Tanzania)", native: "Kiswahili" },
  { code: "zu", label: "Zulu (South Africa)", native: "isiZulu" },
  { code: "af", label: "Afrikaans (South Africa)", native: "Afrikaans" },
  { code: "am", label: "Amharic (Ethiopia)", native: "አማርኛ" },
  { code: "ha", label: "Hausa (Nigeria)", native: "Hausa" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export function isLanguageCode(code: string | null | undefined): code is LanguageCode {
  return SUPPORTED_LANGUAGES.some((language) => language.code === code);
}

export function languageName(code: string): string {
  return SUPPORTED_LANGUAGES.find((language) => language.code === code)?.label ?? code;
}
