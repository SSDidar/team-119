"""Agent-based open-pit simulation. No rendering or transport dependencies here."""
from __future__ import annotations

import math
import random
from collections import deque
from dataclasses import dataclass, field, replace

from .geometry import EXCAVATOR_XZ, point_at, road_factor, route_km

NAMESPACE = "org.openegiz.samson"
SCENARIOS = ("baseline", "rockfall", "rain", "excavator_failure", "extra_fleet")
STATE_LABELS = {
    "standby": "Резерв",
    "queued": "Очередь на погрузку",
    "loading": "Погрузка",
    "hauling": "Гружёный · подъём",
    "queued_crusher": "Очередь на разгрузку",
    "dumping": "Разгрузка",
    "returning": "Порожний · спуск",
    "refueling": "Заправка",
}


@dataclass
class TruckAgent:
    index: int
    state: str = "queued"
    route_s: float = 0.0
    speed_kmh: float = 0.0
    payload_t: float = 0.0
    grade_pct: float = 0.0
    fuel_pct: float = 88.0
    trips: int = 0
    assigned: int = 0
    timer: float = 0.0
    wait_s: float = 0.0
    cycle_s: float = 0.0
    last_cycle_s: float = 0.0
    distance_km: float = 0.0
    active: bool = True

    @property
    def name(self) -> str:
        return f"truck-{self.index:02d}"

    def features(self) -> dict:
        direction = -1 if self.state == "returning" else 1
        p = point_at(self.route_s, direction)
        if self.state in ("queued", "loading"):
            ex = EXCAVATOR_XZ[self.assigned]
            queue_back = 0.0 if self.state == "loading" else 7.0 + self.index * 1.2
            p = replace(p, x=ex[0] - queue_back, y=-60.0, z=ex[1] + 3.0)
        elif self.state in ("queued_crusher", "dumping"):
            p = replace(p, x=p.x + (4.0 if self.state == "queued_crusher" else 0.0), z=p.z + 5.0)
        return {
            "state": {"value": self.state, "label": STATE_LABELS[self.state]},
            "position": {"x": round(p.x, 3), "y": round(p.y, 3), "z": round(p.z, 3), "heading_deg": round(p.heading_deg, 2)},
            "speed": {"value": round(self.speed_kmh, 1), "unit": "km/h"},
            "payload": {"value": round(self.payload_t, 1), "unit": "t", "capacity_t": 60.0},
            "grade": {"value": round(self.grade_pct, 3), "unit": "% Cu"},
            "fuel": {"value": round(max(0.0, self.fuel_pct), 1), "unit": "%"},
            "route": {"value": round(self.route_s, 5), "progress_pct": round(self.route_s * 100, 1), "grade_pct": p.grade_pct},
            "trips_total": {"value": self.trips, "unit": "trips"},
            "wait": {"value": round(self.wait_s, 1), "unit": "s"},
            "cycle": {"value": round(self.last_cycle_s, 1), "unit": "s"},
            "dispatch": {"excavator": self.assigned + 1, "active": self.active},
            "identity": {"model": "КАМАЗ-65805 Самсон", "call_sign": f"СМ-{self.index:02d}"},
        }


@dataclass
class ExcavatorAgent:
    index: int
    loading: TruckAgent | None = None
    passes_total: int = 0
    face_grade_pct: float = 0.72

    @property
    def name(self) -> str:
        return f"excavator-{self.index:02d}"

    def features(self, failed: bool) -> dict:
        state = "failure" if failed else ("loading" if self.loading else "idle")
        p = EXCAVATOR_XZ[self.index]
        return {
            "state": {"value": state, "label": {"failure": "Аварийная остановка", "loading": "Погрузка", "idle": "Ожидание"}[state]},
            "position": {"x": p[0], "y": -60.0, "z": p[1], "heading_deg": 35 + self.index * 125},
            "face_grade": {"value": round(self.face_grade_pct, 3), "unit": "% Cu"},
            "passes_total": {"value": self.passes_total, "unit": "passes"},
            "bucket": {"capacity_t": 12.0, "cycle_s": 30.0},
            "availability": {"value": 0.0 if failed else 100.0, "unit": "%"},
        }


