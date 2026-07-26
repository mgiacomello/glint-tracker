"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Play,
  Pause,
  FileText,
  ChevronRight,
  ChevronDown,
  TriangleAlert,
  Check,
  CalendarClock,
  Lightbulb,
} from "lucide-react";
import { Card } from "@/components/ui";
import { useTTS } from "@/lib/tts";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { DemoBanner } from "@/components/DemoBanner";
import { LottieMascot } from "@/components/LottieMascot";
import { moodForRisk, complexityMeta } from "@/lib/analysis/types";
import type { DocumentAnalysis, AnalysisPoint, RiskLevel } from "@/lib/analysis/types";

// Order points by decision-relevance: risky first, safe last (stable within group).
const RISK_RANK: Record<RiskLevel, number> = { danger: 0, warn: 1, safe: 2 };

export function ResultView({
  fileName,
  analysis,
  onBack,
}: {
  fileName: string;
  analysis: DocumentAnalysis;
  onBack?: () => void;
}) {
  const router = useRouter();
  const t = useT();
  const [openPoint, setOpenPoint] = useState<AnalysisPoint | null>(null);
  const back = onBack ?? (() => router.push("/"));

  if (openPoint) {
    return <DeepDive fileName={fileName} point={openPoint} onBack={() => setOpenPoint(null)} />;
  }

  const points = [...analysis.points].sort((a, b) => RISK_RANK[a.risk] - RISK_RANK[b.risk]);

  return (
    <div className="flex min-h-dvh flex-col">
      <Header title={t("result.header")} subtitle={fileName} onBack={back} />

      <main className="flex-1 space-y-6 px-5 py-5 pb-12">
        <DemoBanner />

        {/* 1 · What it is — plain-language framing */}
        <section className="animate-rise space-y-2">
          <h1 className="text-2xl font-extrabold leading-tight break-words">{analysis.title}</h1>
          <p className="leading-relaxed text-content-soft break-words">{analysis.summary}</p>
          <ComplexityChip score={analysis.complexity} />
        </section>

        {/* 2 · The verdict + the one thing to do */}
        <VerdictHero analysis={analysis} />

        {/* 3 · The points to understand (most important first) */}
        {points.length > 0 && (
          <section>
            <h2 className="flex items-center gap-2 font-bold">
              <TriangleAlert className="h-5 w-5 text-amber-500" />
              {t("result.readCarefully", { n: points.length })}
            </h2>
            <p className="mb-3 mt-0.5 text-sm text-content-mute">{t("result.points.sub")}</p>
            <div className="space-y-3">
              {points.map((p, i) => (
                <button
                  key={p.order}
                  onClick={() => setOpenPoint(p)}
                  style={{ animationDelay: `${i * 50}ms` }}
                  className="flex w-full animate-rise items-center gap-3 rounded-2xl bg-surface p-4 text-left shadow-[var(--shadow-card)] transition hover:shadow-[var(--shadow-float)] active:scale-[0.99]"
                >
                  <span
                    className={cn(
                      "grid h-9 w-9 shrink-0 place-items-center rounded-full font-bold",
                      NUM_TONE[p.risk],
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold break-words">{p.title}</span>
                    <span className="line-clamp-1 text-sm text-content-mute">{p.teaser}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-content-mute" />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 4 · Secondary tools — quieter, supporting the message not competing with it */}
        <section className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-content-mute">
            {t("result.tools")}
          </p>
          <AudioPlayer transcript={analysis.transcript} />
          {analysis.deadlines.length > 0 && (
            <div className="rounded-2xl bg-surface p-4 shadow-[var(--shadow-card)]">
              <p className="mb-2 flex items-center gap-2 text-sm font-bold text-content">
                <CalendarClock className="h-4 w-4 shrink-0 text-amber-600" />
                {t(
                  analysis.deadlines.length === 1 ? "result.deadlines.one" : "result.deadlines.other",
                  { n: analysis.deadlines.length },
                )}
              </p>
              <ul className="space-y-1.5">
                {analysis.deadlines.map((d, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 break-words text-content-soft">
                      {d.title}
                      {d.date ? ` · ${new Date(d.date).toLocaleDateString()}` : ""}
                    </span>
                    {d.amount && <span className="shrink-0 font-semibold text-flip-700">{d.amount}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

/* ── LX complexity chip: how hard the ORIGINAL is to read ─── */
function ComplexityChip({ score }: { score: number }) {
  const t = useT();
  const meta = complexityMeta(score);
  const bandKey =
    score >= 67 ? "complexity.hard" : score >= 34 ? "complexity.medium" : "complexity.easy";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-content-soft">
      <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
      {t("result.difficulty", { label: t(bandKey) })}
    </span>
  );
}

/* ── Verdict hero: risk semaphore + the single action ─────── */
const HERO_TONE: Record<RiskLevel, string> = {
  safe: "bg-flip-50 border-flip-200",
  warn: "bg-amber-50 border-amber-200",
  danger: "bg-rose-50 border-rose-200",
};
const HERO_TEXT: Record<RiskLevel, string> = {
  safe: "text-flip-700",
  warn: "text-amber-700",
  danger: "text-rose-700",
};
const NUM_TONE: Record<RiskLevel, string> = {
  safe: "bg-flip-100 text-flip-700",
  warn: "bg-amber-100 text-amber-700",
  danger: "bg-rose-100 text-rose-700",
};

const VERDICT_KEY: Record<RiskLevel, string> = {
  safe: "result.verdict.safe",
  warn: "result.verdict.warn",
  danger: "result.verdict.danger",
};

function VerdictHero({ analysis }: { analysis: DocumentAnalysis }) {
  const t = useT();
  const risk = analysis.overallRisk;
  const traps = analysis.points.filter((p) => p.risk !== "safe");

  const sub =
    traps.length === 0
      ? t("result.verdict.noTraps")
      : risk === "danger"
        ? t(traps.length === 1 ? "result.verdict.risky.one" : "result.verdict.risky.other", {
            n: traps.length,
          })
        : t(traps.length === 1 ? "result.verdict.check.one" : "result.verdict.check.other", {
            n: traps.length,
          });

  return (
    <div className="animate-rise">
      <div className={cn("rounded-[var(--radius-card)] border p-5", HERO_TONE[risk])}>
        <div className="flex items-center gap-3">
          {/* Mascot as the verdict's face — subtle, reacts to risk */}
          <span className="-my-1 -ml-1 shrink-0">
            <LottieMascot size={64} expression={moodForRisk(risk)} />
          </span>
          <div>
            <p className={cn("text-2xl font-extrabold leading-tight", HERO_TEXT[risk])}>
              {t(VERDICT_KEY[risk])}
            </p>
            <p className={cn("mt-1 text-sm font-semibold", HERO_TEXT[risk])}>{sub}</p>
          </div>
        </div>

        {/* Cosa fare — the single, clear, actionable next step */}
        <div className="mt-4 rounded-2xl bg-white/70 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-content-mute">
            {t("result.whatToDo")}
          </p>
          <p className="mt-0.5 leading-snug text-content break-words">{analysis.headline}</p>
        </div>
      </div>
    </div>
  );
}

/* ── Audio player (Web Speech TTS) — secondary tool ───────── */
function AudioPlayer({ transcript }: { transcript: string }) {
  const { speaking, supported, toggle, speak } = useTTS();
  const t = useT();
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    const onVoicePlay = () => speak(transcript);
    window.addEventListener("flip:voice-play", onVoicePlay);
    return () => window.removeEventListener("flip:voice-play", onVoicePlay);
  }, [transcript, speak]);

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => toggle(transcript)}
        disabled={!supported}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left font-bold text-flip-700 transition active:scale-[0.99] disabled:opacity-60"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-flip-100 text-flip-600">
          {speaking ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </span>
        <span className="flex-1">{speaking ? t("result.audio.stop") : t("result.audio.listen")}</span>
      </button>

      <button
        onClick={() => setShowText((s) => !s)}
        className="flex w-full items-center gap-3 border-t border-black/5 px-4 py-3 text-left font-medium"
      >
        <FileText className="ml-1 h-5 w-5 text-content-soft" />
        <span className="flex-1">{t("result.audio.showTranscript")}</span>
        {showText ? (
          <ChevronDown className="h-5 w-5 text-content-mute" />
        ) : (
          <ChevronRight className="h-5 w-5 text-content-mute" />
        )}
      </button>
      {showText && (
        <p className="border-t border-black/5 px-4 py-4 text-sm leading-relaxed text-content-soft">
          {transcript}
        </p>
      )}
    </Card>
  );
}

/* ── Deep dive ──────────────────────────────────────────── */
function DeepDive({
  fileName,
  point,
  onBack,
}: {
  fileName: string;
  point: AnalysisPoint;
  onBack: () => void;
}) {
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-col">
      <Header title={t("deepdive.header")} subtitle={fileName} onBack={onBack} />
      <main className="flex-1 space-y-3 px-5 py-5 pb-10">
        <div className="rounded-2xl border border-flip-200 bg-flip-50 p-4 animate-rise">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-flip-100 font-bold text-flip-700">
              <TriangleAlert className="h-5 w-5" />
            </span>
            <h1 className="min-w-0 text-xl font-extrabold break-words">{point.title}</h1>
          </div>
          <p className="mt-2 text-content-soft break-words">{point.teaser}</p>
        </div>

        <InfoCard title={t("deepdive.whatHappens")}>{point.whatHappens}</InfoCard>
        <InfoCard title={t("deepdive.isNormal")}>{point.isNormal}</InfoCard>
        <InfoCard title={t("deepdive.keepInMind")}>{point.keepInMind}</InfoCard>

        {point.canDo && (
          <div className="rounded-2xl border border-flip-200 bg-flip-50 p-4">
            <h3 className="flex items-center gap-2 font-bold text-flip-700">
              <Lightbulb className="h-5 w-5" />
              {t("deepdive.canDo")}
            </h3>
            <p className="mt-1 leading-relaxed text-flip-800 break-words">{point.canDo}</p>
          </div>
        )}

        <button
          onClick={onBack}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl btn-pop bg-flip-500 py-4 font-extrabold uppercase tracking-wide text-white shadow-[0_8px_20px_-8px_var(--color-flip-600)] active:scale-95"
        >
          <Check className="h-5 w-5" />
          {t("deepdive.gotItBack")}
        </button>
      </main>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h3 className="font-bold">{title}</h3>
      <p className="mt-1 leading-relaxed text-content-soft break-words">{children}</p>
    </Card>
  );
}

/* ── Header ─────────────────────────────────────────────── */
function Header({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
}) {
  const t = useT();
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-surface px-4 py-4 pt-safe">
      <button onClick={onBack} aria-label={t("result.back")} className="grid h-9 w-9 place-items-center rounded-full hover:bg-black/5">
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0">
        <h1 className="text-lg font-bold leading-tight">{title}</h1>
        {subtitle && <p className="truncate text-sm text-content-mute">{subtitle}</p>}
      </div>
    </header>
  );
}
