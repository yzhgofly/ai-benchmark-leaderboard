"""Vercel Serverless: POST/GET /api/refresh
触发数据抓取，返回抓取状态。
"""
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
sys.path.insert(0, os.path.join(_ROOT, "scripts"))

from fetch_leaderboards import build_payload  # noqa: E402


def handler(environ, start_response):  # noqa: ANN001, ARG001
    """WSGI 入口：支持 GET/POST，返回抓取状态."""
    try:
        payload = build_payload()
        body = json.dumps({
            "ok": True,
            "generatedAt": payload.get("generatedAt"),
            "sources": payload.get("sources"),
            "benchmarkCount": len(payload.get("benchmarks") or []),
        }, ensure_ascii=False).encode("utf-8")
        start_response("200 OK", [
            ("Content-Type", "application/json; charset=utf-8"),
            ("Cache-Control", "no-store"),
            ("Content-Length", str(len(body))),
        ])
        return [body]
    except Exception as exc:  # noqa: BLE001
        err = json.dumps({"ok": False, "error": str(exc)}).encode("utf-8")
        start_response("500 Internal Server Error", [
            ("Content-Type", "application/json; charset=utf-8"),
            ("Content-Length", str(len(err))),
        ])
        return [err]
