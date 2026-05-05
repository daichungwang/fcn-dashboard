// ==========================================
// MM FILTER ENGINE v3.0 SANDBOX
// C1 Output -> Vol v1 -> Pool -> Basket -> Allocation v0 -> M8 -> Market Order Match
// Path suggestion: js/mm/modules/mm_filter.js
// NOTE: sandbox only. Do not modify formal MM dashboard / m7_basket.html yet.
// ==========================================

import { runM8Case } from "../core/m8_batch_engine.js";

// ------------------------------------------
// Public API
// ------------------------------------------
export async function runMMFilterFull(input = {}) {
  const stocks = normalizeStocks(input.stocks || []);
  const marketOrders = input.market_orders || [];
  const options = normalizeOptions(input.options || {});

  // 1) Volatility v1
  stocks.forEach((s) => {
    s.vol_inputs = getVolInputs(s);
    s.vol_score = calcVolScoreV1(s);
    s.vol_band = getVolBand(s.vol_score);
  });

  // 2) Pool classification
  const pools = buildPools(stocks, options);

  // 3) Category summary
  const category_map = buildCategoryMap(stocks);
  const category_summary = buildCategorySummary(category_map);

  // 4) Basket candidates
  const baskets = await buildBasketCandidates({ pools, category_map, options });

  // 5) Allocation v0
  const allocation = allocateV0({ stocks, baskets, options });

  // 6) Market order match
  const market_match = await Promise.all(
    marketOrders.map((order, idx) => evaluateMarketOrder(order, stocks, options, idx))
  );

  // 7) Overall review
  const summary = buildOverallSummary({ stocks, pools, baskets, allocation, market_match, category_summary });

  return {
    meta: {
      engine: "mm_filter_v3_FULL_M8_MARKET_MATCH",
      sandbox: true,
      m8_engine: "../core/m8_batch_engine.js/runM8Case",
      vol_formula: "0.05*abs(1D)+0.10*abs(2D)+0.40*abs(1W)+0.35*abs(MA slope)+0.10*abs(2W)",
      allocation_rule: "basket_cap=min(stock max_addable_amt); final_alloc=min(basket_cap, remaining_capacity)",
      generated_at: new Date().toISOString()
    },
    summary,
    pools,
    category_map,
    category_summary,
    baskets,
    allocation,
    market_match,
    raw: stocks
  };
}

// Backward compatible alias for simple test pages.
window.runMMFilterFull = runMMFilterFull;

// ------------------------------------------
// Options / Rules
// ------------------------------------------
function normalizeOptions(options) {
  return {
    today_total_capacity: num(options.today_total_capacity, null),
    highlight_priority_min: num(options.highlight_priority_min, 75),
    highlight_m2_util_max: num(options.highlight_m2_util_max, 0.8),
    highlight_amt_signal_min: num(options.highlight_amt_signal_min, 0.6),
    reject_m2_util_hard_max: num(options.reject_m2_util_hard_max, 0.95),
    reject_extreme_vol: options.reject_extreme_vol !== false,
    m8_default: {
      KI: num(options?.m8_default?.KI, 55),
      Strike: num(options?.m8_default?.Strike ?? options?.m8_default?.strike, 65),
      T: num(options?.m8_default?.T ?? options?.m8_default?.tenor, 6),
      type: String(options?.m8_default?.type || "AKI")
    },
    basket_rules: getBasketRules()
  };
}

function getBasketRules() {
  return {
    conservative: {
      label: "保守單",
      rate_min: 12,
      rate_max: 16,
      stock_count_min: 3,
      stock_count_max: 5,
      preferred_vol_bands: ["low", "mid"],
      preferred_symbols: ["SMH", "QQQ", "LQD", "GOOG", "AAPL", "AMZN", "SPY"],
      KI_min: 50,
      KI_max: 55,
      Strike_min: 60,
      Strike_max: 65,
      T_min: 6,
      T_max: 12,
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
      KI_max: 75,
      strike_equals_ki: true,
      T_min: 9,
      T_max: 12,
      type: ["AKI", "DACN"],
      guaranteed_coupon_months: 3
    },
    rational: {
      label: "合理單",
      rate_min: 15,
      rate_max: 19,
      stock_count_min: 3,
      stock_count_max: 4,
      preferred_vol_bands: ["mid", "low"],
      KI_min: 50,
      KI_base_max: 55,
      KI_hard_max: 70,
      Strike: 65,
      T_min: 6,
      T_max: 9,
      type: ["EKI", "AKI"]
    },
    aggressive: {
      label: "積極單",
      rate_min: 19,
      rate_max: 25,
      stock_count_min: 3,
      stock_count_max: 5,
      vol_mix: { high: [1, 2], mid: [1, 2], low: [1, 2] },
      KI: 50,
      Strike: 65,
      T_min: 7,
      T_max: 9,
      type: ["EKI"]
    }
  };
}

