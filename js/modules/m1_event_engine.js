/* ==========================================
   振宇 FCN 系統｜M1 Event Engine V3
   功能：
   1. 讀 news_items
   2. 依 type 產生 impact_map
   3. 彙總成 stock_event_map
   4. 支援 Macro → Sector → Stock sensitivity
========================================== */

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function avg(arr = []) {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  return arr.reduce((sum, x) => sum + toNumber(x, 0), 0) / arr.length;
}

function round(value, digits = 4) {
  return Number(toNumber(value, 0).toFixed(digits));
}

/* ------------------------------------------
   1. 工具：由 sector 找股票
------------------------------------------ */
function getStocksBySector(sector, sectorMap) {
  if (!sector || !sectorMap) return [];
  return Array.isArray(sectorMap[sector]) ? sectorMap[sector] : [];
}

/* ------------------------------------------
   2. 工具：合併 impact_map
------------------------------------------ */
function addImpact(targetMap, symbol, score, newsId) {
  if (!symbol) return;

  if (!targetMap[symbol]) {
    targetMap[symbol] = {
      total: 0,
      news_ids: []
    };
  }

  targetMap[symbol].total += toNumber(score, 0);

  if (newsId && !targetMap[symbol].news_ids.includes(newsId)) {
    targetMap[symbol].news_ids.push(newsId);
  }
}

/* ------------------------------------------
   3. Macro 新聞 → impact_map
   公式：
   sid_score × sector_weight × stock_sensitivity
------------------------------------------ */
function buildMacroImpactMap(news, impactTable, sectorMap, stockSensitivityMap = {}) {
  const result = {};
  const subtype = news.subtype;
  const sid = toNumber(news.sid_score, 0);

  const weightTable = impactTable?.[subtype] || {};

  const affectedSectors =
    Array.isArray(news.affected_sectors) && news.affected_sectors.length > 0
      ? news.affected_sectors
      : Object.keys(weightTable);

  affectedSectors.forEach((sector) => {
    const sectorWeight = toNumber(weightTable[sector], 0);
    if (sectorWeight === 0) return;

    const stocks = getStocksBySector(sector, sectorMap);

    stocks.forEach((symbol) => {
      const sensitivity =
        stockSensitivityMap?.[symbol]?.[subtype] ?? 1;

      const score = sid * sectorWeight * sensitivity;
      addImpact(result, symbol, score, news.id);
    });
  });

  return result;
}

/* ------------------------------------------
   4. Industry 新聞 → impact_map
   公式：industry_score = SID
   sector / subsector 先簡化為 sector
------------------------------------------ */
function buildIndustryImpactMap(news, sectorMap) {
  const result = {};
  const sid = toNumber(news.sid_score, 0);

  const sectors = Array.isArray(news.affected_sectors)
    ? news.affected_sectors
    : [];

  sectors.forEach((sector) => {
    const stocks = getStocksBySector(sector, sectorMap);

    stocks.forEach((symbol) => {
      addImpact(result, symbol, sid, news.id);
    });
  });

  return result;
}

/* ------------------------------------------
   5. Market 新聞 → impact_map
   公式：market_score = SID × category_rule
------------------------------------------ */
function buildMarketImpactMap(news, marketRuleTable, stocks) {
  const result = {};
  const sid = toNumber(news.sid_score, 0);
  const tag = news.subtype;

  const categoryRule = marketRuleTable?.[tag] || {};

  stocks.forEach((stock) => {
    const category = stock.category;
    const symbol = stock.symbol;

    const rule = toNumber(categoryRule[category], 0);
    if (rule === 0) return;

    const score = sid * rule;

    if (!result[symbol]) {
      result[symbol] = { total: 0, news_ids: [] };
    }

    result[symbol].total += score;

    if (!result[symbol].news_ids.includes(news.id)) {
      result[symbol].news_ids.push(news.id);
    }
  });

  return result;
}

