import { useEffect, useRef, useState, useCallback } from "react";
import * as faceapi from "@vladmandic/face-api";

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";

type AppMode = "loading" | "ready" | "demo";
type Severity = "info" | "warning" | "critical";
type LogEvent = { id: number; ts: string; text: string; severity: Severity };

interface Metrics {
  eyeOpen: number; // 0..1
  blinkRate: number; // per minute
  headYaw: number; // 0..1
  headNod: number; // 0..1
  faceInFrame: number; // 0..1
}

const initialMetrics: Metrics = {
  eyeOpen: 0.3,
  blinkRate: 15,
  headYaw: 0.05,
  headNod: 0.05,
  faceInFrame: 0,
};

function calcFatigueScore(eyeOpen: number, blinkRate: number, headYaw: number, headNod: number): number {
  let score = 0;
  if (eyeOpen < 0.15) score += 40;
  else if (eyeOpen < 0.25) score += 20;
  else if (eyeOpen < 0.35) score += 8;
  if (blinkRate < 6) score += 30;
  else if (blinkRate < 10) score += 15;
  else if (blinkRate > 25) score += 10;
  if (headYaw > 0.35) score += 25;
  else if (headYaw > 0.2) score += 10;
  score += headNod * 40;
  return Math.min(100, Math.max(0, score));
}

function scoreColor(score: number): string {
  if (score >= 80) return "var(--color-brand-red)";
  if (score >= 60) return "var(--color-brand-red)";
  if (score >= 30) return "var(--color-brand-amber)";
  return "var(--color-brand-green)";
}

function scoreLabel(score: number): { label: string; desc: string } {
  if (score >= 80) return { label: "КРИТИЧНО", desc: "Немедленная остановка. Менеджер уведомлён." };
  if (score >= 60) return { label: "РИСК", desc: "Высокая утомляемость. Рекомендуется перерыв." };
  if (score >= 30) return { label: "УСТАЛОСТЬ", desc: "Признаки усталости. Будьте внимательны." };
  return { label: "НОРМА", desc: "Состояние водителя в норме." };
}

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

