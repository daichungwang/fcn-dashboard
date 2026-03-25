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
// poolStock = data/pool30.json 裡單筆
// marketMap = data/market_runtime.json 整包
// ------------------------------------------
export function mergeStockData(poolStock = {}, marketMap = {}) {
  const symbol = String(poolStock.symbol || "").trim().toUpperCase();
  const market = marketMap[symbol] || {};

  return {
    ...poolStock,
    ...market,

    symbol,

    // 基本保障：沒有就從 category map 補
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
// 4. 波動度
// Pure 用：0.1*|1m| + 0.3*|6m| + 0.6*|12m|
// ------------------------------------------
export function calcVolatility(stock = {}) {
  const r1m = Math.abs(toNumber(stock.ret_1m, 0));
  const r6m = Math.abs(toNumber(stock.ret_6m, 0));
  const r12m = Math.abs(toNumber(stock.ret_12m, 0));

  return round(0.1 * r1m + 0.3 * r6m + 0.6 * r12m);
}

// ------------------------------------------
// 5. 波動分數
// <=10  -2
// <=20  -1
// <=40  +1
// <=60  -1
// <=80  -2
// >80   -3
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
// adjustment = factor × vol_score
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
// 8. Event momentum（短期市場驗證）
// 先做簡化版：0.6*ret_1d + 0.4*ret_1w
// 注意：1d/1w 是百分比，不是小數
// 若你 market_runtime 用的是小數，這裡可後續再統一
// ------------------------------------------
export function calcEventMomentum(stock = {}) {
  const ret1d = toNumber(stock.ret_1d, 0);
  const ret1w = toNumber(stock.ret_1w, 0);

  return round(0.6 * ret1d + 0.4 * ret1w);
}

// ------------------------------------------
// 9. Event impact
// 目前先用 event_bias 為主
// 之後可接 news engine 做覆蓋
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

export function calcEventWeight(stock = {}, context = {}) {
  if (context.eventWeightMap && stock.symbol in context.eventWeightMap) {
    return toNumber(context.eventWeightMap[stock.symbol], 0.3);
  }

  return toNumber(stock.event_weight, 0.3);
}

// ------------------------------------------
// 10. Event Score
// Event = Pure + Event Impact * Weight
// 可選擇是否加 momentum（目前先保守加入）
// ------------------------------------------
export function calcEventScore(stock = {}, context = {}) {
  const pure = calcPureScore(stock);
  const impact = calcEventImpact(stock, context);
  const weight = calcEventWeight(stock, context);
  const momentum = calcEventMomentum(stock);

  // 先做保守版：新聞主體 + 少量市場驗證
  const eventScore = pure + impact * weight + momentum * 0.1;

  return round(eventScore);
}

// ------------------------------------------
// 11. 可否納入 FCN
// ------------------------------------------
export function isTradable(stock = {}) {
  if (stock.allow_fcn === false) return false;
  if (stock.can_hold === false) return false;
  return true;
}

// ------------------------------------------
// 12. 單檔完整評估
// ------------------------------------------
export function evaluateStock(stock = {}, context = {}) {
  const baseline_score = calcBaselineScore(stock);
  const baseline_label = calcBaselineLabel(stock);
  const pureAdj = calcPureAdjustment(stock);
  const pure_score = calcPureScore(stock);
  const event_score = calcEventScore(stock, context);

  const delta_pure = round(pure_score - baseline_score);
  const delta_event = round(event_score - pure_score);

  return {
    // 基本
    symbol: stock.symbol || "",
    name: stock.name || "",
    sector: stock.sector || "",
    subsector: stock.subsector || "",

    // 分類
    category: stock.category || "speculative",
    category_order: stock.category_order ?? 5,
    baseline_label,
    baseline_score,

    // 市場資料
    price_now: stock.price_now ?? null,
    ret_1d: toNumber(stock.ret_1d, 0),
    ret_1w: toNumber(stock.ret_1w, 0),
    ret_1m: toNumber(stock.ret_1m, 0),
    ret_6m: toNumber(stock.ret_6m, 0),
    ret_12m: toNumber(stock.ret_12m, 0),
    volume: stock.volume ?? null,
    last_update: stock.last_update ?? null,

    // Pure
    volatility: pureAdj.volatility,
    vol_score: pureAdj.vol_score,
    vol_label: pureAdj.vol_label,
    pure_adjustment_factor: pureAdj.factor,
    pure_adjustment: pureAdj.adjustment,
    pure_score,
    delta_pure,

    // Event
    event_bias: calcEventImpact(stock, context),
    event_weight: calcEventWeight(stock, context),
    event_momentum: calcEventMomentum(stock),
    event_score,
    delta_event,

    // FCN可用性
    allow_fcn: stock.allow_fcn ?? true,
    can_hold: stock.can_hold ?? true,
    tradable: isTradable(stock),

    // 結構輔助
    basket_role: stock.basket_role || null,
    correlation_cluster: stock.correlation_cluster || null,
    downside_risk_level: stock.downside_risk_level || null
  };
}

// ------------------------------------------
// 13. 批量完整評估
// ------------------------------------------
export function evaluateStockUniverse(pool = [], marketMap = {}, context = {}) {
  const merged = mergeStockUniverse(pool, marketMap);
  return merged.map(stock => evaluateStock(stock, context));
}

// ------------------------------------------
// 14. 依 symbol 查詢
// ------------------------------------------
export function findStockBySymbol(pool = [], symbol = "") {
  if (!Array.isArray(pool)) return null;
  const target = String(symbol || "").trim().toUpperCase();

  return (
    pool.find(s => String(s.symbol || "").trim().toUpperCase() === target) || null
  );
}

// ------------------------------------------
// 15. 單筆查詢（自動 merge 後計算）
// ------------------------------------------
export function queryStock(pool = [], marketMap = {}, symbol = "", context = {}) {
  const stock = findStockBySymbol(pool, symbol);
  if (!stock) return null;

  const merged = mergeStockData(stock, marketMap);
  return evaluateStock(merged, context);
}
