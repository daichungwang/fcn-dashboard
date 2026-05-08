```js
// ============================================================================
// M8 Calibration Engine v1 FIXED
// Added:
// 1. market_fcn_history.json
// 2. market quote adapter
// 3. dual-track calibration support
// ============================================================================

import { runM8Case } from "../../core/m8_batch_engine.js";

export const M8_CALIBRATION_VERSION =
  "m8_calibration_engine_v1_fixed_20260508";

function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function round2(v) {
  const n = Number(v);
  return Number.isFinite(n)
    ? Math.round(n * 100) / 100
    : null;
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function avg(xs = []) {
  const c = xs.map(Number).filter(Number.isFinite);
  return c.length
    ? c.reduce((a, b) => a + b, 0) / c.length
    : null;
}

async function tryLoadJson(path) {
  try {
    const res = await fetch(path + "?v=" + Date.now());

    if (!res.ok) return null;

    return await res.json();
  } catch (err) {
    console.error(err);
    return null;
  }
}

function uniqSymbols(symbols = []) {
  return [
    ...new Set(
      arr(symbols)
        .map(s => String(s || "").trim().toUpperCase())
        .filter(Boolean)
    )
  ];
}

// ============================================================================
// NORMALIZE
// ============================================================================

function normalizePoolRows(json, sourceName) {
  const rows = Array.isArray(json)
    ? json
    : Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json?.records)
    ? json.records
    : [];

  return rows
    .map((row, idx) =>
      normalizeFcnRecord(row, sourceName, idx)
    )
    .filter(Boolean);
}

function normalizeMarketHistoryRows(json) {
  const rows = arr(json?.records);

  return rows.map((row, idx) => {
    return {
      source_name: "market_history",
      source_index: idx,

      fcn_id:
        row?.record_id ||
        `market_history_${idx + 1}`,

      date: "",

      bank: row?.bank || "",

      symbols: uniqSymbols(row?.symbols),

      tenor: toNum(row?.tenor_month, null),

      market_rate: toNum(
        row?.coupon_pct,
        null
      ),

      strike: toNum(
        row?.strike_pct,
        null
      ),

      ki: toNum(row?.ki_pct, null),

      type:
        row?.barrier_type || "AKI",

      market_style:
        row?.market_style || "",

      pricing_type:
        row?.pricing_type || "",

      note:
        row?.market_comment || ""
    };
  });
}

function normalizeFcnRecord(
  row,
  sourceName,
  idx
) {
  const symbols = uniqSymbols(
    row?.basket ||
      row?.symbols ||
      row?.underlyings
  );

  return {
    source_name: sourceName,
    source_index: idx,

    fcn_id:
      row?.fcn_id ||
      row?.id ||
      `${sourceName}_${idx + 1}`,

    date:
      row?.date ||
      row?.created_time ||
      "",

    bank: row?.bank || "",

    symbols,

    tenor: toNum(
      row?.tenor ??
        row?.T ??
        row?.tenor_month,
      null
    ),

    market_rate: toNum(
      row?.rate ??
        row?.coupon_pct ??
        row?.market_rate,
      null
    ),

    strike: toNum(
      row?.strike ??
        row?.strike_pct,
      null
    ),

    ki: toNum(
      row?.ki ??
        row?.ki_pct,
      null
    ),

    type:
      row?.type ||
      (row?.eki ? "EKI" : "AKI"),

    note: row?.note || ""
  };
}

// ============================================================================
// LOAD SOURCES
// ============================================================================

export async function loadFcnCalibrationSources(
  options = {}
) {
  const currentPath =
    options.current_path ||
    "./data/fcn_pool.json";

  const oldPath =
    options.old_path ||
    "./data/fcn_pool_old.json";

  const marketPath =
    options.market_history_path ||
    "./data/mm/market_fcn_history.json";

  const [
    currentJson,
    oldJson,
    marketJson
  ] = await Promise.all([
    tryLoadJson(currentPath),
    tryLoadJson(oldPath),
    tryLoadJson(marketPath)
  ]);

  const currentRows =
    normalizePoolRows(
      currentJson || [],
      "fcn_pool"
    );

  const oldRows =
    normalizePoolRows(
      oldJson || [],
      "fcn_pool_old"
    );

  const marketRows =
    normalizeMarketHistoryRows(
      marketJson || {}
    );

  return {
    current_rows: currentRows,
    old_rows: oldRows,
    market_rows: marketRows,

    rows: [
      ...currentRows,
      ...oldRows,
      ...marketRows
    ]
  };
}

// ============================================================================
// BUILD DATASET
// ============================================================================

export async function buildM8CalibrationDataset(
  options = {}
) {
  const source =
    await loadFcnCalibrationSources(
      options
    );

  const results = [];

  for (const record of source.rows) {
    try {
      const m8 = await runM8Case({
        caseName: record.fcn_id,

        symbols: record.symbols,

        KI: record.ki,

        Strike: record.strike,

        T: record.tenor,

        type: record.type,

        marketYield:
          record.market_rate
      });

      const preRate = round2(
        m8?.pre_rate
      );

      const brake = round2(
        m8?.high_rate_brake
      );

      const fairYield = round2(
        m8?.fair_yield
      );

      const marketCoupon =
        round2(
          record.market_rate
        );

      // =========================================================
      // Dual Track
      // =========================================================

      const myPreferenceRate =
        fairYield;

      const marketNormalRate =
        marketCoupon;

      const gapVsMy = round2(
        marketCoupon -
          myPreferenceRate
      );

      const gapVsMarket =
        round2(
          marketCoupon -
            marketNormalRate
        );

      const myVsMarketGap =
        round2(
          myPreferenceRate -
            marketNormalRate
        );

      const impliedBrake =
        round2(
          preRate -
            marketCoupon
        );

      const brakeRatio =
        preRate > 0
          ? round2(
              brake /
                preRate
            )
          : null;

      results.push({
        status: "ok",

        source_name:
          record.source_name,

        fcn_id:
          record.fcn_id,

        bank:
          record.bank,

        symbols:
          record.symbols,

        tenor:
          record.tenor,

        strike:
          record.strike,

        ki:
          record.ki,

        type:
          record.type,

        market_coupon:
          marketCoupon,

        my_preference_rate:
          myPreferenceRate,

        market_normal_rate:
          marketNormalRate,

        gap_vs_my:
          gapVsMy,

        gap_vs_market:
          gapVsMarket,

        my_vs_market_gap:
          myVsMarketGap,

        implied_market_brake:
          impliedBrake,

        brake_ratio:
          brakeRatio,

        m8_features: {
          pre_rate:
            preRate,

          high_rate_brake:
            brake,

          fair_yield:
            fairYield
        },

        note:
          record.note || ""
      });
    } catch (err) {
      console.error(err);

      results.push({
        status: "error",

        source_name:
          record.source_name,

        fcn_id:
          record.fcn_id,

        error:
          err?.message ||
          String(err)
      });
    }
  }

  return {
    meta: {
      version:
        M8_CALIBRATION_VERSION,

      generated_at:
        new Date().toISOString(),

      total_rows:
        results.length,

      current_pool_rows:
        source.current_rows
          .length,

      old_pool_rows:
        source.old_rows
          .length,

      market_quote_rows:
        source.market_rows
          .length,

      valid_rows:
        results.filter(
          r =>
            r.status ===
            "ok"
        ).length
    },

    rows: results
  };
}

// ============================================================================
// DOWNLOAD
// ============================================================================

export function downloadCalibrationJson(
  dataset,
  filename =
    "m8_calibration_dataset.json"
) {
  const blob = new Blob(
    [
      JSON.stringify(
        dataset,
        null,
        2
      )
    ],
    {
      type:
        "application/json;charset=utf-8"
    }
  );

  const url =
    URL.createObjectURL(blob);

  const a =
    document.createElement(
      "a"
    );

  a.href = url;

  a.download = filename;

  a.click();

  URL.revokeObjectURL(url);
}
```

