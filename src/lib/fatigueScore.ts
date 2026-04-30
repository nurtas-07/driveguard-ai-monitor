import { COLORS, THRESH } from "./constants";

export function calcFatigueScore(
  eyeOpen: number,
  blinkRate: number,
  headYaw: number,
  headNod: number,
): number {
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

export function scoreColor(score: number): string {
  if (score >= THRESH.risk) return COLORS.red;
  if (score >= THRESH.norm) return COLORS.amber;
  return COLORS.green;
}

export function scoreLabel(score: number): { label: string; desc: string } {
  if (score >= THRESH.crit)
    return { label: "КРИТИЧНО", desc: "Немедленная остановка. Менеджер уведомлён." };
  if (score >= THRESH.risk)
    return { label: "РИСК", desc: "Высокая утомляемость. Рекомендуется перерыв." };
  if (score >= THRESH.norm)
    return { label: "УСТАЛОСТЬ", desc: "Признаки усталости. Будьте внимательны." };
  return { label: "НОРМА", desc: "Состояние водителя в норме." };
}

export function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}
