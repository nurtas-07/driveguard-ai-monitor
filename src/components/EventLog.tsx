import type { LogEvent } from "@/lib/constants";

interface EventLogProps {
  events: LogEvent[];
}

const colorFor = (s: LogEvent["severity"]) =>
  s === "critical"
    ? "var(--color-brand-red)"
    : s === "warning"
      ? "var(--color-brand-amber)"
      : "var(--color-brand-green)";

export default function EventLog({ events }: EventLogProps) {
  if (events.length === 0) {
    return <div className="text-xs text-text3 font-mono italic">Нет событий</div>;
  }
  return (
    <div className="space-y-1">
      {events.map((ev) => (
        <div
          key={ev.id}
          className="flex gap-2 items-baseline px-[10px] py-[8px] rounded-md bg-bg3"
          style={{ borderLeft: `2px solid ${colorFor(ev.severity)}` }}
        >
          <span className="font-mono text-[9px] text-text3 flex-shrink-0">{ev.ts}</span>
          <span className="text-[11px] text-text2 leading-tight">{ev.text}</span>
        </div>
      ))}
    </div>
  );
}
