/*
  M7 Formula Test Engine
  Path in repo: js/mm/modules/mm_formula_test_engine.js

  Purpose:
  - Independent formula debug page for M7 what-if calculation.
  - Adds 28-category valuation baseline engine inside formula_test.html.
  - Does NOT modify data files.
  - Does NOT re-rank or re-normalize cross-stock distribution during what-if.
*/

(function () {
  "use strict";

  const DATA_PATHS = {
    scores: "../data/m7_sandbox/m7_v2_scores.json",
    compare: "../data/m7_sandbox/m7_v2_ab_compare.json",
    manifest: "../data/m7_sandbox/m7_v2_run_manifest.json",
    runtime: "../data/market_runtime.json",
    fundamentals: "../data/m7/m7_fundamental_data.json",
    anchorConfig: "../configs/mm/dynamic_anchor_regime_v1.json"
  };

  const DEFAULT_PARAMS = Object.freeze({
    // Match current Python M7 v2 formula:
    raw_valuation_weight: 0.45,
    raw_trend_weight: 0.25,
    raw_structure_weight: 0.20,
    raw_timing_weight: 0.00,
    raw_money_weight: 0.10,

    // Match current Python trend formula:
    trend_linear_weight: 0.35,
    trend_ma_weight: 0.50,
    trend_acceleration_weight: 0.15,

    // Match current Python money formula:
    money_liquidity_weight: 0.70,
    money_flow_weight: 0.30,

    // 28-sector baseline blend:
    sector_peer_baseline_weight: 0.30,
    sector_static_anchor_weight: 0.70,

    // Dynamic valuation multipliers are adjustment factors applied on top of Python/config multipliers.
    // 1.00 = keep original market/industry/archetype multiplier.
    valuation_market_multiplier_factor: 1.00,
    valuation_industry_multiplier_factor: 1.00,
    valuation_archetype_multiplier_factor: 1.00,

    top_adjustment_weight: 1.00,
    top_adjustment_cap: 1.50
  });

  const PARAM_DEFS = [
    ["raw_valuation_weight", "M7 Raw - Valuation Weight", 0, 0.60, 0.01],
    ["raw_trend_weight", "M7 Raw - Trend Weight", 0, 0.60, 0.01],
    ["raw_structure_weight", "M7 Raw - Structure Weight", 0, 0.60, 0.01],
    ["raw_timing_weight", "M7 Raw - Timing Weight", 0, 0.40, 0.01],
    ["raw_money_weight", "M7 Raw - Money Weight", 0, 0.40, 0.01],
    ["trend_linear_weight", "Trend - Linear Slope Weight", 0, 1, 0.01],
    ["trend_ma_weight", "Trend - MA / MA200 Weight", 0, 1, 0.01],
    ["trend_acceleration_weight", "Trend - Acceleration Weight", 0, 1, 0.01],
    ["money_liquidity_weight", "Money - Liquidity Weight", 0, 1, 0.01],
    ["money_flow_weight", "Money - Flow Weight", 0, 1, 0.01],
    ["sector_peer_baseline_weight", "Valuation - Sector Peer Baseline Weight", 0, 1, 0.01],
    ["sector_static_anchor_weight", "Valuation - Static Anchor Weight", 0, 1, 0.01],
    ["valuation_market_multiplier_factor", "Valuation - Market Multiplier Factor", 0.70, 1.30, 0.01],
    ["valuation_industry_multiplier_factor", "Valuation - Industry Multiplier Factor", 0.70, 1.30, 0.01],
    ["valuation_archetype_multiplier_factor", "Valuation - Archetype Multiplier Factor", 0.70, 1.30, 0.01],
    ["top_adjustment_weight", "Final - Top Adjustment Weight", 0, 2, 0.01],
    ["top_adjustment_cap", "Final - Top Adjustment Cap", 0, 3, 0.05]
  ];

  const FALLBACK_STATIC_ANCHORS = {
    CPU_GPU_COMPUTE_SEMI: 30,
    ASIC_CUSTOM_SILICON: 28,
    FOUNDRY_FAB_INFRA: 24,
    MEMORY_CYCLICAL_SEMI: 14,
    SEMI_EQUIPMENT: 22,
    ANALOG_CASHFLOW_SEMI: 20,
    SEMI_TURNAROUND_LEGACY: 15,
    CLOUD_PLATFORM_MEGACAP: 26,
    ENTERPRISE_SOFTWARE_SAAS: 22,
    CYBERSECURITY_DATA_SOFTWARE: 24,
    PLATFORM_ECOSYSTEM_CONSUMER_INTERNET: 25,
    RERATING_TURNAROUND_GROWTH: 18,
    CONSUMER_DEFENSIVE_RETAIL_STAPLES: 20,
    TRAVEL_LEISURE_CYCLICAL: 14,
    INDUSTRIAL_CAPITAL_GOODS_LOGISTICS: 18,
    HEALTHCARE_DEFENSIVE_MANAGED: 17,
    HEALTHCARE_GROWTH_BIOTECH: 23,
    FINANCIAL_QUALITY_BANK_PAYMENTS: 18,
    UTILITY_LOWVOL_DEFENSIVE: 16,
    YIELD_REIT_BONDLIKE_INCOME: 14,
    BROAD_MARKET_ETF: 21,
    SECTOR_ETF: 20,
    SEMI_THEMATIC_ETF: 24,
    BOND_ETF: 16,
    SPEC_THEMATIC_ETF: 26,
    CRYPTO_EXCHANGE_MINERS: 20,
    CRYPTO_EXCHANGE_PLATFORM: 20,
    CRYPTO_MINERS: 20,
    ENERGY_CASHFLOW_CYCLICAL: 14
  };

  const state = {
    scores: [],
    compare: [],
    manifest: null,
    runtime: [],
    fundamentals: [],
    anchorConfig: null,
    selectedSymbol: null,
    params: { ...DEFAULT_PARAMS },
    decimals: 2
  };

  const $ = (id) => document.getElementById(id);

  function num(v, fallback = null) {
    const x = Number(v);
    return Number.isFinite(x) ? x : fallback;
  }

  function clamp(x, lo, hi) {
    const n = num(x, 0);
    return Math.max(lo, Math.min(hi, n));
  }

  function fmt(v, d = state.decimals) {
    const x = num(v, null);
    if (x === null) return "--";
    return x.toFixed(d);
  }

  function fmtPct(v, d = 1) {
    const x = num(v, null);
    if (x === null) return "--";
    return `${(x * 100).toFixed(d)}%`;
  }

  function fmtPctFromValue(v, d = 1) {
    const x = num(v, null);
    if (x === null) return "--";
    return `${x.toFixed(d)}%`;
  }

  function deltaClass(v) {
    const x = num(v, 0);
    if (Math.abs(x) < 0.00001) return "zero";
    return x > 0 ? "pos" : "neg";
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
  }

  function field(row, keys, fallback = null) {
    if (!row) return fallback;
    for (const k of keys) {
      if (k.includes(".")) {
        const parts = k.split(".");
        let cur = row;
        let ok = true;
        for (const p of parts) {
          if (!cur || cur[p] === undefined || cur[p] === null || cur[p] === "") { ok = false; break; }
          cur = cur[p];
        }
        if (ok) return cur;
      } else if (row[k] !== undefined && row[k] !== null && row[k] !== "") {
        return row[k];
      }
    }
    return fallback;
  }

  function symbolOf(row) {
    return String(field(row, ["symbol", "ticker", "Symbol"], "")).toUpperCase();
  }

   function asArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.scores)) return payload.scores;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.rows)) return payload.rows;
    if (Array.isArray(payload.results)) return payload.results;
    if (Array.isArray(payload.records)) return payload.records;
    if (Array.isArray(payload.output)) return payload.output;

    const values = Object.values(payload);
    const firstArray = values.find(v => Array.isArray(v));
    if (firstArray) return firstArray;

    const objectValues = values.filter(v => v && typeof v === "object" && !Array.isArray(v));
    if (objectValues.length && objectValues.length === values.length) return objectValues;

    return [];
  }
  async function loadJson(path, optional = false) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      if (optional) return null;
      throw new Error(`Load failed: ${path} / ${err.message}`);
    }
  }

  function findBySymbol(arr, sym) {
    const s = String(sym || "").toUpperCase();
    return arr.find(x => symbolOf(x) === s) || null;
  }

  function getRows() {
    return state.scores.map(row => {
      const sym = symbolOf(row);
      const cmp = findBySymbol(state.compare, sym);
      const rt = findBySymbol(state.runtime, sym);
      const fd = findBySymbol(state.fundamentals, sym);
      return { row, cmp, rt, fd, sym };
    }).filter(x => x.sym);
  }

  function normalizeWeights(obj, keys) {
    const vals = keys.map(k => Math.max(0, num(obj[k], 0)));
    const sum = vals.reduce((a, b) => a + b, 0);
    if (sum <= 0) {
      const equal = 1 / keys.length;
      return Object.fromEntries(keys.map(k => [k, equal]));
    }
    return Object.fromEntries(keys.map((k, i) => [k, vals[i] / sum]));
  }

  function getBaseScores(ctx) {
    const { row, cmp } = ctx;
    const valuation = num(field(row, ["valuation_score", "valuation", "m7_valuation_score"], field(cmp, ["valuation_score"])), 0);
    const trend = num(field(row, ["trend_score", "trend", "m7_trend_score"], field(cmp, ["trend_score"])), 0);
    const structure = num(field(row, ["structure_score", "structure", "m7_structure_score"], field(cmp, ["structure_score"])), 0);
    const timing = num(field(row, ["timing_score", "timing", "event_score", "short_swing_score"], field(cmp, ["timing_score"])), 0);
    const money = num(field(row, ["money_score", "money", "flow_score"], field(cmp, ["money_score"])), 0);
    const top = num(field(row, ["top_score", "top_adjustment", "compare_adjustment", "zscore_adjustment"], field(cmp, ["top_score", "top_adjustment", "compare_adjustment"])), 0);
    const m7Now = num(field(row, ["m7_v2_score", "m7_final_score", "final_score", "score"], field(cmp, ["m7_v2_score", "m7_final_score", "score"])), null);
    return { valuation, trend, structure, timing, money, top, m7Now };
  }

  function scoreFromRawFactor(value, fallbackScore, scale, center = 0) {
    const v = num(value, null);
    if (v === null) return { score: fallbackScore, usedFallback: true };
    return { score: clamp((v - center) * scale + 5, 0, 10), usedFallback: false };
  }

  function computeTrend(ctx, base, params) {
    const { row, rt } = ctx;
    const audit = [];

    const linearDirect = num(field(row, ["trend_linear_score", "linear_trend_score", "long_term_linear_score"], null), null);
    const maDirect = num(field(row, ["trend_ma_score", "trend_ma200_score", "trend_ma100_score", "ma200_score", "ma100_score", "ma20w_score", "ma_trend_score"], null), null);
    const accelDirect = num(field(row, ["trend_acceleration_score", "acceleration_score", "quadratic_acceleration_score"], null), null);

    let linear = linearDirect;
    if (linear === null) {
      const slope = field(row, ["trend_linear_slope", "linear_slope", "structure_slope"], null);
      const res = scoreFromRawFactor(slope, base.trend, 500, 0);
      linear = res.score;
      audit.push(res.usedFallback ? "trend.linear: missing direct score/slope; fallback to current trend_score" : "trend.linear: derived from slope");
    } else audit.push("trend.linear: direct trend_linear_score used");

    let ma = maDirect;
    if (ma === null) {
      const maSlope = field(row, ["trend_ma_slope", "ma_slope", "ma200_slope", "ma100_slope"], null);
      if (num(maSlope, null) !== null) {
        const res = scoreFromRawFactor(maSlope, base.trend, 500, 0);
        ma = res.score;
        audit.push("trend.ma: derived from trend_ma_slope");
      } else {
        const ret6m = field(row, ["ret_6m"], field(rt, ["ret_6m"], null));
        const ret12m = field(row, ["ret_12m"], field(rt, ["ret_12m"], null));
        const proxy = num(ret6m, null) !== null ? ret6m : ret12m;
        const res = scoreFromRawFactor(proxy, base.trend, 18, 0);
        ma = res.score;
        audit.push(res.usedFallback ? "trend.ma: missing MA/proxy return; fallback to current trend_score" : "trend.ma: proxy from 6M/12M return");
      }
    } else audit.push("trend.ma: direct trend_ma_score used");

    let accel = accelDirect;
    if (accel === null) {
      const acc = field(row, ["trend_acceleration", "trend_acceleration_annualized_delta_pct", "quadratic_a", "trend_quadratic_a", "acceleration"], null);
      const res = scoreFromRawFactor(acc, base.trend, 0.25, 0);
      accel = res.score;
      audit.push(res.usedFallback ? "trend.acceleration: missing acceleration factor; fallback to current trend_score" : "trend.acceleration: derived from acceleration factor");
    } else audit.push("trend.acceleration: direct trend_acceleration_score used");

    const w = normalizeWeights(params, ["trend_linear_weight", "trend_ma_weight", "trend_acceleration_weight"]);
    const newScore = linear * w.trend_linear_weight + ma * w.trend_ma_weight + accel * w.trend_acceleration_weight;
    return { now: base.trend, new: newScore, parts: { linear, ma, accel, weights: w }, audit };
  }

  function computeMoney(ctx, base, params) {
    const { row, rt } = ctx;
    const audit = [];

    let liquidityScore = num(field(row, ["money_liquidity_score", "liquidity_score", "money_volume_score", "volume_score"], null), null);
    if (liquidityScore === null) {
      const adv = num(field(row, ["avg_dollar_volume", "market_acceptance.avg_dollar_volume", "market_acceptance.liquidity_proxy"], field(rt, ["avg_dollar_volume"], null)), null);
      if (adv !== null && adv > 0) {
        liquidityScore = clamp(Math.log10(Math.max(1, adv)) - 1.0, 0, 10);
        audit.push("money.liquidity: derived from avg_dollar_volume proxy");
      } else {
        liquidityScore = base.money;
        audit.push("money.liquidity: missing liquidity factor; fallback to current money_score");
      }
    } else audit.push("money.liquidity: direct money_liquidity_score used");

    let flowScore = num(field(row, ["money_flow_score", "flow_score", "money_volume_ratio_score", "volume_ratio_score", "flow_volume_score"], null), null);
    if (flowScore === null) {
      const vr = field(row, ["volume_ratio", "market_acceptance.volume_ratio"], field(rt, ["volume_ratio"], null));
      if (num(vr, null) === null) {
        flowScore = base.money;
        audit.push("money.flow: missing flow/volume_ratio factor; fallback to current money_score");
      } else {
        flowScore = clamp(5 + Math.log(Math.max(0.1, num(vr, 1))) * 2.2, 0, 10);
        audit.push("money.flow: derived from log(volume_ratio)");
      }
    } else audit.push("money.flow: direct money_flow_score / volume_ratio_score used");

    const positionScore = num(field(row, ["money_position_score", "position_score"], null), null);
    if (positionScore !== null) audit.push("money.position: direct money_position_score detected; audit-only");

    const rowLiquidityWeight = num(field(row, ["money_liquidity_weight"], null), null);
    const rowFlowWeight = num(field(row, ["money_flow_weight"], null), null);
    const p = { ...params };
    const userStillDefault =
      Math.abs(num(params.money_liquidity_weight, 0) - DEFAULT_PARAMS.money_liquidity_weight) < 0.000001 &&
      Math.abs(num(params.money_flow_weight, 0) - DEFAULT_PARAMS.money_flow_weight) < 0.000001;

    if (userStillDefault && rowLiquidityWeight !== null && rowFlowWeight !== null) {
      p.money_liquidity_weight = rowLiquidityWeight;
      p.money_flow_weight = rowFlowWeight;
      audit.push("money.weights: row-level Python weights used because sliders remain at default");
    } else audit.push("money.weights: UI slider weights used");

    const w = normalizeWeights(p, ["money_liquidity_weight", "money_flow_weight"]);
    const newScore = liquidityScore * w.money_liquidity_weight + flowScore * w.money_flow_weight;

    return { now: base.money, new: newScore, parts: { liquidityScore, flowScore, positionScore, weights: w }, audit };
  }

  function computeTop(base, params) {
    const capped = clamp(base.top, -Math.abs(params.top_adjustment_cap), Math.abs(params.top_adjustment_cap));
    const newTop = clamp(capped * params.top_adjustment_weight, -Math.abs(params.top_adjustment_cap), Math.abs(params.top_adjustment_cap));
    return { now: base.top, new: newTop, capped };
  }

  // -------------------------------
  // Valuation baseline engine
  // -------------------------------

  function getForwardPE(row) {
    return num(field(row, [
      "feature_snapshot.valuation.forward_pe",
      "forward_pe",
      "forwardPE",
      "pe_forward",
      "fwd_pe"
    ], null), null);
  }

  function getCategorySub(row) {
    return String(field(row, ["category_sub", "feature_snapshot.valuation.category_sub"], "UNKNOWN"));
  }

  function getStaticAnchor(categorySub, row = null) {
    const cfg = state.anchorConfig || {};
    const fromCfg = num(cfg?.base_anchor_by_category_sub?.[categorySub], null);
    if (fromCfg !== null) return fromCfg;
    const fromRow = num(field(row, ["feature_snapshot.valuation.base_anchor", "feature_snapshot.valuation.anchor_pe", "base_anchor", "anchor_pe"], null), null);
    if (fromRow !== null) return fromRow;
    return num(FALLBACK_STATIC_ANCHORS[categorySub], 20);
  }

  function getLiquidityWeight(row, rt = null) {
    const v = num(field(row, [
      "avg_dollar_volume",
      "liquidity_proxy",
      "market_acceptance.avg_dollar_volume",
      "market_acceptance.liquidity_proxy",
      "today_dollar_volume",
      "market_acceptance.today_dollar_volume"
    ], field(rt, ["avg_dollar_volume", "liquidity_proxy"], null)), null);
    if (v !== null && v > 0) return v;
    return 1;
  }


  function getRegressionValuationDetails(row) {
    return {
      currentForwardPE: getForwardPE(row),
      individualFairPE: num(field(row, [
        "individual_fair_pe",
        "regression_fair_pe",
        "valuation_regression_fair_pe",
        "historical_fair_pe",
        "feature_snapshot.valuation.individual_fair_pe",
        "feature_snapshot.valuation.regression_fair_pe"
      ], null), null),
      regressionFairPE: num(field(row, [
        "regression_fair_pe",
        "individual_fair_pe",
        "feature_snapshot.valuation.regression_fair_pe",
        "feature_snapshot.valuation.individual_fair_pe"
      ], null), null),
      currentMultiple: num(field(row, [
        "current_regression_multiple",
        "regression_current_multiple",
        "price_to_regression_now",
        "feature_snapshot.valuation.current_regression_multiple"
      ], null), null),
      historicalTrimmedMeanMultiple: num(field(row, [
        "historical_trimmed_mean_multiple",
        "regression_trimmed_mean_multiple",
        "normal_regression_multiple",
        "feature_snapshot.valuation.historical_trimmed_mean_multiple"
      ], null), null),
      historicalMedianMultiple: num(field(row, [
        "historical_median_multiple",
        "feature_snapshot.valuation.historical_median_multiple"
      ], null), null),
      historicalP25Multiple: num(field(row, [
        "historical_p25_multiple",
        "feature_snapshot.valuation.historical_p25_multiple"
      ], null), null),
      historicalP75Multiple: num(field(row, [
        "historical_p75_multiple",
        "feature_snapshot.valuation.historical_p75_multiple"
      ], null), null),
      regressionFairPriceNow: num(field(row, [
        "regression_fair_price_now",
        "feature_snapshot.valuation.regression_fair_price_now"
      ], null), null),
      regressionActualPriceNow: num(field(row, [
        "regression_actual_price_now",
        "price_now",
        "market_acceptance.price_now",
        "feature_snapshot.valuation.regression_actual_price_now"
      ], null), null),
      regressionModel: field(row, [
        "regression_valuation_model",
        "feature_snapshot.valuation.regression_valuation_model"
      ], null),
      regressionR2: num(field(row, [
        "regression_valuation_r2",
        "feature_snapshot.valuation.regression_valuation_r2"
      ], null), null),
      regressionHistoryWeeks: num(field(row, [
        "regression_valuation_history_weeks",
        "feature_snapshot.valuation.regression_valuation_history_weeks",
        "history_weeks"
      ], null), null),
      regressionSource: field(row, [
        "regression_valuation_source",
        "feature_snapshot.valuation.regression_valuation_source"
      ], null),
      regressionQuality: field(row, [
        "regression_valuation_quality",
        "feature_snapshot.valuation.regression_valuation_quality"
      ], null),
      adjustmentRaw: num(field(row, [
        "regression_adjustment_raw",
        "feature_snapshot.valuation.regression_adjustment_raw"
      ], null), null),
      adjustmentCapped: num(field(row, [
        "regression_adjustment_capped",
        "feature_snapshot.valuation.regression_adjustment_capped"
      ], null), null),
      adjustmentFloor: num(field(row, [
        "regression_adjustment_floor",
        "feature_snapshot.valuation.regression_adjustment_floor"
      ], null), null),
      adjustmentCap: num(field(row, [
        "regression_adjustment_cap",
        "feature_snapshot.valuation.regression_adjustment_cap"
      ], null), null),
      valuationHeat: num(field(row, [
        "valuation_heat",
        "feature_snapshot.valuation.valuation_heat"
      ], null), null),
      valuationHeatBaselinePE: num(field(row, [
        "valuation_heat_baseline_pe",
        "feature_snapshot.valuation.valuation_heat_baseline_pe"
      ], null), null),
      valuationHeatBrakeRule: field(row, [
        "valuation_heat_brake_rule",
        "feature_snapshot.valuation.valuation_heat_brake_rule"
      ], null)
    };
  }

  function getIndividualFairPE(row) {
    const detail = getRegressionValuationDetails(row);

    if (detail.individualFairPE !== null && detail.individualFairPE > 0) {
      return {
        value: detail.individualFairPE,
        source: detail.regressionSource || "python_individual_fair_pe",
        detail
      };
    }

    const currentPE = detail.currentForwardPE;
    const currentMultiple = detail.currentMultiple;
    const normalMultiple = detail.historicalTrimmedMeanMultiple;

    if (currentPE !== null && currentPE > 0 && currentMultiple !== null && currentMultiple > 0 && normalMultiple !== null && normalMultiple > 0) {
      const rawAdj = normalMultiple / Math.sqrt(currentMultiple);
      const cappedAdj = Math.max(0.90, Math.min(rawAdj, 1.15));
      return {
        value: currentPE * cappedAdj,
        source: "frontend_fallback_current_pe_x_trimmed_mean_over_sqrt_current_multiple",
        detail: { ...detail, adjustmentRaw: rawAdj, adjustmentCapped: cappedAdj }
      };
    }

    if (currentPE !== null && currentPE > 0) {
      return { value: currentPE, source: "fallback_current_forward_pe", detail };
    }
    return { value: null, source: "missing_forward_pe", detail };
  }

  function getDynamicMultipliers(row, params = state.params) {
    const cfg = state.anchorConfig || {};
    const marketRegime = field(row, ["feature_snapshot.valuation.market_regime", "market_regime"], null);
    const industryRegime = field(row, ["feature_snapshot.valuation.industry_regime", "industry_regime"], null);
    const archetype = field(row, ["valuation_archetype", "feature_snapshot.valuation.valuation_archetype"], null);
    const categorySub = getCategorySub(row);
    const family = cfg?.category_family_map?.[categorySub] || null;

    const baseMarketMultiplier =
      num(field(row, ["feature_snapshot.valuation.market_multiplier", "market_multiplier"], null), null) ??
      num(cfg?.market_regimes?.[marketRegime]?.multiplier, 1);

    let baseIndustryMultiplier = num(field(row, ["feature_snapshot.valuation.industry_multiplier", "industry_multiplier"], null), null);
    if (baseIndustryMultiplier === null) {
      const ir = cfg?.industry_regimes?.[industryRegime];
      baseIndustryMultiplier = num(ir?.family_multipliers?.[family], num(ir?.default_multiplier, 1));
    }

    const baseArchetypeMultiplier =
      num(field(row, ["feature_snapshot.valuation.archetype_multiplier", "archetype_multiplier"], null), null) ??
      num(cfg?.valuation_archetypes?.[archetype]?.multiplier, 1);

    const marketFactor = num(params.valuation_market_multiplier_factor, 1.0);
    const industryFactor = num(params.valuation_industry_multiplier_factor, 1.0);
    const archetypeFactor = num(params.valuation_archetype_multiplier_factor, 1.0);

    const marketMultiplier = baseMarketMultiplier * marketFactor;
    const industryMultiplier = baseIndustryMultiplier * industryFactor;
    const archetypeMultiplier = baseArchetypeMultiplier * archetypeFactor;

    return {
      marketRegime,
      industryRegime,
      archetype,
      family,
      baseMarketMultiplier,
      baseIndustryMultiplier,
      baseArchetypeMultiplier,
      marketFactor,
      industryFactor,
      archetypeFactor,
      marketMultiplier,
      industryMultiplier,
      archetypeMultiplier,
      combined: marketMultiplier * industryMultiplier * archetypeMultiplier,
      baseCombined: baseMarketMultiplier * baseIndustryMultiplier * baseArchetypeMultiplier
    };
  }

  function buildSectorBaselineEngine(params = state.params) {
    const rows = getRows();
    const groups = new Map();

    rows.forEach(ctx => {
      const row = ctx.row;
      const categorySub = getCategorySub(row);
      if (!categorySub || categorySub === "UNKNOWN") return;
      const fair = getIndividualFairPE(row);
      if (fair.value === null || fair.value <= 0 || !Number.isFinite(fair.value)) return;
      const weight = getLiquidityWeight(row, ctx.rt);
      if (!groups.has(categorySub)) groups.set(categorySub, []);
      groups.get(categorySub).push({ ctx, fairPE: fair.value, source: fair.source, weight });
    });

    const blend = normalizeWeights(params, ["sector_peer_baseline_weight", "sector_static_anchor_weight"]);
    const result = {};

    Object.keys(FALLBACK_STATIC_ANCHORS).forEach(cat => {
      if (!groups.has(cat)) groups.set(cat, []);
    });

    groups.forEach((items, categorySub) => {
      const staticAnchor = getStaticAnchor(categorySub, items[0]?.ctx?.row || null);
      let weightedPeerBaseline = null;
      let totalWeight = 0;
      let weightedSum = 0;
      items.forEach(item => {
        const w = Math.max(1, num(item.weight, 1));
        totalWeight += w;
        weightedSum += item.fairPE * w;
      });
      if (totalWeight > 0) weightedPeerBaseline = weightedSum / totalWeight;
      const finalSectorBaseline =
        weightedPeerBaseline === null
          ? staticAnchor
          : weightedPeerBaseline * blend.sector_peer_baseline_weight + staticAnchor * blend.sector_static_anchor_weight;

      result[categorySub] = {
        categorySub,
        peerCount: items.length,
        weightedPeerBaseline,
        staticAnchor,
        finalSectorBaseline,
        peerWeight: blend.sector_peer_baseline_weight,
        staticWeight: blend.sector_static_anchor_weight,
        totalLiquidity: totalWeight,
        members: items.map(item => ({
          symbol: item.ctx.sym,
          name: field(item.ctx.row, ["name", "company_name"], ""),
          fairPE: item.fairPE,
          source: item.source,
          liquidity: item.weight,
          share: totalWeight > 0 ? item.weight / totalWeight : null
        })).sort((a, b) => b.share - a.share)
      };
    });

    return result;
  }


  function computeValuationBaseline(ctx, params = state.params) {
    const row = ctx.row;
    const categorySub = getCategorySub(row);
    const currentForwardPE = getForwardPE(row);
    const individual = getIndividualFairPE(row);
    const regression = individual.detail || getRegressionValuationDetails(row);
    const sectorMap = buildSectorBaselineEngine(params);
    const sector = sectorMap[categorySub] || null;
    const staticAnchor = getStaticAnchor(categorySub, row);
    const dynamic = getDynamicMultipliers(row, params);
    const sectorBaseline = sector?.finalSectorBaseline ?? staticAnchor;
    const finalAnchorAfterDynamic = sectorBaseline * dynamic.combined;

    return {
      categorySub,
      currentForwardPE,
      individualFairPE: individual.value,
      individualFairPESource: individual.source,
      regression,
      staticAnchor,
      weightedPeerBaseline: sector?.weightedPeerBaseline ?? null,
      peerCount: sector?.peerCount ?? 0,
      sectorBaseline,
      dynamic,
      finalAnchorAfterDynamic,
      sectorMembers: sector?.members || []
    };
  }

  function computeM7(ctx, params = state.params) {
    const base = getBaseScores(ctx);
    const trend = computeTrend(ctx, base, params);
    const money = computeMoney(ctx, base, params);
    const top = computeTop(base, params);
    const valuationBaseline = computeValuationBaseline(ctx, params);

    const rawWeightsNow = normalizeWeights(DEFAULT_PARAMS, [
      "raw_valuation_weight", "raw_trend_weight", "raw_structure_weight", "raw_timing_weight", "raw_money_weight"
    ]);
    const rawWeightsNew = normalizeWeights(params, [
      "raw_valuation_weight", "raw_trend_weight", "raw_structure_weight", "raw_timing_weight", "raw_money_weight"
    ]);

    const rawNow =
      base.valuation * rawWeightsNow.raw_valuation_weight +
      base.trend * rawWeightsNow.raw_trend_weight +
      base.structure * rawWeightsNow.raw_structure_weight +
      base.timing * rawWeightsNow.raw_timing_weight +
      base.money * rawWeightsNow.raw_money_weight;

    const rawNew =
      base.valuation * rawWeightsNew.raw_valuation_weight +
      trend.new * rawWeightsNew.raw_trend_weight +
      base.structure * rawWeightsNew.raw_structure_weight +
      base.timing * rawWeightsNew.raw_timing_weight +
      money.new * rawWeightsNew.raw_money_weight;

    const reconstructedNow = clamp(rawNow + top.now, 0, 10);
    const m7Now = base.m7Now === null ? reconstructedNow : base.m7Now;
    const newScore = clamp(rawNew + top.new, 0, 10);

    const factorRows = [
      ["valuation", base.valuation, base.valuation, rawWeightsNow.raw_valuation_weight, rawWeightsNew.raw_valuation_weight],
      ["trend", base.trend, trend.new, rawWeightsNow.raw_trend_weight, rawWeightsNew.raw_trend_weight],
      ["structure", base.structure, base.structure, rawWeightsNow.raw_structure_weight, rawWeightsNew.raw_structure_weight],
      ["timing", base.timing, base.timing, rawWeightsNow.raw_timing_weight, rawWeightsNew.raw_timing_weight],
      ["money", base.money, money.new, rawWeightsNow.raw_money_weight, rawWeightsNew.raw_money_weight]
    ].map(([name, scoreNow, scoreNew, weightNow, weightNew]) => {
      const contributionNow = scoreNow * weightNow;
      const contributionNew = scoreNew * weightNew;
      return {
        name,
        scoreNow,
        scoreNew,
        scoreDelta: scoreNew - scoreNow,
        scoreDeltaPct: scoreNow ? (scoreNew - scoreNow) / scoreNow : null,
        weightNow,
        userWeightNew: params[`raw_${name}_weight`] ?? null,
        effectiveWeightNew: weightNew,
        contributionNow,
        contributionNew,
        contributionDelta: contributionNew - contributionNow
      };
    });

    const scores = {
      valuation: { now: base.valuation, new: base.valuation },
      trend: { now: base.trend, new: trend.new },
      structure: { now: base.structure, new: base.structure },
      timing: { now: base.timing, new: base.timing },
      money: { now: base.money, new: money.new },
      top: { now: top.now, new: top.new },
      raw: { now: rawNow, new: rawNew },
      m7: { now: m7Now, new: newScore },
      reconstructedNow: { now: reconstructedNow, new: reconstructedNow }
    };

    const traceLines = [];
    traceLines.push(`SYMBOL = ${ctx.sym}`);
    traceLines.push(`M7 now source = ${base.m7Now === null ? "reconstructed raw+top" : "data field m7_v2_score/m7_final_score"}`);
    traceLines.push("");
    traceLines.push("RAW WEIGHTS normalized:");
    Object.entries(rawWeightsNew).forEach(([k,v]) => traceLines.push(`  ${k} = ${v.toFixed(4)}`));
    traceLines.push("");
    traceLines.push("VALUATION BASELINE ENGINE:");
    traceLines.push(`  category_sub=${valuationBaseline.categorySub}`);
    traceLines.push(`  current_forward_pe=${fmt(valuationBaseline.currentForwardPE)}`);
    traceLines.push(`  individual_fair_pe=${fmt(valuationBaseline.individualFairPE)} / source=${valuationBaseline.individualFairPESource}`);
    traceLines.push(`  regression_price_now=${fmt(valuationBaseline.regression.regressionFairPriceNow)} / actual_price_now=${fmt(valuationBaseline.regression.regressionActualPriceNow)}`);
    traceLines.push(`  current_multiple=${fmt(valuationBaseline.regression.currentMultiple, 4)} / historical_trimmed_mean=${fmt(valuationBaseline.regression.historicalTrimmedMeanMultiple, 4)}`);
    traceLines.push(`  adjustment_raw=${fmt(valuationBaseline.regression.adjustmentRaw, 4)} / adjustment_capped=${fmt(valuationBaseline.regression.adjustmentCapped, 4)} / cap=${fmt(valuationBaseline.regression.adjustmentCap, 4)}`);
    traceLines.push(`  valuation_heat=${fmt(valuationBaseline.regression.valuationHeat, 4)} / heat_baseline_pe=${fmt(valuationBaseline.regression.valuationHeatBaselinePE)} / rule=${valuationBaseline.regression.valuationHeatBrakeRule || "--"}`);
    traceLines.push(`  weighted_peer_baseline=${fmt(valuationBaseline.weightedPeerBaseline)} / peer_count=${valuationBaseline.peerCount}`);
    traceLines.push(`  static_anchor=${fmt(valuationBaseline.staticAnchor)}`);
    traceLines.push(`  sector_baseline = peer*${fmt(normalizeWeights(params, ["sector_peer_baseline_weight", "sector_static_anchor_weight"]).sector_peer_baseline_weight)} + static*${fmt(normalizeWeights(params, ["sector_peer_baseline_weight", "sector_static_anchor_weight"]).sector_static_anchor_weight)} = ${fmt(valuationBaseline.sectorBaseline)}`);
    traceLines.push(`  dynamic multipliers base: market=${fmt(valuationBaseline.dynamic.baseMarketMultiplier)} industry=${fmt(valuationBaseline.dynamic.baseIndustryMultiplier)} archetype=${fmt(valuationBaseline.dynamic.baseArchetypeMultiplier)} base_combined=${fmt(valuationBaseline.dynamic.baseCombined)}`);
    traceLines.push(`  dynamic multiplier factors: market_factor=${fmt(valuationBaseline.dynamic.marketFactor)} industry_factor=${fmt(valuationBaseline.dynamic.industryFactor)} archetype_factor=${fmt(valuationBaseline.dynamic.archetypeFactor)}`);
    traceLines.push(`  dynamic multipliers effective: market=${fmt(valuationBaseline.dynamic.marketMultiplier)} industry=${fmt(valuationBaseline.dynamic.industryMultiplier)} archetype=${fmt(valuationBaseline.dynamic.archetypeMultiplier)} combined=${fmt(valuationBaseline.dynamic.combined)}`);
    traceLines.push(`  final_anchor_after_dynamic=${fmt(valuationBaseline.finalAnchorAfterDynamic)}`);
    traceLines.push("");
    traceLines.push("TREND:");
    traceLines.push(`  linear=${fmt(trend.parts.linear)} * w=${trend.parts.weights.trend_linear_weight.toFixed(4)}`);
    traceLines.push(`  ma_score=${fmt(trend.parts.ma)} * w=${trend.parts.weights.trend_ma_weight.toFixed(4)}`);
    traceLines.push(`  acceleration=${fmt(trend.parts.accel)} * w=${trend.parts.weights.trend_acceleration_weight.toFixed(4)}`);
    traceLines.push(`  trend now=${fmt(base.trend)} / trend new=${fmt(trend.new)} / delta=${fmt(trend.new - base.trend)}`);
    traceLines.push("");
    traceLines.push("MONEY:");
    traceLines.push(`  liquidityScore=${fmt(money.parts.liquidityScore)} * w=${money.parts.weights.money_liquidity_weight.toFixed(4)}`);
    traceLines.push(`  flowScore=${fmt(money.parts.flowScore)} * w=${money.parts.weights.money_flow_weight.toFixed(4)}`);
    if (money.parts.positionScore !== null) traceLines.push(`  positionScore=${fmt(money.parts.positionScore)} audit-only`);
    traceLines.push(`  money now=${fmt(base.money)} / money new=${fmt(money.new)} / delta=${fmt(money.new - base.money)}`);
    traceLines.push("");
    traceLines.push("FINAL:");
    traceLines.push(`  rawNow = ${fmt(rawNow)}`);
    traceLines.push(`  rawNew = ${fmt(rawNew)}`);
    traceLines.push(`  top now=${fmt(top.now)} / capped=${fmt(top.capped)} / top new=${fmt(top.new)}`);
    traceLines.push(`  M7 new = clamp(rawNew + topNew, 0, 10) = ${fmt(newScore)}`);

    const audit = [...trend.audit, ...money.audit];
    audit.push(`valuation.baseline: 28-sector baseline uses avg_dollar_volume/liquidity weighted individual fair PE + static anchor blend`);
    audit.push(`valuation.baseline: individual fair PE source = ${valuationBaseline.individualFairPESource}`);
    audit.push(`top: clamp top adjustment to ±${fmt(params.top_adjustment_cap)} then multiply by top_adjustment_weight`);
    audit.push("global: no cross-stock re-normalization in what-if mode");

    return {
      ctx,
      base,
      scores,
      trend,
      money,
      top,
      rawWeightsNow,
      rawWeightsNew,
      factorRows,
      valuationBaseline,
      trace: traceLines.join("\n"),
      audit
    };
  }

  // -------------------------------
  // Rendering
  // -------------------------------

  function renderParamControls() {
    const box = $("paramControls");
    box.innerHTML = PARAM_DEFS.map(([key, label, min, max, step]) => `
      <div class="param">
        <div class="param-top"><span class="param-name">${label}</span><span class="param-val" id="pv_${key}">${fmt(state.params[key], 2)}</span></div>
        <input id="p_${key}" type="range" min="${min}" max="${max}" step="${step}" value="${state.params[key]}">
      </div>
    `).join("");
    PARAM_DEFS.forEach(([key]) => {
      $("p_" + key).addEventListener("input", (e) => {
        state.params[key] = num(e.target.value, DEFAULT_PARAMS[key]);
        $("pv_" + key).textContent = fmt(state.params[key], 2);
        render();
      });
    });
  }

  function paramRow(name, now, newer) {
    const d = num(newer, 0) - num(now, 0);
    const pct = num(now, 0) === 0 ? null : d / num(now, 0);
    return `<div class="metric"><div>${escapeHtml(name)}</div><div class="num">${fmt(now)}</div><div class="num">${fmt(newer)}</div><div class="num ${deltaClass(d)}">${fmt(d)}</div><div class="num ${deltaClass(d)}">${fmtPct(pct)}</div></div>`;
  }

  function renderParamsTable() {
    $("paramTable").innerHTML = PARAM_DEFS.map(([key, label]) => paramRow(label, DEFAULT_PARAMS[key], state.params[key])).join("");
  }

  function renderRawImpactTable(result) {
    const rows = result.factorRows;
    const rawDelta = result.scores.raw.new - result.scores.raw.now;
    $("rawImpactTable").innerHTML = `
      <thead>
        <tr><th>Score Layer</th><th>Now</th><th>New</th><th>Delta</th><th>Delta %</th><th>Impact to Raw Δ</th></tr>
      </thead>
      <tbody>
        ${rows.map(r => {
          const impact = Math.abs(rawDelta) < 0.000001 ? null : r.contributionDelta / rawDelta;
          return `<tr>
            <td>${escapeHtml(r.name)}</td>
            <td>${fmt(r.scoreNow)}</td>
            <td>${fmt(r.scoreNew)}</td>
            <td class="${deltaClass(r.scoreDelta)}">${fmt(r.scoreDelta)}</td>
            <td class="${deltaClass(r.scoreDelta)}">${fmtPct(r.scoreDeltaPct)}</td>
            <td class="${deltaClass(r.contributionDelta)}">${fmtPct(impact)}</td>
          </tr>`;
        }).join("")}
        <tr><th>RAW TOTAL</th><th>${fmt(result.scores.raw.now)}</th><th>${fmt(result.scores.raw.new)}</th><th class="${deltaClass(rawDelta)}">${fmt(rawDelta)}</th><th>${fmtPct(result.scores.raw.now ? rawDelta / result.scores.raw.now : null)}</th><th>100.0%</th></tr>
        <tr><th>M7 FINAL</th><th>${fmt(result.scores.m7.now)}</th><th>${fmt(result.scores.m7.new)}</th><th class="${deltaClass(result.scores.m7.new - result.scores.m7.now)}">${fmt(result.scores.m7.new - result.scores.m7.now)}</th><th>${fmtPct(result.scores.m7.now ? (result.scores.m7.new - result.scores.m7.now) / result.scores.m7.now : null)}</th><th>after top/clamp</th></tr>
      </tbody>
    `;
  }

  function renderFactorImpactTable(result) {
    $("factorImpactTable").innerHTML = `
      <thead>
        <tr>
          <th>Factor</th><th>Raw Score Now</th><th>Raw Score New</th><th>Now Weight</th><th>User New Weight</th><th>Effective New Weight</th><th>Contribution Now</th><th>Contribution New</th><th>Delta</th>
        </tr>
      </thead>
      <tbody>
        ${result.factorRows.map(r => `
          <tr>
            <td>${escapeHtml(r.name)}</td>
            <td>${fmt(r.scoreNow)}</td>
            <td>${fmt(r.scoreNew)}</td>
            <td>${fmt(r.weightNow, 4)}</td>
            <td>${r.userWeightNew === null ? "--" : fmt(r.userWeightNew, 4)}</td>
            <td>${fmt(r.effectiveWeightNew, 4)}</td>
            <td>${fmt(r.contributionNow)}</td>
            <td>${fmt(r.contributionNew)}</td>
            <td class="${deltaClass(r.contributionDelta)}">${fmt(r.contributionDelta)}</td>
          </tr>`).join("")}
      </tbody>
    `;
  }


  function renderValuationBaseline(result) {
    const v = result.valuationBaseline;
    const r = v.regression || {};
    const memberRows = v.sectorMembers.slice(0, 10).map(m => `
      <tr>
        <td>${escapeHtml(m.symbol)}</td>
        <td>${fmt(m.fairPE)}</td>
        <td>${fmt(m.liquidity, 0)}</td>
        <td>${fmtPct(m.share)}</td>
        <td>${escapeHtml(m.source)}</td>
      </tr>
    `).join("");

    $("valuationBaselineBox").innerHTML = `
      <div class="mini-grid">
        <div class="mini-card"><span>Category Sub</span><b style="font-size:12px">${escapeHtml(v.categorySub)}</b></div>
        <div class="mini-card"><span>Current Forward PE</span><b>${fmt(v.currentForwardPE)}</b></div>
        <div class="mini-card"><span>Individual Fair PE</span><b>${fmt(v.individualFairPE)}</b></div>
        <div class="mini-card"><span>Peer Count</span><b>${v.peerCount}</b></div>
        <div class="mini-card"><span>Weighted Peer Baseline</span><b>${fmt(v.weightedPeerBaseline)}</b></div>
        <div class="mini-card"><span>Static Anchor</span><b>${fmt(v.staticAnchor)}</b></div>
        <div class="mini-card"><span>Sector Baseline</span><b>${fmt(v.sectorBaseline)}</b></div>
        <div class="mini-card"><span>Final Anchor After Dynamic</span><b>${fmt(v.finalAnchorAfterDynamic)}</b></div>
      </div>
      <div class="small">
        <span class="tag">source: ${escapeHtml(v.individualFairPESource)}</span>
        <span class="tag">quality: ${escapeHtml(r.regressionQuality || "--")}</span>
        <span class="tag">model: ${escapeHtml(r.regressionModel || "--")}</span>
        <span class="tag">R²: ${fmt(r.regressionR2)}</span>
        <span class="tag">history weeks: ${fmt(r.regressionHistoryWeeks, 0)}</span>
        <span class="tag">base market × industry × archetype = ${fmt(v.dynamic.baseCombined)}</span>
        <span class="tag">effective market × industry × archetype = ${fmt(v.dynamic.combined)}</span>
        <span class="tag">factors M/I/A = ${fmt(v.dynamic.marketFactor)} / ${fmt(v.dynamic.industryFactor)} / ${fmt(v.dynamic.archetypeFactor)}</span>
        <span class="tag">market: ${escapeHtml(v.dynamic.marketRegime || "--")}</span>
        <span class="tag">industry: ${escapeHtml(v.dynamic.industryRegime || "--")}</span>
        <span class="tag">archetype: ${escapeHtml(v.dynamic.archetype || "--")}</span>
      </div>

      <table class="table-tight" style="margin-top:10px">
        <thead><tr><th colspan="4" style="text-align:left">Individual Fair PE Trace / 個股合理本益比追蹤</th></tr></thead>
        <tbody>
          <tr><td>Actual Price Now</td><td>${fmt(r.regressionActualPriceNow)}</td><td>Regression Fair Price Now</td><td>${fmt(r.regressionFairPriceNow)}</td></tr>
          <tr><td>Current Regression Multiple</td><td>${fmt(r.currentMultiple, 4)}</td><td>Historical Trimmed Mean Multiple</td><td>${fmt(r.historicalTrimmedMeanMultiple, 4)}</td></tr>
          <tr><td>Historical Median / P25 / P75</td><td colspan="3">${fmt(r.historicalMedianMultiple, 4)} / ${fmt(r.historicalP25Multiple, 4)} / ${fmt(r.historicalP75Multiple, 4)}</td></tr>
          <tr><td>Adjustment Raw</td><td>${fmt(r.adjustmentRaw, 4)}</td><td>Adjustment Capped</td><td>${fmt(r.adjustmentCapped, 4)}</td></tr>
          <tr><td>Adjustment Floor / Cap</td><td>${fmt(r.adjustmentFloor, 4)} / ${fmt(r.adjustmentCap, 4)}</td><td>Heat Brake Rule</td><td>${escapeHtml(r.valuationHeatBrakeRule || "--")}</td></tr>
          <tr><td>Valuation Heat</td><td>${fmt(r.valuationHeat, 4)}</td><td>Heat Baseline PE</td><td>${fmt(r.valuationHeatBaselinePE)}</td></tr>
        </tbody>
      </table>

      <table style="margin-top:10px">
        <thead><tr><th>Top Sector Members</th><th>Fair PE</th><th>Liquidity</th><th>Weight Share</th><th>Fair PE Source</th></tr></thead>
        <tbody>${memberRows || `<tr><td colspan="5">No members</td></tr>`}</tbody>
      </table>
    `;

    const sectorMap = buildSectorBaselineEngine(state.params);
    const rows = Object.values(sectorMap)
      .sort((a, b) => a.categorySub.localeCompare(b.categorySub));
    $("sectorBaselineTable").innerHTML = `
      <thead><tr><th>Category Sub</th><th>Companies</th><th>Peers</th><th>Weighted Peer PE</th><th>Static Anchor</th><th>Final Sector Baseline</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${escapeHtml(r.categorySub)}</td>
            <td style="text-align:left">${escapeHtml((r.members || []).slice(0, 10).map(m => m.symbol).join(" / ") || "--")}</td>
            <td>${r.peerCount}</td>
            <td>${fmt(r.weightedPeerBaseline)}</td>
            <td>${fmt(r.staticAnchor)}</td>
            <td>${fmt(r.finalSectorBaseline)}</td>
          </tr>
        `).join("")}
      </tbody>
    `;
  }

  function renderAudit(result) {
    $("auditBox").innerHTML = `
      <table>
        <thead><tr><th>Rule</th><th>Status</th></tr></thead>
        <tbody>
          ${result.audit.map(x => `<tr><td>${escapeHtml(x)}</td><td>${x.includes("fallback") || x.includes("missing") ? "fallback" : "ok"}</td></tr>`).join("")}
        </tbody>
      </table>
    `;
  }

  function impactFactors(result) {
    const rows = result.factorRows
      .map(r => ({ name: r.name, delta: r.contributionDelta }))
      .filter(r => Math.abs(r.delta) > 0.005)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 2);
    if (!rows.length) return "Stable";
    return rows.map(r => `${r.name} ${r.delta >= 0 ? "↑" : "↓"}`).join(" / ");
  }

  function getMainFactorValues(result) {
    return {
      valuation: result.scores.valuation.new,
      trend: result.scores.trend.new,
      structure: result.scores.structure.new,
      timing: result.scores.timing.new,
      money: result.scores.money.new
    };
  }

  function renderDeltaPreview() {
    const computed = getRows().map(ctx => {
      const r = computeM7(ctx, state.params);
      const price = num(field(ctx.row, ["price_now", "market_acceptance.price_now"], field(ctx.rt, ["price_now"], null)), null);
      const m1 = num(field(ctx.row, ["m1_score"], null), null);
      const name = field(ctx.row, ["name", "company_name"], "");
      const f = getMainFactorValues(r);
      return {
        sym: ctx.sym,
        name,
        price,
        categorySub: getCategorySub(ctx.row),
        m1Now: m1,
        m1New: m1,
        m7Now: r.scores.m7.now,
        m7New: r.scores.m7.new,
        delta: r.scores.m7.new - r.scores.m7.now,
        deltaPct: r.scores.m7.now ? (r.scores.m7.new - r.scores.m7.now) / r.scores.m7.now : null,
        valuation: f.valuation,
        trend: f.trend,
        structure: f.structure,
        timing: f.timing,
        money: f.money,
        impact: impactFactors(r)
      };
    });

    const nowRanked = [...computed].sort((a,b) => b.m7Now - a.m7Now);
    const newRanked = [...computed].sort((a,b) => b.m7New - a.m7New);
    const nowRank = new Map(nowRanked.map((x, i) => [x.sym, i + 1]));
    const newRank = new Map(newRanked.map((x, i) => [x.sym, i + 1]));

    const rows = computed
      .map(x => ({ ...x, rankNow: nowRank.get(x.sym), rankNew: newRank.get(x.sym) }))
      .sort((a,b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0,30);

    $("deltaPreview").innerHTML = `
      <thead><tr>
        <th>Rank Now</th><th>Rank New</th><th>Symbol</th><th>Name</th><th>Price</th><th>Delta %</th>
        <th>M1 Now</th><th>M1 New</th><th>M7 Now</th><th>M7 New</th>
        <th>Val</th><th>Trend</th><th>Struct</th><th>Timing</th><th>Money</th><th>Impact Factors</th>
      </tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td>${r.rankNow}</td><td>${r.rankNew}</td><td>${r.sym}</td><td>${escapeHtml(r.name)}</td><td>${fmt(r.price)}</td>
        <td class="${deltaClass(r.delta)}">${fmtPct(r.deltaPct)}</td>
        <td>${fmt(r.m1Now)}</td><td>${fmt(r.m1New)}</td><td>${fmt(r.m7Now)}</td><td>${fmt(r.m7New)}</td>
        <td>${fmt(r.valuation)}</td><td>${fmt(r.trend)}</td><td>${fmt(r.structure)}</td><td>${fmt(r.timing)}</td><td>${fmt(r.money)}</td>
        <td>${escapeHtml(r.impact)}</td>
      </tr>`).join("")}</tbody>
    `;
  }

  function percentile(sortedNums, p) {
    if (!sortedNums.length) return null;
    const idx = (sortedNums.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sortedNums[lo];
    const w = idx - lo;
    return sortedNums[lo] * (1 - w) + sortedNums[hi] * w;
  }

  function renderFactorDistribution() {
    const rows = getRows().map(ctx => {
      const r = computeM7(ctx, state.params);
      return {
        sym: ctx.sym,
        name: field(ctx.row, ["name", "company_name"], ""),
        categorySub: getCategorySub(ctx.row),
        valuation: r.scores.valuation.new,
        trend: r.scores.trend.new,
        structure: r.scores.structure.new,
        timing: r.scores.timing.new,
        money: r.scores.money.new,
        m7: r.scores.m7.new
      };
    });

    const factors = [
      ["valuation", "Valuation"],
      ["trend", "Trend"],
      ["structure", "Structure"],
      ["timing", "Timing"],
      ["money", "Money"]
    ];

    const factorHtml = factors.map(([key, label]) => {
      const valid = rows.filter(r => num(r[key], null) !== null);
      const sortedAsc = [...valid].sort((a,b) => a[key] - b[key]);
      const sortedDesc = [...valid].sort((a,b) => b[key] - a[key]);
      const nums = sortedAsc.map(r => r[key]);
      const avg = nums.length ? nums.reduce((a,b) => a+b, 0) / nums.length : null;
      const low = sortedAsc.slice(0,5).map(r => `${r.sym} ${fmt(r[key])}`).join(" / ");
      const high = sortedDesc.slice(0,5).map(r => `${r.sym} ${fmt(r[key])}`).join(" / ");
      return `
        <tr>
          <td>${label}</td>
          <td>${fmt(avg)}</td>
          <td>${fmt(percentile(nums, 0.25))}</td>
          <td>${fmt(percentile(nums, 0.50))}</td>
          <td>${fmt(percentile(nums, 0.75))}</td>
          <td style="text-align:left">${escapeHtml(high)}</td>
          <td style="text-align:left">${escapeHtml(low)}</td>
        </tr>
      `;
    }).join("");

    const catMap = new Map();
    rows.forEach(r => {
      if (!catMap.has(r.categorySub)) catMap.set(r.categorySub, { categorySub: r.categorySub, symbols: [], n: 0, valuation:0, trend:0, structure:0, timing:0, money:0, m7:0 });
      const c = catMap.get(r.categorySub);
      c.n += 1;
      c.symbols.push(r.sym);
      ["valuation","trend","structure","timing","money","m7"].forEach(k => c[k] += num(r[k], 0));
    });
    const catRows = [...catMap.values()].map(c => {
      ["valuation","trend","structure","timing","money","m7"].forEach(k => c[k] = c.n ? c[k]/c.n : null);
      return c;
    }).sort((a,b) => b.m7 - a.m7);

    $("factorDistributionBox").innerHTML = `
      <div class="section-note">上表回答：哪個 factor 分數高、哪個低；下表回答：各 category_sub 的平均 factor profile。</div>
      <table class="table-tight">
        <thead><tr><th>Factor</th><th>Avg</th><th>P25</th><th>Median</th><th>P75</th><th>Top High Stocks</th><th>Top Low Stocks</th></tr></thead>
        <tbody>${factorHtml}</tbody>
      </table>
      <table class="table-tight" style="margin-top:12px">
        <thead><tr><th>Category Sub</th><th>Companies</th><th>N</th><th>Val</th><th>Trend</th><th>Struct</th><th>Timing</th><th>Money</th><th>M7 Avg</th></tr></thead>
        <tbody>${catRows.map(c => `<tr>
          <td>${escapeHtml(c.categorySub)}</td><td style="text-align:left">${escapeHtml((c.symbols || []).join(" / "))}</td><td>${c.n}</td><td>${fmt(c.valuation)}</td><td>${fmt(c.trend)}</td><td>${fmt(c.structure)}</td><td>${fmt(c.timing)}</td><td>${fmt(c.money)}</td><td>${fmt(c.m7)}</td>
        </tr>`).join("")}</tbody>
      </table>
    `;
  }

  function paramBumpFor(def) {
    const [key, , min, max, step] = def;
    const current = num(state.params[key], DEFAULT_PARAMS[key]);
    const defaultBump = key.includes("top_adjustment_cap") ? 0.10 : 0.05;
    let bump = Math.max(num(step, 0.01), defaultBump);
    if (current + bump > max) bump = -Math.max(num(step, 0.01), defaultBump);
    if (current + bump < min) bump = Math.max(num(step, 0.01), defaultBump);
    return bump;
  }

  function parameterImpactLabel(key) {
    if (key.includes("valuation") || key.includes("sector")) return "valuation";
    if (key.includes("trend")) return "trend";
    if (key.includes("structure")) return "structure";
    if (key.includes("timing")) return "timing";
    if (key.includes("money")) return "money";
    if (key.includes("top")) return "top/final";
    return "mixed";
  }

  function renderSensitivityAnalysis() {
    const selectedCtx = getRows().find(x => x.sym === state.selectedSymbol) || getRows()[0];
    if (!selectedCtx) return;

    const baseSelected = computeM7(selectedCtx, state.params);
    const allRows = getRows();
    const outputRows = PARAM_DEFS.map(def => {
      const [key, label, min, max] = def;
      const bump = paramBumpFor(def);
      const bumped = { ...state.params, [key]: clamp(num(state.params[key], DEFAULT_PARAMS[key]) + bump, min, max) };

      const selectedNew = computeM7(selectedCtx, bumped);
      const selectedDelta = selectedNew.scores.m7.new - baseSelected.scores.m7.new;

      const categoryImpact = new Map();
      let totalAbs = 0;
      let maxAbs = -1;
      let maxStock = null;

      allRows.forEach(ctx => {
        const base = computeM7(ctx, state.params);
        const changed = computeM7(ctx, bumped);
        const delta = changed.scores.m7.new - base.scores.m7.new;
        const abs = Math.abs(delta);
        totalAbs += abs;
        if (abs > maxAbs) {
          maxAbs = abs;
          maxStock = { sym: ctx.sym, delta };
        }
        const cat = getCategorySub(ctx.row);
        if (!categoryImpact.has(cat)) categoryImpact.set(cat, { cat, n: 0, absSum: 0 });
        const c = categoryImpact.get(cat);
        c.n += 1;
        c.absSum += abs;
      });

      const catRows = [...categoryImpact.values()].map(c => ({ ...c, avgAbs: c.n ? c.absSum / c.n : 0 })).sort((a,b) => b.avgAbs - a.avgAbs);
      const topCat = catRows[0] || null;

      return {
        key,
        label,
        bump,
        selectedDelta,
        avgAbs: allRows.length ? totalAbs / allRows.length : null,
        maxStock,
        topCat,
        impactLayer: parameterImpactLabel(key)
      };
    }).sort((a,b) => Math.abs(b.selectedDelta) - Math.abs(a.selectedDelta));

    $("sensitivityTable").innerHTML = `
      <thead><tr>
        <th>Parameter</th><th>Test Δ</th><th>Linked Factor</th><th>Selected Stock Δ</th><th>All Avg |Δ|</th><th>Max Stock</th><th>Most Sensitive Category</th>
      </tr></thead>
      <tbody>${outputRows.map(r => `<tr>
        <td>${escapeHtml(r.label)}</td>
        <td class="${deltaClass(r.bump)}">${fmt(r.bump)}</td>
        <td>${escapeHtml(r.impactLayer)}</td>
        <td class="${deltaClass(r.selectedDelta)}">${fmt(r.selectedDelta)}</td>
        <td>${fmt(r.avgAbs)}</td>
        <td>${r.maxStock ? `${escapeHtml(r.maxStock.sym)} <span class="${deltaClass(r.maxStock.delta)}">${fmt(r.maxStock.delta)}</span>` : "--"}</td>
        <td>${r.topCat ? `${escapeHtml(r.topCat.cat)} / avg |Δ| ${fmt(r.topCat.avgAbs)}` : "--"}</td>
      </tr>`).join("")}</tbody>
    `;
  }

  function renderSymbolOptions() {
    const q = String($("searchBox").value || "").trim().toUpperCase();
    const rows = getRows().filter(x => {
      if (!q) return true;
      const name = String(field(x.row, ["name", "company_name"], "")).toUpperCase();
      return x.sym.includes(q) || name.includes(q);
    });
    const sel = $("symbolSelect");
    const current = state.selectedSymbol;
    sel.innerHTML = rows.map(x => {
      const name = field(x.row, ["name", "company_name"], "");
      return `<option value="${x.sym}">${x.sym}${name ? " - " + escapeHtml(name) : ""}</option>`;
    }).join("");
    if (current && rows.some(x => x.sym === current)) sel.value = current;
    else if (rows[0]) state.selectedSymbol = rows[0].sym;
  }

  function render() {
    renderParamsTable();
    const ctx = getRows().find(x => x.sym === state.selectedSymbol) || getRows()[0];
    if (!ctx) return;
    state.selectedSymbol = ctx.sym;
    const result = computeM7(ctx, state.params);
    const d = result.scores.m7.new - result.scores.m7.now;

    $("kpiNow").textContent = fmt(result.scores.m7.now);
    $("kpiNew").textContent = fmt(result.scores.m7.new);
    $("kpiDelta").textContent = fmt(d);
    $("kpiDelta").className = deltaClass(d);

    const name = field(ctx.row, ["name", "company_name"], "");
    $("selectedMeta").textContent = `${ctx.sym}${name ? " / " + name : ""}`;
    $("ruleBox").innerHTML = `Debug rule：前端會重新計算公式，但必須對齊 Python M7 v2 欄位。新增 28產業 baseline engine：個股 fair PE 已讀 Python heat-brake 欄位；再以 avg_dollar_volume/liquidity 加權 → 預設 30% peer baseline + 70% static anchor；market / industry / archetype multiplier factor 可調。`;

    renderRawImpactTable(result);
    renderFactorImpactTable(result);
    renderValuationBaseline(result);
    renderDeltaPreview();
    renderFactorDistribution();
    renderSensitivityAnalysis();
    $("traceBox").textContent = result.trace;
    renderAudit(result);
  }

  function resetParams() {
    state.params = { ...DEFAULT_PARAMS };
    PARAM_DEFS.forEach(([key]) => {
      const el = $("p_" + key);
      const pv = $("pv_" + key);
      if (el) el.value = state.params[key];
      if (pv) pv.textContent = fmt(state.params[key], 2);
    });
    render();
  }

  function exportTrace() {
    const ctx = getRows().find(x => x.sym === state.selectedSymbol) || getRows()[0];
    if (!ctx) return;
    const result = computeM7(ctx, state.params);
    const sectorMap = buildSectorBaselineEngine(state.params);
    const payload = {
      generated_at: new Date().toISOString(),
      symbol: ctx.sym,
      params: state.params,
      scores: result.scores,
      valuation_baseline: result.valuationBaseline,
      sector_baseline_map: sectorMap,
      audit: result.audit,
      trace: result.trace
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `m7_formula_trace_${ctx.sym}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function init() {
    try {
      $("loadStatus").textContent = "Loading data...";
      const [scores, compare, manifest, runtime, fundamentals, anchorConfig] = await Promise.all([
        loadJson(DATA_PATHS.scores),
        loadJson(DATA_PATHS.compare, true),
        loadJson(DATA_PATHS.manifest, true),
        loadJson(DATA_PATHS.runtime, true),
        loadJson(DATA_PATHS.fundamentals, true),
        loadJson(DATA_PATHS.anchorConfig, true)
      ]);
      state.scores = asArray(scores);
      state.compare = asArray(compare);
      state.manifest = manifest;
      state.runtime = asArray(runtime);
      state.fundamentals = asArray(fundamentals);
      state.anchorConfig = anchorConfig || null;

      if (!state.scores.length) throw new Error("m7_v2_scores has no rows");
      state.selectedSymbol = symbolOf(state.scores[0]);
      $("loadStatus").textContent = `Loaded ${state.scores.length} M7 rows`;

      renderSymbolOptions();
      renderParamControls();
      render();

      $("symbolSelect").addEventListener("change", (e) => { state.selectedSymbol = e.target.value; render(); });
      $("searchBox").addEventListener("input", () => { renderSymbolOptions(); render(); });
      $("decimalInput").addEventListener("change", (e) => { state.decimals = clamp(num(e.target.value, 2), 1, 4); render(); });
      $("btnReset").addEventListener("click", resetParams);
      $("btnExport").addEventListener("click", exportTrace);
    } catch (err) {
      console.error(err);
      $("loadStatus").textContent = "Load failed";
      $("ruleBox").className = "warn";
      $("ruleBox").textContent = err.message;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
