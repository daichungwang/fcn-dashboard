// ==========================================
// M1 Stock Engine V1
// Universe Evaluation Engine
// ==========================================

// ---------- 工具 ----------
function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function clamp(v, min = 0, max = 10) {
  return Math.max(min, Math.min(max, v));
}

// ---------- Baseline（Capex to Profit） ----------
function calcBaseline(f) {
  const capex = n(f.capex_ratio_prev_y, null);
  const rev = n(f.revenue_growth_q, null);
  const oi = n(f.operating_income_growth_q, null);
  const oi_now = n(f.operating_income_q, null);

  if (capex === null || rev === null || oi === null || oi_now === null) {
    return { score: 5, source: "fallback" };
  }

  if (capex >= 10 && rev >= 15 && oi >= 20 && oi > rev && oi_now > 0) {
    return { score: 8.5, source: "capex_to_profit_strong" };
  }

  if (capex >= 8 && rev >= 10 && oi >= 12) {
    return { score: 7, source: "capex_to_profit_ok" };
  }

  return { score: 4.5, source: "weak" };
}

// ---------- Vol Score ----------
function calcVolScore(runtime) {
  const r1m = n(runtime.ret_1m, 0);
  const r3m = n(runtime.ret_3m, 0);
  const r6m = n(runtime.ret_6m, 0);

  const vol = (Math.abs(r1m) + Math.abs(r3m) + Math.abs(r6m)) / 3;

  if (vol > 30) return -2;
  if (vol > 20) return -1;
  if (vol > 10) return 0;
  return +1;
}

// ---------- Trend ----------
function calcTrend(runtime) {
  const r3m = n(runtime.ret_3m, 0);
  const r6m = n(runtime.ret_6m, 0);
  const r12m = n(runtime.ret_12m, 0);

  const score =
    0.2 * r3m +
    0.3 * r6m +
    0.5 * r12m;

  return clamp(score / 10 + 5);
}

// ---------- Valuation（簡化版） ----------
function calcValuation(f) {
  const growth = n(f.revenue_growth_q, 0);

  if (growth > 30) return 9;
  if (growth > 20) return 7.5;
  if (growth > 10) return 6;
  if (growth > 0) return 5;
  return 3;
}

// ---------- Category Suggestion ----------
function suggestCategory(pure, volScore) {
  if (pure >= 8) return "core";
  if (pure >= 6.5) return "growth";
  if (pure >= 5) return "defensive";
  if (volScore < 0) return "speculative";
  return "income";
}

// ---------- Bucket 判斷 ----------
function decideBucket(pure, valuation, trend) {
  if (pure >= 7.5 && valuation >= 6 && trend >= 6) return "pool30_candidate";
  if (pure >= 6) return "stock_pool_candidate";
  if (pure >= 4.5) return "watch_candidate";
  return "reject_candidate";
}

// ---------- 主函數 ----------
export function evaluateStock(stock, runtime = {}, fundamental = {}) {

  // === Baseline ===
  const base = calcBaseline(fundamental);

  // === Vol ===
  const volScore = calcVolScore(runtime);

  // === Pure ===
  let pure = base.score + volScore;
  pure = clamp(pure);

  // === Valuation / Trend ===
  const valuation = calcValuation(fundamental);
  const trend = calcTrend(runtime);

  // === Raw ===
  const raw =
    0.6 * pure +
    0.25 * valuation +
    0.15 * trend;

  // === Std（先簡化）===
  const std = raw - 6; // baseline 6

  // === Category ===
  const category = suggestCategory(pure, volScore);

  // === Bucket ===
  const bucket = decideBucket(pure, valuation, trend);

  // === Decision ===
  const into_stock_pool = pure >= 5;
  const into_pool30 = bucket === "pool30_candidate";

  // === Why ===
  const why_yes = [];
  const why_no = [];

  if (pure >= 7) why_yes.push("Pure 分數高");
  if (valuation >= 6) why_yes.push("估值合理");
  if (trend >= 6) why_yes.push("趨勢正向");

  if (pure < 5) why_no.push("Pure 分數偏低");
  if (trend < 4) why_no.push("趨勢偏弱");

  return {
    engine_score: {
      baseline: base.score,
      vol_score: volScore,
      pure: pure,
      valuation: valuation,
      trend: trend,
      raw: raw,
      std: std
    },

    system_recommendation: {
      bucket: bucket,
      into_stock_pool,
      into_pool30,
      suggested_category: category
    },

    system_reason: {
      why_yes,
      why_no
    }
  };
}
