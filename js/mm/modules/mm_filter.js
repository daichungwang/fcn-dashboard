// ==========================================
// MM FILTER ENGINE v4.0 FULL MODULE (M7 gate + C1 Decision Output + M6 Market Attractive ordering)
// Path: js/mm/modules/mm_filter.js
// Purpose: M7 allow FCN -> C1-L1 Decision Output status/amount/strategy -> Category -> M6 Market Attractive ordering -> Basket / Allocation / M8 / Market Match
// Notes:
// - This is ES module version.
// - Because this file is under js/mm/modules/, M8 import path must be ../../core/m8_batch_engine.js
// - Sandbox only. Do not overwrite production engines unless confirmed.
// ==========================================

import { runM8Case } from "../../core/m8_batch_engine.js";

// ==========================================
// FCN Basket Rules v1
// ==========================================

export const FCN_BASKET_RULES = {
  conservative: {
    label: "保守單",
    rate_min: 12,
    rate_max: 16,
    stock_count_min: 3,
    stock_count_max: 5,
    preferred_vol_bands: ["low", "mid"],
    preferred_symbols: ["SMH", "QQQ", "LQD", "GOOG", "AAPL", "AMZN", "SPY"],
    ki_min: 50,
    ki_max: 55,
    strike_min: 60,
    strike_max: 65,
    tenor_min: 6,
    tenor_max: 12,
    type: ["EKI"]
  },
  conservative_special: {
    label: "保守特殊單",
    rate_min: 12,
    rate_max: 18,
    stock_count_min: 4,
    stock_count_max: 5,
    required_any: ["TSM", "NVDA"],
    preferred_symbols: ["GOOG", "AAPL", "SMH", "QQQ", "SPY", "AMZN", "LQD"],
    ki_max: 75,
    strike_equals_ki: true,
    tenor_min: 9,
    tenor_max: 12,
    type: ["AKI", "DACN"],
    guaranteed_coupon_months: 3
  },
  rational: {
    label: "合理單",
    rate_min: 15,
    rate_max: 19,
    stock_count_min: 3,
    stock_count_max: 4,
    preferred_vol_bands: ["mid", "high"],
    ki_min: 50,
    ki_base_max: 55,
    ki_hard_max: 70,
    strike: 65,
    tenor_min: 6,
    tenor_max: 9,
    type: ["EKI", "AKI"]
  },
  aggressive: {
    label: "積極單",
    rate_min: 19,
    rate_max: 25,
    stock_count_min: 3,
    stock_count_max: 5,
    vol_mix: { high: [1, 2], mid: [1, 2], low: [1, 2] },
    ki: 50,
    strike: 65,
    tenor_min: 7,
    tenor_max: 9,
    type: ["EKI"]
  }
};

const CATEGORY_ORDER = ["core", "growth", "income", "defensive", "speculative"];
const DEFAULT_STRUCTURE = {
  KI: 55,
  Strike: 65,
  T: 6,
  type: "AKI",
  marketYield: 0
};

// ==========================================
// C1 FCN Cap Rules (must match mm_stock_cockpit.js)
// ==========================================
// IMPORTANT:
// - M1 decides pool30 / stock universe.
// - M7 v2 decides FCN candidate quality.
// - M6 Market Attractive decides today's market ordering inside categories.
// - C1 decides how much can be traded.
// Therefore max_addable_amt must respect the same cap exceptions used by C1.

export const FCN_CAP_RULES = {
  core: 500000,
  growth: 300000,
  defensive: 300000,
  defense: 300000,
  income: 200000,
  incoming: 200000,
  speculative: 30000
};

export const FCN_CAP_EXCEPTIONS = {
  NVDA: 700000,
  TSM: 700000,
  SMH: 700000,
  GOOG: 700000
};

function getFcnBaseCapFromRow(row = {}) {
  const sym = safeUpper(row.symbol || row.ticker || row.code);
  if (FCN_CAP_EXCEPTIONS[sym]) {
    return { amount: FCN_CAP_EXCEPTIONS[sym], source: "exception", reason: "例外上限" };
  }

  const category = normalizeCategory(
    row.category ||
    row.m1_category ||
    row.risk_category ||
    row.runtime_category ||
    "core"
  );

  const amount = FCN_CAP_RULES[category] || FCN_CAP_RULES.core;
  return { amount, source: "category", reason: category || "core/default" };
}

function applyC1CapRule(row = {}, rawMaxAddable = 0, m2ExposureAmt = 0) {
  const cap = getFcnBaseCapFromRow(row);
  const capAvailable = Math.max(0, num(cap.amount) - num(m2ExposureAmt));
  const raw = Number(rawMaxAddable);

  // Preserve positive C1 amount if it already exists.
  // If amount is missing/0 and the symbol is an exception, rescue it with C1 cap exception.
  const finalMax = raw > 0
    ? raw
    : cap.source === "exception"
      ? capAvailable
      : Math.max(0, raw || 0);

  return {
    cap_amount: cap.amount,
    cap_source: cap.source,
    cap_reason: cap.reason,
    cap_available_amt: capAvailable,
    max_addable_amt: finalMax
  };
}

// ==========================================
// Main API
// ==========================================

export async function runMMFilterFull(input = {}) {
  const rawStocks = Array.isArray(input.stocks) ? input.stocks : [];
  const marketOrders = Array.isArray(input.market_orders) ? input.market_orders : [];
  const options = input.options || {};

  // IMPORTANT: autoload canonical M7 v2 score source.
  // Source: data/m7_sandbox/m7_v2_scores.json
  // This prevents C1/test input from accidentally using stale legacy m7_score.
  const m7Index = await loadM7V2Index(options);
  const m6Index = await loadM6ForecastIndex(options);
  const mergedM7Stocks = mergeM7V2Rows(rawStocks, m7Index);
  const mergedStocks = mergeM6ForecastRows(mergedM7Stocks, m6Index);
  const stocks = normalizeStocks(mergedStocks);

  // 1. Volatility v1
  stocks.forEach(s => {
    const vol = calcVolScoreV1(s);
    s.vol_score = round2(vol.score);
    s.vol_band = getVolBand(s.vol_score);
    s.vol_components = vol.components;

    // v3.2: Priority is deprecated. M6 Market Attractive is the only ordering score.
    const m6Rank = calcM6MarketAttractiveScore(s);
    s.m6_market_attractive_score = round2(m6Rank.score);
    s.m6_market_attractive_components = m6Rank.components;
    s.m6_direction = calcM6Direction(s);
    s.m6_overheat_flag = calcM6OverheatFlag(s);
    s.m6_market_explain = buildM6MarketExplain(s);
    s.priority_score = null;
    s.priority_deprecated = true;
  });

  // 2. Pool classification
  const pools = classifyPools(stocks, options);

  // 3. Category
  const category_map = buildCategoryMap(stocks);

  // 4. Legacy basket build + M8
  // v3.8: MM/test.html now uses the new MM FCN Simulating & Allocating Engine
  // for smart basket construction. Legacy basket generation can be disabled
  // to avoid duplicate/conflicting outputs in sandbox.
  const legacyBasketsEnabled = options.disable_legacy_baskets !== true;
  const baskets = legacyBasketsEnabled
    ? await buildAllBaskets({ pools, category_map, stocks, options })
    : [];

  // 5. Legacy Allocation v0
  const legacyAllocationEnabled = options.disable_legacy_allocation !== true;
  const allocation = legacyAllocationEnabled
    ? allocateBasketsV0({
        baskets,
        stocks,
        totalCapacity: options.total_today_capacity
      })
    : {
        total_capacity: Number.isFinite(Number(options.total_today_capacity)) ? Number(options.total_today_capacity) : 0,
        allocated: 0,
        remaining: Number.isFinite(Number(options.total_today_capacity)) ? Number(options.total_today_capacity) : 0,
        rows: [],
        disabled: true,
        reason: "Legacy allocation disabled; use MM FCN Simulating & Allocating Engine result."
      };

  // 6. Legacy Market order match + M8
  const legacyMarketMatchEnabled = options.disable_legacy_market_match !== true;
  const market_match = legacyMarketMatchEnabled
    ? await runMarketOrderMatch({
        orders: marketOrders,
        stocks
      })
    : [];

  // 7. Summary
  const summary = buildSummary({ stocks, pools, category_map, baskets, allocation, market_match });

  return {
    version: "mm_filter_v4_0_simulation_m7_5_5_no_legacy_reject",
    generated_at: new Date().toISOString(),
    summary,
    pools,
    pool_stats: pools._stats || buildPoolStats(pools),
    pool_conditions: pools._conditions || {},
    category_map,
    baskets,
    allocation,
    market_match,
    raw: stocks,
    // UI compatibility aliases for mm/test.html renderers.
    stocks,
    rows: stocks,
    c1_rows: stocks,
    c1_output_summary: stocks,
    debug_json: {
      stocks,
      pools,
      pool_stats: pools._stats || buildPoolStats(pools),
      pool_conditions: pools._conditions || {},
      category_map,
      baskets,
      allocation,
      market_match,
      summary
    }
  };
}

