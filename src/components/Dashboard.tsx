import type { AppMode, LogEvent, Metrics } from "@/lib/constants";
import { scoreColor, scoreLabel } from "@/lib/fatigueScore";
import EventLog from "./EventLog";
import MetricsPanel from "./MetricsPanel";
import ScoreGauge from "./ScoreGauge";
import TimelineChart from "./TimelineChart";

interface DashboardProps {
  mode: AppMode;
  running: boolean;
  score: number;
  metrics: Metrics;
  events: LogEvent[];
  history: { t: number; v: number }[];
  onStart: () => void;
  onStop: () => void;
}

export default function Dashboard({
  mode,
  running,
  score,
  metrics,
  events,
  history,
  onStart,
  onStop,
}: DashboardProps) {
  const sLabel = scoreLabel(score);
  const sColor = scoreColor(score);

  const pills = [
    { l: "0–30", t: "Норма", color: "var(--color-brand-green)", active: score < 30 },
    {
      l: "30–60",
      t: "Усталость",
      color: "var(--color-brand-amber)",
      active: score >= 30 && score < 60,
    },
    {
      l: "60–80",
      t: "Риск",
      color: "var(--color-brand-red)",
      active: score >= 60 && score < 80,
    },
    { l: "80+", t: "Критично", color: "var(--color-brand-red)", active: score >= 80 },
  ];

  return (
    <aside className="w-[340px] flex-shrink-0 border-l border-border bg-bg2 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto">
        {/* Fatigue score */}
        <section className="p-5 border-b border-border">
          <div className="font-mono text-[10px] tracking-[0.2em] text-text3 mb-3">
            FATIGUE SCORE
          </div>
          <div className="flex items-center gap-4">
            <ScoreGauge score={score} />
            <div className="min-w-0">
              <div
                className="font-display font-bold text-[15px] tracking-wider"
                style={{ color: sColor, transition: "color 0.4s" }}
              >
                {sLabel.label}
              </div>
              <div className="text-[11px] text-text2 mt-1 leading-snug">{sLabel.desc}</div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1 mt-4">
            {pills.map((p) => (
              <div
                key={p.l}
                className="text-center py-1.5 border rounded-sm"
                style={{
                  borderColor: p.active ? p.color : "var(--color-border)",
                  background: p.active
                    ? `color-mix(in oklab, ${p.color} 15%, transparent)`
                    : "var(--color-bg3)",
                  transition: "all 0.3s",
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
        <section className="p-5 border-b border-border">
          <div className="font-mono text-[10px] tracking-[0.2em] text-text3 mb-3">
            БИОМЕТРИКА
          </div>
          <MetricsPanel metrics={metrics} />
        </section>

        {/* Timeline */}
        <section className="p-5 border-b border-border">
          <div className="font-mono text-[10px] tracking-[0.2em] text-text3 mb-2">
            ИСТОРИЯ ПОЕЗДКИ
          </div>
          <TimelineChart data={history} currentScore={score} />
        </section>

        {/* Event log */}
        <section className="p-5">
          <div className="font-mono text-[10px] tracking-[0.2em] text-text3 mb-2">
            ЖУРНАЛ СОБЫТИЙ
          </div>
          <EventLog events={events} />
        </section>
      </div>

      {/* Controls (pinned) */}
      <div className="border-t border-border p-3 space-y-2 bg-bg2 flex-shrink-0">
        {!running ? (
          <button
            onClick={onStart}
            className="w-full font-display font-extrabold tracking-wider text-[13px] uppercase py-2.5 rounded-sm bg-brand-green text-[#08110d] hover:brightness-110 transition-all"
          >
            Начать поездку
          </button>
        ) : (
          <button
            onClick={onStop}
            className="w-full font-display font-extrabold tracking-wider text-[13px] uppercase py-2.5 rounded-sm border border-brand-red text-brand-red hover:bg-brand-red/10 transition-all"
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
  );
}
