#!/usr/bin/env python3
"""Safely import the Samson OpenEgiz folder from the supplied ZIP.

Usage:
  python scripts/import_openegiz.py /path/to/SmartHaul_3D_Tour_Final.zip

The script preserves the repository root (including the SmartHaul Pages visualizer),
imports into Samson_OpenEgiz/, and skips likely secrets and generated files.
Review the resulting git diff before committing.
"""
from pathlib import Path, PurePosixPath
import sys
import zipfile

SOURCE_PREFIX = "Самсон_OpenEgiz/"
TARGET_PREFIX = "Samson_OpenEgiz/"
SKIP_PARTS = {
    ".git", "node_modules", "dist", "__pycache__", ".venv", "venv"
}
SKIP_NAMES = {
    "secrets.values.yaml", "CREDENTIALS.md", ".env",
}
SECRET_SUFFIXES = {".p12", ".pfx", ".credentials"}
SECRET_NAME_PARTS = ("-key.pem", "private-key", "id_rsa", "id_ed25519")


def should_skip(relative: PurePosixPath) -> bool:
    parts = set(relative.parts)
    name = relative.name.lower()
    if parts & SKIP_PARTS or name in SKIP_NAMES:
        return True
    if relative.suffix.lower() in SECRET_SUFFIXES:
        return True
    if any(part in name for part in SECRET_NAME_PARTS):
        return True
    # Skip private key files; public certificates may remain if needed.
    if name.endswith(".pem") and ("key" in name or "private" in name):
        return True
    return False


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python scripts/import_openegiz.py <archive.zip>")
        return 2
    archive = Path(sys.argv[1]).expanduser()
    if not archive.is_file():
        print(f"Archive not found: {archive}")
        return 2

    repo_root = Path(__file__).resolve().parent.parent
    target_root = repo_root / TARGET_PREFIX
    written = skipped = 0

    with zipfile.ZipFile(archive) as zf:
        bad = zf.testzip()
        if bad:
            print(f"ZIP integrity check failed at: {bad}")
            return 1

        for info in zf.infolist():
            if info.is_dir() or not info.filename.startswith(SOURCE_PREFIX):
                continue
            relative = PurePosixPath(info.filename[len(SOURCE_PREFIX):])
            if not relative.parts or should_skip(relative):
                skipped += 1
                continue
            destination = target_root.joinpath(*relative.parts)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(zf.read(info))
            written += 1

    print(f"Imported files: {written}")
    print(f"Skipped potentially sensitive/generated files: {skipped}")
    print("Next: inspect 'git status' and 'git diff --stat' before committing.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