export async function runMarketOrderMatch(input = {}) {
  const orders = Array.isArray(input.orders) ? input.orders : [];
  const stocks = normalizeStocks(Array.isArray(input.stocks) ? input.stocks : []);
  return Promise.all(orders.map(order => evaluateMarketOrder(order, stocks)));
}


// ==========================================
// M7 v2 canonical autoload / merge
// ==========================================

const M7_V2_DEFAULT_SOURCE = "../../../data/m7_sandbox/m7_v2_scores.json";
const M7_V2_FALLBACK_SOURCES = [
  "../../../data/m7_sandbox/m7_v2_scores.json",       // normal module path: js/mm/modules -> repo root
  "/fcn-dashboard/data/m7_sandbox/m7_v2_scores.json", // GitHub Pages absolute repo path
  "../../data/m7_sandbox/m7_v2_scores.json",          // fallback if module is served one level higher
  "../data/m7_sandbox/m7_v2_scores.json",             // fallback for direct mm/test path
  "data/m7_sandbox/m7_v2_scores.json"                 // fallback for root-relative test runners
];

async function loadM7V2Index(options = {}) {
  if (options.disable_m7_v2_autoload === true) return {};

  // Allow sandbox/test.html to pass already-loaded rows directly.
  const directRows = Array.isArray(options.m7_v2_rows)
    ? options.m7_v2_rows
    : Array.isArray(options.m7_rows)
      ? options.m7_rows
      : null;

  if (directRows) return buildM7V2Index(directRows);

  const sources = options.m7_v2_source
    ? [options.m7_v2_source, ...M7_V2_FALLBACK_SOURCES]
    : M7_V2_FALLBACK_SOURCES;

  const tried = [];
  for (const source of [...new Set(sources)]) {
    try {
      const url = source.startsWith("/")
        ? new URL(source, window.location.origin)
        : new URL(source, import.meta.url);
      tried.push(url.toString());
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const rows = extractM7Rows(json);
      const idx = buildM7V2Index(rows);
      if (Object.keys(idx).length) {
        console.info(`[MM Filter] M7 v2 loaded: ${Object.keys(idx).length} rows from ${url.toString()}`);
        return idx;
      }
    } catch (error) {
      // Try next source.
    }
  }

  console.warn("[MM Filter] M7 v2 autoload failed. Tried:", tried);
  return {};
}

function extractM7Rows(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.rows)) return json.rows;
  if (Array.isArray(json?.data)) return json.data;
  if (json?.data && typeof json.data === "object") {
    return Object.entries(json.data).map(([symbol, row]) => ({ symbol, ...(row || {}) }));
  }
  if (Array.isArray(json?.stocks)) return json.stocks;
  if (json && typeof json === "object") {
    return Object.entries(json).map(([symbol, row]) => ({ symbol, ...(row || {}) }));
  }
  return [];
}

function buildM7V2Index(rows) {
  const out = {};
  (rows || []).forEach(row => {
    const symbol = safeUpper(row.symbol || row.ticker || row.code);
    if (!symbol) return;
    out[symbol] = row;
  });
  return out;
}

function mergeM7V2Rows(rawRows, m7Index = {}) {
  return (rawRows || []).map(row => {
    const symbol = safeUpper(row.symbol || row.ticker || row["股號"] || row.code);
    const m7 = m7Index[symbol];
    if (!m7) return row;

    // v2 canonical data wins over legacy C1/test input for all M7-related fields.
    // But explicit what-if / formula-test fields can still override display scoring.
    return {
      ...row,
      ...pickDefined(m7, [
        "m7_v2_score",
        "m7_v2_score_unclamped",
        "m7_effective_score",
        "m7_effective_score_source",
        "m7_v2_fallback_to_raw",
        "m7_raw_score",
        "m7_v2_formula",
        "valuation_score",
        "trend_score",
        "structure_score",
        "money_score",
        "timing_score",
        "best_structure_r2",
        "best_structure_model",
        "trend_linear_annualized_pct",
        "trend_ma_annualized_pct",
        "trend_acceleration_annualized_delta_pct",
        "trend_reliability",
        "trend_mode",
        "coverage_pct",
        "data_warning",
        "warning_flag",
        "history_weeks",
        "history_horizon_used",
        "weekly_prices",
        "weekly_returns",
        "feature_snapshot"
      ]),
      m7_source_path: "data/m7_sandbox/m7_v2_scores.json",
      m7_source_loaded: true,

      // Preserve original legacy values for audit.
      legacy_m7_score: row.m7_score,
      legacy_priority_score: row.priority_score,

      // Force visible M7 score to canonical v2 unless formula-test override exists.
      m7_score: firstFinite([
        row.m7_whatif_score,
        row.m7_new_score,
        row.m7_adjusted_score,
        m7.m7_effective_score,
        m7.m7_v2_score,
        m7.m7_v2_score_unclamped,
        m7.m7_raw_score
      ], row.m7_score),
      m7_score_source: firstString([
        row.m7_whatif_score !== undefined ? "formula_test_m7_whatif_score" : null,
        row.m7_new_score !== undefined ? "formula_test_m7_new_score" : null,
        row.m7_adjusted_score !== undefined ? "formula_test_m7_adjusted_score" : null,
        m7.m7_effective_score_source,
        m7.m7_effective_score !== undefined ? "m7_effective_score_from_v2_json" : null,
        m7.m7_v2_score !== undefined ? "m7_v2_score_from_v2_json" : null,
        "legacy_fallback"
      ])
    };
  });
}

function pickDefined(obj, keys) {
  const out = {};
  keys.forEach(k => {
    if (obj && obj[k] !== undefined) out[k] = obj[k];
  });
  return out;
}

function firstString(values, d = "fallback") {
  for (const v of values || []) {
    if (typeof v === "string" && v.trim()) return v;
  };
}


// ==========================================
// M6 Price Forecast autoload / merge
// ==========================================

const M6_FORECAST_DEFAULT_SOURCE = "../../../data/m6/price_forecast_debug.json";

async function loadM6ForecastIndex(options = {}) {
  if (options.disable_m6_autoload === true) return {};

  const directRows = Array.isArray(options.m6_rows)
    ? options.m6_rows
    : Array.isArray(options.m6_forecast_rows)
      ? options.m6_forecast_rows
      : null;

  if (directRows) return buildM6ForecastIndex(directRows);

  const source = options.m6_forecast_source || M6_FORECAST_DEFAULT_SOURCE;

  try {
    const url = new URL(source, import.meta.url);
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const rows = extractM6Rows(json);
    return buildM6ForecastIndex(rows);
  } catch (error) {
    console.warn("[MM Filter] M6 forecast autoload failed. Fallback to input rows.", error);
    return {};
  }
}

function extractM6Rows(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.rows)) return json.rows;
  if (Array.isArray(json?.stocks)) return json.stocks;
  if (json && typeof json === "object") {
    return Object.entries(json).map(([symbol, row]) => ({ symbol, ...(row || {}) }));
  }
  return [];
}

function buildM6ForecastIndex(rows) {
  const out = {};
  (rows || []).forEach(row => {
    const symbol = safeUpper(row.symbol || row.ticker || row.code);
    if (!symbol) return;
    out[symbol] = row;
  });
  return out;
}

function mergeM6ForecastRows(rawRows, m6Index = {}) {
  return (rawRows || []).map(row => {
    const symbol = safeUpper(row.symbol || row.ticker || row["股號"] || row.code);
    const m6 = m6Index[symbol];
    if (!m6) return row;

    const flat = m6.flat || {};
    const timing = m6.timing_structure || {};
    const rawReturns = timing.raw_returns || {};
    const dailyReturns = timing.daily_normalized_returns || {};

    return {
      ...row,
      m6_source_path: "data/m6/price_forecast_debug.json",
      m6_source_loaded: true,
      m6_today_price: m6.today_price,
      m6_decision_mode: firstString([flat.decision_mode, m6.decision_mode], null),
      m6_decision_label: firstString([flat.decision_label, m6.decision_label], null),
      m6_short_direction: firstString([flat.short_direction, m6.short_direction, timing.direction], null),
      m6_timing_slope: firstFinite([flat.timing_slope, timing.slope], null),
      m6_timing_dispersion: firstFinite([flat.timing_dispersion, timing.dispersion], null),
      m6_timing_consistency_ratio: firstFinite([flat.timing_consistency_ratio, timing.consistency_ratio], null),
      m6_same_sign: timing.same_sign === true,
      m6_strength_consistent: timing.strength_consistent === true,
      m6_dispersion_ok: timing.dispersion_ok === true,
      m6_strength_ok: timing.strength_ok === true,
      m6_weighted_upside_pct_1d: firstFinite([m6.weighted_upside_pct_1d, m6.forecast?.["1d"]?.final?.weighted_upside_pct_final], null),
      m6_weighted_upside_pct_1w: firstFinite([m6.weighted_upside_pct_1w, m6.forecast?.["1w"]?.final?.weighted_upside_pct_final], null),
      m6_weighted_upside_pct_1m: firstFinite([m6.weighted_upside_pct_1m, m6.forecast?.["1m"]?.final?.weighted_upside_pct_final], null),
      m6_ret_1d_pct: firstFinite([rawReturns.ret_1d_pct, row.ret_1d], null),
      m6_ret_1w_pct: firstFinite([rawReturns.ret_1w_pct, row.ret_1w], null),
      m6_ret_2w_pct: firstFinite([rawReturns.ret_2w_pct, row.ret_2w], null),
      m6_ret_1m_pct: firstFinite([rawReturns.ret_1m_pct, row.ret_1m], null),
      m6_ret_1d_daily_pct: firstFinite([dailyReturns.ret_1d_daily_pct], null),
      m6_ret_1w_daily_pct: firstFinite([dailyReturns.ret_1w_daily_pct], null),
      m6_ret_1m_daily_pct: firstFinite([dailyReturns.ret_1m_daily_pct], null),
      m6_debug_series: Array.isArray(m6.debug?.series) ? m6.debug.series : null
    };
  });
}

