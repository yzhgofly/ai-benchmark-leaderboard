import json
import os
from datetime import datetime

# 读取 fallback 数据
with open('data/fallback_livebench.json', encoding='utf-8') as f:
    lb = json.load(f)
with open('data/fallback_vellum.json', encoding='utf-8') as f:
    vf = json.load(f)

benchmarks = []

# LiveBench categories -> benchmarks
for cat_key, cat_data in lb.get('categories', {}).items():
    benchmarks.append({
        'id': cat_data['id'],
        'name': cat_data['name'],
        'fullName': cat_data.get('fullName', cat_data['name']),
        'metric': cat_data.get('metric', 'Score'),
        'description': cat_data.get('description', ''),
        'source': cat_data.get('source', 'LiveBench'),
        'sourceUrl': cat_data.get('sourceUrl', 'https://livebench.ai/'),
        'updatedAt': cat_data.get('updatedAt', lb.get('version', '')),
        'entries': cat_data.get('entries', [])
    })

# Vellum categories -> benchmarks
for cat_key, cat_data in vf.get('categories', {}).items():
    benchmarks.append({
        'id': cat_data['id'],
        'name': cat_data['name'],
        'fullName': cat_data.get('fullName', cat_data['name']),
        'metric': cat_data.get('metric', 'Accuracy (%)'),
        'description': cat_data.get('description', ''),
        'source': cat_data.get('source', 'Vellum AI'),
        'sourceUrl': cat_data.get('sourceUrl', 'https://www.vellum.ai/llm-leaderboard'),
        'updatedAt': cat_data.get('updatedAt', vf.get('updatedAt', '')),
        'entries': cat_data.get('entries', [])
    })

payload = {
    'generatedAt': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
    'benchmarks': benchmarks
}

with open('data/benchmarks.json', 'w', encoding='utf-8') as f:
    json.dump(payload, f, ensure_ascii=False, indent=2)

print(f'Generated benchmarks.json with {len(benchmarks)} benchmarks')
