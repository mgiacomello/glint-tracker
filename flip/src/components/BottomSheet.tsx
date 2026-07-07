"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

/** Bottom sheet / modal used for the method picker, menu drawer, etc. */
export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const t = useT();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] animate-pop"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full max-w-[480px] animate-rise rounded-t-[28px] bg-surface p-5 pb-safe shadow-[var(--shadow-float)]",
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? t("sheet.panel")}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" />
        <div className="mb-4 flex items-start justify-between">
          <div>
            {title && <h2 className="text-xl font-bold">{title}</h2>}
            {subtitle && <p className="text-sm text-content-soft">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label={t("sheet.close")}
            className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-content-soft hover:bg-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