// ==========================================
// Normalize C1 rows
// ==========================================

export function normalizeStocks(rows) {
  return rows
    .map((row, idx) => {
      const symbol = safeUpper(
        row.symbol ||
        row.ticker ||
        row["股號"] ||
        row.code
      );

      if (!symbol) return null;

      const category = normalizeCategory(
        row.category ||
        row.m1_category ||
        row.risk_category ||
        row["category"] ||
        "unknown"
      );

      // M7 source rule:
      // Primary source must be data/m7_sandbox/m7_v2_scores.json.
      // Therefore m7_v2_score / m7_effective_score must win over legacy m7_score.
      // Legacy m7_score is only fallback when v2 fields are missing.
      const m7Score = firstFinite([
        row.m7_whatif_score,
        row.m7_new_score,
        row.m7_adjusted_score,
        // v3.4 FIX: v2 canonical scores must be checked before legacy row.m7_score.
        // Some C1/test rows carry m7_score=0 as placeholder; if it is checked first, UI shows score 0.00.
        row.m7_effective_score,
        row.m7_v2_score,
        row.m7_v2_score_unclamped,
        row.m7_raw_score,
        row.m7_score,
        row.today_score,
        row.total,
        row["today_score"],
        row["排名分數"]
      ], 0);

      const m7ScoreSource =
        row.m7_score_source ||
        row.m7_effective_score_source ||
        (Number.isFinite(Number(row.m7_whatif_score)) ? "formula_test_m7_whatif_score" :
          Number.isFinite(Number(row.m7_new_score)) ? "formula_test_m7_new_score" :
          Number.isFinite(Number(row.m7_adjusted_score)) ? "formula_test_m7_adjusted_score" :
          Number.isFinite(Number(row.m7_effective_score)) ? "m7_effective_score" :
          Number.isFinite(Number(row.m7_v2_score)) ? "m7_v2_score" :
          Number.isFinite(Number(row.m7_score)) ? "m7_score" :
          "fallback");

      const priorityScore = firstFinite([
        row.priority_score,
        row.c1_priority_score,
        row.today_priority_score,
        row.m7_today_score,
        row.m7_effective_score,
        row.m7_v2_score,
        row.m7_v2_score_unclamped,
        row.m7_score,
        row.m7_raw_score,
        row.today_score,
        row.total,
        row["today_score"],
        row["排名分數"]
      ], m7Score);

      const m1Score = firstFinite([
        row.m1_score,
        row.m1_quality,
        row["m1_score"]
      ], null);

      const m2ExposureAmt = firstFinite([row.m2_exposure_amt, row.exposure_amt, row.active_fcn_amount], 0);

      const rawMaxAddable = firstFinite([
        row.max_addable_amt,
        row.addable_amt,
        row.c1_max_addable_amt,
        row.today_capacity_amt,
        row.suggested_amt_cap
      ], 0);

      const capView = applyC1CapRule(row, rawMaxAddable, m2ExposureAmt);
      const maxAddable = capView.max_addable_amt;

      const singleSuggest = firstFinite([
        row.single_suggest_amt,
        row.today_suggest_amt,
        row.c1_today_suggest_amt,
        row.suggested_amt
      ], 0);

      const amtSignal = firstFinite([
        row.amt_signal,
        row.amount_strength,
        row.m6_amount_strength
      ], singleSuggest > 0 || maxAddable > 0 ? 0.7 : 0);

      const allowF = row.allow_fcn !== false &&
        row.is_blocked !== true &&
        row.isRejected !== true &&
        row.isRejected !== "true";

      return {
        ...row,
        _row_index: idx,
        symbol,
        name: row.name || row["股名"] || row.company || symbol,
        category,

        // Scores
        priority_score: null,
        priority_deprecated: true,
        legacy_priority_score: nullableNumber(priorityScore),
        m1_score: m1Score === null ? null : round2(m1Score),

        // M7 v2 canonical fields
        m7_score: round2(m7Score),
        // UI compatibility: existing mm/test.html cards may render row.score.
        // score is M7 score, not Priority.
        score: round2(m7Score),
        display_score: round2(m7Score),
        score_label: "M7 Score",
        stock_pool_review_score: round2(m7Score),
        stock_pool_review_score_label: "M7 Score",
        m7_selected: round2(m7Score) >= num(row.m7_fcn_min_score || row.m7_min_score, 6),
        m7_pass: round2(m7Score) >= num(row.m7_fcn_min_score || row.m7_min_score, 6),
        m7_selection_reason: round2(m7Score) >= 8 ? "m7_high_score" : (round2(m7Score) >= 6 ? "m7_pass" : "m7_below_threshold"),
        m7_v2_score: nullableNumber(row.m7_v2_score),
        m7_raw_score: nullableNumber(row.m7_raw_score),
        m7_effective_score: nullableNumber(row.m7_effective_score),
        m7_score_source: m7ScoreSource,
        m7_v2_formula: row.m7_v2_formula || null,
        m7_v2_fallback_to_raw: row.m7_v2_fallback_to_raw === true,

        valuation_score: nullableNumber(row.valuation_score),
        trend_score: nullableNumber(row.trend_score),
        structure_score: nullableNumber(row.structure_score),

        // Returns / Vol inputs
        ret_1d: firstFinite([row.m6_ret_1d_pct, row.ret_1d, row.delta_1d, row.ret_1d_pct, row["ret_1d_pct"]], 0),
        ret_2d: firstFinite([row.ret_2d, row.delta_2d, row.ret_d2, row["ret_2d_pct"]], 0),
        ret_1w: firstFinite([row.m6_ret_1w_pct, row.ret_1w, row.delta_1w, row.ret_1w_pct, row["ret_1w_pct"]], 0),
        ret_2w: firstFinite([row.m6_ret_2w_pct, row.ret_2w, row.delta_2w, row.ret_2w_pct, row["ret_2w_pct"]], null),
        // Formal short-term MA slope for Vol engine.
        // DO NOT fallback to M7 long-horizon trend_ma_annualized_pct; that is annualized 10Y/3Y trend.
        // This field is filled below in calcVolScoreV1() from weekly_prices / feature_snapshot.weekly_prices.
        ma_slope: null,

        // M2
        m2_util: normalizeRatio(firstFinite([
          row.m2_util,
          row.m2_utilization,
          row.exposure_ratio,
          row.exposureRatio,
          row["投入資金比"]
        ], 0)),
        m2_exposure_amt: m2ExposureAmt,
        m2_fcn_count: firstFinite([row.m2_fcn_count, row.fcn_count, row.fcnCount], 0),

        // M6
        m6_timing: String(row.m6_timing || row.timing_mode || row.m6_decision_mode || row.decision_mode || row.m6_short_direction || row.short_direction || "").toLowerCase(),
        m6_source_loaded: row.m6_source_loaded === true,
        m6_decision_mode: row.m6_decision_mode || row.decision_mode || null,
        m6_decision_label: row.m6_decision_label || row.decision_label || null,
        m6_short_direction: row.m6_short_direction || row.short_direction || null,
        m6_timing_slope: nullableNumber(row.m6_timing_slope),
        m6_timing_dispersion: nullableNumber(row.m6_timing_dispersion),
        m6_timing_consistency_ratio: nullableNumber(row.m6_timing_consistency_ratio),
        m6_weighted_upside_pct_1d: nullableNumber(row.m6_weighted_upside_pct_1d || row.weighted_upside_pct_1d),
        m6_weighted_upside_pct_1w: nullableNumber(row.m6_weighted_upside_pct_1w || row.weighted_upside_pct_1w),
        m6_weighted_upside_pct_1m: nullableNumber(row.m6_weighted_upside_pct_1m || row.weighted_upside_pct_1m),
        m6_ret_1d_pct: nullableNumber(row.m6_ret_1d_pct),
        m6_ret_1w_pct: nullableNumber(row.m6_ret_1w_pct),
        m6_ret_2w_pct: nullableNumber(row.m6_ret_2w_pct),
        m6_ret_1m_pct: nullableNumber(row.m6_ret_1m_pct || row.ret_1m),

        // C1-L1 structured decision source (single-stock decision brain)
        c1_decision_text: firstText([
          row.c1_decision_text,
          row.c1_decision_output,
          row.decision_output,
          row.final_decision_text,
          row.fcn_decision_note,
          row.decision_reason
        ]),
        c1_decision_label: firstText([
          row.c1_decision_label,
          row.decision_label_c1,
          row.fcn_decision_label,
          row.trade_label
        ]),
        c1_decision_tier: normalizeC1DecisionTier(firstText([
          row.c1_decision_tier,
          row.c1_decision_label,
          row.decision_label_c1,
          row.fcn_decision_label,
          row.trade_label,
          row.c1_decision_text,
          row.c1_decision_output,
          row.decision_output,
          row.final_decision_text,
          row.fcn_decision_note,
          row.decision_reason
        ])),
        c1_strategy: firstText([
          row.c1_strategy,
          row.fcn_strategy,
          row.strategy,
          row.trade_strategy
        ]),

        // Amount / C1 cap
        amt_signal: round2(amtSignal),
        single_suggest_amt: singleSuggest,
        max_addable_amt: maxAddable,
        fcn_cap_amount: capView.cap_amount,
        fcn_cap_source: capView.cap_source,
        fcn_cap_reason: capView.cap_reason,
        fcn_cap_available_amt: capView.cap_available_amt,

        // Decision flags
        m6_market_attractive_score: null,
        m6_market_attractive_components: null,
        m6_direction: null,
        m6_overheat_flag: false,
        m6_market_explain: null,

        allow_fcn: allowF,
        reject_reason: row.reject_reason || row.rejectReason || null,
        why_yes: Array.isArray(row.why_yes) ? row.why_yes : [],
        why_not: Array.isArray(row.why_not) ? row.why_not : []
      };
    })
    .filter(Boolean);
}

