// ==========================================
// 振宇 FCN Engine V6.1 FINAL
// Pure FCN / Event FCN / Delta FCN
// ==========================================

// ------------------------------------------
// 工具
// ------------------------------------------
function toNumber(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function round(v, digits = 2) {
  return Number(toNumber(v, 0).toFixed(digits));
}

// ==========================================
// 1. Worst-of / Worst group
// 2-3檔 -> 最差1檔
// 4檔   -> 最差2檔
// 5檔   -> 最差3檔
// ==========================================
function getWorstGroup(stocks = []) {
  const sorted = [...stocks].sort(
    (a, b) => toNumber(a.pure_stock_score, 0) - toNumber(b.pure_stock_score, 0)
  );

  const n = sorted.length;
  if (n <= 3) return sorted.slice(0, 1);
  if (n === 4) return sorted.slice(0, 2);
  if (n >= 5) return sorted.slice(0, 3);
  return sorted.slice(0, 1);
}

function getWorstStock(stocks = []) {
  const worst = getWorstGroup(stocks);
  return worst[0] || null;
}

// ==========================================
// 2. SRI（結構風險）
// 0.6 Worst-of + 0.4 ASSY
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

  const worstGroup = getWorstGroup(stocks);

  const worstPenalty =
    worstGroup.reduce((sum, s) => {
      return sum + getCategoryPenalty(s.category).worst;
    }, 0) / worstGroup.length;

  const assyPenalty =
    stocks.reduce((sum, s) => {
      return sum + getCategoryPenalty(s.category).assy;
    }, 0) / stocks.length;

  return round(0.6 * worstPenalty + 0.4 * assyPenalty, 2);
}

// ==========================================
// 3. Rate Score
// ==========================================
function calcRateScore(rate) {
  const r = toNumber(rate);

  if (r < 10) return -999;
  if (r < 12) return -4;
  if (r < 15) return -2;
  if (r < 16) return 0;
  if (r < 18) return 3;
  if (r < 20) return 5;
  if (r < 24) return 8;
  return 10;
}

// ==========================================
// 4. Period Score
// ==========================================
function calcPeriodScore(period) {
  const m = toNumber(period);

  if (m <= 3) return 5;
  if (m <= 6) return 2;
  if (m <= 9) return -2;
  if (m <= 12) return -5;

  return -999;
}

// ==========================================
// 5. P-risk（Gap = Strike - KI）
// ==========================================
function calcPRiskScore(strike, ki) {
  const gap = toNumber(strike) - toNumber(ki);

  if (gap === 0) return 5;
  if (gap < 10) return -7;
  if (gap === 10) return 5;
  if (gap <= 13) return 4;
  if (gap <= 15) return 3;
  if (gap <= 18) return 0;
  if (gap <= 20) return -4;
  if (gap <= 22) return -5;
  if (gap < 25) return -8;

  return -999;
}

// ==========================================
// 6. EKI Bonus
// ==========================================
function calcEKIBonus(isEKI) {
  return isEKI ? 2 : 0;
}

// ==========================================
// 7. Avg stock
// ==========================================
function calcAvgPureStock(stocks = []) {
  if (!stocks.length) return 0;
  return round(
    stocks.reduce((sum, s) => sum + toNumber(s.pure_stock_score, 0), 0) / stocks.length,
    2
  );
}

function calcAvgEventStock(stocks = []) {
  if (!stocks.length) return 0;
  return round(
    stocks.reduce((sum, s) => sum + toNumber(s.event_stock_score, 0), 0) / stocks.length,
    2
  );
}

// ==========================================
// 8. Pure FCN / Event FCN
// ==========================================
function calcFCNByBaseStock(baseStockScore, { rate, period, strike, ki, eki }, sri) {
  const rateScore = calcRateScore(rate);
  const periodScore = calcPeriodScore(period);
  const priskScore = calcPRiskScore(strike, ki);
  const ekiBonus = calcEKIBonus(eki);

  if (rateScore === -999 || periodScore === -999 || priskScore === -999) {
    return -999;
  }

  const score =
    0.4 * toNumber(baseStockScore, 0) +
    0.2 * rateScore +
    0.1 * periodScore +
    0.1 * priskScore +
    0.1 * sri +
    ekiBonus;

  return round(score, 2);
}

// ==========================================
// 9. Delta FCN %
// ==========================================
function calcDeltaFCNPct(eventFCN, pureFCN) {
  const e = toNumber(eventFCN, 0);
  const p = toNumber(pureFCN, 0);

  if (p === 0 || p === -999) return 0;

  return round(((e - p) / Math.abs(p)) * 100, 1);
}

function getDeltaLabel(deltaPct) {
  const d = toNumber(deltaPct, 0);

  if (d > 100) return "非常甜";
  if (d > 50) return "偏甜";
  if (d >= -20) return "合理";
  if (d >= -50) return "偏貴";
  return "很貴";
}

