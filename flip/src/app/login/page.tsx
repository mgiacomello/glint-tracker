"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, ShieldCheck, ArrowRight, ArrowLeft } from "lucide-react";
import { FlipWordmark } from "@/components/TopBar";
import { Button } from "@/components/ui";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/provider";

// Auth: Google OAuth + passwordless email OTP (6-digit code, WebView-friendly).
type Step = "email" | "code";

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");

  // One-tap sign-in / sign-up with Google (via Supabase OAuth → /auth/callback).
  async function google() {
    setError(null);
    if (!hasSupabaseEnv) {
      router.push("/");
      return;
    }
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${siteUrl}/auth/callback` },
    });
    if (error) setError(error.message);
  }

  // Step 1 — send a 6-digit code (works inside an Android WebView, unlike a magic link).
  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!hasSupabaseEnv) {
      // Demo mode: no backend configured yet.
      router.push("/");
      return;
    }
    setLoading(true);
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (error) setError(error.message);
    else {
      setCode("");
      setStep("code");
    }
  }

  // Step 2 — verify the code and open a session in the app itself.
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await createClient().auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    setLoading(false);
    if (error) setError(error.message);
    else router.push("/");
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-7">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <FlipWordmark big />
          <p className="mt-3 text-lg font-bold">{t("login.tagline")}</p>
          <p className="mt-2 text-sm text-content-soft">{t("login.intro")}</p>
        </div>

        {step === "email" ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={google}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-black/10 bg-surface px-4 py-3.5 font-bold text-content shadow-[var(--shadow-card)] transition active:scale-[0.99]"
            >
              <GoogleIcon />
              {t("login.google")}
            </button>

            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-black/10" />
              <span className="text-xs font-semibold uppercase tracking-wide text-content-mute">
                {t("login.or")}
              </span>
              <span className="h-px flex-1 bg-black/10" />
            </div>

            <form onSubmit={sendCode} className="space-y-3">
            <div className="flex items-center gap-2 rounded-2xl border border-black/10 bg-surface px-4 py-3 focus-within:border-flip-400">
              <Mail className="h-5 w-5 text-content-mute" />
              <input
                type="email"
                inputMode="email"
                aria-label={t("login.email.aria")}
                autoComplete="email"
                required={hasSupabaseEnv}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("login.email.placeholder")}
                className="w-full bg-transparent text-base outline-none placeholder:text-content-mute"
              />
            </div>
            {error && <p className="px-1 text-sm text-risk-danger">{error}</p>}
            <Button type="submit" size="lg" disabled={loading}>
              {loading
                ? t("login.submit.sending")
                : hasSupabaseEnv
                  ? t("login.submit.sendCode")
                  : t("login.submit.demo")}
              <ArrowRight className="h-5 w-5" />
            </Button>
            {!hasSupabaseEnv && (
              <p className="text-center text-xs text-content-mute">{t("login.demoNote")}</p>
            )}
            </form>
          </div>
        ) : (
          <form onSubmit={verify} className="space-y-3">
            <div className="rounded-2xl bg-flip-50 p-4 text-center">
              <ShieldCheck className="mx-auto h-8 w-8 text-flip-600" />
              <p className="mt-2 text-sm text-content-soft">
                {t("login.code.subtitle", { email })}
              </p>
            </div>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              required
              aria-label={t("login.code.aria")}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="••••••"
              className="w-full rounded-2xl border border-black/10 bg-surface px-4 py-4 text-center text-2xl font-bold tracking-[0.4em] outline-none focus:border-flip-400 placeholder:tracking-[0.3em] placeholder:text-content-mute"
            />
            {error && <p className="px-1 text-sm text-risk-danger">{error}</p>}
            <Button type="submit" size="lg" disabled={loading || code.length < 6}>
              {loading ? t("login.code.verifying") : t("login.code.verify")}
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div className="flex items-center justify-between px-1 text-sm">
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setError(null);
                }}
                className="flex items-center gap-1 text-content-mute"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("login.code.changeEmail")}
              </button>
              <button
                type="button"
                onClick={() => sendCode()}
                disabled={loading}
                className="font-semibold text-flip-600 disabled:opacity-50"
              >
                {t("login.code.resend")}
              </button>
            </div>
          </form>
        )}

        <p className="mt-8 text-center text-xs text-content-mute">
          {t("login.termsPrefix")}{" "}
          <a href="/terms" className="underline">
            {t("login.termsLink")}
          </a>{" "}
          {t("login.termsAnd")}{" "}
          <a href="/privacy" className="underline">
            {t("login.privacyLink")}
          </a>
          {t("login.termsSuffix")}
        </p>
      </div>
    </div>
  );
}

/** Official multi-color Google "G" mark. */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