// ==========================================
// Volatility v1
// Formula:
// 0.05*abs(1D) + 0.10*abs(2D) + 0.40*abs(1W) + 0.35*abs(MA slope) + 0.10*abs(2W)
// ==========================================

function getWeeklyPricesForVol(stock = {}) {
  const direct = Array.isArray(stock.weekly_prices) ? stock.weekly_prices : null;
  const snapshot = Array.isArray(stock.feature_snapshot?.weekly_prices) ? stock.feature_snapshot.weekly_prices : null;
  const nested = Array.isArray(stock.m7?.feature_snapshot?.weekly_prices) ? stock.m7.feature_snapshot.weekly_prices : null;
  const prices = direct || snapshot || nested || [];
  return prices.map(x => Number(x)).filter(x => Number.isFinite(x) && x > 0);
}

function avgLast(arr, n, offset = 0) {
  const end = arr.length - offset;
  const start = end - n;
  if (start < 0 || end > arr.length || start >= end) return null;
  const slice = arr.slice(start, end);
  if (slice.length !== n) return null;
  return slice.reduce((a, b) => a + b, 0) / n;
}

export function calcShortMaSlopePct(stock = {}, options = {}) {
  const weeklyPrices = getWeeklyPricesForVol(stock);
  const shortWeeks = Number(options.short_ma_weeks || stock.vol_ma_short_weeks || 6);   // ~30 trading days
  const midWeeks = Number(options.mid_ma_weeks || stock.vol_ma_mid_weeks || 13);       // ~65 trading days

  const maShortNow = avgLast(weeklyPrices, shortWeeks, 0);
  const maShortPrev = avgLast(weeklyPrices, shortWeeks, shortWeeks);
  const maMidNow = avgLast(weeklyPrices, midWeeks, 0);

  const hasFormalData = maShortNow !== null && maShortPrev !== null && maMidNow !== null && maShortPrev > 0 && maMidNow > 0;
  if (!hasFormalData) {
    return {
      value: 0,
      source: "missing_weekly_prices",
      method: "formal_ma_slope_missing_no_fallback",
      warning: "missing_weekly_prices_for_formal_ma_slope",
      weekly_count: weeklyPrices.length,
      short_ma_weeks: shortWeeks,
      mid_ma_weeks: midWeeks,
      ma_short_now: maShortNow,
      ma_short_prev: maShortPrev,
      ma_mid_now: maMidNow
    };
  }

  // Two formal, same-base components:
  // 1) slope_pct: short MA change versus previous short window (~30 trading days vs prior ~30 trading days)
  // 2) position_pct: short MA versus mid MA (~30D vs ~65D), captures whether the short MA is above/below trend base.
  // Final MA slope used in Vol score is a transparent blend, still expressed in percent points.
  const slopePct = (maShortNow / maShortPrev - 1) * 100;
  const positionPct = (maShortNow / maMidNow - 1) * 100;
  const value = 0.70 * slopePct + 0.30 * positionPct;

  return {
    value,
    source: "m7_v2.feature_snapshot.weekly_prices",
    method: "0.70*((MA6_now/MA6_prev)-1)*100 + 0.30*((MA6_now/MA13_now)-1)*100",
    warning: null,
    weekly_count: weeklyPrices.length,
    short_ma_weeks: shortWeeks,
    mid_ma_weeks: midWeeks,
    ma_short_now: maShortNow,
    ma_short_prev: maShortPrev,
    ma_mid_now: maMidNow,
    slope_pct: slopePct,
    position_pct: positionPct
  };
}

export function calcVolScoreV1(stock) {
  const d1 = Math.abs(num(stock.ret_1d));
  const d2 = Math.abs(num(stock.ret_2d));
  const w1 = Math.abs(num(stock.ret_1w));
  const maView = calcShortMaSlopePct(stock);
  const ma = Math.abs(num(maView.value));
  const w2 = Math.abs(num(stock.ret_2w));

  const score =
    0.05 * d1 +
    0.10 * d2 +
    0.40 * w1 +
    0.35 * ma +
    0.10 * w2;

  return {
    score,
    components: {
      d1,
      d2,
      w1,
      ma,
      w2,
      formula: "0.05*1D + 0.10*2D + 0.40*1W + 0.35*MA_slope + 0.10*2W",
      ma_slope: maView,
      units: "all components are percent points; MA_slope is formal short-term MA percent slope",
      base_check: maView.warning ? "MA_MISSING_FORMAL_DATA" : "OK_SAME_BASE_PERCENT_POINTS"
    }
  };
}

export function getVolBand(v) {
  const x = num(v);
  if (x < 3) return "low";
  if (x < 7) return "mid";
  if (x < 12) return "high";
  return "extreme";
}

// ==========================================
// M6 Market Attractive Score (ordering only; not admission)
// ==========================================
// M7 decides if a stock can enter the FCN pool.
// M6 Market Attractive decides ordering inside category/pools.
// Direction and overheat are UI explanations only and do not change sorting.

export function calcM6MarketAttractiveScore(s = {}) {
  const r1d = getM6ReturnPct(s, "1d");
  const r1w = getM6ReturnPct(s, "1w");
  const r2w = getM6ReturnPct(s, "2w");
  const r1m = getM6ReturnPct(s, "1m");

  const score =
    0.10 * Math.abs(num(r1d.value)) +
    0.50 * Math.abs(num(r1w.value)) +
    0.25 * Math.abs(num(r2w.value)) +
    0.15 * Math.abs(num(r1m.value));

  return {
    score,
    components: {
      ret_1d: r1d.value,
      ret_1w: r1w.value,
      ret_2w: r2w.value,
      ret_1m: r1m.value,
      ret_1d_source: r1d.source,
      ret_1w_source: r1w.source,
      ret_2w_source: r2w.source,
      ret_1m_source: r1m.source,
      formula: "0.10*abs(1D) + 0.50*abs(1W) + 0.25*abs(2W) + 0.15*abs(1M)",
      units: "percent points; M6 score is market attractiveness / pricing sweetness, not FCN eligibility",
      note: "M6 direction and overheat flag are explanation only; they do not change score or sorting."
    }
  };
}

function getM6ReturnPct(s = {}, horizon) {
  if (horizon === "1d") {
    return firstReturnPct([
      [s.m6_ret_1d_pct, "m6.timing_structure.raw_returns.ret_1d_pct"],
      [s.ret_1d, "runtime.ret_1d"]
    ]);
  }
  if (horizon === "1w") {
    return firstReturnPct([
      [s.m6_ret_1w_pct, "m6.timing_structure.raw_returns.ret_1w_pct"],
      [s.ret_1w, "runtime.ret_1w"]
    ]);
  }
  if (horizon === "2w") {
    const direct = firstReturnPct([
      [s.m6_ret_2w_pct, "m6.timing_structure.raw_returns.ret_2w_pct"],
      [s.ret_2w, "runtime.ret_2w"]
    ], false);
    if (direct.value !== null) return direct;

    const derived = calcRet2wFromWeeklyPrices(s);
    if (derived.value !== null) return derived;

    return { value: 0, source: "missing_ret_2w_no_fallback" };
  }
  if (horizon === "1m") {
    return firstReturnPct([
      [s.m6_ret_1m_pct, "m6.timing_structure.raw_returns.ret_1m_pct"],
      [s.ret_1m, "runtime.ret_1m"]
    ]);
  }
  return { value: 0, source: "unknown_horizon" };
}

