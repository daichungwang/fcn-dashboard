// ==========================================
// MM FILTER ENGINE v4.1 MODULE (SANDBOX / M7 v2 canonical)
// Path: js/mm/modules/mm_filter.js
// Purpose: C1 Output -> Filter / Pool / Basket / Allocation v0 / M8 / Market Order Match
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
// Main API
// ==========================================

export async function runMMFilterFull(input = {}) {
  const rawStocks = Array.isArray(input.stocks) ? input.stocks : [];
  const marketOrders = Array.isArray(input.market_orders) ? input.market_orders : [];
  const options = input.options || {};

  const stocks = normalizeStocks(rawStocks);

  // 1. Volatility v1
  stocks.forEach(s => {
    const vol = calcVolScoreV1(s);
    s.vol_score = round2(vol.score);
    s.vol_band = getVolBand(s.vol_score);
    s.vol_components = vol.components;
  });

  // 2. Pool classification
  const pools = classifyPools(stocks, options);

  // 3. Category
  const category_map = buildCategoryMap(stocks);

  // 4. Basket build + M8
  const baskets = await buildAllBaskets({ pools, category_map, stocks, options });

  // 5. Allocation v0
  const allocation = allocateBasketsV0({
    baskets,
    stocks,
    totalCapacity: options.total_today_capacity
  });

  // 6. Market order match + M8
  const market_match = await runMarketOrderMatch({
    orders: marketOrders,
    stocks
  });

  // 7. Summary
  const summary = buildSummary({ stocks, pools, category_map, baskets, allocation, market_match });

  return {
    version: "mm_filter_v4_1_module_sandbox_m7_v2_canonical",
    generated_at: new Date().toISOString(),
    summary,
    pools,
    category_map,
    baskets,
    allocation,
    market_match,
    raw: stocks
  };
}

