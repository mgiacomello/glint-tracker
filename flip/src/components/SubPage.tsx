"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LottieMascot } from "@/components/LottieMascot";
import { useT } from "@/lib/i18n/provider";

/** Standard header + scroll body for tool / settings sub-pages. */
export function SubPage({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const router = useRouter();
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-surface px-4 py-4 pt-safe">
        <button
          onClick={() => router.back()}
          aria-label={t("common.back")}
          className="grid h-9 w-9 place-items-center rounded-full hover:bg-black/5"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold leading-tight">{title}</h1>
          {subtitle && <p className="truncate text-sm text-content-mute">{subtitle}</p>}
        </div>
        {action}
      </header>
      <main className="flex-1 px-5 py-5 pb-12">{children}</main>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  cta,
}: {
  /** @deprecated kept for compatibility; the mascot is shown instead. */
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="mt-14 flex flex-col items-center text-center text-content-mute">
      <LottieMascot size={130} />
      <p className="mt-3 text-lg font-extrabold text-content">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-sm text-content-soft">{hint}</p>}
      {cta && <div className="mt-5">{cta}</div>}
    </div>
  );
}
