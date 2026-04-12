// ==========================================
// M8 Engine VNext FINAL + Anchor-based Yield Proxy
// 振宇 FCN 系統｜M8 定價模型（正式接回 M7 today_score 版）
// 說明：
// 1. 主讀 data/m7/m7_fundamental_data.json 取得 price / ret / swing_days
// 2. 再讀 data/m7/m7_new_stock_today.json 取得 M7 真正的 today_score
// 3. 只有在 M7 today_score 找不到時，才 fallback 用現有欄位推估
// 4. 新增 anchor-based yield proxy：自動找輸入 basket 中 today_score 最高者當 anchor
// ==========================================

async function loadM7Fundamental() {
  const res = await fetch("data/m7/m7_fundamental_data.json");
  if (!res.ok) throw new Error("無法讀取 M7 fundamental 檔案");
  return await res.json();
}

async function loadM7Today() {
  const res = await fetch("data/m7/m7_new_stock_today.json");
  if (!res.ok) throw new Error("無法讀取 M7 today 檔案");
  return await res.json();
}

/**
 * 若不想讓 fallback 參與計算
 * 直接改成 const FALLBACK_STOCKS = {};
 */
const FALLBACK_STOCKS = {
  INTC: {
    symbol: "INTC",
    name: "Intel",
    sector: "AI_SEMI",
    subsector: "CPU",
    risk_level: "中",
    today_score: 40,
    _source: "fallback",
    swing_days: [6.0, 6.4, 6.8, 6.0, 5.8, 5.5]
  }
};

// ------------------------------------------
// 基礎工具
// ------------------------------------------
function toNum(x, def = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}

function round2(x) {
  return Number(toNum(x).toFixed(2));
}

function avg(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + toNum(b), 0) / arr.length;
}

function safeUpper(x) {
  return String(x || "").trim().toUpperCase();
}

// ------------------------------------------
// 資料整合
// ------------------------------------------
function allM7Stocks(m7json) {
  if (Array.isArray(m7json)) return m7json;

  return [
    ...(m7json?.aggressive_recommend || []),
    ...(m7json?.watch_list || []),
    ...(m7json?.remove_list || []),
    ...(m7json?.all || []),
    ...(m7json?.today_highlight_pool || []),
    ...(m7json?.watch_pool || []),
    ...(m7json?.simulation_pool || []),
    ...(m7json?.reject_pool || [])
  ];
}

function getSymbol(stock) {
  return safeUpper(stock?.symbol || stock?.["股號"]);
}

function getName(stock) {
  return String(stock?.name || stock?.["股名"] || getSymbol(stock));
}

function getSector(stock) {
  return String(
    stock?.sector ||
    stock?.["產業"] ||
    stock?.type ||
    stock?.category ||
    "OTHER"
  );
}

function getSubsector(stock) {
  return String(
    stock?.subsector ||
    stock?.["子產業"] ||
    stock?.sub_type ||
    "OTHER"
  );
}

function getRiskLevel(stock) {
  return String(stock?.risk_level || stock?.["風險等級"] || "");
}

function findFundamentalStock(fundamentalJson, symbol) {
  const stocks = allM7Stocks(fundamentalJson);
  return stocks.find(s => getSymbol(s) === safeUpper(symbol)) || null;
}

function findTodayStock(m7TodayJson, symbol) {
  const stocks = allM7Stocks(m7TodayJson);
  return stocks.find(s => getSymbol(s) === safeUpper(symbol)) || null;
}

/**
 * 把 fundamental 與 m7_new_stock_today 合併
 * 規則：
 * - today_score 以 m7_new_stock_today.json 為主
 * - fundamental 提供 ret / swing_days / price 等資料
 */
function mergeStockData(fundamentalStock, todayStock, symbol) {
  if (!fundamentalStock && !todayStock && FALLBACK_STOCKS[symbol]) {
    return FALLBACK_STOCKS[symbol];
  }

  if (!fundamentalStock && !todayStock) {
    throw new Error(`M7 找不到股票: ${symbol}`);
  }

  return {
    ...(fundamentalStock || {}),
    ...(todayStock || {}),
    symbol: safeUpper(symbol),
    _source: todayStock ? "m7_today+fundamental" : "fundamental_only"
  };
}

