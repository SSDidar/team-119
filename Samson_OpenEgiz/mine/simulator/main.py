#!/usr/bin/env python3
"""MQTT publisher, scenario control endpoint and reproducible trace exporter."""
from __future__ import annotations

import argparse
import json
import logging
import os
import signal
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .engine import MineEngine, SCENARIOS, ditto_messages
from .geometry import scene_route

log = logging.getLogger("samson-mine")


def export_traces(output: Path, seconds: float, frame_step: float) -> None:
    output.mkdir(parents=True, exist_ok=True)
    route = [p.__dict__ for p in scene_route()]
    metadata = {
        "model": "КАМАЗ-65805 «Самсон» · 60 т",
        "seed": 65805,
        "route": route,
        "generated_by": "mine/simulator/engine.py",
        "note": "Синтетический детерминированный прогон того же агентного движка, который публикует MQTT.",
    }
    for scenario in SCENARIOS:
        engine = MineEngine()
        engine.set_scenario(scenario)
        frames = []
        elapsed = 0.0
        while elapsed <= seconds:
            if int(elapsed * 10) % int(frame_step * 10) == 0:
                frames.append(engine.snapshot())
            engine.step(1.0)
            elapsed += 1.0
        payload = {**metadata, "scenario": scenario, "frame_step_s": frame_step, "frames": frames}
        (output / f"{scenario}.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        log.info("exported %s: %s frames", scenario, len(frames))


def serve_control(engine: MineEngine, lock: threading.Lock, port: int) -> ThreadingHTTPServer:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/health":
                self._reply(200, {"status": "ok", "scenario": engine.scenario})
            elif self.path == "/snapshot":
                with lock:
                    data = engine.snapshot()
                self._reply(200, data)
            else:
                self._reply(404, {"error": "not found"})

        def do_POST(self):
            if self.path == "/scenario":
                try:
                    size = int(self.headers.get("Content-Length", "0"))
                    body = json.loads(self.rfile.read(size) or b"{}")
                    with lock:
                        engine.set_scenario(body["scenario"])
                        data = {"ok": True, "scenario": engine.scenario}
                    self._reply(200, data)
                except (KeyError, ValueError, json.JSONDecodeError) as exc:
                    self._reply(400, {"error": str(exc), "allowed": SCENARIOS})
            elif self.path == "/reset":
                with lock:
                    fresh = MineEngine()
                    engine.__dict__.update(fresh.__dict__)
                self._reply(200, {"ok": True, "scenario": "baseline"})
            else:
                self._reply(404, {"error": "not found"})

        def _reply(self, status: int, data: dict):
            raw = json.dumps(data, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def log_message(self, fmt, *args):
            log.debug("control: " + fmt, *args)

    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export-traces", type=Path)
    parser.add_argument("--trace-seconds", type=float, default=480.0)
    parser.add_argument("--trace-frame-step", type=float, default=8.0)
    parser.add_argument("--mqtt-host", default=os.environ.get("MQTT_HOST", "localhost"))
    parser.add_argument("--mqtt-port", type=int, default=int(os.environ.get("MQTT_PORT", "1883")))
    parser.add_argument("--interval", type=float, default=float(os.environ.get("SIM_INTERVAL", "1")))
    parser.add_argument("--speedup", type=float, default=float(os.environ.get("SIM_SPEEDUP", "10")))
    parser.add_argument("--control-port", type=int, default=int(os.environ.get("CONTROL_PORT", "8091")))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if args.export_traces:
        export_traces(args.export_traces, args.trace_seconds, args.trace_frame_step)
        return 0

    engine = MineEngine()
    lock = threading.Lock()
    serve_control(engine, lock, args.control_port)
    client = None
    if not args.dry_run:
        import paho.mqtt.client as mqtt
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"samson-mine-{os.getpid()}")
        for attempt in range(45):
            try:
                client.connect(args.mqtt_host, args.mqtt_port, keepalive=30)
                break
            except OSError as exc:
                log.warning("MQTT unavailable (%s), retrying", exc)
                time.sleep(2)
        else:
            return 1
        client.loop_start()
    stop = False
    signal.signal(signal.SIGINT, lambda *_: globals().update())
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(SystemExit(0)))
    log.info("Samson simulation started; scenarios on port %s", args.control_port)
    while not stop:
        with lock:
            engine.step(args.interval * args.speedup)
            snapshot = engine.snapshot()
        for name, message in ditto_messages(snapshot).items():
            if client:
                client.publish(f"telemetry/{name}", json.dumps(message, ensure_ascii=False), qos=0)
        time.sleep(args.interval)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
