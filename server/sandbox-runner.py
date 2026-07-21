#!/usr/bin/env python3
"""
sandbox-runner.py — Restricted Python execution subprocess.

Reads handler code from stdin as a JSON line:
    {"code": "...", "context": {...}}

Executes the handler in a restricted globals environment:
  - Only safe builtins (no eval, exec, compile, __import__, open)
  - No filesystem writes (open removed, write/append blocked)
  - No network access (socket removed, requests/http not importable)
  - No subprocess spawning (subprocess/os removed)

Outputs a JSON result line to stdout:
    {"success": true, "result": ..., "stdout": "...", "execution_time_ms": N}

On error:
    {"success": false, "error": "...", "stdout": "...", "stderr": "...", "execution_time_ms": N}

Exit code 0 on success, 1 on error.
"""

import json
import sys
import time
import io

# ─── Restricted builtins ──────────────────────────────

SAFE_BUILTINS = {
    # Core types
    "bool": bool,
    "int": int,
    "float": float,
    "str": str,
    "bytes": bytes,
    "bytearray": bytearray,
    "tuple": tuple,
    "list": list,
    "dict": dict,
    "set": set,
    "frozenset": frozenset,
    "range": range,
    "complex": complex,
    # Collections
    "len": len,
    "min": min,
    "max": max,
    "sum": sum,
    "sorted": sorted,
    "reversed": reversed,
    "enumerate": enumerate,
    "zip": zip,
    "map": map,
    "filter": filter,
    "all": all,
    "any": any,
    "slice": slice,
    # String / conversion
    "chr": chr,
    "ord": ord,
    "ascii": ascii,
    "repr": repr,
    "format": format,
    "hash": hash,
    "id": id,
    "isinstance": isinstance,
    "issubclass": issubclass,
    "type": type,
    "callable": callable,
    "hasattr": hasattr,
    "getattr": getattr,
    "setattr": setattr,
    "delattr": delattr,
    "dir": dir,
    "vars": vars,
    # Math / constants
    "abs": abs,
    "pow": pow,
    "round": round,
    "divmod": divmod,
    "hex": hex,
    "oct": oct,
    "bin": bin,
    "True": True,
    "False": False,
    "None": None,
    "Ellipsis": Ellipsis,
    "NotImplemented": NotImplemented,
    # Iteration helpers
    "iter": iter,
    "next": next,
    "property": property,
    "staticmethod": staticmethod,
    "classmethod": classmethod,
    "super": super,
    "object": object,
    # Exceptions (safe — cannot escape the sandbox)
    "Exception": Exception,
    "ValueError": ValueError,
    "TypeError": TypeError,
    "KeyError": KeyError,
    "IndexError": IndexError,
    "AttributeError": AttributeError,
    "RuntimeError": RuntimeError,
    "StopIteration": StopIteration,
    "ArithmeticError": ArithmeticError,
    "ZeroDivisionError": ZeroDivisionError,
    "OverflowError": OverflowError,
    "LookupError": LookupError,
    "NameError": NameError,
}

# Blocked builtins — explicitly NOT available
#   eval, exec, compile, __import__, open,
#   globals, locals, memoryview, breakpoint,
#   input, print (captured, redirected), help, exit, quit


# ─── Restricted globals factory ───────────────────────

def make_restricted_globals(context: dict) -> dict:
    """Create a restricted globals dict for handler execution."""
    return {
        "__builtins__": SAFE_BUILTINS,
        "__name__": "__sandbox__",
        "__doc__": None,
        "__package__": None,
        "__loader__": None,
        "__spec__": None,
        # Provide the handler context
        "context": context,
        # Block module import attempts
        "__import__": _blocked_import,
    }


def _blocked_import(name, *args, **kwargs):
    """Block all imports — no network, no filesystem, no subprocess."""
    raise RuntimeError(
        f"Import blocked in sandbox: '{name}'. "
        "Event handlers cannot import modules for security reasons."
    )

# Add __import__ blocker to safe builtins
SAFE_BUILTINS["__import__"] = _blocked_import


# ─── Main execution ───────────────────────────────────

def main():
    """Read JSON from stdin, execute handler, print JSON result."""
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            print(json.dumps({"success": False, "error": "No input received"}), flush=True)
            sys.exit(1)

        payload = json.loads(raw)
        code = payload.get("code", "")
        context = payload.get("context", {})

        if not code or not isinstance(code, str):
            print(json.dumps({"success": False, "error": "Missing 'code' field"}), flush=True)
            sys.exit(1)

    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON input: {e}"}), flush=True)
        sys.exit(1)

    # Capture stdout during execution
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    captured_stdout = io.StringIO()
    captured_stderr = io.StringIO()
    sys.stdout = captured_stdout
    sys.stderr = captured_stderr

    result = None
    error = None
    start = time.time()
    elapsed_ms = 0

    try:
        # Compile the code (prevents syntax errors from corrupting execution)
        compiled = compile(code, "<sandbox>", "exec")

        # Execute in restricted globals
        restricted_globals = make_restricted_globals(context)
        exec(compiled, restricted_globals)

        # If the handler defined a `handle` function, call it
        if "handle" in restricted_globals and callable(restricted_globals["handle"]):
            result = restricted_globals["handle"](context)

        elapsed_ms = round((time.time() - start) * 1000, 2)

        stdout_text = captured_stdout.getvalue()
        stderr_text = captured_stderr.getvalue()

        # Restore stdout BEFORE printing the result
        sys.stdout = old_stdout
        sys.stderr = old_stderr

        print(json.dumps({
            "success": True,
            "result": result,
            "stdout": stdout_text,
            "stderr": stderr_text,
            "execution_time_ms": elapsed_ms,
        }), flush=True)
        return

    except SyntaxError as e:
        sys.stdout = old_stdout
        sys.stderr = old_stderr
        print(json.dumps({
            "success": False,
            "error": f"SyntaxError: {e}",
            "stdout": captured_stdout.getvalue(),
            "stderr": captured_stderr.getvalue(),
            "execution_time_ms": elapsed_ms,
        }), flush=True)
        sys.exit(1)

    except Exception as e:
        sys.stdout = old_stdout
        sys.stderr = old_stderr
        elapsed_ms = round((time.time() - start) * 1000, 2)
        print(json.dumps({
            "success": False,
            "error": f"{type(e).__name__}: {e}",
            "stdout": captured_stdout.getvalue(),
            "stderr": captured_stderr.getvalue(),
            "execution_time_ms": elapsed_ms,
        }), flush=True)
        sys.exit(1)

    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr


if __name__ == "__main__":
    main()
