"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Fox, type FoxExpression } from "@/components/Fox";

const DotLottie = dynamic(
  () => import("@lottiefiles/dotlottie-react").then((m) => m.DotLottieReact),
  { ssr: false },
);

/** Source animation aspect ratio (h/w) — the fox art is 350×400. */
const RATIO = 400 / 350;

/** Playback speed per state (used when a single animation drives all states). */
const SPEED: Record<FoxExpression, number> = {
  idle: 1,
  reading: 0.7,
  surprised: 1.3,
  happy: 1.6,
  superhappy: 1,
  perplexed: 1,
  sad: 1,
};

/**
 * Per-state Lottie mascot. For each state it looks for `public/mascot-<state>.json`,
 * then falls back to the generic `public/mascot.json`, then to the SVG fox.
 * Drop extra files (mascot-reading.json, mascot-happy.json…) to differentiate states.
 */
export function LottieMascot({
  size = 180,
  expression = "idle",
}: {
  size?: number;
  expression?: FoxExpression;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let alive = true;
    const candidates = [`/mascot-${expression}.json`, "/mascot.json"];
    (async () => {
      for (const c of candidates) {
        try {
          const r = await fetch(c, { method: "HEAD" });
          if (r.ok) {
            if (alive) {
              setSrc(c);
              setResolved(true);
            }
            return;
          }
        } catch {
          /* try next */
        }
      }
      if (alive) {
        setSrc(null);
        setResolved(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [expression]);

  if (!resolved || !src) return <Fox size={size} expression={expression} />;

  return (
    <DotLottie
      key={`${src}-${expression}`}
      src={src}
      autoplay
      loop
      speed={SPEED[expression]}
      style={{ width: size, height: Math.round(size * RATIO) }}
    />
  );
}
