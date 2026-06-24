const https = require('https');
const fs = require('fs');
const path = require('path');

const TOP_N = 30;
const ROOT = path.resolve(__dirname, '..');
const FALLBACK_DIR = path.join(ROOT, 'data');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function httpGet(url, timeout = 25000, retries = 1) {
  return new Promise((resolve, reject) => {
    const tryOnce = (attempt) => {
      const u = new URL(url);
      const req = https.get(
        {
          hostname: u.hostname,
          port: u.port || 443,
          path: u.pathname + u.search,
          headers: {
            'user-agent': UA,
            accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
            'accept-language': 'en-US,en;q=0.9,zh-CN;q=0.8',
          },
          timeout,
        },
        (res) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(data);
            } else if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              resolve(httpGet(new URL(res.headers.location, url).href, timeout, 0));
            } else {
              reject(new Error(`HTTP ${res.statusCode}`));
            }
          });
        }
      );
      req.on('error', (err) => {
        if (attempt < retries) {
          setTimeout(() => tryOnce(attempt + 1), 500 + attempt * 1000);
        } else {
          reject(err);
        }
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
    };
    tryOnce(0);
  });
}

function stripTags(s) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTables(html) {
  const tables = [];
  const tableRe = /<table\b[\s\S]*?<\/table>/gi;
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRe = /<(t[dh])\b[^>]*>([\s\S]*?)<\/\1>/gi;

  let tMatch;
  while ((tMatch = tableRe.exec(html)) !== null) {
    const rows = [];
    let trMatch;
    while ((trMatch = trRe.exec(tMatch[0])) !== null) {
      const cells = [];
      let tdMatch;
      while ((tdMatch = tdRe.exec(trMatch[1])) !== null) {
        cells.push(stripTags(tdMatch[2]));
      }
      rows.push(cells);
    }
    tables.push(rows);
  }
  return tables;
}

function guessVendor(model) {
  const m = (model || '').toLowerCase();
  const mappings = [
    [['gpt', 'o1', 'o3', 'o4', 'chatgpt', 'codex'], 'OpenAI'],
    [['claude', 'fable', 'mythos', 'opus', 'sonnet', 'haiku'], 'Anthropic'],
    [['gemini', 'gemma', 'nano-banana'], 'Google'],
    [['grok'], 'xAI'],
    [['qwen', 'tongyi', 'dola'], 'Alibaba'],
    [['deepseek'], 'DeepSeek'],
    [['kimi', 'moonshot'], 'Moonshot AI'],
    [['glm', 'chatglm', 'z.ai', 'z ai'], 'Z.AI'],
    [['llama', 'muse-spark', 'meta'], 'Meta'],
    [['mistral', 'mixtral', 'codestral', 'devstral'], 'Mistral'],
    [['ernie', 'wenxin'], 'Baidu'],
    [['hunyuan'], 'Tencent'],
    [['doubao', 'seedance', 'dreamina', 'seed-'], 'ByteDance'],
    [['minimax'], 'MiniMax'],
    [['yi-', 'yi '], '01.AI'],
    [['phi-', 'phi '], 'Microsoft'],
    [['nemotron'], 'NVIDIA'],
    [['mimo', 'xiaomi'], 'Xiaomi'],
    [['step-'], 'StepFun'],
    [['command'], 'Cohere'],
    [['jamba'], 'AI21 Labs'],
    [['falcon'], 'TII'],
    [['dbrx'], 'Databricks'],
    [['reka'], 'Reka'],
    [['nova'], 'Amazon'],
  ];
  for (const [keys, vendor] of mappings) {
    if (keys.some((k) => m.includes(k))) return vendor;
  }
  return '—';
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toNum(s) {
  const m = (s || '').replace(/[^0-9.]/g, '');
  const n = parseFloat(m);
  return isNaN(n) ? null : n;
}

function toContext(s) {
  const str = (s || '').trim();
  const m = str.match(/([0-9.]+)\s*([kKmM]?)/);
  if (!m) return null;
  let val = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === 'k') val *= 1000;
  else if (unit === 'm') val *= 1000000;
  return val;
}

