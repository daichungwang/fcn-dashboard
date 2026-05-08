// ============================================================================
// M8 Calibration Engine v1 FIXED
// Path: js/mm/modules/m8_calibration_engine_v1.js
// Purpose:
// 1. FCN Pool + Old Pool + Market FCN History
// 2. M8 decomposition
// 3. My Preference Rate vs Market Normal Rate
// ============================================================================

import { runM8Case } from "../../core/m8_batch_engine.js";

export const M8_CALIBRATION_VERSION = "m8_template_calibration_engine_v2_20260508";

function toNum(v, d = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function round2(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function avg(xs) {
  const c = arr(xs).map(Number).filter(Number.isFinite);
  return c.length ? c.reduce((a, b) => a + b, 0) / c.length : null;
}

function safeUpper(v) {
  return String(v || "").trim().toUpperCase();
}

function uniqSymbols(symbols) {
  return [...new Set(arr(symbols).map(safeUpper).filter(Boolean))];
}

async function tryLoadJson(path) {
  try {
    const res = await fetch(path + "?v=" + Date.now());
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn("load failed:", path, err);
    return null;
  }
}

function classifyRateBand(rate) {
  const r = toNum(rate, 0);
  if (r < 10) return "below_conservative";
  if (r < 15) return "conservative";
  if (r < 19) return "rational";
  return "aggressive";
}

function classifyBrakeLevel(brake) {
  const b = toNum(brake, 0);
  if (b <= 0.5) return "none";
  if (b <= 3) return "light";
  if (b <= 7) return "medium";
  if (b <= 11) return "heavy";
  return "extreme";
}

function classifyPricingGap(gap) {
  const g = toNum(gap, 0);
  if (g >= 4) return "market_much_higher";
  if (g >= 1.5) return "market_higher";
  if (g > -1.5) return "near_fair";
  if (g > -4) return "market_lower";
  return "market_much_lower";
}

// ============================================================================
// TEMPLATE / RISK / TENOR CLASSIFICATION v2
// ============================================================================

function normSymbol(s) {
  const x = safeUpper(s);
  if (x === "GOOGL") return "GOOG";
  return x;
}

function normalizeSymbols(symbols) {
  return [...new Set(arr(symbols).map(normSymbol).filter(Boolean))].sort();
}

function hasSymbol(set, s) {
  return set.has(normSymbol(s));
}

function hasAny(set, xs) {
  return arr(xs).some(x => hasSymbol(set, x));
}

function comboKey(xs) {
  return normalizeSymbols(xs).join("+");
}

const CORE_DNA_2_PRIORITY = [
  ["NVDA", "TSM"],
  ["MU", "NVDA"],
  ["MU", "TSM"],
  ["MU", "AVGO"],
  ["TSLA", "NVDA"],
  ["TSLA", "TSM"],
  ["PLTR", "TSLA"],
  ["ORCL", "TSLA"],
  ["AVGO", "NVDA"],
  ["AVGO", "TSM"],
  ["ARM", "NVDA"],
  ["ARM", "TSLA"],
  ["AMD", "NVDA"],
  ["AMD", "TSM"],
  ["GOOG", "NVDA"],
  ["GOOG", "TSM"],
  ["AMZN", "NVDA"],
  ["QQQ", "TSM"]
];

const CORE_DNA_3_PRIORITY = [
  ["MU", "NVDA", "TSM"],
  ["AVGO", "NVDA", "TSM"],
  ["NVDA", "TSLA", "TSM"],
  ["NVDA", "PLTR", "TSLA"],
  ["ARM", "PLTR", "TSLA"],
  ["AVGO", "NVDA", "TSLA"],
  ["ARM", "NVDA", "TSM"],
  ["AMD", "NVDA", "TSM"],
  ["GOOG", "NVDA", "TSM"],
  ["AMZN", "NVDA", "TSM"],
  ["AMD", "MU", "NVDA"],
  ["AMD", "MU", "TSM"],
  ["AMD", "AVGO", "MU"],
  ["INTC", "MU", "TSM"],
  ["AVGO", "CRDO", "NVDA"]
];

const CORE_DNA_4_PRIORITY = [
  ["MU", "NVDA", "TSLA", "TSM"],
  ["AVGO", "NVDA", "TSLA", "TSM"],
  ["AMD", "NVDA", "TSLA", "TSM"],
  ["AVGO", "MU", "NVDA", "TSM"],
  ["MU", "NVDA", "SMH", "TSM"],
  ["ARM", "AVGO", "NVDA", "TSM"],
  ["NVDA", "PLTR", "TSLA", "ALAB"],
  ["ORCL", "TSLA", "PLTR", "COIN"],
  ["AVGO", "NVDA", "PLTR", "TSLA"],
  ["AAPL", "GOOG", "NVDA", "TSM"],
  ["GOOG", "NVDA", "SMH", "TSM"]
];

function firstMatchedCombo(symbolSet, combos) {
  const found = arr(combos).find(combo => combo.every(s => hasSymbol(symbolSet, s)));
  return found ? comboKey(found) : "";
}

function classifyBasketTemplate(symbols) {
  const syms = normalizeSymbols(symbols);
  const s = new Set(syms);

  const core2 = firstMatchedCombo(s, CORE_DNA_2_PRIORITY);
  const core3 = firstMatchedCombo(s, CORE_DNA_3_PRIORITY);
  const core4 = firstMatchedCombo(s, CORE_DNA_4_PRIORITY);

  const semi = ["NVDA", "TSM", "AVGO", "MU", "AMD", "ARM", "MRVL", "SMH", "AMAT", "ASML", "INTC"];
  const memory = ["MU", "MRVL", "INTC"];
  const stabilizer = ["AAPL", "GOOG", "MSFT", "AMZN", "QQQ", "LQD", "META", "SMH"];
  const defensive = ["UNH", "REGN", "NKE", "EL", "TGT", "WMT", "COST", "BAC", "CITI", "LVS"];
  const speculative = ["PLTR", "COIN", "ALAB", "CRDO", "SOFI"];
  const travel = ["CCL", "AAL", "NCLH"];

  const semiCount = syms.filter(x => semi.includes(x)).length;
  const stabilizerCount = syms.filter(x => stabilizer.includes(x)).length;
  const defensiveCount = syms.filter(x => defensive.includes(x)).length;
  const speculativeCount = syms.filter(x => speculative.includes(x)).length;
  const travelCount = syms.filter(x => travel.includes(x)).length;
  const hasNvdaTsm = hasSymbol(s, "NVDA") && hasSymbol(s, "TSM");
  const hasMuCore = hasSymbol(s, "MU") && hasAny(s, ["NVDA", "TSM", "AVGO", "SMH", "AMD", "MRVL", "INTC"]);
  const hasTslaMomentum = hasSymbol(s, "TSLA") && hasAny(s, ["NVDA", "TSM", "AVGO", "GOOG", "ORCL"]);
  const hasSpecCore = (hasSymbol(s, "PLTR") && hasSymbol(s, "TSLA")) || hasAny(s, ["COIN", "ALAB", "CRDO", "SOFI"]);

  let code = "F";
  let name = "OTHERS_M7_BASKET_DRIVEN";
  let reason = "No dominant repeated market DNA; use M7 basket score as main driver.";

  // Priority matters: highly speculative structures override broad AI/semi overlap.
  if (hasSpecCore && (hasSymbol(s, "TSLA") || hasAny(s, ["COIN", "ALAB", "CRDO"]))) {
    code = "D";
    name = "SPECULATIVE_MOMENTUM";
    reason = "PLTR/TSLA/COIN/ALAB/CRDO type speculative momentum DNA.";
  } else if (hasMuCore) {
    code = "B";
    name = "MEMORY_SEMI_TACTICAL";
    reason = "MU or memory/semi tactical core with NVDA/TSM/AVGO/SMH linkage.";
  } else if (hasTslaMomentum) {
    code = "C";
    name = "TSLA_MOMENTUM_CORE";
    reason = "TSLA works as high-beta momentum amplifier with AI/semi core.";
  } else if (hasNvdaTsm && (semiCount >= 2 || stabilizerCount >= 1)) {
    code = "A";
    name = "AI_CORE_INSTITUTIONAL";
    reason = "NVDA+TSM based institutional AI/semi core.";
  } else if ((stabilizerCount + defensiveCount) >= 2 && !hasSymbol(s, "TSLA")) {
    code = "E";
    name = "DEFENSIVE_STABILIZER";
    reason = "Mega-cap/ETF/defensive stabilizer basket with lower volatility intent.";
  }

  const enhancement = syms.filter(x => ![...new Set((core4 || core3 || core2).split("+").filter(Boolean))].includes(x));

  return {
    basket_template: code,
    basket_template_name: name,
    basket_template_label: code + "_" + name,
    basket_template_reason: reason,
    basket_symbols_key: syms.join("+"),
    basket_display: syms.join(", "),
    core_dna_2: core2,
    core_dna_3: core3,
    core_dna_4: core4,
    enhancement_stocks: enhancement,
    semi_count: semiCount,
    stabilizer_count: stabilizerCount,
    defensive_count: defensiveCount,
    speculative_count: speculativeCount,
    travel_count: travelCount
  };
}

function classifyStrikeBucket(strike) {
  const x = toNum(strike);
  if (x == null) return "unknown";
  if (x < 60) return "low";
  if (x < 65) return "medium_low";
  if (x === 65) return "medium";
  if (x <= 70) return "medium_high";
  if (x < 75) return "high";
  return "very_high";
}

function classifyKiBucket(ki) {
  const x = toNum(ki);
  if (x == null) return "unknown";
  if (x < 50) return "low";
  if (x < 55) return "medium_low";
  if (x === 55) return "medium";
  if (x < 60) return "medium_high";
  if (x < 65) return "high";
  if (x <= 70) return "very_high";
  return "extreme";
}

function classifyRiskTemplate(strike, ki) {
  const s = toNum(strike);
  const k = toNum(ki);
  const strikeBucket = classifyStrikeBucket(s);
  const kiBucket = classifyKiBucket(k);
  const strikeKiSame = Number.isFinite(s) && Number.isFinite(k) && Math.abs(s - k) < 0.01;
  const adjustedStrikeForSame = strikeKiSame ? round2(s + 5) : s;
  const adjustedKiForSame = strikeKiSame ? round2(k - 2.5) : k;

  return {
    strike_bucket: strikeBucket,
    ki_bucket: kiBucket,
    strike_ki_same: strikeKiSame,
    adjusted_strike_for_same: adjustedStrikeForSame,
    adjusted_ki_for_same: adjustedKiForSame,
    risk_template: strikeBucket + "_strike__" + kiBucket + "_ki" + (strikeKiSame ? "__same_barrier_adj" : "")
  };
}

function classifyTenorTemplate(tenor) {
  const t = toNum(tenor);
  if (t == null) return { tenor_bucket: "unknown", tenor_template: "unknown" };
  if (t <= 3) return { tenor_bucket: "ultra_short", tenor_template: "ultra_short_0_3m" };
  if (t <= 6) return { tenor_bucket: "short", tenor_template: "short_4_6m" };
  if (t <= 9) return { tenor_bucket: "medium", tenor_template: "medium_7_9m" };
  if (t <= 12) return { tenor_bucket: "long", tenor_template: "long_10_12m" };
  return { tenor_bucket: "extra_long", tenor_template: "extra_long_12m_plus" };
}

function classifyStructureTemplate(type, eki) {
  const t = safeUpper(type);
  if (eki || t === "EKI") return "EKI";
  if (t === "AKI") return "AKI";
  if (t === "NA") return "NO_KI";
  return t || "UNKNOWN";
}

function normalizePoolRows(json, sourceName) {
  const rows = Array.isArray(json)
    ? json
    : Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json?.records)
    ? json.records
    : [];

  return rows.map((row, idx) => normalizeFcnRecord(row, sourceName, idx));
}

function normalizeFcnRecord(row, sourceName, idx) {
  const symbols = uniqSymbols(row?.basket || row?.symbols || row?.underlyings);

  return {
    source_name: sourceName,
    source_type: sourceName === "fcn_pool_old" ? "old_pool" : "current_pool",
    source_index: idx,
    fcn_id: row?.fcn_id || row?.id || sourceName + "_" + (idx + 1),
    date: row?.date || row?.created_time || "",
    created_time: row?.created_time || "",
    entry_time: row?.entry_time || "",
    exit_time: row?.exit_time || "",
    maturity_time: row?.maturity_time || "",
    fcn_status: row?.status || "",
    bank: row?.bank || "",
    tw_bank: row?.tw_bank || "",
    symbols,
    tenor: toNum(row?.tenor ?? row?.T ?? row?.tenor_month),
    market_rate: toNum(row?.rate ?? row?.coupon_pct ?? row?.market_rate),
    autocall: toNum(row?.autocall),
    strike: toNum(row?.strike ?? row?.Strike ?? row?.strike_pct),
    ki: toNum(row?.ki ?? row?.KI ?? row?.ki_pct),
    type: row?.type || (row?.eki ? "EKI" : "AKI"),
    eki: !!row?.eki,
    amount: toNum(row?.amt),
    currency: row?.currency || "USD",
    has_ki_breach: !!row?.has_ki_breach,
    note: row?.note || ""
  };
}

function normalizeMarketHistoryRows(json) {
  const rows = Array.isArray(json)
    ? json
    : arr(json?.records);

  return rows.map((row, idx) => ({
    source_name: "market_history",
    source_type: "market_history",
    source_index: idx,
    fcn_id: row?.record_id || "market_history_" + (idx + 1),
    date: json?.generated_at || "",
    created_time: json?.generated_at || "",
    entry_time: "",
    exit_time: "",
    maturity_time: "",
    fcn_status: "market_quote",
    bank: row?.bank || "",
    tw_bank: "",
    symbols: uniqSymbols(row?.symbols),
    tenor: toNum(row?.tenor_month),
    market_rate: toNum(row?.coupon_pct),
    autocall: toNum(row?.upside_pct),
    strike: toNum(row?.strike_pct),
    ki: toNum(row?.ki_pct),
    type: row?.barrier_type || "AKI",
    eki: String(row?.barrier_type || "").toUpperCase() === "EKI",
    amount: null,
    currency: json?.base_currency || "USD",
    has_ki_breach: false,
    market_style: row?.market_style || "",
    pricing_type: row?.pricing_type || "",
    risk_level: row?.risk_level || "",
    basket_type: row?.basket_type || "",
    note: row?.market_comment || ""
  }));
}

function isValidRecord(r) {
  return (
    arr(r.symbols).length >= 2 &&
    arr(r.symbols).length <= 5 &&
    Number.isFinite(Number(r.strike)) &&
    Number.isFinite(Number(r.tenor)) &&
    Number.isFinite(Number(r.market_rate))
  );
}

function extractM8Features(m8) {
  const weaknesses = arr(m8?.weaknesses).map(Number).filter(Number.isFinite);
  const scores = arr(m8?.scores).map(Number).filter(Number.isFinite);

  return {
    base: round2(m8?.base),
    basket_premium: round2(m8?.basket_premium),
    tail_adj: round2(m8?.tail_adj),
    ki_adj: round2(m8?.ki_adj),
    tenor_adj: round2(m8?.tenor_adj),
    strike_adj: round2(m8?.strike_adj),
    type_adj: round2(m8?.type_adj),
    structure_total: round2(m8?.structure_total),
    basket_vol: round2(m8?.basket_vol),
    vol_adj: round2(m8?.vol_adj),
    rate_pressure_adj: round2(m8?.rate_pressure_adj),
    rate_pressure_score_basket: round2(m8?.rate_pressure_score_basket),
    rate_pressure_worst: round2(m8?.rate_pressure_worst),
    rate_pressure_second: round2(m8?.rate_pressure_second),
    rate_pressure_avg: round2(m8?.rate_pressure_avg),
    BW: round2(m8?.BW),
    weakness_worst: round2(Math.max(...weaknesses, 0)),
    weakness_avg: round2(avg(weaknesses)),
    score_avg: round2(avg(scores)),
    pre_rate: round2(m8?.pre_rate),
    high_rate_brake: round2(m8?.high_rate_brake),
    fair_yield: round2(m8?.fair_yield)
  };
}

function countBy(rows, fn) {
  const out = {};
  arr(rows).forEach(r => {
    const k = fn(r) || "unknown";
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}

function calcSummary(results, invalidRows, source) {
  const valid = arr(results).filter(r => r.status === "ok");

  return {
    version: M8_CALIBRATION_VERSION,
    generated_at: new Date().toISOString(),

    current_pool_rows: source.current_rows.length,
    old_pool_rows: source.old_rows.length,
    market_quote_rows: source.market_rows.length,
    total_rows: results.length + invalidRows.length,
    valid_rows: valid.length,
    invalid_rows: invalidRows.length,
    error_rows: arr(results).filter(r => r.status === "error").length,

    market_rate_mean: round2(avg(valid.map(r => r.market_rate))),
    market_coupon_mean: round2(avg(valid.map(r => r.market_coupon))),
    my_preference_mean: round2(avg(valid.map(r => r.my_preference_rate))),
    market_normal_mean: round2(avg(valid.map(r => r.market_normal_rate))),
    fair_yield_mean: round2(avg(valid.map(r => r.m8_features?.fair_yield))),
    pre_rate_mean: round2(avg(valid.map(r => r.m8_features?.pre_rate))),
    brake_mean: round2(avg(valid.map(r => r.m8_features?.high_rate_brake))),
    pricing_gap_mean: round2(avg(valid.map(r => r.pricing_gap))),
    gap_vs_my_mean: round2(avg(valid.map(r => r.gap_vs_my))),
    gap_vs_market_mean: round2(avg(valid.map(r => r.gap_vs_market))),
    my_vs_market_gap_mean: round2(avg(valid.map(r => r.my_vs_market_gap))),
    brake_ratio_mean: round2(avg(valid.map(r => r.brake_ratio))),

    source_distribution: countBy(valid, r => r.source_type || r.source_name),
    template_distribution: countBy(valid, r => r.basket_template_label),
    risk_template_distribution: countBy(valid, r => r.risk_template),
    tenor_template_distribution: countBy(valid, r => r.tenor_template),
    structure_template_distribution: countBy(valid, r => r.structure_template),
    brake_distribution: countBy(valid, r => r.brake_level),
    gap_distribution: countBy(valid, r => r.pricing_gap_label),
    rate_band_distribution: countBy(valid, r => r.market_rate_band)
  };
}

export async function loadFcnCalibrationSources(options = {}) {
  const currentPath = options.current_path || "./data/fcn_pool.json";
  const oldPath = options.old_path || "./data/fcn_pool_old.json";
  const marketPath = options.market_history_path || "./data/mm/market_fcn_history.json";

  const [currentJson, oldJson, marketJson] = await Promise.all([
    tryLoadJson(currentPath),
    tryLoadJson(oldPath),
    tryLoadJson(marketPath)
  ]);

  const currentRows = normalizePoolRows(currentJson || [], "fcn_pool");
  const oldRows = normalizePoolRows(oldJson || [], "fcn_pool_old");
  const marketRows = normalizeMarketHistoryRows(marketJson || {});

  const all = [...currentRows, ...oldRows, ...marketRows];
  const valid = all.filter(isValidRecord);
  const invalid = all.filter(r => !isValidRecord(r));

  return {
    current_path: currentPath,
    old_path: oldPath,
    market_history_path: marketPath,
    current_rows: currentRows.filter(isValidRecord),
    old_rows: oldRows.filter(isValidRecord),
    market_rows: marketRows.filter(isValidRecord),
    rows: valid,
    invalid_rows: invalid
  };
}

export async function buildM8CalibrationDataset(options = {}) {
  const source = await loadFcnCalibrationSources(options);
  const maxRows = Number.isFinite(Number(options.max_rows)) ? Number(options.max_rows) : Infinity;
  const results = [];

  for (const record of source.rows.slice(0, maxRows)) {
    const caseName = ("CAL_" + record.source_name + "_" + record.fcn_id).replace(/\s+/g, "_");

    try {
      const m8 = await runM8Case({
        caseName,
        symbols: record.symbols,
        KI: record.ki,
        Strike: record.strike,
        T: record.tenor,
        type: record.type,
        marketYield: record.market_rate
      });

      const features = extractM8Features(m8);
      const templateInfo = classifyBasketTemplate(record.symbols);
      const riskInfo = classifyRiskTemplate(record.strike, record.ki);
      const tenorInfo = classifyTenorTemplate(record.tenor);
      const structureTemplate = classifyStructureTemplate(record.type, record.eki);
      const marketBlockKey = [
        templateInfo.basket_template,
        riskInfo.risk_template,
        tenorInfo.tenor_template,
        structureTemplate
      ].join("|");

      const marketCoupon = round2(record.market_rate);
      const preRate = features.pre_rate;
      const myPreferenceRate = features.fair_yield;

      // v2 fallback:
      // before real market normal curve is built, market_normal_rate = market coupon.
      const marketNormalRate = marketCoupon;

      const pricingGap = round2(marketCoupon - features.fair_yield);
      const preRateGap = round2(marketCoupon - preRate);
      const impliedMarketBrake = round2(preRate - marketCoupon);
      const brakeGap = round2(features.high_rate_brake - impliedMarketBrake);
      const brakeRatio = preRate > 0 ? round2(features.high_rate_brake / preRate) : null;

      const gapVsMy = round2(marketCoupon - myPreferenceRate);
      const gapVsMarket = round2(marketCoupon - marketNormalRate);
      const myVsMarketGap = round2(myPreferenceRate - marketNormalRate);

      results.push({
        status: "ok",
        calibration_version: M8_CALIBRATION_VERSION,

        source_name: record.source_name,
        source_type: record.source_type,
        source_index: record.source_index,
        fcn_id: record.fcn_id,
        date: record.date,
        created_time: record.created_time,
        entry_time: record.entry_time,
        exit_time: record.exit_time,
        maturity_time: record.maturity_time,
        fcn_status: record.fcn_status,
        bank: record.bank,
        tw_bank: record.tw_bank,

        symbols: record.symbols,
        basket: record.symbols,
        basket_display: templateInfo.basket_display,
        basket_symbols_key: templateInfo.basket_symbols_key,

        basket_template: templateInfo.basket_template,
        basket_template_name: templateInfo.basket_template_name,
        basket_template_label: templateInfo.basket_template_label,
        basket_template_reason: templateInfo.basket_template_reason,
        core_dna_2: templateInfo.core_dna_2,
        core_dna_3: templateInfo.core_dna_3,
        core_dna_4: templateInfo.core_dna_4,
        enhancement_stocks: templateInfo.enhancement_stocks,
        template_counts: {
          semi_count: templateInfo.semi_count,
          stabilizer_count: templateInfo.stabilizer_count,
          defensive_count: templateInfo.defensive_count,
          speculative_count: templateInfo.speculative_count,
          travel_count: templateInfo.travel_count
        },

        strike_bucket: riskInfo.strike_bucket,
        ki_bucket: riskInfo.ki_bucket,
        risk_template: riskInfo.risk_template,
        strike_ki_same: riskInfo.strike_ki_same,
        adjusted_strike_for_same: riskInfo.adjusted_strike_for_same,
        adjusted_ki_for_same: riskInfo.adjusted_ki_for_same,

        tenor_bucket: tenorInfo.tenor_bucket,
        tenor_template: tenorInfo.tenor_template,
        structure_template: structureTemplate,
        market_block_key: marketBlockKey,

        tenor: record.tenor,
        market_rate: marketCoupon,
        market_coupon: marketCoupon,
        market_rate_band: classifyRateBand(marketCoupon),
        autocall: record.autocall,

        strike: round2(record.strike),
        ki: round2(record.ki),
        type: record.type,
        eki: record.eki,
        amount: record.amount,
        currency: record.currency,
        has_ki_breach: record.has_ki_breach,

        my_preference_rate: myPreferenceRate,
        market_normal_rate: marketNormalRate,
        gap_vs_my: gapVsMy,
        gap_vs_market: gapVsMarket,
        my_vs_market_gap: myVsMarketGap,

        m8_features: features,
        pricing_gap: pricingGap,
        pricing_gap_label: classifyPricingGap(pricingGap),
        pre_rate_gap: preRateGap,
        implied_market_brake: impliedMarketBrake,
        brake_gap: brakeGap,
        brake_ratio: brakeRatio,
        brake_level: classifyBrakeLevel(features.high_rate_brake),

        market_style: record.market_style || "",
        pricing_type: record.pricing_type || "",
        risk_level: record.risk_level || "",
        basket_type: record.basket_type || "",

        stock_sources: m8?.stock_sources || [],
        note: record.note || ""
      });
    } catch (err) {
      results.push({
        status: "error",
        calibration_version: M8_CALIBRATION_VERSION,
        source_name: record.source_name,
        source_type: record.source_type,
        source_index: record.source_index,
        fcn_id: record.fcn_id,
        date: record.date,
        symbols: record.symbols,
        basket: record.symbols,
        basket_display: templateInfo.basket_display,
        basket_symbols_key: templateInfo.basket_symbols_key,

        basket_template: templateInfo.basket_template,
        basket_template_name: templateInfo.basket_template_name,
        basket_template_label: templateInfo.basket_template_label,
        basket_template_reason: templateInfo.basket_template_reason,
        core_dna_2: templateInfo.core_dna_2,
        core_dna_3: templateInfo.core_dna_3,
        core_dna_4: templateInfo.core_dna_4,
        enhancement_stocks: templateInfo.enhancement_stocks,
        template_counts: {
          semi_count: templateInfo.semi_count,
          stabilizer_count: templateInfo.stabilizer_count,
          defensive_count: templateInfo.defensive_count,
          speculative_count: templateInfo.speculative_count,
          travel_count: templateInfo.travel_count
        },

        strike_bucket: riskInfo.strike_bucket,
        ki_bucket: riskInfo.ki_bucket,
        risk_template: riskInfo.risk_template,
        strike_ki_same: riskInfo.strike_ki_same,
        adjusted_strike_for_same: riskInfo.adjusted_strike_for_same,
        adjusted_ki_for_same: riskInfo.adjusted_ki_for_same,

        tenor_bucket: tenorInfo.tenor_bucket,
        tenor_template: tenorInfo.tenor_template,
        structure_template: structureTemplate,
        market_block_key: marketBlockKey,

        tenor: record.tenor,
        market_rate: round2(record.market_rate),
        market_coupon: round2(record.market_rate),
        strike: round2(record.strike),
        ki: round2(record.ki),
        type: record.type,
        error_message: err?.message || String(err)
      });
    }
  }

  return {
    meta: calcSummary(results, source.invalid_rows, source),
    rows: results,
    invalid_rows: source.invalid_rows
  };
}

export function buildCalibrationRegressionRows(dataset = {}) {
  return arr(dataset.rows)
    .filter(r => r.status === "ok")
    .map(r => {
      const f = r.m8_features || {};

      return {
        fcn_id: r.fcn_id,
        source_name: r.source_name,
        source_type: r.source_type,
        date: r.date,

        symbols: r.symbols,
        basket_display: r.basket_display,
        basket_symbols_key: r.basket_symbols_key,
        basket_template: r.basket_template,
        basket_template_name: r.basket_template_name,
        basket_template_label: r.basket_template_label,
        core_dna_2: r.core_dna_2,
        core_dna_3: r.core_dna_3,
        core_dna_4: r.core_dna_4,
        enhancement_stocks: r.enhancement_stocks,
        risk_template: r.risk_template,
        strike_bucket: r.strike_bucket,
        ki_bucket: r.ki_bucket,
        tenor_bucket: r.tenor_bucket,
        tenor_template: r.tenor_template,
        structure_template: r.structure_template,
        market_block_key: r.market_block_key,

        market_rate: r.market_rate,
        market_coupon: r.market_coupon,
        my_preference_rate: r.my_preference_rate,
        market_normal_rate: r.market_normal_rate,

        fair_yield: f.fair_yield,
        pre_rate: f.pre_rate,

        pricing_gap: r.pricing_gap,
        gap_vs_my: r.gap_vs_my,
        gap_vs_market: r.gap_vs_market,
        my_vs_market_gap: r.my_vs_market_gap,

        implied_market_brake: r.implied_market_brake,
        brake_gap: r.brake_gap,
        brake_ratio: r.brake_ratio,

        base: f.base,
        basket_premium: f.basket_premium,
        tail_adj: f.tail_adj,
        ki_adj: f.ki_adj,
        tenor_adj: f.tenor_adj,
        strike_adj: f.strike_adj,
        type_adj: f.type_adj,
        structure_total: f.structure_total,
        basket_vol: f.basket_vol,
        vol_adj: f.vol_adj,
        rate_pressure_adj: f.rate_pressure_adj,
        rate_pressure_score_basket: f.rate_pressure_score_basket,
        BW: f.BW,
        weakness_worst: f.weakness_worst,
        weakness_avg: f.weakness_avg,
        score_avg: f.score_avg,
        high_rate_brake: f.high_rate_brake,

        tenor: r.tenor,
        strike: r.strike,
        ki: r.ki,
        type: r.type,
        symbol_count: arr(r.symbols).length
      };
    });
}

export function downloadCalibrationJson(dataset, filename = "m8_calibration_dataset.json") {
  const blob = new Blob([JSON.stringify(dataset, null, 2)], {
    type: "application/json;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}


export const __M8_TEMPLATE_CLASSIFIER_V2__ = { classifyBasketTemplate, classifyRiskTemplate, classifyTenorTemplate, classifyStructureTemplate };