// ------------------------------------------
// today_score：優先用 m7_new_stock_today.json
// 找不到才 fallback 推估
// ------------------------------------------
function qualityScore(level) {
  const x = String(level || "").trim();
  if (x === "高") return 80;
  if (x === "中") return 65;
  if (x === "低") return 45;
  return 60;
}

function riskPenalty(level) {
  const x = String(level || "").trim();
  if (x === "低") return 0;
  if (x === "中") return -6;
  if (x === "高") return -12;
  return -4;
}

function trendScore(stock) {
  const r1w = toNum(stock?.ret_1w, 0);
  const r1m = toNum(stock?.ret_1m, 0);
  const r3m = toNum(stock?.ret_3m, 0);

  let score = 0;
  score += Math.max(-8, Math.min(8, r1w * 1.2));
  score += Math.max(-8, Math.min(8, r1m * 0.8));
  score += Math.max(-8, Math.min(8, r3m * 0.5));

  return score;
}

function getSwingDays(stock) {
  if (Array.isArray(stock?.swing_days)) return stock.swing_days;
  if (Array.isArray(stock?.recent_swings)) return stock.recent_swings;
  if (Array.isArray(stock?.daily_amplitudes)) return stock.daily_amplitudes;

  const alt = [stock?.d0, stock?.d1, stock?.d2, stock?.d3, stock?.d4, stock?.d5];
  if (alt.some(v => v !== undefined && v !== null && v !== "")) return alt;

  return [0, 0, 0, 0, 0, 0];
}

function volatilityPenalty(stock) {
  const swings = getSwingDays(stock);
  const swingAvg = avg(swings);

  if (swingAvg >= 7) return -12;
  if (swingAvg >= 5) return -8;
  if (swingAvg >= 3.5) return -4;
  return 0;
}

function deriveTodayScore(stock) {
  const base =
    qualityScore(stock?.quality_level || stock?.["品質"] || stock?.["quality"]) +
    riskPenalty(stock?.risk_level || stock?.["風險等級"]) +
    trendScore(stock) +
    volatilityPenalty(stock);

  return Math.max(20, Math.min(95, round2(base)));
}

function getTodayScore(stock) {
  if (stock?.today_score !== undefined && stock?.today_score !== null && stock?.today_score !== "") {
    return toNum(stock.today_score, 0);
  }

  if (stock?.score_today !== undefined && stock?.score_today !== null && stock?.score_today !== "") {
    return toNum(stock.score_today, 0);
  }

  return deriveTodayScore(stock);
}

// ------------------------------------------
// 弱點 / BW / Tail
// ------------------------------------------
function calcWeaknesses(scores) {
  return scores.map(s => 100 - toNum(s)).sort((a, b) => b - a);
}

/**
 * BW = 0.5 * worst + 0.5 * avg
 */
function calcBW(weaknesses) {
  const sorted = [...weaknesses].sort((a, b) => b - a);
  const worst = sorted[0] || 0;
  const avgWeak = avg(weaknesses);
  return 0.5 * worst + 0.5 * avgWeak;
}

/**
 * TailAdj = 0.05 * (worst - avg)
 */
function calcTailAdj(weaknesses) {
  const sorted = [...weaknesses].sort((a, b) => b - a);
  const worst = sorted[0] || 0;
  const avgWeak = avg(weaknesses);
  return 0.05 * (worst - avgWeak);
}

/**
 * BasketPremium = 0.15*BW + 0.0008*BW^2
 */
function calcBasketPremium(BW) {
  return 0.15 * BW + 0.0008 * BW * BW;
}

// ------------------------------------------
// Structure 模組
// ------------------------------------------
function calcKIAdj(KI) {
  KI = toNum(KI);
  return 0.08 * (KI - 55) + 0.0002 * Math.pow(KI - 55, 2);
}

function calcTenorAdj(T) {
  T = toNum(T);
  let x = 0;

  if (T <= 3) {
    x = 0.2 * (T - 1);
  } else if (T <= 9) {
    x = 0.4 + 0.1 * (T - 3) + 0.025 * Math.pow(T - 3, 2);
  } else {
    x = 1.85 + 0.05 * (T - 9);
  }

  return Math.min(2, x);
}

function calcStrikeAdj(strike) {
  strike = toNum(strike);
  return 0.5 + 0.08 * (strike - 55) + 0.001 * Math.pow(strike - 55, 2);
}

