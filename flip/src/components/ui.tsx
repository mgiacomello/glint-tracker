import * as React from "react";
import { cn } from "@/lib/utils";

/* ── Button ─────────────────────────────────────────────── */
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "soft" | "danger";
  size?: "md" | "lg";
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-2xl font-extrabold transition disabled:opacity-50 disabled:pointer-events-none";
  const sizes = { md: "px-4 py-3 text-sm", lg: "px-6 py-4 text-base w-full" };
  const variants = {
    primary: "btn-pop bg-flip-500 text-white uppercase tracking-wide hover:bg-flip-600",
    soft: "bg-flip-50 text-flip-700 hover:bg-flip-100 active:scale-[0.98]",
    ghost: "bg-transparent text-content-soft hover:bg-black/5 active:scale-[0.98]",
    danger: "btn-pop bg-risk-danger text-white uppercase tracking-wide hover:opacity-90",
  };
  return (
    <button className={cn(base, sizes[size], variants[variant], className)} {...props} />
  );
}

/* ── Card ───────────────────────────────────────────────── */
export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/* ── IconBadge (rounded square icon container) ──────────── */
export function IconBadge({
  className,
  tone = "flip",
  children,
}: {
  className?: string;
  tone?: "flip" | "indigo" | "amber" | "rose";
  children: React.ReactNode;
}) {
  const tones = {
    flip: "bg-flip-100 text-flip-600",
    indigo: "bg-indigo-100 text-indigo-600",
    amber: "bg-amber-100 text-amber-600",
    rose: "bg-rose-100 text-rose-600",
  };
  return (
    <div
      className={cn(
        "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
        tones[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ── Badge / counter pill ───────────────────────────────── */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full bg-risk-danger px-1.5 text-[11px] font-bold leading-5 text-white",
        className,
      )}
    >
      {count}
    </span>
  );
}

/* ── Section heading ────────────────────────────────────── */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 text-xs font-semibold uppercase tracking-wide text-content-mute">
      {children}
    </p>
  );
}
