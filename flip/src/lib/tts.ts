"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getLang, type LangCode } from "@/lib/i18n";

/** BCP-47 locale used for the speech voice, per app language. */
const TTS_LOCALE: Record<LangCode, string> = {
  it: "it-IT",
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
};

/** Free text-to-speech using the browser's Web Speech API, in the app language. */
export function useTTS() {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(true);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  const pickVoice = (locale: string) => {
    const prefix = locale.slice(0, 2).toLowerCase();
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((v) => v.lang?.toLowerCase() === locale.toLowerCase()) ??
      voices.find((v) => v.lang?.toLowerCase().startsWith(prefix)) ??
      voices.find((v) => v.default) ??
      voices[0]
    );
  };

  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const locale = TTS_LOCALE[getLang()] ?? "it-IT";
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale;
    u.rate = 1;
    u.pitch = 1;
    const v = pickVoice(locale);
    if (v) u.voice = v;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    utterRef.current = u;
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  const toggle = useCallback(
    (text: string) => {
      if (speaking) stop();
      else speak(text);
    },
    [speaking, speak, stop],
  );

  return { speaking, supported, speak, stop, toggle };
}
