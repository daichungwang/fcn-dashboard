import { buildMacroStockSignals } from "../core/macro_to_stock_engine.js";

/* =========================
   工具
========================= */
function avg(arr = []) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/* =========================
   主引擎
========================= */
export function buildNewsRuntime(
  date,
  newsInput,
  impactTable,
  sectorMap,
  marketRuleTable,
  pool,
  options = {}
) {
  const stockMap = {};

  // 初始化
  pool.forEach((s) => {
    stockMap[s.symbol] = {
      event_score: 0,
      macro_scores: [],
      industry_scores: [],
      market_scores: [],
      stock_scores: [],
      news_count: 0
    };
  });

  /* =========================
     分類處理
  ========================= */
  const macroNews = newsInput.filter(n => n.type === "macro");
  const industryNews = newsInput.filter(n => n.type === "industry");
  const marketNews = newsInput.filter(n => n.type === "market");
  const stockNews = newsInput.filter(n => n.type === "stock");

  /* =========================
     🧠 Macro → Stock
  ========================= */
  for (const stock of pool) {
    for (const news of macroNews) {
      const score = applyMacroToStock({
        macroEvents: [news],
        stock,
        sensitivityMap: options.sensitivityMap || {},
        macroImpactTable: impactTable
      });

      if (score !== 0) {
        stockMap[stock.symbol].macro_scores.push(score);
      }
    }
  }

  /* =========================
     🏭 Industry
  ========================= */
  for (const news of industryNews) {
    const sectors = news.affected_sectors || [];

    for (const stock of pool) {
      if (sectors.includes(stock.sector)) {
        stockMap[stock.symbol].industry_scores.push(news.sid_score);
      }
    }
  }

  /* =========================
     🌍 Market（Regime）
  ========================= */
  for (const news of marketNews) {
    const rule = marketRuleTable[news.subtype];
    if (!rule) continue;

    for (const stock of pool) {
      const category = stock.category || "core";
      const impact = rule[category] || 0;

      if (impact !== 0) {
        stockMap[stock.symbol].market_scores.push(impact);
      }
    }
  }

  /* =========================
     🧾 Stock News（個股）
  ========================= */
  for (const news of stockNews) {
    const ticker = news.ticker;
    if (!ticker) continue;

    if (stockMap[ticker]) {
      stockMap[ticker].stock_scores.push(news.sid_score);
    }
  }

  /* =========================
     📊 合併分數
  ========================= */
  Object.keys(stockMap).forEach((symbol) => {
    const s = stockMap[symbol];

    const macro_avg = avg(s.macro_scores);
    const industry_avg = avg(s.industry_scores);
    const market_avg = avg(s.market_scores);
    const stock_avg = avg(s.stock_scores);

    const total =
      macro_avg * 0.35 +
      industry_avg * 0.25 +
      market_avg * 0.25 +
      stock_avg * 0.15;

    s.macro_avg = macro_avg;
    s.industry_avg = industry_avg;
    s.market_avg = market_avg;
    s.stock_avg = stock_avg;

    s.event_score = total;

    s.news_count =
      s.macro_scores.length +
      s.industry_scores.length +
      s.market_scores.length +
      s.stock_scores.length;
  });

  return {
    date,
    news_items: newsInput,
    stock_event_map: stockMap
  };
}
