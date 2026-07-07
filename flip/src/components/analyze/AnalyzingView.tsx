"use client";

import { LottieMascot } from "@/components/LottieMascot";
import { useT } from "@/lib/i18n/provider";

export function AnalyzingView({
  fileName,
  progress,
  partialSummary,
}: {
  fileName: string;
  progress: number;
  partialSummary?: string;
}) {
  const t = useT();
  return (
    <div className="flex flex-1 flex-col items-center px-8 pt-12 text-center">
      <div className="relative">
        <LottieMascot size={150} expression={partialSummary ? "happy" : "reading"} />
        {partialSummary && (
          <span className="absolute -right-1 top-0 grid h-9 w-9 animate-pop place-items-center rounded-full bg-amber-400 text-lg shadow-md">
            💡
          </span>
        )}
      </div>
      <h2 className="mt-4 text-2xl font-extrabold">
        {partialSummary ? t("analyzing.foundTitle") : t("analyzing.readingTitle")}
      </h2>
      <p className="mt-2 max-w-xs text-content-soft">
        {partialSummary ? t("analyzing.foundSub") : t("analyzing.readingSub")}
      </p>

      <div className="mt-8 h-2 w-full max-w-xs overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-flip-500 transition-all duration-300"
          style={{ width: `${Math.min(100, Math.round(progress))}%` }}
        />
      </div>
      <p className="mt-2 text-sm font-semibold text-content-soft">
        {Math.min(100, Math.round(progress))}%
      </p>

      {partialSummary && (
        <p className="mt-8 max-w-xs animate-rise text-sm leading-relaxed text-content-mute">
          “{partialSummary}”
        </p>
      )}

      <p className="mt-auto pb-8 text-xs text-content-mute">{fileName}</p>
    </div>
  );
}
