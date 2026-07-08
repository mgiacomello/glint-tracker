"use client";

import dynamic from "next/dynamic";
import { type FoxExpression } from "@/components/Fox";

const DotLottie = dynamic(
  () => import("@lottiefiles/dotlottie-react").then((m) => m.DotLottieReact),
  { ssr: false },
);

/** Source animation aspect ratio (h/w) — the fox art is 350×400. */
const RATIO = 400 / 350;

/** Playback speed per state. */
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
 * Known bundled mascot files — mapped statically so there's no runtime HEAD
 * probing (which caused a network request + an SVG→Lottie flash on every mount).
 */
const FILE: Record<FoxExpression, string> = {
  idle: "/mascot.json",
  reading: "/mascot.json",
  happy: "/mascot.json",
  surprised: "/mascot.json",
  superhappy: "/mascot-superhappy.json",
  perplexed: "/mascot-perplexed.json",
  sad: "/mascot-sad.json",
};

export function LottieMascot({
  size = 180,
  expression = "idle",
}: {
  size?: number;
  expression?: FoxExpression;
}) {
  const src = FILE[expression] ?? "/mascot.json";
  const height = Math.round(size * RATIO);

  // Reserve the box up front so the player loading in doesn't shift the layout.
  return (
    <span style={{ display: "inline-block", width: size, height }}>
      <DotLottie
        key={src}
        src={src}
        autoplay
        loop
        speed={SPEED[expression]}
        style={{ width: "100%", height: "100%" }}
      />
    </span>
  );
}
