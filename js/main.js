// ==========================================
// FCN SYSTEM MAIN V6
// 振宇 FCN 系統｜畫面完全對齊版
// ==========================================

// M1
import { buildNewsInput } from "./news/build_news_input.js";
import { buildNewsRuntime } from "./modules/m1_event_engine.js";

// Stock Engine
import { mergeStockData, evaluateStock } from "./core/stock_engine.js";

// FCN Engine
import { evaluateFCN } from "./core/fcn_engine.js";

// ==========================================
// 工具
// ==========================================
function toNumber(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

async function loadJSON(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path} load fail: ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error("❌ loadJSON:", path, e);
    return null;
  }
}

// ==========================================
// M1：News Pipeline
// ==========================================
async function runNewsPipeline(pool) {
  let rawNews = await loadJSON("./data/news.json");

  if (!Array.isArray(rawNews) || rawNews.length === 0) {
    console.warn("⚠️ 使用 fallback news");
    rawNews = [
      {
        id: "TEST_1",
        title: "Fed signals first rate cut could come sooner than expected",
        summary: "市場預期降息節奏可能提前。",
        source: "Fallback",
        url: "",
        published_at: new Date().toISOString()
      },
      {
        id: "TEST_2",
        title: "US CPI comes in below expectations, easing inflation concerns",
        summary: "CPI 低於預期，市場風險偏好改善。",
        source: "Fallback",
        url: "",
        published_at: new Date().toISOString()
      }
    ];
  }

  console.log("📰 rawNews:", rawNews);

  const newsInput = await buildNewsInput(rawNews);
  const safeNewsInput = Array.isArray(newsInput) ? newsInput : [];

  console.log("📊 news_input:", safeNewsInput);

  const newsRuntime = buildNewsRuntime(
    new Date().toISOString().slice(0, 10),
    safeNewsInput,
    {},
    {},
    {},
    pool,
    {}
  );

  console.log("🔥 news_runtime:", newsRuntime);

  return newsRuntime;
}

// ==========================================
// Stock Evaluation
// ==========================================
function runStockEvaluation(pool, newsRuntime, marketRuntime = {}) {
  const results = (pool || []).map(stock => {
    const merged = mergeStockData(stock, marketRuntime);
    console.log("🔗 merged:", merged.symbol, merged);

    const result = evaluateStock(merged, {
      eventImpactMap: newsRuntime?.stock_event_map || {}
    });

    console.log("🧪 evaluateStock:", merged.symbol, result);
    return result;
  });

  // 以 Event Stock 排序
  results.sort((a, b) => {
    return toNumber(b?.event_stock_score, 0) - toNumber(a?.event_stock_score, 0);
  });

  return results;
}

// ==========================================
// FCN Evaluation
// 先用模板測試，之後你可改成報價單來源
// ==========================================
function runFCNEvaluation(stockResults = []) {
  const fcnTemplates = [
    {
      id: "FCN_001",
      basket: ["NVDA", "TSM", "AVGO"],
      ki: 60,
      strike: 65,
      yield: 16,
      period: 6,
      eki: false
    },
    {
      id: "FCN_002",
      basket: ["MSFT", "GOOGL", "AMZN"],
      ki: 65,
      strike: 70,
      yield: 14,
      period: 6,
      eki: false
    },
    {
      id: "FCN_003",
      basket: ["UNH", "COST", "PG"],
      ki: 60,
      strike: 65,
      yield: 12,
      period: 6,
      eki: false
    },
    {
      id: "FCN_004",
      basket: ["AAL", "CCL", "LVS"],
      ki: 55,
      strike: 65,
      yield: 20,
      period: 9,
      eki: false
    },
    {
      id: "FCN_005",
      basket: ["SMH", "QQQ", "LQD"],
      ki: 60,
      strike: 65,
      yield: 11,
      period: 6,
      eki: false
    }
  ];

  const fcnResults = fcnTemplates
    .map(fcn => evaluateFCN(fcn, stockResults))
    .filter(Boolean);

  // 以 Total FCN 排序
  fcnResults.sort((a, b) => {
    return toNumber(b?.total_fcn, -999) - toNumber(a?.total_fcn, -999);
  });

  return fcnResults;
}

