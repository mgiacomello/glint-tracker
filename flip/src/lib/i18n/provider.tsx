"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { messages } from "./messages";
import { getLang, setLang as persistLang, type LangCode } from "@/lib/i18n";

type Vars = Record<string, string | number>;

export type TranslateFn = (key: string, vars?: Vars) => string;

interface I18nContextValue {
  lang: LangCode;
  setLang: (code: LangCode) => void;
  t: TranslateFn;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Start on "it" so SSR and the first client paint match; hydrate the real
  // choice from localStorage right after mount.
  const [lang, setLangState] = useState<LangCode>("it");

  useEffect(() => {
    setLangState(getLang());
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((code: LangCode) => {
    persistLang(code);
    setLangState(code);
  }, []);

  const t = useCallback<TranslateFn>(
    (key, vars) => {
      const table = messages[lang] ?? messages.it;
      let s = table[key] ?? messages.it[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.split(`{${k}}`).join(String(v));
        }
      }
      return s;
    },
    [lang],
  );

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}

/** Convenience hook: `const t = useT()` then `t("home.title")`. */
export function useT(): TranslateFn {
  return useI18n().t;
}

/** Current language code, reactive. */
export function useLang(): LangCode {
  return useI18n().lang;
}