export default function DriveGuard() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<AppMode>("loading");
  const [loadProgress, setLoadProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [metrics, setMetrics] = useState<Metrics>(initialMetrics);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [fps, setFps] = useState(0);
  const [faceLocked, setFaceLocked] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [alertLevel, setAlertLevel] = useState<"none" | "warning" | "critical">("none");
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const [faceLost, setFaceLost] = useState(false);

  // refs for the loop
  const scoreRef = useRef(0);
  const metricsRef = useRef<Metrics>(initialMetrics);
  const blinksRef = useRef<number[]>([]);
  const eyeAvgRef = useRef<number[]>([]);
  const wasClosedRef = useRef(false);
  const startTimeRef = useRef(0);
  const lastFaceTimeRef = useRef(0);
  const faceLostLoggedRef = useRef(false);
  const scoreHistoryRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastFpsRef = useRef({ t: performance.now(), n: 0 });
  const eventIdRef = useRef(0);
  const alertStateRef = useRef<{ warn: boolean; crit: boolean }>({ warn: false, crit: false });
  const bannerTimerRef = useRef<number | null>(null);

  // Load models
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadProgress(20);
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        if (cancelled) return;
        setLoadProgress(60);
        await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
        if (cancelled) return;
        setLoadProgress(100);
        setTimeout(() => !cancelled && setMode("ready"), 250);
      } catch (e) {
        console.warn("face-api failed to load, switching to demo mode", e);
        if (!cancelled) {
          setLoadProgress(100);
          setTimeout(() => !cancelled && setMode("demo"), 250);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addEvent = useCallback((text: string, severity: Severity) => {
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    setEvents((prev) => [{ id: ++eventIdRef.current, ts, text, severity }, ...prev].slice(0, 8));
  }, []);

  const showBanner = useCallback((msg: string, dur = 3000) => {
    setBannerMsg(msg);
    if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = window.setTimeout(() => setBannerMsg(null), dur);
  }, []);

  // Process score state changes
  const updateScore = useCallback(
    (newScore: number) => {
      scoreRef.current = newScore;
      setScore(newScore);
      scoreHistoryRef.current.push(newScore);
      if (scoreHistoryRef.current.length > 240) scoreHistoryRef.current.shift();

      const crit = newScore >= 80;
      const warn = newScore >= 50 && !crit;

      if (crit && !alertStateRef.current.crit) {
        alertStateRef.current.crit = true;
        alertStateRef.current.warn = false;
        setAlertLevel("critical");
        showBanner("⚠ КРИТИЧЕСКИЙ УРОВЕНЬ УСТАЛОСТИ — ОСТАНОВИТЕСЬ", 5000);
        addEvent("Критический уровень. Менеджер уведомлён.", "critical");
      } else if (warn && !alertStateRef.current.warn && !alertStateRef.current.crit) {
        alertStateRef.current.warn = true;
        setAlertLevel("warning");
        showBanner("Признаки усталости. Сделайте перерыв.", 4000);
        addEvent("Предупреждение: усталость", "warning");
      } else if (!crit && !warn && (alertStateRef.current.crit || alertStateRef.current.warn)) {
        alertStateRef.current.crit = false;
        alertStateRef.current.warn = false;
        setAlertLevel("none");
      } else if (!crit && alertStateRef.current.crit) {
        alertStateRef.current.crit = false;
        setAlertLevel(warn ? "warning" : "none");
        if (!warn) alertStateRef.current.warn = false;
      }
    },
    [addEvent, showBanner],
  );

  // Draw timeline
  useEffect(() => {
    const c = timelineRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== w * dpr) {
      c.width = w * dpr;
      c.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // threshold lines
    [30, 60, 80].forEach((thr) => {
      const y = h - (thr / 100) * h;
      ctx.strokeStyle = "rgba(122, 154, 181, 0.18)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    const hist = scoreHistoryRef.current;
    if (hist.length < 2) return;
    const color =
      score >= 80
        ? "rgb(255,61,87)"
        : score >= 60
        ? "rgb(255,61,87)"
        : score >= 30
        ? "rgb(245,166,35)"
        : "rgb(0,229,160)";

    ctx.beginPath();
    ctx.moveTo(0, h);
    hist.forEach((v, i) => {
      const x = (i / (hist.length - 1)) * w;
      const y = h - (v / 100) * h;
      ctx.lineTo(x, y);
    });
    ctx.lineTo(w, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color.replace("rgb", "rgba").replace(")", ",0.4)"));
    grad.addColorStop(1, color.replace("rgb", "rgba").replace(")", ",0.02)"));
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    hist.forEach((v, i) => {
      const x = (i / (hist.length - 1)) * w;
      const y = h - (v / 100) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [score]);

  // Real detection loop
  const runDetectionLoop = useCallback(async () => {
    const video = videoRef.current;
    const canvas = overlayRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });

    const tick = async () => {
      if (!videoRef.current || !overlayRef.current) return;
      try {
        const result = await faceapi
          .detectSingleFace(video, opts)
          .withFaceLandmarks(true);

        // FPS
        lastFpsRef.current.n++;
        const now = performance.now();
        if (now - lastFpsRef.current.t >= 1000) {
          setFps(lastFpsRef.current.n);
          lastFpsRef.current.n = 0;
          lastFpsRef.current.t = now;
        }

        // resize canvas to video display size
        const w = video.clientWidth;
        const h = video.clientHeight;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        ctx.clearRect(0, 0, w, h);

        if (result) {
          lastFaceTimeRef.current = performance.now();
          if (faceLostLoggedRef.current) {
            faceLostLoggedRef.current = false;
            setFaceLost(false);
          }
          setFaceLocked(true);

          const dims = faceapi.matchDimensions(canvas, video, true);
          const resized = faceapi.resizeResults(result, dims);
          const box = resized.detection.box;
          const landmarks = resized.landmarks;

          // bounding box
          ctx.strokeStyle = "rgba(0,229,160,0.9)";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(box.x, box.y, box.width, box.height);
          // corners
          ctx.strokeStyle = "rgba(0,229,160,1)";
          ctx.lineWidth = 2;
          const cl = 12;
          [
            [box.x, box.y, 1, 1],
            [box.x + box.width, box.y, -1, 1],
            [box.x, box.y + box.height, 1, -1],
            [box.x + box.width, box.y + box.height, -1, -1],
          ].forEach(([x, y, dx, dy]) => {
            ctx.beginPath();
            ctx.moveTo(x, y + dy * cl);
            ctx.lineTo(x, y);
            ctx.lineTo(x + dx * cl, y);
            ctx.stroke();
          });

          const leftEye = landmarks.getLeftEye();
          const rightEye = landmarks.getRightEye();
          const nose = landmarks.getNose();

          // eye landmarks
          ctx.fillStyle = "rgba(0,229,160,0.9)";
          [...leftEye, ...rightEye].forEach((p) => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
            ctx.fill();
          });
          // nose dot
          const nosePt = nose[3] || nose[0];
          ctx.fillStyle = "rgba(245,166,35,0.95)";
          ctx.beginPath();
          ctx.arc(nosePt.x, nosePt.y, 3, 0, Math.PI * 2);
          ctx.fill();

          // Eye openness — using EAR-like ratio
          const eyeOpenness = (eye: faceapi.Point[]) => {
            const w = Math.hypot(eye[3].x - eye[0].x, eye[3].y - eye[0].y);
            const v1 = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y);
            const v2 = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y);
            return ((v1 + v2) / 2) / Math.max(w, 1);
          };
          const eyeOpen = (eyeOpenness(leftEye) + eyeOpenness(rightEye)) / 2;

          // rolling avg
          eyeAvgRef.current.push(eyeOpen);
          if (eyeAvgRef.current.length > 30) eyeAvgRef.current.shift();
          const avg = eyeAvgRef.current.reduce((a, b) => a + b, 0) / eyeAvgRef.current.length;

          // blink detection
          const isClosed = eyeOpen < 0.2 && eyeOpen < avg * 0.5;
          if (isClosed && !wasClosedRef.current) {
            blinksRef.current.push(performance.now());
          }
          wasClosedRef.current = isClosed;
          // prune blinks older than 60s
          const cutoff = performance.now() - 60000;
          blinksRef.current = blinksRef.current.filter((t) => t > cutoff);
          // Estimate per-minute (scale by elapsed window if <60s)
          const sessionLen = Math.min(60, (performance.now() - startTimeRef.current) / 1000);
          const blinkRate = sessionLen > 5 ? (blinksRef.current.length / sessionLen) * 60 : 15;

          // Head yaw
          const eyeMidX = (leftEye[0].x + rightEye[3].x) / 2;
          const eyeDist = Math.hypot(rightEye[3].x - leftEye[0].x, rightEye[3].y - leftEye[0].y);
          const headYaw = Math.min(1, Math.abs(nosePt.x - eyeMidX) / Math.max(eyeDist, 1));

          // Head nod estimated from eye-line tilt
          const tilt = Math.abs(rightEye[3].y - leftEye[0].y) / Math.max(eyeDist, 1);
          const headNod = Math.min(1, tilt * 2);

          const faceInFrame = Math.min(1, (box.width * box.height) / (w * h) * 6);

          const newMetrics: Metrics = { eyeOpen, blinkRate, headYaw, headNod, faceInFrame };
          metricsRef.current = newMetrics;
          setMetrics(newMetrics);

          const raw = calcFatigueScore(eyeOpen, blinkRate, headYaw, headNod);
          const smoothed = scoreRef.current * 0.7 + raw * 0.3;
          updateScore(smoothed);
        } else {
          setFaceLocked(false);
          const lostFor = performance.now() - lastFaceTimeRef.current;
          if (lostFor > 2000 && !faceLostLoggedRef.current) {
            faceLostLoggedRef.current = true;
            setFaceLost(true);
            addEvent("Лицо не обнаружено", "warning");
            // bump score slightly
            updateScore(Math.min(100, scoreRef.current + 5));
          }
          setMetrics((m) => ({ ...m, faceInFrame: 0 }));
        }
      } catch (e) {
        console.error(e);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [addEvent, updateScore]);

  // Demo simulation loop
  const runDemoLoop = useCallback(() => {
    lastFaceTimeRef.current = performance.now();
    setFaceLocked(true);
    const tick = () => {
      const t = (performance.now() - startTimeRef.current) / 1000;
      let target: number;
      if (t < 30) target = 5 + Math.random() * 15;
      else if (t < 60) target = 20 + Math.random() * 25;
      else if (t < 90) target = 50 + Math.random() * 20;
      else target = 70 + Math.random() * 20;

      const newScore = scoreRef.current * 0.85 + target * 0.15;
      updateScore(newScore);

      // simulate metrics
      const eyeOpen = Math.max(0.08, 0.4 - newScore / 250 + (Math.random() - 0.5) * 0.05);
      const blinkRate = Math.max(3, 18 - newScore / 8 + (Math.random() - 0.5) * 4);
      const headYaw = Math.min(0.9, newScore / 200 + Math.random() * 0.1);
      const headNod = Math.min(0.9, newScore / 250 + Math.random() * 0.1);
      const faceInFrame = 0.85 + Math.random() * 0.1;

      const m: Metrics = { eyeOpen, blinkRate, headYaw, headNod, faceInFrame };
      metricsRef.current = m;
      setMetrics(m);

      // fps placeholder
      setFps(30);

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [updateScore]);

  // elapsed timer
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed(performance.now() - startTimeRef.current), 250);
    return () => clearInterval(id);
  }, [running]);

  const startSession = useCallback(async () => {
    // reset
    scoreRef.current = 0;
    setScore(0);
    metricsRef.current = initialMetrics;
    setMetrics(initialMetrics);
    blinksRef.current = [];
    eyeAvgRef.current = [];
    wasClosedRef.current = false;
    scoreHistoryRef.current = [];
    alertStateRef.current = { warn: false, crit: false };
    setAlertLevel("none");
    setBannerMsg(null);
    setEvents([]);
    setFaceLost(false);
    faceLostLoggedRef.current = false;
    startTimeRef.current = performance.now();
    lastFaceTimeRef.current = performance.now();
    setElapsed(0);
    addEvent("Поездка начата", "info");

    if (mode === "ready") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: "user" },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setRunning(true);
        runDetectionLoop();
      } catch (e) {
        console.error("Camera error", e);
        addEvent("Доступ к камере отклонён — демо-режим", "warning");
        setRunning(true);
        runDemoLoop();
      }
    } else {
      setRunning(true);
      runDemoLoop();
    }
  }, [mode, addEvent, runDetectionLoop, runDemoLoop]);

  const stopSession = useCallback(() => {
    setRunning(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    addEvent("Поездка завершена", "info");
    setFaceLocked(false);
    setAlertLevel("none");
    alertStateRef.current = { warn: false, crit: false };
  }, [addEvent]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ------- RENDER --------
  if (mode === "loading") {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-bg">
        <div className="font-display text-3xl tracking-wide mb-2">
          <span className="text-text1">Drive</span>
          <span className="text-brand-green">Guard</span>
          <span className="text-text2 text-base ml-2 font-mono">AI</span>
        </div>
        <div className="text-text2 font-mono text-xs mb-6 tracking-widest">INITIALIZING NEURAL MODELS</div>
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

  const sLabel = scoreLabel(score);
  const sColor = scoreColor(score);
  const arcCircumference = 2 * Math.PI * 34;
  const arcOffset = arcCircumference * (1 - score / 100);

  const eyeStateText =
    metrics.eyeOpen < 0.2 ? "Закрыты" : metrics.eyeOpen < 0.3 ? "Прикрыты" : "Открыты";
  const headStateText = metrics.headYaw > 0.2 ? "Отклонение" : "Прямо";

  return (
    <div className="h-screen w-screen flex flex-col bg-bg overflow-hidden">
      {/* HEADER */}
      <header className="h-14 border-b border-border bg-bg2/60 flex items-center justify-between px-5 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="font-display text-xl font-bold tracking-wide">
            <span className="text-text1">Drive</span>
            <span className="text-brand-green">Guard</span>
            <span className="text-text2 text-xs ml-2 font-mono font-normal align-middle">AI</span>
          </div>
          <span className="font-mono text-[10px] tracking-widest px-2 py-1 border border-border rounded text-text2 bg-bg">
            MVP DEMO v0.1
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${running ? "bg-brand-green pulse-dot" : "bg-text3"}`}
          />
          <span className="font-mono text-[11px] tracking-wider text-text2">
            {mode === "ready" ? (running ? "AI ACTIVE" : "AI READY") : running ? "DEMO ACTIVE" : "DEMO MODE"}
          </span>
        </div>
      </header>

      {/* MAIN */}
      <div className="flex-1 flex min-h-0">
        {/* LEFT — camera */}
        <div className="flex-1 relative bg-black m-3 border border-border overflow-hidden" ref={containerRef}>
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

          {/* corner brackets */}
          {([
            "top-3 left-3 border-t border-l",
            "top-3 right-3 border-t border-r",
            "bottom-3 left-3 border-b border-l",
            "bottom-3 right-3 border-b border-r",
          ]).map((c, i) => (
            <div key={i} className={`absolute w-6 h-6 border-brand-green/80 ${c} pointer-events-none`} />
          ))}

          {/* alert overlay border */}
          {alertLevel !== "none" && (
            <div
              className={`absolute inset-0 pointer-events-none ${
                alertLevel === "critical" ? "critical-flash" : "warning-glow"
              }`}
            />
          )}

          {/* HUD top center */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.3em] text-text2 bg-bg/70 px-3 py-1 rounded-sm border border-border">
            {mode === "ready" ? "LIVE CAMERA · REAL AI" : "SIMULATION · DEMO MODE"}
          </div>

          {/* HUD top-left */}
          <div className="absolute top-12 left-5 font-mono text-[11px] text-text2 space-y-1">
            <div>
              <span className="text-text3">SYS</span>{" "}
              <span className={running ? "text-brand-green" : "text-text2"}>
                {running ? "● MONITORING" : "○ STANDBY"}
              </span>
            </div>
            <div>
              <span className="text-text3">TIME</span>{" "}
              <span className="text-text1">{fmtTime(elapsed)}</span>
            </div>
          </div>

          {/* HUD top-right */}
          <div className="absolute top-12 right-5 font-mono text-[11px] text-text2 text-right space-y-1">
            <div>
              <span className="text-text3">FPS</span>{" "}
              <span className="text-text1">{String(fps).padStart(2, "0")}</span>
            </div>
            <div>
              <span className="text-text3">FACE</span>{" "}
              <span className={faceLocked ? "text-brand-green" : "text-brand-amber"}>
                {faceLocked ? "● LOCKED" : "○ SEARCHING"}
              </span>
            </div>
          </div>

          {/* driver tag */}
          <div className="absolute bottom-5 left-5 font-mono text-[11px] text-text2 bg-bg/70 px-2 py-1 border border-border">
            <span className="text-text3">DRIVER:</span> <span className="text-brand-green">DRV-001</span>
          </div>

          {/* banner */}
          {bannerMsg && (
            <div
              className="banner-in absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-6 py-3 font-display font-semibold text-sm tracking-wider border"
              style={{
                background: "rgba(8,12,16,0.85)",
                color: alertLevel === "critical" ? "rgb(255,61,87)" : "rgb(245,166,35)",
                borderColor: alertLevel === "critical" ? "rgb(255,61,87)" : "rgb(245,166,35)",
              }}
            >
              {bannerMsg}
            </div>
          )}

          {/* face not detected */}
          {faceLost && running && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg/40 pointer-events-none">
              <div className="font-display text-lg text-brand-amber mb-1">Лицо не обнаружено</div>
              <div className="font-mono text-xs text-text2">Поправьте камеру</div>
            </div>
          )}

          {/* idle state */}
          {!running && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="font-display text-2xl text-text2 mb-2">Камера выключена</div>
              <div className="font-mono text-xs text-text3 tracking-widest">
                НАЖМИТЕ "НАЧАТЬ ПОЕЗДКУ" ДЛЯ ЗАПУСКА
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — dashboard */}
        <aside className="w-[340px] flex-shrink-0 border-l border-border bg-bg2 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Fatigue Score */}
            <section>
              <div className="font-mono text-[10px] tracking-[0.2em] text-text3 mb-3">
                FATIGUE SCORE
              </div>
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20 flex-shrink-0">
                  <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="var(--color-bg3)" strokeWidth="6" />
                    <circle
                      cx="40"
                      cy="40"
                      r="34"
                      fill="none"
                      stroke={sColor}
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={arcCircumference}
                      strokeDashoffset={arcOffset}
                      style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.4s ease" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-mono font-bold text-xl text-text1">
                    {Math.round(score)}
                  </div>
                </div>
                <div>
                  <div
                    className="font-display font-bold text-base tracking-wider"
                    style={{ color: sColor }}
                  >
                    {sLabel.label}
                  </div>
                  <div className="text-xs text-text2 mt-1 leading-snug">{sLabel.desc}</div>
                </div>
              </div>

              {/* threshold pills */}
              <div className="grid grid-cols-4 gap-1 mt-3">
                {[
                  { l: "0–30", t: "Норма", color: "var(--color-brand-green)", active: score < 30 },
                  { l: "30–60", t: "Усталость", color: "var(--color-brand-amber)", active: score >= 30 && score < 60 },
                  { l: "60–80", t: "Риск", color: "var(--color-brand-red)", active: score >= 60 && score < 80 },
                  { l: "80+", t: "Критично", color: "var(--color-brand-red)", active: score >= 80 },
                ].map((p, i) => (
                  <div
                    key={i}
                    className="text-center py-1.5 border rounded-sm transition-all"
                    style={{
                      borderColor: p.active ? p.color : "var(--color-border)",
                      background: p.active ? `color-mix(in oklab, ${p.color} 15%, transparent)` : "transparent",
                    }}
                  >
                    <div
                      className="font-mono text-[9px] tracking-wider"
                      style={{ color: p.active ? p.color : "var(--color-text3)" }}
                    >
                      {p.l}
                    </div>
                    <div
                      className="text-[9px] mt-0.5"
                      style={{ color: p.active ? "var(--color-text1)" : "var(--color-text2)" }}
                    >
                      {p.t}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Biometrics */}
            <section>
              <div className="font-mono text-[10px] tracking-[0.2em] text-text3 mb-3">
                BIOMETRICS
              </div>
              <div className="space-y-3">
                {[
                  {
                    label: "Состояние глаз",
                    value: eyeStateText,
                    pct: Math.min(100, (metrics.eyeOpen / 0.45) * 100),
                    color: metrics.eyeOpen < 0.2 ? "var(--color-brand-red)" : metrics.eyeOpen < 0.3 ? "var(--color-brand-amber)" : "var(--color-brand-green)",
                  },
                  {
                    label: "Положение головы",
                    value: headStateText,
                    pct: Math.min(100, metrics.headYaw * 200),
                    color: metrics.headYaw > 0.3 ? "var(--color-brand-red)" : metrics.headYaw > 0.2 ? "var(--color-brand-amber)" : "var(--color-brand-green)",
                    invert: true,
                  },
                  {
                    label: "Частота морганий",
                    value: `${Math.round(metrics.blinkRate)}/мин`,
                    pct: Math.min(100, (metrics.blinkRate / 30) * 100),
                    color: metrics.blinkRate < 6 || metrics.blinkRate > 25 ? "var(--color-brand-amber)" : "var(--color-brand-green)",
                  },
                  {
                    label: "Лицо в кадре",
                    value: `${Math.round(metrics.faceInFrame * 100)}%`,
                    pct: metrics.faceInFrame * 100,
                    color: metrics.faceInFrame < 0.3 ? "var(--color-brand-red)" : "var(--color-brand-green)",
                  },
                ].map((row, i) => (
                  <div key={i}>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-xs text-text2">{row.label}</span>
                      <span className="font-mono text-xs text-text1">{row.value}</span>
                    </div>
                    <div className="h-1 bg-bg3 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${row.invert ? 100 - row.pct : row.pct}%`,
                          background: row.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Timeline */}
            <section>
              <div className="font-mono text-[10px] tracking-[0.2em] text-text3 mb-2">
                ИСТОРИЯ ПОЕЗДКИ
              </div>
              <div className="bg-bg border border-border rounded-sm p-2">
                <canvas ref={timelineRef} className="w-full" style={{ height: 60 }} />
              </div>
            </section>

            {/* Event log */}
            <section>
              <div className="font-mono text-[10px] tracking-[0.2em] text-text3 mb-2">
                ЖУРНАЛ СОБЫТИЙ
              </div>
              <div className="space-y-1">
                {events.length === 0 && (
                  <div className="text-xs text-text3 font-mono italic">Нет событий</div>
                )}
                {events.map((ev) => {
                  const c =
                    ev.severity === "critical"
                      ? "var(--color-brand-red)"
                      : ev.severity === "warning"
                      ? "var(--color-brand-amber)"
                      : "var(--color-brand-green)";
                  return (
                    <div
                      key={ev.id}
                      className="flex gap-2 text-xs bg-bg/60 px-2 py-1.5 border-l-2"
                      style={{ borderColor: c }}
                    >
                      <span className="font-mono text-text3 text-[10px] flex-shrink-0 mt-px">{ev.ts}</span>
                      <span className="text-text1 leading-tight">{ev.text}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Controls */}
          <div className="border-t border-border p-3 space-y-2 bg-bg2">
            {!running ? (
              <button
                onClick={startSession}
                className="w-full font-display font-semibold tracking-wide text-sm py-2.5 rounded-sm bg-brand-green text-[#08110d] hover:brightness-110 transition-all"
              >
                Начать поездку
              </button>
            ) : (
              <button
                onClick={stopSession}
                className="w-full font-display font-semibold tracking-wide text-sm py-2.5 rounded-sm border border-brand-red text-brand-red hover:bg-brand-red/10 transition-all"
              >
                Завершить поездку
              </button>
            )}
            <div className="font-mono text-[10px] text-text3 text-center tracking-wider">
              {mode === "ready"
                ? "ИИ-АНАЛИЗ · РАЗРЕШИТЕ ДОСТУП К КАМЕРЕ"
                : "ДЕМО-РЕЖИМ · СИМУЛЯЦИЯ ДАННЫХ"}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
