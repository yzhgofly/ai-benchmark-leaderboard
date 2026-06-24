"""AI 大模型基准测试榜单 - 抓取器（可作为 CLI 或被 Vercel Serverless 复用）。

CLI 用法:
    python scripts/fetch_leaderboards.py

Serverless 用法:
    from scripts.fetch_leaderboards import build_payload
    payload = build_payload() -> dict
"""

from __future__ import annotations

import datetime as _dt
import html as _html
import json
import os
import re
import sys
import time
import urllib.request
from typing import List, Dict, Any

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_FILE = os.path.join(ROOT, "data", "benchmarks.json")
FALLBACK_DIR = os.path.join(ROOT, "data")
TOP_N = 30

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)


# ---------- HTTP & HTML helpers ----------
def http_get(url: str, timeout: int = 25, retries: int = 1, extra_headers=None) -> str:
    headers = {
        "user-agent": UA,
        "accept": "text/html,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9,zh-CN;q=0.8",
    }
    if extra_headers:
        headers.update(extra_headers)
    last = None
    for i in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
            enc = resp.headers.get_content_charset() or "utf-8"
            try:
                return raw.decode(enc, errors="replace")
            except LookupError:
                return raw.decode("utf-8", errors="replace")
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(0.5 + i)
    raise RuntimeError(str(last))


def strip_tags(s: str) -> str:
    return re.sub(r"\s+", " ", _html.unescape(re.sub(r"<[^>]+>", "", s))).strip()


def parse_tables(html_text: str):
    parsed = []
    for t in re.findall(r"<table\b[\s\S]*?</table>", html_text, flags=re.I):
        rows = []
        for tr in re.findall(r"<tr\b[^>]*>([\s\S]*?)</tr>", t, flags=re.I):
            cells = re.findall(r"<(t[dh])\b[^>]*>([\s\S]*?)</\1>", tr, flags=re.I)
            rows.append([strip_tags(c[1]) for c in cells])
        parsed.append(rows)
    return parsed


def guess_vendor(model: str) -> str:
    m = (model or "").lower()
    mappings = [
        (("gpt", "o1", "o3", "o4", "chatgpt", "codex"), "OpenAI"),
        (("claude", "fable", "mythos", "opus", "sonnet", "haiku"), "Anthropic"),
        (("gemini", "gemma", "nano-banana"), "Google"),
        (("grok",), "xAI"),
        (("qwen", "tongyi", "dola"), "Alibaba"),
        (("deepseek",), "DeepSeek"),
        (("kimi", "moonshot"), "Moonshot AI"),
        (("glm", "chatglm", "z.ai", "z ai"), "Z.AI"),
        (("llama", "muse-spark", "meta"), "Meta"),
        (("mistral", "mixtral", "codestral", "devstral"), "Mistral"),
        (("ernie", "wenxin"), "Baidu"),
        (("hunyuan",), "Tencent"),
        (("doubao", "seedance", "dreamina", "seed-"), "ByteDance"),
        (("minimax",), "MiniMax"),
        (("yi-", "yi "), "01.AI"),
        (("phi-", "phi "), "Microsoft"),
        (("nemotron",), "NVIDIA"),
        (("mimo", "xiaomi"), "Xiaomi"),
        (("step-",), "StepFun"),
        (("command",), "Cohere"),
        (("jamba",), "AI21 Labs"),
        (("falcon",), "TII"),
        (("dbrx",), "Databricks"),
        (("reka",), "Reka"),
        (("nova",), "Amazon"),
    ]
    for keys, vendor in mappings:
        if any(k in m for k in keys):
            return vendor
    return "—"


def today_iso() -> str:
    return _dt.date.today().isoformat()


