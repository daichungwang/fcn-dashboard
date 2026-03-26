// ===============================
// M1 Event Engine V3 FINAL
// ===============================

// ===== 工具 =====
function toNumber(val, def = 0) {
  const n = Number(val);
  return isNaN(n) ? def : n;
}

function avg(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function round(num) {
  return Math.round(num * 10000) / 10000;
}

// ===== sector → stock mapping =====
function getStocksBySector(sector, sectorMap) {
  return sectorMap[sector] || [];
}

// ===== 累加工具 =====
function addImpact(map, symbol, score, newsId) {
  if (!map[symbol]) {
    map[symbol] = {
      total: 0,
      scores: [],
      news_ids: []
    };
  }

  map[symbol].total += score;
  map[symbol].scores.push(score);

  if (newsId && !map[symbol].news_ids.includes(newsId)) {
    map[symbol].news_ids.push(newsId);
  }
}

// ===============================
// 🔥 1️⃣ Macro Impact（修正版）
// ===============================
function buildMacroImpactMap(news, impactTable, sectorMap, stockSensitivityMap) {
  const result = {};

  const subtype = news.subtype;
  const sid = toNumber(news.sid_score, 0);

  const weightTable = impactTable[subtype] || {};

  const affectedSectors =
    Array.isArray(news.affected_sectors) && news.affected_sectors.length > 0
      ? news.affected_sectors
      : Object.keys(weightTable);

  affectedSectors.forEach((sector) => {
    const sectorWeight = toNumber(weightTable[sector], 0);
    if (sectorWeight === 0) return;

    const stocks = getStocksBySector(sector, sectorMap);

    stocks.forEach((symbol) => {
      // 🔥 加入公司 sensitivity
      const sensitivity =
        stockSensitivityMap?.[symbol]?.[subtype] ?? 1;

      const score = sid * sectorWeight * sensitivity;

      addImpact(result, symbol, score, news.id);
    });
  });

  return result;
}

// ===============================
// 2️⃣ Industry（先保留）
// ===============================
function buildIndustryImpactMap(news) {
  return {};
}

// ===============================
// 3️⃣ Market（先保留）
// ===============================
function buildMarketImpactMap(news) {
  return {};
}

// ===============================
// 🔥 主流程
// ===============================
export function buildNewsRuntime(
  newsList,
  pool,
  impactTable,
  sectorMap,
  stockSensitivityMap
) {
  const macroMap = {};
  const industryMap = {};
  const marketMap = {};

  newsList.forEach((news) => {
    if (!news.is_active) return;

    // ===== Macro =====
    const macro = buildMacroImpactMap(
      news,
      impactTable,
      sectorMap,
      stockSensitivityMap
    );

    Object.keys(macro).forEach((symbol) => {
      addImpact(
        macroMap,
        symbol,
        macro[symbol].total,
        news.id
      );
    });

    // ===== Industry =====
    const industry = buildIndustryImpactMap(news);
    Object.keys(industry).forEach((symbol) => {
      addImpact(industryMap, symbol, industry[symbol].total, news.id);
    });

    // ===== Market =====
    const market = buildMarketImpactMap(news);
    Object.keys(market).forEach((symbol) => {
      addImpact(marketMap, symbol, market[symbol].total, news.id);
    });
  });

  // ===============================
  // 🔥 合併結果
  // ===============================
  const result = [];

  pool.forEach((stock) => {
    const symbol = stock.symbol;

    const macroScores = macroMap[symbol]?.scores || [];
    const industryScores = industryMap[symbol]?.scores || [];
    const marketScores = marketMap[symbol]?.scores || [];

    const macroAvg = round(avg(macroScores));
    const industryAvg = round(avg(industryScores));
    const marketAvg = round(avg(marketScores));

    const eventScore = round(
      macroAvg * 0.5 +
      industryAvg * 0.3 +
      marketAvg * 0.2
    );

    const newsCount =
      (macroMap[symbol]?.news_ids?.length || 0);

    result.push({
      symbol,
      event_score: eventScore,
      macro_avg: macroAvg,
      industry_avg: industryAvg,
      market_avg: marketAvg,
      news_count: newsCount
    });
  });

  // 🔥 排序
  result.sort((a, b) => b.event_score - a.event_score);

  return result;
}
