import { buildNewsRuntime } from "./modules/m1_event_engine.js";

function fmt(n, digits = 4) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "0.0000";
  return num.toFixed(digits);
}

function fmtArr(arr = [], digits = 4) {
  if (!Array.isArray(arr) || arr.length === 0) return "[]";
  return "[" + arr.map((x) => fmt(x, digits)).join(", ") + "]";
}

function avg(arr = []) {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + Number(b || 0), 0) / arr.length;
}

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`載入失敗: ${path}`);
  }
  return await res.json();
}

function render(stockMap, stockPool) {
  const root = document.getElementById("module3");
  if (!root) return;

  const list = stockPool
    .map((stock) => {
      const data = stockMap[stock.symbol] || {
        event_score: 0,
        macro_avg: 0,
        industry_avg: 0,
        market_avg: 0,
        news_count: 0,
        macro_scores: [],
        industry_scores: [],
        market_scores: []
      };

      return {
        symbol: stock.symbol,
        ...data
      };
    })
    .sort((a, b) => b.event_score - a.event_score);

  const summaryHit = list.filter(
    (s) =>
      (s.macro_scores && s.macro_scores.length > 0) ||
      (s.industry_scores && s.industry_scores.length > 0) ||
      (s.market_scores && s.market_scores.length > 0)
  );

  const summaryMiss = list.filter(
    (s) =>
      (!s.macro_scores || s.macro_scores.length === 0) &&
      (!s.industry_scores || s.industry_scores.length === 0) &&
      (!s.market_scores || s.market_scores.length === 0)
  );

  root.innerHTML = "";

  const summary = document.createElement("div");
  summary.className = "card";
  summary.innerHTML = `
    <div class="section-title">📌 測試摘要</div>
    <div>總股票數：${list.length}</div>
    <div>有被新聞打到：${summaryHit.length}</div>
    <div>完全沒被打到：${summaryMiss.length}</div>
    <div style="margin-top:8px;">
      <b>沒被打到的股票：</b><br/>
      ${summaryMiss.map((s) => s.symbol).join(", ")}
    </div>
  `;
  root.appendChild(summary);

  const title = document.createElement("div");
  title.className = "section-title";
  title.style.margin = "0 0 12px 0";
  title.textContent = "📊 30檔股票 Event Score（Debug 模式）";
  root.appendChild(title);

  list.forEach((s, i) => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div style="font-size:22px;font-weight:800;margin-bottom:8px;">#${i + 1} ${s.symbol}</div>
      <div>event_score: ${fmt(s.event_score)}</div>
      <div>macro_avg: ${fmt(s.macro_avg)}</div>
      <div>industry_avg: ${fmt(s.industry_avg)}</div>
      <div>market_avg: ${fmt(s.market_avg)}</div>
      <div>news_count: ${s.news_count}</div>
      <hr style="margin:12px 0;" />
      <div class="mono">macro_scores: ${fmtArr(s.macro_scores)}</div>
      <div class="mono">industry_scores: ${fmtArr(s.industry_scores)}</div>
      <div class="mono">market_scores: ${fmtArr(s.market_scores)}</div>
    `;
    root.appendChild(div);
  });
}

function renderDebugDashboard(stockMap, stockPool) {
  const root = document.getElementById("debug-dashboard");
  if (!root) return;

  const stocks = stockPool.map((stock) => ({
    symbol: stock.symbol,
    sector: stock.sector,
    ...(stockMap[stock.symbol] || {
      event_score: 0,
      macro_avg: 0,
      industry_avg: 0,
      market_avg: 0,
      news_count: 0,
      macro_scores: [],
      industry_scores: [],
      market_scores: []
    })
  }));

  const total = stocks.length;
  const hit = stocks.filter((s) => s.news_count > 0).length;
  const miss = stocks.filter((s) => s.news_count === 0);

  const avgMacro = avg(stocks.map((s) => s.macro_avg));
  const avgIndustry = avg(stocks.map((s) => s.industry_avg));
  const avgMarket = avg(stocks.map((s) => s.market_avg));

  const sorted = [...stocks].sort((a, b) => b.event_score - a.event_score);
  const top5 = sorted.slice(0, 5);
  const bottom5 = [...sorted].slice(-5);

  const sectorGroups = {};
  stocks.forEach((s) => {
    if (!sectorGroups[s.sector]) sectorGroups[s.sector] = [];
    sectorGroups[s.sector].push(s.event_score);
  });

  const sectorHeat = Object.entries(sectorGroups)
    .map(([sector, vals]) => ({
      sector,
      avg: avg(vals)
    }))
    .sort((a, b) => b.avg - a.avg);

  const noMacro = stocks.filter((s) => !s.macro_scores || s.macro_scores.length === 0);
  const noIndustry = stocks.filter((s) => !s.industry_scores || s.industry_scores.length === 0);
  const noMarket = stocks.filter((s) => !s.market_scores || s.market_scores.length === 0);

  root.innerHTML = `
    <div class="card">
      <div class="section-title">🧠 Debug Dashboard</div>

      <div style="margin-bottom:16px;">
        <div class="section-title" style="font-size:18px;">📊 系統健康</div>
        <div>總股票：${total}</div>
        <div>有命中：${hit}</div>
        <div>未命中：${miss.length}</div>
      </div>

      <div style="margin-bottom:16px;">
        <div class="section-title" style="font-size:18px;">🌍 市場狀態</div>
        <div>Macro：${fmt(avgMacro)}</div>
        <div>Industry：${fmt(avgIndustry)}</div>
        <div>Market：${fmt(avgMarket)}</div>
      </div>

      <div style="margin-bottom:16px;">
        <div class="section-title" style="font-size:18px;">🔥 Top 5</div>
        ${top5.map((s) => `<div>${s.symbol} (${fmt(s.event_score)})</div>`).join("")}
      </div>

      <div style="margin-bottom:16px;">
        <div class="section-title" style="font-size:18px;">❄️ Bottom 5</div>
        ${bottom5.map((s) => `<div>${s.symbol} (${fmt(s.event_score)})</div>`).join("")}
      </div>

      <div style="margin-bottom:16px;">
        <div class="section-title" style="font-size:18px;">🏭 Sector 熱度</div>
        ${sectorHeat.map((s) => `<div>${s.sector} (${fmt(s.avg)})</div>`).join("")}
      </div>

      <div>
        <div class="section-title" style="font-size:18px;">⚠️ 異常偵測</div>
        <div class="mono">無 Macro：${noMacro.map((s) => s.symbol).join(", ") || "OK"}</div>
        <div class="mono">無 Industry：${noIndustry.map((s) => s.symbol).join(", ") || "OK"}</div>
        <div class="mono">無 Market：${noMarket.map((s) => s.symbol).join(", ") || "OK"}</div>
      </div>
    </div>
  `;
}

async function main() {
  try {
    const [news, pool, sectorMap, impactTable, marketRuleTable] = await Promise.all([
      loadJSON("./data/news_input.json"),
      loadJSON("./data/pool30.json"),
      loadJSON("./data/sector_map_v1.json"),
      loadJSON("./data/impact_table_v2.json"),
      loadJSON("./data/market_rule_table_v1.json")
    ]);

    const runtime = buildNewsRuntime(
      new Date().toISOString().slice(0, 10),
      news,
      impactTable,
      sectorMap,
      marketRuleTable,
      pool,
      {}
    );

    console.log("🔥 newsRuntime =", runtime);
    console.log("🔥 stock_event_map =", runtime.stock_event_map);

    window.newsRuntime = runtime;
    window.stockEventMap = runtime.stock_event_map;

    render(runtime.stock_event_map, pool);
    renderDebugDashboard(runtime.stock_event_map, pool);
  } catch (err) {
    console.error("❌ 系統錯誤:", err);
    document.body.innerHTML = `
      <div style="margin:20px;padding:16px;border:2px solid red;border-radius:12px;background:#fff;">
        ❌ 系統錯誤：${err.message}
      </div>
    `;
  }
}

main();