function firstReturnPct(pairs, defaultZero = true) {
  for (const [v, source] of pairs || []) {
    const x = nullableNumber(v);
    if (x !== null) return { value: x, source };
  }
  return { value: defaultZero ? 0 : null, source: "missing" };
}

function calcRet2wFromWeeklyPrices(s = {}) {
  const weekly = getWeeklyPricesForVol(s);
  if (weekly.length < 3) return { value: null, source: "missing_weekly_prices_for_ret_2w" };
  const now = weekly[weekly.length - 1];
  const ref = weekly[weekly.length - 3];
  if (!Number.isFinite(now) || !Number.isFinite(ref) || ref <= 0) {
    return { value: null, source: "invalid_weekly_prices_for_ret_2w" };
  }
  return {
    value: (now / ref - 1) * 100,
    source: "m7_v2.feature_snapshot.weekly_prices:last_vs_2w_ago"
  };
}

function calcM6Direction(s = {}) {
  const dir = String(s.m6_short_direction || s.m6_direction || "").toLowerCase();
  if (["up", "down", "sideways", "mixed"].includes(dir)) return dir;

  const r1w = num(getM6ReturnPct(s, "1w").value);
  const r2w = num(getM6ReturnPct(s, "2w").value);
  if (r1w > 0 && r2w > 0) return "up";
  if (r1w < 0 && r2w < 0) return "down";
  if (Math.abs(r1w) < 0.5 && Math.abs(r2w) < 0.5) return "sideways";
  return "mixed";
}

function calcM6OverheatFlag(s = {}) {
  const r1w = num(getM6ReturnPct(s, "1w").value);
  const r2w = num(getM6ReturnPct(s, "2w").value);
  const r1m = num(getM6ReturnPct(s, "1m").value);
  return (r1w >= 8 && r1m >= 20) || (r2w >= 15 && r1m >= 25) || r1m >= 35;
}

function buildM6MarketExplain(s = {}) {
  const direction = calcM6Direction(s);
  const overheat = calcM6OverheatFlag(s);
  const score = nullableNumber(s.m6_market_attractive_score);
  const parts = [];
  if (score !== null) parts.push(`M6 market attractive=${round2(score)}`);
  parts.push(`direction=${direction}`);
  if (overheat) parts.push("⚠ overheat: 市場很甜但價格已加速，排序不扣分，需用 Strike/KI 控制風險");
  return parts.join("｜");
}

function sortByM6Market(a, b) {
  return (num(b.m6_market_attractive_score) - num(a.m6_market_attractive_score)) ||
    (num(b.m7_score) - num(a.m7_score)) ||
    (num(b.max_addable_amt) - num(a.max_addable_amt));
}

// ==========================================
// C1-L1 Decision Output adapter
// ==========================================
// C1 is the single-stock decision source:
// - M7 = FCN eligibility / quality gate
// - C1-L1 = today status, amount, and strategy
// - M6 = market attractive ordering and explanation only

function firstText(values = []) {
  for (const v of values) {
    if (v === undefined || v === null) continue;
    const txt = String(v).trim();
    if (txt) return txt;
  }
  return null;
}

function normalizeC1DecisionTier(raw) {
  const t = String(raw || "").toLowerCase();
  if (!t) return "unknown";

  // Explicit no-trade / reject states.
  if (
    t.includes("不可做") ||
    t.includes("不做") ||
    t.includes("暫停") ||
    t.includes("reject") ||
    t.includes("no trade") ||
    t.includes("blocked")
  ) return "no_trade";

  // Add / highlight states.
  if (
    t.includes("加碼") ||
    t.includes("提高") ||
    t.includes("積極") ||
    t.includes("highlight") ||
    t.includes("add") ||
    t.includes("increase") ||
    t.includes("aggressive")
  ) return "add";

  // Standard / candidate states.
  if (
    t.includes("標準單") ||
    t.includes("候選") ||
    t.includes("可列") ||
    t.includes("standard") ||
    t.includes("candidate")
  ) return "standard";

  // Wait / watch states.
  if (
    t.includes("等待") ||
    t.includes("觀察") ||
    t.includes("不急") ||
    t.includes("watch") ||
    t.includes("wait")
  ) return "watch";

  return "unknown";
}

function classifyPoolByC1Decision(s = {}) {
  const tier = normalizeC1DecisionTier(s.c1_decision_tier || s.c1_decision_label || s.c1_decision_text);

  if (tier === "no_trade") return "reject";
  if (tier === "add") return "highlight";
  if (tier === "standard" || tier === "watch") return "watch";

  // If no structured C1 tier exists, preserve old safe fallback.
  return "simulation";
}

// ==========================================
// Pool classification
// ==========================================

function classifyPools(stocks, options = {}) {
  const pools = {
    highlight: [],
    watch: [],
    simulation: [],
    reject: []
  };

  const m2HotCut = num(options.highlight_m2_cut, 0.8);
  const m2RejectCut = num(options.reject_m2_cut, 0.95);
  const amtSignalCut = num(options.highlight_amt_signal_cut, 0.6);
  const m7PassCut = num(options.m7_pass_cut, 6.0);
  const m7SimulationCut = num(options.m7_simulation_cut, 5.5);
  const m7HighlightCut = num(options.m7_highlight_cut, 8.0);

  for (const s of stocks) {
    const rejectReasons = getRejectReasons(s, { m2RejectCut, m7SimulationCut });

    // v3.7 pool meaning:
    // - Reject is hard reject only: allow_fcn=false / explicit reject / M7<=5.5 / M2 hard limit / extreme vol with high M2.
    // - Simulation is no longer a garbage bucket. It is ONLY the FCN simulation operation base pool.
    // - Amount=0 is still display-only and must not hard reject a stock.
    if (rejectReasons.length) {
      pools.reject.push({
        ...s,
        pool: "reject",
        reject_reasons: rejectReasons,
        reject_level: "hard_reject",
        pool_condition: `Hard reject: M7 <= ${m7SimulationCut}, M2 hard limit, or extreme vol with high M2. Legacy reject_reason/amount=0 do not block Simulation when M7 > threshold.`
      });
      continue;
    }

    const c1Tier = normalizeC1DecisionTier(s.c1_decision_tier || s.c1_decision_label || s.c1_decision_text);
    const m7Score = num(s.m7_score);
    const hasAmount = num(s.max_addable_amt) > 0 || num(s.single_suggest_amt) > 0;
    const amountNote = hasAmount ? "c1_amount_available" : "c1_amount_unavailable_display_only";
    const watchReasons = buildWatchReasons(s, { m2HotCut, amtSignalCut });

    // Today Highlight: M7 selected/high-score names. C1 amount may be 0; still show it here.
    if (m7Score >= m7HighlightCut || c1Tier === "add") {
      pools.highlight.push({
        ...s,
        pool: "highlight",
        reject_reasons: [],
        amount_status: amountNote,
        why_yes: buildWhyYes(s),
        pool_condition: `Today Highlight: M7 score >= ${m7HighlightCut} or C1=add; M6 score sorts order; C1 amount is displayed only.`,
        c1_decision_source_used: c1Tier !== "unknown"
      });
      continue;
    }

    // Watch: M7 pass but not high-score / or C1 says standard/watch.
    if (m7Score >= m7PassCut || c1Tier === "standard" || c1Tier === "watch") {
      pools.watch.push({
        ...s,
        pool: "watch",
        reject_reasons: [],
        amount_status: amountNote,
        why_not: watchReasons,
        pool_condition: `Watch: M7 score >= ${m7PassCut} but below highlight, or C1=standard/watch; M6 score sorts order.`,
        c1_decision_source_used: c1Tier !== "unknown"
      });
      continue;
    }

    // Simulation: ONLY for FCN simulation operation.
    // Rule: M7 > 5.5, sorted by M6 market attractive score.
    // This keeps HYBRID and aggressive basket experiments supplied with borderline-but-usable names.
    if (m7Score > m7SimulationCut) {
      pools.simulation.push({
        ...s,
        pool: "simulation",
        reject_reasons: [],
        amount_status: amountNote,
        why_not: watchReasons,
        pool_condition: `Simulation only: FCN simulation operation base pool; M7 score > ${m7SimulationCut}; M6 market attractive sorts order.`,
        c1_decision_source_used: c1Tier !== "unknown"
      });
      continue;
    }
  }

  Object.keys(pools).forEach(k => pools[k].sort(sortByM6Market));

  // v3.6 IMPORTANT:
  // mm/test.html iterates Object.entries(pools) and expects every value to be an array.
  // Do NOT attach enumerable metadata like pools._stats or pools._conditions,
  // otherwise test.html will call rows.forEach on an object and crash.
  Object.defineProperty(pools, "_stats", {
    value: buildPoolStats(pools),
    enumerable: false,
    configurable: true
  });
  Object.defineProperty(pools, "_conditions", {
    value: {
      highlight: `M7 score >= ${m7HighlightCut} OR C1 tier=add; amount can be 0 but remains visible.`,
      watch: `M7 score >= ${m7PassCut} but < ${m7HighlightCut}, OR C1 tier=standard/watch.`,
      simulation: `M7 score > ${m7SimulationCut}; ONLY for FCN simulation operation; sorted by M6 market attractive score.`,
      reject: `Hard reject only: M7 <= ${m7SimulationCut} / M2 >= ${Math.round(m2RejectCut * 100)}% / extreme vol with high M2. Legacy reject_reason and amount=0 are display-only when M7 > threshold.`
    },
    enumerable: false,
    configurable: true
  });
  return pools;
}