// ==========================================
// 10. R1 / R2 / R3
// R1: Worst-of
// R2: Snapshot 最佳機會
// R3: 剩餘代表性股票
// ==========================================
function buildR123(stocks = []) {
  if (!stocks.length) {
    return { r1: null, r2: null, r3: null };
  }

  const worst = getWorstStock(stocks);

  const bySnapshot = [...stocks].sort(
    (a, b) => toNumber(b.snapshot_score, 0) - toNumber(a.snapshot_score, 0)
  );
  const bestSnapshot = bySnapshot[0] || null;

  const remaining = stocks.filter(
    s => s.symbol !== worst?.symbol && s.symbol !== bestSnapshot?.symbol
  );
  const fallback =
    remaining[0] ||
    stocks.find(s => s.symbol !== worst?.symbol) ||
    stocks[0];

  return {
    r1: worst,
    r2: bestSnapshot,
    r3: fallback
  };
}

// ==========================================
// 11. Suggestion / Reason
// ==========================================
function getSuggestion(pureFCN, eventFCN, worstStock) {
  if (pureFCN === -999) return "❌ 不做";
  if (!worstStock) return "⚠️ 觀察";
  if (worstStock.suggestion === "避免納入 FCN") return "❌ 不做";

  if (eventFCN >= 12) return "🔥 強烈建議";
  if (eventFCN >= 9) return "✅ 可做";
  if (eventFCN >= 6) return "⚠️ 觀察";
  return "❌ 避免";
}

function getReason({ pureFCN, eventFCN, deltaPct, worstStock }) {
  if (pureFCN === -999) return "結構條件不合格";
  if (!worstStock) return "缺少成分股資料";
  if (worstStock.suggestion === "避免納入 FCN") {
    return "Worst-of 標的不符合可接條件";
  }

  const deltaLabel = getDeltaLabel(deltaPct);

  if (eventFCN >= 12) {
    return `結構合理、Worst-of 可接受、目前價格${deltaLabel}`;
  }
  if (eventFCN >= 9) {
    return `結構可接受、Worst-of 可承受、目前價格${deltaLabel}`;
  }
  if (eventFCN >= 6) {
    return "條件普通，雖可觀察，但需留意 Worst-of 與時機";
  }
  return "結構或時機不足，暫不建議進場";
}

// ==========================================
// 12. 主函數
// ==========================================
export function evaluateFCN(fcn = {}, stockResults = []) {
  const basketSymbols = Array.isArray(fcn.basket) ? fcn.basket : [];

  const stocks = basketSymbols
    .map(symbol => stockResults.find(s => s.symbol === symbol))
    .filter(Boolean);

  if (!stocks.length) return null;

  const avgPureStock = calcAvgPureStock(stocks);
  const avgEventStock = calcAvgEventStock(stocks);
  const sri = calcSRI(stocks);

  const input = {
    rate: fcn.yield,
    period: fcn.period,
    strike: fcn.strike,
    ki: fcn.ki,
    eki: !!fcn.eki
  };

  const pureFCN = calcFCNByBaseStock(avgPureStock, input, sri);
  const eventFCN = calcFCNByBaseStock(avgEventStock, input, sri);
  const deltaFCNPct = calcDeltaFCNPct(eventFCN, pureFCN);

  const worstStock = getWorstStock(stocks);
  const priskScore = calcPRiskScore(fcn.strike, fcn.ki);
  const rateScore = calcRateScore(fcn.yield);
  const periodScore = calcPeriodScore(fcn.period);
  const ekiBonus = calcEKIBonus(!!fcn.eki);

  const { r1, r2, r3 } = buildR123(stocks);

  const suggestion = getSuggestion(pureFCN, eventFCN, worstStock);
  const reason = getReason({
    pureFCN,
    eventFCN,
    deltaPct: deltaFCNPct,
    worstStock
  });

  return {
    id: fcn.id || "",
    basket: basketSymbols.join(" / "),
    basket_symbols: basketSymbols,
    basket_count: basketSymbols.length,

    ki: toNumber(fcn.ki, 0),
    strike: toNumber(fcn.strike, 0),
    yield: toNumber(fcn.yield, 0),
    period: toNumber(fcn.period, 0),
    eki: !!fcn.eki,

    worst_of: worstStock?.symbol || "-",

    avgPureStock,
    avgEventStock,

    rateScore,
    periodScore,
    priskScore,
    sri,
    ekiBonus,

    pure_fcn: pureFCN,
    event_fcn: eventFCN,
    delta_fcn_pct: deltaFCNPct,
    delta_label: getDeltaLabel(deltaFCNPct),

    suggestion,
    reason,

    components: stocks.map(s => ({
      symbol: s.symbol,
      pure_stock_score: toNumber(s.pure_stock_score, 0),
      snapshot_score: toNumber(s.snapshot_score, 0),
      event_stock_score: toNumber(s.event_stock_score, 0),
      snapshot_reason: s.snapshot_reason || "",
      trend_label: s.trend_label || "",
      trend_note: s.trend_note || ""
    })),

    r1: r1
      ? {
          symbol: r1.symbol,
          trend_label: r1.trend_label,
          trend_note: r1.trend_note
        }
      : null,

    r2: r2
      ? {
          symbol: r2.symbol,
          trend_label: r2.trend_label,
          trend_note: r2.trend_note
        }
      : null,

    r3: r3
      ? {
          symbol: r3.symbol,
          trend_label: r3.trend_label,
          trend_note: r3.trend_note
        }
      : null
  };
}