// ------------------------------------------
// Normalize C1 / M1 / M7 / M2 / M6 rows
// ------------------------------------------
function normalizeStocks(rows) {
  return rows
    .map((r) => {
      const symbol = safeUpper(r.symbol || r.ticker || r["股號"]);
      if (!symbol) return null;

      const priorityScore = firstNumber(r.priority_score, r.today_score, r.m7_score, r.total, r.score, 0);
      const m2Util = firstNumber(r.m2_util, r.m2_utilization, r.exposure_ratio, r?.m2?.utilization, 0);
      const maxAddable = firstNumber(r.max_addable_amt, r.max_addable, r.suggested_cap, r?.amount?.max_addable_amt, 0);
      const singleSuggest = firstNumber(r.single_suggest_amt, r.today_suggest_amt, r.today_suggest, r?.amount?.single_suggest_amt, 0);
      const amtSignal = firstNumber(r.amt_signal, r.amount_strength, r.m6_amount_strength, r?.amount?.amt_signal, maxAddable > 0 ? 0.5 : 0);

      const allowFCN = r.allow_fcn !== false && r.is_blocked !== true && r.isBlocked !== true;
      const rejectReason = r.reject_reason || r.rejectReason || null;

      return {
        ...r,
        symbol,
        name: r.name || r["股名"] || r.company || symbol,
        category: normalizeCategory(r.category || r.m1_category || r.pool_category),

        m1_status: r.m1_status || (r.m1_score != null ? "ok" : "unknown"),
        m1_score: firstNumber(r.m1_score, r.m1_quality, null),

        m7_status: r.m7_status || r.m7_pool || "unknown",
        m7_score: firstNumber(r.m7_score, r.today_score, r.total, null),
        priority_score: priorityScore,
        today_score: firstNumber(r.today_score, r.total, priorityScore),
        valuation_score: firstNumber(r.valuation_score, r.valuation, null),
        trend_score: firstNumber(r.trend_score, r.trend, null),
        structure_score: firstNumber(r.structure_score, r.structure, null),

        m2_util: m2Util,
        m2_flag: r.m2_flag || r.m2_risk_flag || utilFlag(m2Util),
        m2_exposure_amt: firstNumber(r.m2_exposure_amt, r.exposure_amt, r?.m2?.amount, 0),
        m2_fcn_count: firstNumber(r.m2_fcn_count, r.fcn_count, r?.m2?.count, 0),

        m6_timing: String(r.m6_timing || r.timing_mode || r.decision_label || r.decision_mode || "unknown").toLowerCase(),
        m6_position: r.m6_position || r.price_position || "unknown",

        amt_signal: amtSignal,
        single_suggest_amt: singleSuggest,
        max_addable_amt: maxAddable,

        allow_fcn: allowFCN,
        reject_reason: rejectReason,
        why_yes: Array.isArray(r.why_yes) ? r.why_yes : [],
        why_not: Array.isArray(r.why_not) ? r.why_not : []
      };
    })
    .filter(Boolean);
}

function normalizeCategory(c) {
  const x = String(c || "unknown").toLowerCase();
  if (x === "defense") return "defensive";
  if (x === "incoming") return "income";
  if (["core", "growth", "income", "defensive", "speculative"].includes(x)) return x;
  return "unknown";
}

