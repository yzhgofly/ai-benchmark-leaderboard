"""Vercel Serverless: GET /api/leaderboard
使用 WSGI 兼容格式，适配 @vercel/python runtime。
"""
import json
import os
import sys

# 把 scripts/ 加进 import path
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
sys.path.insert(0, os.path.join(_ROOT, "scripts"))

from fetch_leaderboards import build_payload  # noqa: E402


def handler(environ, start_response):  # noqa: ANN001, ARG001
    """WSGI 入口：接收请求，返回 JSON."""
    try:
        payload = build_payload()
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        start_response("200 OK", [
            ("Content-Type", "application/json; charset=utf-8"),
            ("Access-Control-Allow-Origin", "*"),
            ("Cache-Control", "no-store"),
            ("Content-Length", str(len(body))),
        ])
        return [body]
    except Exception as exc:  # noqa: BLE001
        err = json.dumps({"error": str(exc)}).encode("utf-8")
        start_response("500 Internal Server Error", [
            ("Content-Type", "application/json; charset=utf-8"),
            ("Content-Length", str(len(err))),
        ])
        return [err]
