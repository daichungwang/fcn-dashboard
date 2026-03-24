// ==========================================
// FCN Engine V1（核心決策引擎）
// ==========================================

// ===== 工具 =====
function avg(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ==========================================
// 1️⃣ Worst-of（最差股票）
// ==========================================
export function calcWorstOf(stocks) {
  if (!stocks || stocks.length === 0) return null;

  let worst = stocks[0];

  stocks.forEach(s => {
    if (s.pure_score < worst.pure_score) {
      worst = s;
    }
  });

  return worst;
}

// ==========================================
// 2️⃣ Gap 計算
// ==========================================
export function calcGap(strike, ki) {
  return strike - ki;
}

// ==========================================
// 3️⃣ Gap 評分（依你的規則）
// ==========================================
export function scoreGap(gap) {
  if (gap === 0) return 5;
  if (gap > 0 && gap < 10) return -7;
  if (gap === 10) return 5;
  if (gap <= 13) return 4;
  if (gap <= 15) return 3;
  if (gap <= 18) return 0;
  if (gap <= 20) return -4;
  if (gap <= 22) return -5;
  if (gap < 25) return -8;
  return -999; // 不做
}

// ==========================================
// 4️⃣ 利率評分
// ==========================================
export function scoreCoupon(rate) {
  if (rate < 10) return -999;
  if (rate < 12) return -4;
  if (rate < 15) return -2;
  if (rate < 16) return 0;
  if (rate < 18) return 3;
  if (rate < 20) return 5;
  if (rate < 24) return 8;
  return 10;
}

// ==========================================
// 5️⃣ 天期評分
// ==========================================
export function scoreTenor(month) {
  if (month > 12) return -999;
  if (month <= 3) return 5;
  if (month <= 6) return 2;
  if (month === 6) return 0;
  if (month <= 9) return -2;
  if (month <= 12) return -5;
  return -999;
}

// ==========================================
// 6️⃣ KI 評分
// ==========================================
export function scoreKI(ki) {
  if (ki > 75) return -999;
  if (ki <= 55) return 8;
  if (ki <= 60) return 4;
  if (ki <= 65) return 0;
  if (ki <= 70) return -4;
  if (ki <= 75) return -8;
  return -999;
}

// ==========================================
// 7️⃣ Strike 評分
// ==========================================
export function scoreStrike(strike) {
  if (strike > 80) return -999;
  if (strike <= 60) return 10;
  if (strike <= 65) return 5;
  if (strike <= 67) return -1;
  if (strike <= 70) return -3;
  if (strike <= 75) return -5;
  if (strike <= 80) return -10;
  return -999;
}

// ==========================================
// 8️⃣ FCN Pure Score（核心公式）
// ==========================================
export function calcFCNPure({
  stocks,
  coupon,
  tenor,
  ki,
  strike,
  sri = 0,
  eki = false
}) {
  const stockScore = avg(stocks.map(s => s.pure_score));

  const gap = calcGap(strike, ki);

  const total =
    0.4 * stockScore +
    0.2 * scoreCoupon(coupon) +
    0.1 * scoreTenor(tenor) +
    0.1 * scoreKI(ki) +
    0.1 * scoreStrike(strike) +
    0.1 * sri +
    scoreGap(gap) +
    (eki ? 2 : 0);

  return total;
}

// ==========================================
// 9️⃣ FCN Event Score
// ==========================================
export function calcFCNEvent({
  stocks,
  eventScore,
  volatility,
  eki = false
}) {
  const stockScore = avg(stocks.map(s => s.pure_score));

  return (
    0.5 * stockScore +
    0.25 * eventScore +
    0.25 * volatility +
    (eki ? 2 : 0)
  );
}

// ==========================================
// 🔟 Basket 建立（簡單版）
// ==========================================
export function buildBasket(pool, size = 4) {
  // 先取前幾檔（之後會升級為最佳化）
  return pool.slice(0, size);
}

// ==========================================
// 11️⃣ 組合評分（總入口🔥）
// ==========================================
export function evaluateFCN({
  stocks,
  coupon,
  tenor,
  ki,
  strike,
  sri = 0,
  eventScore = 0,
  volatility = 0,
  eki = false
}) {
  const worst = calcWorstOf(stocks);

  const pure = calcFCNPure({
    stocks,
    coupon,
    tenor,
    ki,
    strike,
    sri,
    eki
  });

  const event = calcFCNEvent({
    stocks,
    eventScore,
    volatility,
    eki
  });

  return {
    pure_score: pure,
    event_score: event,
    worst_of: worst?.sy