// ------------------------------------------
// Volatility v1
// Formula: 0.05*1D + 0.10*2D + 0.40*1W + 0.35*MA slope + 0.10*2W
// ------------------------------------------
function getVolInputs(s) {
  return {
    d1: Math.abs(firstNumber(s.ret_1d, s.delta_1d, s.ret_1d_pct, s?.timing_structure?.raw_returns?.ret_1d_pct, 0)),
    d2: Math.abs(firstNumber(s.ret_2d, s.delta_2d, s.ret_d2, estimate2D(s), 0)),
    w1: Math.abs(firstNumber(s.ret_1w, s.delta_1w, s.ret_1w_pct, s?.timing_structure?.raw_returns?.ret_1w_pct, 0)),
    w2: Math.abs(firstNumber(s.ret_2w, s.delta_2w, s.ret_2w_pct, 0)),
    ma: Math.abs(firstNumber(s.ma_slope, s.ma_slope_pct, s.ma30_slope_pct, s.timing_slope_pct, slopeToPct(s.timing_slope), 0))
  };
}

function calcVolScoreV1(s) {
  const v = s.vol_inputs || getVolInputs(s);
  return round2(0.05 * v.d1 + 0.10 * v.d2 + 0.40 * v.w1 + 0.35 * v.ma + 0.10 * v.w2);
}

function getVolBand(v) {
  const x = num(v, 0);
  if (x < 3) return "low";
  if (x < 7) return "mid";
  if (x < 12) return "high";
  return "extreme";
}

function estimate2D(s) {
  if (s.price_now && s.price_ref_d2) return ((num(s.price_now) / num(s.price_ref_d2)) - 1) * 100;
  if (s.today_price && s.price_ref_d2) return ((num(s.today_price) / num(s.price_ref_d2)) - 1) * 100;
  return 0;
}

function slopeToPct(x) {
  const n = num(x, 0);
  if (Math.abs(n) < 1) return n * 100;
  return n;
}

// ------------------------------------------
// Pools
// ------------------------------------------
function buildPools(stocks, options) {
  const pools = { highlight: [], watch: [], simulation: [], reject: [] };

  stocks.forEach((s) => {
    const hardReject = getHardRejectReason(s, options);
    if (hardReject) {
      s.c1_pool = "reject";
      s.final_reject_reason = hardReject;
      pools.reject.push(s);
      return;
    }

    pools.simulation.push(s);

    const isHighlight =
      s.priority_score >= options.highlight_priority_min &&
      s.vol_band !== "extreme" &&
      s.m2_util < options.highlight_m2_util_max &&
      !isHotTiming(s.m6_timing) &&
      s.amt_signal > options.highlight_amt_signal_min &&
      s.max_addable_amt > 0;

    if (isHighlight) {
      s.c1_pool = "highlight";
      pools.highlight.push(s);
    } else {
      s.c1_pool = "watch";
      s.watch_reason = buildWatchReason(s, options);
      pools.watch.push(s);
    }
  });

  Object.keys(pools).forEach((k) => pools[k].sort(sortByPriority));
  return pools;
}

function getHardRejectReason(s, options) {
  if (!s.allow_fcn) return "allow_fcn=false / blocked";
  if (s.reject_reason) return s.reject_reason;
  if (s.m2_util >= options.reject_m2_util_hard_max) return "M2 utilization over hard cap";
  if (options.reject_extreme_vol && s.vol_band === "extreme") return "Extreme volatility";
  if (s.max_addable_amt <= 0) return "No addable amount";
  return null;
}

function buildWatchReason(s, options) {
  const reasons = [];
  if (s.priority_score < options.highlight_priority_min) reasons.push("M7 priority not high enough");
  if (s.vol_band === "high") reasons.push("High volatility");
  if (s.m2_util >= options.highlight_m2_util_max) reasons.push("M2 utilization high");
  if (isHotTiming(s.m6_timing)) reasons.push("M6 timing hot");
  if (s.amt_signal <= options.highlight_amt_signal_min) reasons.push("Amount signal weak");
  if (!reasons.length) reasons.push("Available but not top priority today");
  return reasons.join("; ");
}

function isHotTiming(x) {
  const s = String(x || "").toLowerCase();
  return s.includes("hot") || s.includes("overheat") || s.includes("chase");
}

function sortByPriority(a, b) {
  return (b.priority_score || 0) - (a.priority_score || 0);
}

