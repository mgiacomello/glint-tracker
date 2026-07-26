import type { DocumentAnalysis } from "@/lib/analysis/types";

/**
 * Transient, in-memory result — the ONLY place an analysis lives.
 * Never persisted (no localStorage, no server): it exists during the session
 * and is gone on refresh / app close. This is the "zero conservazione" model.
 */
export interface PendingResult {
  fileName: string;
  analysis: DocumentAnalysis;
}

let pending: PendingResult | null = null;

export function setPendingResult(r: PendingResult): void {
  pending = r;
}

export function getPendingResult(): PendingResult | null {
  return pending;
}

export function clearPendingResult(): void {
  pending = null;
}
