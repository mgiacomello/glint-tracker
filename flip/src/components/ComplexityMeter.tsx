"use client";

import { complexityMeta } from "@/lib/analysis/types";
import { useT } from "@/lib/i18n/provider";

/** LX Complexity Score (0-100) — how hard the original document is to read. */
export function ComplexityMeter({ score }: { score: number }) {
  const t = useT();
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const meta = complexityMeta(s);
  const band = s >= 67 ? "hard" : s >= 34 ? "medium" : "easy";
  const label = t(`complexity.${band}`);
  return (
    <div
      className="rounded-2xl bg-surface p-4 shadow-[var(--shadow-card)]"
      role="group"
      aria-label={t("complexity.aria", { n: s, label })}
    >
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-content-soft">
          {t("complexity.title")}
          <span className="ml-1 font-normal text-content-mute">· {t("complexity.subtitle")}</span>
        </p>
        <p className="text-lg font-extrabold tabular-nums" style={{ color: meta.color }}>
          {s}
          <span className="text-sm font-medium text-content-mute">/100</span>
        </p>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-200" aria-hidden>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${s}%`, backgroundColor: meta.color }}
        />
      </div>
      <p className="mt-1.5 text-xs font-medium" style={{ color: meta.color }}>
        {label}
      </p>
    </div>
  );
}
