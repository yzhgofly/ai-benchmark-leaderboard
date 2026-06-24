"""Vercel Serverless: POST /api/refresh
触发数据抓取，刷新本地 data/benchmarks.json。
由于 Vercel 只读 fs，刷新只能通过 push 触发；这个端点用于手动触发 build hook 或作健康检查。
"""
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
sys.path.insert(0, os.path.join(_ROOT, "scripts"))

from fetch_leaderboards import build_payload  # noqa: E402

from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        return self.do_POST()

    def do_POST(self):  # noqa: N802
        try:
            payload = build_payload()
            body = json.dumps({
                "ok": True,
                "generatedAt": payload.get("generatedAt"),
                "sources": payload.get("sources"),
                "benchmarkCount": len(payload.get("benchmarks") or []),
            }, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:  # noqa: BLE001
            err = json.dumps({"ok": False, "error": str(exc)}).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(err)))
            self.end_headers()
            self.wfile.write(err)
