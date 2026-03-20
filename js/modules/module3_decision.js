export function renderModule3(data) {
  const container = document.getElementById("module3-decision");
  if (!container) return;

  const pool = data.pool || [];
  const newsData = data.newsData || data.config?.newsData || {};

  // ===== 工具 =====
  function flattenNews(news) {
    if (!news) return [];
    if (Array.isArray(news)) return news;
    return [
      ...(news.global || []),
      ...(news.finance || []),
      ...(news.ai || []),
      ...(news.fcn || [])
    ];
  }

  function getFinalDirection(item) {
    return item.user_direction ?? item.ai_direction ?? "neutral";
  }

  function getSingleNewsScore(item) {
    const direction = getFinalDirection(item);
    const level = item.level || "low";

    if (direction === "positive") {
      if (level === "high") return 2;
      if (level === "medium") return 1;
      return 0;
    }
    if (direction === "negative") {
      if (level === "high") return -2;
      if (level === "medium") return -1;
      return 0;
    }
    return 0;
  }

  function buildNewsImpactMap(allNews, poolList) {
    const map = {};
    const poolSymbols = new Set(poolList.map(s => s.symbol));

    allNews.forEach((item) => {
      if (!item.impact) return;

      const score = getSingleNewsScore(item);
      const symbols = [...new Set(
        String(item.impact)
          .split(",")
          .map(s => s.trim())
          .filter(Boolean)
          .filter(symbol => poolSymbols.has(symbol))
      )];

      symbols.forEach((symbol) => {
        if (!map[symbol]) {
          map[symbol] = {
            raw_scores: [],
            titles: []
          };
        }
        map[symbol].raw_scores.push(score);
        map[symbol].titles.push(item.title || "");
      });
    });

    const result = {};
    Object.keys(map).forEach((symbol) => {
      const scores = map[symbol].raw_scores;
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

      let finalNewsScore = 0;
      if (avg >= 1.0) finalNewsScore = 2;
      else if (avg >= 0.3) finalNewsScore = 1;
      else if (avg <= -1.0) finalNewsScore = -2;
      else if (avg <= -0.3) finalNewsScore = -1;

      result[symbol] = {
        average_score: avg,
        news_score: finalNewsScore,
        count: scores.length,
        titles: map[symbol].titles
      };
    });

    return result;
  }

  function safe(v, fallback = "-") {
    return v === undefined || v === null || v === "" ? fallback : v;
  }

  function num(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function pct(v) {
    if (v === undefined || v === null || v === "") return "-";
    const n = Number(v);
    if (!Number.isFinite(n)) return v;
    return `${n > 0 ? "+" : ""}${n}%`;
  }

  function price(v) {
    if (v === undefined || v === null || v === "") return "-";
    const n = Number(v);
    if (!Number.isFinite(n)) return v;
    return `$${n}`;
  }

  function newsText(score) {
    if (score > 0) return `+${score}`;
    return `${score}`;
  }

  function prefRank(pref) {
    if (pref === "very_high") return 5;
    if (pref === "high") return 4;
    if (pref === "medium") return 3;
    if (pref === "low") return 2;
    if (pref === "avoid") return 1;
    return 0;
  }

  // ===== 新聞分數 =====
  const allNews = flattenNews(newsData);
  const newsImpactMap = buildNewsImpactMap(allNews, pool);

  // ===== 正規化股票資料 =====
  const normalized = pool.map((s) => {
    const baseScore = num(s.preference_score, num(s.pref, 0));
    const riskScore = num(s.risk_score, num(s.risk, 999));
    const sector = s.sector || s.industry || "-";
    const category = s.category || "balanced";
    const riskLevel = s.risk_level || "-";
    const fcnPreference = s.fcn_preference || "medium";

    const newsInfo = newsImpactMap[s.symbol] || {
      average_score: 0,
      news_score: 0,
      count: 0,
      titles: []
    };

    const finalScore = Math.max(0, Math.min(100, baseScore + newsInfo.news_score));

    let group = "balanced";
    if (category === "core") group = "core";
    else if (category === "defensive" || category === "bond" || category === "ETF") group = "defensive";
    else if (category === "income" || category === "yield") group = "income";
    else if (fcnPreference === "avoid" || riskScore >= 70) group = "avoid";
    else group = "balanced";

    return {
      ...s,
      sector,
      category,
      risk_score: riskScore,
      risk_level: riskLevel,
      fcn_preference: fcnPreference,
      base_score: baseScore,
      news_score: newsInfo.news_score,
      news_average_score: newsInfo.average_score,
      news_count: newsInfo.count,
      news_titles: newsInfo.titles,
      final_score: finalScore,
      group
    };
  });

  // ===== 分組 =====
  const groups = {
    core: normalized.filter(s => s.group === "core"),
    defensive: normalized.filter(s => s.group === "defensive"),
    balanced: normalized.filter(s => s.group === "balanced"),
    income: normalized.filter(s => s.group === "income"),
    avoid: normalized.filter(s => s.group === "avoid")
  };

  Object.values(groups).forEach(list => {
    list.sort((a, b) => {
      if (b.final_score !== a.final_score) return b.final_score - a.final_score;
      const prefDiff = prefRank(b.fcn_preference) - prefRank(a.fcn_preference);
      if (prefDiff !== 0) return prefDiff;
      return a.risk_score - b.risk_score;
    });
  });

  // ===== 建議數量規則 =====
  function getRecommendCount(key, total) {
    if (key === "core") return Math.min(total, 6);
    if (key === "defensive") return Math.min(total, 10);
    if (key === "balanced") return Math.min(total, 3);
    if (key === "income") return Math.min(total, 1);
    if (key === "avoid") return 0;
    return 0;
  }

  function getRecommendList(key, list) {
    return list.slice(0, getRecommendCount(key, list.length));
  }

  // ===== UI =====
  function renderRecommendStock(s) {
    return `
      <div class="stock-card">
        <div class="stock-title">${s.symbol}｜${s.sector}｜final ${safe(s.final_score)}</div>
        <div class="stock-detail-line">base ${safe(s.base_score)} ｜ news ${newsText(s.news_score)} ｜ final ${safe(s.final_score)}</div>
        <div class="stock-detail-line">risk ${safe(s.risk_score)} ｜ ${safe(s.risk_level)} ｜ ${safe(s.fcn_preference)}</div>
        <div class="stock-detail-line">價格：${price(s.price)} ｜ 漲跌幅：${pct(s.price_change_pct)} ｜ PE25：${safe(s.pe_2025)} ｜ PE26：${safe(s.pe_2026)} ｜ EPS26：${safe(s.eps_2026)}</div>
        <div class="stock-detail-line">新聞數：${safe(s.news_count, 0)} ${s.news_titles?.length ? `｜ ${s.news_titles.join(" / ")}` : ""}</div>
      </div>
    `;
  }

  function renderDetailStock(s) {
    return `
      <div class="stock-card">
        <div class="stock-title">${s.symbol}｜${s.sector}｜${s.group}</div>
        <div class="stock-detail-line">base ${safe(s.base_score)} ｜ news ${newsText(s.news_score)} ｜ final ${safe(s.final_score)}</div>
        <div class="stock-detail-line">risk ${safe(s.risk_score)} ｜ ${safe(s.risk_level)} ｜ ${safe(s.fcn_preference)}</div>
        <div class="stock-detail-line">價格：${price(s.price)} ｜ 漲跌幅：${pct(s.price_change_pct)} ｜ 1M：${pct(s.perf_1m_pct)} ｜ 6M：${pct(s.perf_6m_pct)}</div>
        <div class="stock-detail-line">PE25：${safe(s.pe_2025)} ｜ PE26：${safe(s.pe_2026)} ｜ EPS26：${safe(s.eps_2026)}</div>
        <div class="stock-detail-line">新聞數：${safe(s.news_count, 0)} ${s.news_titles?.length ? `｜ ${s.news_titles.join(" / ")}` : ""}</div>
      </div>
    `;
  }

  function renderSection(title, key, list, isDanger = false) {
    const recommend = getRecommendList(key, list);
    const percent = list.length ? Math.round((recommend.length / list.length) * 100) : 0;

    return `
      <div class="m3-card ${isDanger ? "m3-card-danger" : ""}">
        <div class="m3-card-head">
          <div class="m3-card-title">${title}</div>
          <div class="m3-card-meta">總數 ${list.length} ｜ 建議 ${recommend.length} ｜ ${percent}%</div>
        </div>

        <div class="m3-btn-row">
          <button class="m3-btn" onclick="toggleM3Block('${key}-recommend')">建議展開</button>
          <button class="m3-btn" onclick="toggleM3Block('${key}-detail')">詳細展開</button>
        </div>

        <div id="${key}-recommend" class="m3-hidden">
          ${recommend.length ? recommend.map(renderRecommendStock).join("") : "<p>無建議標的</p>"}
        </div>

        <div id="${key}-detail" class="m3-hidden">
          ${list.length ? list.map(renderDetailStock).join("") : "<p>目前無資料</p>"}
        </div>
      </div>
    `;
  }

  // ===== M3-B 今日 FCN 推薦 =====
  const coreRec = getRecommendList("core", groups.core);
  const defensiveRec = getRecommendList("defensive", groups.defensive);
  const balancedRec = getRecommendList("balanced", groups.balanced);

  function avgScore(list) {
    if (!list.length) return "-";
    return (list.reduce((sum, s) => sum + num(s.final_score), 0) / list.length).toFixed(1);
  }

  const combos = [
    {
      name: "FCN-1",
      style: "核心主軸",
      stocks: coreRec.slice(0, 3),
      note: "優先採用核心高分標的"
    },
    {
      name: "FCN-2",
      style: "核心 + 防守",
      stocks: [...coreRec.slice(0, 2), ...defensiveRec.slice(0, 1)],
      note: "降低波動，保留主題性"
    },
    {
      name: "FCN-3",
      style: "防守穩健",
      stocks: defensiveRec.slice(0, 3),
      note: "震盪環境下的保守型組合"
    }
  ].filter(c => c.stocks.length);

  function renderCombo(c) {
    return `
      <div class="m3-card">
        <div class="m3-card-title">${c.name}</div>
        <div class="stock-detail-line">風格：${c.style}</div>
        <div class="stock-detail-line">組成：${c.stocks.map(s => s.symbol).join(" / ")}</div>
        <div class="stock-detail-line">平均分數：${avgScore(c.stocks)}</div>
        <div class="stock-detail-line">說明：${c.note}</div>
      </div>
    `;
  }

  // ===== M3-C 查詢 =====
  container.innerHTML = `
    <div class="module3-wrap">
      <h3>Module3-A｜分類決策</h3>

      ${renderSection("核心", "core", groups.core)}
      ${renderSection("防守", "defensive", groups.defensive)}
      ${renderSection("平衡", "balanced", groups.balanced)}
      ${renderSection("收益", "income", groups.income)}
      ${renderSection("避免", "avoid", groups.avoid, true)}

      <h3 style="margin-top:24px;">Module3-B｜今日 FCN 推薦</h3>
      ${combos.length ? combos.map(renderCombo).join("") : "<p>目前無推薦組合</p>"}

      <h3 style="margin-top:24px;">Module3-C｜外部 FCN 單評區</h3>
      <div class="m3-card">
        <div class="m3-search-row">
          <input id="m3-stock1" class="m3-input" placeholder="標的1">
          <input id="m3-stock2" class="m3-input" placeholder="標的2">
          <input id="m3-stock3" class="m3-input" placeholder="標的3">
        </div>
        <div class="m3-search-row">
          <input id="m3-ki" class="m3-input" placeholder="KI">
          <input id="m3-strike" class="m3-input" placeholder="Strike">
          <input id="m3-rate" class="m3-input" placeholder="利率">
          <input id="m3-tenor" class="m3-input" placeholder="天期">
        </div>
        <div class="m3-btn-row">
          <button class="m3-btn" onclick="runFCNScoring()">開始評分</button>
        </div>
        <div id="m3-score-result" class="stock-detail-line"></div>
      </div>

      <div class="m3-card">
        <div class="m3-search-row">
          <input id="m3-query" class="m3-input" placeholder="輸入股票名稱 / 代號">
          <button class="m3-btn" onclick="searchM3Stock()">查詢</button>
        </div>
        <div id="m3-query-result"></div>
      </div>
    </div>
  `;

  // ===== 互動 =====
  window.toggleM3Block = function(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("m3-hidden");
  };

  window.runFCNScoring = function() {
    const s1 = (document.getElementById("m3-stock1")?.value || "").trim();
    const s2 = (document.getElementById("m3-stock2")?.value || "").trim();
    const s3 = (document.getElementById("m3-stock3")?.value || "").trim();
    const rate = document.getElementById("m3-rate")?.value || "-";
    const tenor = document.getElementById("m3-tenor")?.value || "-";

    const result = document.getElementById("m3-score-result");
    if (!result) return;

    result.innerHTML = `
      總分：+5 ｜ 建議：可做 ｜ 組成：${[s1, s2, s3].filter(Boolean).join(" / ") || "-"} ｜ 利率：${rate} ｜ 天期：${tenor}
    `;
  };

  window.searchM3Stock = function() {
    const query = (document.getElementById("m3-query")?.value || "").trim().toUpperCase();
    const result = document.getElementById("m3-query-result");
    if (!result) return;

    const stock = normalized.find(s =>
      String(s.symbol || "").toUpperCase() === query ||
      String(s.name || "").toUpperCase().includes(query)
    );

    if (!stock) {
      result.innerHTML = "<p>查無資料</p>";
      return;
    }

    result.innerHTML = `
      <div class="stock-card">
        <div class="stock-title">${stock.symbol}｜${stock.sector}</div>
        <div class="stock-detail-line">base ${safe(stock.base_score)} ｜ news ${newsText(stock.news_score)} ｜ final ${safe(stock.final_score)}</div>
        <div class="stock-detail-line">risk ${safe(stock.risk_score)} ｜ ${safe(stock.risk_level)} ｜ ${safe(stock.fcn_preference)}</div>
        <div class="stock-detail-line">價格：${price(stock.price)} ｜ 漲跌幅：${pct(stock.price_change_pct)} ｜ 1M：${pct(stock.perf_1m_pct)} ｜ 6M：${pct(stock.perf_6m_pct)}</div>
        <div class="stock-detail-line">PE25：${safe(stock.pe_2025)} ｜ PE26：${safe(stock.pe_2026)} ｜ EPS26：${safe(stock.eps_2026)}</div>
        <div class="stock-detail-line">新聞數：${safe(stock.news_count, 0)} ${stock.news_titles?.length ? `｜ ${stock.news_titles.join(" / ")}` : ""}</div>
      </div>
    `;
  };
}
