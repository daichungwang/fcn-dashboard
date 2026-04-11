// ==========================================
// M7 Basket Engine - FULL VERSION
// 振宇專用（穩定可擴充版）
// ==========================================

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

// ---------- 五大類 ----------
function getCategory(stock) {
  const c = (stock.category || "").toLowerCase();

  if (c.includes("core")) return "CORE";
  if (c.includes("semi") || c.includes("growth")) return "GROWTH";
  if (c.includes("defensive")) return "DEFENSIVE";
  if (c.includes("etf") || c.includes("income")) return "INCOME";
  return "EVENT";
}

// ---------- 分級 ----------
function getTier(score) {
  if (score >= 88) return "優先";
  if (score >= 80) return "穩健";
  return "追蹤";
}

// ---------- Reject ----------
function isReject(stock) {
  const trend = n(stock.trend_raw);
  const snapshot = n(stock.snapshot);
  const growth = n(stock.growth_score);

  const trendBad = trend <= -15;
  const snapshotBad = snapshot <= -6;
  const growthBad = growth <= 2;

  const badCount =
    Number(trendBad) +
    Number(snapshotBad) +
    Number(growthBad);

  const isSpeculative =
    (stock.category || "").toLowerCase().includes("speculative");

  return isSpeculative || badCount >= 2;
}

// ---------- Highlight 條件 ----------
function isHighlight(stock) {
  return (
    n(stock.valuation_raw) <= 70 &&
    n(stock.structure_score) >= 6 &&
    (stock.timing_state || "") !== "hot" &&
    !(stock.category || "").toLowerCase().includes("speculative")
  );
}

// ---------- Highlight 分類 ----------
function highlightType(stock) {
  const t = n(stock.trend_score);
  const s = n(stock.structure_score);
  const snap = n(stock.snapshot_score);

  if (t >= 7 && s >= 7 && snap >= 5) return "積極";
  if (s >= 6 && snap >= 4 && t >= 4) return "理性";
  return "保守";
}

// ==========================================
// 主流程
// ==========================================
export function runM7Basket(m7) {
  const stocks = m7.stocks || [];

  // ---------- Reject ----------
  const reject = stocks.filter(isReject);

  // ---------- Simulation ----------
  const simulation = stocks
    .filter(s => !isReject(s))
    .sort((a, b) => n(b.today_score) - n(a.today_score))
    .slice(0, 18)
    .map(s => ({
      symbol: s.symbol,
      name: s.name,
      score: n(s.today_score),
      category: getCategory(s),
      tier: getTier(n(s.today_score)),
      raw: s
    }));

  // ---------- Highlight ----------
  const highlight = simulation
    .filter(s => isHighlight(s.raw))
    .map(s => ({
      ...s,
      type: highlightType(s.raw)
    }));

  // ---------- Watch ----------
  const watch = simulation.filter(
    s => !highlight.find(h => h.symbol === s.symbol)
  );

  return {
    reject,
    simulation,
    highlight,
    watch
  };
}