function getRejectReasons(s, { m2RejectCut, m7SimulationCut = 5.5 }) {
  const reasons = [];
  const m7Score = num(s.m7_score);

  // v4.0 rule:
  // Pool Review is quality-first. Historical/source reject_reason or amount=0 must not block
  // a stock with M7 > simulation threshold from entering Simulation.
  // Only true hard blockers remain hard reject.
  const explicitNoFcn =
    s.allow_fcn === false ||
    s.is_blocked === true ||
    s.isRejected === true ||
    s.isRejected === "true";

  if (explicitNoFcn && m7Score <= m7SimulationCut) {
    reasons.push("explicit_no_fcn_and_m7_below_simulation_cut");
  }

  // M7 <= 5.5 is the hard quality reject threshold.
  if (m7Score <= m7SimulationCut) {
    reasons.push(`m7_score<=${m7SimulationCut}`);
  }

  if (s.m2_util >= m2RejectCut) reasons.push(`m2_util>=${Math.round(m2RejectCut * 100)}%`);
  if (s.vol_band === "extreme" && s.m2_util >= 0.8) reasons.push("extreme_vol_with_high_m2");

  // Legacy/source reject_reason is now informational only when M7 > 5.5.
  // It is preserved on the row but does not force Reject in Pool Review.
  // max_addable_amt <= 0 is NOT reject here.
  return reasons;
}

function buildPoolStats(pools = {}) {
  const statOne = (list = []) => {
    const m7 = list.map(x => num(x.m7_score));
    const m6 = list.map(x => num(x.m6_market_attractive_score));
    const amt = list.map(x => num(x.max_addable_amt));
    return {
      count: list.length,
      mean_m7: round2(avg(m7)),
      std_m7: round2(std(m7)),
      cv_m7: round2(cv(m7)),
      mean_m6_market: round2(avg(m6)),
      std_m6_market: round2(std(m6)),
      cv_m6_market: round2(cv(m6)),
      total_max_addable_amt: amt.reduce((a, b) => a + b, 0),
      no_amount_count: list.filter(x => num(x.max_addable_amt) <= 0).length
    };
  };
  return {
    highlight: statOne(pools.highlight),
    watch: statOne(pools.watch),
    simulation: statOne(pools.simulation),
    reject: statOne(pools.reject)
  };
}

function buildWhyYes(s) {
  const out = [];
  if (s.c1_decision_tier && s.c1_decision_tier !== "unknown") out.push(`C1=${s.c1_decision_tier}`);
  if (s.c1_strategy) out.push(`策略=${s.c1_strategy}`);
  if (s.single_suggest_amt > 0) out.push(`今日建議 ${money(s.single_suggest_amt)}`);
  if (s.m7_score >= 6) out.push(`M7 可做 FCN (${round2(s.m7_score)})`);
  if (s.m6_market_attractive_score !== null) out.push(`M6 market attractive ${round2(s.m6_market_attractive_score)}`);
  if (s.m6_direction) out.push(`M6 direction=${s.m6_direction}`);
  if (s.m6_overheat_flag) out.push("⚠ 過熱提示：排序不扣分，需用 Strike/KI 控制");
  if (s.vol_band !== "extreme") out.push(`波動率 ${s.vol_band}`);
  if (s.m2_util < 0.8) out.push("M2 曝險未過熱");
  if (s.max_addable_amt > 0) out.push(`可加碼 ${money(s.max_addable_amt)}`);
  return out;
}

function buildWatchReasons(s, { m2HotCut, amtSignalCut }) {
  const out = [];
  if (s.c1_decision_tier && s.c1_decision_tier !== "unknown") out.push(`C1=${s.c1_decision_tier}`);
  if (s.c1_strategy) out.push(`策略=${s.c1_strategy}`);
  if (s.single_suggest_amt > 0) out.push(`今日建議 ${money(s.single_suggest_amt)}`);
  if (s.vol_band === "extreme") out.push("vol=extreme");
  if (s.m2_util >= m2HotCut) out.push(`m2_util>=${Math.round(m2HotCut * 100)}%`);
  if (s.amt_signal <= amtSignalCut) out.push(`amt_signal<=${amtSignalCut}`);
  if (s.max_addable_amt <= 0) out.push("amount=0");
  if (s.m6_overheat_flag) out.push("m6_overheat_warning_only");
  return out;
}

function isTimingHot(x) {
  const v = String(x || "").toLowerCase();
  return v.includes("hot") || v.includes("overheat") || v.includes("too_hot");
}

// ==========================================
// Category
// ==========================================

function buildCategoryMap(stocks) {
  const map = {};
  CATEGORY_ORDER.forEach(c => map[c] = []);

  for (const s of stocks) {
    const c = map[s.category] ? s.category : "unknown";
    if (!map[c]) map[c] = [];
    map[c].push(s);
  }

  Object.keys(map).forEach(k => {
    map[k].sort(sortByM6Market);
  });

  // Non-enumerable-like compatibility is not available in JSON, so expose stats separately
  // through summary.category_stats; category_map itself still contains FULL lists, not top-5.
  return map;
}

// ==========================================
// Basket build
// ==========================================

async function buildAllBaskets({ pools, category_map, stocks, options }) {
  const baskets = [];

  // 1. M6 Market Top
  const top = pools.highlight.slice(0, 4);
  if (top.length >= 2) {
    baskets.push(await buildBasket({
      id: "M6_MARKET_TOP",
      style: "rational",
      stocks: top.slice(0, 4),
      structure: options.market_top_structure || options.priority_structure || { KI: 55, Strike: 65, T: 6, type: "AKI", marketYield: 0 }
    }));
  }

  // 2. Category Balanced
  const balanced = [];
  for (const c of CATEGORY_ORDER) {
    const first = (category_map[c] || []).find(s => s.allow_fcn && s.max_addable_amt > 0);
    if (first) balanced.push(first);
  }
  if (balanced.length >= 3) {
    baskets.push(await buildBasket({
      id: "CATEGORY_BALANCED",
      style: "conservative",
      stocks: balanced.slice(0, 5),
      structure: options.balanced_structure || { KI: 55, Strike: 65, T: 9, type: "EKI", marketYield: 0 }
    }));
  }

  // 3. Hybrid simulation groups
  // HYBRID keeps the original good logic: highlight + simulation + watch.
  // v3.7 adds multiple slices so sandbox can compare more than one mixed basket.
  const hybridGroups = buildHybridSimulationGroups(pools, options);
  for (const group of hybridGroups) {
    if (group.stocks.length >= 3) {
      baskets.push(await buildBasket({
        id: group.id,
        style: "rational",
        stocks: group.stocks,
        structure: options.hybrid_structure || { KI: 55, Strike: 65, T: 6, type: "AKI", marketYield: 0 }
      }));
    }
  }

  // 4. Conservative Special: NVDA/TSM + low vol large caps/ETF
  const special = buildConservativeSpecial(stocks);
  if (special.length >= 4) {
    baskets.push(await buildBasket({
      id: "CONSERVATIVE_SPECIAL",
      style: "conservative_special",
      stocks: special.slice(0, 5),
      structure: options.special_structure || { KI: 70, Strike: 70, T: 9, type: "AKI", marketYield: 0 }
    }));
  }

  // 5. Aggressive: high + mid + low vol mix, simulation pool first.
  // v3.7: AGGRESSIVE_MIX joins FCN simulation workflow and prioritizes simulation pool names.
  const aggressive = buildAggressiveMixFromPools(pools);
  if (aggressive.length >= 3) {
    baskets.push(await buildBasket({
      id: "AGGRESSIVE_MIX",
      style: "aggressive",
      stocks: aggressive.slice(0, 5),
      structure: options.aggressive_structure || { KI: 50, Strike: 65, T: 7, type: "EKI", marketYield: 0 }
    }));
  }

  return baskets;
}

