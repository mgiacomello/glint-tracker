"use client";

import Link from "next/link";
import { CalendarDays, CalendarClock, AlertCircle, CalendarPlus } from "lucide-react";
import { SubPage, EmptyState } from "@/components/SubPage";
import { useDocuments } from "@/lib/useDocuments";
import { useT, useLang } from "@/lib/i18n/provider";
import { allDeadlines, type DeadlineItem } from "@/lib/store";
import { addToCalendar } from "@/lib/ics";
import type { TranslateFn } from "@/lib/i18n/provider";

function makeFmt(lang: string) {
  return (date: string): string =>
    new Date(date).toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric" });
}

export default function CalendarPage() {
  useDocuments(); // re-render on changes
  const t = useT();
  const lang = useLang();
  const fmt = makeFmt(lang);
  const items = allDeadlines();
  const today = new Date().toISOString().slice(0, 10);

  const overdue = items.filter((d) => d.date && d.date < today);
  const upcoming = items.filter((d) => d.date && d.date >= today);
  const undated = items.filter((d) => !d.date);
  const datedCount = overdue.length + upcoming.length;

  return (
    <SubPage
      title={t("calendar.title")}
      subtitle={t("calendar.subtitle")}
      action={
        datedCount > 0 ? (
          <button
            onClick={() => addToCalendar(items, t("calendar.file.name"))}
            className="flex items-center gap-1.5 rounded-full bg-flip-500 px-3 py-2 text-sm font-bold text-white active:scale-95"
          >
            <CalendarPlus className="h-4 w-4" />
            {t("calendar.all")}
          </button>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-14 w-14" />}
          title={t("calendar.empty.title")}
          hint={t("calendar.empty.hint")}
          cta={
            <Link href="/" className="btn-pop rounded-2xl bg-flip-500 px-6 py-3 font-extrabold uppercase tracking-wide text-white">
              {t("calendar.empty.cta")}
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          <Group title={t("calendar.group.overdue")} tone="rose" icon={<AlertCircle className="h-4 w-4" />} items={overdue} fmt={fmt} t={t} />
          <Group title={t("calendar.group.upcoming")} tone="amber" icon={<CalendarClock className="h-4 w-4" />} items={upcoming} fmt={fmt} t={t} />
          <Group title={t("calendar.group.undated")} tone="slate" icon={<CalendarDays className="h-4 w-4" />} items={undated} fmt={fmt} t={t} />
        </div>
      )}
    </SubPage>
  );
}

function Group({
  title,
  tone,
  icon,
  items,
  fmt,
  t,
}: {
  title: string;
  tone: "rose" | "amber" | "slate";
  icon: React.ReactNode;
  items: DeadlineItem[];
  fmt: (d: string) => string;
  t: TranslateFn;
}) {
  if (items.length === 0) return null;
  const toneCls = {
    rose: "text-rose-600",
    amber: "text-amber-600",
    slate: "text-content-mute",
  }[tone];
  return (
    <div>
      <h2 className={`mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide ${toneCls}`}>
        {icon}
        {title} ({t("calendar.group.count", { n: items.length })})
      </h2>
      <div className="space-y-2">
        {items.map((d, i) => (
          <div
            key={i}
            style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
            className="flex animate-rise items-stretch gap-2 rounded-2xl bg-surface shadow-[var(--shadow-card)]"
          >
            <Link href={`/document/${d.docId}`} className="min-w-0 flex-1 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold break-words">{d.title}</p>
                  <p className="truncate text-xs text-content-mute">{d.docTitle}</p>
                </div>
                {d.amount && (
                  <span className="shrink-0 rounded-full bg-flip-50 px-2.5 py-1 text-sm font-bold text-flip-700">
                    {d.amount}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm font-medium text-content-soft">
                {d.date ? fmt(d.date) : t("calendar.noDate")}
              </p>
            </Link>
            {d.date && (
              <button
                onClick={() => addToCalendar([d])}
                aria-label={t("calendar.addAria")}
                className="flex w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-r-2xl border-l border-black/5 text-flip-600 hover:bg-flip-50"
              >
                <CalendarPlus className="h-5 w-5" />
                <span className="text-[10px] font-semibold">{t("calendar.add")}</span>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
