/* ==========================================
   振宇 FCN 系統｜M1 Event Engine V4
   定稿版
   邏輯：
   1. Macro   = sid × sector_weight × sensitivity / max_sensitivity
   2. Industry= sid × sector_weight × sensitivity / max_sensitivity
   3. Market  = sid × category_rule
   4. 單則新聞影響上限自然落在 -3 ~ +3
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

function getStocksBySector(sector, sectorMap) {
  if (!sector || !sectorMap) return [];
  return Array.isArray(sectorMap[sector]) ? sectorMap[sector] : [];
}

function addImpact(targetMap, symbol, score, newsId) {
  if (!symbol) return;

  if (!targetMap[symbol]) {
    targetMap[symbol] = {
      total: 0,
      news_ids: [],
      scores: []
    };
  }

  targetMap[symbol].total += toNumber(score, 0);
  targetMap[symbol].scores.push(toNumber(score, 0));

  if (newsId && !targetMap[symbol].news_ids.includes(newsId)) {
    targetMap[symbol].news_ids.push(newsId);
  }
}

function getMaxSensitivity(stockSensitivityMap = {}) {
  let maxVal = 1;

  Object.values(stockSensitivityMap).forEach((factorMap) => {
    if (!factorMap || typeof factorMap !== "object") return;

    Object.values(factorMap).forEach((v) => {
      const n = toNumber(v, 1);
      if (n > maxVal) maxVal = n;
    });
  });

  return maxVal;
}

/* ------------------------------------------
   1. Macro 新聞 → impact_map
   公式：
   score = sid × sector_weight × sensitivity / max_sensitivity
------------------------------------------ */
function buildMacroImpactMap(
  news,
  impactTable,
  sectorMap,
  stockSensitivityMap = {},
  maxSensitivity = 1
) {
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

      const score = sid * sectorWeight * (sensitivity / maxSensitivity);
      addImpact(result, symbol, score, news.id);
    });
  });

  return result;
}

/* ------------------------------------------
   2. Industry 新聞 → impact_map
   公式：
   score = sid × sector_weight × sensitivity / max_sensitivity
   規則：
   - 有 affected_subsectors 時：subsector 優先
   - 沒有 affected_subsectors 時：sector
   - V4 先以 sector_weight = 3 當作基準產業強度
------------------------------------------ */
function buildIndustryImpactMap(
  news,
  stockPool = [],
  stockSensitivityMap = {},
  maxSensitivity = 1
) {
  const result = {};
  const sid = toNumber(news.sid_score, 0);

  const affectedSectors = Array.isArray(news.affected_sectors)
    ? news.affected_sectors
    : [];

  const affectedSubsectors = Array.isArray(news.affected_subsectors)
    ? news.affected_subsectors
    : [];

  const INDUSTRY_BASE_WEIGHT = 3;

  stockPool.forEach((stock) => {
    const sectorMatched = affectedSectors.includes(stock.sector);
    const subsectorMatched =
      affectedSubsectors.length > 0 &&
      affectedSubsectors.includes(stock.subsector);

    if (affectedSubsectors.length > 0) {
      if (!subsectorMatched) return;
    } else {
      if (!sectorMatched) return;
    }

    const subtype = news.subtype;
    const sensitivity =
      stockSensitivityMap?.[stock.symbol]?.[subtype] ?? 1;

    const score =
      sid *
      INDUSTRY_BASE_WEIGHT *
      (sensitivity / maxSensitivity);

    addImpact(result, stock.symbol, score, news.id);
  });

  return result;
}

/* ------------------------------------------
   3. Market 新聞 → impact_map
   公式：
   score = sid × category_rule
------------------------------------------ */
function buildMarketImpactMap(news, marketRuleTable, stockPool = []) {
  const result = {};
  const sid = toNumber(news.sid_score, 0);
  const tag = news.subtype;

  const categoryRule = marketRuleTable?.[tag] || {};

  stockPool.forEach((stock) => {
    const category = stock.category;
    const symbol = stock.symbol;

    const rule = toNumber(categoryRule[category], 0);
    if (rule === 0) return;

    const score = sid * rule;
    addImpact(result, symbol, score, news.id);
  });

  return result;
}

/* ------------------------------------------
   4. 單則新聞 → impact_map
------------------------------------------ */
export function buildNewsImpactMap(
  news,
  impactTable,
  sectorMap,
  marketRuleTable,
  stockPool = [],
  stockSensitivityMap = {},
  maxSensitivity = 1
) {
  if (!news || news.is_active === false) return {};

  if (news.type === "macro") {
    return buildMacroImpactMap(
      news,
      impactTable,
      sectorMap,
      stockSensitivityMap,
      maxSensitivity
    );
  }

  if (news.type === "industry") {
    return buildIndustryImpactMap(
      news,
      stockPool,
      stockSensitivityMap,
      maxSensitivity
    );
  }

  if (news.type === "market") {
    return buildMarketImpactMap(news, marketRuleTable, stockPool);
  }

  return {};
}

/* ------------------------------------------
   5. 多則新聞 → stock_event_map
------------------------------------------ */
export function buildStockEventMap(
  newsItems = [],
  impactTable = {},
  sectorMap = {},
  marketRuleTable = {},
  stockPool = [],
  stockSensitivityMap = {}
) {
  const stockEventMap = {};
  const maxSensitivity = getMaxSensitivity(stockSensitivityMap);

  newsItems.forEach((news) => {
    if (!news || news.is_active === false) return;

    const impactMap = buildNewsImpactMap(
      news,
      impactTable,
      sectorMap,
      marketRuleTable,
      stockPool,
      stockSensitivityMap,
      maxSensitivity
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
      0.5 * item.macro_avg +
      0.3 * item.industry_avg +
      0.2 * item.market_avg
    );

    item.news_count = item.active_news_ids.length;
  });

  return stockEventMap;
}

/* ------------------------------------------
   6. news_runtime.json 完整輸出
------------------------------------------ */
export function buildNewsRuntime(
  date,
  newsItems = [],
  impactTable = {},
  sectorMap = {},
  marketRuleTable = {},
  stockPool = [],
  stockSensitivityMap = {}
) {
  const maxSensitivity = getMaxSensitivity(stockSensitivityMap);

  const enrichedNewsItems = newsItems.map((news) => {
    const impact_map = buildNewsImpactMap(
      news,
      impactTable,
      sectorMap,
      marketRuleTable,
      stockPool,
      stockSensitivityMap,
      maxSensitivity
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
    stockPool,
    stockSensitivityMap
  );

  return {
    date,
    news_items: enrichedNewsItems,
    stock_event_map
  };
}
