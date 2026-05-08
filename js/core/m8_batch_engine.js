// ==========================================
// M8 Engine VNext FINAL v2 + Rate Pressure + Anchor-based Yield Proxy
// 振宇 FCN 系統｜M8 定價模型（市場化 Fair Yield 版）
// 說明：
// 1. 主讀 data/m7_sandbox/m7_v2_scores.json 取得 M7_v2 score（品質主來源）
// 2. 兼容 data/m7/m7_fundamental_data.json 取得 ret / swing_days / price 等 runtime 欄位
// 3. 兼容 data/m7/m7_new_stock_today.json 作 fallback
// 4. 新增 data/options/option_runtime.json：rate_pressure_score / IV / skew / demand
// 5. 修正 Type：EKI < AKI < DACN
// 6. 新增市場化 BW / Tail / Strike / KI / Tenor / Brake 公式
// 7. Anchor-based Yield Proxy：以當次輸入最高 M7_v2 品質股票當 anchor
// Proprietary System - All Rights Reserved
// Unauthorized copying or commercial use is prohibited
// All rights reserved by Gaya.Wang
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

async function loadM7V2() {
  const paths = [
    "data/m7_sandbox/m7_v2_scores.json",
    "data/m7_v2_scores.json"
  ];

  for (const path of paths) {
    try {
      const res = await fetch(path);
      if (res.ok) return await res.json();
    } catch (err) {
      // try next path
    }
  }

  throw new Error("無法讀取 M7 v2 score 檔案");
}