@dataclass
class CrusherAgent:
    dumping: TruckAgent | None = None
    tonnes_total: float = 0.0
    grade_tonnes: float = 0.0
    dumps: list[tuple[float, float]] = field(default_factory=list)

    def features(self, sim_time: float) -> dict:
        self.dumps = [(t, w) for t, w in self.dumps if sim_time - t <= 3600]
        window_t = sum(w for _, w in self.dumps)
        window_s = max(1.0, min(sim_time, 3600.0))
        avg_grade = self.grade_tonnes / self.tonnes_total if self.tonnes_total else 0.0
        return {
            "state": {"value": "crushing" if self.dumping else "idle", "label": "Приём руды" if self.dumping else "Ожидание"},
            "position": {"x": 126.0, "y": 0.0, "z": -22.0, "heading_deg": 0.0},
            "throughput": {"value": round(window_t * 3600 / window_s, 1), "unit": "t/h", "rated_tph": 3000.0},
            "feed_grade": {"value": round(avg_grade, 3), "unit": "% Cu"},
            "tonnes_total": {"value": round(self.tonnes_total, 1), "unit": "t"},
            "hopper": {"value": min(100.0, 100.0 if self.dumping else 18.0), "unit": "%"},
        }


class DispatcherAgent:
    """Shortest expected queue dispatch, with automatic reassignment on failure."""

    @staticmethod
    def choose(trucks: list[TruckAgent], excavators: list[ExcavatorAgent], failed_index: int | None) -> int:
        scores = []
        for ex in excavators:
            if ex.index == failed_index:
                continue
            queue = sum(t.state == "queued" and t.assigned == ex.index for t in trucks)
            loading = 1 if ex.loading else 0
            scores.append(((queue + loading) * 150.0, ex.index))
        return min(scores)[1] if scores else 0


