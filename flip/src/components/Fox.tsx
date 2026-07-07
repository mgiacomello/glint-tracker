"use client";

export type FoxExpression =
  | "idle"
  | "reading"
  | "happy"
  | "surprised"
  | "superhappy"
  | "perplexed"
  | "sad";

/**
 * Volpe fennec — low-poly / faceted style (inspired by the reference animation).
 * Big ears, geometric facets, orange→maroon palette. Gentle idle breathe.
 */
export function Fox({
  size = 180,
}: {
  size?: number;
  expression?: FoxExpression;
}) {
  return (
    <svg viewBox="0 0 200 210" width={size} height={(size * 210) / 200}>
      {/* soft ground shadow */}
      <ellipse cx="100" cy="196" rx="52" ry="9" fill="#7c2233" opacity="0.12" />

      <g className="animate-breathe" style={{ transformOrigin: "100px 130px" }}>
        {/* ─── LEFT EAR (big) ─── */}
        <polygon points="44,24 80,120 60,152" fill="#d24d1f" />
        <polygon points="44,24 96,96 80,120" fill="#f4ca93" />
        <polygon points="80,120 96,96 96,150 60,152" fill="#ffe2ba" />
        <polygon points="44,24 58,56 38,52" fill="#7c2233" />

        {/* ─── RIGHT EAR (big) ─── */}
        <polygon points="156,24 120,120 140,152" fill="#d24d1f" />
        <polygon points="156,24 104,96 120,120" fill="#f4ca93" />
        <polygon points="120,120 104,96 104,150 140,152" fill="#ffe2ba" />
        <polygon points="156,24 142,56 162,52" fill="#7c2233" />

        {/* ─── HEAD ─── */}
        {/* forehead / upper face */}
        <polygon points="100,102 66,122 100,152 134,122" fill="#f1692b" />
        {/* left cheek (shadow) */}
        <polygon points="66,122 72,160 100,152" fill="#d24d1f" />
        {/* right cheek (light) */}
        <polygon points="134,122 128,160 100,152" fill="#fb8a45" />
        {/* muzzle — cream */}
        <polygon points="72,160 100,152 100,188 84,178" fill="#ffe2ba" />
        <polygon points="128,160 100,152 100,188 116,178" fill="#f4ca93" />

        {/* soft eye markings (horizontal, friendly) */}
        <polygon points="76,136 95,138 92,144 78,143" fill="#7c2233" opacity="0.55" />
        <polygon points="124,136 105,138 108,144 122,143" fill="#54142a" opacity="0.55" />

        {/* eyes — big & round-ish, friendly */}
        <ellipse cx="86" cy="145" rx="6" ry="6.5" fill="#ffffff" />
        <ellipse cx="114" cy="145" rx="6" ry="6.5" fill="#ffffff" />
        <circle cx="87" cy="146" r="3" fill="#2a0f18" />
        <circle cx="115" cy="146" r="3" fill="#2a0f18" />
        <circle cx="88.5" cy="144" r="1" fill="#ffffff" />
        <circle cx="116.5" cy="144" r="1" fill="#ffffff" />

        {/* nose */}
        <polygon points="94,157 106,157 100,164" fill="#3a0f1c" />
        {/* open mouth (happy) */}
        <polygon points="94,167 106,167 100,178" fill="#8f2540" />
      </g>
    </svg>
  );
}