async function loadOptionRuntime() {
  const paths = [
    "data/options/option_runtime.json"
  ];

  for (const path of paths) {
    try {
      const res = await fetch(path);
      if (res.ok) return await res.json();
    } catch (err) {
      // option runtime is optional for pilot; try next path
    }
  }

  return { meta: { status: "missing" }, data: {} };
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
  if (!m7json || typeof m7json !== "object") return [];

  if (Array.isArray(m7json.rows)) return m7json.rows;
  if (Array.isArray(m7json.data)) return m7json.data;
  if (Array.isArray(m7json.stocks)) return m7json.stocks;

  if (m7json.data && typeof m7json.data === "object") {
    return Object.values(m7json.data);
  }

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

function findM7V2Stock(m7V2Json, symbol) {
  const stocks = allM7Stocks(m7V2Json);
  return stocks.find(s => getSymbol(s) === safeUpper(symbol)) || null;
}

function findOptionRuntime(optionRuntimeJson, symbol) {
  const sym = safeUpper(symbol);
  const data = optionRuntimeJson?.data || optionRuntimeJson || {};

  if (data?.[sym]) return data[sym];

  if (Array.isArray(data)) {
    return data.find(s => safeUpper(s?.symbol) === sym) || null;
  }

  return null;
}

/**
 * 把 fundamental 與 m7_new_stock_today 合併
 * 規則：
 * - today_score 以 m7_new_stock_today.json 為主
 * - fundamental 提供 ret / swing_days / price 等資料
 */
function mergeStockData(fundamentalStock, todayStock, m7V2Stock, optionStock, symbol) {
  if (!fundamentalStock && !todayStock && !m7V2Stock && FALLBACK_STOCKS[symbol]) {
    return FALLBACK_STOCKS[symbol];
  }

  if (!fundamentalStock && !todayStock && !m7V2Stock) {
    throw new Error(`M7 找不到股票: ${symbol}`);
  }

  const sources = [];
  if (m7V2Stock) sources.push("m7_v2");
  if (todayStock) sources.push("m7_today");
  if (fundamentalStock) sources.push("fundamental");
  if (optionStock) sources.push("option_runtime");

  return {
    ...(fundamentalStock || {}),
    ...(todayStock || {}),
    ...(m7V2Stock || {}),
    option_runtime: optionStock || null,
    symbol: safeUpper(symbol),
    _source: sources.length ? sources.join("+") : "fallback"
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

function getM7V2Score(stock) {
  const candidates = [
    stock?.m7_v2_score,
    stock?.m7_effective_score,
    stock?.m7_final_score,
    stock?.m7_raw_score
  ];

  for (const v of candidates) {
    if (v !== undefined && v !== null && v !== "") {
      const n = toNum(v, 0);
      if (n > 0) return n > 20 ? n / 10 : n;
    }
  }

  return null;
}

function getM8QualityScore(stock) {
  const m7v2 = getM7V2Score(stock);
  if (m7v2 !== null) return Math.max(0, Math.min(100, round2(m7v2 * 10)));

  if (stock?.today_score !== undefined && stock?.today_score !== null && stock?.today_score !== "") {
    return toNum(stock.today_score, 0);
  }

  if (stock?.score_today !== undefined && stock?.score_today !== null && stock?.score_today !== "") {
    return toNum(stock.score_today, 0);
  }

  return deriveTodayScore(stock);
}

function getTodayScore(stock) {
  // Backward-compatible name: M8 now treats this as the quality score.
  // Priority source is M7_v2 score; legacy today_score is fallback only.
  return getM8QualityScore(stock);
}

// ------------------------------------------
// 弱點 / BW / Tail
// ------------------------------------------
function calcWeaknesses(scores) {
  return scores.map(s => 100 - toNum(s)).sort((a, b) => b - a);
}

/**
 * BW = 0.55*worst + 0.30*avg + 0.15*secondWorst
 */
function calcBW(weaknesses) {
  const sorted = [...weaknesses].sort((a, b) => b - a);
  const worst = sorted[0] || 0;
  const secondWorst = sorted[1] || worst;
  const avgWeak = avg(weaknesses);

  return 0.55 * worst + 0.30 * avgWeak + 0.15 * secondWorst;
}

/**
 * TailAdj = 0.06*(worst-avg) + 0.03*(secondWorst-avg)
 */
function calcTailAdj(weaknesses) {
  const sorted = [...weaknesses].sort((a, b) => b - a);
  const worst = sorted[0] || 0;
  const secondWorst = sorted[1] || worst;
  const avgWeak = avg(weaknesses);

  return 0.06 * (worst - avgWeak) + 0.03 * (secondWorst - avgWeak);
}

/**
 * BasketPremium = 0.12*BW + 0.0012*BW^2
 */
function calcBasketPremium(BW) {
  return 0.12 * BW + 0.0012 * BW * BW;
}

// ------------------------------------------
// Structure 模組
// ------------------------------------------
function calcKIAdj(KI) {
  KI = toNum(KI);
  const k = KI - 55;
  return 0.025 * k + 0.00008 * k * k;
}

function calcTenorAdj(T) {
  T = toNum(T);
  let x = 0;

  if (T <= 3) {
    x = 0.18 * T;
  } else if (T <= 9) {
    x = 0.54 + 0.24 * (T - 3);
  } else {
    x = 1.98 + 0.06 * (T - 9);
  }

  return Math.min(2.2, x);
}

function calcStrikeAdj(strike) {
  strike = toNum(strike);
  const x = strike - 55;
  return 0.45 + 0.06 * x + 0.0018 * x * x;
}

function calcTypeAdj(type) {
  const t = String(type || "").toUpperCase();
  if (t === "EKI") return 0.0;
  if (t === "AKI") return 0.7;
  if (t === "DACN") return 1.5;
  return 0.0;
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

  if (basketVol < 1.5) {
    x = 0.25 * basketVol;
  } else if (basketVol < 3.0) {
    x = 0.4 + 0.55 * (basketVol - 1.5);
  } else {
    x = 1.225 + 0.28 * (basketVol - 3.0);
  }

  return Math.max(0.0, Math.min(10.0, x));
}

// ------------------------------------------
// Rate Pressure 模組（Option Runtime）
// ------------------------------------------
function getOptionField(stock, key, def = null) {
  if (stock?.option_runtime && stock.option_runtime[key] !== undefined && stock.option_runtime[key] !== null) {
    return stock.option_runtime[key];
  }
  if (stock?.[key] !== undefined && stock?.[key] !== null) return stock[key];
  return def;
}

function calcStockRatePressureScore(stock) {
  const ivPct = toNum(getOptionField(stock, "iv_30d_atm_pct", 0), 0);
  const skewRaw = toNum(getOptionField(stock, "put_skew_30d_vol_points", 0), 0);
  const demandRaw = toNum(getOptionField(stock, "demand_score", 0), 0);

  // ==========================================
  // M8 Pool30 Baseline v1
  // ==========================================
  // IV baseline = 1.17
  // Skew baseline = 5.08
  // Demand cap = 4
  // Core idea:
  // Pool30 is the FCN baseline, not whole-market 138 stocks.
  // ==========================================

  const ivScoreAdj =
    Math.min(10, (ivPct / 1.17) * 5);

  const skewScoreAdj =
    Math.min(10, (Math.max(0, skewRaw) / 5.08) * 5);

  const demandScoreAdj =
    Math.min(5, (Math.min(demandRaw, 4) / 4) * 5);

  // ==========================================
  // RP v1
  // IV 60%
  // Skew 25%
  // Demand 15%
  // Event removed
  // ==========================================

  const rp =
    0.60 * ivScoreAdj +
    0.25 * skewScoreAdj +
    0.15 * demandScoreAdj;

  return round2(rp);
}

function calcRatePressureAdj(stockList = []) {
  const items = (stockList || [])
    .map(stock => ({
      symbol: getSymbol(stock),
      // 0~10 scale, same as option_runtime.py.
      rate_pressure_score: calcStockRatePressureScore(stock),
      iv_score: getOptionField(stock, "iv_score", null),
      skew_score: getOptionField(stock, "skew_score", null),
      demand_score: getOptionField(stock, "demand_score", null),
      iv_30d_atm_pct: getOptionField(stock, "iv_30d_atm_pct", null),
      put_skew_30d_vol_points: getOptionField(stock, "put_skew_30d_vol_points", null),
      data_source: stock?.option_runtime?.data_source || null
    }))
    .filter(x => x.rate_pressure_score !== null && Number.isFinite(x.rate_pressure_score));

  if (!items.length) {
    return {
      rate_pressure_adj: 0,
      rate_pressure_score_basket: 0,
      rate_pressure_score_basket_0_10: 0,
      rate_pressure_worst: 0,
      rate_pressure_second: 0,
      rate_pressure_avg: 0,
      rate_pressure_stocks: [],
      rate_pressure_source: "missing"
    };
  }

  // Market version basket score:
  // FCN basket is driven by the highest pressure stock, but the average and
  // second-highest pressure also matter.
  const sorted = [...items].sort((a, b) => b.rate_pressure_score - a.rate_pressure_score);
  const worst = sorted[0]?.rate_pressure_score || 0;
  const second = sorted[1]?.rate_pressure_score || worst;
  const avgRP = avg(items.map(x => x.rate_pressure_score));

  const RP = (
    0.50 * worst +
    0.30 * avgRP +
    0.20 * second
  );

  // Market curve v3:
  // RP is already 0~10.
  // - max impact = +2.5%
  // - center = 5 on 0~10 scale
  // - slope = 1.5
  // This makes MU / high-IV baskets visible without double-scaling errors.
  const RP10 = RP;
  const adj = 2.5 / (1 + Math.exp(-(RP10 - 5) / 1.5));

  return {
    rate_pressure_adj: adj,
    rate_pressure_score_basket: RP,
    rate_pressure_score_basket_0_10: RP10,
    rate_pressure_worst: worst,
    rate_pressure_second: second,
    rate_pressure_avg: avgRP,
    rate_pressure_stocks: items,
    rate_pressure_source: "option_runtime_market_curve_v3_scale_fixed"
  };
}

// ------------------------------------------
// 高利率減速器
// ------------------------------------------
function calcHighRateBrake(preRate) {
  preRate = toNum(preRate);

  if (preRate < 18) return 0;
  if (preRate < 22) return 0.12 * Math.pow(preRate - 18, 2);
  if (preRate < 26) return 1.92 + 0.25 * Math.pow(preRate - 22, 2);
  return 5.92 + 0.35 * (preRate - 26);
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
// Option Runtime Dashboard / 全市場總表
// ------------------------------------------
function optionRuntimeRows(optionRuntimeJson) {
  const data = optionRuntimeJson?.data || optionRuntimeJson || {};
  if (Array.isArray(data)) return data;

  if (data && typeof data === "object") {
    return Object.entries(data).map(([symbol, row]) => ({
      symbol,
      ...(row || {})
    }));
  }

  return [];
}

function normalizeOptionRow(row) {
  const rp = toNum(row?.rate_pressure_score, 0);
  const ivPct = toNum(row?.iv_30d_atm_pct, 0);
  const skewVol = toNum(row?.put_skew_30d_vol_points, 0);
  const demand = toNum(row?.demand_score, 0);
  const ivScore = toNum(row?.iv_score, 0);
  const skewScore = toNum(row?.skew_score, 0);

  return {
    symbol: safeUpper(row?.symbol),
    status: row?.status || "",
    spot: round2(row?.spot),
    spot_raw: round2(row?.spot_raw),
    spot_scale_adjustment: row?.spot_scale_adjustment || "none",
    expiry_used: row?.expiry_used || "",
    iv_30d_atm_pct: round2(ivPct),
    iv_score: round2(ivScore),
    skew_score: round2(skewScore),
    put_skew_30d_vol_points: round2(skewVol),
    demand_score: round2(demand),
    put_call_volume_ratio: round2(row?.put_call_volume_ratio),
    put_call_oi_ratio: round2(row?.put_call_oi_ratio),
    rate_pressure_score: round2(rp),
    rate_pressure_score_0_100: round2(rp * 10),
    rate_driver_label: row?.rate_driver_label || "",
    iv_source: row?.iv_source || "",
    data_warning: row?.data_warning || "",
    data_source: row?.data_source || "",
    source_quality: row?.source_quality || "",
    updated_at: row?.updated_at || "",
    rp_formula_text:
      `0.45*IV(${round2(ivScore)}) + 0.30*Skew(${round2(skewScore)}) + 0.20*Demand(${round2(demand)}) = ${round2(rp)}`
  };
}

function calcOptionRuntimeSummary(rows) {
  const okRows = rows.filter(r => r.status === "ok");
  const rpVals = okRows.map(r => r.rate_pressure_score).filter(Number.isFinite);
  const ivVals = okRows.map(r => r.iv_30d_atm_pct).filter(Number.isFinite);
  const skewVals = okRows.map(r => r.skew_score).filter(Number.isFinite);
  const demandVals = okRows.map(r => r.demand_score).filter(Number.isFinite);

  const highRP = okRows.filter(r => r.rate_pressure_score >= 3).length;
  const highIV = okRows.filter(r => r.iv_score >= 3).length;
  const highSkew = okRows.filter(r => r.skew_score >= 3).length;
  const highDemand = okRows.filter(r => r.demand_score >= 5).length;
  const warnings = okRows.filter(r => r.data_warning).length;

  return {
    total: rows.length,
    ok_count: okRows.length,
    error_count: rows.filter(r => r.status && r.status !== "ok").length,
    warning_count: warnings,
    avg_rate_pressure_score: round2(avg(rpVals)),
    max_rate_pressure_score: round2(Math.max(0, ...rpVals)),
    avg_iv_pct: round2(avg(ivVals)),
    avg_skew_score: round2(avg(skewVals)),
    avg_demand_score: round2(avg(demandVals)),
    high_rp_count: highRP,
    high_iv_count: highIV,
    high_skew_count: highSkew,
    high_demand_count: highDemand
  };
}

/**
 * 給 m8_batch.html 的 Option Runtime 總表使用。
 *
 * options:
 *   sortBy: "rate_pressure_score" | "iv_30d_atm_pct" | "skew_score" | "demand_score"
 *   direction: "desc" | "asc"
 *   driver: optional filter, e.g. "IV_DRIVEN", "SKEW_DRIVEN", "DEMAND_DRIVEN", "LOW_PRESSURE"
 *   warning: optional filter, "all" | "warning" | "clean"
 *   query: optional symbol search
 */
export async function loadM8OptionRuntimeDashboard(options = {}) {
  const optionRuntime = await loadOptionRuntime();
  const rawRows = optionRuntimeRows(optionRuntime);
  let rows = rawRows.map(normalizeOptionRow);

  const query = safeUpper(options.query || "");
  const driver = String(options.driver || "all");
  const warning = String(options.warning || "all");
  const sortBy = options.sortBy || "rate_pressure_score";
  const direction = options.direction === "asc" ? "asc" : "desc";

  if (query) {
    rows = rows.filter(r => r.symbol.includes(query));
  }

  if (driver !== "all") {
    rows = rows.filter(r => r.rate_driver_label === driver);
  }

  if (warning === "warning") {
    rows = rows.filter(r => !!r.data_warning);
  } else if (warning === "clean") {
    rows = rows.filter(r => !r.data_warning);
  }

  rows.sort((a, b) => {
    const av = toNum(a[sortBy], 0);
    const bv = toNum(b[sortBy], 0);
    return direction === "asc" ? av - bv : bv - av;
  });

  const allRows = rawRows.map(normalizeOptionRow);

  return {
    meta: optionRuntime.meta || {},
    summary: calcOptionRuntimeSummary(allRows),
    filters: {
      drivers: [...new Set(allRows.map(r => r.rate_driver_label).filter(Boolean))].sort(),
      warnings: [...new Set(allRows.map(r => r.data_warning).filter(Boolean))].sort(),
      sort_options: [
        "rate_pressure_score",
        "iv_30d_atm_pct",
        "iv_score",
        "skew_score",
        "demand_score",
        "put_call_volume_ratio"
      ]
    },
    rows
  };
}


// ------------------------------------------
// Blueprint
// ------------------------------------------
export function getM8Blueprint() {
  return {
    version: "M8 VNext FINAL v2",
    data_source: {
      fundamental: "data/m7/m7_fundamental_data.json",
      m7_today: "data/m7/m7_new_stock_today.json",
      m7_v2: "data/m7_sandbox/m7_v2_scores.json",
      option_runtime: "data/options/option_runtime.json"
    },
    summary: [
      "M8 主讀 m7_v2_scores.json 作為品質主來源，fundamental 作 runtime fallback",
      "M7_v2 score 優先；today_score 只作 fallback",
      "只有找不到 M7_v2 / today_score 才 fallback 推估",
      "BW = 0.55×worst + 0.30×avg + 0.15×secondWorst",
      "BasketPremium = 0.12×BW + 0.0012×BW²",
      "TailAdj = 0.06×(worst-avg)+0.03×(secondWorst-avg)",
      "Strike > KI，Strike 為主要風險",
      "Type：EKI=0，AKI=0.7，DACN=1.5",
      "Tenor：1–3慢、3–10加速、10–12放緩（max=2）",
      "BasketVol = 0.5×s1 + 0.3×s2 + 0.2×avgSwing",
      "VolAdj 採平滑函數",
      "RatePressureAdj 改用 market curve v3；全程使用 0~10 尺度，UI 另提供 0~100 顯示；HighRateBrake 保留用來抑制極端高利率失真",
      "Anchor-based Yield Proxy：以當次輸入最高 M7_v2 品質股票當 anchor"
    ],
    formulas: {
      today_score: "M7_v2 score×10 為品質主分數；缺值才 fallback today_score / derived_today_score",
      derived_today_score: "today_score(推估) = quality_score + risk_penalty + trend_score + volatility_penalty",
      weaknesses: "weakness = 100 - today_score",
      BW: "BW = 0.55×worst + 0.30×avg + 0.15×secondWorst",
      basket_premium: "BasketPremium = 0.12×BW + 0.0012×BW²",
      tail_adj: "TailAdj = 0.06×(worst-avg)+0.03×(secondWorst-avg)",
      ki_adj: "KIAdj = 0.025×(KI-55) + 0.00008×(KI-55)^2",
      tenor_adj: "1–3慢、3–9加速、9–12放緩，max=2.2",
      strike_adj: "StrikeAdj = 0.45 + 0.06×(Strike-55) + 0.0018×(Strike-55)^2",
      type_adj: "EKI=0, AKI=0.7, DACN=1.5",
      short_swing: "ShortSwing = 0.35*d0 + 0.25*d1 + 0.15*d2 + 0.10*d3 + 0.08*d4 + 0.07*d5",
      basket_vol: "BasketVol = 0.5×s1 + 0.3×s2 + 0.2×avgSwing",
      vol_adj: "分段平滑函數",
      brake: "HighRateBrake: 18以下不煞，18~22二次煞，22~26強二次煞，26以上線性強煞",
      final_yield: "FairYield = Base + BasketPremium + TailAdj + StructureTotal + VolAdj + RatePressureAdj - HighRateBrake(PreRate)",
      rate_pressure: "BasketRP = 0.50×worst + 0.30×avg + 0.20×secondWorst；RatePressureAdj = 2.5 / (1 + exp(-(BasketRP-5)/1.5))",
      anchor_proxy: "anchor + target 的 pair_fair_yield 與 normalized_proxy"
    },
    parameters: {
      base: 6,
      type_map: { EKI: 0, AKI: 0.7, DACN: 1.5 },
      tenor: {
        short: "1–3 月慢速",
        mid: "3–10 月加速",
        long: "10–12 月放緩",
        max: 2.2
      },
      today_score_source: "m7_v2_score × 10 優先，today_score / fundamental fallback",
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

  const [m7Fundamental, m7Today, m7V2, optionRuntime] = await Promise.all([
    loadM7Fundamental(),
    loadM7Today(),
    loadM7V2(),
    loadOptionRuntime()
  ]);

  const stocks = symbols.map(sym => {
    const symbol = safeUpper(sym);
    const fundamentalStock = findFundamentalStock(m7Fundamental, symbol);
    const todayStock = findTodayStock(m7Today, symbol);
    const m7V2Stock = findM7V2Stock(m7V2, symbol);
    const optionStock = findOptionRuntime(optionRuntime, symbol);
    return mergeStockData(fundamentalStock, todayStock, m7V2Stock, optionStock, symbol);
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
  const ratePressure = calcRatePressureAdj(stocks);
  const ratePressureAdj = ratePressure.rate_pressure_adj;

  const preRate =
    base +
    basketPremium +
    structure.structure_total +
    tailAdj +
    volAdj +
    ratePressureAdj;

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
      m7_v2_score: round2(getM7V2Score(s) || 0),
      quality_score: round2(getTodayScore(s)),
      today_score: round2(getTodayScore(s)),
      rate_pressure_score: round2(calcStockRatePressureScore(s) !== null ? calcStockRatePressureScore(s) : 0),
      rate_pressure_score_0_100: round2((calcStockRatePressureScore(s) !== null ? calcStockRatePressureScore(s) : 0) * 10),
      iv_30d_atm_pct: round2(getOptionField(s, "iv_30d_atm_pct", 0)),
      iv_score: round2(getOptionField(s, "iv_score", 0)),
      skew_score: round2(getOptionField(s, "skew_score", 0)),
      put_skew_30d_vol_points: round2(getOptionField(s, "put_skew_30d_vol_points", 0)),
      demand_score: round2(getOptionField(s, "demand_score", 0)),
      rate_driver_label: getOptionField(s, "rate_driver_label", ""),
      iv_source: getOptionField(s, "iv_source", ""),
      data_warning: getOptionField(s, "data_warning", ""),
      option_status: getOptionField(s, "status", "")
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
    rate_pressure_adj: round2(ratePressureAdj),
    rate_pressure_score_basket: round2(ratePressure.rate_pressure_score_basket),
    rate_pressure_score_basket_0_10: round2(ratePressure.rate_pressure_score_basket_0_10),
    rate_pressure_worst: round2(ratePressure.rate_pressure_worst),
    rate_pressure_second: round2(ratePressure.rate_pressure_second),
    rate_pressure_avg: round2(ratePressure.rate_pressure_avg),
    rate_pressure_source: ratePressure.rate_pressure_source,
    rate_pressure_stocks: ratePressure.rate_pressure_stocks.map(x => ({
      ...x,
      // rate_pressure_score is 0~10 scale from option_runtime.py.
      // Do NOT divide by 10 here.
      rate_pressure_score: round2(x.rate_pressure_score),
      rate_pressure_score_0_100: round2(x.rate_pressure_score * 10),
      rate_pressure_formula_text:
        `0.60*IV + 0.25*Skew + 0.15*Demand (Pool30 Baseline v1)`
    })),

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

  const [m7Fundamental, m7Today, m7V2, optionRuntime] = await Promise.all([
    loadM7Fundamental(),
    loadM7Today(),
    loadM7V2(),
    loadOptionRuntime()
  ]);

  const cleanedSymbols = [...new Set(symbols.map(safeUpper).filter(Boolean))];

  if (cleanedSymbols.length < 2) {
    throw new Error("有效股票數不足，至少需要 2 檔");
  }

  const enriched = cleanedSymbols.map(symbol => {
    const fundamentalStock = findFundamentalStock(m7Fundamental, symbol);
    const todayStock = findTodayStock(m7Today, symbol);
    const m7V2Stock = findM7V2Stock(m7V2, symbol);
    const optionStock = findOptionRuntime(optionRuntime, symbol);
    const merged = mergeStockData(fundamentalStock, todayStock, m7V2Stock, optionStock, symbol);

    return {
      symbol,
      name: getName(merged),
      today_score: round2(getTodayScore(merged)),
      m7_v2_score: round2(getM7V2Score(merged) || 0),
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