class MineEngine:
    """One deterministic clock drives every agent and every published twin."""

    def __init__(self, seed: int = 65805):
        self.rng = random.Random(seed)
        self.route_km = route_km()
        self.sim_time = 0.0
        self.scenario = "baseline"
        self.trucks = [TruckAgent(i + 1, active=i < 6) for i in range(8)]
        self.excavators = [ExcavatorAgent(0), ExcavatorAgent(1)]
        self.crusher = CrusherAgent()
        self.events: deque[dict] = deque(maxlen=12)
        self.history: deque[dict] = deque(maxlen=180)
        self._history_clock = 0.0
        self._initialise_fleet()
        self._event("Смена запущена: диспетчер распределяет машины по двум забоям", "info")

    def _initialise_fleet(self) -> None:
        starts = ["loading", "hauling", "hauling", "returning", "queued_crusher", "returning", "standby", "standby"]
        positions = [0.0, 0.24, 0.67, 0.72, 1.0, 0.38, 0.0, 0.0]
        for i, truck in enumerate(self.trucks):
            truck.state = starts[i] if truck.active else "standby"
            truck.route_s = positions[i]
            truck.assigned = i % 2
            truck.fuel_pct = 72.0 + self.rng.random() * 25.0
            truck.speed_kmh = 0.0
            if truck.state == "hauling":
                truck.payload_t = 60.0
                truck.grade_pct = 0.68 + i * 0.015
            if truck.state == "loading":
                self.excavators[truck.assigned].loading = truck
            if truck.state == "queued_crusher":
                truck.payload_t = 60.0
                truck.grade_pct = 0.71

    @property
    def failed_excavator(self) -> int | None:
        return 1 if self.scenario == "excavator_failure" else None

    def set_scenario(self, scenario: str) -> None:
        if scenario not in SCENARIOS:
            raise ValueError(f"Unknown scenario: {scenario}")
        if scenario == self.scenario:
            return
        self.scenario = scenario
        if scenario == "extra_fleet":
            for truck in self.trucks[6:]:
                truck.active = True
                truck.state = "queued"
                truck.assigned = DispatcherAgent.choose(self.trucks, self.excavators, None)
            self._event("В смену введены два резервных самосвала", "success")
        else:
            for truck in self.trucks[6:]:
                truck.active = False
                truck.state = "standby"
        messages = {
            "baseline": ("Все ограничения сняты, восстановлен базовый режим", "success"),
            "rockfall": ("Обвал на 3-м уступе: одна полоса, реверсивное движение", "critical"),
            "rain": ("Дождь: сцепление и скорость снижены, расход топлива вырос", "warning"),
            "excavator_failure": ("Экскаватор ЭК-02 остановлен; очередь перераспределена", "critical"),
        }
        if scenario in messages:
            self._event(*messages[scenario])
        for truck in self.trucks:
            if truck.state == "queued":
                truck.assigned = DispatcherAgent.choose(self.trucks, self.excavators, self.failed_excavator)

    def _event(self, text: str, severity: str = "info") -> None:
        self.events.appendleft({"time_s": round(self.sim_time), "text": text, "severity": severity})

    def step(self, dt: float) -> None:
        self.sim_time += dt
        failed = self.failed_excavator
        for ex in self.excavators:
            ex.face_grade_pct = min(1.15, max(0.35, ex.face_grade_pct + self.rng.gauss(0, 0.0007 * math.sqrt(dt))))
            if ex.index == failed and ex.loading:
                ex.loading.state = "queued"
                ex.loading.assigned = DispatcherAgent.choose(self.trucks, self.excavators, failed)
                ex.loading = None
        for truck in self.trucks:
            self._step_truck(truck, dt)
        self._history_clock += dt
        if self._history_clock >= 20.0:
            self._history_clock = 0.0
            c = self.crusher.features(self.sim_time)
            self.history.append({
                "time_s": round(self.sim_time),
                "throughput": c["throughput"]["value"],
                "tonnes": c["tonnes_total"]["value"],
                "queue": sum(t.state in ("queued", "queued_crusher") for t in self.trucks),
                "grade": c["feed_grade"]["value"],
            })

    def _move(self, truck: TruckAgent, dt: float, direction: int) -> None:
        loaded = direction > 0
        base = 18.0 if loaded else 28.0
        p = point_at(truck.route_s, direction)
        curve_limit = math.sqrt(1.35 / max(p.curvature, 0.001)) * 3.6
        target = min(base, curve_limit) * road_factor(truck.route_s, self.scenario)
        # Longitudinal car following on each physical lane.
        nearest_gap = 1.0
        for other in self.trucks:
            if other is truck or other.state != truck.state:
                continue
            gap = (other.route_s - truck.route_s) * direction
            if 0 < gap < nearest_gap:
                nearest_gap = gap
        gap_m = nearest_gap * self.route_km * 1000.0
        if gap_m < 24.0:
            target = 0.0
        elif gap_m < 55.0:
            target *= max(0.15, (gap_m - 24.0) / 31.0)
        # Bounded acceleration/braking instead of teleporting between route points.
        target_ms = target / 3.6
        current_ms = truck.speed_kmh / 3.6
        accel = 0.55 if target_ms > current_ms else 1.4
        current_ms += max(-accel * dt, min(accel * dt, target_ms - current_ms))
        truck.speed_kmh = max(0.0, current_ms * 3.6)
        ds = current_ms * dt / (self.route_km * 1000.0)
        previous = truck.route_s
        truck.route_s = max(0.0, min(1.0, truck.route_s + direction * ds))
        km = abs(truck.route_s - previous) * self.route_km
        truck.distance_km += km
        rolling = 0.025 if self.scenario != "rain" else 0.055
        resistance = (0.071 if loaded else -0.071) + rolling
        truck.fuel_pct -= km * (0.75 if loaded else 0.43) * max(0.45, 1.0 + resistance * 4.0)

    def _step_truck(self, truck: TruckAgent, dt: float) -> None:
        if not truck.active:
            truck.state, truck.speed_kmh = "standby", 0.0
            return
        truck.cycle_s += dt
        if truck.state in ("queued", "queued_crusher"):
            truck.wait_s += dt
            truck.speed_kmh = 0.0
        if truck.state == "queued":
            if truck.assigned == self.failed_excavator:
                truck.assigned = DispatcherAgent.choose(self.trucks, self.excavators, self.failed_excavator)
            ex = self.excavators[truck.assigned]
            if ex.loading is None and ex.index != self.failed_excavator:
                ex.loading = truck
                truck.state = "loading"
                truck.timer = 0.0
        elif truck.state == "loading":
            truck.speed_kmh = 0.0
            ex = self.excavators[truck.assigned]
            truck.timer += dt
            if truck.timer >= 30.0 and truck.payload_t < 59.9:
                truck.timer -= 30.0
                bucket = min(12.0 * self.rng.uniform(0.96, 1.04), 60.0 - truck.payload_t)
                truck.grade_pct = (truck.grade_pct * truck.payload_t + ex.face_grade_pct * bucket) / (truck.payload_t + bucket)
                truck.payload_t += bucket
                ex.passes_total += 1
            if truck.payload_t >= 59.9:
                ex.loading = None
                truck.state = "hauling"
                truck.wait_s = 0.0
        elif truck.state == "hauling":
            self._move(truck, dt, 1)
            if truck.route_s >= 0.99999:
                truck.state = "queued_crusher"
                truck.speed_kmh = 0.0
        elif truck.state == "queued_crusher":
            if self.crusher.dumping is None:
                self.crusher.dumping = truck
                truck.state = "dumping"
                truck.timer = 0.0
        elif truck.state == "dumping":
            truck.speed_kmh = 0.0
            truck.timer += dt
            if truck.timer >= 55.0:
                self.crusher.tonnes_total += truck.payload_t
                self.crusher.grade_tonnes += truck.payload_t * truck.grade_pct
                self.crusher.dumps.append((self.sim_time, truck.payload_t))
                truck.payload_t = 0.0
                truck.grade_pct = 0.0
                truck.trips += 1
                truck.last_cycle_s = truck.cycle_s
                truck.cycle_s = 0.0
                truck.wait_s = 0.0
                self.crusher.dumping = None
                truck.state = "refueling" if truck.fuel_pct < 18.0 else "returning"
                truck.timer = 0.0
                if truck.trips % 3 == 0:
                    self._event(f"СМ-{truck.index:02d}: завершены {truck.trips} рейса, средний цикл {truck.last_cycle_s / 60:.1f} мин", "success")
        elif truck.state == "refueling":
            truck.timer += dt
            if truck.timer >= 300.0:
                truck.fuel_pct = 100.0
                truck.state = "returning"
        elif truck.state == "returning":
            self._move(truck, dt, -1)
            if truck.route_s <= 0.00001:
                truck.state = "queued"
                truck.assigned = DispatcherAgent.choose(self.trucks, self.excavators, self.failed_excavator)
                truck.speed_kmh = 0.0

    def snapshot(self) -> dict:
        active = [t for t in self.trucks if t.active]
        crusher = self.crusher.features(self.sim_time)
        cycles = [t.last_cycle_s for t in active if t.last_cycle_s > 0]
        mine = {
            "shift": {"time_s": round(self.sim_time), "clock": f"{int(self.sim_time // 3600) + 6:02d}:{int((self.sim_time % 3600) // 60):02d}", "scenario": self.scenario},
            "production": {"tonnes": crusher["tonnes_total"]["value"], "throughput_tph": crusher["throughput"]["value"], "target_tph": 2400.0, "grade_pct": crusher["feed_grade"]["value"]},
            "fleet": {"active": len(active), "hauling": sum(t.state in ("hauling", "returning") for t in active), "queued": sum(t.state in ("queued", "queued_crusher") for t in active), "availability_pct": round(100.0 * len(active) / 8.0, 1)},
            "cycle": {"average_s": round(sum(cycles) / len(cycles), 1) if cycles else 0.0, "route_km": round(self.route_km, 3)},
            "road": {"condition": {"baseline": "Сухо · 2 полосы", "rockfall": "Обвал · 1 полоса", "rain": "Дождь · скользко", "excavator_failure": "Сухо · 2 полосы", "extra_fleet": "Сухо · 2 полосы"}[self.scenario], "gradient_pct": 7.1, "rolling_resistance_pct": 5.5 if self.scenario == "rain" else 2.5},
        }
        things = {
            f"{NAMESPACE}:mine-01": {"kind": "mine", "name": "Медный карьер «Самсон»", "features": mine},
            f"{NAMESPACE}:road-01": {"kind": "road", "name": "Спиральный съезд С-01", "features": mine["road"]},
            f"{NAMESPACE}:crusher-01": {"kind": "crusher", "name": "Дробилка ДЩ-01", "features": crusher},
        }
        for ex in self.excavators:
            things[f"{NAMESPACE}:{ex.name}"] = {"kind": "excavator", "name": f"Экскаватор ЭК-{ex.index + 1:02d}", "features": ex.features(ex.index == self.failed_excavator)}
        for truck in self.trucks:
            things[f"{NAMESPACE}:{truck.name}"] = {"kind": "truck", "name": f"КАМАЗ СМ-{truck.index:02d}", "features": truck.features()}
        return {"time_s": round(self.sim_time, 1), "scenario": self.scenario, "things": things, "events": list(self.events), "history": list(self.history)}


def ditto_messages(snapshot: dict) -> dict[str, dict]:
    messages = {}
    for thing_id, twin in snapshot["things"].items():
        name = thing_id.split(":", 1)[1]
        messages[name] = {
            "topic": f"{NAMESPACE}/{name}/things/twin/commands/modify",
            "path": "/features",
            "value": {key: {"properties": value} for key, value in twin["features"].items()},
        }
    return messages