/* ------------------------------------------
   6. 單則新聞 → impact_map
------------------------------------------ */
export function buildNewsImpactMap(
  news,
  impactTable,
  sectorMap,
  marketRuleTable,
  stockCategoryMap,
  stockSensitivityMap = {}
) {
  if (!news || news.is_active === false) return {};

  if (news.type === "macro") {
    return buildMacroImpactMap(news, impactTable, sectorMap, stockSensitivityMap);
  }

  if (news.type === "industry") {
    return buildIndustryImpactMap(news, sectorMap);
  }

  if (news.type === "market") {
    return buildMarketImpactMap(news, marketRuleTable, stockCategoryMap);
  }

  return {};
}

/* ------------------------------------------
   7. 多則新聞 → stock_event_map
------------------------------------------ */
export function buildStockEventMap(
  newsItems = [],
  impactTable = {},
  sectorMap = {},
  marketRuleTable = {},
  stockCategoryMap = {},
  stockSensitivityMap = {}
) {
  const stockEventMap = {};

  newsItems.forEach((news) => {
    if (!news || news.is_active === false) return;

    const impactMap = buildNewsImpactMap(
      news,
      impactTable,
      sectorMap,
      marketRuleTable,
      stockCategoryMap,
      stockSensitivityMap
    );

    Object.entries(impactMap).forEach(([symbol, payload]) => {
      const score = toNumber(payload.total, 0);

      if (!stockEventMap[symbol]) {
        stockEventMap[symbol] = {
          macro_scores: [],
          industry_scores: [],
          market_scores: [],
          macro_avg: 0,
          industry_avg: 0,
          market_avg: 0,
          event_raw: 0,
          event_score: 0,
          news_count: 0,
          active_news_ids: []
        };
      }

      if (news.type === "macro") {
        stockEventMap[symbol].macro_scores.push(score);
      } else if (news.type === "industry") {
        stockEventMap[symbol].industry_scores.push(score);
      } else if (news.type === "market") {
        stockEventMap[symbol].market_scores.push(score);
      }

      payload.news_ids.forEach((id) => {
        if (!stockEventMap[symbol].active_news_ids.includes(id)) {
          stockEventMap[symbol].active_news_ids.push(id);
        }
      });
    });
  });

  Object.keys(stockEventMap).forEach((symbol) => {
    const item = stockEventMap[symbol];

    item.macro_avg = round(avg(item.macro_scores));
    item.industry_avg = round(avg(item.industry_scores));
    item.market_avg = round(avg(item.market_scores));

    item.event_raw = round(
      item.macro_avg + item.industry_avg + item.market_avg
    );

    item.event_score = round(
      0.4 * item.macro_avg +
      0.3 * item.industry_avg +
      0.3 * item.market_avg
    );

    item.news_count = item.active_news_ids.length;
  });

  return stockEventMap;
}

/* ------------------------------------------
   8. news_runtime.json 完整輸出
------------------------------------------ */
export function buildNewsRuntime(
  date,
  newsItems = [],
  impactTable = {},
  sectorMap = {},
  marketRuleTable = {},
  stockCategoryMap = {},
  stockSensitivityMap = {}
) {
  const enrichedNewsItems = newsItems.map((news) => {
    const impact_map = buildNewsImpactMap(
      news,
      impactTable,
      sectorMap,
      marketRuleTable,
      stockCategoryMap,
      stockSensitivityMap
    );

    const flatImpactMap = {};
    Object.entries(impact_map).forEach(([symbol, payload]) => {
      flatImpactMap[symbol] = round(payload.total);
    });

    return {
      ...news,
      impact_map: flatImpactMap
    };
  });

  const stock_event_map = buildStockEventMap(
    newsItems,
    impactTable,
    sectorMap,
    marketRuleTable,
    stockCategoryMap,
    stockSensitivityMap
  );

  return {
    date,
    news_items: enrichedNewsItems,
    stock_event_map
  };
}
