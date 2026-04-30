export const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";

export const THRESH = {
  warn: 50,
  crit: 80,
  norm: 30,
  risk: 60,
} as const;

export const COLORS = {
  green: "var(--color-brand-green)",
  amber: "var(--color-brand-amber)",
  red: "var(--color-brand-red)",
} as const;

export type Severity = "info" | "warning" | "critical";
export type AppMode = "loading" | "ready" | "demo";
export type AlertLevel = "none" | "warning" | "critical";

export interface Metrics {
  eyeOpen: number;
  blinkRate: number;
  headYaw: number;
  headNod: number;
  faceInFrame: number;
}

export interface LogEvent {
  id: number;
  ts: string;
  text: string;
  severity: Severity;
}

export const initialMetrics: Metrics = {
  eyeOpen: 0.3,
  blinkRate: 15,
  headYaw: 0.05,
  headNod: 0.05,
  faceInFrame: 0,
};
