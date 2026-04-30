import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Toaster } from "sonner";
import CameraFeed from "@/components/CameraFeed";
import Dashboard from "@/components/Dashboard";
import Header from "@/components/Header";
import { useFaceDetection } from "@/hooks/useFaceDetection";
import { useSessionTimer } from "@/hooks/useSessionTimer";

export const Route = createFileRoute("/")({
  component: DriveGuardPage,
  head: () => ({
    meta: [
      { title: "DriveGuard AI — Fleet Fatigue Monitoring" },
      {
        name: "description",
        content:
          "Real-time driver fatigue detection for fleet managers. AI-powered monitoring via device camera.",
      },
    ],
  }),
});

function DriveGuardPage() {
  // Avoid SSR rendering of camera/ML code — face-api is client-only.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-bg">
        <div className="font-display text-2xl tracking-wide">
          <span className="text-text1">Drive</span>
          <span className="text-brand-green">Guard</span>
          <span className="text-text1 ml-1">AI</span>
        </div>
      </div>
    );
  }

  return <DriveGuardApp />;
}

function DriveGuardApp() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const {
    mode,
    loadProgress,
    running,
    score,
    metrics,
    events,
    history,
    fps,
    faceLocked,
    faceLost,
    alertLevel,
    bannerMsg,
    startSession,
    stopSession,
  } = useFaceDetection({ videoRef, overlayRef });

  const { elapsed } = useSessionTimer(running);

  if (mode === "loading") {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-bg">
        <div className="font-display text-3xl font-extrabold tracking-wide mb-2">
          <span className="text-text1">Drive</span>
          <span className="text-brand-green">Guard</span>
          <span className="text-text1 ml-1">AI</span>
        </div>
        <div className="text-text2 font-mono text-xs mb-6 tracking-widest">
          INITIALIZING NEURAL MODELS
        </div>
        <div className="w-72 h-1 bg-bg3 rounded overflow-hidden">
          <div
            className="h-full bg-brand-green transition-all duration-300"
            style={{ width: `${loadProgress}%` }}
          />
        </div>
        <div className="font-mono text-xs text-text3 mt-2">{loadProgress}%</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-bg overflow-hidden">
      <Header mode={mode} running={running} />
      <div className="flex-1 flex min-h-0">
        <CameraFeed
          videoRef={videoRef}
          overlayRef={overlayRef}
          mode={mode}
          running={running}
          fps={fps}
          faceLocked={faceLocked}
          faceLost={faceLost}
          elapsed={elapsed}
          alertLevel={alertLevel}
          bannerMsg={bannerMsg}
        />
        <Dashboard
          mode={mode}
          running={running}
          score={score}
          metrics={metrics}
          events={events}
          history={history}
          onStart={startSession}
          onStop={stopSession}
        />
      </div>
      <Toaster theme="dark" position="top-right" richColors />
    </div>
  );
}
