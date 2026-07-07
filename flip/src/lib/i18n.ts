// Server-safe module: no "use client" so `langInstruction` can run in API routes.
// Browser-only helpers below guard access with `typeof window`.

export const LANGUAGES = [
  { code: "it", label: "Italiano", flag: "🇮🇹", instruction: "italiano" },
  { code: "en", label: "English", flag: "🇬🇧", instruction: "English" },
  { code: "es", label: "Español", flag: "🇪🇸", instruction: "español" },
  { code: "fr", label: "Français", flag: "🇫🇷", instruction: "français" },
  { code: "de", label: "Deutsch", flag: "🇩🇪", instruction: "Deutsch" },
] as const;

export type LangCode = (typeof LANGUAGES)[number]["code"];

const KEY = "flip:lang";

export function getLang(): LangCode {
  if (typeof window === "undefined") return "it";
  return (localStorage.getItem(KEY) as LangCode) || "it";
}

export function setLang(code: LangCode) {
  localStorage.setItem(KEY, code);
}

/** Server-side: map a lang code to the language name for the prompt. */
export function langInstruction(code: string | null): string {
  const found = LANGUAGES.find((l) => l.code === code);
  return found?.instruction ?? "italiano";
}
