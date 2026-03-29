// ==========================================
// FCN SYSTEM V1 MAIN
// module3 / debug-dashboard version
// ==========================================

// M1
import { buildNewsInput } from "./news/build_news_input.js";
import { buildNewsRuntime } from "./modules/m1_event_engine.js";

// M3.1
import { evaluateStock } from "./core/stock_engine.js";
import { applyMacroToStock } from "./core/macro_to_stock_engine.js";

// M3.2
import { calcFCNPure } from "./core/fcn_engine.js";

// ==========================================
// 工具：讀 JSON
// ==========================================
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
// 工具：安全數字
// ==========================================
function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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
        title: "Fed signals rate cuts coming",
        summary: "Market expects easing",
        source: "Fallback",
        url: "",
        published_at: new Date().toISOString()
      },
      {
        id: "TEST_2",
        title: "AI demand surges for semiconductors",
        summary: "NVDA and TSM benefit from stronger AI demand",
        source: "Fallback",
        url: "",
        published_at: new Date().toISOString()
      }
    ];
  }

  console.log("📰 rawNews:", rawNews);

  // 這裡一定要 await
  const newsInput = await buildNewsInput(rawNews);
  console.log("📊 news_input:", newsInput);

  const safeNewsInput = Array.isArray(newsInput) ? newsInput : [];
  const newsRuntime = buildNewsRuntime(safeNewsInput, pool);
  console.log("🔥 news_runtime:", newsRuntime);

  return newsRuntime;
}

// ==========================================
// M3.1：Stock Evaluation
// ==========================================
function runStockEvaluation(pool, newsRuntime) {
  const results = [];
  const newsItems = Array.isArray(newsRuntime?.news_items)
    ? newsRuntime.news_items
    : [];

  for (const stock of pool) {
    let pureScore = 0;
    let eventScore = 0;

    // 純股票分數
    try {
      const pure = evaluateStock(stock);
      pureScore = toNumber(pure?.score, 0);
    } catch (e) {
      console.warn(`⚠️ evaluateStock fail: ${stock.symbol}`, e);
    }

    // Event 分數
    try {
      for (const news of newsItems) {
        const s = applyMacroToStock({
          macroEvents: [news],
          stock
        });

        if (typeof s === "number") {
          eventScore += s;
        } else if (s && typeof s === "object") {
          eventScore += toNumber(s.total_adjustment, 0);
        }
      }
    } catch (e) {
      console.warn(`⚠️ applyMacroToStock fail: ${stock.symbol}`, e);
    }

    const totalScore = pureScore + eventScore;

    results.push({
      symbol: stock.symbol,
      pure_score: pureScore,
      event_score: eventScore,
      total_score: totalScore
    });
  }

  results.sort((a, b) => b.total_score - a.total_score);
  return results;
}

// ==========================================
// M3.2：FCN 簡易模擬
// ==========================================
function runFCNEvaluation(stockResults) {
  return stockResults.slice(0, 5).map((r, idx) => {
    let fcnScore = 0;

    try {
      const mockDeal = {
        ki: 60,
        strike: 65,
        yield_pa: 16,
        tenor_months: 6,
        basket: [r.symbol]
      };

      const pure = calcFCNPure(mockDeal);
      fcnScore = toNumber(pure?.score, 0);
    } catch (e) {
      console.warn(`⚠️ calcFCNPure fail: ${r.symbol}`, e);
    }

    return {
      rank: idx + 1,
      symbol: r.symbol,
      stock_total_score: r.total_score,
      fcn_pure_score: fcnScore,
      combined_score: r.total_score + fcnScore
    };
  });
}

