#!/usr/bin/env python3
"""
Metadata Differ — Roastery ERP

Step 84: Metadata Deployment 5 — Diff Preview

Compares two extracted metadata export directories (current DB state vs.
incoming archive) and produces a structured diff report at the field level.

Usage:
    python3 server/differ.py --current /path/to/current --incoming /path/to/incoming
    python3 server/differ.py --current /path/to/current --incoming /path/to/incoming --output diff.json
    python3 server/differ.py --help
"""

import argparse
import json
import os
import sys


# ─── Config ──────────────────────────────────────────────

# The 7 definition file types we compare.
DEFINITION_TYPES = [
    "forms",
    "fields",
    "events",
    "nav_tree",
    "permissions",
    "reports",
    "settings",
]

# For permissions.json, it's a dict with sub-keys rather than an array.
# We treat each sub-key as its own category for diffing.
PERMISSIONS_SUBKEYS = [
    "roles",
    "user_roles",
    "table_permissions",
    "field_permissions",
    "row_filters",
]


# ─── Helpers ─────────────────────────────────────────────

def load_json_file(directory, filename):
    """Load a JSON file from the given directory. Returns parsed data or None."""
    path = os.path.join(directory, filename)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def json_digest(obj):
    """Deterministic JSON string for comparison."""
    return json.dumps(obj, sort_keys=True, default=str)


def key_for_entry(entry):
    """Return a stable unique key for an entry across most types.

    Tries common identifier fields in priority order.
    Returns ('name', value) or ('index', str(idx)) as fallback.
    """
    if isinstance(entry, dict):
        for key in ("name", "id", "control_name", "form_name"):
            if key in entry and entry[key] is not None:
                return (key, str(entry[key]))
        # Try first string field as fallback
        for key, val in entry.items():
            if isinstance(val, str) and key != "definition":
                return (key, val)
    return ("index", str(id(entry)))


def describe_changes(old_entry, new_entry):
    """Return a human-readable list of what changed between two entries."""
    changes = []

    if not isinstance(old_entry, dict) or not isinstance(new_entry, dict):
        if json_digest(old_entry) != json_digest(new_entry):
            old_str = json.dumps(old_entry, default=str)[:80]
            new_str = json.dumps(new_entry, default=str)[:80]
            changes.append(f"value changed from {old_str!r} to {new_str!r}")
        return changes

    all_keys = set(list(old_entry.keys()) + list(new_entry.keys()))

    for key in sorted(all_keys):
        ov = old_entry.get(key)
        nv = new_entry.get(key)
        ov_str = json_digest(ov)
        nv_str = json_digest(nv)

        if ov_str != nv_str:
            # Skip whole-definition diffs (too verbose) — report as a single item
            if key == "definition":
                changes.append("definition block changed")
                continue

            old_val_str = json.dumps(ov, default=str) if ov is not None else "(missing)"
            new_val_str = json.dumps(nv, default=str) if nv is not None else "(missing)"

            # Trim long values
            if len(old_val_str) > 100:
                old_val_str = old_val_str[:100] + "..."
            if len(new_val_str) > 100:
                new_val_str = new_val_str[:100] + "..."

            if ov is None and nv is not None:
                changes.append(f"field '{key}' added: {new_val_str}")
            elif ov is not None and nv is None:
                changes.append(f"field '{key}' removed: was {old_val_str}")
            else:
                changes.append(f"field '{key}' changed: {old_val_str} → {new_val_str}")

    return changes


# ─── Diff Logic ──────────────────────────────────────────

def diff_simple_array(current_entries, incoming_entries, entry_label="item"):
    """Diff two arrays of dicts by matching on stable keys.

    Returns a list of diff-item dicts and a summary dict.
    """
    current_map = {}
    for entry in (current_entries or []):
        key_name, key_val = key_for_entry(entry)
        current_map[(key_name, key_val)] = entry

    incoming_map = {}
    for entry in (incoming_entries or []):
        key_name, key_val = key_for_entry(entry)
        incoming_map[(key_name, key_val)] = entry

    all_keys = set(list(current_map.keys()) + list(incoming_map.keys()))

    details = []
    counts = {"added": 0, "removed": 0, "changed": 0, "unchanged": 0}

    for key in sorted(all_keys, key=lambda k: str(k)):
        current_entry = current_map.get(key)
        incoming_entry = incoming_map.get(key)

        entry_name = str(key[1]) if key[1] is not None else str(key)
        key_field = key[0]

        if current_entry is None:
            # Added in incoming
            counts["added"] += 1
            details.append({
                "name": entry_name,
                "key_field": key_field,
                "status": "added",
                "changes": [],
            })
        elif incoming_entry is None:
            # Removed from incoming
            counts["removed"] += 1
            details.append({
                "name": entry_name,
                "key_field": key_field,
                "status": "removed",
                "changes": [],
            })
        else:
            # Both exist — compare
            if json_digest(current_entry) == json_digest(incoming_entry):
                counts["unchanged"] += 1
                details.append({
                    "name": entry_name,
                    "key_field": key_field,
                    "status": "unchanged",
                    "changes": [],
                })
            else:
                counts["changed"] += 1
                changes = describe_changes(current_entry, incoming_entry)
                details.append({
                    "name": entry_name,
                    "key_field": key_field,
                    "status": "changed",
                    "changes": changes,
                })

    return details, counts


