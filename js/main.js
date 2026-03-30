// ==========================================
// FCN SYSTEM MAIN V6.1
// 振宇 FCN 系統｜FCN 卡片完整對齊版
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

  const newsInput = await buildNewsInput(rawNews);
  const safeNewsInput = Array.isArray(newsInput) ? newsInput : [];

  const newsRuntime = buildNewsRuntime(
    new Date().toISOString().slice(0, 10),
    safeNewsInput,
    {},
    {},
    {},
    pool,
    {}
  );

  return newsRuntime;
}

// ==========================================
// Stock Evaluation
// ==========================================
function runStockEvaluation(pool, newsRuntime, marketRuntime = {}) {
  const results = (pool || []).map(stock => {
    const merged = mergeStockData(stock, marketRuntime);
    return evaluateStock(merged, {
      eventImpactMap: newsRuntime?.stock_event_map || {}
    });
  });

  results.sort((a, b) => {
    return toNumber(b?.event_stock_score, 0) - toNumber(a?.event_stock_score, 0);
  });

  return results;
}

// ==========================================
// FCN Evaluation
// ==========================================
function runFCNEvaluation(stockResults = []) {
  const fcnTemplates = [
    {
      id: "FCN_001",
      basket: ["MSFT", "GOOGL", "AMZN"],
      ki: 65,
      strike: 70,
      yield: 14,
      period: 6,
      eki: false
    },
    {
      id: "FCN_002",
      basket: ["NVDA", "TSM", "AVGO"],
      ki: 60,
      strike: 65,
      yield: 16,
      period: 6,
      eki: false
    },
    {
      id: "FCN_003",
      basket: ["AAL", "CCL", "LVS"],
      ki: 55,
      strike: 65,
      yield: 20,
      period: 9,
      eki: false
    },
    {
      id: "FCN_004",
      basket: ["UNH", "COST", "PG"],
      ki: 60,
      strike: 65,
      yield: 12,
      period: 6,
      eki: false
    }
  ];

  const fcnResults = fcnTemplates
    .map(fcn => evaluateFCN(fcn, stockResults))
    .filter(Boolean);

  fcnResults.sort((a, b) => {
    return toNumber(b?.event_fcn, -999) - toNumber(a?.event_fcn, -999);
  });

  return fcnResults;
}

// ==========================================
// UI：Stock Ranking
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
        const delta = toNumber(item?.delta_fcn_pct, 0);

        return `
          <div class="item">
            <div class="item-title">#${idx + 1} ${item?.id || "-"}</div>

            <div class="item-line">Basket: ${item?.basket || "-"}</div>
            <div class="item-line">
              條件：KI ${item?.ki ?? "-"} / Strike ${item?.strike ?? "-"} / Yield ${item?.yield ?? "-"}% / ${item?.period ?? "-"}M / EKI: ${item?.eki ? "YES" : "NO"}
            </div>

            <div class="item-line">Worst-of: ${item?.worst_of || "-"}</div>

            <div class="item-line">
              FCN Score：Pure ${pureFCN.toFixed(2)} / Event ${eventFCN.toFixed(2)} / Δ ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%
            </div>

            <div class="item-line">Suggestion: ${item?.suggestion || "-"}</div>
            <div class="item-line">Reason: ${item?.reason || "-"}</div>

            <div class="item-line">
              Avg Pure Stock: ${toNumber(item?.avgPureStock, 0).toFixed(2)} /
              Avg Event Stock: ${toNumber(item?.avgEventStock, 0).toFixed(2)} /
              SRI: ${toNumber(item?.sri, 0).toFixed(2)} /
              P-risk: ${toNumber(item?.priskScore, 0).toFixed(2)}
            </div>

            <div class="item-line">
              R1（Worst-of）:
              ${item?.r1?.symbol || "-"} → ${item?.r1?.trend_label || "-"}<br>
              ${item?.r1?.trend_note || "-"}
            </div>

            <div class="item-line">
              R2（最佳機會）:
              ${item?.r2?.symbol || "-"} → ${item?.r2?.trend_label || "-"}<br>
              ${item?.r2?.trend_note || "-"}
            </div>

            <div class="item-line">
              R3（整體氣氛）:
              ${item?.r3?.symbol || "-"} → ${item?.r3?.trend_label || "-"}<br>
              ${item?.r3?.trend_note || "-"}
            </div>

            <div class="item-line">
              成分股：
              ${(item?.components || []).map(c => `
                <div style="margin-top:6px;">
                  ${c.symbol}
                  Pure ${toNumber(c.pure_stock_score, 0).toFixed(2)} /
                  Snapshot ${toNumber(c.snapshot_score, 0).toFixed(2)} /
                  Event ${toNumber(c.event_stock_score, 0).toFixed(2)}<br>
                  Snapshot Reason: ${c.snapshot_reason || "-"}<br>
                  Trend: ${c.trend_label || "-"}<br>
                  Trend 說明: ${c.trend_note || "-"}
                </div>
              `).join("")}
            </div>
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
  let pool = await loadJSON("./data/pool30.json");
  const marketRuntime = await loadJSON("./data/market_runtime.json");

  if (!Array.isArray(pool) || pool.length === 0) {
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
      { symbol: "LVS", name: "Las Vegas Sands", sector: "TRAVEL", subsector: "CASINO_TRAVEL", category: "defensive" }
    ];
  }

  const newsRuntime = await runNewsPipeline(pool);
  const stockResults = runStockEvaluation(pool, newsRuntime, marketRuntime || {});
  const fcnResults = runFCNEvaluation(stockResults);

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