// ------------------------------------------
// Category
// ------------------------------------------
function buildCategoryMap(stocks) {
  const keys = ["core", "growth", "income", "defensive", "speculative", "unknown"];
  const map = Object.fromEntries(keys.map((k) => [k, []]));
  stocks.forEach((s) => map[s.category || "unknown"].push(s));
  keys.forEach((k) => map[k].sort(sortByPriority));
  return map;
}

function buildCategorySummary(categoryMap) {
  const out = {};
  for (const [category, rows] of Object.entries(categoryMap)) {
    const scores = rows.map((x) => x.priority_score || 0);
    const vols = rows.map((x) => x.vol_score || 0);
    out[category] = {
      count: rows.length,
      ok_count: rows.filter((x) => x.c1_pool === "highlight").length,
      watch_count: rows.filter((x) => x.c1_pool === "watch").length,
      reject_count: rows.filter((x) => x.c1_pool === "reject").length,
      mean_priority: round2(avg(scores)),
      std_priority: round2(std(scores)),
      cv_priority: round2(cv(scores)),
      avg_vol: round2(avg(vols)),
      total_single_suggest_amt: sum(rows.map((x) => x.single_suggest_amt || 0)),
      total_max_addable_amt: sum(rows.map((x) => x.max_addable_amt || 0)),
      avg_m2_util: round2(avg(rows.map((x) => x.m2_util || 0)))
    };
  }
  return out;
}

// ------------------------------------------
// Basket Builder
// ------------------------------------------
async function buildBasketCandidates({ pools, category_map, options }) {
  const baskets = [];

  const priorityTop = pools.highlight.slice(0, 4);
  if (priorityTop.length >= 2) {
    baskets.push(await buildBasket("PRIORITY_TOP", "Priority Top", priorityTop, options, "standard"));
  }

  const categoryBalanced = pickCategoryBalanced(category_map, 5);
  if (categoryBalanced.length >= 3) {
    baskets.push(await buildBasket("CATEGORY_BALANCED", "Category Balanced", categoryBalanced, options, "standard"));
  }

  const hybrid = uniqueBySymbol([...pools.highlight.slice(0, 2), ...pools.watch.slice(0, 3)]).slice(0, 5);
  if (hybrid.length >= 3) {
    baskets.push(await buildBasket("HYBRID", "Hybrid", hybrid, options, "standard"));
  }

  const conservative = pickConservative(category_map, pools, options);
  if (conservative.length >= 3) {
    baskets.push(await buildBasket("CONSERVATIVE", "保守單", conservative, options, "conservative"));
  }

  const rational = pickRational(category_map, pools, options);
  if (rational.length >= 3) {
    baskets.push(await buildBasket("RATIONAL", "合理單", rational, options, "rational"));
  }

  const aggressive = pickAggressive(category_map, pools, options);
  if (aggressive.length >= 3) {
    baskets.push(await buildBasket("AGGRESSIVE", "積極單", aggressive, options, "aggressive"));
  }

  return baskets.sort((a, b) => (b.m8?.fair_yield || 0) - (a.m8?.fair_yield || 0));
}

function pickCategoryBalanced(categoryMap, maxCount) {
  const order = ["core", "growth", "income", "defensive", "speculative"];
  return uniqueBySymbol(order.map((k) => categoryMap[k]?.[0]).filter(Boolean)).slice(0, maxCount);
}

function pickConservative(categoryMap, pools) {
  const preferred = ["SMH", "QQQ", "LQD", "GOOG", "AAPL", "AMZN", "SPY"];
  const all = uniqueBySymbol([...Object.values(categoryMap).flat(), ...pools.highlight, ...pools.watch]);
  const preferredRows = preferred.map((sym) => all.find((x) => x.symbol === sym)).filter(Boolean);
  const lowRows = all.filter((x) => ["low", "mid"].includes(x.vol_band)).sort(sortByPriority);
  return uniqueBySymbol([...preferredRows, ...lowRows]).slice(0, 5);
}

function pickRational(categoryMap, pools) {
  const core = categoryMap.core || [];
  const growth = categoryMap.growth || [];
  const incomeDef = [...(categoryMap.income || []), ...(categoryMap.defensive || [])].sort(sortByPriority);
  return uniqueBySymbol([...core.slice(0, 2), ...growth.slice(0, 1), ...incomeDef.slice(0, 1), ...pools.highlight]).slice(0, 4);
}

