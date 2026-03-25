/* ==========================================
   stock_engine.js V3（合併版）
   振宇 FCN 系統｜Stock Engine
   功能：
   1. 合併 pool + market runtime
   2. 計算 Baseline / Pure / Event
   3. 輸出單股 / 全部股票結果
========================================== */

// ------------------------------------------
// 五大類固定順序與分數（定稿）
// 核心 → 成長 → 防禦 → 收益 → 投機
// ------------------------------------------
const CATEGORY_MAP = {
  core: {
    order: 1,
    label: "核心",
    score: 10,
    factor: 1.0
  },
  growth: {
    order: 2,
    label: "成長",
    score: 8,
    factor: 1.2
  },
  defensive: {
    order: 3,
    label: "防禦",
    score: 7,
    factor: 0.8
  },
  income: {
    order: 4,
    label: "收益",
    score: 6,
    factor: 1.4
  },
  speculative: {
    order: 5,
    label: "投機",
    score: 4,
    factor: 0.7
  }
};

// ------------------------------------------
// 工具
// ------------------------------------------
function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 4) {
  return Number(toNumber(value, 0).toFixed(digits));
}

// ------------------------------------------
// 1. 合併單一股票資料
// ------------------------------------------
export function mergeStockData(poolStock = {}, marketMap = {}) {
  const symbol = String(poolStock.symbol || "").trim().toUpperCase();
  const market = marketMap[symbol] || {};

  return {
    ...poolStock,
    ...market,
    symbol,

    baseline_label:
      poolStock.baseline_label ||
      CATEGORY_MAP[poolStock.category]?.label ||
      "投機",

    baseline_score:
      poolStock.baseline_score ??
      CATEGORY_MAP[poolStock.category]?.score ??
      4,

    category_order:
      poolStock.category_order ??
      CATEGORY_MAP[poolStock.category]?.order ??
      5,

    event_bias:
      poolStock.event_bias ?? 0,

    event_weight:
      poolStock.event_weight ?? 0.3,

    allow_fcn:
      poolStock.allow_fcn ?? true,

    can_hold:
      poolStock.can_hold ?? true
  };
}

// ------------------------------------------
// 2. 批量合併
// ------------------------------------------
export function mergeStockUniverse(pool = [], marketMap = {}) {
  if (!Array.isArray(pool)) return [];
  return pool.map(stock => mergeStockData(stock, marketMap));
}

// ------------------------------------------
// 3. Baseline
// ------------------------------------------
export function calcBaselineScore(stock = {}) {
  if (stock.baseline_score != null) {
    return toNumber(stock.baseline_score, 4);
  }
  return CATEGORY_MAP[stock.category]?.score ?? 4;
}

export function calcBaselineLabel(stock = {}) {
  if (stock.baseline_label) return String(stock.baseline_label);
  return CATEGORY_MAP[stock.category]?.label ?? "投機";
}

export function getCategoryFactor(stock = {}) {
  return CATEGORY_MAP[stock.category]?.factor ?? 0.7;
}

// ------------------------------------------
// 4. 中期波動度（Pure 用）
// ------------------------------------------
export function calcVolatility(stock = {}) {
  const r1m = Math.abs(toNumber(stock.ret_1m, 0));
  const r6m = Math.abs(toNumber(stock.ret_6m, 0));
  const r12m = Math.abs(toNumber(stock.ret_12m, 0));

  return round(0.1 * r1m + 0.3 * r6m + 0.6 * r12m);
}

// ------------------------------------------
// 5. 波動分數
// ------------------------------------------
export function calcVolScore(volatility = 0) {
  const v = Math.abs(toNumber(volatility, 0));

  if (v <= 10) return -2;
  if (v <= 20) return -1;
  if (v <= 40) return 1;
  if (v <= 60) return -1;
  if (v <= 80) return -2;
  return -3;
}

export function calcVolLabel(volatility = 0) {
  const v = Math.abs(toNumber(volatility, 0));

  if (v <= 10) return "太低";
  if (v <= 20) return "過低";
  if (v <= 40) return "合理";
  if (v <= 60) return "過高";
  if (v <= 80) return "太高";
  return "異常";
}

// ------------------------------------------
// 6. Pure adjustment
// ------------------------------------------
export function calcPureAdjustment(stock = {}) {
  const factor = getCategoryFactor(stock);
  const volatility = calcVolatility(stock);
  const vol_score = calcVolScore(volatility);
  const adjustment = factor * vol_score;

  return {
    factor: round(factor),
    volatility,
    vol_score,
    vol_label: calcVolLabel(volatility),
    adjustment: round(adjustment)
  };
}

// ------------------------------------------
// 7. Pure Score
// Pure = Baseline + Adjustment
// ------------------------------------------
export function calcPureScore(stock = {}) {
  const baseline = calcBaselineScore(stock);
  const adj = calcPureAdjustment(stock);

  return round(baseline + adj.adjustment);
}