// ---------- Artificial Analysis ----------
async function fetchArtificialAnalysis() {
  const text = await httpGet('https://artificialanalysis.ai/leaderboards/models', 30000);
  const tables = parseTables(text);
  let target = null;
  let headerIdx = -1;
  for (const rows of tables) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (
        row.some((c) => (c || '').toLowerCase().includes('intelligence index')) &&
        row.some((c) => (c || '').trim().toLowerCase() === 'model')
      ) {
        target = rows;
        headerIdx = i;
        break;
      }
    }
    if (target) break;
  }
  if (!target) throw new Error('AA: table not found');

  const header = target[headerIdx];
  function col(name) {
    for (let i = 0; i < header.length; i++) {
      if (header[i].toLowerCase().includes(name)) return i;
    }
    return -1;
  }

  const modelIdx = col('model');
  const creatorIdx = col('creator');
  const intelIdx = col('intelligence index');
  const priceIdx = col('usd/1m');
  const speedIdx = col('median');
  const contextIdx = col('context window');

  if (modelIdx < 0 || intelIdx < 0) throw new Error('AA: header parse fail');

  const rowsRaw = [];
  for (const row of target.slice(headerIdx + 1)) {
    if (row.length <= modelIdx) continue;
    const model = row[modelIdx].trim();
    if (!model) continue;
    const vendor =
      (creatorIdx >= 0 && creatorIdx < row.length ? row[creatorIdx].trim() : '') ||
      guessVendor(model);
    rowsRaw.push({
      model,
      vendor,
      intel: intelIdx >= 0 ? toNum(row[intelIdx]) : null,
      price: priceIdx >= 0 && priceIdx < row.length ? toNum(row[priceIdx]) : null,
      speed: speedIdx >= 0 && speedIdx < row.length ? toNum(row[speedIdx]) : null,
      context:
        contextIdx >= 0 && contextIdx < row.length ? toContext(row[contextIdx]) : null,
    });
  }

  const today = todayIso();
  const out = [];

  function toBenchmark(bid, name, full, metric, desc, items, sortKey, reverse = true) {
    const filtered = items.filter((x) => x[sortKey] !== null);
    filtered.sort((a, b) => (reverse ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]));
    const top = filtered.slice(0, TOP_N);
    const entries = top.map((e, i) => ({
      rank: i + 1,
      model: e.model,
      vendor: e.vendor,
      score: e[sortKey],
      date: today,
    }));
    out.push({
      id: bid,
      name,
      fullName: full,
      metric,
      description: desc,
      source: 'Artificial Analysis',
      sourceUrl: 'https://artificialanalysis.ai/leaderboards/models',
      updatedAt: today,
      entries,
    });
  }

  toBenchmark(
    'aa-intelligence',
    'AA Intelligence Index',
    'Artificial Analysis Intelligence Index',
    'Index (0-100)',
    'AA 综合智力指数，融合 MMLU-Pro、GPQA Diamond、HumanEval、AIME、SciCode 等。',
    rowsRaw,
    'intel',
    true
  );
  if (priceIdx >= 0) {
    toBenchmark(
      'aa-price',
      'AA Price (Lower is Better)',
      'Artificial Analysis - Blended USD/1M Tokens',
      'USD / 1M tokens (越低越好)',
      'AA 混合价（输入+输出加权），数值越低越便宜。',
      rowsRaw,
      'price',
      false
    );
  }
  if (speedIdx >= 0) {
    toBenchmark(
      'aa-speed',
      'AA Output Speed',
      'Artificial Analysis - Median Output Speed',
      'Tokens / second',
      'AA Median 输出速度 (tokens/s)，数值越高越快。',
      rowsRaw,
      'speed',
      true
    );
  }
  if (contextIdx >= 0) {
    toBenchmark(
      'aa-context',
      'AA Context Window',
      'Artificial Analysis - Context Window',
      'Tokens (越大越好)',
      'AA 上下文窗口（最大输入 token 数），数值越大支持的上下文越长。',
      rowsRaw,
      'context',
      true
    );
  }

  if (out.length === 0) throw new Error('AA: 0 rows');
  return out;
}

