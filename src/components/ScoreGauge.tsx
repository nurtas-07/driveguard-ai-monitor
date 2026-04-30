import { scoreColor } from "@/lib/fatigueScore";

interface ScoreGaugeProps {
  score: number;
}

export default function ScoreGauge({ score }: ScoreGaugeProps) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - score / 100);
  const color = scoreColor(score);

  return (
    <div className="relative w-20 h-20 flex-shrink-0">
      <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--color-bg3)" strokeWidth="6" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.4s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-mono font-bold text-[22px] leading-none text-text1">
          {Math.round(score)}
        </div>
        <div className="font-mono text-[9px] text-text3 mt-0.5">/100</div>
      </div>
    </div>
  );
}