export async function runMarketOrderMatch(input = {}) {
  const orders = Array.isArray(input.orders) ? input.orders : [];
  const stocks = normalizeStocks(Array.isArray(input.stocks) ? input.stocks : []);
  return Promise.all(orders.map(order => evaluateMarketOrder(order, stocks)));
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
        row.m7_effective_score,
        row.m7_v2_score,
        row.m7_v2_score_unclamped,
        row.m7_score,
        row.m7_raw_score,
        row.today_score,
        row.total,
        row["today_score"],
        row["排名分數"]
      ], 0);

      const m7ScoreSource =
        row.m7_effective_score_source ||
        (Number.isFinite(Number(row.m7_effective_score)) ? "m7_effective_score" :
          Number.isFinite(Number(row.m7_v2_score)) ? "m7_v2_score" :
          Number.isFinite(Number(row.m7_score)) ? "legacy_m7_score" :
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

      const maxAddable = firstFinite([
        row.max_addable_amt,
        row.addable_amt,
        row.c1_max_addable_amt,
        row.today_capacity_amt,
        row.suggested_amt_cap
      ], 0);

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
        priority_score: round2(priorityScore),
        m1_score: m1Score === null ? null : round2(m1Score),

        // M7 v2 canonical fields
        m7_score: round2(m7Score),
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
        ret_1d: firstFinite([row.ret_1d, row.delta_1d, row.ret_1d_pct, row["ret_1d_pct"]], 0),
        ret_2d: firstFinite([row.ret_2d, row.delta_2d, row.ret_d2, row["ret_2d_pct"]], 0),
        ret_1w: firstFinite([row.ret_1w, row.delta_1w, row.ret_1w_pct, row["ret_1w_pct"]], 0),
        ret_2w: firstFinite([row.ret_2w, row.delta_2w, row.ret_2w_pct, row["ret_2w_pct"]], 0),
        ma_slope: firstFinite([
          row.ma_slope,
          row.ma_slope_pct,
          row.ma30_slope_pct,
          row.trend_ma_slope_pct,
          row.trend_ma_annualized_pct
        ], 0),

        // M2
        m2_util: normalizeRatio(firstFinite([
          row.m2_util,
          row.m2_utilization,
          row.exposure_ratio,
          row.exposureRatio,
          row["投入資金比"]
        ], 0)),
        m2_exposure_amt: firstFinite([row.m2_exposure_amt, row.exposure_amt, row.active_fcn_amount], 0),
        m2_fcn_count: firstFinite([row.m2_fcn_count, row.fcn_count, row.fcnCount], 0),

        // M6
        m6_timing: String(row.m6_timing || row.timing_mode || row.decision_mode || row.short_direction || "").toLowerCase(),

        // Amount
        amt_signal: round2(amtSignal),
        single_suggest_amt: singleSuggest,
        max_addable_amt: maxAddable,

        // Decision flags
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

export function calcVolScoreV1(stock) {
  const d1 = Math.abs(num(stock.ret_1d));
  const d2 = Math.abs(num(stock.ret_2d));
  const w1 = Math.abs(num(stock.ret_1w));
  const ma = Math.abs(num(stock.ma_slope));
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
      formula: "0.05*1D + 0.10*2D + 0.40*1W + 0.35*MA_slope + 0.10*2W"
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
// Pool classification
// ==========================================

function classifyPools(stocks, options = {}) {
  const pools = {
    highlight: [],
    watch: [],
    simulation: [],
    reject: []
  };

  const priorityCut = num(options.highlight_priority_cut, 75);
  const m2HotCut = num(options.highlight_m2_cut, 0.8);
  const m2RejectCut = num(options.reject_m2_cut, 0.95);
  const amtSignalCut = num(options.highlight_amt_signal_cut, 0.6);

  for (const s of stocks) {
    const rejectReasons = getRejectReasons(s, { m2RejectCut });

    if (rejectReasons.length) {
      pools.reject.push({
        ...s,
        pool: "reject",
        reject_reasons: rejectReasons
      });
      continue;
    }

    const simRow = {
      ...s,
      pool: "simulation",
      reject_reasons: []
    };

    pools.simulation.push(simRow);

    const timingHot = isTimingHot(s.m6_timing);
    const isHighlight =
      s.priority_score >= priorityCut &&
      s.vol_band !== "extreme" &&
      s.m2_util < m2HotCut &&
      !timingHot &&
      s.amt_signal > amtSignalCut &&
      s.max_addable_amt > 0;

    if (isHighlight) {
      pools.highlight.push({
        ...simRow,
        pool: "highlight",
        why_yes: buildWhyYes(s)
      });
    } else {
      pools.watch.push({
        ...simRow,
        pool: "watch",
        why_not: buildWatchReasons(s, { priorityCut, m2HotCut, amtSignalCut })
      });
    }
  }

  const sortFn = (a, b) =>
    (b.priority_score || 0) - (a.priority_score || 0) ||
    (b.max_addable_amt || 0) - (a.max_addable_amt || 0);

  Object.keys(pools).forEach(k => pools[k].sort(sortFn));
  return pools;
}

function getRejectReasons(s, { m2RejectCut }) {
  const reasons = [];
  if (!s.allow_fcn) reasons.push("allow_fcn=false");
  if (s.reject_reason) reasons.push(String(s.reject_reason));
  if (s.m2_util >= m2RejectCut) reasons.push(`m2_util>=${Math.round(m2RejectCut * 100)}%`);
  if (s.vol_band === "extreme" && s.m2_util >= 0.8) reasons.push("extreme_vol_with_high_m2");
  if (s.max_addable_amt <= 0) reasons.push("amount_unavailable");
  return reasons;
}

function buildWhyYes(s) {
  const out = [];
  if (s.priority_score >= 75) out.push("M7 priority 達標");
  if (s.vol_band !== "extreme") out.push(`波動率 ${s.vol_band}`);
  if (s.m2_util < 0.8) out.push("M2 曝險未過熱");
  if (!isTimingHot(s.m6_timing)) out.push("M6 timing 非 hot");
  if (s.max_addable_amt > 0) out.push(`可加碼 ${money(s.max_addable_amt)}`);
  return out;
}

function buildWatchReasons(s, { priorityCut, m2HotCut, amtSignalCut }) {
  const out = [];
  if (s.priority_score < priorityCut) out.push(`priority<${priorityCut}`);
  if (s.vol_band === "extreme") out.push("vol=extreme");
  if (s.m2_util >= m2HotCut) out.push(`m2_util>=${Math.round(m2HotCut * 100)}%`);
  if (isTimingHot(s.m6_timing)) out.push("m6_timing=hot");
  if (s.amt_signal <= amtSignalCut) out.push(`amt_signal<=${amtSignalCut}`);
  if (s.max_addable_amt <= 0) out.push("amount=0");
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
    map[k].sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));
  });

  return map;
}

