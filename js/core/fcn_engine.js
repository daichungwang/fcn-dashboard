/* ==========================================
   fcn_engine.js V6 FINAL
   振宇 FCN 系統｜FCN Engine
   功能：
   1. 計算 FCN Pure Score
   2. 分離個股分數 / FCN 分數
   3. 支援 SRI / P-risk / EKI
========================================== */

// ------------------------------------------
// 工具
// ------------------------------------------
function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 2) {
  return Number(toNumber(value, 0).toFixed(digits));
}

// ------------------------------------------
// 權重（目前建議版）
// 先固定，之後看結果再調
// ------------------------------------------
export const FCN_WEIGHT = {
  stock: 0.4,
  rate: 0.2,
  period: 0.1,
  prisk: 0.1,
  sri: 0.1,
  eki_bonus: 2
};

// ------------------------------------------
// SRI penalty map（3/30 對口版）
// Worst-of Penalty：跌了會拖累誰
// ASSY Penalty：整體組合風險評估
// ------------------------------------------
export const PENALTY_MAP = {
  core: { worst: 3, assy: 2 },
  defensive: { worst: 2, assy: 1 },
  growth: { worst: 2, assy: 0 },
  income: { worst: 1, assy: 0 },
  speculative: { worst: -2, assy: -2 }
};

// ------------------------------------------
// 1. 利率分數
// 目前先對齊你範例：15% => -2
// 後續可再微調
// ------------------------------------------
export function calcRateScore(yieldPa = 0) {
  const y = toNumber(yieldPa, 0);

  if (y < 10) return -5;
  if (y < 12) return -4;
  if (y < 15) return -3;
  if (y < 16) return -2;   // 15% 對應 -2
  if (y < 18) return 0;
  if (y < 20) return 2;
  if (y < 24) return 3;
  return 4;
}

// ------------------------------------------
// 2. 天期分數
// 目前先對齊你範例：6M => 0
// ------------------------------------------
export function calcPeriodScore(periodMonths = 0) {
  const m = toNumber(periodMonths, 0);

  if (m <= 0) return 0;
  if (m <= 3) return 2;
  if (m < 6) return 1;
  if (m === 6) return 0;   // 6個月 = 0
  if (m <= 9) return -1;
  if (m <= 12) return -2;

  return -4;
}

// ------------------------------------------
// 3. 下檔風險（P-risk）
// gap = strike - ki
//
// 你目前例子：
// strike 75 / KI 55 → gap 20 → score = 2
//
// 所以這版先以你的例子為主來定義
// ------------------------------------------
export function calcPRiskScore(strike = 0, ki = 0) {
  const s = toNumber(strike, 0);
  const k = toNumber(ki, 0);
  const gap = s - k;

  if (gap === 0) return 0;     // no KI / KI = strike 特例
  if (gap < 10) return -5;     // 幾乎沒保護
  if (gap < 15) return 1;      // 有一些保護
  if (gap < 18) return 1.5;
  if (gap <= 22) return 2;     // 甜蜜點（符合你例子 gap=20 => 2）
  if (gap < 25) return 0;
  if (gap < 30) return -3;
  return -5;
}

// ------------------------------------------
// 4. 找最差股票群
// 2檔 → 最差1
// 3檔 → 最差1
// 4檔 → 最差2
// 5檔 → 最差3
// 用 pure_stock_score 比較
// ------------------------------------------
export function getWorstStocks(stocks = []) {
  const sorted = [...stocks].sort(
    (a, b) => toNumber(a.pure_stock_score, 0) - toNumber(b.pure_stock_score, 0)
  );

  const n = sorted.length;

  if (n <= 1) return sorted;
  if (n === 2 || n === 3) return sorted.slice(0, 1);
  if (n === 4) return sorted.slice(0, 2);
  if (n >= 5) return sorted.slice(0, 3);

  return sorted.slice(0, 1);
}

// ------------------------------------------
// 5. SRI
// SRI = 0.6 * avg(Worst-of Penalty)
//     + 0.4 * avg(ASSY Penalty)
// ------------------------------------------
export function calcSRI(stocks = []) {
  if (!stocks.length) return 0;

  const worstGroup = getWorstStocks(stocks);

  const worstPenalty =
    worstGroup.reduce((sum, s) => {
      const category = s.category || "speculative";
      return sum + toNumber(PENALTY_MAP[category]?.worst, 0);
    }, 0) / (worstGroup.length || 1);

  const assyPenalty =
    stocks.reduce((sum, s) => {
      const category = s.category || "speculative";
      return sum + toNumber(PENALTY_MAP[category]?.assy, 0);
    }, 0) / (stocks.length || 1);

  const sri = 0.6 * worstPenalty + 0.4 * assyPenalty;

  return round(sri, 2);
}

// ------------------------------------------
// 6. Avg Pure Stock
// basket 的 pure_stock_score 平均
// ------------------------------------------
export function calcAvgPureStock(stocks = []) {
  if (!stocks.length) return 0;

  const avg =
    stocks.reduce((sum, s) => sum + toNumber(s.pure_stock_score, 0), 0) /
    stocks.length;

  return round(avg, 2);
}