# ---------- Fetchers ----------
def fetch_artificial_analysis():
    """AA 主表 → 4 个榜单: Intelligence / Price / Speed / Context."""
    text = http_get("https://artificialanalysis.ai/leaderboards/models", timeout=30)
    tables = parse_tables(text)
    target = None
    header_idx = -1
    for rows in tables:
        for i, row in enumerate(rows):
            if any("intelligence index" in (c or "").lower() for c in row) and \
                    any((c or "").strip().lower() == "model" for c in row):
                target = rows
                header_idx = i
                break
        if target:
            break
    if not target:
        raise RuntimeError("AA: table not found")

    header = target[header_idx]
    def col(name):
        for i, h in enumerate(header):
            if name in h.lower():
                return i
        return -1

    model_idx = col("model")
    creator_idx = col("creator")
    intel_idx = col("intelligence index")
    price_idx = col("usd/1m")
    speed_idx = col("median")
    context_idx = col("context window")
    if model_idx < 0 or intel_idx < 0:
        raise RuntimeError("AA: header parse fail")

    def to_num(s):
        s = re.sub(r"[^0-9.]", "", s or "")
        try:
            return float(s)
        except ValueError:
            return None

    def to_context(s):
        s = (s or "").strip()
        m = re.match(r"([0-9.]+)\s*([kKmM]?)", s)
        if not m:
            return None
        val = float(m.group(1))
        unit = m.group(2).lower()
        if unit == "k":
            val *= 1_000
        elif unit == "m":
            val *= 1_000_000
        return val

    rows_raw = []
    for row in target[header_idx + 1:]:
        if len(row) <= model_idx:
            continue
        model = row[model_idx].strip()
        if not model:
            continue
        vendor = (row[creator_idx].strip() if 0 <= creator_idx < len(row) else "") or guess_vendor(model)
        rows_raw.append({
            "model": model,
            "vendor": vendor,
            "intel": to_num(row[intel_idx]) if intel_idx >= 0 else None,
            "price": to_num(row[price_idx]) if 0 <= price_idx < len(row) else None,
            "speed": to_num(row[speed_idx]) if 0 <= speed_idx < len(row) else None,
            "context": to_context(row[context_idx]) if 0 <= context_idx < len(row) else None,
        })

    today = today_iso()
    out = []

    def to_benchmark(bid, name, full, metric, desc, items, sort_key, reverse=True):
        items = [x for x in items if x.get(sort_key) is not None]
        items.sort(key=lambda e: e[sort_key], reverse=reverse)
        top = items[:TOP_N]
        entries = [{"rank": i + 1, **e, "date": today} for i, e in enumerate(top)]
        out.append({
            "id": bid, "name": name, "fullName": full, "metric": metric,
            "description": desc, "source": "Artificial Analysis",
            "sourceUrl": "https://artificialanalysis.ai/leaderboards/models",
            "updatedAt": today, "entries": entries,
        })

    def to_entries(items, key):
        return [{"model": r["model"], "vendor": r["vendor"], "score": r[key]} for r in items]

    to_benchmark("aa-intelligence", "AA Intelligence Index",
                 "Artificial Analysis Intelligence Index", "Index (0-100)",
                 "AA 综合智力指数，融合 MMLU-Pro、GPQA Diamond、HumanEval、AIME、SciCode 等。",
                 to_entries(rows_raw, "intel"), "score", True)
    if price_idx >= 0:
        to_benchmark("aa-price", "AA Price (Lower is Better)",
                     "Artificial Analysis - Blended USD/1M Tokens", "USD / 1M tokens (越低越好)",
                     "AA 混合价（输入+输出加权），数值越低越便宜。",
                     to_entries(rows_raw, "price"), "score", False)
    if speed_idx >= 0:
        to_benchmark("aa-speed", "AA Output Speed",
                     "Artificial Analysis - Median Output Speed", "Tokens / second",
                     "AA Median 输出速度 (tokens/s)，数值越高越快。",
                     to_entries(rows_raw, "speed"), "score", True)
    if context_idx >= 0:
        to_benchmark("aa-context", "AA Context Window",
                     "Artificial Analysis - Context Window", "Tokens (越大越好)",
                     "AA 上下文窗口（最大输入 token 数），数值越大支持的上下文越长。",
                     to_entries(rows_raw, "context"), "score", True)

    if not out:
        raise RuntimeError("AA: 0 rows")
    return out


