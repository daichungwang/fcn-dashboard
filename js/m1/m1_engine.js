// ==========================================
// M1 Engine V3
// 振宇 FCN 系統｜Pool30 體質選股引擎
// Step 2：正式吃 fundamental + M3 + M7
// ==========================================

function toNum(v, d = null) {
  if (v === null || v === undefined || v === "") return d;
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
    arr.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / (arr.length - 1);
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

function safeMin(arr) {
  return arr.length ? Math.min(...arr) : 0;
}

function safeMax(arr) {
  return arr.length ? Math.max(...arr) : 0;
}

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

const ETF_FORCE_DEFENSIVE = ["QQQ", "SMH", "SPY", "LQD"];

function normalizeCategory(stock) {
  const symbol = String(stock.symbol || "").toUpperCase().trim();
  if (ETF_FORCE_DEFENSIVE.includes(symbol)) return "defensive";

  const raw = String(stock.category || stock["分類"] || "")
    .toLowerCase()
    .trim();

  if (raw.includes("core")) return "core";
  if (raw.includes("growth")) return "growth";
  if (raw.includes("income")) return "income";
  if (raw.includes("defensive")) return "defensive";
  if (raw.includes("speculative")) return "speculative";

  return "speculative";
}

// ---------- Fundamental / capex proxy ----------
function capexScore(stock) {
  const v = toNum(stock.capex_score, null);
  return v;
}

// ---------- M3 (without baseline) ----------
// 若無 pure/event，就讓 snapshot 比重稍高一點，先當 proxy
function m3Score(stock) {
  const pure = toNum(stock.pure_stock_score, null);
  const snapshot = toNum(stock.snapshot_score ?? stock.snapshot, null);
  const event = toNum(stock.event_stock_score, null);

  const parts = [];

  if (pure !== null) parts.push({ w: 0.45, v: pure });
  if (snapshot !== null) parts.push({ w: 0.35, v: snapshot });
  if (event !== null) parts.push({ w: 0.20, v: event });

  if (!parts.length) return null;

  const sumW = parts.reduce((s, x) => s + x.w, 0);
  const sumV = parts.reduce((s, x) => s + x.w * x.v, 0);

  return sumV / sumW;
}

// ---------- M7 ----------
function m7Score(stock) {
  const val = toNum(stock.valuation_score, null);
  const trend = toNum(stock.trend_score, null);
  const quality = toNum(stock.quality_score, null);

  const parts = [];
  if (val !== null) parts.push({ w: 0.4, v: val });
  if (trend !== null) parts.push({ w: 0.3, v: trend });
  if (quality !== null) parts.push({ w: 0.3, v: quality });

  if (!parts.length) return null;

  const sumW = parts.reduce((s, x) => s + x.w, 0);
  const sumV = parts.reduce((s, x) => s + x.w * x.v, 0);
  return sumV / sumW;
}

// ---------- Category bias ----------
function categoryBias(category) {
  if (category === "core") return 1.12;
  if (category === "growth") return 1.06;
  if (category === "income") return 1.00;
  if (category === "defensive") return 0.93;
  return 0.85; // speculative
}

// ---------- Final M1 ----------
function calcM1(stock, category) {
  const capex = capexScore(stock);
  const m3 = m3Score(stock);
  const m7 = m7Score(stock);

  let weighted = 0;
  let totalWeight = 0;

  // 你原本的核心權重
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

  const rawScore = totalWeight > 0 ? weighted / totalWeight : 0;
  const bias = categoryBias(category);
  const finalScore = rawScore * bias;

  return {
    raw_m1_score: round2(rawScore),
    M1_score: round2(finalScore),
    capex_score: capex !== null ? round2(capex) : null,
    m3_score: m3 !== null ? round2(m3) : null,
    m7_score: m7 !== null ? round2(m7) : null,
    score_source_weight: round2(totalWeight),
    category_bias: round2(bias)
  };
}

// ---------- Level 2 stats ----------
function buildCategoryStats(results) {
  const groups = {
    core: [],
    growth: [],
    income: [],
    defensive: [],
    speculative: []
  };

  for (const row of results) {
    if (!groups[row.category]) groups[row.category] = [];
    if (Number.isFinite(row.M1_score)) {
      groups[row.category].push(row.M1_score);
    }
  }

  const stats = {};

  for (const key of Object.keys(groups)) {
    const arr = groups[key];
    stats[key] = {
      count: arr.length,
      mean: round2(avg(arr)),
      std: round2(std(arr)),
      min: round2(safeMin(arr)),
      max: round2(safeMax(arr)),
      p25: round2(percentile(arr, 25)),
      p50: round2(percentile(arr, 50)),
      p75: round2(percentile(arr, 75))
    };
  }

  return stats;
}

// ---------- Level 3 bucket ----------
function buildInitialBuckets(results, stats) {
  return results.map((row) => {
    const catStats = stats[row.category] || { mean: 0, std: 0, p75: 0, p50: 0, p25: 0 };

    let bucket = "watch";

    // 優先用 percentile，比固定門檻更穩
    if (row.M1_score >= catStats.p75) bucket = "pool30";
    else if (row.M1_score >= catStats.p50) bucket = "stock_pool";
    else if (row.M1_score >= catStats.p25) bucket = "watch";
    else bucket = "reject";

    return {
      ...row,
      initial_bucket: bucket
    };
  });
}

// ---------- Main ----------
export function runM1Engine(stockList) {
  const results = stockList.map((stock) => {
    const category = normalizeCategory(stock);

    const {
      raw_m1_score,
      M1_score,
      capex_score,
      m3_score,
      m7_score,
      score_source_weight,
      category_bias
    } = calcM1(stock, category);

    return {
      symbol: String(stock.symbol || "").toUpperCase().trim(),
      name: stock.name || stock["股名"] || "",
      category,
      raw_category: stock.category || stock["分類"] || "",
      raw_m1_score,
      M1_score,
      breakdown: {
        capex_score,
        m3_score,
        m7_score
      },
      debug: {
        score_source_weight,
        category_bias,
        valuation_score: toNum(stock.valuation_score),
        trend_score: toNum(stock.trend_score),
        quality_score: toNum(stock.quality_score),
        snapshot: toNum(stock.snapshot),
        growth: toNum(stock.growth),
        capex_ratio_prev_y: toNum(stock.capex_ratio_prev_y),
        revenue_growth_q: toNum(stock.revenue_growth_q),
        operating_income_growth_q: toNum(stock.operating_income_growth_q),
        operating_income_q: toNum(stock.operating_income_q)
      }
    };
  });

  const stats = buildCategoryStats(results);
  const scored = buildInitialBuckets(results, stats);

  return {
    updated_at: new Date().toISOString(),
    total_count: scored.length,
    scores: scored.sort((a, b) => b.M1_score - a.M1_score),
    stats
  };
}
