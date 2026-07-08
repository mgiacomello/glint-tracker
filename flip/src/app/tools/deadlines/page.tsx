"use client";

import Link from "next/link";
import { CalendarClock, ChevronRight, ScanLine } from "lucide-react";
import { SubPage, EmptyState } from "@/components/SubPage";
import { useDocuments } from "@/lib/useDocuments";
import { useT, useLang } from "@/lib/i18n/provider";

export default function DeadlinesPage() {
  const { docs } = useDocuments();
  const t = useT();
  const lang = useLang();
  const withDeadlines = docs.filter((d) => d.analysis.deadlines.length > 0);

  return (
    <SubPage title={t("deadlines.title")} subtitle={t("deadlines.subtitle")}>
      <Link
        href="/analyze?mode=upload"
        className="mb-5 flex items-center gap-3 rounded-2xl border border-dashed border-flip-300 bg-flip-50 p-4"
      >
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-flip-100 text-flip-600">
          <ScanLine className="h-5 w-5" />
        </span>
        <span className="flex-1">
          <span className="block font-bold">{t("deadlines.upload.title")}</span>
          <span className="block text-sm text-content-soft">{t("deadlines.upload.hint")}</span>
        </span>
        <ChevronRight className="h-5 w-5 text-flip-600" />
      </Link>

      {withDeadlines.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-14 w-14" />}
          title={t("deadlines.empty.title")}
          hint={t("deadlines.empty.hint")}
        />
      ) : (
        <div className="space-y-4">
          {withDeadlines.map((d) => (
            <div key={d.id} className="rounded-2xl bg-surface p-4 shadow-[var(--shadow-card)]">
              <Link href={`/document/${d.id}`} className="flex items-center justify-between">
                <p className="truncate font-bold">{d.analysis.title}</p>
                <ChevronRight className="h-5 w-5 shrink-0 text-content-mute" />
              </Link>
              <ul className="mt-3 space-y-2">
                {d.analysis.deadlines.map((dl, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 rounded-xl bg-surface-2 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold break-words">{dl.title}</p>
                      <p className="truncate text-xs text-content-mute">{dl.rawText}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {dl.amount && <p className="text-sm font-bold text-flip-700">{dl.amount}</p>}
                      {dl.date && (
                        <p className="text-xs text-content-mute">
                          {new Date(dl.date).toLocaleDateString(lang)}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </SubPage>
  );
}
