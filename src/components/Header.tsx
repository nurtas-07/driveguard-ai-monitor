import type { AppMode } from "@/lib/constants";

interface HeaderProps {
  mode: AppMode;
  running: boolean;
}

export default function Header({ mode, running }: HeaderProps) {
  const status =
    mode === "loading"
      ? "INITIALIZING"
      : mode === "ready"
        ? running
          ? "AI ACTIVE"
          : "AI READY"
        : running
          ? "DEMO ACTIVE"
          : "DEMO MODE";

  return (
    <header className="h-14 border-b border-border bg-bg2/80 flex items-center justify-between px-5 flex-shrink-0">
      <div className="flex items-center gap-4">
        <div className="font-display text-xl font-extrabold tracking-wide leading-none">
          <span className="text-text1">Drive</span>
          <span className="text-brand-green">Guard</span>
          <span className="text-text1 ml-1">AI</span>
        </div>
        <span
          className="font-mono text-[10px] tracking-widest px-2 py-1 rounded"
          style={{
            background: "rgba(0,229,160,0.08)",
            border: "1px solid rgba(0,229,160,0.2)",
            color: "var(--color-brand-green)",
          }}
        >
          MVP DEMO v0.1
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${
            running ? "bg-brand-green pulse-dot" : mode === "loading" ? "bg-brand-amber" : "bg-text3"
          }`}
        />
        <span className="font-mono text-[11px] tracking-wider text-text2">{status}</span>
      </div>
    </header>
  );
}
