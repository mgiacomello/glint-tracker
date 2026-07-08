"use client";

import { useState } from "react";
import Link from "next/link";
import { GitCompareArrows, Check, Loader2, Trophy } from "lucide-react";
import { SubPage, EmptyState } from "@/components/SubPage";
import { useDocuments } from "@/lib/useDocuments";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import type { StoredDocument } from "@/lib/store";
import type { CompareResult } from "@/app/api/compare/route";

export default function ComparePage() {
  const { docs } = useDocuments();
  const t = useT();
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 2 ? [...s, id] : [s[1], id]));

  const run = async () => {
    const [aId, bId] = selected;
    const a = docs.find((d) => d.id === aId)?.analysis;
    const b = docs.find((d) => d.id === bId)?.analysis;
    if (!a || !b) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ a, b }),
      });
      if (!res.ok) throw new Error();
      setResult(await res.json());
    } catch {
      setError(t("compare.error"));
    } finally {
      setLoading(false);
    }
  };

  if (docs.length < 2) {
    return (
      <SubPage title={t("compare.title")}>
        <EmptyState
          icon={<GitCompareArrows className="h-14 w-14" />}
          title={t("compare.need2.title")}
          hint={t("compare.need2.hint")}
          cta={
            <Link href="/" className="btn-pop rounded-2xl bg-flip-500 px-6 py-3 font-extrabold uppercase tracking-wide text-white">
              {t("compare.need2.cta")}
            </Link>
          }
        />
      </SubPage>
    );
  }

  if (result) {
    const winner = result.recommendation;
    const docA = docs.find((d) => d.id === selected[0]);
    const docB = docs.find((d) => d.id === selected[1]);
    return (
      <SubPage title={t("compare.result.title")} subtitle={t("compare.result.subtitle")}>
        <div className="space-y-4">
          {winner !== "none" && (
            <div className="flex items-center gap-3 rounded-2xl bg-flip-50 p-4">
              <Trophy className="h-6 w-6 shrink-0 text-flip-600" />
              <div className="min-w-0">
                <p className="font-bold text-flip-700 break-words">
                  {t("compare.better", { n: (winner === "a" ? docA?.analysis.title : docB?.analysis.title) ?? "" })}
                </p>
                <p className="text-sm text-content-soft break-words">{result.recommendationReason}</p>
              </div>
            </div>
          )}
          <p className="text-content-soft break-words">{result.summary}</p>
          <div className="space-y-2">
            {result.differences.map((d, i) => (
              <div key={i} className="rounded-2xl bg-surface p-4 shadow-[var(--shadow-card)]">
                <p className="mb-2 font-bold break-words">{d.topic}</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="min-w-0 rounded-xl bg-surface-2 p-3">
                    <p className="mb-1 text-xs font-bold uppercase text-content-mute">A</p>
                    <p className="text-content-soft break-words">{d.a}</p>
                  </div>
                  <div className="min-w-0 rounded-xl bg-surface-2 p-3">
                    <p className="mb-1 text-xs font-bold uppercase text-content-mute">B</p>
                    <p className="text-content-soft break-words">{d.b}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              setResult(null);
              setSelected([]);
            }}
            className="w-full rounded-2xl btn-pop bg-flip-500 py-4 font-extrabold uppercase tracking-wide text-white"
          >
            {t("compare.new")}
          </button>
        </div>
      </SubPage>
    );
  }

  return (
    <SubPage title={t("compare.title")} subtitle={t("compare.pick.subtitle")}>
      <div className="space-y-3">
        {docs.map((d: StoredDocument) => {
          const idx = selected.indexOf(d.id);
          const isSel = idx >= 0;
          return (
            <button
              key={d.id}
              onClick={() => toggle(d.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border-2 bg-surface p-4 text-left transition",
                isSel ? "border-flip-500" : "border-transparent",
              )}
            >
              <span
                className={cn(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-full font-bold",
                  isSel ? "bg-flip-500 text-white" : "bg-slate-100 text-content-mute",
                )}
              >
                {isSel ? <Check className="h-4 w-4" /> : idx < 0 ? "" : idx}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{d.analysis.title}</span>
                <span className="block truncate text-xs text-content-mute">{d.fileName}</span>
              </span>
            </button>
          );
        })}
      </div>

      {error && <p className="mt-3 text-center text-sm text-risk-danger">{error}</p>}

      <button
        onClick={run}
        disabled={selected.length !== 2 || loading}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl btn-pop bg-flip-500 py-4 font-extrabold uppercase tracking-wide text-white disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <GitCompareArrows className="h-5 w-5" />}
        {loading ? t("compare.loading") : t("compare.run")}
      </button>
    </SubPage>
  );
}
