// ==========================================
// 🚀 FCN SYSTEM V1 MAIN (FINAL FREEZE)
// ==========================================

// M1
import { buildNewsInput } from "./build_news_input.js";
import { buildNewsRuntime } from "./modules/m1_event_engine.js";

// M3
import { evaluateStock } from "./core/stock_engine.js";
import { applyMacroToStock } from "./core/macro_to_stock_engine.js";

// FCN
import { calcFCNPure } from "./core/fcn_engine.js";

// ==========================================
// 🧩 工具：讀 JSON
// ==========================================
async function loadJSON(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(path + " load fail");
    return await res.json();
  } catch (e) {
    console.error("❌ loadJSON:", path, e);
    return null;
  }
}

// ==========================================
// 🧠 Step 1：News Pipeline
// ==========================================
async function runNewsPipeline() {

  // 👉 讀原始新聞（如果沒有就用 mock）
  let rawNews = await loadJSON("./data/news.json");

  if (!rawNews || rawNews.length === 0) {
    console.warn("⚠️ 使用 mock news");

    rawNews = [
      {
        id: "MOCK_1",
        title: "Fed signals rate cuts coming",
        summary: "Market expects easing",
      },
      {
        id: "MOCK_2",
        title: "AI demand surges for semiconductors",
        summary: "NVDA / TSM benefit",
      }
    ];
  }

  console.log("📰 rawNews:", rawNews);

  // 👉 build input
  const newsInput = buildNewsInput(rawNews);
  console.log("📊 news_input:", newsInput);

  // 👉 build runtime
  const newsRuntime = buildNewsRuntime(newsInput);
  console.log("🔥 news_runtime:", newsRuntime);

  return newsRuntime;
}

// ==========================================
// 🧠 Step 2：Stock 評分
// ==========================================
function runStockEvaluation(pool, newsRuntime) {

  const results = [];

  for (const stock of pool) {

    // 1️⃣ 純基本面
    const pure = evaluateStock(stock);

    // 2️⃣ event score
    let eventScore = 0;

    for (const news of newsRuntime.news_items || []) {
      eventScore += applyMacroToStock({
        macroEvents: [news],
        stock
      });
    }

    results.push({
      symbol: stock.symbol,
      pure_score: pure.score || 0,
      event_score: eventScore,
      total_score: (pure.score || 0) + eventScore
    });
  }

  return results.sort((a, b) => b.total_score - a.total_score);
}

// ==========================================
// 🧠 Step 3：UI
// ==========================================
function render(results) {

  const el = document.getElementById("app");

  el.innerHTML = `
    <h2>🧠 FCN Stock Ranking</h2>
    ${results.map((r, i) => `
      <div style="padding:10px;border-bottom:1px solid #ddd">
        #${i + 1} ${r.symbol}<br/>
        Pure: ${r.pure_score.toFixed(2)} |
        Event: ${r.event_score.toFixed(2)} |
        Total: ${r.total_score.toFixed(2)}
      </div>
    `).join("")}
  `;
}

// ==========================================
// 🚀 MAIN
// ==========================================
async function main() {

  console.log("🚀 FCN SYSTEM START");

  // 👉 pool
  let pool = await loadJSON("./data/pool30.json");

  if (!pool) {
    console.warn("⚠️ 使用 mock pool");

    pool = [
      { symbol: "NVDA" },
      { symbol: "TSM" },
      { symbol: "AVGO" },
      { symbol: "AMAT" },
      { symbol: "MU" }
    ];
  }

  // 👉 M1
  const newsRuntime = await runNewsPipeline();

  // 👉 M3
  const results = runStockEvaluation(pool, newsRuntime);

  console.log("🏆 results:", results);

  // 👉 UI
  render(results);
}

// ==========================================
main();