// ------------------------------------------
// 8. 短期價格動能（Adjustment 原始輸入）
// 0.6 * 1D + 0.3 * 1W + 0.1 * 1M
// 注意：market_runtime 目前 ret_1d 可能是小數格式
// 先直接使用，之後統一單位時再調整
// ------------------------------------------
export function calcPriceMomentum(stock = {}) {
  const ret1d = toNumber(stock.ret_1d, 0);
  const ret1w = toNumber(stock.ret_1w, 0);
  const ret1m = toNumber(stock.ret_1m, 0);

  return round(0.6 * ret1d + 0.3 * ret1w + 0.1 * ret1m);
}

// ------------------------------------------
// 9. Adjustment Score
// 先用定稿版區間
// ------------------------------------------
export function calcAdjustmentScore(stock = {}) {
  const m = calcPriceMomentum(stock);

  if (m <= -25) return 8;
  if (m <= -15) return 6;
  if (m <= -8) return 4;
  if (m < 0) return 2;

  if (m <= 5) return 0;
  if (m <= 10) return -2;
  if (m <= 20) return -4;
  return -6;
}

// ------------------------------------------
// 10. Event Impact / Event
// 目前先保留接口，之後接 M1
// ------------------------------------------
export function calcEventImpact(stock = {}, context = {}) {
  if (context.eventImpactMap && stock.symbol in context.eventImpactMap) {
    return toNumber(context.eventImpactMap[stock.symbol], 0);
  }

  if (stock.event_impact != null) {
    return toNumber(stock.event_impact, 0);
  }

  return toNumber(stock.event_bias, 0);
}

// ------------------------------------------
// 11. Event Stock Score（定稿版）
// Event Stock Score =
// Pure × (1 + 0.1 * Adjustment) × (1 + 0.15 * Event)
// Pure < 5 → 不做
// ------------------------------------------
export function calcEventStockScore(stock = {}, context = {}) {
  const pure = calcPureScore(stock);

  if (pure < 5) {
    return round(pure);
  }

  const adjustment = calcAdjustmentScore(stock);
  const event = calcEventImpact(stock, context);

  const score =
    pure *
    (1 + 0.1 * adjustment) *
    (1 + 0.15 * event);

  return round(score);
}

// ------------------------------------------
// 12. 可否納入 FCN
// ------------------------------------------
export function isTradable(stock = {}) {
  if (stock.allow_fcn === false) return false;
  if (stock.can_hold === false) return false;
  return true;
}

// ------------------------------------------
// 13. 單檔完整評估
// ------------------------------------------
export function evaluateStock(stock = {}, context = {}) {
  const baseline_score = calcBaselineScore(stock);
  const baseline_label = calcBaselineLabel(stock);
  const pureAdj = calcPureAdjustment(stock);
  const pure_score = calcPureScore(stock);
  const adjustment_score = calcAdjustmentScore(stock);
  const event_score = calcEventStockScore(stock, context);

  return {
    symbol: stock.symbol || "",
    name: stock.name || "",
    sector: stock.sector || "",
    subsector: stock.subsector || "",

    category: stock.category || "speculative",
    category_order: stock.category_order ?? 5,
    baseline_label,
    baseline_score,

    price_now: stock.price_now ?? null,
    ret_1d: toNumber(stock.ret_1d, 0),
    ret_1w: toNumber(stock.ret_1w, 0),
    ret_1m: toNumber(stock.ret_1m, 0),
    ret_6m: toNumber(stock.ret_6m, 0),
    ret_12m: toNumber(stock.ret_12m, 0),
    volume: stock.volume ?? null,
    last_update: stock.last_update ?? null,

    volatility: pureAdj.volatility,
    vol_score: pureAdj.vol_score,
    vol_label: pureAdj.vol_label,
    pure_adjustment_factor: pureAdj.factor,
    pure_adjustment: pureAdj.adjustment,
    pure_score,

    price_momentum: calcPriceMomentum(stock),
    adjustment_score,

    event_bias: calcEventImpact(stock, context),
    event_stock_score: event_score,

    allow_fcn: stock.allow_fcn ?? true,
    can_hold: stock.can_hold ?? true,
    tradable: isTradable(stock),

    basket_role: stock.basket_role || null,
    correlation_cluster: stock.correlation_cluster || null,
    downside_risk_level: stock.downside_risk_level || null
  };
}

// ------------------------------------------
// 14. 批量完整評估
// ------------------------------------------
export function evaluateStockUniverse(pool = [], marketMap = {}, context = {}) {
  const merged = mergeStockUniverse(pool, marketMap);
  return merged.map(stock => evaluateStock(stock, context));
}

// ------------------------------------------
// 15. 依 symbol 查詢
// ------------------------------------------
export function findStockBySymbol(pool = [], symbol = "") {
  if (!Array.isArray(pool)) return null;
  const target = String(symbol || "").trim().toUpperCase();

  return (
    pool.find(s => String(s.symbol || "").trim().toUpperCase() === target) || null
  );
}

// ------------------------------------------
// 16. 單筆查詢（自動 merge 後計算）
// ------------------------------------------
export function queryStock(pool = [], marketMap = {}, symbol = "", context = {}) {
  const stock = findStockBySymbol(pool, symbol);
  if (!stock) return null;

  const merged = mergeStockData(stock, marketMap);
  return evaluateStock(merged, context);
}
