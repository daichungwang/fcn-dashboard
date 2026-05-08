// ============================================================================
// M8 Calibration Engine v1 FIXED
// Path: js/mm/modules/m8_calibration_engine_v1.js
// Purpose:
// 1. FCN Pool + Old Pool + Market FCN History
// 2. M8 decomposition
// 3. My Preference Rate vs Market Normal Rate
// ============================================================================

import { runM8Case } from "../../core/m8_batch_engine.js";

export const M8_CALIBRATION_VERSION = "m8_calibration_engine_v1_fixed_20260508";

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
  const rows = arr(json?.records);

  return rows.map((row, idx) => ({
    source_name: "market_history",
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

    source_distribution: countBy(valid, r => r.source_name),
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
        source_index: record.source_index,
        fcn_id: record.fcn_id,
        date: record.date,
        symbols: record.symbols,
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
        date: r.date,

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
