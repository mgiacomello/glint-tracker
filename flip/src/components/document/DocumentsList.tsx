"use client";

import Link from "next/link";
import { FileText, Trash2 } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { BottomNav } from "@/components/BottomNav";
import { LottieMascot } from "@/components/LottieMascot";
import { RiskDot } from "@/components/RiskBadge";
import { useDocuments } from "@/lib/useDocuments";
import { removeDocument } from "@/lib/store";
import type { RiskLevel } from "@/lib/analysis/types";
import type { FlipUser } from "@/lib/auth";
import { useT, useLang, type TranslateFn } from "@/lib/i18n/provider";
import type { LangCode } from "@/lib/i18n";

const LOCALE: Record<LangCode, string> = {
  it: "it-IT",
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
};

const RISK_LABEL_KEY: Record<RiskLevel, string> = {
  safe: "docs.risk.safe",
  warn: "docs.risk.warn",
  danger: "docs.risk.danger",
};

function timeAgo(ts: number, t: TranslateFn, lang: LangCode): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return t("docs.time.now");
  if (s < 3600) return t("docs.time.min", { n: Math.floor(s / 60) });
  if (s < 86400) return t("docs.time.hour", { n: Math.floor(s / 3600) });
  return new Date(ts).toLocaleDateString(LOCALE[lang], { day: "numeric", month: "short" });
}

export function DocumentsList({ user }: { user: FlipUser }) {
  const { docs, ready } = useDocuments();
  const t = useT();
  const lang = useLang();

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar user={user} />
      <main className="flex-1 px-5 py-4 pb-24">
        <h1 className="mb-4 text-2xl font-extrabold">{t("docs.title")}</h1>

        {ready && docs.length === 0 && (
          <div className="mt-14 flex flex-col items-center text-center text-content-mute">
            <LottieMascot size={130} />
            <p className="mt-3 text-lg font-extrabold text-content">{t("docs.empty.title")}</p>
            <p className="mt-1 text-sm text-content-soft">{t("docs.empty.subtitle")}</p>
            <Link href="/" className="mt-5 btn-pop rounded-2xl bg-flip-500 px-6 py-3 font-extrabold uppercase tracking-wide text-white">
              {t("docs.empty.cta")}
            </Link>
          </div>
        )}

        <div className="space-y-3">
          {docs.map((d, i) => (
            <div
              key={d.id}
              style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
              className="group flex animate-rise items-center gap-3 rounded-2xl bg-surface p-4 shadow-[var(--shadow-card)] transition active:scale-[0.99]"
            >
              <Link href={`/document/${d.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-flip-50 text-flip-600">
                  <FileText className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold">
                    {!d.read && <span className="h-2 w-2 rounded-full bg-flip-500" />}
                    <span className="truncate">{d.analysis.title}</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-content-mute">
                    <RiskDot risk={d.analysis.overallRisk} />
                    {t(RISK_LABEL_KEY[d.analysis.overallRisk])} · {timeAgo(d.createdAt, t, lang)}
                  </span>
                </span>
              </Link>
              <button
                onClick={() => removeDocument(d.id)}
                aria-label={t("docs.delete")}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-content-mute hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
