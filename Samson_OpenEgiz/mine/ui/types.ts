export type Feature = Record<string, unknown> & { value?: unknown; label?: string; unit?: string };
export type Twin = { kind: 'mine' | 'truck' | 'excavator' | 'crusher' | 'road'; name: string; features: Record<string, Feature> };
export type Snapshot = {
  time_s: number;
  scenario: Scenario;
  source?: 'openegiz' | 'trace';
  things: Record<string, Twin>;
  events: Array<{ time_s: number; text: string; severity: 'info' | 'success' | 'warning' | 'critical' }>;
  history: Array<{ time_s: number; throughput: number; tonnes: number; queue: number; grade: number }>;
};
export type Scenario = 'baseline' | 'rockfall' | 'rain' | 'excavator_failure' | 'extra_fleet';
export type RoadPoint = { x: number; y: number; z: number; heading_deg: number; curvature: number; grade_pct: number };
export type Trace = {
  scenario: Scenario;
  frame_step_s: number;
  route: RoadPoint[];
  frames: Snapshot[];
};
export type ConnectionMode = 'connecting' | 'openegiz' | 'trace' | 'reconnecting';
