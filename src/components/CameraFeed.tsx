import { forwardRef } from "react";
import type { AlertLevel, AppMode } from "@/lib/constants";
import { fmtTime } from "@/lib/fatigueScore";
import AlertOverlay from "./AlertOverlay";

interface CameraFeedProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  overlayRef: React.RefObject<HTMLCanvasElement | null>;
  mode: AppMode;
  running: boolean;
  fps: number;
  faceLocked: boolean;
  faceLost: boolean;
  elapsed: number;
  alertLevel: AlertLevel;
  bannerMsg: string | null;
}

const CameraFeed = forwardRef<HTMLDivElement, CameraFeedProps>(function CameraFeed(
  {
    videoRef,
    overlayRef,
    mode,
    running,
    fps,
    faceLocked,
    faceLost,
    elapsed,
    alertLevel,
    bannerMsg,
  },
  ref,
) {
  return (
    <div
      ref={ref}
      className="flex-1 relative bg-black m-3 border border-border overflow-hidden rounded-sm"
    >
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: "scaleX(-1)" }}
        playsInline
        muted
      />
      <canvas
        ref={overlayRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ transform: "scaleX(-1)" }}
      />

      {/* Corner brackets */}
      <div className="corner tl" />
      <div className="corner tr" />
      <div className="corner bl" />
      <div className="corner br" />

      {/* HUD top center */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 font-mono text-[9px] tracking-[0.3em] text-brand-green/80 bg-bg/60 px-3 py-1 rounded-sm border border-brand-green/20">
        {mode === "ready" ? "LIVE CAMERA · REAL AI" : "SIMULATION · DEMO MODE"}
      </div>

      {/* HUD top-left */}
      <div
        className="absolute top-12 left-5 font-mono text-[10px] leading-[1.8]"
        style={{ color: "rgba(0,229,160,0.7)" }}
      >
        <div>
          <span className="text-text3">SYS </span>
          <span className={running ? "text-brand-green" : "text-text2"}>
            {running ? "● MONITORING" : "○ STANDBY"}
          </span>
        </div>
        <div>
          <span className="text-text3">TIME </span>
          <span className="text-text1">{fmtTime(elapsed)}</span>
        </div>
      </div>

      {/* HUD top-right */}
      <div
        className="absolute top-12 right-5 font-mono text-[10px] leading-[1.8] text-right"
        style={{ color: "rgba(0,229,160,0.7)" }}
      >
        <div>
          <span className="text-text3">FPS </span>
          <span className="text-text1">{String(fps).padStart(2, "0")}</span>
        </div>
        <div>
          <span className="text-text3">FACE </span>
          <span className={faceLocked ? "text-brand-green" : "text-brand-amber"}>
            {faceLocked ? "● LOCKED" : "○ NO FACE"}
          </span>
        </div>
      </div>

      {/* Driver tag */}
      <div className="absolute bottom-5 left-5 font-mono text-[10px] text-text2 bg-bg/60 px-2 py-1 border border-border rounded-sm">
        <span className="text-text3">DRIVER: </span>
        <span className="text-brand-green">DRV-001</span>
      </div>

      <AlertOverlay level={alertLevel} bannerMsg={bannerMsg} />

      {/* Face not detected */}
      {faceLost && running && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg/40 pointer-events-none">
          <div className="font-display text-lg text-brand-amber mb-1">Лицо не обнаружено</div>
          <div className="font-mono text-xs text-text2">Поправьте камеру</div>
        </div>
      )}

      {/* Idle state */}
      {!running && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="font-display text-2xl text-text2 mb-2">Камера выключена</div>
          <div className="font-mono text-[10px] text-text3 tracking-widest">
            НАЖМИТЕ "НАЧАТЬ ПОЕЗДКУ" ДЛЯ ЗАПУСКА
          </div>
        </div>
      )}
    </div>
  );
});

export default CameraFeed;
