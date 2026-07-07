import type {
  AnalysisPoint,
  DocumentAnalysis,
  ExtractedDeadline,
  RiskLevel,
} from "@/lib/analysis/types";

type MetaEvent = {
  type: "meta";
  title: string;
  summary: string;
  overallRisk: RiskLevel;
  complexity: number;
  headline: string;
  transcript: string;
};
type PointEvent = { type: "point" } & AnalysisPoint;
type DeadlineEvent = { type: "deadline" } & ExtractedDeadline;
type DoneEvent = { type: "done" };
type ErrorEvent = { type: "error"; message: string };

export type AnalysisEvent = MetaEvent | PointEvent | DeadlineEvent | DoneEvent | ErrorEvent;

export interface StreamHandlers {
  onMeta?: (m: Omit<MetaEvent, "type">) => void;
  onPoint?: (p: AnalysisPoint) => void;
  onDeadline?: (d: ExtractedDeadline) => void;
  onError?: (msg: string) => void;
  onProgress?: (received: number) => void;
}

/** Reads the JSONL stream and dispatches events as they complete. */
export async function consumeAnalysisStream(
  body: ReadableStream<Uint8Array>,
  handlers: StreamHandlers,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    handlers.onProgress?.(received);
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) dispatch(line, handlers);
    }
  }
  const last = buffer.trim();
  if (last) dispatch(last, handlers);
}

function dispatch(line: string, h: StreamHandlers) {
  let ev: AnalysisEvent;
  try {
    ev = JSON.parse(line);
  } catch {
    return; // ignore partial/garbage lines
  }
  switch (ev.type) {
    case "meta": {
      const { type: _t, ...rest } = ev;
      void _t;
      h.onMeta?.(rest);
      break;
    }
    case "point": {
      const { type: _t, ...rest } = ev;
      void _t;
      h.onPoint?.(rest);
      break;
    }
    case "deadline": {
      const { type: _t, ...rest } = ev;
      void _t;
      h.onDeadline?.(rest);
      break;
    }
    case "error":
      h.onError?.(ev.message);
      break;
  }
}

/** Assemble a full analysis object from collected pieces. */
export function assembleAnalysis(
  meta: Omit<MetaEvent, "type"> | null,
  points: AnalysisPoint[],
  deadlines: ExtractedDeadline[],
): DocumentAnalysis | null {
  if (!meta) return null;
  return {
    title: meta.title,
    summary: meta.summary,
    overallRisk: meta.overallRisk,
    complexity: typeof meta.complexity === "number" ? meta.complexity : 50,
    headline: meta.headline,
    transcript: meta.transcript,
    points: [...points].sort((a, b) => a.order - b.order),
    deadlines,
  };
}
