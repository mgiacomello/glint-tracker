"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Upload, Camera, RotateCcw, X, Plus, Check } from "lucide-react";
import { AnalyzingView } from "@/components/analyze/AnalyzingView";
import { LottieMascot } from "@/components/LottieMascot";
import { DemoBanner } from "@/components/DemoBanner";
import { Button } from "@/components/ui";
import { MAX_UPLOAD_BYTES, formatBytes } from "@/lib/utils";
import { consumeAnalysisStream, assembleAnalysis } from "@/lib/analysis/stream";
import { saveDocument } from "@/lib/store";
import { getLang } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { getProfile } from "@/lib/profile";
import { moodForRisk } from "@/lib/analysis/types";
import type { AnalysisPoint, ExtractedDeadline } from "@/lib/analysis/types";

type Phase = "capture" | "analyzing" | "done" | "error";

export function AnalyzeFlow({ mode }: { mode: "upload" | "camera" }) {
  const router = useRouter();
  const t = useT();
  const [phase, setPhase] = useState<Phase>("capture");
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(0);
  const [partialSummary, setPartialSummary] = useState<string>();
  const [doneMood, setDoneMood] = useState<ReturnType<typeof moodForRisk>>("superhappy");
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = useCallback(
    async (files: File[]) => {
      const label = files.length > 1 ? t("analyze.doc.multiPage", { n: files.length }) : files[0].name;
      setFileName(label);
      setPhase("analyzing");
      setProgress(6);

      const meta = { current: null as Parameters<NonNullable<Parameters<typeof consumeAnalysisStream>[1]["onMeta"]>>[0] | null };
      const points: AnalysisPoint[] = [];
      const deadlines: ExtractedDeadline[] = [];

      try {
        const fd = new FormData();
        files.forEach((f) => fd.append("file", f));
        fd.append("mode", mode);
        fd.append("lang", getLang());
        fd.append("profile", JSON.stringify(getProfile()));
        const res = await fetch("/api/analyze", { method: "POST", body: fd });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          // keep raw server text for debugging only
          if (detail) console.error("analyze: server error:", detail);
          throw new Error(t("analyze.error.generic"));
        }
        if (!res.body) throw new Error(t("analyze.error.emptyResponse"));

        await consumeAnalysisStream(res.body, {
          onProgress: (b) => setProgress((p) => Math.max(p, Math.min(90, 6 + b / 40))),
          onMeta: (m) => {
            meta.current = m;
            setPartialSummary(m.summary);
            setProgress((p) => Math.max(p, 38));
          },
          onPoint: (pt) => {
            points.push(pt);
            setProgress((p) => Math.min(92, Math.max(p, 45 + points.length * 11)));
          },
          onDeadline: (d) => deadlines.push(d),
          onError: (msg) => {
            throw new Error(msg);
          },
        });

        const analysis = assembleAnalysis(meta.current, points, deadlines);
        if (!analysis) throw new Error(t("analyze.error.incomplete"));

        setProgress(100);
        const doc = saveDocument(label, analysis);
        // celebratory beat before showing the result — fox reacts to the verdict
        setDoneMood(moodForRisk(analysis.overallRisk));
        setPhase("done");
        setTimeout(() => router.replace(`/document/${doc.id}`), 1250);
      } catch (e) {
        // raw error text goes to the console; the user sees a localized message.
        console.error("analyze:", e);
        setError(t("analyze.error.generic"));
        setPhase("error");
      }
    },
    [mode, router, t],
  );

  if (phase === "analyzing") {
    return (
      <Frame onBack={() => router.back()} title={t("analyze.frame.title")} subtitle={fileName}>
        <AnalyzingView fileName={fileName} progress={progress} partialSummary={partialSummary} />
      </Frame>
    );
  }

  if (phase === "done") {
    return (
      <Frame onBack={() => router.back()} title={t("analyze.frame.title")} subtitle={fileName}>
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="relative animate-pop">
            <LottieMascot size={128} expression={doneMood} />
            <span className="absolute -right-1 top-1 grid h-9 w-9 place-items-center rounded-full bg-flip-500 text-white shadow-md">
              <Check className="h-5 w-5" />
            </span>
          </div>
          <h2 className="mt-4 text-2xl font-extrabold">
            {doneMood === "superhappy"
              ? t("analyze.done.good")
              : doneMood === "perplexed"
                ? t("analyze.done.mediocre")
                : t("analyze.done.bad")}
          </h2>
          <p className="mt-2 text-content-soft">{t("analyze.done.subtitle")}</p>
        </div>
      </Frame>
    );
  }

  if (phase === "error") {
    return (
      <Frame onBack={() => router.back()} title={t("analyze.frame.title")}>
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="grid h-20 w-20 place-items-center rounded-full bg-rose-100 text-rose-600">
            <X className="h-10 w-10" />
          </div>
          <h2 className="mt-6 text-xl font-bold">{t("analyze.error.title")}</h2>
          <p className="mt-2 text-content-soft">{error ?? t("analyze.error.generic")}</p>
          <Button className="mt-6" onClick={() => setPhase("capture")}>
            {t("analyze.error.retry")}
          </Button>
        </div>
      </Frame>
    );
  }

  return (
    <Frame onBack={() => router.back()} title={mode === "camera" ? t("analyze.title.camera") : t("analyze.title.upload")}>
      {mode === "camera" ? (
        <CameraCapture onCapture={runAnalysis} />
      ) : (
        <UploadCapture onPick={runAnalysis} />
      )}
    </Frame>
  );
}

