// ==========================================
// fcn_engine.js V6 FINAL（穩定完整版）
// 振宇 FCN 系統｜Pure + Event + Volatility
// ==========================================

import { evaluateStock } from "./stock_engine.js";

/* ==========================================
   工具
========================================== */
function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function avg(arr = []) {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + toNumber(b), 0) / arr.length;
}

/* ==========================================
   1️⃣ Basket 股票分數
========================================== */
export function calcBasketStockScore(stocks = []) {
  if (!stocks.length) return 0;

  const evaluated = stocks.map(s => evaluateStock(s));

  const total = evaluated.reduce((sum, s) => {
    return sum + toNumber(s.pure_score);
  }, 0);

  return Number((total / evaluated.length).toFixed(4));
}

/* ==========================================
   2️⃣ 利率分數
========================================== */
export function calcRateScore(rate = 0) {
  const r = toNumber(rate);

  if (r < 10) return -5;
  if (r < 15) return -2;
  if (r < 18) return 0;
  if (r < 24) return 3;
  return 5;
}

/* ==========================================
   3️⃣ 天期分數（修正版）
========================================== */
export function calcPeriodScore(period = 0) {
  const p = toNumber(period);

  if (p <= 3) return 5;
  if (p <= 6) return 2;
  if (p <= 9) return -2;
  if (p <= 12) return -5;

  return -10;
}

/* ==========================================
   4️⃣ P Risk（Gap）
========================================== */
export function calcPRiskScore(ki = 0, strike = 0) {
  const gap = toNumber(strike) - toNumber(ki);

  if (gap >= 30) return -5;
  if (gap >= 25) return -3;
  if (gap >= 20) return -2;
  if (gap >= 18) return 0;
  if (gap >= 15) return 1;
  if (gap >= 10) return 1;
  if (gap < 10) return -5;

  return 0;
}

/* ==========================================
   5️⃣ SRI（含市場調整）
========================================== */

function getWorstPenalty(label) {
  switch (label) {
    case "核心": return 3;
    case "防禦": return 2;
    case "成長": return 2;
    case "收益": return 1;
    default: return -2;
  }
}

function getAssyPenalty(label) {
  switch (label) {
    case "核心": return 2;
    case "防禦": return 1;
    case "成長": return 0;
    case "收益": return 0;
    default: return -2;
  }
}

function getWorstCount(n) {
  if (n <= 3) return 1;
  if (n === 4) return 2;
  return 3;
}

export function calcSRI(stocks = [], marketRegime = "neutral") {
  if (!stocks.length) return 0;

  const evaluated = stocks.map(s => evaluateStock(s));

  const sorted = [...evaluated].sort(
    (a, b) => toNumber(a.pure_score) - toNumber(b.pure_score)
  );

  const worst = sorted.slice(0, getWorstCount(sorted.length));

  const worstAvg = avg(
    worst.map(s => getWorstPenalty(s.baseline_label))
  );

  const assyAvg = avg(
    evaluated.map(s => getAssyPenalty(s.baseline_label))
  );

  let sri = worstAvg * 0.6 + assyAvg * 0.4;

  // ⭐ 市場修正
  if (marketRegime === "risk_off") sri -= 1;
  if (marketRegime === "risk_on") sri += 0.5;

  return Number(sri.toFixed(4));
}

/* ==========================================
   6️⃣ EKI
========================================== */
export function calcEKIBonus(eki = false) {
  return eki ? 2 : 0;
}

/* ==========================================
   7️⃣ Event（M1）
========================================== */
export function calcBasketEventScore(stocks = [], eventMap = {}) {
  if (!stocks.length) return 0;

  const scores = stocks.map(s => {
    const e = eventMap?.[s.symbol];
    return e ? toNumber(e.event_score) : 0;
  });

  return Number(avg(scores).toFixed(4));
}

/* ==========================================
   8️⃣ Volatility（簡化版）
========================================== */
export function calcVolatilityScore(stocks = []) {
  if (!stocks.length) return 0;

  const volMap = {
    NVDA: 2.0,
    AMD: 2.0,
    MU: 1.8,
    AVGO: 1.6,
    TSM: 1.4,
    AMAT: 1.4,
    ARM: 2.0,
    MRVL: 1.8,
    CRDO: 2.3,
    ALAB: 2.4,

    MSFT: 1.2,
    GOOGL: 1.2,
    AMZN: 1.4,
    ORCL: 1.1,
    PLTR: 2.1,
    TSLA: 2.5,

    META: 1.4,
    AAPL: 1.0,

    COST: 0.8,
    TGT: 1.0,
    EL: 1.1,

    COIN: 3.0,
    SOFI: 2.6,

    UNH: 0.8,

    CCL: 2.4,
    AAL: 2.5,
    LVS: 1.8,

    SMH: 1.6,
    QQQ: 1.3,
    LQD: 0.6,

    default: 1.0
  };

  const total = stocks.reduce((sum, s) => {
    return sum + (volMap[s.symbol] || volMap.default);
  }, 0);

  return Number((total / stocks.length).toFixed(4));
}

/* ==========================================
   9️⃣ 🎯 FCN PURE（V6）
========================================== */
export function calcFCNPure({
  stocks = [],
  rate = 0,
  period = 0,
  ki = 0,
  strike = 0,
  eki = false,
  eventScore = 0,
  volatility = 0,
  marketRegime = "neutral"
}) {
  const stockScore = calcBasketStockScore(stocks);
  const rateScore = calcRateScore(rate);
  const periodScore = calcPeriodScore(period);
  const pRiskScore = calcPRiskScore(ki, strike);
  const sriScore = calcSRI(stocks, marketRegime);

  const total =
    0.35 * stockScore +
    0.20 * rateScore +
    0.10 * periodScore +
    0.10 * pRiskScore +
    0.10 * sriScore +
    0.10 * toNumber(eventScore) +
    0.05 * toNumber(volatility) +
    calcEKIBonus(eki);

  return {
    total: Number(total.toFixed(4)),
    breakdown: {
      stock: stockScore,
      rate: rateScore,
      period: periodScore,
      p_risk: pRiskScore,
      sri: sriScore,
      event: eventScore,
      volatility: volatility,
      eki: calcEKIBonus(eki)
    }
  };
}

/* ==========================================
   🔟 最終 Event Score（預留）
========================================== */
export function calcFCNEventScore({
  pureScore = 0,
  event = 0,
  volatility = 0,
  eki = false
}) {
  return Number((
    0.5 * toNumber(pureScore) +
    0.25 * toNumber(event) +
    0.25 * toNumber(volatility) +
    (eki ? 2 : 0)
  ).toFixed(4));
}