function pickAggressive(categoryMap, pools) {
  const high = pools.simulation.filter((x) => x.vol_band === "high").sort(sortByPriority).slice(0, 2);
  const mid = pools.simulation.filter((x) => x.vol_band === "mid").sort(sortByPriority).slice(0, 2);
  const low = pools.simulation.filter((x) => x.vol_band === "low").sort(sortByPriority).slice(0, 1);
  return uniqueBySymbol([...high, ...mid, ...low, ...pools.highlight]).slice(0, 5);
}

async function buildBasket(id, label, stocks, options, style) {
  const symbols = stocks.map((s) => s.symbol);
  const basket_cap = Math.min(...stocks.map((s) => s.max_addable_amt || 0));
  const avg_score = round2(avg(stocks.map((s) => s.priority_score || 0)));
  const avg_vol = round2(avg(stocks.map((s) => s.vol_score || 0)));
  const vol_mix = countBy(stocks.map((s) => s.vol_band));
  const rule = getStructureForStyle(style, options);

  let m8 = null;
  try {
    m8 = await runM8Case({
      caseName: id,
      symbols,
      KI: rule.KI,
      Strike: rule.Strike,
      T: rule.T,
      type: rule.type,
      marketYield: 0
    });
  } catch (err) {
    m8 = { error: err.message || String(err) };
    console.warn("M8 basket error", id, err);
  }

  return {
    id,
    label,
    style,
    symbols,
    stock_count: stocks.length,
    basket_cap,
    avg_score,
    avg_vol,
    vol_mix,
    structure: rule,
    rule_match: evaluateBasketRuleMatch(style, stocks, rule),
    m8,
    stocks
  };
}

function getStructureForStyle(style, options) {
  if (style === "conservative") return { KI: 55, Strike: 65, T: 9, type: "EKI" };
  if (style === "rational") return { KI: 55, Strike: 65, T: 6, type: "AKI" };
  if (style === "aggressive") return { KI: 50, Strike: 65, T: 7, type: "EKI" };
  return options.m8_default;
}

function evaluateBasketRuleMatch(style, stocks, rule) {
  const count = stocks.length;
  const volBands = countBy(stocks.map((s) => s.vol_band));
  const reasons = [];
  let score = 100;

  if (count < 3) { score -= 30; reasons.push("stock count < 3"); }
  if (count > 5) { score -= 20; reasons.push("stock count > 5"); }

  if (style === "conservative" && (volBands.high || volBands.extreme)) {
    score -= 20;
    reasons.push("保守單含 high/extreme vol");
  }
  if (style === "aggressive" && !(volBands.high || 0)) {
    score -= 15;
    reasons.push("積極單缺 high vol 收益來源");
  }

  return {
    score: Math.max(0, score),
    reasons
  };
}

// ------------------------------------------
// Allocation v0
// ------------------------------------------
function allocateV0({ stocks, baskets, options }) {
  const derivedCapacity = Math.max(...stocks.map((s) => s.max_addable_amt || 0), 0);
  const total_capacity = options.today_total_capacity ?? derivedCapacity;
  let remaining = total_capacity;
  const rows = [];

  baskets.forEach((b, index) => {
    if (remaining <= 0) return;
    const suggested = suggestedBasketAmount(b, index);
    const final_alloc = Math.min(b.basket_cap || 0, suggested, remaining);
    if (final_alloc <= 0) return;

    rows.push({
      rank: index + 1,
      basket_id: b.id,
      basket_label: b.label,
      symbols: b.symbols,
      basket_cap: b.basket_cap,
      suggested_amt: suggested,
      final_alloc_amt: final_alloc,
      remaining_before: remaining,
      remaining_after: remaining - final_alloc,
      reason: index === 0 ? "Optimal" : `${index + 1}nd candidate`
    });
    remaining -= final_alloc;
  });

  return {
    total_capacity,
    allocated: total_capacity - remaining,
    remaining,
    rows
  };
}

function suggestedBasketAmount(basket, index) {
  if (index === 0) return Math.min(30000, basket.basket_cap || 0);
  return Math.min(10000, basket.basket_cap || 0);
}

