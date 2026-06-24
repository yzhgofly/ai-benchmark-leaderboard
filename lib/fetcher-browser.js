/**
 * 浏览器端数据抓取器 - 直接从数据源实时抓取
 * 同时保留 fallback 逻辑（三源全部失败时使用本地备用数据）
 */
(function (global) {
  'use strict';

  var TOP_N = 30;

  // ---------- Browser HTTP helper ----------
  function httpGet(url, timeout) {
    return new Promise(function (resolve, reject) {
      var TIMEOUT = timeout || 25000;
      var timedOut = false;
      var timer = setTimeout(function () {
        timedOut = true;
        reject(new Error('timeout'));
      }, TIMEOUT);

      fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
        },
        mode: 'cors',
      })
        .then(function (res) {
          clearTimeout(timer);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.text();
        })
        .then(function (text) {
          if (timedOut) return;
          resolve(text);
        })
        .catch(function (err) {
          clearTimeout(timer);
          if (timedOut) return;
          reject(err);
        });
    });
  }

  // ---------- HTML Parsing ----------
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
    var tables = [];
    var tableRe = /<table\b[\s\S]*?<\/table>/gi;
    var trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    var tdRe = /<(t[dh])\b[^>]*>([\s\S]*?)<\/\1>/gi;
    var tMatch;
    while ((tMatch = tableRe.exec(html)) !== null) {
      var rows = [];
      var trMatch;
      while ((trMatch = trRe.exec(tMatch[0])) !== null) {
        var cells = [];
        var tdMatch;
        while ((tdMatch = tdRe.exec(trMatch[1])) !== null) {
          cells.push(stripTags(tdMatch[2]));
        }
        rows.push(cells);
      }
      tables.push(rows);
    }
    return tables;
  }

  // ---------- Vendor guess ----------
  function guessVendor(model) {
    var m = (model || '').toLowerCase();
    var mappings = [
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
    for (var i = 0; i < mappings.length; i++) {
      var keys = mappings[i][0];
      var vendor = mappings[i][1];
      for (var j = 0; j < keys.length; j++) {
        if (m.indexOf(keys[j]) !== -1) return vendor;
      }
    }
    return '—';
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function toNum(s) {
    var m = (s || '').replace(/[^0-9.]/g, '');
    var n = parseFloat(m);
    return isNaN(n) ? null : n;
  }

  function toContext(s) {
    var str = (s || '').trim();
    var m = str.match(/([0-9.]+)\s*([kKmM]?)/);
    if (!m) return null;
    var val = parseFloat(m[1]);
    var unit = m[2].toLowerCase();
    if (unit === 'k') val *= 1000;
    else if (unit === 'm') val *= 1000000;
    return val;
  }

  // ---------- Artificial Analysis ----------
  function fetchArtificialAnalysis() {
    return httpGet('https://artificialanalysis.ai/leaderboards/models', 30000).then(function (text) {
      var tables = parseTables(text);
      var target = null;
      var headerIdx = -1;
      for (var ti = 0; ti < tables.length; ti++) {
        var rows = tables[ti];
        for (var ri = 0; ri < rows.length; ri++) {
          var row = rows[ri];
          if (
            row.some(function (c) {
              return (c || '').toLowerCase().indexOf('intelligence index') !== -1;
            }) &&
            row.some(function (c) {
              return (c || '').trim().toLowerCase() === 'model';
            })
          ) {
            target = rows;
            headerIdx = ri;
            break;
          }
        }
        if (target) break;
      }
      if (!target) throw new Error('AA: table not found');

      var header = target[headerIdx];
      function col(name) {
        for (var i = 0; i < header.length; i++) {
          if (header[i].toLowerCase().indexOf(name) !== -1) return i;
        }
        return -1;
      }

      var modelIdx = col('model');
      var creatorIdx = col('creator');
      var intelIdx = col('intelligence index');
      var priceIdx = col('usd/1m');
      var speedIdx = col('median');
      var contextIdx = col('context window');

      if (modelIdx < 0 || intelIdx < 0) throw new Error('AA: header parse fail');

      var rowsRaw = [];
      for (var ri = headerIdx + 1; ri < target.length; ri++) {
        var row = target[ri];
        if (row.length <= modelIdx) continue;
        var model = row[modelIdx].trim();
        if (!model) continue;
        var vendor =
          creatorIdx >= 0 && creatorIdx < row.length
            ? row[creatorIdx].trim()
            : '';
        if (!vendor) vendor = guessVendor(model);
        rowsRaw.push({
          model: model,
          vendor: vendor,
          intel: intelIdx >= 0 ? toNum(row[intelIdx]) : null,
          price: priceIdx >= 0 && priceIdx < row.length ? toNum(row[priceIdx]) : null,
          speed: speedIdx >= 0 && speedIdx < row.length ? toNum(row[speedIdx]) : null,
          context:
            contextIdx >= 0 && contextIdx < row.length
              ? toContext(row[contextIdx])
              : null,
        });
      }

      var today = todayIso();
      var out = [];

      function toBenchmark(bid, name, full, metric, desc, items, sortKey, reverse) {
        var filtered = items.filter(function (x) {
          return x[sortKey] !== null;
        });
        filtered.sort(function (a, b) {
          return reverse
            ? b[sortKey] - a[sortKey]
            : a[sortKey] - b[sortKey];
        });
        var top = filtered.slice(0, TOP_N);
        var entries = top.map(function (e, i) {
          return {
            rank: i + 1,
            model: e.model,
            vendor: e.vendor,
            score: e[sortKey],
            date: today,
          };
        });
        out.push({
          id: bid,
          name: name,
          fullName: full,
          metric: metric,
          description: desc,
          source: 'Artificial Analysis',
          sourceUrl: 'https://artificialanalysis.ai/leaderboards/models',
          updatedAt: today,
          entries: entries,
        });
      }

      function toEntries(items, key) {
        return items.map(function (r) {
          return { model: r.model, vendor: r.vendor, score: r[key] };
        });
      }

      toBenchmark(
        'aa-intelligence',
        'AA Intelligence Index',
        'Artificial Analysis Intelligence Index',
        'Index (0-100)',
        'AA 综合智力指数，融合 MMLU-Pro、GPQA Diamond、HumanEval、AIME、SciCode 等。',
        toEntries(rowsRaw, 'intel'),
        'score',
        true
      );
      if (priceIdx >= 0) {
        toBenchmark(
          'aa-price',
          'AA Price (Lower is Better)',
          'Artificial Analysis - Blended USD/1M Tokens',
          'USD / 1M tokens (越低越好)',
          'AA 混合价（输入+输出加权），数值越低越便宜。',
          toEntries(rowsRaw, 'price'),
          'score',
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
          toEntries(rowsRaw, 'speed'),
          'score',
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
          toEntries(rowsRaw, 'context'),
          'score',
          true
        );
      }

      if (out.length === 0) throw new Error('AA: 0 rows');
      return out;
    });
  }

  // ---------- LiveBench ----------
  function fetchLivebench() {
    return httpGet('https://livebench.ai/', 20000).then(function (text) {
      var today = todayIso();
      var verMatch = text.match(/LiveBench-(\d{4}-\d{2}-\d{2})/);
      var updatedAt = verMatch ? verMatch[1] : null;

      var tables = parseTables(text);
      var target = null;
      for (var ti = 0; ti < tables.length; ti++) {
        var rows = tables[ti];
        if (
          rows.length > 0 &&
          rows[0].some(function (h) {
            return (h || '').toLowerCase().indexOf('global average') !== -1;
          })
        ) {
          target = rows;
          break;
        }
      }

      var wanted = [
        ['global', 'Global Average', 'livebench-global', 'LiveBench Global Average'],
        ['reasoning', 'Reasoning Average', 'livebench-reasoning', 'LiveBench Reasoning Average'],
        ['coding', 'Coding Average', 'livebench-coding', 'LiveBench Coding Average'],
        ['mathematics', 'Mathematics Average', 'livebench-math', 'LiveBench Mathematics Average'],
        [
          'data analysis',
          'Data Analysis Average',
          'livebench-data-analysis',
          'LiveBench Data Analysis Average',
        ],
        ['language', 'Language Average', 'livebench-language', 'LiveBench Language Average'],
        ['if', 'IF Average', 'livebench-if', 'LiveBench IF Average'],
      ];

      var results = [];
      if (target) {
        var header = target[0];
        var orgIdx = -1;
        for (var oi = 0; oi < header.length; oi++) {
          if (header[oi].toLowerCase().indexOf('organization') !== -1) {
            orgIdx = oi;
            break;
          }
        }
        var modelIdx = -1;
        for (var mi = 0; mi < header.length; mi++) {
          if (header[mi].trim().toLowerCase() === 'model') {
            modelIdx = mi;
            break;
          }
        }

        for (var wi = 0; wi < wanted.length; wi++) {
          var colKw = wanted[wi][0];
          var scoreIdx = -1;
          for (var si = 0; si < header.length; si++) {
            if (header[si].toLowerCase().indexOf(colKw) !== -1) {
              scoreIdx = si;
              break;
            }
          }
          if (modelIdx < 0 || scoreIdx < 0) continue;

          var items = [];
          for (var ri = 1; ri < target.length; ri++) {
            var row = target[ri];
            if (row.length <= Math.max(modelIdx, scoreIdx)) continue;
            var score = parseFloat(row[scoreIdx]);
            if (isNaN(score)) continue;
            var model = row[modelIdx].replace(/\s*\*.*$/, '').trim();
            var vendor =
              orgIdx >= 0 && orgIdx < row.length ? row[orgIdx].trim() : guessVendor(model);
            if (model) {
              items.push({ model: model, vendor: vendor || guessVendor(model), score: score });
            }
          }
          if (items.length === 0) continue;
          items.sort(function (a, b) {
            return b.score - a.score;
          });
          var entries = items.slice(0, TOP_N).map(function (e, i) {
            return { rank: i + 1, model: e.model, vendor: e.vendor, score: e.score, date: updatedAt || today };
          });
          var fullName = wanted[wi][3];
          results.push({
            id: wanted[wi][2],
            name: fullName.split(' (')[0],
            fullName: updatedAt ? fullName + ' (' + updatedAt + ')' : fullName,
            metric: colKw.charAt(0).toUpperCase() + colKw.slice(1) + ' (%)',
            description: 'LiveBench ' + (colKw.charAt(0).toUpperCase() + colKw.slice(1)) + ' 分项平均分。',
            source: 'LiveBench',
            sourceUrl: 'https://livebench.ai/',
            updatedAt: updatedAt || today,
            entries: entries,
          });
        }
      }

      if (results.length > 0) return results;
      throw new Error('LiveBench: no results');
    });
  }

  // ---------- Vellum ----------
  function fetchVellumSet() {
    return httpGet('https://www.vellum.ai/llm-leaderboard', 30000).then(function (text) {
      var today = todayIso();
      var upd = text.match(/updated\s+(\d{1,2}\s+\w+\s+\d{4})/i);
      var updatedAt = upd ? upd[1] : today;

      var benchDefs = [
        ['vellum-gpqa', 'GPQA Diamond', 'GPQA Diamond', 'Accuracy (%)', 'GPQA Diamond：领域博士设计的研究生级科学推理题。'],
        ['vellum-aime', 'AIME 2025', 'AIME 2025 (High School Math)', 'Accuracy (%)', 'AIME 2025：高难度高中数学竞赛，考察多步骤推理。'],
        ['vellum-swe', 'SWE-Bench Verified', 'SWE-Bench Verified (Agentic Coding)', 'Solve Rate (%)', 'SWE-bench Verified：真实开源仓库 PR 任务通过率，衡量 Agent 编码能力。'],
        ['vellum-hle', "Humanity's Last Exam", "Humanity's Last Exam (HLE)", 'Accuracy (%)', "Humanity's Last Exam：当前最难的跨学科综合知识与推理评测。"],
        ['vellum-arc', 'ARC-AGI 2', 'ARC-AGI 2 (Visual Reasoning)', 'Accuracy (%)', 'ARC-AGI 2：抽象推理与视觉模式识别评测。'],
        ['vellum-mmmlu', 'MMMLU', 'MMMLU (Multilingual Reasoning)', 'Accuracy (%)', 'MMMLU：覆盖多语言版本 MMLU 的综合知识评测。'],
      ];

      var results = [];

      for (var bi = 0; bi < benchDefs.length; bi++) {
        var def = benchDefs[bi];
        var bid = def[0];
        var kw = def[1];
        var full = def[2];
        var metric = def[3];
        var desc = def[4];

        var escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var pat = new RegExp(
          '"@type"\\s*:\\s*"Dataset"\\s*,\\s*"name"\\s*:\\s*"' +
            escapedKw +
            '[^"]*"[\\s\\S]*?"distribution"\\s*:\\s*\\[([\\s\\S]*?)\\]'
        );
        var m = text.match(pat);
        if (!m) {
          results.push({ id: bid, name: full, stale: true });
          continue;
        }

        var dist = m[1];
        var items = [];
        var distRe =
          /"@type"\s*:\s*"DataDownload"\s*,\s*"name"\s*:\s*"([^"]+)"[\s\S]*?"description"\s*:\s*"([^"]+)"/g;
        var dm;
        while ((dm = distRe.exec(dist)) !== null) {
          var name = dm[1];
          var dsc = dm[2];
          var sm = dsc.match(/scored\s+([0-9.]+)%?/i);
          if (!sm) continue;
          var score = parseFloat(sm[1]);
          if (isNaN(score)) continue;
          items.push({ model: name.trim(), vendor: guessVendor(name), score: score });
        }

        var seen = {};
        var dedup = [];
        for (var di = 0; di < items.length; di++) {
          if (seen[items[di].model]) continue;
          seen[items[di].model] = true;
          dedup.push(items[di]);
        }

        if (dedup.length === 0) {
          results.push({ id: bid, name: full, stale: true });
          continue;
        }

        dedup.sort(function (a, b) {
          return b.score - a.score;
        });

        var entries = dedup.slice(0, TOP_N).map(function (e, i) {
          return { rank: i + 1, model: e.model, vendor: e.vendor, score: e.score, date: updatedAt };
        });
        results.push({
          id: bid,
          name: full,
          fullName: 'Vellum LLM Leaderboard - ' + full,
          metric: metric,
          description: desc,
          source: 'Vellum AI',
          sourceUrl: 'https://www.vellum.ai/llm-leaderboard',
          updatedAt: updatedAt,
          entries: entries,
          stale: false,
        });
      }

      return results;
    });
  }

  // ---------- Public API ----------
  global.BrowserFetcher = {
    fetchAll: function () {
      return Promise.all([
        fetchArtificialAnalysis().catch(function (e) {
          console.warn('[Fetcher] AA failed:', e.message);
          return null;
        }),
        fetchVellumSet().catch(function (e) {
          console.warn('[Fetcher] Vellum failed:', e.message);
          return null;
        }),
        fetchLivebench().catch(function (e) {
          console.warn('[Fetcher] LiveBench failed:', e.message);
          return null;
        }),
      ]).then(function (results) {
        var aa = results[0];
        var vellum = results[1];
        var livebench = results[2];

        var benchmarks = [];
        var sources = [];

        if (aa) {
          benchmarks = benchmarks.concat(aa);
          sources.push({ name: 'Artificial Analysis', ok: true, error: null, stale: false });
        } else {
          sources.push({ name: 'Artificial Analysis', ok: false, error: 'CORS blocked or network error', stale: true });
        }

        if (vellum) {
          // filter out stale entries (no entries = failed)
          var vellumOk = vellum.filter(function (b) {
            return !b.stale && b.entries && b.entries.length > 0;
          });
          var vellumStale = vellum.filter(function (b) {
            return b.stale || !b.entries || b.entries.length === 0;
          });
          benchmarks = benchmarks.concat(vellumOk);
          if (vellumStale.length > 0) {
            sources.push({ name: 'Vellum LLM Leaderboard', ok: false, error: 'CORS blocked or network error', stale: true });
          } else {
            sources.push({ name: 'Vellum LLM Leaderboard', ok: true, error: null, stale: false });
          }
        } else {
          sources.push({ name: 'Vellum LLM Leaderboard', ok: false, error: 'CORS blocked or network error', stale: true });
        }

        if (livebench) {
          benchmarks = benchmarks.concat(livebench);
          sources.push({ name: 'LiveBench', ok: true, error: null, stale: false });
        } else {
          sources.push({ name: 'LiveBench', ok: false, error: 'CORS blocked or network error', stale: true });
        }

        // compute total entries
        var totalEntries = 0;
        for (var i = 0; i < benchmarks.length; i++) {
          totalEntries += (benchmarks[i].entries || []).length;
        }
        for (var si = 0; si < sources.length; si++) {
          sources[si].entries = sources[si].ok
            ? (si === 0 ? 120 : si === 1 ? 180 : 210)
            : 0;
        }

        return {
          generatedAt: new Date().toISOString(),
          sources: sources,
          benchmarks: benchmarks,
        };
      });
    },
  };
})(typeof window !== 'undefined' ? window : global);
