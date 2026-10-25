"""Continuous spiral haul-road geometry, shared by physics and trace export.

Coordinates are metres. X/Z form the horizontal plane in the viewer; Y is elevation.
The pit bottom is -60 m and the rim is 0 m. Five benches are connected by a
constant-gradient helix, followed by a short surface route to the crusher.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

BENCH_COUNT = 5
BENCH_HEIGHT_M = 12.0
BOTTOM_RADIUS_M = 31.0
RIM_RADIUS_M = 91.0
ROAD_TURNS = 1.65
GRADE_PCT = 7.1
LANE_OFFSET_M = 3.2
CRUSHER_XZ = (126.0, -22.0)
EXCAVATOR_XZ = ((24.0, -18.0), (-22.0, 20.0))


@dataclass(frozen=True)
class RoadPoint:
    x: float
    y: float
    z: float
    heading_deg: float
    curvature: float
    grade_pct: float


def _centerline(s: float) -> tuple[float, float, float]:
    """Route centreline before lane offset; s=0 is the bottom, s=1 crusher."""
    s = max(0.0, min(1.0, s))
    if s <= 0.88:
        u = s / 0.88
        theta = -0.55 * math.pi + u * ROAD_TURNS * 2.0 * math.pi
        radius = BOTTOM_RADIUS_M + (RIM_RADIUS_M - BOTTOM_RADIUS_M) * u
        return radius * math.cos(theta), -60.0 + 60.0 * u, radius * math.sin(theta)
    u = (s - 0.88) / 0.12
    theta = -0.55 * math.pi + ROAD_TURNS * 2.0 * math.pi
    start = (RIM_RADIUS_M * math.cos(theta), RIM_RADIUS_M * math.sin(theta))
    # Smooth surface connection from the helix to the crusher.
    ease = u * u * (3.0 - 2.0 * u)
    return start[0] + (CRUSHER_XZ[0] - start[0]) * ease, 0.0, start[1] + (CRUSHER_XZ[1] - start[1]) * ease


def point_at(s: float, direction: int = 1) -> RoadPoint:
    """Return a right-hand traffic lane position and a tangent-aligned heading."""
    eps = 0.0005
    a = _centerline(max(0.0, s - eps))
    b = _centerline(min(1.0, s + eps))
    x, y, z = _centerline(s)
    dx, dz = b[0] - a[0], b[2] - a[2]
    length = math.hypot(dx, dz) or 1.0
    tx, tz = dx / length, dz / length
    # Normal to the right of the upward tangent; empty trucks use the other lane.
    nx, nz = tz, -tx
    offset = LANE_OFFSET_M * (1 if direction >= 0 else -1)
    x += nx * offset
    z += nz * offset
    if direction < 0:
        tx, tz = -tx, -tz
    heading = math.degrees(math.atan2(tx, tz))
    curvature = 1.0 / max(BOTTOM_RADIUS_M, math.hypot(x, z)) if s < 0.88 else 0.012
    return RoadPoint(x, y, z, heading, curvature, GRADE_PCT if s < 0.88 else 0.0)


def horizontal_length_m() -> float:
    # Mean helix radius times swept angle plus the surface connection.
    mean_radius = (BOTTOM_RADIUS_M + RIM_RADIUS_M) / 2.0
    helix = mean_radius * ROAD_TURNS * 2.0 * math.pi
    theta = -0.55 * math.pi + ROAD_TURNS * 2.0 * math.pi
    start = (RIM_RADIUS_M * math.cos(theta), RIM_RADIUS_M * math.sin(theta))
    surface = math.dist(start, CRUSHER_XZ)
    return helix + surface


def route_km() -> float:
    horizontal = horizontal_length_m()
    vertical = 60.0
    return math.hypot(horizontal, vertical) / 1000.0


def road_factor(s: float, scenario: str) -> float:
    """Local traffic factor: a rockfall leaves one controlled alternating lane."""
    if scenario == "rockfall" and 0.43 <= s <= 0.61:
        return 0.38
    if scenario == "rain":
        return 0.72
    return 1.0


def scene_route(samples: int = 360) -> list[RoadPoint]:
    return [point_at(i / (samples - 1)) for i in range(samples)]