def diff_permissions(current_data, incoming_data):
    """Diff the permissions.json dict, which has sub-keys."""
    details = {}
    summary_counts = {}

    for subkey in PERMISSIONS_SUBKEYS:
        current_list = (current_data or {}).get(subkey, [])
        incoming_list = (incoming_data or {}).get(subkey, [])

        if not isinstance(current_list, list):
            current_list = []
        if not isinstance(incoming_list, list):
            incoming_list = []

        sub_details, sub_counts = diff_simple_array(current_list, incoming_list, subkey)
        details[subkey] = sub_details
        summary_counts[subkey] = sub_counts

    return details, summary_counts


def diff_metadata(current_dir, incoming_dir):
    """
    Compare two metadata export directories.

    Args:
        current_dir: Path to the current metadata (exported live from DB)
        incoming_dir: Path to the incoming metadata (from the archive being imported)

    Returns:
        dict with 'summary' and 'details' keys
    """
    summary = {}
    details = {}

    for dtype in DEFINITION_TYPES:
        filename = f"{dtype}.json"
        rel_path = os.path.join("definitions", filename)  # might be in definitions/
        rel_path2 = filename  # or directly in the dir

        current_data = load_json_file(current_dir, rel_path)
        if current_data is None:
            current_data = load_json_file(current_dir, rel_path2)

        incoming_data = load_json_file(incoming_dir, rel_path)
        if incoming_data is None:
            incoming_data = load_json_file(incoming_dir, rel_path2)

        if dtype == "permissions":
            # Permissions is a dict with sub-keys
            sub_details, sub_counts = diff_permissions(current_data or {}, incoming_data or {})
            # Aggregate sub-counts into a flat summary
            agg = {"added": 0, "removed": 0, "changed": 0, "unchanged": 0}
            for sk, sc in sub_counts.items():
                for k in agg:
                    agg[k] += sc[k]
            summary[dtype] = agg
            details[dtype] = sub_details
        elif dtype == "settings":
            # Settings is typically an array (like other types)
            sub_details, sub_counts = diff_simple_array(
                current_data or [], incoming_data or [], "setting"
            )
            summary[dtype] = sub_counts
            details[dtype] = sub_details
        else:
            sub_details, sub_counts = diff_simple_array(
                current_data or [], incoming_data or [], dtype
            )
            summary[dtype] = sub_counts
            details[dtype] = sub_details

    return {
        "summary": summary,
        "details": details,
    }


# ─── CLI Entry Point ─────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Roastery ERP — Metadata Differ",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    %(prog)s --current /tmp/current --incoming /tmp/incoming
    %(prog)s --current /tmp/current --incoming /tmp/incoming --output diff.json
        """,
    )
    parser.add_argument(
        "--current",
        required=True,
        help="Path to the current metadata export directory",
    )
    parser.add_argument(
        "--incoming",
        required=True,
        help="Path to the incoming metadata export directory (from archive)",
    )
    parser.add_argument(
        "--output",
        help="Path to write the diff JSON output (default: print to stdout)",
    )

    args = parser.parse_args()

    # Validate directories
    for label, path in [("--current", args.current), ("--incoming", args.incoming)]:
        if not os.path.isdir(path):
            print(f"Error: {label} path '{path}' is not a directory or doesn't exist",
                  file=sys.stderr)
            sys.exit(1)

    result = diff_metadata(args.current, args.incoming)

    output_json = json.dumps(result, indent=2, default=str)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_json + "\n")
        print(f"Diff written to {args.output}")
    else:
        print(output_json)


if __name__ == "__main__":
    main()
