export type RiskLevel = "safe" | "warn" | "danger";

/**
 * Maps the analysis verdict to the fox mascot mood:
 * good result → super happy, mediocre → perplexed, disappointing → sad.
 */
export function moodForRisk(risk: RiskLevel): "superhappy" | "perplexed" | "sad" {
  if (risk === "safe") return "superhappy";
  if (risk === "warn") return "perplexed";
  return "sad";
}

export const RISK_META: Record<
  RiskLevel,
  { label: string; color: string; emoji: string }
> = {
  safe: { label: "Tutto ok", color: "var(--color-risk-safe)", emoji: "🟢" },
  warn: { label: "Attento", color: "var(--color-risk-warn)", emoji: "🟠" },
  danger: { label: "Occhio!", color: "var(--color-risk-danger)", emoji: "🔴" },
};

/** A single "Leggi bene" point with its deep-dive content. */
export interface AnalysisPoint {
  order: number;
  title: string;
  /** One-line teaser shown in the list. */
  teaser: string;
  /** Deep dive: what actually happens in practice. */
  whatHappens: string;
  /** Deep dive: is this normal for similar documents? */
  isNormal: string;
  /** Deep dive: what to keep in mind. */
  keepInMind: string;
  /** Actionable: what the user can concretely DO about this point. */
  canDo: string;
  risk: RiskLevel;
}

/** Extracted deadline / important date. */
export interface ExtractedDeadline {
  title: string;
  /** ISO date (YYYY-MM-DD) when determinable, else null. */
  date: string | null;
  rawText: string;
  amount?: string | null;
}

/** LX Complexity Score (0-100): how hard the document is to understand. */
export function complexityMeta(score: number): { label: string; color: string } {
  if (score >= 67) return { label: "Difficile", color: "var(--color-risk-danger)" };
  if (score >= 34) return { label: "Media", color: "var(--color-risk-warn)" };
  return { label: "Facile", color: "var(--color-risk-safe)" };
}

/** Full structured analysis returned by the AI engine. */
export interface DocumentAnalysis {
  /** Human title, e.g. "Lettera di incarico professionale". */
  title: string;
  /** Plain-language summary of the whole document. */
  summary: string;
  /** Overall risk semaphore. */
  overallRisk: RiskLevel;
  /** LX Complexity Score 0-100 (how hard the original document is to read). */
  complexity: number;
  /** Short headline shown in the colored badge (the "Attento" message). */
  headline: string;
  /** Voice-ready transcript for TTS. */
  transcript: string;
  points: AnalysisPoint[];
  deadlines: ExtractedDeadline[];
}

export type DocSourceKind = "pdf" | "image" | "office" | "text";
