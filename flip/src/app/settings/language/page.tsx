"use client";

import { Check } from "lucide-react";
import { SubPage } from "@/components/SubPage";
import { LANGUAGES, type LangCode } from "@/lib/i18n";
import { useT, useI18n } from "@/lib/i18n/provider";

export default function LanguagePage() {
  const t = useT();
  const { lang, setLang } = useI18n();

  const choose = (code: LangCode) => {
    setLang(code);
  };

  return (
    <SubPage title={t("language.title")} subtitle={t("language.subtitle")}>
      <div className="space-y-2">
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            onClick={() => choose(l.code)}
            className="flex w-full items-center gap-3 rounded-2xl bg-surface p-4 text-left shadow-[var(--shadow-card)]"
          >
            <span className="text-2xl">{l.flag}</span>
            <span className="flex-1 font-semibold">{l.label}</span>
            {lang === l.code && <Check className="h-5 w-5 text-flip-600" />}
          </button>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-content-mute">
        {t("language.footer")}
      </p>
    </SubPage>
  );
}
