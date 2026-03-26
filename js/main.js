/* ==========================================
   振宇 FCN 系統｜主程式 main.js（V3）
   功能：
   1. 載入資料
   2. 動態調整 sensitivity（市場狀態）
   3. 執行 M1 Event Engine
   4. 顯示 Top 10 股票
========================================== */

import { buildNewsRuntime } from "./modules/m1_event_engine.js";
import { adjustSensitivity } from "./market_regime_adjuster.js";

/* ---------- 工具 ---------- */
async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`載入失敗: ${path}`);
  }
  return await res.json();
}

/* ---------- 主流程 ---------- */
async function main() {
  try {
    // ====== 載入資料 ======
    const [
      newsInput,
      stockPool,
      impactTable,
      sectorMap,
      marketRuleTable
    ] = await Promise.all([
      loadJson("./data/news_input.json"),
      loadJson("./data/pool30.json"),
      loadJson("./data/impact_table_v2.json"),
      loadJson("./data/sector_map_v1.json"),
      loadJson("./data/market_rule_table_v1.json")
    ]);

    // ====== 載入 sensitivity & regime ======
    const baseSensitivity = await loadJson("./data/stock_sensitivity_map_v1.json");
    const regime = await loadJson("./data/market_regime.json");

    // 🔥 動態調整
    const stockSensitivityMap = adjustSensitivity(baseSensitivity, regime);

    // ====== 執行 M1 ======
    const newsRuntime = buildNewsRuntime(
      "2026-03-26",
      newsInput,
      impactTable,
      sectorMap,
      marketRuleTable,
      stockPool,
      stockSensitivityMap   // 🔥 V3 核心
    );

    console.log("🔥 newsRuntime =", newsRuntime);
    console.log("🔥 stock_event_map =", newsRuntime.stock_event_map);

    window.newsRuntime = newsRuntime;
    window.stockEventMap = newsRuntime.stock_event_map;

    // ====== Top 10 股票 ======
    const top10 = Object.entries(newsRuntime.stock_event_map)
      .sort((a, b) => b[1].event_score - a[1].event_score)
      .slice(0, 10);

    // ====== UI ======
    const container = document.createElement("div");
    container.style.marginTop = "20px";
    container.style.padding = "16px";

    const title = document.createElement("h2");
    title.innerText = "🔥 Top 10 市場影響股票（M1 V3）";
    container.appendChild(title);

    top10.forEach(([symbol, data], index) => {
      const div = document.createElement("div");

      div.style.marginBottom = "12px";
      div.style.padding = "12px";
      div.style.border = "1px solid #ddd";
      div.style.borderRadius = "10px";

      div.innerHTML = `
        <b>#${index + 1} ${symbol}</b><br/>
        event_score: ${data.event_score}<br/>
        macro_avg: ${data.macro_avg}<br/>
        industry_avg: ${data.industry_avg}<br/>
        market_avg: ${data.market_avg}<br/>
        news_count: ${data.news_count}
      `;

      container.appendChild(div);
    });

    document.body.appendChild(container);

  } catch (err) {
    console.error("❌ 系統錯誤:", err);
  }
}

main();
