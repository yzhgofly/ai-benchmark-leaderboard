"""Vercel Serverless: GET /api/leaderboard
Vercel Python runtime 格式: def handler(event, context)
"""
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
sys.path.insert(0, os.path.join(_ROOT, "scripts"))

from fetch_leaderboards import build_payload  # noqa: E402


def handler(event, context):  # noqa: ANN001, ARG001
    try:
        payload = build_payload()
        body = json.dumps(payload, ensure_ascii=False)
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json; charset=utf-8",
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-store",
            },
            "body": body,
        }
    except Exception as exc:  # noqa: BLE001
        err = json.dumps({"error": str(exc)}, ensure_ascii=False)
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json; charset=utf-8",
            },
            "body": err,
        }
