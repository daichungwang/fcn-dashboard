// ==========================================
// decision_module_v1.js（STABLE FINAL）
// ==========================================

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(toNumber(value, 0) * factor) / factor;
}

function avg(arr = []) {
  if (!arr.length) return 0;
  return round(arr.reduce((a, b) => a + toNumber(b, 0), 0) / arr.length, 2);
}

// ------------------------------------------
// Worst-of
// ------------------------------------------
function pickWorstOf(stocks = []) {
  if (!stocks.length) return null;

  return [...stocks].sort(
    (a, b) =>
      toNumber(a.pure_stock_score, 0) -
      toNumber(b.pure_stock_score, 0)
  )[0];
}

// ------------------------------------------
// FCN 結構分數（沿用你邏輯）
// ------------------------------------------
function calcStructureScore(fcn = {}) {
  const ki = toNumber(fcn.ki);
  const strike = toNumber(fcn.strike);
  const rate = toNumber(fcn.rate);
  const tenor = toNumber(fcn.tenor);

  if (rate < 10 || tenor > 12) return -999;

  let score = 0;

  // KI
  if (ki <= 55) score += 8;
  else if (ki <= 60) score += 4;
  else if (ki <= 65) score += 0;
  else if (ki <= 70) score -= 4;
  else score -= 8;

  // Strike
  if (strike <= 60) score += 10;
  else if (strike <= 65) score += 5;
  else if (strike <= 70) score -= 3;
  else score -= 5;

  // Yield
  if (rate >= 24) score += 10;
  else if (rate >= 20) score += 8;
  else if (rate >= 18) score += 5;
  else if (rate >= 16) score += 3;
  else if (rate >= 15) score += 0;
  else if (rate >= 12) score -= 2;
  else score -= 4;

  return score;
}

// ------------------------------------------
// 主運算
// ------------------------------------------
export function runDecisionModule({
  fcnPool = [],
  stockResults = []
} = {}) {
  const stockMap = Object.fromEntries(
    stockResults.map(s => [s.symbol, s])
  );

  const results = [];

  for (const fcn of fcnPool) {
    const stocks = (fcn.basket || [])
      .map(s => stockMap[s])
      .filter(Boolean);

    if (!stocks.length) continue;

    const avgPure = avg(stocks.map(s => s.pure_stock_score));
    const avgEvent = avg(stocks.map(s => s.event_stock_score));

    const structure = calcStructureScore(fcn);

    const pure_fcn = round(structure + avgPure, 2);
    const event_fcn = round(structure + avgEvent, 2);

    const worst = pickWorstOf(stocks);

    let suggestion = "❌ 不做";

    if (event_fcn >= 15) suggestion = "✅ 可做";
    else if (event_fcn >= 10) suggestion = "⚠ 觀察";

    results.push({
      ...fcn,
      avgPure,
      avgEvent,
      pure_fcn,
      event_fcn,
      worst_of: worst?.symbol || null,
      suggestion
    });
  }

  return results.sort((a, b) => b.event_fcn - a.event_fcn);
}
