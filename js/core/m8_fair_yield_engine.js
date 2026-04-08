async function loadM7() {
  const res = await fetch("data/m7/m7_new_stock_today.json");
  if (!res.ok) {
    throw new Error("無法讀取 M7 檔案: data/m7/m7_new_stock_today.json");
  }
  return await res.json();
}

/**
 * Fallback 股票資料
 * 用途：
 * 1. M7 當天沒有這檔，但你要先做 M8 測試
 * 2. 特別是 INTC 目前不在 M7 today json 裡
 *
 * 說明：
 * - today_score：先給測試用分數
 * - price / eps_now / eps_next：給 PE / Stress 計算
 * - 產業 / 子產業：給 Corr 用
 */
const FALLBACK_STOCKS = {
  INTC: {
    "股號": "INTC",
    "股名": "Intel",
    "產業": "AI_SEMI",
    "子產業": "CPU",
    "風險等級": "中",
    "today_score": 62,
    "price": 52,
    "eps_now": 0.9,
    "eps_next": 1.1,
    "_source": "fallback"
  }
};

function normalizeSymbols(symbols) {
  return symbols
    .map(s => String(s || "").trim().toUpperCase())
    .filter(s => s !== "");
}

function allM7Stocks(m7json) {
  return [
    ...(m7json.aggressive_recommend || []),
    ...(m7json.watch_list || []),
    ...(m7json.remove_list || []),
    ...(m7json.all || [])
  ];
}

function findStock(m7json, symbol) {
  const stock = allM7Stocks(m7json).find(
    s => String(s["股號"] || "").toUpperCase() === symbol
  );

  if (stock) {
    return {
      ...stock,
      _source: "m7"
    };
  }

  if (FALLBACK_STOCKS[symbol]) {
    return FALLBACK_STOCKS[symbol];
  }

  throw new Error(`M7 找不到股票: ${symbol}`);
}

function getTodayScore(stock) {
  return Number(stock.today_score || 0);
}

function getSector(stock) {
  return String(stock["產業"] || "OTHER");
}

function getSubsector(stock) {
  return String(stock["子產業"] || "OTHER");
}

function getRiskLevel(stock) {
  return String(stock["風險等級"] || "");
}

/**
 * 取價格
 * M7 目前常見欄位是 股價
 * fallback 用 price
 */
function getPrice(stock) {
  return Number(
    stock["股價"] ??
    stock["price"] ??
    0
  );
}

/**
 * 取 EPS
 * 如果 M7 沒有 eps_now / eps_next
 * 就先用 fallback 或保底值
 */
function getEPSNow(stock) {
  return Number(
    stock["eps_now"] ??
    stock["EPS_now"] ??
    1
  );
}

function getEPSNext(stock) {
  return Number(
    stock["eps_next"] ??
    stock["EPS_next"] ??
    1
  );
}

/**
 * EPS blended
 * 0.4 * now + 0.6 * next
 */
function getBlendedEPS(stock) {
  const epsNow = getEPSNow(stock);
  const epsNext = getEPSNext(stock);
  return 0.4 * epsNow + 0.6 * epsNext;
}

/**
 * Forward-like PE
 */
function getPE(stock) {
  const price = getPrice(stock);
  const epsBlend = getBlendedEPS(stock);

  if (!Number.isFinite(price) || price <= 0) return 999;
  if (!Number.isFinite(epsBlend) || epsBlend <= 0) return 999;

  return price / epsBlend;
}

/**
 * Sigmoid stress
 * Stress = 1 / (1 + e^(-0.08*(PE-35)))
 * EPS<=0 or invalid => 1
 */
function sigmoidPE(pe) {
  if (!Number.isFinite(pe) || pe <= 0 || pe >= 999) return 1;
  return 1 / (1 + Math.exp(-0.08 * (pe - 35)));
}

/**
 * BW
 * 2~5 檔
 */