function buildHybridSimulationGroups(pools = {}, options = {}) {
  const groupCount = Math.max(1, Math.floor(num(options.hybrid_group_count, 3)));
  const groups = [];

  for (let i = 0; i < groupCount; i += 1) {
    const highlightStart = i;
    const simulationStart = i * 3;
    const watchStart = i;

    const id = i === 0 ? "HYBRID" : `HYBRID_${i + 1}`;
    const stocks = uniqueBySymbol([
      ...pools.highlight.slice(highlightStart, highlightStart + 2),
      ...pools.simulation.slice(simulationStart, simulationStart + 3),
      ...pools.watch.slice(watchStart, watchStart + 2)
    ]).slice(0, 5);

    groups.push({ id, stocks });
  }

  return groups;
}

function buildConservativeSpecial(stocks) {
  const preferred = new Set(FCN_BASKET_RULES.conservative_special.preferred_symbols);
  const required = stocks
    .filter(s => ["NVDA", "TSM"].includes(s.symbol) && s.allow_fcn && s.max_addable_amt > 0)
    .sort(sortByM6Market);

  const companions = stocks
    .filter(s =>
      preferred.has(s.symbol) &&
      s.vol_band !== "extreme"
    )
    .sort((a, b) => {
      const volRank = volBandRank(a.vol_band) - volBandRank(b.vol_band);
      if (volRank !== 0) return volRank;
      return sortByM6Market(a, b);
    });

  if (!required.length) return [];
  return uniqueBySymbol([required[0], ...companions]);
}

function buildAggressiveMixFromPools(pools = {}) {
  const base = uniqueBySymbol([
    ...(pools.simulation || []),
    ...(pools.watch || []),
    ...(pools.highlight || [])
  ]);

  const eligible = base.filter(s =>
    s.vol_band !== "extreme"
  );

  const high = eligible.filter(s => s.vol_band === "high").sort(sortByM6Market).slice(0, 2);
  const mid = eligible.filter(s => s.vol_band === "mid").sort(sortByM6Market).slice(0, 2);
  const low = eligible.filter(s => s.vol_band === "low").sort(sortByM6Market).slice(0, 2);

  return uniqueBySymbol([...high, ...mid, ...low]);
}

async function buildBasket({ id, style, stocks, structure }) {
  const clean = uniqueBySymbol(stocks).filter(Boolean);
  const symbols = clean.map(s => s.symbol);
  const caps = clean.map(s => num(s.max_addable_amt));
  const basket_cap = caps.length ? Math.min(...caps) : 0;

  const avg_score = avg(clean.map(s => s.m6_market_attractive_score));
  const avg_vol = avg(clean.map(s => s.vol_score));
  const avg_m2_util = avg(clean.map(s => s.m2_util));
  const vol_mix = countBy(clean, "vol_band");

  const rule_check = checkBasketRule(style, clean, structure);

  const m8 = await runM8Safe({
    caseName: id,
    symbols,
    KI: structure.KI,
    Strike: structure.Strike,
    T: structure.T,
    type: structure.type,
    marketYield: structure.marketYield ?? 0
  });

  return {
    id,
    style,
    style_label: FCN_BASKET_RULES[style]?.label || style,
    symbols,
    stocks: clean,
    structure: {
      KI: structure.KI,
      Strike: structure.Strike,
      T: structure.T,
      type: structure.type,
      marketYield: structure.marketYield ?? 0
    },
    basket_cap,
    avg_m6_market_attractive: round2(avg_score),
    avg_vol: round2(avg_vol),
    avg_m2_util: round2(avg_m2_util),
    vol_mix,
    rule_check,
    m8,
    fair_yield: m8?.fair_yield ?? null,
    pricing_view: m8?.pricing_view ?? "unknown"
  };
}

async function runM8Safe(args) {
  try {
    return await runM8Case(args);
  } catch (error) {
    console.warn("[MM Filter] M8 error:", args?.caseName, error);
    return {
      error: true,
      message: error?.message || String(error),
      fair_yield: null,
      pricing_view: "m8_error"
    };
  }
}

function checkBasketRule(style, stocks, structure) {
  const rule = FCN_BASKET_RULES[style] || {};
  const reasons = [];
  let pass = true;

  if (rule.stock_count_min && stocks.length < rule.stock_count_min) {
    pass = false;
    reasons.push(`stocks<${rule.stock_count_min}`);
  }
  if (rule.stock_count_max && stocks.length > rule.stock_count_max) {
    pass = false;
    reasons.push(`stocks>${rule.stock_count_max}`);
  }
  if (rule.ki_min !== undefined && num(structure.KI) < rule.ki_min) {
    pass = false;
    reasons.push(`KI<${rule.ki_min}`);
  }
  if (rule.ki_max !== undefined && num(structure.KI) > rule.ki_max) {
    pass = false;
    reasons.push(`KI>${rule.ki_max}`);
  }
  if (rule.ki_hard_max !== undefined && num(structure.KI) > rule.ki_hard_max) {
    pass = false;
    reasons.push(`KI>${rule.ki_hard_max}`);
  }
  if (rule.strike_min !== undefined && num(structure.Strike) < rule.strike_min) {
    pass = false;
    reasons.push(`Strike<${rule.strike_min}`);
  }
  if (rule.strike_max !== undefined && num(structure.Strike) > rule.strike_max) {
    pass = false;
    reasons.push(`Strike>${rule.strike_max}`);
  }
  if (rule.strike !== undefined && num(structure.Strike) !== rule.strike) {
    reasons.push(`Strike!=${rule.strike}`);
  }
  if (rule.strike_equals_ki && num(structure.Strike) !== num(structure.KI)) {
    pass = false;
    reasons.push("Strike!=KI");
  }
  if (rule.tenor_min !== undefined && num(structure.T) < rule.tenor_min) {
    pass = false;
    reasons.push(`Tenor<${rule.tenor_min}`);
  }
  if (rule.tenor_max !== undefined && num(structure.T) > rule.tenor_max) {
    pass = false;
    reasons.push(`Tenor>${rule.tenor_max}`);
  }
  if (Array.isArray(rule.type) && !rule.type.includes(String(structure.type || "").toUpperCase())) {
    pass = false;
    reasons.push(`Type not in ${rule.type.join("/")}`);
  }
  if (Array.isArray(rule.required_any) && rule.required_any.length) {
    const symbols = new Set(stocks.map(s => s.symbol));
    if (!rule.required_any.some(x => symbols.has(x))) {
      pass = false;
      reasons.push(`Missing required any: ${rule.required_any.join("/")}`);
    }
  }

  return {
    pass,
    reasons,
    rule_label: rule.label || style
  };
}

// ==========================================
// Allocation v0
// ==========================================

function allocateBasketsV0({ baskets, stocks, totalCapacity }) {
  const inferredCapacity = Math.max(...stocks.map(s => num(s.max_addable_amt)), 0);
  let remaining = Number.isFinite(Number(totalCapacity)) ? Number(totalCapacity) : inferredCapacity;

  const rows = [];

  baskets.forEach((basket, idx) => {
    if (remaining <= 0) return;

    const suggested = getDefaultBasketSuggestedAmount(basket, idx);
    const finalAlloc = Math.max(0, Math.min(
      num(basket.basket_cap),
      num(suggested),
      remaining
    ));

    rows.push({
      rank: idx + 1,
      basket_id: basket.id,
      style: basket.style,
      symbols: basket.symbols,
      basket_cap: num(basket.basket_cap),
      suggested_amt: suggested,
      final_alloc_amt: finalAlloc,
      remaining_before: remaining,
      remaining_after: remaining - finalAlloc,
      reason: idx === 0 ? "Optimal A" : `${idx + 1}nd basket`
    });

    remaining -= finalAlloc;
  });

  return {
    total_capacity: Number.isFinite(Number(totalCapacity)) ? Number(totalCapacity) : inferredCapacity,
    allocated: rows.reduce((sum, r) => sum + num(r.final_alloc_amt), 0),
    remaining,
    rows
  };
}

function getDefaultBasketSuggestedAmount(basket, idx) {
  if (idx === 0) return Math.min(30000, num(basket.basket_cap));
  return Math.min(10000, num(basket.basket_cap));
}

// ==========================================
// Market Order Match + M8
// ==========================================

