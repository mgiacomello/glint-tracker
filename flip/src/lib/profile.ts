// Server-safe module (no "use client"): profileInstruction() runs in the API route.
// Browser-only get/set guard access with `typeof window`.

export const SEGMENTS = [
  {
    code: "privato",
    label: "Privato / Famiglia",
    emoji: "🏠",
    hint: "Contratti di casa, bollette, assicurazioni, acquisti, banca",
  },
  {
    code: "studente",
    label: "Studente",
    emoji: "🎓",
    hint: "Affitti fuori sede, stage, prestiti, abbonamenti",
  },
  {
    code: "freelance",
    label: "Freelance / Partita IVA",
    emoji: "💼",
    hint: "Contratti di collaborazione, clienti, fornitori, incarichi",
  },
  {
    code: "azienda",
    label: "Azienda / Startup",
    emoji: "🚀",
    hint: "Fornitori, dipendenti, servizi, contratti B2B",
  },
] as const;

export type SegmentCode = (typeof SEGMENTS)[number]["code"];

export interface FlipProfile {
  segment: SegmentCode | null;
  /** Optional free-text: e.g. "vivo in affitto, fuori sede, parto in Erasmus a marzo". */
  situation: string;
}

const KEY = "chiaro:profile";

export function getProfile(): FlipProfile {
  if (typeof window === "undefined") return { segment: null, situation: "" };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { segment: null, situation: "" };
    const p = JSON.parse(raw);
    return { segment: p.segment ?? null, situation: p.situation ?? "" };
  } catch {
    return { segment: null, situation: "" };
  }
}

export function setProfile(p: FlipProfile) {
  localStorage.setItem(KEY, JSON.stringify(p));
  window.dispatchEvent(new Event("chiaro:profile-changed"));
}

export function hasProfile(): boolean {
  const p = getProfile();
  return Boolean(p.segment || p.situation.trim());
}

/** Server-side: build a prompt instruction from a profile JSON string. Returns "" if empty. */
export function profileInstruction(raw: string | null): string {
  if (!raw) return "";
  try {
    const p = JSON.parse(raw) as FlipProfile;
    const seg = SEGMENTS.find((s) => s.code === p.segment);
    const parts: string[] = [];
    if (seg) parts.push(`profilo: ${seg.label} (${seg.hint})`);
    if (p.situation?.trim()) parts.push(`situazione personale: ${p.situation.trim()}`);
    if (parts.length === 0) return "";
    return `\n\nIMPORTANTE — adatta l'analisi a QUESTO utente (${parts.join("; ")}). Rapporta il verdetto, i rischi e i consigli alla sua situazione specifica: dì esplicitamente se un punto per lui va bene o no, e perché.`;
  } catch {
    return "";
  }
}