// ------------------------------------------
// Market Order Match + M8
// ------------------------------------------
export async function runMarketOrderMatch(input = {}) {
  const stocks = normalizeStocks(input.stocks || []);
  const options = normalizeOptions(input.options || {});
  const orders = input.orders || input.market_orders || [];
  return Promise.all(orders.map((order, idx) => evaluateMarketOrder(order, stocks, options, idx)));
}
window.runMarketOrderMatch = runMarketOrderMatch;

async function evaluateMarketOrder(order, stocks, options, idx = 0) {
  const symbols = (order.symbols || order.basket || []).map(safeUpper).filter(Boolean);
  const stockMap = Object.fromEntries(stocks.map((s) => [s.symbol, s]));

  const matched = [];
  const rejected = [];

  symbols.forEach((sym) => {
    const s = stockMap[sym];
    if (!s) {
      rejected.push({ symbol: sym, reason: "not_in_m1_pool_or_c1_output" });
      return;
    }
    const hardReject = getHardRejectReason(s, options);
    if (hardReject) {
      rejected.push({ symbol: sym, reason: hardReject });
      return;
    }
    matched.push(s);
  });

  const match_pct = symbols.length ? round2((matched.length / symbols.length) * 100) : 0;
  const orderStructure = normalizeOrderStructure(order);

  let m8 = null;
  try {
    m8 = await runM8Case({
      caseName: order.caseName || `MARKET_ORDER_${idx + 1}`,
      symbols,
      KI: orderStructure.KI,
      Strike: orderStructure.Strike,
      T: orderStructure.T,
      type: orderStructure.type,
      marketYield: orderStructure.marketYield
    });
  } catch (err) {
    m8 = { error: err.message || String(err) };
    console.warn("M8 market order error", order, err);
  }

  const fair = m8?.fair_yield ?? null;
  const market = orderStructure.marketYield;
  const pricing_delta = fair == null || market == null ? null : round2(market - fair);
  const pricing_view = pricingViewFromDelta(pricing_delta);
  const action = decideMarketAction({ match_pct, pricing_delta, rejected, m8 });
  const suggested_amt = suggestMarketOrderAmount({ action, matched });
  const outliers = buildOutlierAnalysis({ symbols, matched, rejected, m8 });

  return {
    order_id: order.order_id || order.id || `ORDER_${idx + 1}`,
    bank: order.bank || order.broker || "UNKNOWN",
    symbols,
    structure: orderStructure,
    match_pct,
    matched: matched.map((s) => s.symbol),
    rejected,
    outliers,
    fair_yield: fair == null ? null : round2(fair),
    market_yield: market,
    pricing_delta,
    pricing_view,
    action,
    suggested_amt,
    m8
  };
}

function normalizeOrderStructure(order) {
  return {
    KI: num(order.KI ?? order.ki, 55),
    Strike: num(order.Strike ?? order.strike, 65),
    T: num(order.T ?? order.tenor ?? order.period, 6),
    type: String(order.type || "AKI").toUpperCase(),
    marketYield: num(order.marketYield ?? order.market_yield ?? order.rate, 0)
  };
}

function pricingViewFromDelta(delta) {
  if (delta == null) return "unknown";
  if (delta >= 2) return "cheap";
  if (delta >= 0.5) return "slightly_cheap";
  if (delta > -0.5) return "fair";
  if (delta > -2) return "rich";
  return "very_rich";
}

function decideMarketAction({ match_pct, pricing_delta, rejected, m8 }) {
  if (m8?.error) return "REVIEW_M8_ERROR";
  if (rejected.length > 0 && match_pct < 100) return "REJECT_OR_REBUILD";
  if (pricing_delta == null) return "REVIEW";
  if (match_pct === 100 && pricing_delta >= 1) return "FOLLOW";
  if (match_pct >= 70 && pricing_delta >= 0) return "NEGOTIATE";
  if (pricing_delta < -1) return "REJECT";
  return "REVIEW";
}

function suggestMarketOrderAmount({ action, matched }) {
  if (!matched.length) return 0;
  const cap = Math.min(...matched.map((s) => s.max_addable_amt || 0));
  if (!Number.isFinite(cap) || cap <= 0) return 0;
  if (action === "FOLLOW") return cap;
  if (action === "NEGOTIATE") return Math.floor(cap * 0.5);
  if (action === "REVIEW") return Math.floor(cap * 0.25);
  return 0;
}

