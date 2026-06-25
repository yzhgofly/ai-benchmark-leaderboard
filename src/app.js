(function () {
  const state = {
    benchmarks: [],
    activeId: null,
    keyword: "",
    generatedAt: null,
    sources: []
  };

  const els = {
    nav: document.getElementById("benchmarkNav"),
    meta: document.getElementById("benchmarkMeta"),
    tbody: document.getElementById("leaderboardBody"),
    empty: document.getElementById("emptyHint"),
    search: document.getElementById("searchInput"),
    updatedAt: document.getElementById("updatedAt")
  };

  async function loadData() {
    const candidates = [
      { url: "api/leaderboard", type: "api" },
      { url: "data/benchmarks.json", type: "static" }
    ];
    let lastErr = null;
    for (const c of candidates) {
      try {
        const res = await fetch(c.url + "?_=" + Date.now(), {
          cache: "no-cache",
          headers: c.type === "api" ? { "accept": "application/json" } : {}
        });
        if (!res.ok) throw new Error("HTTP " + res.status + " for " + c.url);
        const json = await res.json();
        state.benchmarks = Array.isArray(json.benchmarks) ? json.benchmarks : [];
        state.generatedAt = json.generatedAt || null;
        state.sources = Array.isArray(json.sources) ? json.sources : [];
        state.dataSource = c.type;
        renderHeader();
        if (state.benchmarks.length === 0) {
          renderEmpty("数据为空");
          return;
        }
        state.activeId = state.benchmarks[0].id;
        renderNav();
        renderBenchmark();
        return;
      } catch (err) {
        lastErr = err;
      }
    }
    console.error("加载数据失败:", lastErr);
    renderEmpty("加载数据失败，请刷新重试");
  }

  function renderHeader() {
    if (!els.updatedAt) return;
    if (!state.generatedAt) {
      els.updatedAt.textContent = "";
      return;
    }
    const localized = formatDate(state.generatedAt);
    const okCount = state.sources.filter(s => s.ok).length;
    const total = state.sources.length;
    const failed = state.sources.filter(s => !s.ok && !s.stale).map(s => s.name);
    let text = "🕒 数据生成于 " + localized;
    if (total) text += " · 数据源 " + okCount + "/" + total + " 成功";
    if (failed.length) text += " · 失败: " + failed.join(", ");
    els.updatedAt.textContent = text;
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      const pad = n => String(n).padStart(2, "0");
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
        + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    } catch { return iso; }
  }

  function renderNav() {
    els.nav.innerHTML = "";
    state.benchmarks.forEach(bm => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.id = bm.id;
      btn.className = bm.id === state.activeId ? "active" : "";
      btn.innerHTML =
        '<span>' + escapeHtml(bm.name) + '</span>' +
        '<span class="meta">Top ' + (bm.entries ? bm.entries.length : 0) + '</span>';
      btn.addEventListener("click", () => {
        if (state.activeId === bm.id) return;
        state.activeId = bm.id;
        Array.from(els.nav.children).forEach(c => c.classList.remove("active"));
        btn.classList.add("active");
        renderBenchmark();
      });
      els.nav.appendChild(btn);
    });
  }

  function getActive() {
    return state.benchmarks.find(b => b.id === state.activeId);
  }

  function renderBenchmark() {
    const bm = getActive();
    if (!bm) return;

    els.meta.innerHTML =
      '<div class="bm-title">' +
        '<h2>' + escapeHtml(bm.name) + '</h2>' +
        '<span class="full">' + escapeHtml(bm.fullName || "") + '</span>' +
        '<span class="metric">' + escapeHtml(bm.metric || "Score") + '</span>' +
      '</div>' +
      (bm.description ? '<div class="desc">' + escapeHtml(bm.description) + '</div>' : "") +
      renderSourceLine(bm);

    renderRows();
  }

  function renderRows() {
    const bm = getActive();
    if (!bm) return;

    const entries = (bm.entries || [])
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((e, idx) => Object.assign({}, e, { rank: idx + 1 }));

    const kw = state.keyword.trim().toLowerCase();
    const filtered = kw
      ? entries.filter(e =>
          (e.model || "").toLowerCase().includes(kw) ||
          (e.vendor || "").toLowerCase().includes(kw))
      : entries;

    const maxScore = entries.length ? entries[0].score : 1;

    els.tbody.innerHTML = filtered.map(e => {
      const pct = Math.max(8, Math.min(100, (e.score / maxScore) * 100));
      const cls = "rank-" + e.rank;
      return '<tr class="' + cls + '">' +
        '<td class="col-rank"><span class="rank-badge">' + e.rank + '</span></td>' +
        '<td class="col-model"><strong>' + escapeHtml(e.model || "") + '</strong></td>' +
        '<td class="col-vendor"><span class="vendor-tag">' + escapeHtml(e.vendor || "") + '</span></td>' +
        '<td class="col-score">' +
          '<div class="score-cell">' + formatScore(e.score) + '</div>' +
          '<div class="score-bar"><span style="width:' + pct + '%"></span></div>' +
        '</td>' +
        '<td class="col-date">' + escapeHtml(e.date || "") + '</td>' +
      '</tr>';
    }).join("");

    els.empty.hidden = filtered.length !== 0;
  }

  function renderEmpty(msg) {
    els.meta.innerHTML = '<div class="bm-title"><h2>暂无榜单</h2></div>';
    els.tbody.innerHTML = "";
    els.empty.hidden = false;
    els.empty.textContent = msg || "暂无数据";
  }

  function renderSourceLine(bm) {
    const parts = [];
    if (bm.source) {
      const link = bm.sourceUrl
        ? '<a href="' + escapeHtml(bm.sourceUrl) + '" target="_blank" rel="noopener">' + escapeHtml(bm.source) + '</a>'
        : escapeHtml(bm.source);
      parts.push("数据源: " + link);
    }
    if (bm.updatedAt) parts.push("更新于: " + escapeHtml(bm.updatedAt));
    if (bm.stale) parts.push('<span class="stale">使用缓存</span>');
    if (!parts.length) return "";
    return '<div class="bm-source">' + parts.join(" · ") + '</div>';
  }

  function formatScore(s) {
    if (typeof s !== "number") return String(s);
    return Number.isInteger(s) ? s.toString() : s.toFixed(1);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  els.search.addEventListener("input", e => {
    state.keyword = e.target.value || "";
    renderRows();
  });

  loadData();
})();
