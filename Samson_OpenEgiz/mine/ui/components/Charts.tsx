import type { Snapshot } from '../types';

export function ThroughputChart({ snapshot }: { snapshot: Snapshot }) {
  const data = snapshot.history.slice(-55);
  const width = 560;
  const height = 118;
  const pad = 8;
  if (data.length < 2) {
    return <div className="chart-empty">Накопление телеметрии: первый расчётный интервал — 20 секунд смены.</div>;
  }
  const max = Math.max(2400, ...data.map((d) => d.throughput)) * 1.08;
  const minT = data[0].time_s;
  const rangeT = Math.max(1, data[data.length - 1].time_s - minT);
  const points = data.map((d, i) => ({
    x: pad + i / (data.length - 1) * (width - pad * 2),
    y: height - pad - d.throughput / max * (height - pad * 2),
    ...d,
  }));
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${path} L${points[points.length - 1].x},${height - pad} L${points[0].x},${height - pad} Z`;
  const targetY = height - pad - 2400 / max * (height - pad * 2);
  return (
    <svg className="throughput-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Динамика производительности дробилки, тонн в час">
      <defs><linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#57d7d0" stopOpacity=".28"/><stop offset="1" stopColor="#57d7d0" stopOpacity="0"/></linearGradient></defs>
      {[0.25, 0.5, 0.75].map((t) => <line key={t} x1={pad} x2={width - pad} y1={height * t} y2={height * t} className="chart-grid" />)}
      <line x1={pad} x2={width - pad} y1={targetY} y2={targetY} className="chart-target" />
      <path d={area} fill="url(#area-fill)" />
      <path d={path} className="chart-line" />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="4" className="chart-last" />
      <text x={width - 8} y={Math.max(12, targetY - 5)} textAnchor="end" className="chart-label">ПЛАН 2400 т/ч</text>
      <text x={pad} y={height - 1} className="chart-axis">−{Math.round(rangeT / 60)} мин</text>
      <text x={width - pad} y={height - 1} textAnchor="end" className="chart-axis">сейчас</text>
    </svg>
  );
}

export function CycleBars({ snapshot }: { snapshot: Snapshot }) {
  const trucks = Object.values(snapshot.things).filter((t) => t.kind === 'truck' && t.features.state?.value !== 'standby');
  return (
    <div className="cycle-bars" aria-label="Текущий цикл каждого самосвала">
      {trucks.map((truck) => {
        const value = Math.min(100, Number(truck.features.speed?.value || 0) / 30 * 100);
        return <div className="cycle-row" key={truck.name}>
          <span>{truck.name.replace('КАМАЗ ', '')}</span>
          <div className="cycle-track"><span style={{ width: `${value}%` }} /></div>
          <b>{Math.round(Number(truck.features.speed?.value || 0))}</b>
        </div>;
      })}
    </div>
  );
}
