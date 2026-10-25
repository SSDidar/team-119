import math
import unittest

from mine.simulator.engine import MineEngine
from mine.simulator.geometry import GRADE_PCT, LANE_OFFSET_M, horizontal_length_m, point_at, route_km


class SpiralGeometryTest(unittest.TestCase):
    def test_continuous_climb_and_real_grade(self):
        points = [point_at(i / 1000) for i in range(1001)]
        self.assertTrue(all(-60.01 <= p.y <= 0.01 for p in points))
        self.assertTrue(all(points[i].y <= points[i + 1].y for i in range(880)))
        self.assertAlmostEqual(60 / horizontal_length_m() * 100, GRADE_PCT, delta=0.05)
        self.assertGreater(route_km(), 0.7)
        self.assertLess(route_km(), 1.2)

    def test_two_distinct_lanes_and_reverse_heading(self):
        up = point_at(0.4, 1)
        down = point_at(0.4, -1)
        self.assertAlmostEqual(math.hypot(up.x - down.x, up.z - down.z), 2 * LANE_OFFSET_M, delta=0.01)
        self.assertAlmostEqual(abs(up.heading_deg - down.heading_deg), 180.0, delta=0.01)


class AgentModelTest(unittest.TestCase):
    def test_deterministic_and_bounded(self):
        a, b = MineEngine(), MineEngine()
        for _ in range(240):
            a.step(1.0)
            b.step(1.0)
        self.assertEqual(a.snapshot(), b.snapshot())
        for twin in a.snapshot()["things"].values():
            if twin["kind"] == "truck":
                f = twin["features"]
                self.assertGreaterEqual(f["speed"]["value"], 0)
                self.assertLessEqual(f["speed"]["value"], 30)
                self.assertLessEqual(f["payload"]["value"], 60)
                self.assertTrue(all(math.isfinite(float(f["position"][k])) for k in ("x", "y", "z")))

    def test_scenarios_propagate_to_agents(self):
        rain = MineEngine()
        rain.set_scenario("rain")
        baseline = MineEngine()
        for _ in range(20):
            rain.step(1)
            baseline.step(1)
        rain_speed = rain.trucks[1].speed_kmh
        base_speed = baseline.trucks[1].speed_kmh
        self.assertLess(rain_speed, base_speed)

        extra = MineEngine()
        extra.set_scenario("extra_fleet")
        self.assertEqual(sum(t.active for t in extra.trucks), 8)

        failure = MineEngine()
        failure.set_scenario("excavator_failure")
        failure.step(1)
        self.assertIsNone(failure.excavators[1].loading)
        self.assertTrue(all(t.assigned != 1 for t in failure.trucks if t.state == "queued"))

    def test_production_and_dump_cycle(self):
        engine = MineEngine()
        for _ in range(600):
            engine.step(1)
        self.assertGreater(engine.crusher.tonnes_total, 0)
        self.assertGreater(sum(t.trips for t in engine.trucks), 0)


if __name__ == "__main__":
    unittest.main()
