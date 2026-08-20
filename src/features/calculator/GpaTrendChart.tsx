// src/features/calculator/GpaTrendChart.tsx
//
// Semester GPA trend for the shell dashboard (#315), bridge-driven from the
// pure trend model. Rendered as SVG from trendChartGeometry — the typed,
// testable, accessible replacement for the legacy canvas (drawTrendChart);
// same visibility rule (2+ plottable semesters), same shortened labels, same
// direction wording/colors as recalc()'s trend block. Markup mirrors the
// legacy .trend-chart-box structure so the visual system applies at cutover.

import { useCalculatorBridge } from './calculatorBridge.ts';
import { computeGpaTrend, trendChartGeometry, type TrendDirection } from './gpaTrend.ts';

const VIEW_W = 660;
const VIEW_H = 200;

const DIRECTION_COPY: Record<TrendDirection, { label: string; color: string }> = {
  improving: { label: '↑ Improving', color: '#2ECC71' },
  declining: { label: '↓ Declining', color: '#e74c3c' },
  stable: { label: '→ Stable', color: 'var(--text3)' },
};

export default function GpaTrendChart() {
  const bridge = useCalculatorBridge();
  const inputs = bridge.useInputs();
  const trend = computeGpaTrend(inputs.semesters, bridge.university.grades);
  if (!trend.visible || trend.direction === null) return null;

  const geometry = trendChartGeometry(trend.points, VIEW_W, VIEW_H);
  if (!geometry) return null;
  const direction = DIRECTION_COPY[trend.direction];

  return (
    <div className="trend-chart-box lg-panel" data-testid="gpa-trend">
      <div className="lg-shine"></div>
      <div className="meter-header">
        <span>Semester GPA Trend</span>
        <span style={{ color: direction.color, fontWeight: 600 }}>{direction.label}</span>
      </div>
      <div className="trend-canvas-wrap">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label={`Semester GPA trend: ${trend.points
            .map((p) => `${p.label} ${p.gpa.toFixed(2)}`)
            .join(', ')}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
        >
          <defs>
            <linearGradient id="trend-area-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(46,204,113,0.22)" />
              <stop offset="100%" stopColor="rgba(46,204,113,0)" />
            </linearGradient>
          </defs>

          {geometry.gridlines.map((line) => (
            <g key={line.label}>
              <line
                x1={36}
                x2={VIEW_W - 16}
                y1={line.y}
                y2={line.y}
                stroke="currentColor"
                strokeOpacity={0.12}
                strokeDasharray="3 4"
              />
              <text
                x={31}
                y={line.y + 3.5}
                textAnchor="end"
                fontSize={10}
                fill="currentColor"
                fillOpacity={0.45}
              >
                {line.label}
              </text>
            </g>
          ))}

          <path d={geometry.areaPath} fill="url(#trend-area-fill)" />
          <polyline
            points={geometry.linePoints}
            fill="none"
            stroke="#2ECC71"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {geometry.dots.map((dot) => (
            <g key={`${dot.label}-${dot.x}`}>
              <circle
                cx={dot.x}
                cy={dot.y}
                r={4}
                fill="var(--bg, #fff)"
                stroke="#2ECC71"
                strokeWidth={2}
              />
              <text
                x={dot.x}
                y={dot.y - 9}
                textAnchor="middle"
                fontSize={10}
                fontWeight={700}
                fill="#2ECC71"
              >
                {dot.gpaText}
              </text>
              <text
                x={dot.x}
                y={geometry.baselineY + 16}
                textAnchor={geometry.rotateLabels ? 'end' : 'middle'}
                fontSize={geometry.rotateLabels ? 9 : 10}
                fill="currentColor"
                fillOpacity={0.45}
                transform={
                  geometry.rotateLabels
                    ? `rotate(-45 ${dot.x} ${geometry.baselineY + 16})`
                    : undefined
                }
              >
                {dot.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
