import type { LangCode } from "@/lib/i18n";

/** A flat key→string table for one language. Keys are namespaced, e.g. "home.title". */
export type Table = Record<string, string>;

/** A dictionary: one Table per supported language. */
export type Dict = Record<LangCode, Table>;

export const LANGS: LangCode[] = ["it", "en", "es", "fr", "de"];

/** Empty dict scaffold — spread into a namespace to guarantee every language key exists. */
export const emptyDict = (): Dict => ({ it: {}, en: {}, es: {}, fr: {}, de: {} });
