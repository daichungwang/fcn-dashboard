// ==========================================
// fcn_engine.js V5 FINAL（校正版）
// 振宇 FCN 系統｜Pure Engine 完整定稿版
// ==========================================

import { evaluateStock } from "./stock_engine.js";

// ------------------------------------------
// 工具
// ------------------------------------------
function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ==========================================
// 1️⃣ Basket 股票分數（平均）
// ✅ 使用「stock pure score」
// ==========================================
export function calcBasketStockScore(stocks = []) {
  if (!Array.isArray(stocks) || stocks.length === 0) return 0;

  const evaluated = stocks.map(s => evaluateStock(s));

  const total = evaluated.reduce((sum, s) => {
    return sum + s.pure_score;
  }, 0);

  return Number((total / evaluated.length).toFixed(4));
}

// ==========================================
// 2️⃣ 利率分數（你的規則）
// ==========================================
export function calcRateScore(rate = 0) {
  const r = toNumber(rate);

  if (r < 10) return -5;
  if (r < 15) return -2;
  if (r < 18) return 0;
  if (r < 24) return 3;
  return 5;
}

// ==========================================
// 3️⃣ 天期分數（你的版本）
// ==========================================
export function calcPeriodScore(period = 0) {
  const p = toNumber(period);

  if (p <= 3) return 5;
  if (p <= 6) return 2;
  if (p === 6) return 0; //（保留你原本邏輯）
  if (p <= 9) return -2;
  if (p <= 12) return -5;

  return -10;
}

// ==========================================
// 4️⃣ 下檔風險（P Risk）
// gap = strike - KI
// ==========================================
export function calcPRiskScore(ki = 0, strike = 0) {
  const gap = toNumber(strike) - toNumber(ki);

  if (gap >= 30) return -5;
  if (gap >= 25) return -3;
  if (gap >= 20) return -2;
  if (gap >= 18) return 0;
  if (gap >= 15) return 1;
  if (gap === 15) return 2;
  if (gap >= 10) return 1;
  if (gap < 10) return -5;

  return 0;
}

// ==========================================
// 5️⃣ SRI（最重要核心）
// ==========================================

// Worst-of Penalty（你定稿）
function getWorstPenalty(label) {
  switch (label) {
    case "核心": return 3;
    case "防禦": return 2;
    case "成長": return 2;
    case "收益": return 1;
    default: return -2;
  }
}

// ASSY Penalty（你定稿）
function getAssyPenalty(label) {
  switch (label) {
    case "核心": return 2;
    case "防禦": return 1;
    case "成長": return 0;
    case "收益": return 0;
    default: return -2;
  }
}

// Worst-of 檔數
function getWorstCount(n) {
  if (n <= 3) return 1;
  if (n === 4) return 2;
  if (n >= 5) return 3;
  return 1;
}

export function calcSRI(stocks = []) {
  if (!Array.isArray(stocks) || stocks.length === 0) return 0;

  // ✅ 用完整 evaluate（避免 label 遺失）
  const evaluated = stocks.map(s => evaluateStock(s));

  // 👉 用 pure_score 排序（小→大）
  const sorted = [...evaluated].sort(
    (a, b) => a.pure_score - b.pure_score
  );

  // 👉 取 worst-of
  const worstCount = getWorstCount(sorted.length);
  const worstStocks = sorted.slice(0, worstCount);

  // 👉 Worst-of 平均
  const worstAvg =
    worstStocks.reduce((sum, s) => {
      return sum + getWorstPenalty(s.baseline_label);
    }, 0) / worstStocks.length;

  // 👉 ASSY 平均（全部）
  const assyAvg =
    evaluated.reduce((sum, s) => {
      return sum + getAssyPenalty(s.baseline_label);
    }, 0) / evaluated.length;

  const sri = worstAvg * 0.6 + assyAvg * 0.4;

  return Number(sri.toFixed(4));
}

// ==========================================
// 6️⃣ EKI
// ==========================================
export function calcEKIBonus(eki = false) {
  return eki ? 2 : 0;
}

// ==========================================
// 7️⃣ 🎯 FCN PURE（最終定稿公式）
// ==========================================
export function calcFCNPure({
  stocks = [],
  rate = 0,
  period = 0,
  ki = 0,
  strike = 0,
  eki = false
}) {
  const stockScore = calcBasketStockScore(stocks);
  const rateScore = calcRateScore(rate);
  const periodScore = calcPeriodScore(period);
  const pRiskScore = calcPRiskScore(ki, strike);
  const sriScore = calcSRI(stocks);
  const ekiBonus = calcEKIBonus(eki);

  const total =
    0.4 * stockScore +
    0.2 * rateScore +
    0.1 * periodScore +
    0.1 * pRiskScore +
    0.1 * sriScore +
    ekiBonus;

  return {
    total: Number(total.toFixed(4)),

    breakdown: {
      stock: stockScore,
      rate: rateScore,
      period: periodScore,
      p_risk: pRiskScore,
      sri: sriScore,
      eki: ekiBonus
    }
  };
}

// ==========================================
// 8️⃣ 預留：Event（未來接 M1）
// ==========================================
export function calcFCNEventScore({
  pureScore = 0,
  event = 0,
  volatility = 0,
  eki = false
}) {
  return (
    0.5 * pureScore +
    0.25 * event +
    0.25 * volatility +
    (eki ? 2 : 0)
  );
}
