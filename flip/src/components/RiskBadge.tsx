"use client";

import { type RiskLevel } from "@/lib/analysis/types";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

const TONE: Record<RiskLevel, string> = {
  safe: "bg-flip-50 border-flip-200 text-flip-700",
  warn: "bg-amber-50 border-amber-200 text-amber-700",
  danger: "bg-rose-50 border-rose-200 text-rose-700",
};

const DOT: Record<RiskLevel, string> = {
  safe: "bg-risk-safe",
  warn: "bg-risk-warn",
  danger: "bg-risk-danger",
};

/** Big headline badge (the "Attento" block). */
export function RiskHeadline({
  risk,
  headline,
}: {
  risk: RiskLevel;
  headline: string;
}) {
  const t = useT();
  return (
    <div className={cn("flex gap-3 rounded-2xl border p-4", TONE[risk])}>
      <span className={cn("mt-1 h-4 w-4 shrink-0 rounded-full", DOT[risk])} />
      <div>
        <p className="font-bold">{t(`risk.${risk}.label`)}</p>
        <p className="text-sm leading-snug opacity-90">{headline}</p>
      </div>
    </div>
  );
}

/** Small inline risk dot. */
export function RiskDot({ risk, className }: { risk: RiskLevel; className?: string }) {
  return <span className={cn("h-2.5 w-2.5 rounded-full", DOT[risk], className)} />;
}
