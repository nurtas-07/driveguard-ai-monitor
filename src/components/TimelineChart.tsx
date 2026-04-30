import { Area, AreaChart, ReferenceLine, ResponsiveContainer, YAxis } from "recharts";
import { scoreColor } from "@/lib/fatigueScore";

interface TimelineChartProps {
  data: { t: number; v: number }[];
  currentScore: number;
}

export default function TimelineChart({ data, currentScore }: TimelineChartProps) {
  const color = scoreColor(currentScore);

  return (
    <div className="bg-bg border border-border rounded-sm p-2" style={{ height: 90 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="fatigue-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <YAxis domain={[0, 100]} hide />
          <ReferenceLine y={30} stroke="rgba(122,154,181,0.18)" strokeDasharray="3 3" />
          <ReferenceLine y={60} stroke="rgba(122,154,181,0.18)" strokeDasharray="3 3" />
          <ReferenceLine y={80} stroke="rgba(122,154,181,0.18)" strokeDasharray="3 3" />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill="url(#fatigue-grad)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