function calcTypeAdj(type) {
  const t = String(type || "").toUpperCase();
  if (t === "DACN") return 0.5;
  if (t === "AKI") return 1;
  return 0; // EKI
}

// ------------------------------------------
// Vol 模組
// ------------------------------------------
function calcShortSwing(days) {
  const d = Array.isArray(days) ? days : [];
  const d0 = toNum(d[0], 0);
  const d1 = toNum(d[1], 0);
  const d2 = toNum(d[2], 0);
  const d3 = toNum(d[3], 0);
  const d4 = toNum(d[4], 0);
  const d5 = toNum(d[5], 0);

  return (
    0.35 * d0 +
    0.25 * d1 +
    0.15 * d2 +
    0.10 * d3 +
    0.08 * d4 +
    0.07 * d5
  );
}

function calcBasketVol(swings) {
  const arr = [...swings].map(x => toNum(x)).sort((a, b) => b - a);
  const s1 = arr[0] || 0;
  const s2 = arr[1] || 0;
  const avgSwing = avg(arr);

  return 0.5 * s1 + 0.3 * s2 + 0.2 * avgSwing;
}

function calcVolAdj(basketVol) {
  basketVol = toNum(basketVol);
  let x;

  if (basketVol <= 2.0) {
    x = -0.1 + 0.35 * basketVol;
  } else if (basketVol <= 4.0) {
    const d = basketVol - 2.0;
    x = 0.6 + 0.7 * d + 0.3 * d * d;
  } else if (basketVol <= 6.0) {
    const d = basketVol - 4.0;
    x = 3.2 + 0.85 * d + 0.3 * d * d;
  } else {
    const d = basketVol - 6.0;
    x = 6.4 + 0.45 * d - 0.04 * d * d;
  }

  return Math.max(-0.5, Math.min(10.0, x));
}

// ------------------------------------------
// 高利率減速器
// ------------------------------------------
function calcHighRateBrake(preRate) {
  preRate = toNum(preRate);

  if (preRate <= 18) return 0;
  if (preRate <= 22) return 0.15 * (preRate - 18);
  if (preRate <= 26) return 0.6 + 0.30 * (preRate - 22);
  return 1.8 + 0.45 * (preRate - 26);
}

// ------------------------------------------
// Structure 總和
// ------------------------------------------
function calcStructure(KI, T, strike, type) {
  const kiAdj = calcKIAdj(KI);
  const tenorAdj = calcTenorAdj(T);
  const strikeAdj = calcStrikeAdj(strike);
  const typeAdj = calcTypeAdj(type);

  const raw = kiAdj + tenorAdj + strikeAdj + typeAdj;

  return {
    ki_adj: round2(kiAdj),
    tenor_adj: round2(tenorAdj),
    strike_adj: round2(strikeAdj),
    type_adj: round2(typeAdj),
    structure_total: round2(raw)
  };
}

// ------------------------------------------
// 評價標籤
// ------------------------------------------
function pricingView(diff) {
  if (diff >= 2) return "便宜";
  if (diff >= 0.5) return "略便宜";
  if (diff > -0.5) return "合理";
  if (diff > -2) return "偏貴";
  return "明顯偏貴";
}

