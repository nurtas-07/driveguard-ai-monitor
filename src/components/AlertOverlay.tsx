import type { AlertLevel } from "@/lib/constants";

interface AlertOverlayProps {
  level: AlertLevel;
  bannerMsg: string | null;
}

export default function AlertOverlay({ level, bannerMsg }: AlertOverlayProps) {
  if (level === "none" && !bannerMsg) return null;

  const isCrit = level === "critical";
  const color = isCrit ? "rgb(255,61,87)" : "rgb(245,166,35)";
  const subtitle = isCrit
    ? "Немедленная остановка · менеджер уведомлён"
    : "Рекомендуется остановка";

  return (
    <>
      {level !== "none" && (
        <div
          className={`absolute inset-0 pointer-events-none transition-all duration-300 ${
            isCrit ? "critical-flash" : "warning-glow"
          }`}
          style={{
            border: `2px solid ${isCrit ? "rgba(255,61,87,0.55)" : "rgba(245,166,35,0.4)"}`,
            background: isCrit ? "rgba(255,61,87,0.05)" : "rgba(245,166,35,0.07)",
          }}
        />
      )}
      {bannerMsg && (
        <div
          className="banner-in absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none"
          style={{
            background: "rgba(8,12,16,0.65)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            border: `1px solid ${color}`,
            borderRadius: 8,
            padding: "14px 28px",
            color,
          }}
        >
          <div className="font-display font-bold text-base tracking-wider uppercase">
            {bannerMsg}
          </div>
          <div className="font-mono text-[10px] mt-1 tracking-wider opacity-80">{subtitle}</div>
        </div>
      )}
    </>
  );
}
