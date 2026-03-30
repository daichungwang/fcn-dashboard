// ==========================================
// 振宇 FCN Engine V6（FINAL）
// 核心邏輯：Pure / Event 完全分離
// ==========================================

import { evaluateStock } from "./stock_engine.js";

// ------------------------------------------
// 工具
// ------------------------------------------
function toNumber(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

// ==========================================
// 1️⃣ Worst-of 計算
// ==========================================
function getWorstStocks(stocks = []) {
  const sorted = [...stocks].sort(
    (a, b) => a.pure_stock_score - b.pure_stock_score
  );

  if (stocks.length <= 3) return [sorted[0]];
  if (stocks.length === 4) return sorted.slice(0, 2);
  if (stocks.length >= 5) return sorted.slice(0, 3);

  return [sorted[0]];
}

// ==========================================
// 2️⃣ SRI（結構風險）
// ==========================================
function getCategoryPenalty(category) {
  switch (category) {
    case "core":
      return { worst: 3, assy: 2 };
    case "defensive":
      return { worst: 2, assy: 1 };
    case "growth":
      return { worst: 2, assy: 0 };
    case "income":
      return { worst: 1, assy: 0 };
    case "speculative":
      return { worst: -2, assy: -2 };
    default:
      return { worst: 0, assy: 0 };
  }
}

function calcSRI(stocks = []) {
  if (!stocks.length) return 0;

  const worst = getWorstStocks(stocks);

  const worstPenalty =
    worst.reduce((sum, s) => {
      return sum + getCategoryPenalty(s.category).worst;
    }, 0) / worst.length;

  const assyPenalty =
    stocks.reduce((sum, s) => {
      return sum + getCategoryPenalty(s.category).assy;
    }, 0) / stocks.length;

  const sri = worstPenalty * 0.6 + assyPenalty * 0.4;

  return Number(sri.toFixed(2));
}

// ==========================================
// 3️⃣ 利率分數
// ==========================================
function calcRateScore(rate) {
  const r = toNumber(rate);

  if (r < 10) return -999; // ❌不做
  if (r < 12) return -4;
  if (r < 15) return -2;
  if (r < 16) return 0;
  if (r < 18) return 3;
  if (r < 20) return 5;
  if (r < 24) return 8;
  return 10;
}

// ==========================================
// 4️⃣ 天期分數
// ==========================================
function calcPeriodScore(month) {
  const m = toNumber(month);

  if (m <= 3) return 5;
  if (m <= 6) return 2;
  if (m === 6) return 0;
  if (m <= 9) return -2;
  if (m <= 12) return -5;

  return -999; // ❌不做
}

// ==========================================
// 5️⃣ 下檔風險（Gap）
// ==========================================
function calcPRisk(strike, ki) {
  const gap = strike - ki;

  if (gap === 0) return 5;
  if (gap < 10) return -7;
  if (gap === 10) return 5;
  if (gap <= 13) return 4;
  if (gap <= 15) return 3;
  if (gap <= 18) return 0;
  if (gap <= 20) return -4;
  if (gap <= 22) return -5;
  if (gap < 25) return -8;

  return -999; // ❌不做
}

// ==========================================
// 6️⃣ EKI 加分
// ==========================================
function calcEKI(isEKI) {
  return isEKI ? 2 : 0;
}

// ==========================================
// 7️⃣ Pure FCN
// ==========================================
function calcPureFCN({
  stocks,
  rate,
  period,
  strike,
  ki,
  isEKI,
}) {
  const avgPure =
    stocks.reduce((sum, s) => sum + s.pure_stock_score, 0) /
    stocks.length;

  const rateScore = calcRateScore(rate);
  const periodScore = calcPeriodScore(period);
  const prisk = calcPRisk(strike, ki);
  const sri = calcSRI(stocks);
  const eki = calcEKI(isEKI);

  if (
    rateScore === -999 ||
    periodScore === -999 ||
    prisk === -999
  ) {
    return -999;
  }

  const score =
    avgPure * 0.4 +
    rateScore * 0.2 +
    periodScore * 0.1 +
    prisk * 0.1 +
    sri * 0.1 +
    eki;

  return Number(score.toFixed(2));
}

// ==========================================
// 8️⃣ Event FCN（🔥關鍵）
// ==========================================
function calcEventFCN(stocks = []) {
  const avgEvent =
    stocks.reduce((sum, s) => sum + s.event_stock_score, 0) /
    stocks.length;

  return Number(avgEvent.toFixed(2));
}

// ==========================================
// 9️⃣ 最終 FCN 評估
// ==========================================
export function evaluateFCN(fcn = {}, stockPool = []) {
  const basketSymbols = fcn.basket || [];

  const stocks = basketSymbols
    .map((symbol) => {
      const stock = stockPool.find((s) => s.symbol === symbol);
      return stock ? evaluateStock(stock) : null;
    })
    .filter(Boolean);

  if (!stocks.length) return null;

  const pureFCN = calcPureFCN({
    stocks,
    rate: fcn.yield,
    period: fcn.period,
    strike: fcn.strike,
    ki: fcn.ki,
    isEKI: fcn.eki,
  });

  const eventFCN = calcEventFCN(stocks);

  const total = pureFCN + eventFCN;

  let suggestion = "觀察";

  if (pureFCN === -999) suggestion = "❌不做";
  else if (total >= 15) suggestion = "🔥強烈建議";
  else if (total >= 10) suggestion = "✅可做";
  else if (total >= 5) suggestion = "⚠️觀察";
  else suggestion = "❌避免";

  return {
    basket: basketSymbols.join(" / "),
    avgPureStock: Number(
      (
        stocks.reduce((s, x) => s + x.pure_stock_score, 0) /
        stocks.length
      ).toFixed(2)
    ),
    avgEventStock: Number(
      (
        stocks.reduce((s, x) => s + x.event_stock_score, 0) /
        stocks.length
      ).toFixed(2)
    ),
    pure_fcn: pureFCN,
    event_fcn: eventFCN,
    total_fcn: Number(total.toFixed(2)),
    suggestion,
  };
}
