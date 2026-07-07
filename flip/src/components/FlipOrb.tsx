"use client";

import { cn } from "@/lib/utils";

/** The central tappable Chiaro orb (the app's hero action). */
export function FlipOrb({
  onClick,
  size = 140,
  label,
  className,
}: {
  onClick?: () => void;
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label ?? "Carica un documento"}
      className={cn("group relative grid place-items-center outline-none", className)}
      style={{ width: size, height: size }}
    >
      {/* inviting pulse ring */}
      <span className="absolute inset-0 rounded-full border-2 border-flip-400/60 animate-ping" />
      {/* glow */}
      <span className="absolute inset-0 rounded-full blur-2xl opacity-40 flip-gradient" />
      {/* orb */}
      <span className="relative grid h-full w-full place-items-center rounded-full flip-gradient shadow-[var(--shadow-float)] animate-breathe transition group-active:scale-95">
        <FlipMark size={size * 0.5} />
      </span>
      {/* playful floating dots */}
      <span className="absolute -right-1 top-3 h-3 w-3 rounded-full bg-ink-400" />
      <span className="absolute right-6 -top-1 h-2 w-2 rounded-full bg-flip-300" />
      <span className="absolute bottom-4 left-2 h-2 w-2 rounded-full bg-flip-200" />
    </button>
  );
}

/** Chiaro brand mark: a clean "C" monogram. */
export function FlipMark({ size = 56, color = "#ffffff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" aria-hidden>
      <path
        d="M352 141 A150 150 0 1 0 352 371"
        stroke={color}
        strokeWidth="74"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
