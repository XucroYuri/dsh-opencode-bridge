#!/usr/bin/env python3
"""dsh-opencode-bridge: experimental bridge to use OpenCode as a model provider.

This MVP only manages the local OpenCode headless server lifecycle and prints
experimental configuration guidance. A real LlmAdapter integration will follow.
"""
from __future__ import annotations

import argparse
import os
import pathlib
import shutil
import signal
import subprocess
import sys
import time


def pid_path() -> pathlib.Path:
    return pathlib.Path(os.environ.get("DSH_HOME", str(pathlib.Path.home() / ".dsh"))) / "cache" / "opencode-bridge.pid"


def is_openocode_available() -> bool:
    return shutil.which("opencode") is not None


def cmd_status() -> int:
    if not is_openocode_available():
        print("opencode: not found", file=sys.stderr)
        return 1
    try:
        version = subprocess.check_output(["opencode", "--version"], text=True, timeout=10).strip()
    except Exception as exc:
        version = f"unknown ({exc})"
    print(f"opencode: {version}")
    p = pid_path()
    if p.exists():
        try:
            pid = int(p.read_text().strip())
            os.kill(pid, 0)
            print(f"bridge: running (pid {pid})")
        except (ProcessLookupError, ValueError):
            print("bridge: pid file exists but process not running")
    else:
        print("bridge: not running")
    return 0


def cmd_serve(port: int) -> int:
    if not is_openocode_available():
        print("opencode: not found", file=sys.stderr)
        return 1
    p = pid_path()
    if p.exists():
        try:
            pid = int(p.read_text().strip())
            os.kill(pid, 0)
            print(f"bridge already running (pid {pid})")
            return 0
        except (ProcessLookupError, ValueError):
            p.unlink(missing_ok=True)

    p.parent.mkdir(parents=True, exist_ok=True)
    log_path = p.parent / "opencode-bridge.log"
    with open(log_path, "a", encoding="utf-8") as log:
        proc = subprocess.Popen(
            ["opencode", "serve", "--hostname", "127.0.0.1", "--port", str(port)],
            stdout=log,
            stderr=log,
            start_new_session=True,
        )
    p.write_text(str(proc.pid), encoding="utf-8")
    print(f"bridge started (pid {proc.pid}, port {port})")
    print(f"log: {log_path}")
    return 0


def cmd_stop() -> int:
    p = pid_path()
    if not p.exists():
        print("bridge not running")
        return 0
    try:
        pid = int(p.read_text().strip())
        os.killpg(pid, signal.SIGTERM)
    except (ProcessLookupError, ValueError):
        pass
    p.unlink(missing_ok=True)
    print("bridge stopped")
    return 0


def cmd_config(port: int) -> int:
    print("# Experimental: add this to llm-pi-ai.providers if OpenCode exposes")
    print("# an OpenAI-compatible endpoint at the bridge port.")
    print("opencode-bridge:")
    print("  apiKeyEnv: OPENCODE_API_KEY")
    print(f"  baseURL: http://127.0.0.1:{port}/v1")
    print("  api: openai-completions")
    print("  models:")
    print("    - id: opencode/glm-5.3")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="command", required=True)

    sub.add_parser("status", help="show OpenCode/bridge status")
    p_serve = sub.add_parser("serve", help="start OpenCode headless server")
    p_serve.add_argument("--port", type=int, default=4096)
    sub.add_parser("stop", help="stop bridge server")
    p_config = sub.add_parser("config", help="print experimental bridge config")
    p_config.add_argument("--port", type=int, default=4096)

    args = ap.parse_args(argv)

    if args.command == "status":
        return cmd_status()
    if args.command == "serve":
        return cmd_serve(args.port)
    if args.command == "stop":
        return cmd_stop()
    if args.command == "config":
        return cmd_config(args.port)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