function buildOutlierAnalysis({ symbols, matched, rejected, m8 }) {
  const notes = [];
  rejected.forEach((r) => notes.push(`${r.symbol}: ${r.reason}`));
  matched
    .filter((s) => s.vol_band === "extreme" || s.m2_util >= 0.8)
    .forEach((s) => notes.push(`${s.symbol}: ${s.vol_band} vol / M2 ${(s.m2_util * 100).toFixed(0)}%`));
  if (m8?.stock_sources) {
    m8.stock_sources
      .filter((x) => x.today_score < 60)
      .forEach((x) => notes.push(`${x.symbol}: M8 today_score low (${x.today_score})`));
  }
  if (!notes.length) notes.push("No major outlier from current C1/M8 checks");
  return notes;
}

// ------------------------------------------
// Summary
// ------------------------------------------
function buildOverallSummary({ stocks, pools, baskets, allocation, market_match, category_summary }) {
  return {
    data_coverage: {
      input_stocks: stocks.length,
      c1_ready: stocks.filter((s) => s.priority_score != null && s.max_addable_amt != null).length,
      m7_available: stocks.filter((s) => s.m7_score != null || s.today_score != null).length,
      m2_available: stocks.filter((s) => s.m2_util != null).length,
      m6_available: stocks.filter((s) => s.m6_timing && s.m6_timing !== "unknown").length
    },
    c1_pool_health: {
      highlight: pools.highlight.length,
      watch: pools.watch.length,
      simulation: pools.simulation.length,
      reject: pools.reject.length,
      avg_priority: round2(avg(stocks.map((s) => s.priority_score || 0))),
      std_priority: round2(std(stocks.map((s) => s.priority_score || 0))),
      cv_priority: round2(cv(stocks.map((s) => s.priority_score || 0)))
    },
    basket_feasibility: {
      generated_baskets: baskets.length,
      m8_success: baskets.filter((b) => b.m8 && !b.m8.error).length,
      best_fair_yield: round2(Math.max(...baskets.map((b) => num(b.m8?.fair_yield, 0)), 0))
    },
    market_order_match: {
      input_orders: market_match.length,
      follow: market_match.filter((x) => x.action === "FOLLOW").length,
      negotiate: market_match.filter((x) => x.action === "NEGOTIATE").length,
      reject: market_match.filter((x) => String(x.action).includes("REJECT")).length,
      best_match_pct: round2(Math.max(...market_match.map((x) => x.match_pct || 0), 0))
    },
    final_allocation: {
      today_capacity: allocation.total_capacity,
      allocated: allocation.allocated,
      remaining: allocation.remaining
    },
    category_summary
  };
}

// ------------------------------------------
// Utilities
// ------------------------------------------
function num(x, d = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
}

function firstNumber(...vals) {
  for (const v of vals) {
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function safeUpper(x) {
  return String(x || "").trim().toUpperCase();
}

function round2(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function avg(arr) {
  const xs = arr.map((x) => Number(x)).filter(Number.isFinite);
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sum(arr) {
  return arr.map((x) => Number(x)).filter(Number.isFinite).reduce((a, b) => a + b, 0);
}

function std(arr) {
  const xs = arr.map((x) => Number(x)).filter(Number.isFinite);
  if (xs.length <= 1) return 0;
  const m = avg(xs);
  const v = avg(xs.map((x) => Math.pow(x - m, 2)));
  return Math.sqrt(v);
}

function cv(arr) {
  const m = avg(arr);
  if (!m) return 0;
  return std(arr) / Math.abs(m);
}

function countBy(arr) {
  return arr.reduce((acc, x) => {
    acc[x] = (acc[x] || 0) + 1;
    return acc;
  }, {});
}

function uniqueBySymbol(rows) {
  const seen = new Set();
  return rows.filter((r) => {
    if (!r?.symbol || seen.has(r.symbol)) return false;
    seen.add(r.symbol);
    return true;
  });
}

function utilFlag(util) {
  const u = num(util, 0);
  if (u >= 1) return "critical";
  if (u >= 0.9) return "too_hot";
  if (u >= 0.7) return "high";
  if (u >= 0.5) return "normal";
  return "low";
}
