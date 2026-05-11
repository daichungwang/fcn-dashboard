/* =========================================================
   M8 Calibration Engine v1
   M8 v3 Recent Surface Version
   ========================================================= */

function parseDateSafe(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function monthsAgo(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() - months);
  return d;
}

function isWithinMonths(rowDate, months = 3) {
  const d = parseDateSafe(rowDate);
  if (!d) return false;

  const now = new Date();
  return d >= monthsAgo(now, months);
}

function normalizeSymbols(symbols) {
  if (!Array.isArray(symbols)) return [];

  return [...new Set(
    symbols
      .map(s => String(s || "").trim().toUpperCase())
      .filter(Boolean)
  )].sort();
}

function normalizeTemplateId(symbols) {
  return normalizeSymbols(symbols).join("+");
}

function pickNum(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function buildObservationRow(raw) {
  const symbols =
    raw.symbols ||
    raw.underlyings ||
    raw.basket ||
    [];

  const marketCoupon = pickNum(
    raw.market_coupon,
    raw.market_rate,
    raw.coupon_pct,
    raw.market_yield
  );

  const newFair = pickNum(
    raw.new_fair_rate,
    raw.new_fair,
    raw.fair_rate
  );

  return {
    date:
      raw.date ||
      raw.created_at ||
      raw.entry_date ||
      raw.trade_date ||
      null,

    symbols: normalizeSymbols(symbols),

    template_id: normalizeTemplateId(symbols),

    market_coupon: marketCoupon,

    new_fair_rate: newFair,

    beta: pickNum(raw.beta, raw.avg_beta, 0),

    source:
      raw.source ||
      raw.data_source ||
      "unknown",

    raw
  };
}

function validObservation(r) {
  return (
    r &&
    r.template_id &&
    Number.isFinite(r.market_coupon) &&
    Number.isFinite(r.new_fair_rate)
  );
}

function buildUnifiedObservationPool({
  currentRows = [],
  oldRows = [],
  marketRows = []
}) {

  /* -----------------------------------------
     Dashboard analysis:
     keep ALL datas
     ----------------------------------------- */

  const allRaw = [
    ...currentRows,
    ...oldRows,
    ...marketRows
  ];

  const rows = allRaw
    .map(buildObservationRow)
    .filter(validObservation);

  return rows;
}

/* =========================================================
   Surface Export Logic
   ONLY <= 3M rows
   ========================================================= */

function buildRecentSurfaceRows(rows) {

  return rows.filter(r =>
    isWithinMonths(r.date, 3)
  );
}

/* =========================================================
   Window Filter
   ========================================================= */

function buildWindowRows(rows, months) {
  return rows.filter(r =>
    isWithinMonths(r.date, months)
  );
}

/* =========================================================
   Group By Template
   ========================================================= */

function groupByTemplate(rows) {

  const map = {};

  rows.forEach(r => {

    const key = r.template_id;

    if (!map[key]) {
      map[key] = [];
    }

    map[key].push(r);

  });

  return map;
}

/* =========================================================
   Build Surface
   ========================================================= */

function avg(arr) {
  if (!arr.length) return null;

  return (
    arr.reduce((a, b) => a + b, 0) /
    arr.length
  );
}

function buildSurfaceEntry(rows, windowName) {

  const marketCoupons =
    rows
      .map(r => r.market_coupon)
      .filter(Number.isFinite);

  const newFairs =
    rows
      .map(r => r.new_fair_rate)
      .filter(Number.isFinite);

  const betas =
    rows
      .map(r => r.beta)
      .filter(Number.isFinite);

  return {
    observation_count: rows.length,

    window_used: windowName,

    latest_observation_date:
      rows
        .map(r => r.date)
        .sort()
        .slice(-1)[0] || null,

    avg_market_coupon:
      avg(marketCoupons),

    avg_new_fair_rate:
      avg(newFairs),

    avg_beta:
      avg(betas)
  };
}

/* =========================================================
   Build M8 Template Surface
   ========================================================= */

function buildM8TemplateSurface(allRows) {

  const recentRows =
    buildRecentSurfaceRows(allRows);

  const windows = {
    "1w": buildWindowRows(recentRows, 0.25),
    "1m": buildWindowRows(recentRows, 1),
    "2m": buildWindowRows(recentRows, 2),
    "3m": buildWindowRows(recentRows, 3)
  };

  const surface = {};

  Object.entries(windows).forEach(
    ([windowName, rows]) => {

      const grouped =
        groupByTemplate(rows);

      Object.entries(grouped).forEach(
        ([templateId, templateRows]) => {

          if (!surface[templateId]) {
            surface[templateId] = {
              template_id: templateId,
              surface_windows: {}
            };
          }

          surface[templateId]
            .surface_windows[windowName] =
              buildSurfaceEntry(
                templateRows,
                windowName
              );

        }
      );

    }
  );

  return {
    generated_at:
      new Date().toISOString(),

    methodology:
      "M8 v3 recent surface",

    max_surface_months: 3,

    templates:
      Object.values(surface)
  };
}

/* =========================================================
   Export
   ========================================================= */

window.M8CalibrationEngineV3 = {

  buildUnifiedObservationPool,

  buildRecentSurfaceRows,

  buildM8TemplateSurface

};


