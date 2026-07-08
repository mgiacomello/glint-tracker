"use client";

import dynamic from "next/dynamic";

const DotLottie = dynamic(
  () => import("@lottiefiles/dotlottie-react").then((m) => m.DotLottieReact),
  { ssr: false },
);

/** CHIARO.info animated wordmark — source art is 619×136 (w/h ≈ 4.55). */
const RATIO = 619 / 136;

/**
 * Animated brand logo. Plays its ~2s reveal once on mount, then rests on the
 * final frame (the full static wordmark). Box reserved to avoid layout shift.
 */
export function LottieLogo({ height = 30, loop = false }: { height?: number; loop?: boolean }) {
  const width = Math.round(height * RATIO);
  return (
    <span
      role="img"
      aria-label="CHIARO.info"
      style={{ display: "inline-block", width, height }}
    >
      <DotLottie
        src="/chiaro-logo.json"
        autoplay
        loop={loop}
        style={{ width: "100%", height: "100%" }}
      />
    </span>
  );
}