// ------------------------------------------
// Blueprint
// ------------------------------------------
export function getM8Blueprint() {
  return {
    version: "M8 VNext FINAL",
    data_source: {
      fundamental: "data/m7/m7_fundamental_data.json",
      m7_today: "data/m7/m7_new_stock_today.json"
    },
    summary: [
      "M8 主讀 m7_fundamental_data.json",
      "today_score 優先讀 m7_new_stock_today.json",
      "只有找不到 today_score 才 fallback 推估",
      "BW = 0.5 × worst + 0.5 × avg",
      "BasketPremium = 0.15×BW + 0.0008×BW²",
      "TailAdj = 0.05 × (worst - avg)",
      "Strike > KI，Strike 為主要風險",
      "Type：EKI=0，DACN=0.5，AKI=1",
      "Tenor：1–3慢、3–10加速、10–12放緩（max=2）",
      "BasketVol = 0.5×s1 + 0.3×s2 + 0.2×avgSwing",
      "VolAdj 採平滑函數",
      "HighRateBrake 用來抑制極端高利率失真",
      "Anchor-based Yield Proxy：以當次輸入最高 today_score 股票當 anchor"
    ],
    formulas: {
      today_score: "優先使用 m7_new_stock_today.json 的 today_score；缺值才 fallback 推估",
      derived_today_score: "today_score(推估) = quality_score + risk_penalty + trend_score + volatility_penalty",
      weaknesses: "weakness = 100 - today_score",
      BW: "BW = 0.5 × worst + 0.5 × avg",
      basket_premium: "BasketPremium = 0.15×BW + 0.0008×BW²",
      tail_adj: "TailAdj = 0.05 × (worst - avg)",
      ki_adj: "KIAdj = 0.08×(KI-55) + 0.0002×(KI-55)^2",
      tenor_adj: "1–3慢、3–9加速、9–12放緩，max=2",
      strike_adj: "StrikeAdj = 0.5 + 0.08×(Strike-55) + 0.001×(Strike-55)^2",
      type_adj: "EKI=0, DACN=0.5, AKI=1",
      short_swing: "ShortSwing = 0.35*d0 + 0.25*d1 + 0.15*d2 + 0.10*d3 + 0.08*d4 + 0.07*d5",
      basket_vol: "BasketVol = 0.5×s1 + 0.3×s2 + 0.2×avgSwing",
      vol_adj: "分段平滑函數",
      brake: "HighRateBrake: 18以下不煞，18~22輕煞，22~26加強，26以上強煞",
      final_yield: "FairYield = Base + BasketPremium + TailAdj + StructureTotal + VolAdj - HighRateBrake(PreRate)",
      anchor_proxy: "anchor + target 的 pair_fair_yield 與 normalized_proxy"
    },
    parameters: {
      base: 6,
      type_map: { EKI: 0, DACN: 0.5, AKI: 1 },
      tenor: {
        short: "1–3 月慢速",
        mid: "3–10 月加速",
        long: "10–12 月放緩",
        max: 2
      },
      today_score_source: "m7_new_stock_today.json 優先，fundamental fallback",
      vol_note: "VolImpact = VolAdj，不再外掛 ResonanceAdj"
    }
  };
}

// ------------------------------------------
// 主函數
// ------------------------------------------
export async function runM8Case({
  caseName,
  symbols,
  KI,
  Strike,
  T,
  type,
  marketYield
}) {
  if (!Array.isArray(symbols) || symbols.length < 2 || symbols.length > 5) {
    throw new Error(`${caseName}: basket 只支援 2~5 檔`);
  }

  const [m7Fundamental, m7Today] = await Promise.all([
    loadM7Fundamental(),
    loadM7Today()
  ]);

  const stocks = symbols.map(sym => {
    const symbol = safeUpper(sym);
    const fundamentalStock = findFundamentalStock(m7Fundamental, symbol);
    const todayStock = findTodayStock(m7Today, symbol);
    return mergeStockData(fundamentalStock, todayStock, symbol);
  });

  const scores = stocks.map(getTodayScore);
  const weaknesses = calcWeaknesses(scores);
  const BW = calcBW(weaknesses);
  const basketPremium = calcBasketPremium(BW);
  const tailAdj = calcTailAdj(weaknesses);

  const structure = calcStructure(KI, T, Strike, type);

  const swingDaysList = stocks.map(getSwingDays);
  const shortSwings = swingDaysList.map(calcShortSwing);
  const basketVol = calcBasketVol(shortSwings);
  const volAdj = calcVolAdj(basketVol);

  const base = 6;

  const preRate =
    base +
    basketPremium +
    structure.structure_total +
    tailAdj +
    volAdj;

  const highRateBrake = calcHighRateBrake(preRate);
  const fairYield = preRate - highRateBrake;
  const delta = toNum(marketYield) - fairYield;

  let note = "";
  if (basketPremium < 7 && delta > 4) {
    note = "Basket 偏低，市場利率偏高";
  } else if (Math.abs(delta) <= 1) {
    note = "接近";
  }

  return {
    case_name: caseName,
    symbols,

    KI: toNum(KI),
    strike: toNum(Strike),
    tenor: toNum(T),
    type,

    stock_sources: stocks.map(s => ({
      symbol: getSymbol(s),
      name: getName(s),
      source: s._source || "m7",
      sector: getSector(s),
      subsector: getSubsector(s),
      risk: getRiskLevel(s),
      today_score: round2(getTodayScore(s))
    })),

    scores: scores.map(round2),
    weaknesses: weaknesses.map(round2),
    BW: round2(BW),
    basket_premium: round2(basketPremium),
    tail_adj: round2(tailAdj),

    short_swing_days: swingDaysList.map(days => days.map(round2)),
    short_swings: shortSwings.map(round2),
    basket_vol: round2(basketVol),
    vol_adj: round2(volAdj),

    market_yield: round2(marketYield),
    base: round2(base),

    ki_adj: structure.ki_adj,
    tenor_adj: structure.tenor_adj,
    strike_adj: structure.strike_adj,
    type_adj: structure.type_adj,
    structure_total: structure.structure_total,

    pre_rate: round2(preRate),
    high_rate_brake: round2(highRateBrake),
    fair_yield: round2(fairYield),
    pricing_delta: round2(delta),
    pricing_view: pricingView(delta),
    note
  };
}

