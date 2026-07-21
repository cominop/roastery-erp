/**
 * sandbox.cjs — Python sandbox execution module
 *
 * Spawns a Python subprocess for each event handler execution:
 *   - Sends handler code + context as JSON via stdin
 *   - 5-second timeout per execution
 *   - Restricted environment: no filesystem writes, no network, no subprocesses
 *   - Logs all executions with timestamps to server/logs/handlers.log
 *
 * Usage:
 *   const { runHandler, runHandlers } = require("./sandbox.cjs");
 *   const result = await runHandler("def handle(ctx): return ctx", {});
 */

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// ─── Configuration ───────────────────────────────────

const TIMEOUT_MS = 5000; // max 5 seconds per handler
const SANDBOX_RUNNER = path.resolve(__dirname, "sandbox-runner.py");
const LOG_DIR = path.resolve(__dirname, "logs");
const LOG_FILE = path.join(LOG_DIR, "handlers.log");

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ─── Logger ───────────────────────────────────────────

function appendLog(entry) {
  try {
    const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + "\n";
    fs.appendFileSync(LOG_FILE, line, "utf-8");
  } catch {
    // Logging never throws — silently ignore write errors
  }
}

// ─── Python detection ─────────────────────────────────

function findPython() {
  // Prefer python3 on Linux/Mac, fall back to python
  const candidates = ["python3", "python"];
  for (const cmd of candidates) {
    try {
      // Verify the command actually exists and works for the sandbox runner
      require("child_process").execSync(`${cmd} --version`, { stdio: "ignore" });
      return cmd;
    } catch {
      continue;
    }
  }
  return "python3"; // last resort — let spawn fail with a clear error
}

const PYTHON_CMD = findPython();

// ─── Execution ───────────────────────────────────────

/**
 * Run a single event handler through the Python sandbox.
 *
 * @param {string} code - The Python handler code
 * @param {object} context - The execution context (record data, form state, etc.)
 * @param {object} [options]
 * @param {number} [options.timeout] - Max execution time in ms (default: 5000)
 * @returns {Promise<object>} { success, result, stdout, stderr, execution_time_ms, error }
 */
function runHandler(code, context = {}, options = {}) {
  return new Promise((resolve) => {
    const timeout = options.timeout || TIMEOUT_MS;
    const startTime = Date.now();
    let aborted = false;

    // ── Spawn Python subprocess ──────────────────────
    const child = spawn(PYTHON_CMD, [SANDBOX_RUNNER], {
      stdio: ["pipe", "pipe", "pipe"],
      // Restrict the subprocess:
      //   - No inheritance of parent's stdio beyond pipes
      //   - Minimal environment to prevent accidental leakage
      env: {
        PATH: process.env.PATH || "",        // needed to find `python3`
        HOME: process.env.HOME || "",
        LANG: "C.UTF-8",                     // prevent locale issues
        PYTHONIOENCODING: "utf-8",
        PYTHONDONTWRITEBYTECODE: "1",        // don't write .pyc files
        PYTHONUNBUFFERED: "1",               // unbuffered stdout
      },
      // Don't inherit additional file descriptors; stay in sandbox dir
      cwd: __dirname,
    });

    // ── Send input ─────────────────────────────────
    const input = JSON.stringify({ code, context });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf-8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf-8");
    });

    // ── Timeout handler ─────────────────────────────
    const timer = setTimeout(() => {
      aborted = true;
      child.kill("SIGTERM");

      // Give it a moment to die, then SIGKILL
      setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* already dead */ }
      }, 500);

      const elapsed = Date.now() - startTime;
      const logEntry = {
        action: "run_handler",
        status: "timeout",
        code_length: code.length,
        elapsed_ms: elapsed,
        error: `Timeout: execution exceeded ${timeout}ms`,
      };
      appendLog(logEntry);

      resolve({
        success: false,
        error: `Timeout: execution exceeded ${timeout}ms`,
        stdout: "",
        stderr: "",
        execution_time_ms: elapsed,
      });
    }, timeout);

    // ── Handle completion ───────────────────────────
    child.on("close", (exitCode) => {
      clearTimeout(timer);

      const elapsed = Date.now() - startTime;

      // If we already timed out, don't resolve again
      if (aborted) return;

      // Try to parse the last JSON line from stdout
      const lines = stdout.trim().split("\n").filter(Boolean);
      const lastJsonLine = lines.reverse().find((l) => {
        try { JSON.parse(l); return true; } catch { return false; }
      });

      let result;
      if (lastJsonLine) {
        try {
          result = JSON.parse(lastJsonLine);
        } catch {
          result = null;
        }
      }

      if (result && result.success) {
        appendLog({
          action: "run_handler",
          status: "success",
          handler_id: result.handler_id || null,
          code_length: code.length,
          elapsed_ms: result.execution_time_ms || elapsed,
        });

        resolve({
          success: true,
          result: result.result,
          stdout: result.stdout || "",
          stderr: result.stderr || "",
          execution_time_ms: result.execution_time_ms || elapsed,
          error: null,
        });
      } else {
        const errorMsg = result?.error || stderr.trim() || `Exit code ${exitCode}`;
        appendLog({
          action: "run_handler",
          status: "error",
          code_length: code.length,
          elapsed_ms: elapsed,
          error: errorMsg,
        });

        resolve({
          success: false,
          error: errorMsg,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          execution_time_ms: elapsed,
        });
      }
    });

    // ── Handle spawn errors (e.g., Python not found) ──
    child.on("error", (err) => {
      clearTimeout(timer);
      if (aborted) return;

      const elapsed = Date.now() - startTime;
      appendLog({
        action: "run_handler",
        status: "error",
        code_length: code.length,
        elapsed_ms: elapsed,
        error: err.message,
      });

      resolve({
        success: false,
        error: `Spawn error: ${err.message}`,
        stdout: "",
        stderr: "",
        execution_time_ms: elapsed,
      });
    });

    // ── Write input and close stdin ─────────────────
    child.stdin.write(input);
    child.stdin.end();
  });
}

/**
 * Run multiple handlers sequentially through the sandbox.
 *
 * @param {Array<{id: string, handler: string, event_name: string}>} handlers - Handler objects with code
 * @param {object} context - Shared execution context
 * @param {object} [options]
 * @returns {Promise<Array>} Results array in same order as handlers
 */
async function runHandlers(handlers, context = {}, options = {}) {
  const results = [];

  for (const h of handlers) {
    const result = await runHandler(h.handler, context, options);
    results.push({
      handler_id: h.id,
      event_name: h.event_name,
      ...result,
    });
  }

  return results;
}

module.exports = { runHandler, runHandlers };