// ---------- LiveBench ----------
function loadFallbackLivebench() {
  const fbPath = path.join(FALLBACK_DIR, 'fallback_livebench.json');
  if (!fs.existsSync(fbPath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(fbPath, 'utf-8'));
    const out = [];
    const cats = data.categories || {};
    for (const key of Object.keys(cats)) {
      out.push({ ...cats[key], stale: true });
    }
    return out;
  } catch (e) {
    return null;
  }
}

async function fetchLivebench() {
  const today = todayIso();
  let text;
  try {
    text = await httpGet('https://livebench.ai/', 20000);
  } catch (e) {
    const fb = loadFallbackLivebench();
    if (fb) return fb;
    throw e;
  }

  const verMatch = text.match(/LiveBench-(\d{4}-\d{2}-\d{2})/);
  const updatedAt = verMatch ? verMatch[1] : null;

  const tables = parseTables(text);
  let target = null;
  for (const rows of tables) {
    if (rows.length > 0 && rows[0].some((h) => (h || '').toLowerCase().includes('global average'))) {
      target = rows;
      break;
    }
  }

  const wanted = [
    ['global', 'Global Average', 'livebench-global', 'LiveBench Global Average'],
    ['reasoning', 'Reasoning Average', 'livebench-reasoning', 'LiveBench Reasoning Average'],
    ['coding', 'Coding Average', 'livebench-coding', 'LiveBench Coding Average'],
    ['mathematics', 'Mathematics Average', 'livebench-math', 'LiveBench Mathematics Average'],
    ['data analysis', 'Data Analysis Average', 'livebench-data-analysis', 'LiveBench Data Analysis Average'],
    ['language', 'Language Average', 'livebench-language', 'LiveBench Language Average'],
    ['if', 'IF Average', 'livebench-if', 'LiveBench IF Average'],
  ];

  const results = [];
  if (target) {
    const header = target[0];
    const orgIdx = header.findIndex((h) => h.toLowerCase().includes('organization'));
    const modelIdx = header.findIndex((h) => h.trim().toLowerCase() === 'model');

    for (const [colKw, , bid, full] of wanted) {
      const scoreIdx = header.findIndex((h) => h.toLowerCase().includes(colKw));
      if (modelIdx < 0 || scoreIdx < 0) continue;

      const items = [];
      for (const row of target.slice(1)) {
        if (row.length <= Math.max(modelIdx, scoreIdx)) continue;
        const score = parseFloat(row[scoreIdx]);
        if (isNaN(score)) continue;
        const model = row[modelIdx].replace(/\s*\*.*$/, '').trim();
        const vendor =
          orgIdx >= 0 && orgIdx < row.length ? row[orgIdx].trim() : guessVendor(model);
        if (model) {
          items.push({ model, vendor: vendor || guessVendor(model), score });
        }
      }
      if (items.length === 0) continue;
      items.sort((a, b) => b.score - a.score);
      const entries = items.slice(0, TOP_N).map((e, i) => ({
        rank: i + 1,
        ...e,
        date: updatedAt || today,
      }));
      results.push({
        id: bid,
        name: full.split(' (')[0],
        fullName: updatedAt ? `${full} (${updatedAt})` : full,
        metric: colKw.charAt(0).toUpperCase() + colKw.slice(1) + ' (%)',
        description: `LiveBench ${colKw.charAt(0).toUpperCase() + colKw.slice(1)} 分项平均分。`,
        source: 'LiveBench',
        sourceUrl: 'https://livebench.ai/',
        updatedAt: updatedAt || today,
        entries,
      });
    }
    if (results.length > 0) return results;
  }

  const fb = loadFallbackLivebench();
  if (fb) return fb;
  throw new Error('LiveBench: online & fallback both empty');
}

