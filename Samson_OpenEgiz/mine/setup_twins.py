#!/usr/bin/env python3
"""Create the complete Samson twin model in Eclipse Ditto, idempotently."""
from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

from simulator.engine import MineEngine, NAMESPACE

DITTO_URL = os.environ.get("DITTO_URL", "http://localhost:8080").rstrip("/")
DITTO_USER = os.environ.get("DITTO_USER", "ditto")
DITTO_PASSWORD = os.environ["DITTO_PASSWORD"]
AUTH = "Basic " + base64.b64encode(f"{DITTO_USER}:{DITTO_PASSWORD}".encode()).decode()


def twin_documents() -> dict[str, dict]:
    snapshot = MineEngine().snapshot()
    documents = {}
    for thing_id, twin in snapshot["things"].items():
        documents[thing_id] = {
            "policyId": "default:basic_policy",
            "attributes": {
                "name": twin["name"],
                "kind": twin["kind"],
                "_isType": False,
                "_parents": f"{NAMESPACE}:mine-01" if twin["kind"] != "mine" else None,
            },
            "features": {key: {"properties": value} for key, value in twin["features"].items()},
        }
        if twin["kind"] == "mine":
            documents[thing_id]["attributes"].pop("_parents")
    return documents


def main() -> int:
    documents = twin_documents()
    # Runtime containers may be unprivileged/read-only. twins.json is a checked-in
    # development artefact; publishing twins must never write beside this script.
    for thing_id, body in documents.items():
        request = urllib.request.Request(
            f"{DITTO_URL}/api/2/things/{thing_id}",
            data=json.dumps(body, ensure_ascii=False).encode(),
            method="PUT",
            headers={"Authorization": AUTH, "Content-Type": "application/json; charset=utf-8"},
        )
        for attempt in range(25):
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    print(f"{response.status} {thing_id}")
                break
            except (urllib.error.URLError, TimeoutError) as exc:
                if attempt == 24:
                    print(f"FAILED {thing_id}: {exc}", file=sys.stderr)
                    return 1
                time.sleep(3)
    print(f"Ready: {len(documents)} Samson twins")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
