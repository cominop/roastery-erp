#!/usr/bin/env python3
"""Step 4 — Import VBA events into event_handlers table.

Reads vba-all-extract.json and inserts every event handler
into shared.event_handlers with correct API form name as scope.

Usage: python3 src/events/__tests__/vba-event-import.py
"""

import json
import subprocess
import os

EXTRACT_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "vba-all-extract.json"
)


def psql(sql: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["psql", "-d", "polyaccess", "-c", sql],
        capture_output=True, text=True, timeout=10,
    )


def esc(val: str | None) -> str:
    """Escape a value for single-quoted SQL string, or return NULL."""
    if val is None:
        return "NULL"
    escaped = val.replace("'", "''")
    return f"E'{escaped}'"


def main():
    print("=" * 70)
    print("Step 4 — Import VBA Events into event_handlers")
    print("=" * 70)

    with open(EXTRACT_PATH) as f:
        data = json.load(f)

    # Clear existing
    psql("DELETE FROM shared.event_handlers WHERE language = 'vba';")
    print("\nCleared existing VBA-sourced handlers.\n")

    total = 0
    for api_name in sorted(data.keys()):
        entry = data[api_name]
        if entry.get("status") != "has_events":
            print(f"  ⚠ {api_name:40s}  no events, skipped")
            continue

        module = entry["module_name"]
        count = 0

        for ev in entry.get("form_events", []):
            code = f"Private Sub Form_{ev['event']}{ev['signature']}\n...\nEnd Sub"
            eprop = ev.get("event_prop", f"on_{ev['event'].lower()}")
            sql = (
                "INSERT INTO shared.event_handlers "
                "(level, scope, event_name, handler, vba_module, vba_control, language, description) VALUES ("
                f"'item', {esc(api_name)}, {esc(eprop)}, {esc(code)}, "
                f"{esc(module)}, 'Form', 'vba', {esc(f'Form event from {module}')}"
                ");"
            )
            r = psql(sql)
            if r.returncode == 0:
                count += 1

        for ev in entry.get("control_events", []):
            code = f"Private Sub {ev['control']}_{ev['event']}{ev['signature']}\n...\nEnd Sub"
            eprop = ev.get("event_prop", f"on_{ev['event'].lower()}")
            ctrl_name = ev["control"]
            desc = f"Control event from {module}.{ctrl_name}"
            sql = (
                "INSERT INTO shared.event_handlers "
                "(level, scope, event_name, handler, vba_module, vba_control, language, description) VALUES ("
                f"'item', {esc(api_name)}, {esc(eprop)}, {esc(code)}, "
                f"{esc(module)}, {esc(ctrl_name)}, 'vba', {esc(desc)}"
                ");"
            )
            r = psql(sql)
            if r.returncode == 0:
                count += 1

        n_expected = len(entry.get("form_events", [])) + len(entry.get("control_events", []))
        total += count
        status = "✅" if count == n_expected else "⚠"
        print(f"  {status} {api_name:40s}  {count:3d}/{n_expected}  ({module})")

    # Verify
    r = psql("SELECT count(*) FROM shared.event_handlers WHERE language = 'vba';")
    print(f"\n{'='*70}")
    print(f"Total events in DB: {total}")
    print(f"{'='*70}")


if __name__ == "__main__":
    main()