// ------------------------------------------
// Anchor-based Yield Proxy
// 規則：
// 1. 在輸入 symbols 中，找 today_score 最高者當 anchor
// 2. 用 anchor + target 跑 M8
// 3. 產出 pair fair_yield 與 normalized proxy
// ------------------------------------------
export async function runM8AnchorProxy({
  symbols,
  KI,
  Strike,
  T,
  type
}) {
  if (!Array.isArray(symbols) || symbols.length < 2) {
    throw new Error("Anchor Proxy 至少需要 2 檔股票");
  }

  const [m7Fundamental, m7Today] = await Promise.all([
    loadM7Fundamental(),
    loadM7Today()
  ]);

  const cleanedSymbols = [...new Set(symbols.map(safeUpper).filter(Boolean))];

  if (cleanedSymbols.length < 2) {
    throw new Error("有效股票數不足，至少需要 2 檔");
  }

  const enriched = cleanedSymbols.map(symbol => {
    const fundamentalStock = findFundamentalStock(m7Fundamental, symbol);
    const todayStock = findTodayStock(m7Today, symbol);
    const merged = mergeStockData(fundamentalStock, todayStock, symbol);

    return {
      symbol,
      name: getName(merged),
      today_score: round2(getTodayScore(merged)),
      source: merged._source || "m7"
    };
  });

  const sortedByScore = [...enriched].sort((a, b) => b.today_score - a.today_score);
  const anchor = sortedByScore[0];

  if (!anchor) {
    throw new Error("找不到可用 anchor");
  }

  const pairResults = [];

  for (const item of sortedByScore) {
    if (item.symbol === anchor.symbol) continue;

    const pairCase = await runM8Case({
      caseName: `ANCHOR_${anchor.symbol}_${item.symbol}`,
      symbols: [anchor.symbol, item.symbol],
      KI,
      Strike,
      T,
      type,
      marketYield: 0
    });

    pairResults.push({
      anchor_symbol: anchor.symbol,
      target_symbol: item.symbol,
      target_name: item.name,
      target_today_score: item.today_score,
      pair_fair_yield: round2(pairCase.fair_yield),
      pair_basket_vol: round2(pairCase.basket_vol),
      pair_vol_adj: round2(pairCase.vol_adj),
      pair_pricing_view: pairCase.pricing_view || "",
      pair_note: pairCase.note || ""
    });
  }

  const fairYields = pairResults
    .map(x => x.pair_fair_yield)
    .filter(v => Number.isFinite(v) && v > 0);

  const baseYield = fairYields.length ? Math.min(...fairYields) : 1;

  const normalized = pairResults.map(x => ({
    ...x,
    proxy_value: round2(x.pair_fair_yield),
    normalized_proxy: round2(x.pair_fair_yield / baseYield)
  }));

  return {
    mode: "anchor_based_yield_proxy",
    anchor_symbol: anchor.symbol,
    anchor_name: anchor.name,
    anchor_today_score: anchor.today_score,
    KI: toNum(KI),
    strike: toNum(Strike),
    tenor: toNum(T),
    type,
    universe: sortedByScore,
    base_yield_for_normalization: round2(baseYield),
    proxies: normalized.sort((a, b) => b.proxy_value - a.proxy_value)
  };
}
