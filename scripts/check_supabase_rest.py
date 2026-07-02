#!/usr/bin/env python3
"""Dependency-free Supabase REST/API key smoke test."""

from __future__ import annotations

import sys
import urllib.error
import urllib.request
from pathlib import Path


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
            value = value[1:-1]
        values[key.strip()] = value
    return values


def main() -> int:
    env = load_env(Path.cwd() / ".env.local")
    url = env.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    use_secret = "--secret" in sys.argv
    key = (
        env.get("SUPABASE_SERVICE_ROLE_KEY")
        if use_secret
        else env.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") or env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    )
    if not url or not key:
        key_name = "SUPABASE_SERVICE_ROLE_KEY" if use_secret else "publishable key"
        print(f"Supabase REST check failed: missing public URL or {key_name}", file=sys.stderr)
        return 1

    request = urllib.request.Request(f"{url}/rest/v1/", headers={"apikey": key})
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            key_name = "secret" if use_secret else "publishable"
            print(f"Supabase REST {key_name} key check passed: status {response.status}.")
            return 0
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        print(f"Supabase REST check failed: HTTP {exc.code}. {body}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Supabase REST check failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