async function evaluateMarketOrder(order, stocks) {
  const normalizedOrder = normalizeOrder(order);
  const stockMap = Object.fromEntries(stocks.map(s => [s.symbol, s]));

  const matched = [];
  const rejected = [];

  normalizedOrder.symbols.forEach(sym => {
    const s = stockMap[sym];

    if (!s) {
      rejected.push({ symbol: sym, reason: "not_in_c1_pool" });
      return;
    }

    const stockReasons = getRejectReasons(s, { m2RejectCut: 0.95 });
    if (stockReasons.length) {
      rejected.push({ symbol: sym, reason: stockReasons.join(",") });
      return;
    }

    matched.push(s);
  });

  const matchPct = normalizedOrder.symbols.length
    ? (matched.length / normalizedOrder.symbols.length) * 100
    : 0;

  const m8 = await runM8Safe({
    caseName: normalizedOrder.order_id || "MARKET_ORDER",
    symbols: normalizedOrder.symbols,
    KI: normalizedOrder.KI,
    Strike: normalizedOrder.Strike,
    T: normalizedOrder.T,
    type: normalizedOrder.type,
    marketYield: normalizedOrder.marketYield
  });

  const fair = nullableNumber(m8?.fair_yield);
  const market = nullableNumber(normalizedOrder.marketYield);
  const delta = fair === null || market === null ? null : round2(market - fair);

  const pricingView = delta === null
    ? "unknown"
    : delta >= 2 ? "cheap"
    : delta >= 0.5 ? "slightly_cheap"
    : delta > -0.5 ? "fair"
    : delta > -2 ? "rich"
    : "very_rich";

  const action = decideMarketOrderAction({ matchPct, pricingView, rejected });
  const basketCap = matched.length ? Math.min(...matched.map(s => num(s.max_addable_amt))) : 0;
  const suggestedAmt = decideMarketOrderAmount({ action, basketCap });

  return {
    order: normalizedOrder,
    match_pct: round2(matchPct),
    matched: matched.map(s => s.symbol),
    rejected,
    basket_cap: basketCap,
    fair_yield: fair,
    market_yield: market,
    pricing_delta: delta,
    pricing_view: pricingView,
    action,
    suggested_amt: suggestedAmt,
    m8,
    outliers: buildOutlierAnalysis({ order: normalizedOrder, matched, rejected, m8 })
  };
}

function normalizeOrder(order) {
  return {
    order_id: order.order_id || order.id || `ORDER_${Math.random().toString(36).slice(2, 7)}`,
    bank: order.bank || order.broker || "BANK",
    symbols: (order.symbols || order.basket || [])
      .map(safeUpper)
      .filter(Boolean),
    KI: firstFinite([order.KI, order.ki], 55),
    Strike: firstFinite([order.Strike, order.strike], 65),
    T: firstFinite([order.T, order.tenor, order.period], 6),
    type: String(order.type || "EKI").toUpperCase(),
    marketYield: firstFinite([order.marketYield, order.market_yield, order.rate, order.coupon], 0),
    notional: firstFinite([order.notional, order.amount], 0)
  };
}

function decideMarketOrderAction({ matchPct, pricingView, rejected }) {
  if (rejected.length > 0 && matchPct < 100) return "REVIEW";
  if (matchPct === 100 && ["cheap", "slightly_cheap"].includes(pricingView)) return "FOLLOW";
  if (matchPct >= 80 && pricingView === "fair") return "NEGOTIATE";
  if (["rich", "very_rich"].includes(pricingView)) return "REJECT";
  return "REVIEW";
}

function decideMarketOrderAmount({ action, basketCap }) {
  if (action === "FOLLOW") return basketCap;
  if (action === "NEGOTIATE") return Math.floor(basketCap * 0.5);
  return 0;
}

function buildOutlierAnalysis({ order, matched, rejected, m8 }) {
  const out = [];

  rejected.forEach(r => {
    out.push({
      symbol: r.symbol,
      type: "stock_reject",
      reason: r.reason
    });
  });

  const highM2 = matched.filter(s => s.m2_util >= 0.8);
  highM2.forEach(s => out.push({
    symbol: s.symbol,
    type: "m2_hot",
    reason: `m2_util=${round2(s.m2_util * 100)}%`
  }));

  const extremeVol = matched.filter(s => s.vol_band === "extreme");
  extremeVol.forEach(s => out.push({
    symbol: s.symbol,
    type: "vol_extreme",
    reason: `vol_score=${s.vol_score}`
  }));

  if (m8?.error) {
    out.push({
      symbol: "BASKET",
      type: "m8_error",
      reason: m8.message
    });
  }

  return out;
}

// ==========================================
// Summary
// ==========================================

function buildSummary({ stocks, pools, category_map, baskets, allocation, market_match }) {
  const m6MarketArr = stocks.map(s => num(s.m6_market_attractive_score));
  const volArr = stocks.map(s => num(s.vol_score));
  const m2Arr = stocks.map(s => num(s.m2_util));

  const marketMatchFull = market_match.filter(x => x.match_pct === 100).length;
  const marketFollow = market_match.filter(x => x.action === "FOLLOW").length;

  return {
    total_stocks: stocks.length,

    data_coverage: {
      c1_ready: stocks.length,
      with_m1_score: stocks.filter(s => s.m1_score !== null).length,
      with_m7_score: stocks.filter(s => s.m7_score !== null).length,
      with_m7_v2_score: stocks.filter(s => s.m7_v2_score !== null).length,
      m7_v2_primary: stocks.filter(s => s.m7_score_source === "m7_v2_score" || s.m7_score_source === "m7_effective_score").length,
      legacy_m7_fallback: stocks.filter(s => s.m7_score_source === "legacy_m7_score").length,
      with_amount: stocks.filter(s => num(s.max_addable_amt) > 0).length,
      with_m6_market_score: stocks.filter(s => nullableNumber(s.m6_market_attractive_score) !== null).length,
      with_c1_decision_tier: stocks.filter(s => s.c1_decision_tier && s.c1_decision_tier !== "unknown").length
    },

    score_health: {
      m6_market_mean: round2(avg(m6MarketArr)),
      m6_market_std: round2(std(m6MarketArr)),
      m6_market_cv: round2(cv(m6MarketArr)),
      vol_mean: round2(avg(volArr)),
      vol_std: round2(std(volArr)),
      vol_cv: round2(cv(volArr)),
      m2_mean: round2(avg(m2Arr))
    },

    pools: {
      highlight: pools.highlight.length,
      watch: pools.watch.length,
      simulation: pools.simulation.length,
      reject: pools.reject.length
    },
    pool_conditions: pools._conditions || {},
    pool_stats: pools._stats || {},

    category: Object.fromEntries(
      Object.entries(category_map).map(([k, list]) => [
        k,
        {
          count: list.length,
          mean_m6_market: round2(avg(list.map(x => x.m6_market_attractive_score))),
          std_m6_market: round2(std(list.map(x => x.m6_market_attractive_score))),
          cv_m6_market: round2(cv(list.map(x => x.m6_market_attractive_score))),
          avg_vol: round2(avg(list.map(x => x.vol_score))),
          total_max_addable: list.reduce((sum, x) => sum + num(x.max_addable_amt), 0)
        }
      ])
    ),

    baskets: {
      generated: baskets.length,
      m8_runnable: baskets.filter(b => !b.m8?.error).length,
      best_fair_yield: round2(Math.max(...baskets.map(b => num(b.fair_yield)), 0))
    },

    allocation: {
      total_capacity: allocation.total_capacity,
      allocated: allocation.allocated,
      remaining: allocation.remaining
    },

    market_order_match: {
      input_orders: market_match.length,
      full_match: marketMatchFull,
      follow: marketFollow,
      outliers: market_match.reduce((sum, x) => sum + (x.outliers?.length || 0), 0)
    }
  };
}

// ==========================================
// Utilities
// ==========================================

function clamp(v, min, max) {
  const x = num(v, min);
  return Math.max(min, Math.min(max, x));
}


function num(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function nullableNumber(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function firstFinite(values, d = 0) {
  for (const v of values) {
    const x = Number(v);
    if (Number.isFinite(x)) return x;
  }
  return d;
}

function normalizeRatio(v) {
  const x = num(v, 0);
  return x > 1 ? x / 100 : x;
}

function normalizeCategory(x) {
  const s = String(x || "").trim().toLowerCase();
  if (s === "defense") return "defensive";
  if (s === "incoming") return "income";
  if (CATEGORY_ORDER.includes(s)) return s;
  return "unknown";
}

function safeUpper(x) {
  return String(x || "").trim().toUpperCase();
}

function avg(arr) {
  const clean = arr.map(Number).filter(Number.isFinite);
  if (!clean.length) return 0;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function std(arr) {
  const clean = arr.map(Number).filter(Number.isFinite);
  if (clean.length <= 1) return 0;
  const m = avg(clean);
  const v = avg(clean.map(x => Math.pow(x - m, 2)));
  return Math.sqrt(v);
}

function cv(arr) {
  const m = avg(arr);
  if (!m) return 0;
  return std(arr) / m;
}

function round2(v) {
  const x = Number(v);
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : null;
}

function uniqueBySymbol(list) {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    const sym = item?.symbol;
    if (!sym || seen.has(sym)) continue;
    seen.add(sym);
    out.push(item);
  }
  return out;
}

function countBy(list, key) {
  return (list || []).reduce((acc, x) => {
    const k = x?.[key] || "unknown";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

function volBandRank(band) {
  const map = { low: 1, mid: 2, high: 3, extreme: 4 };
  return map[band] || 9;
}

function money(v) {
  return `USD ${Math.round(num(v)).toLocaleString()}`;
}

