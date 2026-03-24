// ==========================================
// fcn_engine.js V4（振宇最終版）
// FCN 核心引擎（Pure + Scenario 模擬）
// ==========================================

// 引入股票引擎（Pure Score）
import { calcPureScore } from "./stock_engine.js";

// ------------------------------------------
// 工具
// ------------------------------------------
function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ==========================================
// 1️⃣ 取 Basket 平均股票分數
// ==========================================
export function calcBasketStockScore(stocks = []) {
  if (!Array.isArray(stocks) || stocks.length === 0) return 0;

  const total = stocks.reduce((sum, s) => {
    return sum + calcPureScore(s);
  }, 0);

  return Number((total / stocks.length).toFixed(4));
}

// ==========================================
// 2️⃣ 利率分數（Rate Score）
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
// 3️⃣ 天期分數（Period Score）
// ==========================================
export function calcPeriodScore(period = 0) {
  const p = toNumber(period);

  if (p <= 3) return 5;
  if (p <= 6) return 2;
  if (p === 6) return 0;
  if (p <= 9) return -2;
  if (p <= 12) return -5;

  return -10;
}

// ==========================================
// 4️⃣ 下檔風險分數（P Risk）
// gap = strike - ki
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
// 5️⃣ SRI（結構風險指標）
// 目前先預留（之後會接 Worst-of + ASSY）
// ==========================================
export function calcSRI(stocks = []) {
  // 👉 目前先回傳 0（你之後會升級這塊）
  return 0;
}

// ==========================================
// 6️⃣ EKI 加分
// ==========================================
export function calcEKIBonus(eki = false) {
  return eki ? 2 : 0;
}

// ==========================================
// 7️⃣ FCN Pure Score（核心公式）
// 你最終定稿版本
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

  const score =
    0.4 * stockScore +
    0.2 * rateScore +
    0.1 * periodScore +
    0.1 * pRiskScore +
    0.1 * sriScore +
    ekiBonus;

  return {
    total: Number(score.toFixed(4)),

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
// 8️⃣ 取啟用情境（核心）
// 👉 你要求的中文標題
// ==========================================
export function getActiveScenarios(allScenarios = [], activeIds = []) {
  const idSet = new Set(activeIds);
  return allScenarios.filter(s => idSet.has(s.id));
}

// ==========================================
// 9️⃣ 單一情境評估
// ==========================================
export function evaluateFCNScenario({
  stocks = [],
  scenario = {}
}) {
  return calcFCNPure({
    stocks,
    rate: scenario.rate,
    period: scenario.period,
    ki: scenario.ki,
    strike: scenario.strike,
    eki: scenario.eki
  });
}

// ==========================================
// 🔟 多情境模擬（核心模擬器）
// 👉 每一組情境 trigger
// ==========================================
export function simulateActiveScenarios({
  stocks = [],
  allScenarios = [],
  activeIds = []
}) {
  const activeScenarios = getActiveScenarios(allScenarios, activeIds);

  return activeScenarios.map(scenario => ({
    id: scenario.id,
    name: scenario.name,

    params: {
      rate: scenario.rate,
      period: scenario.period,
      ki: scenario.ki,
      strike: scenario.strike,
      eki: scenario.eki
    },

    result: evaluateFCNScenario({
      stocks,
      scenario
    })
  }));
}

// ==========================================
// 11️⃣ 預留：FCN Event Score（未來 M1 串接）
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
