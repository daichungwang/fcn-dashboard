// ==========================================
// FCN Recommendation Engine（STABLE）
// ==========================================
// 振宇 FCN 系統
// Proprietary System - All Rights Reserved
// Unauthorized copying or commercial use is prohibited
// All rights reserved by Gaya.Wang
// ==========================================
// ==========================================

function toNumber(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

// 組合產生
function generateCombinations(pool, size = 4) {
  const results = [];

  function helper(start, combo) {
    if (combo.length === size) {
      results.push([...combo]);
      return;
    }

    for (let i = start; i < pool.length; i++) {
      combo.push(pool[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }

  helper(0, []);
  return results;
}

// 主函數
export function generateFCNRecommendations({
  stockResults = [],
  rate = 18,
  period = 6,
  ki = 60,
  strike = 75,
  topN = 5
}) {
  const combos = generateCombinations(stockResults, 4);
  const results = [];

  for (const stocks of combos) {
    const avgEvent =
      stocks.reduce((sum, s) => sum + toNumber(s.event_stock_score), 0) /
      stocks.length;

    const score =
      avgEvent +
      (rate >= 18 ? 5 : 0) +
      (ki <= 60 ? 3 : 0);

    results.push({
      basket: stocks.map(s => s.symbol),
      score: Math.round(score * 100) / 100
    });
  }

  results.sort((a, b) => b.score - a.score);

  return results.slice(0, topN);
}