// ==========================================
// UI：module3 + debug-dashboard
// ==========================================
function renderStockRanking(results, fcnResults) {
  const module3 = document.getElementById("module3");
  const debugDashboard = document.getElementById("debug-dashboard");

  if (module3) {
    const top10 = results.slice(0, 10);

    module3.innerHTML = `
      <div style="background:#fff;border:1px solid #ddd;border-radius:16px;padding:16px;margin-bottom:16px;">
        <h2 style="margin:0 0 12px 0;">🧠 FCN Stock Ranking</h2>
        <div>總股票數：${results.length}</div>
      </div>

      <div style="background:#fff;border:1px solid #ddd;border-radius:16px;padding:16px;margin-bottom:16px;">
        <h2 style="margin:0 0 12px 0;">🔥 Top 10 Stocks</h2>
        ${top10.map((r, i) => `
          <div style="padding:10px 0;border-bottom:${i === top10.length - 1 ? "none" : "1px solid #eee"};">
            <div style="font-weight:700;">#${i + 1} ${r.symbol}</div>
            <div>Pure: ${r.pure_score.toFixed(2)}</div>
            <div>Event: ${r.event_score.toFixed(2)}</div>
            <div>Total: ${r.total_score.toFixed(2)}</div>
          </div>
        `).join("")}
      </div>

      <div style="background:#fff;border:1px solid #ddd;border-radius:16px;padding:16px;margin-bottom:16px;">
        <h2 style="margin:0 0 12px 0;">💵 FCN Suggestion Preview</h2>
        ${fcnResults.map((r, i) => `
          <div style="padding:10px 0;border-bottom:${i === fcnResults.length - 1 ? "none" : "1px solid #eee"};">
            <div style="font-weight:700;">#${r.rank} ${r.symbol}</div>
            <div>Stock Score: ${r.stock_total_score.toFixed(2)}</div>
            <div>FCN Pure Score: ${r.fcn_pure_score.toFixed(2)}</div>
            <div>Combined: ${r.combined_score.toFixed(2)}</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  if (debugDashboard) {
    const top5 = results.slice(0, 5);
    const bottom5 = [...results].slice(-5);

    debugDashboard.innerHTML = `
      <div style="background:#fff;border:1px solid #ddd;border-radius:16px;padding:16px;margin-bottom:16px;">
        <h2 style="margin:0 0 12px 0;">🧠 Debug Dashboard</h2>
        <div><b>Top 5</b></div>
        ${top5.map(r => `<div>${r.symbol} (${r.total_score.toFixed(4)})</div>`).join("")}
        <br/>
        <div><b>Bottom 5</b></div>
        ${bottom5.map(r => `<div>${r.symbol} (${r.total_score.toFixed(4)})</div>`).join("")}
      </div>
    `;
  }
}

// ==========================================
// MAIN
// ==========================================
async function main() {
  console.log("🚀 FCN SYSTEM START");

  let pool = await loadJSON("./data/pool30.json");

  if (!Array.isArray(pool) || pool.length === 0) {
    console.warn("⚠️ 使用 fallback pool");
    pool = [
      { symbol: "NVDA", sector: "AI_SEMI" },
      { symbol: "TSM", sector: "AI_SEMI" },
      { symbol: "AVGO", sector: "AI_SEMI" },
      { symbol: "AMAT", sector: "AI_SEMI" },
      { symbol: "MU", sector: "AI_SEMI" },
      { symbol: "MSFT", sector: "PLATFORM" },
      { symbol: "AMZN", sector: "PLATFORM" },
      { symbol: "GOOG", sector: "PLATFORM" },
      { symbol: "AAL", sector: "TRAVEL" },
      { symbol: "CCL", sector: "TRAVEL" }
    ];
  }

  const newsRuntime = await runNewsPipeline();
  const stockResults = runStockEvaluation(pool, newsRuntime);
  console.log("🏆 stockResults:", stockResults);

  const fcnResults = runFCNEvaluation(stockResults);
  console.log("💵 fcnResults:", fcnResults);

  renderStockRanking(stockResults, fcnResults);
}

// ==========================================
// 啟動
// ==========================================
main().catch(err => {
  console.error("❌ main fatal:", err);

  const module3 = document.getElementById("module3");
  const debugDashboard = document.getElementById("debug-dashboard");

  if (module3) {
    module3.innerHTML = `
      <div style="margin-top:20px;background:#fff;border:1px solid #f1b5b5;border-radius:16px;padding:16px;color:#b00020;">
        <h2 style="margin:0 0 8px 0;">系統發生錯誤</h2>
        <div>${err.message}</div>
      </div>
    `;
  }

  if (debugDashboard) {
    debugDashboard.innerHTML = `
      <div style="margin-top:20px;background:#fff;border:1px solid #f1b5b5;border-radius:16px;padding:16px;color:#b00020;">
        <div>Debug Error: ${err.message}</div>
      </div>
    `;
  }
});