def fetch_livebench():
    """LiveBench 7 个分项榜."""
    today = today_iso()
    text = http_get("https://livebench.ai/", timeout=20)
    ver_match = re.search(r"LiveBench-(\d{4}-\d{2}-\d{2})", text)
    updated_at = ver_match.group(1) if ver_match else None

    tables = parse_tables(text)
    target = None
    for rows in tables:
        if rows and any("global average" in (h or "").lower() for h in rows[0]):
            target = rows
            break

    wanted = [
        ("global", "Global Average", "livebench-global", "LiveBench Global Average"),
        ("reasoning", "Reasoning Average", "livebench-reasoning", "LiveBench Reasoning Average"),
        ("coding", "Coding Average", "livebench-coding", "LiveBench Coding Average"),
        ("mathematics", "Mathematics Average", "livebench-math", "LiveBench Mathematics Average"),
        ("data analysis", "Data Analysis Average", "livebench-data-analysis", "LiveBench Data Analysis Average"),
        ("language", "Language Average", "livebench-language", "LiveBench Language Average"),
        ("if", "IF Average", "livebench-if", "LiveBench IF Average"),
    ]

    results = []
    if target:
        header = target[0]
        org_idx = next((i for i, h in enumerate(header) if "organization" in h.lower()), -1)
        for col_kw, _, bid, full in wanted:
            score_idx = next((i for i, h in enumerate(header) if col_kw in h.lower()), -1)
            model_idx = next((i for i, h in enumerate(header) if h.strip().lower() == "model"), -1)
            if model_idx < 0 or score_idx < 0:
                continue
            items = []
            for row in target[1:]:
                if len(row) <= max(model_idx, score_idx):
                    continue
                try:
                    score = float(row[score_idx])
                except ValueError:
                    continue
                model = re.sub(r"\s*\*.*$", "", row[model_idx]).strip()
                vendor = row[org_idx].strip() if 0 <= org_idx < len(row) else guess_vendor(model)
                if model:
                    items.append({"model": model, "vendor": vendor or guess_vendor(model), "score": score})
            if not items:
                continue
            items.sort(key=lambda e: e["score"], reverse=True)
            entries = [{"rank": i + 1, **e, "date": updated_at or today} for i, e in enumerate(items[:TOP_N])]
            results.append({
                "id": bid, "name": full.split(" (")[0],
                "fullName": f"{full} ({updated_at})" if updated_at else full,
                "metric": col_kw.title() + " (%)",
                "description": f"LiveBench {col_kw.title()} 分项平均分。",
                "source": "LiveBench", "sourceUrl": "https://livebench.ai/",
                "updatedAt": updated_at or today, "entries": entries,
            })
        if results:
            return results

    fb_path = os.path.join(FALLBACK_DIR, "fallback_livebench.json")
    if os.path.exists(fb_path):
        with open(fb_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        out = []
        for key, bm in (data.get("categories") or {}).items():
            bm = dict(bm)
            bm["stale"] = True
            out.append(bm)
        return out
    raise RuntimeError("LiveBench: online & fallback both empty")


def fetch_vellum_set():
    """Vellum 6 个细分榜, 在线抓 Top5 + fallback 补到 30."""
    text = http_get("https://www.vellum.ai/llm-leaderboard", timeout=30)
    upd = re.search(r"updated\s+(\d{1,2}\s+\w+\s+\d{4})", text)
    updated_at = upd.group(1) if upd else today_iso()

    bench_defs = [
        ("vellum-gpqa", "GPQA Diamond", "GPQA Diamond", "Accuracy (%)",
         "GPQA Diamond：领域博士设计的研究生级科学推理题。"),
        ("vellum-aime", "AIME 2025", "AIME 2025 (High School Math)", "Accuracy (%)",
         "AIME 2025：高难度高中数学竞赛，考察多步骤推理。"),
        ("vellum-swe", "SWE-Bench Verified", "SWE-Bench Verified (Agentic Coding)", "Solve Rate (%)",
         "SWE-bench Verified：真实开源仓库 PR 任务通过率，衡量 Agent 编码能力。"),
        ("vellum-hle", "Humanity's Last Exam", "Humanity's Last Exam (HLE)", "Accuracy (%)",
         "Humanity's Last Exam：当前最难的跨学科综合知识与推理评测。"),
        ("vellum-arc", "ARC-AGI 2", "ARC-AGI 2 (Visual Reasoning)", "Accuracy (%)",
         "ARC-AGI 2：抽象推理与视觉模式识别评测。"),
        ("vellum-mmmlu", "MMMLU", "MMMLU (Multilingual Reasoning)", "Accuracy (%)",
         "MMMLU：覆盖多语言版本 MMLU 的综合知识评测。"),
    ]

    results = []
    for bid, kw, full, metric, desc in bench_defs:
        pat = re.compile(
            r'"@type"\s*:\s*"Dataset"\s*,\s*"name"\s*:\s*"' + re.escape(kw)
            + r'[^"]*"[\s\S]*?"distribution"\s*:\s*\[([\s\S]*?)\]'
        )
        m = pat.search(text)
        if not m:
            continue
        dist = m.group(1)
        items = []
        for nm, ds in re.findall(
            r'"@type"\s*:\s*"DataDownload"\s*,\s*"name"\s*:\s*"([^"]+)"[\s\S]*?"description"\s*:\s*"([^"]+)"',
            dist,
        ):
            sm = re.search(r"scored\s+([0-9.]+)%?", ds)
            if not sm:
                continue
            try:
                score = float(sm.group(1))
            except ValueError:
                continue
            items.append({"model": nm.strip(), "vendor": guess_vendor(nm), "score": score})
        seen, dedup = set(), []
        for it in items:
            if it["model"] in seen:
                continue
            seen.add(it["model"])
            dedup.append(it)
        if not dedup:
            continue
        dedup.sort(key=lambda e: e["score"], reverse=True)
        entries = [{"rank": i + 1, **e, "date": updated_at} for i, e in enumerate(dedup[:TOP_N])]
        results.append({
            "id": bid, "name": full, "fullName": "Vellum LLM Leaderboard - " + full,
            "metric": metric, "description": desc,
            "source": "Vellum AI", "sourceUrl": "https://www.vellum.ai/llm-leaderboard",
            "updatedAt": updated_at, "entries": entries,
        })
    if not results:
        raise RuntimeError("Vellum: 0 results")
    return results


# ---------- Fallback loading ----------
def _load_fallback_for(fallback_files: List[str], target_id: str):
    if not fallback_files:
        return None
    for fpath in fallback_files:
        full = os.path.join(FALLBACK_DIR, fpath)
        if not os.path.exists(full):
            continue
        try:
            with open(full, "r", encoding="utf-8") as fp:
                data = json.load(fp)
        except Exception:
            continue
        if data.get("id") == target_id and "entries" in data:
            return data
        for bm in (data.get("categories") or {}).values():
            if bm.get("id") == target_id:
                return bm
    return None


def load_prev(path: str = OUT_FILE):
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def run_one(name, fn, prev_by_id, ids, fallback_files=None):
    items: List[Dict[str, Any]] = []
    err = None
    ok = False
    try:
        result = fn()
        items = result if isinstance(result, list) else [result]
        ok = True
    except Exception as exc:  # noqa: BLE001
        err = str(exc)
        for bid in ids:
            prev = prev_by_id.get(bid)
            if prev:
                items.append({**prev, "stale": True})

    # 行数补足
    if fallback_files:
        for bm in items:
            if len(bm.get("entries") or []) >= TOP_N:
                continue
            extra = _load_fallback_for(fallback_files, bm.get("id"))
            if not extra:
                continue
            online_top = [e["model"] for e in bm.get("entries", [])]
            merged = list(bm.get("entries", []))
            for e in extra.get("entries", []):
                if len(merged) >= TOP_N:
                    break
                if e["model"] in online_top:
                    continue
                merged.append({**e, "rank": len(merged) + 1})
            bm["entries"] = merged

    return {"ok": ok, "items": items, "error": err}


# ---------- Entry: build full payload ----------
TASKS = [
    ("Artificial Analysis", fetch_artificial_analysis,
     ["aa-intelligence", "aa-price", "aa-speed", "aa-context"], None),
    ("Vellum LLM Leaderboard", fetch_vellum_set, [
        "vellum-gpqa", "vellum-aime", "vellum-swe",
        "vellum-hle", "vellum-arc", "vellum-mmmlu"
    ], ["fallback_vellum.json"]),
    ("LiveBench", fetch_livebench, [
        "livebench-global", "livebench-reasoning", "livebench-coding",
        "livebench-math", "livebench-data-analysis",
        "livebench-language", "livebench-if",
    ], ["fallback_livebench.json"]),
]


def build_payload(prev_path: str = OUT_FILE) -> Dict[str, Any]:
    prev = load_prev(prev_path)
    prev_by_id = {}
    if prev and isinstance(prev.get("benchmarks"), list):
        for b in prev["benchmarks"]:
            if b.get("id"):
                prev_by_id[b["id"]] = b

    benchmarks: List[Dict[str, Any]] = []
    sources: List[Dict[str, Any]] = []
    for name, fn, ids, fb in TASKS:
        res = run_one(name, fn, prev_by_id, ids, fb)
        for it in res["items"]:
            benchmarks.append(it)
        sources.append({
            "name": name,
            "ok": res["ok"],
            "error": res["error"],
            "entries": sum(len(i.get("entries") or []) for i in res["items"]),
            "stale": any(i.get("stale") for i in res["items"]),
        })

    if not benchmarks:
        raise RuntimeError("all sources failed & no history")

    return {
        "generatedAt": _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"),
        "sources": sources,
        "benchmarks": benchmarks,
    }


def write_payload(payload: Dict[str, Any], path: str = OUT_FILE) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


# ---------- CLI ----------
def main() -> int:
    try:
        payload = build_payload()
    except Exception as e:
        print("致命错误:", e, file=sys.stderr)
        return 1
    write_payload(payload)
    print("已写入:", OUT_FILE)
    print("生成时间:", payload["generatedAt"])
    print("总基准数:", len(payload["benchmarks"]))
    for s in payload["sources"]:
        tag = "[OK]" if s["ok"] else ("[STALE]" if s["stale"] else "[FAIL]")
        print("  - {} {} ({})".format(tag, s["name"], s["entries"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
