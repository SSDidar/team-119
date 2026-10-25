import type { Scenario, Snapshot, Trace } from './types';

const traceCache = new Map<Scenario, Promise<Trace>>();

export function loadTrace(scenario: Scenario): Promise<Trace> {
  if (!traceCache.has(scenario)) {
    traceCache.set(scenario, fetch(`/traces/${scenario}.json`).then((response) => {
      if (!response.ok) throw new Error(`Trace ${scenario}: ${response.status}`);
      return response.json() as Promise<Trace>;
    }));
  }
  return traceCache.get(scenario)!;
}

export async function fetchLiveSnapshot(): Promise<Snapshot> {
  const response = await fetch('/api/snapshot');
  if (!response.ok) throw new Error('OpenEgiz недоступен');
  return response.json();
}

export async function sendScenario(scenario: Scenario): Promise<void> {
  const response = await fetch('/api/scenario', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenario }),
  });
  if (!response.ok) throw new Error('Scenario command failed');
}

export async function resetLive(): Promise<void> {
  const response = await fetch('/api/reset', { method: 'POST' });
  if (!response.ok) throw new Error('Reset failed');
}

export function interpolateTrace(trace: Trace, cursor: number): Snapshot {
  const max = trace.frames.length - 1;
  const base = Math.min(max - 1, Math.floor(cursor));
  const next = Math.min(max, base + 1);
  const alpha = cursor - Math.floor(cursor);
  const a = trace.frames[Math.max(0, base)];
  const b = trace.frames[next];
  const things = Object.fromEntries(Object.entries(a.things).map(([id, twin]) => {
    const other = b.things[id];
    const features = { ...twin.features };
    const pa = twin.features.position;
    const pb = other?.features.position;
    if (pa && pb && twin.features.state?.value === other.features.state?.value) {
      features.position = {
        ...pa,
        x: Number(pa.x) + (Number(pb.x) - Number(pa.x)) * alpha,
        y: Number(pa.y) + (Number(pb.y) - Number(pa.y)) * alpha,
        z: Number(pa.z) + (Number(pb.z) - Number(pa.z)) * alpha,
        heading_deg: Number(pa.heading_deg) + (Number(pb.heading_deg) - Number(pa.heading_deg)) * alpha,
      };
    }
    return [id, { ...twin, features }];
  }));
  return { ...a, ...b, time_s: a.time_s + (b.time_s - a.time_s) * alpha, things, scenario: trace.scenario, source: 'trace' };
}