function calcBW(scores) {
  const weaknesses = scores.map(s => 100 - s).sort((a, b) => b - a);
  const n = weaknesses.length;
  const avg = weaknesses.reduce((a, b) => a + b, 0) / n;

  if (n === 2) return 0.7 * weaknesses[0] + 0.3 * avg;
  if (n === 3) return 0.6 * weaknesses[0] + 0.4 * avg;
  if (n === 4) return 0.5 * weaknesses[0] + 0.3 * weaknesses[1] + 0.2 * avg;
  if (n === 5) return 0.45 * weaknesses[0] + 0.3 * weaknesses[1] + 0.15 * weaknesses[2] + 0.1 * avg;

  throw new Error("FCN basket 只支援 2~5 檔");
}

function calcWeaknesses(scores) {
  return scores.map(s => 100 - s).sort((a, b) => b - a);
}

/**
 * GAP
 * Gap = Strike - KI
 * 0 => 允許，+0.5
 * 0<gap<10 => invalid
 * 10~13 => 0
 * >13 => 曲線上升
 * >=25 => invalid
 */
function calcGapAdj(gap) {
  if (gap === 0) return 0.5;

  if (gap > 0 && gap < 10) {
    throw new Error(`Gap=${gap} 不合法`);
  }

  if (gap >= 25) {
    throw new Error(`Gap=${gap} 不合法`);
  }

  if (gap >= 10 && gap <= 13) {
    return 0;
  }

  const x = gap - 13;
  return Math.min(3.5, 0.25 * x + 0.015 * x * x);
}

function calcKIAdj(KI) {
  return 0.18 * (KI - 65) + 0.006 * Math.pow(KI - 65, 2);
}

function calcTenorAdj(T) {
  return Math.min(4, Math.max(-1, 0.22 * (T - 6) + 0.018 * Math.pow(T - 6, 2)));
}

function calcStrikeAdj(strike, T) {
  const ideal = 74 - 2 * T;
  const d = strike - ideal;
  return Math.min(2.5, Math.max(-1, 0.12 * d + 0.01 * d * d));
}

function calcTypeAdj(type) {
  if (type === "DACN") return 1;
  if (type === "EKI") return -1;
  return 0; // AKI
}

/**
 * Cluster = 高 stress 股票數量平方
 * 高 stress 門檻 > 0.7
 */
function calcCluster(stresses) {
  const highStressCount = stresses.filter(x => x > 0.7).length;
  return Math.pow(highStressCount, 2);
}

/**
 * Corr 最終版
 * sector + theme + valuation 共振
 */
function calcCorr(stocks, stresses) {
  const N = stocks.length;

  // sector concentration
  const sectorCount = {};
  for (const stock of stocks) {
    const sec = getSector(stock);
    sectorCount[sec] = (sectorCount[sec] || 0) + 1;
  }
  const maxSector = Math.max(...Object.values(sectorCount));
  const sectorScore = maxSector / N;

  // theme concentration
  // AI / 半導體 / platform / growth narrative 視為同風格群
  const themeMatchCount = stocks.filter(stock => {
    const sector = getSector(stock).toUpperCase();
    const subsector = getSubsector(stock).toUpperCase();

    return (
      sector.includes("AI") ||
      sector.includes("SEMI") ||
      sector.includes("PLATFORM") ||
      subsector.includes("AI") ||
      subsector.includes("GPU") ||
      subsector.includes("CPU") ||
      subsector.includes("FOUNDRY") ||
      subsector.includes("ASIC") ||
      subsector.includes("CLOUD") ||
      subsector.includes("IP")
    );
  }).length;
  const themeScore = themeMatchCount / N;

  // valuation correlation
  const highStressCount = stresses.filter(x => x > 0.7).length;
  const valCorr = highStressCount / N;

  const corrIndex =
    0.4 * sectorScore +
    0.3 * themeScore +
    0.3 * valCorr;

  const corrAdj = 0.5 + 2 * Math.pow(corrIndex, 2);

  return {
    corr_index: Number(corrIndex.toFixed(4)),
    corr_adj: Number(corrAdj.toFixed(4)),
    sector_score: Number(sectorScore.toFixed(4)),
    theme_score: Number(themeScore.toFixed(4)),
    valuation_corr: Number(valCorr.toFixed(4))
  };
}