// ==========================================
// UI：Stock Ranking
// 畫面對齊：Pure / Snapshot / Event Stock
// ==========================================
function renderStockRanking(stockResults = []) {
  const container = document.getElementById("stock-ranking");
  if (!container) return;

  const top10 = stockResults.slice(0, 10);

  container.innerHTML = `
    <div class="card">
      <h2>🧠 Stock Ranking</h2>
      <div class="item-line">總股票數：${stockResults.length}</div>
    </div>

    <div class="card">
      <h2>🔥 Top 10 Stocks</h2>
      ${top10.map((item, idx) => {
        const pure = toNumber(item?.pure_stock_score, 0);
        const snapshot = toNumber(item?.snapshot_score, 0);
        const eventStock = toNumber(item?.event_stock_score, 0);

        return `
          <div class="item">
            <div class="item-title">#${idx + 1} ${item?.symbol || "-"}</div>
            <div class="item-line">Trend: ${item?.trend_label || "-"}</div>
            <div class="item-line">Pure Stock: ${pure.toFixed(2)}</div>
            <div class="item-line">Snapshot: ${snapshot.toFixed(2)}</div>
            <div class="item-line">Event Stock: ${eventStock.toFixed(2)}</div>
            <div class="item-line">Snapshot Bucket: ${item?.snapshot_bucket || "-"}</div>
            <div class="item-line">Snapshot Reason: ${item?.snapshot_reason || "-"}</div>
            <div class="item-line">Suggestion: ${item?.suggestion || "-"}</div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

// ==========================================
// UI：FCN Ranking
// 畫面對齊：Pure FCN / Event FCN / Total FCN
// ==========================================
function renderFCNRanking(fcnResults = []) {
  const container = document.getElementById("fcn-ranking");
  if (!container) return;

  container.innerHTML = `
    <div class="card">
      <h2>💰 FCN Ranking</h2>
      ${fcnResults.map((item, idx) => {
        const pureFCN = toNumber(item?.pure_fcn, 0);
        const eventFCN = toNumber(item?.event_fcn, 0);
        const totalFCN = toNumber(item?.total_fcn, 0);
        const avgPure = toNumber(item?.avgPureStock, 0);
        const avgEvent = toNumber(item?.avgEventStock, 0);

        return `
          <div class="item">
            <div class="item-title">#${idx + 1} FCN_${String(idx + 1).padStart(3, "0")}</div>
            <div class="item-line">Basket: ${item?.basket || "-"}</div>
            <div class="item-line">條件：KI ${item?.ki ?? "-"} / Strike ${item?.strike ?? "-"} / Yield ${item?.yield ?? "-"}% / ${item?.period ?? "-"}M / ${item?.eki ? "EKI" : "NO EKI"}</div>
            <div class="item-line">Avg Pure Stock: ${avgPure.toFixed(2)}</div>
            <div class="item-line">Avg Event Stock: ${avgEvent.toFixed(2)}</div>
            <div class="item-line">Pure FCN: ${pureFCN.toFixed(2)}</div>
            <div class="item-line">Event FCN: ${eventFCN.toFixed(2)}</div>
            <div class="item-line">Total FCN: ${totalFCN.toFixed(2)}</div>
            <div class="item-line">Suggestion: ${item?.suggestion || "-"}</div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

// ==========================================
// MAIN
// ==========================================
async function main() {
  console.log("🚀 FCN SYSTEM START");

  let pool = await loadJSON("./data/pool30.json");
  const marketRuntime = await loadJSON("./data/market_runtime.json");

  if (!Array.isArray(pool) || pool.length === 0) {
    console.warn("⚠️ 使用 fallback pool");
    pool = [
      { symbol: "NVDA", name: "NVIDIA", sector: "AI_SEMI", subsector: "GPU", category: "core" },
      { symbol: "TSM", name: "TSMC", sector: "AI_SEMI", subsector: "FOUNDRY", category: "core" },
      { symbol: "AVGO", name: "Broadcom", sector: "AI_SEMI", subsector: "ASIC", category: "core" },
      { symbol: "MSFT", name: "Microsoft", sector: "PLATFORM", subsector: "SOFTWARE", category: "core" },
      { symbol: "GOOGL", name: "Alphabet", sector: "PLATFORM", subsector: "SEARCH", category: "core" },
      { symbol: "AMZN", name: "Amazon", sector: "PLATFORM", subsector: "CLOUD", category: "core" },
      { symbol: "UNH", name: "UnitedHealth", sector: "HEALTHCARE", subsector: "INSURANCE", category: "defensive" },
      { symbol: "COST", name: "Costco", sector: "CONSUMER", subsector: "RETAIL", category: "defensive" },
      { symbol: "PG", name: "P&G", sector: "CONSUMER", subsector: "STAPLES", category: "defensive" },
      { symbol: "AAL", name: "American Airlines", sector: "TRAVEL", subsector: "AIRLINE", category: "income" },
      { symbol: "CCL", name: "Carnival", sector: "TRAVEL", subsector: "CRUISE", category: "income" },
      { symbol: "LVS", name: "Las Vegas Sands", sector: "TRAVEL", subsector: "CASINO_TRAVEL", category: "defensive" },
      { symbol: "SMH", name: "VanEck Semiconductor ETF", sector: "ETF", subsector: "SEMI_ETF", category: "defensive" },
      { symbol: "QQQ", name: "Invesco QQQ", sector: "ETF", subsector: "TECH_ETF", category: "defensive" },
      { symbol: "LQD", name: "iShares iBoxx IG Corporate Bond ETF", sector: "ETF", subsector: "BOND_ETF", category: "income" }
    ];
  }

  const newsRuntime = await runNewsPipeline(pool);

  const stockResults = runStockEvaluation(pool, newsRuntime, marketRuntime || {});
  console.log("🏆 stockResults:", stockResults);

  const fcnResults = runFCNEvaluation(stockResults);
  console.log("💰 fcnResults:", fcnResults);

  renderStockRanking(stockResults);
  renderFCNRanking(fcnResults);
}

// ==========================================
// 啟動
// ==========================================
main().catch(err => {
  console.error("❌ main fatal:", err);

  const stockContainer = document.getElementById("stock-ranking");
  const fcnContainer = document.getElementById("fcn-ranking");

  if (stockContainer) {
    stockContainer.innerHTML = `
      <div class="error-card">
        <h2>系統發生錯誤</h2>
        <div>${err.message}</div>
      </div>
    `;
  }

  if (fcnContainer) {
    fcnContainer.innerHTML = `
      <div class="error-card">
        <div>Debug Error: ${err.message}</div>
      </div>
    `;
  }
});