// ---------- Vellum ----------
function loadFallbackVellum() {
  const fbPath = path.join(FALLBACK_DIR, 'fallback_vellum.json');
  if (!fs.existsSync(fbPath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(fbPath, 'utf-8'));
    const out = [];
    const cats = data.categories || {};
    for (const key of Object.keys(cats)) {
      out.push({ ...cats[key], stale: true });
    }
    return out;
  } catch (e) {
    return null;
  }
}

function findFallbackBenchmark(fallbackData, targetId) {
  if (!fallbackData) return null;
  for (const bm of fallbackData) {
    if (bm.id === targetId) return bm;
  }
  return null;
}

async function fetchVellumSet() {
  const today = todayIso();
  let text;
  try {
    text = await httpGet('https://www.vellum.ai/llm-leaderboard', 30000);
  } catch (e) {
    const fb = loadFallbackVellum();
    if (fb) return fb;
    throw e;
  }

  const upd = text.match(/updated\s+(\d{1,2}\s+\w+\s+\d{4})/i);
  const updatedAt = upd ? upd[1] : today;

  const benchDefs = [
    ['vellum-gpqa', 'GPQA Diamond', 'GPQA Diamond', 'Accuracy (%)',
     'GPQA Diamond：领域博士设计的研究生级科学推理题。'],
    ['vellum-aime', 'AIME 2025', 'AIME 2025 (High School Math)', 'Accuracy (%)',
     'AIME 2025：高难度高中数学竞赛，考察多步骤推理。'],
    ['vellum-swe', 'SWE-Bench Verified', 'SWE-Bench Verified (Agentic Coding)', 'Solve Rate (%)',
     'SWE-bench Verified：真实开源仓库 PR 任务通过率，衡量 Agent 编码能力。'],
    ['vellum-hle', "Humanity's Last Exam", "Humanity's Last Exam (HLE)", 'Accuracy (%)',
     "Humanity's Last Exam：当前最难的跨学科综合知识与推理评测。"],
    ['vellum-arc', 'ARC-AGI 2', 'ARC-AGI 2 (Visual Reasoning)', 'Accuracy (%)',
     'ARC-AGI 2：抽象推理与视觉模式识别评测。'],
    ['vellum-mmmlu', 'MMMLU', 'MMMLU (Multilingual Reasoning)', 'Accuracy (%)',
     'MMMLU：覆盖多语言版本 MMLU 的综合知识评测。'],
  ];

  const fbAll = loadFallbackVellum();
  const results = [];

  for (const [bid, kw, full, metric, desc] of benchDefs) {
    const pat = new RegExp(
      '"@type"\\s*:\\s*"Dataset"\\s*,\\s*"name"\\s*:\\s*"' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '[^"]*"[\\s\\S]*?"distribution"\\s*:\\s*\\[([\\s\\S]*?)\\]'
    );
    const m = text.match(pat);
    if (!m) {
      const fbBm = findFallbackBenchmark(fbAll, bid);
      if (fbBm) results.push({ ...fbBm, stale: true });
      continue;
    }
    const dist = m[1];
    const items = [];
    const distRe =
      /"@type"\s*:\s*"DataDownload"\s*,\s*"name"\s*:\s*"([^"]+)"[\s\S]*?"description"\s*:\s*"([^"]+)"/g;
    let dm;
    while ((dm = distRe.exec(dist)) !== null) {
      const name = dm[1];
      const dsc = dm[2];
      const sm = dsc.match(/scored\s+([0-9.]+)%?/i);
      if (!sm) continue;
      const score = parseFloat(sm[1]);
      if (isNaN(score)) continue;
      items.push({ model: name.trim(), vendor: guessVendor(name), score });
    }
    const seen = new Set();
    const dedup = [];
    for (const it of items) {
      if (seen.has(it.model)) continue;
      seen.add(it.model);
      dedup.push(it);
    }
    if (dedup.length === 0) {
      const fbBm = findFallbackBenchmark(fbAll, bid);
      if (fbBm) results.push({ ...fbBm, stale: true });
      continue;
    }
    dedup.sort((a, b) => b.score - a.score);

    // 用 fallback 补到 30 行
    const fbBm = findFallbackBenchmark(fbAll, bid);
    const onlineTop = dedup.map((e) => e.model);
    let merged = [...dedup];
    if (fbBm && fbBm.entries) {
      for (const e of fbBm.entries) {
        if (merged.length >= TOP_N) break;
        if (onlineTop.includes(e.model)) continue;
        merged.push({ model: e.model, vendor: e.vendor, score: e.score });
      }
    }

    const entries = merged.slice(0, TOP_N).map((e, i) => ({
      rank: i + 1,
      model: e.model,
      vendor: e.vendor,
      score: e.score,
      date: updatedAt,
    }));
    results.push({
      id: bid,
      name: full,
      fullName: 'Vellum LLM Leaderboard - ' + full,
      metric,
      description: desc,
      source: 'Vellum AI',
      sourceUrl: 'https://www.vellum.ai/llm-leaderboard',
      updatedAt,
      entries,
    });
  }

  if (results.length === 0) throw new Error('Vellum: 0 results');
  return results;
}

