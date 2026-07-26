"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ResultView } from "@/components/document/ResultView";
import { getPendingResult, type PendingResult } from "@/lib/session";

/**
 * Ephemeral result screen. The analysis lives only in memory (lib/session):
 * on refresh or app restart there's nothing to show → back home. Nothing is
 * ever stored, which is the whole point.
 */
export default function ResultPage() {
  const router = useRouter();
  const [result, setResult] = useState<PendingResult | null>(null);

  useEffect(() => {
    const pending = getPendingResult();
    if (!pending) {
      router.replace("/");
      return;
    }
    setResult(pending);
  }, [router]);

  if (!result) return null;

  return (
    <ResultView
      fileName={result.fileName}
      analysis={result.analysis}
      onBack={() => router.push("/")}
    />
  );
}
