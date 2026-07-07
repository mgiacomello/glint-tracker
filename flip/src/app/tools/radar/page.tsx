"use client";

import Link from "next/link";
import { Radar, ShieldCheck } from "lucide-react";
import { SubPage, EmptyState } from "@/components/SubPage";
import { useDocuments } from "@/lib/useDocuments";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

export default function RadarPage() {
  const { docs } = useDocuments();
  const t = useT();

  const alerts = docs
    .flatMap((d) =>
      d.analysis.points
        .filter((p) => p.risk !== "safe")
        .map((p) => ({ p, docId: d.id, docTitle: d.analysis.title })),
    )
    .sort((a, b) => (a.p.risk === "danger" ? -1 : 1) - (b.p.risk === "danger" ? -1 : 1));

  return (
    <SubPage title={t("radar.title")} subtitle={t("radar.subtitle")}>
      {docs.length === 0 ? (
        <EmptyState
          icon={<Radar className="h-14 w-14" />}
          title={t("radar.empty.title")}
          hint={t("radar.empty.hint")}
          cta={
            <Link href="/" className="btn-pop rounded-2xl bg-flip-500 px-6 py-3 font-extrabold uppercase tracking-wide text-white">
              {t("radar.empty.cta")}
            </Link>
          }
        />
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-14 w-14 text-flip-500" />}
          title={t("radar.noRisk.title")}
          hint={t("radar.noRisk.hint")}
        />
      ) : (
        <div className="space-y-3">
          {alerts.map(({ p, docId, docTitle }, i) => {
            const emoji = p.risk === "danger" ? "🔴" : "🟠";
            const riskLabel = t(`risk.${p.risk}.label`);
            return (
              <Link
                key={i}
                href={`/document/${docId}`}
                className={cn(
                  "block rounded-2xl border-l-4 bg-surface p-4 shadow-[var(--shadow-card)]",
                  p.risk === "danger" ? "border-risk-danger" : "border-risk-warn",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{emoji}</span>
                  <span
                    className={cn(
                      "text-xs font-bold uppercase tracking-wide",
                      p.risk === "danger" ? "text-rose-600" : "text-amber-600",
                    )}
                  >
                    {riskLabel}
                  </span>
                </div>
                <p className="mt-1 font-bold">{p.title}</p>
                <p className="mt-0.5 text-sm text-content-soft">{p.keepInMind}</p>
                <p className="mt-2 truncate text-xs text-content-mute">{t("radar.from", { n: docTitle })}</p>
              </Link>
            );
          })}
        </div>
      )}
    </SubPage>
  );
}