/* ── Shared frame ───────────────────────────────────────── */
function Frame({
  children,
  onBack,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  onBack: () => void;
  title: string;
  subtitle?: string;
}) {
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-black/5 bg-surface px-4 py-4 pt-safe">
        <button onClick={onBack} aria-label={t("analyze.frame.back")} className="grid h-9 w-9 place-items-center rounded-full hover:bg-black/5">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight">{title}</h1>
          {subtitle && <p className="truncate text-sm text-content-mute">{subtitle}</p>}
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

/* ── Upload ─────────────────────────────────────────────── */
function UploadCapture({ onPick }: { onPick: (files: File[]) => void }) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);

  const handle = (list?: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    const tooBig = files.find((f) => f.size > MAX_UPLOAD_BYTES);
    if (tooBig) {
      setErr(t("analyze.upload.tooBig", { name: tooBig.name, size: formatBytes(tooBig.size) }));
      return;
    }
    onPick(files);
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <DemoBanner />
      <button
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handle(e.dataTransfer.files);
        }}
        className="flex flex-1 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-surface-2 p-8 text-center transition hover:border-flip-400 hover:bg-flip-50"
      >
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-flip-100 text-flip-600">
          <Upload className="h-8 w-8" />
        </div>
        <p className="mt-4 text-lg font-bold">{t("analyze.upload.title")}</p>
        <p className="mt-1 text-sm text-content-soft">{t("analyze.upload.hint")}</p>
      </button>
      {err && <p className="mt-3 text-center text-sm text-risk-danger">{err}</p>}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*"
        className="hidden"
        onChange={(e) => handle(e.target.files)}
      />
    </div>
  );
}

/* ── Camera (multi-page) ────────────────────────────────── */
function CameraCapture({ onCapture }: { onCapture: (files: File[]) => void }) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [err, setErr] = useState<string | null>(null);
  const [pages, setPages] = useState<{ file: File; url: string }[]>([]);

  const start = useCallback(async (mode: "environment" | "user") => {
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode }, audio: false });
      streamRef.current = s;
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch {
      setErr(t("analyze.camera.error"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    start(facing);
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  const shoot = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `pagina-${Date.now()}.jpg`, { type: "image/jpeg" });
        setPages((p) => [...p, { file, url: URL.createObjectURL(blob) }]);
      },
      "image/jpeg",
      0.9,
    );
  };

  const finish = () => {
    if (pages.length > 0) onCapture(pages.map((p) => p.file));
  };

  return (
    <div className="relative flex flex-1 flex-col bg-black">
      {err ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-white/80">{err}</div>
      ) : (
        <>
          <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-8 rounded-3xl border-2 border-white/60" />

          {/* page counter */}
          {pages.length > 0 && (
            <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm font-semibold text-white">
              {pages.length} {pages.length === 1 ? t("analyze.camera.pageOne") : t("analyze.camera.pageMany")}
            </div>
          )}

          <div className="mt-auto flex flex-col gap-3 p-5 pb-safe">
            {/* thumbnails */}
            {pages.length > 0 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {pages.map((p, i) => (
                  <div key={i} className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={t("analyze.camera.pageAlt", { n: i + 1 })} className="h-16 w-12 rounded-lg object-cover ring-2 ring-white/70" />
                    <button
                      onClick={() => setPages((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label={t("analyze.camera.removePage")}
                      className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-black/80 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
                className="grid h-12 w-12 place-items-center rounded-full bg-white/15 text-white backdrop-blur"
                aria-label={t("analyze.camera.flip")}
              >
                <RotateCcw className="h-5 w-5" />
              </button>
              <button
                onClick={shoot}
                className="grid h-20 w-20 place-items-center rounded-full bg-white text-flip-600 shadow-lg active:scale-95"
                aria-label={pages.length > 0 ? t("analyze.camera.addPage") : t("analyze.camera.shoot")}
              >
                {pages.length > 0 ? <Plus className="h-8 w-8" /> : <Camera className="h-8 w-8" />}
              </button>
              <button
                onClick={finish}
                disabled={pages.length === 0}
                className="grid h-12 min-w-12 place-items-center rounded-full bg-flip-500 px-3 font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-30"
                aria-label={t("analyze.camera.analyze")}
              >
                {pages.length > 0 ? <span className="flex items-center gap-1"><Check className="h-5 w-5" />{pages.length}</span> : <Check className="h-5 w-5" />}
              </button>
            </div>
            <p className="text-center text-xs text-white/70">
              {pages.length > 0 ? t("analyze.camera.hintMore") : t("analyze.camera.hintFirst")}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
