// ==========================================
// M1 Engine V1
// 振宇 FCN 系統｜Pool30 體質選股引擎
// Level 1 + Level 2（無主觀修正）
// ==========================================

// ---------- 工具 ----------
function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr) {
  if (arr.length <= 1) return 0;
  const m = avg(arr);
  const variance =
    arr.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) /
    (arr.length - 1);
  return Math.sqrt(variance);
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

// ---------- ETF 排外 ----------
const ETF_FORCE_DEFENSIVE = ["QQQ", "SMH", "SPY", "LQD"];

function normalizeCategory(stock) {
  const symbol = String(stock.symbol || "").toUpperCase();
  if (ETF_FORCE_DEFENSIVE.includes(symbol)) return "defensive";

  const c = String(stock.category || "").toLowerCase();

  if (c.includes("core")) return "core";
  if (c.includes("growth")) return "growth";
  if (c.includes("income")) return "income";
  if (c.includes("defensive")) return "defensive";

  return "speculative";
}

// ---------- Capex to Profit ----------
function capexScore(stock) {
  const capex = n(stock.capex);
  const profit = n(stock.profit);

  if (!Number.isFinite(capex) || !Number.isFinite(profit) || profit <= 0) {
  return null;
} // 中性 fallback

  const ratio = capex / profit;

  if (ratio >= 2.0) return 10;
  if (ratio >= 1.5) return 8;
  if (ratio >= 1.0) return 6;
  if (ratio >= 0.5) return 4;
  if (ratio >= 0.2) return 2;
  return 1;
}

// ---------- M3（without baseline） ----------
function m3Score(stock) {
  const pure = n(stock.pure_stock_score);
  const snapshot = n(stock.snapshot_score);
  const event = n(stock.event_stock_score);

  return (
    0.5 * pure +
    0.3 * snapshot +
    0.2 * event
  );
}

// ---------- M7（精簡版） ----------
function m7Score(stock) {
  const val = n(stock.valuation_score);
  const trend = n(stock.trend_score);
  const quality = n(stock.quality_score);

  return (
    0.4 * val +
    0.3 * trend +
    0.3 * quality
  );
}

// ---------- M1 Score ----------
function calcM1(stock) {
  const capex = capexScore(stock);
  const m3 = m3Score(stock);
  const m7 = m7Score(stock);

  let weighted = 0;
  let totalWeight = 0;

  if (capex !== null) {
    weighted += 0.5 * capex;
    totalWeight += 0.5;
  }

  if (m3 !== null) {
    weighted += 0.25 * m3;
    totalWeight += 0.25;
  }

  if (m7 !== null) {
    weighted += 0.25 * m7;
    totalWeight += 0.25;
  }

  const score = totalWeight > 0 ? weighted / totalWeight : 0;

  return {
    M1_score: score,
    capex_score: capex,
    m3_score: m3,
    m7_score: m7
  };
}

// ==========================================
// 主流程
// ==========================================

export function runM1Engine(stockList) {
  const results = [];

  // ---------- Level 1 ----------
  for (const stock of stockList) {
    const category = normalizeCategory(stock);

    const {
      M1_score,
      capex_score,
      m3_score,
      m7_score
    } = calcM1(stock);

    results.push({
      symbol: stock.symbol,
      category,

      M1_score,

      breakdown: {
        capex_score,
        m3_score,
        m7_score
      }
    });
  }

  // ---------- Level 2 ----------
  const groups = {
    core: [],
    growth: [],
    income: [],
    defensive: [],
    speculative: []
  };

  for (const r of results) {
    groups[r.category].push(r.M1_score);
  }

  const stats = {};

  for (const key of Object.keys(groups)) {
    const arr = groups[key];

    stats[key] = {
      count: arr.length,
      mean: avg(arr),
      std: std(arr),
      min: Math.min(...arr, 0),
      max: Math.max(...arr, 0),
      p25: percentile(arr, 25),
      p50: percentile(arr, 50),
      p75: percentile(arr, 75)
    };
  }

  return {
    updated_at: new Date().toISOString(),
    scores: results,
    stats
  };
}
