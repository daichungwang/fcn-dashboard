
import { buildNewsRuntime } from "./modules/m1_event_engine.js";
import { fetchNews } from "./news/fetch_news.js";
import { buildNewsInput } from "./news/build_news_input.js";
/* =========================
   工具
========================= */
function fmt(n, d = 4) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(d) : "0.0000";
}

function avg(arr = []) {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + Number(b || 0), 0) / arr.length;
}

function fmtArr(arr = [], d = 4) {
  if (!Array.isArray(arr) || arr.length === 0) return "[]";
  return "[" + arr.map((x) => fmt(x, d)).join(", ") + "]";
}

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`載入失敗: ${path}`);
  }
  return await res.json();
}

/* =========================
   主畫面：30檔股票
========================= */
function render(stockMap, stockPool) {
  const root = document.getElementById("module3") || document.body;
  root.innerHTML = "";

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
        sector: stock.sector,
        subsector: stock.subsector,
        category: stock.category,
        ...data
      };
    })
    .sort((a, b) => b.event_score - a.event_score);

  const summary = document.createElement("div");
  summary.className = "card";
  summary.innerHTML = `
    <div class="section-title">📌 測試摘要</div>
    <div>總股票數：${list.length}</div>
    <div>有被新聞打到：${list.filter(s=>s.news_count>0).length}</div>
    <div>完全沒被打到：${list.filter(s=>s.news_count===0).length}</div>
  `;
  root.appendChild(summary);

  list.forEach((s, i) => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <b>#${i + 1} ${s.symbol}</b><br/>
      sector: ${s.sector}<br/>
      event_score: ${fmt(s.event_score)}<br/>
      macro: ${fmt(s.macro_avg)} |
      industry: ${fmt(s.industry_avg)} |
      market: ${fmt(s.market_avg)}<br/>
      news_count: ${s.news_count}<br/>
      <div class="mono">macro: ${fmtArr(s.macro_scores)}</div>
      <div class="mono">industry: ${fmtArr(s.industry_scores)}</div>
      <div class="mono">market: ${fmtArr(s.market_scores)}</div>
    `;
    root.appendChild(div);
  });
}

/* =========================
   Debug Dashboard V2
========================= */
function renderDebugDashboard(stockMap, stockPool) {
  const root = document.getElementById("debug-dashboard");
  if (!root) return;

  root.innerHTML = "";

  const stocks = stockPool.map((s) => ({
    symbol: s.symbol,
    sector: s.sector,
    ...(stockMap[s.symbol] || {})
  }));

  const avgMacro = avg(stocks.map(s => s.macro_avg));
  const avgIndustry = avg(stocks.map(s => s.industry_avg));
  const avgMarket = avg(stocks.map(s => s.market_avg));

  let regime = "🟡 Neutral";
  if (avgMacro > 1 && avgMarket > 0) regime = "🟢 Risk On";
  if (avgMacro < 0 && avgMarket < 0) regime = "🔴 Risk Off";

  const sorted = [...stocks].sort((a,b)=>b.event_score-a.event_score);
  const top5 = sorted.slice(0,5);
  const bottom5 = sorted.slice(-5);

  const macroHit = stocks.filter(s=>s.macro_scores?.length>0).length;
  const industryHit = stocks.filter(s=>s.industry_scores?.length>0).length;
  const marketHit = stocks.filter(s=>s.market_scores?.length>0).length;

  const sectorMap = {};
  stocks.forEach(s=>{
    if(!sectorMap[s.sector]) sectorMap[s.sector]=[];
    sectorMap[s.sector].push(s.event_score);
  });

  const sectorHeat = Object.entries(sectorMap)
    .map(([k,v])=>({sector:k,avg:avg(v)}))
    .sort((a,b)=>b.avg-a.avg);

  const div = document.createElement("div");
  div.className = "card";

  div.innerHTML = `
    <div class="section-title">🧠 Debug Dashboard V2</div>

    <b>🌍 市場狀態：</b> ${regime}<br/>
    Macro: ${fmt(avgMacro)} |
    Industry: ${fmt(avgIndustry)} |
    Market: ${fmt(avgMarket)}<br/><br/>

    <b>🔥 Top 5</b><br/>
    ${top5.map(s=>`${s.symbol} (${fmt(s.event_score)})`).join("<br/>")}<br/><br/>

    <b>❄️ Bottom 5</b><br/>
    ${bottom5.map(s=>`${s.symbol} (${fmt(s.event_score)})`).join("<br/>")}<br/><br/>

    <b>📊 Coverage</b><br/>
    Macro: ${macroHit}/${stocks.length}<br/>
    Industry: ${industryHit}/${stocks.length}<br/>
    Market: ${marketHit}/${stocks.length}<br/><br/>

    <b>🏭 Sector Heat</b><br/>
    ${sectorHeat.map(s=>`${s.sector} (${fmt(s.avg)})`).join("<br/>")}
  `;

  root.appendChild(div);
}

/* =========================
   主流程
========================= */
async function main() {
  try {
     const raw = await fetchNews();
     console.log("🧪 測試新聞:", raw);

     const aiNewsInput = await buildNewsInput(raw);
     console.log("🤖 AI news_input:", aiNewsInput);
      const [pool, sectorMap, impactTable, marketRuleTable] = await Promise.all([
  loadJSON("./data/pool30.json"),
  loadJSON("./data/sector_map_v1.json"),
  loadJSON("./data/impact_table_v2.json"),
  loadJSON("./data/market_rule_table_v1.json")
]);

// ⭐ 用 AI 取代原本 news_input.json
const news = aiNewsInput;

    const runtime = buildNewsRuntime(
      new Date().toISOString().slice(0, 10),
      news,
      impactTable,
      sectorMap,
      marketRuleTable,
      pool,
      {}
    );

    console.log("🔥 runtime", runtime);

    render(runtime.stock_event_map, pool);
    renderDebugDashboard(runtime.stock_event_map, pool);

  } catch (err) {
    console.error("❌ 系統錯誤:", err);
    document.body.innerHTML = `<div style="color:red;">❌ ${err.message}</div>`;
  }
}

main();
