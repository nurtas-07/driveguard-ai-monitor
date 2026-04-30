import type { Metrics } from "@/lib/constants";

interface Row {
  label: string;
  value: string;
  pct: number;
  color: string;
  invert?: boolean;
}

interface MetricsPanelProps {
  metrics: Metrics;
}

export default function MetricsPanel({ metrics }: MetricsPanelProps) {
  const eyeText =
    metrics.eyeOpen < 0.2 ? "Закрыты" : metrics.eyeOpen < 0.3 ? "Прикрыты" : "Открыты";
  const headText = metrics.headYaw > 0.2 ? "Отклонение" : "Прямо";

  const rows: Row[] = [
    {
      label: "Состояние глаз",
      value: eyeText,
      pct: Math.min(100, (metrics.eyeOpen / 0.45) * 100),
      color:
        metrics.eyeOpen < 0.2
          ? "var(--color-brand-red)"
          : metrics.eyeOpen < 0.3
            ? "var(--color-brand-amber)"
            : "var(--color-brand-green)",
    },
    {
      label: "Положение головы",
      value: headText,
      pct: Math.min(100, metrics.headYaw * 200),
      color:
        metrics.headYaw > 0.3
          ? "var(--color-brand-red)"
          : metrics.headYaw > 0.2
            ? "var(--color-brand-amber)"
            : "var(--color-brand-green)",
      invert: true,
    },
    {
      label: "Частота морганий",
      value: `${Math.round(metrics.blinkRate)}/мин`,
      pct: Math.min(100, (metrics.blinkRate / 30) * 100),
      color:
        metrics.blinkRate < 6 || metrics.blinkRate > 25
          ? "var(--color-brand-amber)"
          : "var(--color-brand-green)",
    },
    {
      label: "Лицо в кадре",
      value: `${Math.round(metrics.faceInFrame * 100)}%`,
      pct: metrics.faceInFrame * 100,
      color:
        metrics.faceInFrame < 0.3
          ? "var(--color-brand-red)"
          : "var(--color-brand-green)",
    },
  ];

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-[11px] text-text2">{row.label}</span>
            <span
              className="font-mono text-xs"
              style={{ color: row.color, transition: "color 0.5s" }}
            >
              {row.value}
            </span>
          </div>
          <div className="h-[3px] bg-bg3 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${row.invert ? 100 - row.pct : row.pct}%`,
                background: row.color,
                transition: "width 0.5s ease, background 0.5s ease",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