// ==========================================
// Basket build
// ==========================================

async function buildAllBaskets({ pools, category_map, stocks, options }) {
  const baskets = [];

  // 1. Priority Top
  const top = pools.highlight.slice(0, 4);
  if (top.length >= 2) {
    baskets.push(await buildBasket({
      id: "PRIORITY_TOP",
      style: "rational",
      stocks: top.slice(0, 4),
      structure: options.priority_structure || { KI: 55, Strike: 65, T: 6, type: "AKI", marketYield: 0 }
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

  // 3. Hybrid
  const hybrid = uniqueBySymbol([
    ...pools.highlight.slice(0, 2),
    ...pools.watch.filter(x => x.max_addable_amt > 0).slice(0, 3)
  ]).slice(0, 5);

  if (hybrid.length >= 3) {
    baskets.push(await buildBasket({
      id: "HYBRID",
      style: "rational",
      stocks: hybrid,
      structure: options.hybrid_structure || { KI: 55, Strike: 65, T: 6, type: "AKI", marketYield: 0 }
    }));
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

  // 5. Aggressive: high + mid + low vol mix
  const aggressive = buildAggressiveMix(stocks);
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

function buildConservativeSpecial(stocks) {
  const preferred = new Set(FCN_BASKET_RULES.conservative_special.preferred_symbols);
  const required = stocks
    .filter(s => ["NVDA", "TSM"].includes(s.symbol) && s.allow_fcn && s.max_addable_amt > 0)
    .sort((a, b) => b.priority_score - a.priority_score);

  const companions = stocks
    .filter(s =>
      preferred.has(s.symbol) &&
      s.allow_fcn &&
      s.max_addable_amt > 0 &&
      s.vol_band !== "extreme"
    )
    .sort((a, b) => {
      const volRank = volBandRank(a.vol_band) - volBandRank(b.vol_band);
      if (volRank !== 0) return volRank;
      return b.priority_score - a.priority_score;
    });

  if (!required.length) return [];
  return uniqueBySymbol([required[0], ...companions]);
}

function buildAggressiveMix(stocks) {
  const eligible = stocks.filter(s => s.allow_fcn && s.max_addable_amt > 0 && s.vol_band !== "extreme");

  const high = eligible.filter(s => s.vol_band === "high").sort((a, b) => b.priority_score - a.priority_score).slice(0, 2);
  const mid = eligible.filter(s => s.vol_band === "mid").sort((a, b) => b.priority_score - a.priority_score).slice(0, 2);
  const low = eligible.filter(s => s.vol_band === "low").sort((a, b) => b.priority_score - a.priority_score).slice(0, 2);

  return uniqueBySymbol([...high, ...mid, ...low]);
}

async function buildBasket({ id, style, stocks, structure }) {
  const clean = uniqueBySymbol(stocks).filter(Boolean);
  const symbols = clean.map(s => s.symbol);
  const caps = clean.map(s => num(s.max_addable_amt));
  const basket_cap = caps.length ? Math.min(...caps) : 0;

  const avg_score = avg(clean.map(s => s.priority_score));
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
    avg_score: round2(avg_score),
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
  const priorityArr = stocks.map(s => num(s.priority_score));
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
      with_amount: stocks.filter(s => num(s.max_addable_amt) > 0).length
    },

    score_health: {
      priority_mean: round2(avg(priorityArr)),
      priority_std: round2(std(priorityArr)),
      priority_cv: round2(cv(priorityArr)),
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

    category: Object.fromEntries(
      Object.entries(category_map).map(([k, list]) => [
        k,
        {
          count: list.length,
          mean_priority: round2(avg(list.map(x => x.priority_score))),
          std_priority: round2(std(list.map(x => x.priority_score))),
          cv_priority: round2(cv(list.map(x => x.priority_score))),
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