// ------------------------------------------
// 7. EKI bonus
// ------------------------------------------
export function calcEKIBonus(isEKI = false) {
  return isEKI ? FCN_WEIGHT.eki_bonus : 0;
}

// ------------------------------------------
// 8. FCN Pure Score
// 公式：
// 0.4 * Avg Pure Stock
// + 0.2 * Rate Score
// + 0.1 * Period Score
// + 0.1 * P-risk Score
// + 0.1 * SRI
// + EKI Bonus
// ------------------------------------------
export function calcFCNPureScore({
  stocks = [],
  yield_pa = 0,
  tenor_months = 0,
  strike = 0,
  ki = 0,
  is_eki = false
} = {}) {
  const avgPureStock = calcAvgPureStock(stocks);
  const rateScore = calcRateScore(yield_pa);
  const periodScore = calcPeriodScore(tenor_months);
  const priskScore = calcPRiskScore(strike, ki);
  const sriScore = calcSRI(stocks);
  const ekiBonus = calcEKIBonus(is_eki);

  const score =
    FCN_WEIGHT.stock * avgPureStock +
    FCN_WEIGHT.rate * rateScore +
    FCN_WEIGHT.period * periodScore +
    FCN_WEIGHT.prisk * priskScore +
    FCN_WEIGHT.sri * sriScore +
    ekiBonus;

  return round(score, 2);
}

// ------------------------------------------
// 9. （暫定）FCN Event Score
// 先取 basket 平均 event_stock_score
// 之後你若要改成更進階版可以再升級
// ------------------------------------------
export function calcFCNEventScore(stocks = []) {
  if (!stocks.length) return 0;

  const avg =
    stocks.reduce((sum, s) => sum + toNumber(s.event_stock_score, 0), 0) /
    stocks.length;

  return round(avg, 2);
}

// ------------------------------------------
// 10. 批次查找 basket 對應股票
// ------------------------------------------
export function resolveBasketStocks(basket = [], stockResults = []) {
  return (basket || [])
    .map(sym => stockResults.find(s => s.symbol === sym))
    .filter(Boolean);
}

// ------------------------------------------
// 11. 單張 FCN 完整評估
// 輸出 pure_fcn_score / event_fcn_score / total_fcn_score
// ------------------------------------------
export function evaluateFCN(fcn = {}, stockResults = []) {
  const stocks = resolveBasketStocks(fcn.basket, stockResults);

  const avgPureStock = calcAvgPureStock(stocks);
  const rateScore = calcRateScore(fcn.yield_pa);
  const periodScore = calcPeriodScore(fcn.tenor_months);
  const priskScore = calcPRiskScore(fcn.strike, fcn.ki);
  const sriScore = calcSRI(stocks);
  const ekiBonus = calcEKIBonus(!!fcn.is_eki);

  const pure_fcn_score = calcFCNPureScore({
    stocks,
    yield_pa: fcn.yield_pa,
    tenor_months: fcn.tenor_months,
    strike: fcn.strike,
    ki: fcn.ki,
    is_eki: !!fcn.is_eki
  });

  const event_fcn_score = calcFCNEventScore(stocks);
  const total_fcn_score = round(pure_fcn_score + event_fcn_score, 2);

  let suggestion = "觀察";
  if (total_fcn_score >= 8) suggestion = "優先配置";
  else if (total_fcn_score >= 5) suggestion = "可做";
  else if (total_fcn_score >= 2) suggestion = "中性觀察";
  else suggestion = "避免";

  return {
    basket_id: fcn.id || "",
    basket: fcn.basket || [],
    basket_count: (fcn.basket || []).length,

    ki: toNumber(fcn.ki, 0),
    strike: toNumber(fcn.strike, 0),
    yield_pa: toNumber(fcn.yield_pa, 0),
    tenor_months: toNumber(fcn.tenor_months, 0),
    is_eki: !!fcn.is_eki,

    stocks,

    avg_pure_stock: avgPureStock,
    rate_score: rateScore,
    period_score: periodScore,
    prisk_score: priskScore,
    sri_score: sriScore,
    eki_bonus: ekiBonus,

    pure_fcn_score,
    event_fcn_score,
    total_fcn_score,

    suggestion
  };
}

// ------------------------------------------
// 12. 批量 FCN 評估
// ------------------------------------------
export function evaluateFCNUniverse(fcnList = [], stockResults = []) {
  return (fcnList || [])
    .map(fcn => evaluateFCN(fcn, stockResults))
    .sort((a, b) => toNumber(b.total_fcn_score, 0) - toNumber(a.total_fcn_score, 0));
}

// ------------------------------------------
// 13. 相容舊版 main.js 的暫時函式
// 若 main.js 仍呼叫 calcFCNPure(fcn)
// 這裡回傳一個簡化 score，避免爆掉
// ------------------------------------------
export function calcFCNPure(fcn = {}) {
  const rateScore = calcRateScore(fcn.yield_pa);
  const periodScore = calcPeriodScore(fcn.tenor_months);
  const priskScore = calcPRiskScore(fcn.strike, fcn.ki);

  // 舊版只靠結構，先做 fallback
  const score =
    0.2 * rateScore +
    0.1 * periodScore +
    0.1 * priskScore;

  return round(score, 2);
}
