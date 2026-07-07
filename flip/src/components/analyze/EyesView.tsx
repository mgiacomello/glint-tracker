"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, RotateCcw, Eye, Flashlight, FlashlightOff, Loader2 } from "lucide-react";
import { consumeAnalysisStream, assembleAnalysis } from "@/lib/analysis/stream";
import { saveDocument } from "@/lib/store";
import { getLang } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";
import { getProfile } from "@/lib/profile";
import type { AnalysisPoint, ExtractedDeadline } from "@/lib/analysis/types";

export function EyesView() {
  const router = useRouter();
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const start = useCallback(async (mode: "environment" | "user") => {
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode }, audio: false });
      streamRef.current = s;
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch {
      setErr(t("eyes.error.camera"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    start(facing);
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ torch: !torch } as MediaTrackConstraintSet],
      });
      setTorch((t) => !t);
    } catch {
      setErr(t("eyes.error.torch"));
    }
  };

  const analyze = async () => {
    const video = videoRef.current;
    if (!video || busy) return;
    setBusy(true);
    setErr(null);

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (!blob) {
      setBusy(false);
      return;
    }

    const meta = { current: null as Parameters<NonNullable<Parameters<typeof consumeAnalysisStream>[1]["onMeta"]>>[0] | null };
    const points: AnalysisPoint[] = [];
    const deadlines: ExtractedDeadline[] = [];

    try {
      const fd = new FormData();
      fd.append("file", new File([blob], `live-${Date.now()}.jpg`, { type: "image/jpeg" }));
      fd.append("mode", "eyes");
      fd.append("lang", getLang());
      fd.append("profile", JSON.stringify(getProfile()));
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      if (!res.ok || !res.body) throw new Error();
      await consumeAnalysisStream(res.body, {
        onMeta: (m) => (meta.current = m),
        onPoint: (p) => points.push(p),
        onDeadline: (d) => deadlines.push(d),
      });
      const analysis = assembleAnalysis(meta.current, points, deadlines);
      if (!analysis) throw new Error();
      const doc = saveDocument(t("eyes.liveLabel"), analysis);
      router.replace(`/document/${doc.id}`);
    } catch {
      setErr(t("eyes.error.read"));
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh flex-col bg-black text-white">
      {/* header */}
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-5 pt-safe">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-flip-500">
            <Eye className="h-5 w-5 text-white" />
          </span>
          <div>
            <p className="font-bold leading-tight">{t("eyes.brand")}</p>
            <p className="text-sm text-white/60">{t("eyes.tagline")}</p>
          </div>
        </div>
        <button onClick={() => router.back()} aria-label={t("eyes.close")} className="grid h-9 w-9 place-items-center rounded-full bg-white/10">
          <X className="h-5 w-5" />
        </button>
      </header>

      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />

      {busy && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm">
          <Loader2 className="h-10 w-10 animate-spin text-flip-400" />
          <p className="font-semibold">{t("eyes.reading")}</p>
        </div>
      )}

      {/* controls */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-4 p-6 pb-safe">
        {err && <p className="rounded-full bg-black/60 px-4 py-2 text-sm text-white/90">{err}</p>}
        <div className="flex w-full items-center justify-around">
          <button onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))} className="grid h-12 w-12 place-items-center rounded-full bg-white/15" aria-label={t("eyes.flip")}>
            <RotateCcw className="h-5 w-5" />
          </button>
          <button onClick={analyze} disabled={busy} className="grid h-20 w-20 place-items-center rounded-full bg-white text-flip-600 shadow-lg active:scale-95 disabled:opacity-60" aria-label={t("eyes.analyze")}>
            <Eye className="h-8 w-8" />
          </button>
          <button onClick={toggleTorch} className="grid h-12 w-12 place-items-center rounded-full bg-white/15" aria-label={t("eyes.torch")}>
            {torch ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
          </button>
        </div>
        <p className="text-sm text-white/70">{t("eyes.hint")}</p>
      </div>
    </div>
  );
}
