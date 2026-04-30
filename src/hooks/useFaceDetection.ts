import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertLevel,
  AppMode,
  initialMetrics,
  LogEvent,
  Metrics,
  MODEL_URL,
  Severity,
  THRESH,
} from "@/lib/constants";
import { calcFatigueScore } from "@/lib/fatigueScore";

// Lazy-loaded face-api module (client-only). face-api's package.json points
// "main" to the Node build, which requires @tensorflow/tfjs-node and breaks
// SSR. Importing dynamically inside an effect avoids loading on the server.
type FaceApi = typeof import("@vladmandic/face-api");
let faceApiPromise: Promise<FaceApi> | null = null;
function loadFaceApi(): Promise<FaceApi> {
  if (!faceApiPromise) {
    faceApiPromise = import(
      /* @vite-ignore */ "@vladmandic/face-api/dist/face-api.esm.js"
    ) as unknown as Promise<FaceApi>;
  }
  return faceApiPromise;
}

interface UseFaceDetectionOpts {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  overlayRef: React.RefObject<HTMLCanvasElement | null>;
}

export function useFaceDetection({ videoRef, overlayRef }: UseFaceDetectionOpts) {
  const [mode, setMode] = useState<AppMode>("loading");
  const [loadProgress, setLoadProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [metrics, setMetrics] = useState<Metrics>(initialMetrics);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [history, setHistory] = useState<{ t: number; v: number }[]>([]);
  const [fps, setFps] = useState(0);
  const [faceLocked, setFaceLocked] = useState(false);
  const [alertLevel, setAlertLevel] = useState<AlertLevel>("none");
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const [faceLost, setFaceLost] = useState(false);

  const faceApiRef = useRef<FaceApi | null>(null);
  const scoreRef = useRef(0);
  const blinksRef = useRef<number[]>([]);
  const eyeAvgRef = useRef<number[]>([]);
  const wasClosedRef = useRef(false);
  const startTimeRef = useRef(0);
  const lastFaceTimeRef = useRef(0);
  const faceLostLoggedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastFpsRef = useRef({ t: 0, n: 0 });
  const eventIdRef = useRef(0);
  const alertStateRef = useRef({ warn: false, crit: false });
  const bannerTimerRef = useRef<number | null>(null);
  const historyTickRef = useRef(0);

  // Load models (client-only)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadProgress(15);
        const fa = await loadFaceApi();
        if (cancelled) return;
        faceApiRef.current = fa;
        setLoadProgress(40);
        await fa.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        if (cancelled) return;
        setLoadProgress(75);
        await fa.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
        if (cancelled) return;
        setLoadProgress(100);
        setTimeout(() => !cancelled && setMode("ready"), 250);
      } catch (e) {
        console.warn("face-api unavailable, demo mode:", e);
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
    setEvents((prev) =>
      [{ id: ++eventIdRef.current, ts, text, severity }, ...prev].slice(0, 8),
    );
  }, []);

  const showBanner = useCallback((msg: string, dur = 3000) => {
    setBannerMsg(msg);
    if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = window.setTimeout(() => setBannerMsg(null), dur);
  }, []);

  const updateScore = useCallback(
    (newScore: number) => {
      scoreRef.current = newScore;
      setScore(newScore);

      // sample history every ~8 frames to keep chart light
      historyTickRef.current++;
      if (historyTickRef.current % 6 === 0) {
        setHistory((prev) => {
          const next = [
            ...prev,
            { t: (performance.now() - startTimeRef.current) / 1000, v: newScore },
          ];
          return next.length > 80 ? next.slice(next.length - 80) : next;
        });
      }

      const crit = newScore >= THRESH.crit;
      const warn = newScore >= THRESH.warn && !crit;

      if (crit && !alertStateRef.current.crit) {
        alertStateRef.current.crit = true;
        alertStateRef.current.warn = false;
        setAlertLevel("critical");
        showBanner("КРИТИЧЕСКАЯ УСТАЛОСТЬ — ОСТАНОВИТЕСЬ", 5000);
        addEvent("Критический уровень. Менеджер уведомлён.", "critical");
        toast.error("Критическая усталость", {
          description: "Немедленная остановка. Менеджер уведомлён.",
        });
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

  const runDetectionLoop = useCallback(() => {
    const fa = faceApiRef.current;
    const video = videoRef.current;
    const canvas = overlayRef.current;
    if (!fa || !video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const opts = new fa.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });
    lastFpsRef.current = { t: performance.now(), n: 0 };

    const tick = async () => {
      if (!videoRef.current || !overlayRef.current) return;
      try {
        const result = await fa.detectSingleFace(video, opts).withFaceLandmarks(true);

        lastFpsRef.current.n++;
        const now = performance.now();
        if (now - lastFpsRef.current.t >= 1000) {
          setFps(lastFpsRef.current.n);
          lastFpsRef.current.n = 0;
          lastFpsRef.current.t = now;
        }

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

          const dims = fa.matchDimensions(canvas, video, true);
          const resized = fa.resizeResults(result, dims);
          const box = resized.detection.box;
          const landmarks = resized.landmarks;

          const sc = scoreRef.current;
          const boxColor =
            sc >= THRESH.risk ? "rgb(255,61,87)" : sc >= THRESH.norm ? "rgb(245,166,35)" : "rgb(0,229,160)";

          ctx.strokeStyle = boxColor;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(box.x, box.y, box.width, box.height);

          // SCORE label above box
          ctx.font = "11px 'JetBrains Mono', monospace";
          ctx.fillStyle = boxColor;
          ctx.fillText(`SCORE: ${Math.round(sc)}`, box.x, Math.max(12, box.y - 6));

          const leftEye = landmarks.getLeftEye();
          const rightEye = landmarks.getRightEye();
          const nose = landmarks.getNose();

          ctx.fillStyle = boxColor;
          [...leftEye, ...rightEye].forEach((p) => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
            ctx.fill();
          });
          const nosePt = nose[3] || nose[0];
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.beginPath();
          ctx.arc(nosePt.x, nosePt.y, 2, 0, Math.PI * 2);
          ctx.fill();

          const eyeOpenness = (eye: { x: number; y: number }[]) => {
            const ww = Math.hypot(eye[3].x - eye[0].x, eye[3].y - eye[0].y);
            const v1 = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y);
            const v2 = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y);
            return (v1 + v2) / 2 / Math.max(ww, 1);
          };
          const eyeOpen = (eyeOpenness(leftEye) + eyeOpenness(rightEye)) / 2;

          eyeAvgRef.current.push(eyeOpen);
          if (eyeAvgRef.current.length > 30) eyeAvgRef.current.shift();
          const avg =
            eyeAvgRef.current.reduce((a, b) => a + b, 0) / eyeAvgRef.current.length;

          const isClosed = eyeOpen < 0.2 && eyeOpen < avg * 0.5;
          if (isClosed && !wasClosedRef.current) {
            blinksRef.current.push(performance.now());
          }
          wasClosedRef.current = isClosed;
          const cutoff = performance.now() - 60000;
          blinksRef.current = blinksRef.current.filter((t) => t > cutoff);
          const sessionLen = Math.min(60, (performance.now() - startTimeRef.current) / 1000);
          const blinkRate =
            sessionLen > 5 ? (blinksRef.current.length / sessionLen) * 60 : 15;

          const eyeMidX = (leftEye[0].x + rightEye[3].x) / 2;
          const eyeDist = Math.hypot(
            rightEye[3].x - leftEye[0].x,
            rightEye[3].y - leftEye[0].y,
          );
          const headYaw = Math.min(1, Math.abs(nosePt.x - eyeMidX) / Math.max(eyeDist, 1));
          const tilt = Math.abs(rightEye[3].y - leftEye[0].y) / Math.max(eyeDist, 1);
          const headNod = Math.min(1, tilt * 2);
          const faceInFrame = Math.min(1, ((box.width * box.height) / (w * h)) * 6);

          const m: Metrics = { eyeOpen, blinkRate, headYaw, headNod, faceInFrame };
          setMetrics(m);

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
  }, [videoRef, overlayRef, addEvent, updateScore]);

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

      const eyeOpen = Math.max(0.08, 0.4 - newScore / 250 + (Math.random() - 0.5) * 0.05);
      const blinkRate = Math.max(3, 18 - newScore / 8 + (Math.random() - 0.5) * 4);
      const headYaw = Math.min(0.9, newScore / 200 + Math.random() * 0.1);
      const headNod = Math.min(0.9, newScore / 250 + Math.random() * 0.1);
      const faceInFrame = 0.85 + Math.random() * 0.1;
      setMetrics({ eyeOpen, blinkRate, headYaw, headNod, faceInFrame });
      setFps(30);

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [updateScore]);

  const startSession = useCallback(async () => {
    scoreRef.current = 0;
    setScore(0);
    setMetrics(initialMetrics);
    blinksRef.current = [];
    eyeAvgRef.current = [];
    wasClosedRef.current = false;
    setHistory([]);
    historyTickRef.current = 0;
    alertStateRef.current = { warn: false, crit: false };
    setAlertLevel("none");
    setBannerMsg(null);
    setEvents([]);
    setFaceLost(false);
    faceLostLoggedRef.current = false;
    startTimeRef.current = performance.now();
    lastFaceTimeRef.current = performance.now();
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
  }, [mode, addEvent, runDetectionLoop, runDemoLoop, videoRef]);

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
  }, [addEvent, videoRef]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    mode,
    loadProgress,
    running,
    score,
    metrics,
    events,
    history,
    fps,
    faceLocked,
    alertLevel,
    bannerMsg,
    faceLost,
    startSession,
    stopSession,
  };
}