function pricingView(diff) {
  if (diff >= 2) return "便宜";
  if (diff >= 0.5) return "略便宜";
  if (diff > -0.5) return "合理";
  if (diff > -2) return "偏貴";
  return "明顯偏貴";
}

async function runM8(symbols, KI, strike, T, type, marketYield = null) {
  const cleanSymbols = normalizeSymbols(symbols);

  if (cleanSymbols.length < 2 || cleanSymbols.length > 5) {
    throw new Error("FCN basket 只支援 2~5 檔");
  }

  const m7 = await loadM7();

  const stocks = cleanSymbols.map(sym => findStock(m7, sym));
  const scores = stocks.map(getTodayScore);
  const weaknesses = calcWeaknesses(scores);

  const BW = calcBW(scores);

  // stress
  const peList = stocks.map(stock => getPE(stock));
  const stresses = peList.map(pe => sigmoidPE(pe));

  const avgStress = stresses.reduce((a, b) => a + b, 0) / stresses.length;
  const worstStress = Math.max(...stresses);
  const Stress = 0.6 * worstStress + 0.4 * avgStress;

  // cluster
  const cluster = calcCluster(stresses);

  // basket premium
  const basketPremium =
    0.15 * BW +
    0.004 * Stress * Math.pow(BW, 2) +
    0.6 * cluster;

  // structure
  const gap = strike - KI;
  const KIAdj = calcKIAdj(KI);
  const gapAdj = calcGapAdj(gap);
  const tenorAdj = calcTenorAdj(T);
  const strikeAdj = calcStrikeAdj(strike, T);
  const typeAdj = calcTypeAdj(type);

  // corr
  const corr = calcCorr(stocks, stresses);

  const fairYield =
    6 +
    basketPremium +
    KIAdj +
    gapAdj +
    tenorAdj +
    corr.corr_adj +
    strikeAdj +
    typeAdj;

  const result = {
    symbols: cleanSymbols,
    stock_count: cleanSymbols.length,
    stock_sources: stocks.map(s => ({
      symbol: s["股號"],
      source: s._source || "m7"
    })),

    scores: scores.map(x => Number(x.toFixed ? x.toFixed(2) : x)),
    weaknesses: weaknesses.map(x => Number(x.toFixed ? x.toFixed(2) : x)),
    BW: Number(BW.toFixed(2)),

    pe_list: peList.map(x => Number(x.toFixed(2))),
    stresses: stresses.map(x => Number(x.toFixed(4))),
    Stress: Number(Stress.toFixed(4)),
    cluster,

    basket_premium: Number(basketPremium.toFixed(2)),
    ki_adj: Number(KIAdj.toFixed(2)),
    gap_adj: Number(gapAdj.toFixed(2)),
    tenor_adj: Number(tenorAdj.toFixed(2)),
    strike_adj: Number(strikeAdj.toFixed(2)),
    type_adj: Number(typeAdj.toFixed(2)),

    corr_index: corr.corr_index,
    corr_adj: Number(corr.corr_adj.toFixed(2)),
    corr_breakdown: {
      sector_score: corr.sector_score,
      theme_score: corr.theme_score,
      valuation_corr: corr.valuation_corr
    },

    fair_yield: Number(fairYield.toFixed(2)),
    valid: true
  };

  if (marketYield !== null && Number.isFinite(marketYield)) {
    const diff = marketYield - fairYield;
    result.market_yield = Number(marketYield.toFixed(2));
    result.pricing_delta = Number(diff.toFixed(2));
    result.pricing_view = pricingView(diff);
  }

  return result;
}