// ---------- Main: build payload ----------
const TASKS = [
  { name: 'Artificial Analysis', fn: fetchArtificialAnalysis, ids: ['aa-intelligence', 'aa-price', 'aa-speed', 'aa-context'] },
  { name: 'Vellum LLM Leaderboard', fn: fetchVellumSet, ids: ['vellum-gpqa', 'vellum-aime', 'vellum-swe', 'vellum-hle', 'vellum-arc', 'vellum-mmmlu'] },
  { name: 'LiveBench', fn: fetchLivebench, ids: ['livebench-global', 'livebench-reasoning', 'livebench-coding', 'livebench-math', 'livebench-data-analysis', 'livebench-language', 'livebench-if'] },
];

function loadPrev() {
  const prevPath = path.join(FALLBACK_DIR, '..', 'data', 'benchmarks.json');
  if (!fs.existsSync(prevPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(prevPath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

async function runOne(task, prevById) {
  let items = [];
  let err = null;
  let ok = false;
  try {
    const result = await task.fn();
    items = Array.isArray(result) ? result : [result];
    ok = true;
  } catch (exc) {
    err = exc.message;
    for (const bid of task.ids) {
      const prev = prevById[bid];
      if (prev) items.push({ ...prev, stale: true });
    }
  }
  return { ok, items, error: err };
}

async function buildPayload() {
  const prev = loadPrev();
  const prevById = {};
  if (prev && Array.isArray(prev.benchmarks)) {
    for (const b of prev.benchmarks) {
      if (b.id) prevById[b.id] = b;
    }
  }

  const benchmarks = [];
  const sources = [];

  for (const task of TASKS) {
    const res = await runOne(task, prevById);
    for (const it of res.items) benchmarks.push(it);
    sources.push({
      name: task.name,
      ok: res.ok,
      error: res.error,
      entries: res.items.reduce((s, i) => s + (i.entries ? i.entries.length : 0), 0),
      stale: res.items.some((i) => i.stale),
    });
  }

  if (benchmarks.length === 0) throw new Error('all sources failed & no history');

  return {
    generatedAt: new Date().toISOString(),
    sources,
    benchmarks,
  };
}

module.exports = { buildPayload };
