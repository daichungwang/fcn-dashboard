/* ==========================================
   stock_engine.js V7
   振宇 FCN 系統｜Stock Engine

   定義：
   1. Pure Stock  = 公司品質 / 我願不願意接
   2. Snapshot    = 現在是不是甜甜價
   3. Event Score = news impact (ShortSwing Score)
   4. Event Stock = Pure Stock + Snapshot + Event Score
   5. 本檔案只處理個股，不處理 FCN 結構
========================================== */

// ------------------------------------------
// 分類定義（可再調）
// ------------------------------------------
const CATEGORY_MAP = {
  core: {
    label: "核心",
    base: 10
  },
  defensive: {
    label: "防禦",
    base: 7
  },
  growth: {
    label: "成長",
    base: 8
  },
  income: {
    label: "收益",
    base: 6
  },
  speculative: {
    label: "投機",
    base: 4
  }
};

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

function abs(value) {
  return Math.abs(toNumber(value, 0));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, toNumber(value, 0)));
}

function smoothstep(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

// ------------------------------------------
// 合併 market runtime
// ------------------------------------------
export function mergeStockData(stock = {}, marketRuntime = {}) {
  const symbol = String(stock.symbol || "").trim().toUpperCase();
  const runtime = marketRuntime?.[symbol] || {};

  return {
    ...stock,
    ...runtime,
    symbol
  };
}

// ------------------------------------------
// 分類 / baseline
// ------------------------------------------
export function getCategory(stock = {}) {
  return stock.category || "speculative";
}

export function getBaselineLabel(stock = {}) {
  return CATEGORY_MAP[getCategory(stock)]?.label || "投機";
}

export function calcBaselineScore(stock = {}) {
  return CATEGORY_MAP[getCategory(stock)]?.base ?? 1;
}

// ------------------------------------------
// Pure 用：中期波動度
// 公式：0.1*|1m| + 0.3*|6m| + 0.6*|12m|
// ------------------------------------------
export function calcMidTermVolatility(stock = {}) {
  const r1m = abs(stock.ret_1m);
  const r6m = abs(stock.ret_6m);
  const r12m = abs(stock.ret_12m);

  return round(0.1 * r1m + 0.3 * r6m + 0.6 * r12m, 4);
}

// ------------------------------------------
// Pure 用：中期波動分數
// 規則：
// 0~5% = 0
// 5~60%（每5%一格）到 -2
// 60~80% 到 -2.5
// >80% = -3
// ------------------------------------------
export function calcVolScore(volatility = 0) {
  const v = abs(volatility);
  let score = 0;

  if (v <= 0.05) {
    score = 0;
  } else if (v <= 0.6) {
    const step = Math.floor((v - 0.05) / 0.05) + 1;
    score = -step * (2 / 11); // 60% 時精準對齊 -2
  } else if (v <= 0.8) {
    const step = Math.floor((v - 0.6) / 0.05) + 1;
    score = -2 - step * 0.125; // 80% 時對齊 -2.5
  } else {
    score = -3;
  }

  if (score < -3) score = -3;
  return round(score, 3);
}

export function calcVolLabel(volatility = 0) {
  const v = abs(volatility);

  if (v <= 0.05) return "極穩定";
  if (v <= 0.10) return "穩定";
  if (v <= 0.20) return "偏穩";
  if (v <= 0.40) return "中等波動";
  if (v <= 0.60) return "偏高波動";
  if (v <= 0.80) return "高波動";
  return "極高波動";
}

// ------------------------------------------
// Pure Stock
// Pure Stock = Baseline + Vol Score
// ------------------------------------------
export function calcPureStockScore(stock = {}) {
  const baseline = calcBaselineScore(stock);
  const midVol = calcMidTermVolatility(stock);
  const volScore = calcVolScore(midVol);

  return round(baseline + volScore, 2);
}

export function getPureReason(stock = {}) {
  const baselineLabel = getBaselineLabel(stock);
  const baseline = calcBaselineScore(stock);
  const midVol = calcMidTermVolatility(stock);
  const volScore = calcVolScore(midVol);
  const volLabel = calcVolLabel(midVol);

  return `${baselineLabel}股、Baseline=${baseline}、中期波動=${(midVol * 100).toFixed(1)}%、${volLabel}、VolScore=${volScore}`;
}

// ------------------------------------------
// Snapshot 用：momentum
// 新權重：0.4*1d + 0.5*1w + 0.1*1m
// 注意：保留正負，不可取絕對值
// ------------------------------------------
export function calcMomentum(stock = {}) {
  const r1d = toNumber(stock.ret_1d, 0);
  const r1w = toNumber(stock.ret_1w, 0);
  const r1m = toNumber(stock.ret_1m, 0);

  return round(0.4 * r1d + 0.5 * r1w + 0.1 * r1m, 4);
}

// ------------------------------------------
// Snapshot 分數表
// momentum 以百分比 movePct 判斷
// ------------------------------------------
export function calcSnapshotScore(movePct = 0) {
  if (movePct <= -28) return 10;
  if (movePct <= -26) return 9;
  if (movePct <= -22) return 8;
  if (movePct <= -18) return 7;
  if (movePct <= -14) return 6;
  if (movePct <= -11) return 5;
  if (movePct <= -8) return 4;
  if (movePct <= -5) return 3;
  if (movePct <= -3) return 2;
  if (movePct <= -1) return 1;

  if (movePct < 1) return 0;

  if (movePct <= 5) return -1;
  if (movePct <= 8) return -2;
  if (movePct <= 13) return -3;
  if (movePct <= 18) return -4;
  if (movePct <= 25) return -5;
  if (movePct <= 30) return -6;

  return -8;
}

export function getSnapshotBucket(movePct = 0) {
  if (movePct <= -28) return "<= -28%";
  if (movePct <= -26) return "-28% ~ -26%";
  if (movePct <= -22) return "-26% ~ -22%";
  if (movePct <= -18) return "-22% ~ -18%";
  if (movePct <= -14) return "-18% ~ -14%";
  if (movePct <= -11) return "-14% ~ -11%";
  if (movePct <= -8) return "-11% ~ -8%";
  if (movePct <= -5) return "-8% ~ -5%";
  if (movePct <= -3) return "-5% ~ -3%";
  if (movePct <= -1) return "-3% ~ -1%";

  if (movePct < 1) return "-1% ~ +1%";

  if (movePct <= 5) return "+1% ~ +5%";
  if (movePct <= 8) return "+5% ~ +8%";
  if (movePct <= 13) return "+8% ~ +13%";
  if (movePct <= 18) return "+13% ~ +18%";
  if (movePct <= 25) return "+18% ~ +25%";
  if (movePct <= 30) return "+25% ~ +30%";

  return "> +30%";
}

export function getSnapshotReason(movePct = 0) {
  if (movePct <= -28) return "急跌超甜，但要確認不是壞掉";
  if (movePct <= -26) return "很甜";
  if (movePct <= -22) return "很甜";
  if (movePct <= -18) return "甜";
  if (movePct <= -14) return "偏甜";
  if (movePct <= -11) return "健康修正";
  if (movePct <= -8) return "健康修正";
  if (movePct <= -5) return "開始變甜";
  if (movePct <= -3) return "微甜";
  if (movePct <= -1) return "小幅修正";

  if (movePct < 1) return "中性區";

  if (movePct <= 5) return "偏貴";
  if (movePct <= 8) return "不甜";
  if (movePct <= 13) return "偏熱";
  if (movePct <= 18) return "過熱";
  if (movePct <= 25) return "高位風險";
  if (movePct <= 30) return "明顯過熱";

  return "極度過熱";
}

export function calcSnapshot(stock = {}) {
  const momentum = calcMomentum(stock);
  const movePct = round(momentum * 100, 2);
  const score = calcSnapshotScore(movePct);

  return {
    snapshot_momentum: momentum,
    snapshot_move_pct: movePct,
    snapshot_bucket: getSnapshotBucket(movePct),
    snapshot_score: score,
    snapshot_reason: getSnapshotReason(movePct)
  };
}

// ------------------------------------------
// Trend（解釋層）
// 不直接進分數，只提供語意解釋
// ------------------------------------------
export function classifyTrend(stock = {}) {
  const r1m = toNumber(stock.ret_1m, 0);
  const r6m = toNumber(stock.ret_6m, 0);
  const r12m = toNumber(stock.ret_12m, 0);

  if (r12m > 0.2 && r6m > 0 && r1m < 0) {
    return {
      trend: "pullback_in_uptrend",
      trend_label: "長多回檔",
      trend_note: "長期趨勢仍強，短期回檔，較符合 FCN 觀察時點"
    };
  }

  if (r12m > 0.2 && r1m > 0.05) {
    return {
      trend: "strong_uptrend",
      trend_label: "高位強勢",
      trend_note: "中長期很強，但位置偏高，FCN 不宜追價"
    };
  }

  if (r12m > 0 && r6m > 0 && r1m > 0) {
    return {
      trend: "breakout",
      trend_label: "突破轉強",
      trend_note: "近期轉強，但 FCN 時點不一定最好"
    };
  }

  if (r12m < 0 && r6m < 0 && r1m < 0) {
    return {
      trend: "downtrend",
      trend_label: "弱勢下跌",
      trend_note: "中長期偏弱，需避免當成 FCN 核心標的"
    };
  }

  if (r12m < 0 && r1m > 0) {
    return {
      trend: "dead_cat_bounce",
      trend_label: "弱勢反彈",
      trend_note: "長期仍弱，短期反彈不代表安全"
    };
  }

  if (r1m < -0.12 && r12m > 0) {
    return {
      trend: "sharp_pullback",
      trend_label: "急跌修正",
      trend_note: "跌得夠深，利率可能轉甜，但要小心不是壞掉"
    };
  }

  return {
    trend: "neutral",
    trend_label: "中性",
    trend_note: "沒有明確趨勢優勢，需要搭配 Snapshot 判斷"
  };
}

// ------------------------------------------
// ShortSwing
// 優先使用 delta_days，若尚未完成資料切換，fallback 到 swing_days
//
// ShortSwing = 0.35×d0 + 0.25×d1 + 0.15×d2 + 0.10×d3 + 0.08×d4 + 0.07×d5
// ------------------------------------------
export function getShortSwingDays(stock = {}) {
  const source = Array.isArray(stock.delta_days) && stock.delta_days.length
    ? stock.delta_days
    : (Array.isArray(stock.swing_days) ? stock.swing_days : []);

  const days = [];
  for (let i = 0; i < 6; i++) {
    days.push(toNumber(source[i], 0));
  }
  return days;
}

export function calcShortSwing(stock = {}) {
  const d = getShortSwingDays(stock);
  const w = [0.35, 0.25, 0.15, 0.10, 0.08, 0.07];

  let total = 0;
  for (let i = 0; i < 6; i++) {
    total += w[i] * d[i];
  }

  return round(total, 2);
}

// ------------------------------------------
// ShortSwing Score（非線性曲線版）
//
// 方向：
// ShortSwing 越負 → 分數越負
// ShortSwing 越正 → 分數越正
//
// 錨點：
// x = -2 → -3
// x =  0 →  0
// x = +2 → +5
// x = -10 → -5，最終封頂 -6
// x = +10 → +9，最終封頂 +10
// ------------------------------------------
export function calcShortSwingScore(shortSwing = 0) {
  const v = toNumber(shortSwing, 0);

  // 中心左：-2 ~ 0 → 0 到 -3（曲線）
  if (v >= -2 && v <= 0) {
    const t = (-v) / 2;
    return round(-3 * Math.sin((Math.PI / 2) * t), 2);
  }

  // 中心右：0 ~ +2 → 0 到 +5（曲線）
  if (v > 0 && v <= 2) {
    const t = v / 2;
    return round(5 * Math.sin((Math.PI / 2) * t), 2);
  }

  // 左外圍：-2 ~ -10 → -3 到 -5（緩跌）
  if (v < -2 && v >= -10) {
    const t = ((-v) - 2) / 8;
    return round(-3 - 2 * smoothstep(t), 2);
  }

  // 右外圍：+2 ~ +10 → +5 到 +9（緩漲）
  if (v > 2 && v <= 10) {
    const t = (v - 2) / 8;
    return round(5 + 4 * smoothstep(t), 2);
  }

  // 左封頂區：-10 以下 → -6
  if (v < -10) {
    const t = Math.min(((-v) - 10) / 4, 1);
    return round(-5 - 1 * smoothstep(t), 2);
  }

  // 右封頂區：+10 以上 → +10
  if (v > 10) {
    const t = Math.min((v - 10) / 4, 1);
    return round(9 + 1 * smoothstep(t), 2);
  }

  return 0;
}

export function getShortSwingReason(shortSwing = 0, score = 0) {
  const x = toNumber(shortSwing, 0);
  const s = toNumber(score, 0);

  if (x >= 10) return `ShortSwing=${x}%：極強正動能，EventScore=${s}`;
  if (x >= 2) return `ShortSwing=${x}%：偏強正動能，EventScore=${s}`;
  if (x > 0) return `ShortSwing=${x}%：溫和轉強，EventScore=${s}`;

  if (x <= -10) return `ShortSwing=${x}%：極弱負動能，EventScore=${s}`;
  if (x <= -2) return `ShortSwing=${x}%：偏弱負動能，EventScore=${s}`;
  if (x < 0) return `ShortSwing=${x}%：溫和轉弱，EventScore=${s}`;

  return `ShortSwing=${x}%：中性，EventScore=${s}`;
}

export function calcEventScore(stock = {}) {
  const shortSwing = calcShortSwing(stock);
  const eventScore = calcShortSwingScore(shortSwing);

  return {
    short_swing: shortSwing,
    event_score: eventScore,
    event_reason: getShortSwingReason(shortSwing, eventScore),
    delta_days: getShortSwingDays(stock)
  };
}

// ------------------------------------------
// Event Stock
// Event Stock = Pure Stock + Snapshot + Event Score
// ------------------------------------------
export function calcEventStockScore(stock = {}) {
  const pure = calcPureStockScore(stock);
  const snapshot = calcSnapshot(stock).snapshot_score;
  const eventScore = calcEventScore(stock).event_score;

  return round(pure + snapshot + eventScore, 2);
}

// ------------------------------------------
// Bias / suggestion
// ------------------------------------------
export function getStockBias(stock = {}) {
  const pure = calcPureStockScore(stock);
  const snapshot = calcSnapshot(stock).snapshot_score;
  const eventScore = calcEventScore(stock).event_score;
  const eventStock = calcEventStockScore(stock);

  if (pure < 3) return "negative";
  if (eventStock >= 16) return "very_positive";
  if (eventStock >= 12) return "positive";
  if (eventStock >= 7) return "neutral";
  if (snapshot < 0 || eventScore < 0) return "cautious";
  return "neutral";
}

export function getSuggestion(stock = {}) {
  const pure = calcPureStockScore(stock);
  const eventStock = calcEventStockScore(stock);
  const trend = classifyTrend(stock).trend;
  const eventScore = calcEventScore(stock).event_score;

  if (pure < 3) return "避免納入 FCN";
  if (trend === "downtrend") return "避免納入 FCN";
  if (trend === "dead_cat_bounce") return "避免納入 FCN";

  if (eventStock >= 16) return "優先列入 FCN 候選";
  if (eventStock >= 12) return "可列入 FCN 候選";
  if (eventStock >= 7) return "中性觀察";
  if (eventScore <= -4) return "保守觀察";
  return "保守觀察";
}

// ------------------------------------------
// 主輸出：單檔完整評估
// ------------------------------------------
export function evaluateStock(stock = {}, context = {}) {
  const baseline_score = calcBaselineScore(stock);
  const baseline_label = getBaselineLabel(stock);

  const mid_term_volatility = calcMidTermVolatility(stock);
  const vol_score = calcVolScore(mid_term_volatility);
  const vol_label = calcVolLabel(mid_term_volatility);

  const pure_stock_score = calcPureStockScore(stock);
  const pure_reason = getPureReason(stock);

  const trendInfo = classifyTrend(stock);

  const snapshot = calcSnapshot(stock);
  const eventInfo = calcEventScore(stock);
  const event_stock_score = calcEventStockScore(stock);

  const stock_bias = getStockBias(stock);
  const suggestion = getSuggestion(stock);

  return {
    symbol: stock.symbol || "",
    name: stock.name || "",
    sector: stock.sector || "",
    subsector: stock.subsector || "",
    category: getCategory(stock),

    price_now: stock.price_now ?? null,
    ret_1d: toNumber(stock.ret_1d, 0),
    ret_1w: toNumber(stock.ret_1w, 0),
    ret_1m: toNumber(stock.ret_1m, 0),
    ret_6m: toNumber(stock.ret_6m, 0),
    ret_12m: toNumber(stock.ret_12m, 0),
    volume: stock.volume ?? null,
    last_update: stock.last_update ?? null,

    baseline_label,
    baseline_score,

    mid_term_volatility,
    vol_score,
    vol_label,

    pure_stock_score,
    pure_reason,

    trend: trendInfo.trend,
    trend_label: trendInfo.trend_label,
    trend_note: trendInfo.trend_note,

    snapshot_momentum: snapshot.snapshot_momentum,
    snapshot_move_pct: snapshot.snapshot_move_pct,
    snapshot_bucket: snapshot.snapshot_bucket,
    snapshot_score: snapshot.snapshot_score,
    snapshot_reason: snapshot.snapshot_reason,

    delta_days: eventInfo.delta_days,
    short_swing: eventInfo.short_swing,
    event_score: eventInfo.event_score,
    event_reason: eventInfo.event_reason,

    event_stock_score,

    stock_bias,
    suggestion
  };
}

// ------------------------------------------
// 批量輸出
// ------------------------------------------
export function evaluateStockUniverse(pool = [], marketRuntime = {}, context = {}) {
  return (pool || [])
    .map(stock => mergeStockData(stock, marketRuntime))
    .map(stock => evaluateStock(stock, context));
}
