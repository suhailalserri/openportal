"use client";
import { useMemo, useState } from "react";

interface Point { date: string; revenueYer: number; revenueUsd: number; costUsd: number }

/**
 * Lightweight inline-SVG revenue-vs-cost chart. Deliberately dependency-free
 * (no recharts/chart.js in this repo yet) — a handful of <rect>/<path>
 * elements is enough for a 14/30-day admin trend and avoids adding a chart
 * library just for one panel.
 */
export function RevenueChart({ data }: { data: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const { bars, maxUsd, width, height, padding } = useMemo(() => {
    const width = 720, height = 220, padding = 28;
    const maxUsd = Math.max(1, ...data.map(d => Math.max(d.revenueUsd, d.costUsd)));
    const barWidth = (width - padding * 2) / Math.max(data.length, 1);
    const bars = data.map((d, i) => {
      const x = padding + i * barWidth;
      const revH = ((height - padding * 2) * d.revenueUsd) / maxUsd;
      const costH = ((height - padding * 2) * d.costUsd) / maxUsd;
      return { ...d, x, barWidth, revH, costH };
    });
    return { bars, maxUsd, width, height, padding };
  }, [data]);

  if (data.length === 0 || data.every(d => d.revenueUsd === 0 && d.costUsd === 0)) {
    return (
      <div className="flex items-center justify-center h-[220px] text-sm text-slate-500">
        لا توجد بيانات كافية بعد لعرض الرسم البياني
      </div>
    );
  }

  const active = hover !== null ? bars[hover] : null;

  return (
    <div dir="ltr">
      <div className="flex items-center gap-4 mb-2 text-xs">
        <span className="flex items-center gap-1.5 text-emerald-400">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> الإيرادات (USD)
        </span>
        <span className="flex items-center gap-1.5 text-red-400">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" /> التكلفة (USD)
        </span>
        {active && (
          <span className="ms-auto text-slate-300 font-mono">
            {active.date} — الإيرادات ${active.revenueUsd.toFixed(2)} ({active.revenueYer.toLocaleString()} ريال) · التكلفة ${active.costUsd.toFixed(2)}
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[220px]" onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={padding} x2={width - padding}
            y1={height - padding - (height - padding * 2) * f}
            y2={height - padding - (height - padding * 2) * f}
            stroke="#4A423B" strokeWidth={1} strokeDasharray="4 4" />
        ))}
        {bars.map((b, i) => (
          <g key={b.date} onMouseEnter={() => setHover(i)}>
            <rect x={b.x + 2} y={height - padding - b.revH} width={Math.max(2, b.barWidth / 2 - 3)}
              height={b.revH} fill="#6B9A56" opacity={hover === null || hover === i ? 1 : 0.35} rx={1} />
            <rect x={b.x + b.barWidth / 2 + 1} y={height - padding - b.costH} width={Math.max(2, b.barWidth / 2 - 3)}
              height={b.costH} fill="#C24B3A" opacity={hover === null || hover === i ? 1 : 0.35} rx={1} />
            <rect x={b.x} y={padding} width={b.barWidth} height={height - padding * 2}
              fill="transparent" />
          </g>
        ))}
        <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} stroke="#6E6357" />
      </svg>
      <div className="flex justify-between text-[10px] text-slate-500 mt-1">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}
