/**
 * Home content selection.
 *
 * The rotating scam stories and fox lines live (translated) in
 * `@/lib/i18n/messages/nav` and are picked client-side in HomeView, since the
 * active language is only known on the client.
 */

/** Pseudo-live counter of people "fregati" in the last hour. */
export function peopleFooledLastHour(seed = Date.now()): number {
  // Deterministic-ish small number, stable within ~10 min windows.
  const bucket = Math.floor(seed / (1000 * 60 * 10));
  return 3 + (bucket % 7);
}
