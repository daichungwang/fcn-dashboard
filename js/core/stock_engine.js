/* ==========================================
   stock_engine.js V8
   振宇 FCN 系統｜Stock Engine

   定義：
   1. Pure Stock  = 公司品質 / 我願不願意接
   2. Snapshot    = 現在是不是甜甜價
   3. Event Score = ShortSwing Score
   4. Event Stock = Pure Stock + Snapshot + Event Score
   5. Trend Rate / Trend Profile 先建立骨架，未來可擴充到 3Y / 5Y / 10Y
   6. 本檔案只處理個股，不處理 FCN 結構
========================================== */

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

function getObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function getArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function minZero(v) {
  return Math.min(toNumber(v, 0), 0);
}

// ------------------------------------------
// 預設值（parameter_matrix.json 沒給時 fallback）
// ------------------------------------------
const DEFAULTS = {
  STOCK_CATEGORY_BASELINE: {
    core: { label: "核心", base: 10 },
    defensive: { label: "防禦", base: 7 },
    growth: { label: "成長", base: 8 },
    income: { label: "收益", base: 6 },
    speculative: { label: "投機", base: 4 }
  },

  STOCK_VOLATILITY: {
    weights: { r1m: 0.1, r6m: 0.3, r12m: 0.6 },
    score_bands: [
      { max: 0.05, score: 0 },
      { max: 0.10, score: -0.18 },
      { max: 0.15, score: -0.36 },
      { max: 0.20, score: -0.55 },
      { max: 0.25, score: -0.73 },
      { max: 0.30, score: -0.91 },
      { max: 0.35, score: -1.09 },
      { max: 0.40, score: -1.27 },
      { max: 0.45, score: -1.45 },
      { max: 0.50, score: -1.64 },
      { max: 0.55, score: -1.82 },
      { max: 0.60, score: -2.00 },
      { max: 0.65, score: -2.13 },
      { max: 0.70, score: -2.25 },
      { max: 0.75, score: -2.38 },
      { max: 0.80, score: -2.50 }
    ],
    floor_score: -3,
    labels: [
      { max: 0.05, label: "極穩定" },
      { max: 0.10, label: "穩定" },
      { max: 0.20, label: "偏穩" },
      { max: 0.40, label: "中等波動" },
      { max: 0.60, label: "偏高波動" },
      { max: 0.80, label: "高波動" },
      { max: 999, label: "極高波動" }
    ]
  },

  STOCK_SNAPSHOT: {
    momentum_weights: { r1d: 0.4, r1w: 0.5, r1m: 0.1 },
    score_bands: [
      { max: -28, score: 10, bucket: "<= -28%", reason: "急跌超甜，但要確認不是壞掉" },
      { max: -26, score: 9, bucket: "-28% ~ -26%", reason: "很甜" },
      { max: -22, score: 8, bucket: "-26% ~ -22%", reason: "很甜" },
      { max: -18, score: 7, bucket: "-22% ~ -18%", reason: "甜" },
      { max: -14, score: 6, bucket: "-18% ~ -14%", reason: "偏甜" },
      { max: -11, score: 5, bucket: "-14% ~ -11%", reason: "健康修正" },
      { max: -8, score: 4, bucket: "-11% ~ -8%", reason: "健康修正" },
      { max: -5, score: 3, bucket: "-8% ~ -5%", reason: "開始變甜" },
      { max: -3, score: 2, bucket: "-5% ~ -3%", reason: "微甜" },
      { max: -1, score: 1, bucket: "-3% ~ -1%", reason: "小幅修正" },
      { max: 1, score: 0, bucket: "-1% ~ +1%", reason: "中性區" },
      { max: 5, score: -1, bucket: "+1% ~ +5%", reason: "偏貴" },
      { max: 8, score: -2, bucket: "+5% ~ +8%", reason: "不甜" },
      { max: 13, score: -3, bucket: "+8% ~ +13%", reason: "偏熱" },
      { max: 18, score: -4, bucket: "+13% ~ +18%", reason: "過熱" },
      { max: 25, score: -5, bucket: "+18% ~ +25%", reason: "高位風險" },
      { max: 30, score: -6, bucket: "+25% ~ +30%", reason: "明顯過熱" },
      { max: 999, score: -8, bucket: "> +30%", reason: "極度過熱" }
    ]
  },

  STOCK_EVENT: {
    short_swing_weights: [0.35, 0.25, 0.15, 0.10, 0.08, 0.07],
    score_curve: {
      center_left_x: -2,
      center_right_x: 2,
      left_mid_score: -3,
      right_mid_score: 5,
      left_outer_x: -10,
      right_outer_x: 10,
      left_outer_score: -5,
      right_outer_score: 9,
      left_cap_score: -6,
      right_cap_score: 10,
      cap_extend_range: 4
    }
  },

  STOCK_SUGGESTION: {
    reject_if_pure_lt: 3,
    reject_trends: ["downtrend", "dead_cat_bounce"],
    event_stock_thresholds: {
      priority: 16,
      include: 12,
      neutral: 7
    },
    conservative_if_event_score_lte: -4,
    texts: {
      reject: "避免納入 FCN",
      priority: "優先列入 FCN 候選",
      include: "可列入 FCN 候選",
      neutral: "中性觀察",
      conservative: "保守觀察"
    }
  },

  TREND_ENGINE: {
    enabled: true,
    use_negative_only_for_trend_rate: true,

    trend_rate_weights: {
      r1m: 0.10,
      r3m: 0.20,
      r6m: 0.25,
      r12m: 0.45,
      r3y: 0.00,
      r5y: 0.00,
      r10y: 0.00
    },

    long_trend_rules: {
      secular_growth: {
        r12m_gte: 0.20,
        r6m_gte: 0.08,
        label: "長期成長",
        note: "長期結構向上，可作長期觀察與持有核心"
      },
      stable_compounder: {
        r12m_gte: 0.08,
        r6m_gte: 0.00,
        r12m_lte: 0.20,
        label: "穩定複利",
        note: "長期偏正但不暴衝，適合保守核心"
      },
      sideways: {
        r12m_gt: -0.08,
        r12m_lt: 0.08,
        label: "長期盤整",
        note: "長期方向不明，偏中性"
      },
      structural_decline: {
        r12m_lte: -0.20,
        r6m_lte: -0.08,
        label: "結構轉弱",
        note: "不是短期修正，長期結構偏弱"
      },
      cyclical_uptrend: {
        r12m_gte: 0.10,
        r6m_lt: 0.08,
        label: "循環向上",
        note: "長期仍偏上，但波動較高，需搭配產業循環判讀"
      },
      default: {
        label: "長期中性",
        note: "長期結構尚不明確"
      }
    },

    mid_trend_rules: {
      accelerating_uptrend: {
        r1m_gte: 0.05,
        r3m_gte: 0.10,
        r6m_gte: 0.12,
        label: "加速上行",
        note: "短中期同步走強，位置可能偏熱"
      },
      healthy_pullback: {
        r1m_lte: -0.03,
        r3m_gte: 0.00,
        r6m_gte: 0.05,
        label: "健康回檔",
        note: "長線未壞，短線修正，常是較好的 FCN 觀察點"
      },
      basing: {
        r1m_gt: -0.03,
        r1m_lt: 0.03,
        r3m_gt: -0.05,
        r3m_lt: 0.05,
        label: "築底整理",
        note: "趨勢暫時止穩，但尚未明確轉強"
      },
      weak_rebound: {
        r1m_gte: 0.03,
        r6m_lte: -0.10,
        label: "弱勢反彈",
        note: "短期反彈，但中期仍弱，需保守看待"
      },
      persistent_downtrend: {
        r1m_lte: -0.05,
        r3m_lte: -0.08,
        r6m_lte: -0.12,
        label: "持續下跌",
        note: "跌勢延續中，不宜當成普通修正"
      },
      overheated: {
        r1m_gte: 0.10,
        r3m_gte: 0.18,
        label: "高位過熱",
        note: "公司可能很好，但目前時點偏熱"
      },
      default: {
        label: "中期中性",
        note: "沒有明顯中期位置優勢"
      }
    },

    profile_map: {
      "secular_growth|healthy_pullback": {
        profile: "long_growth_pullback",
        label: "長期成長＋健康回檔",
        note: "最值得優先觀察的一類"
      },
      "secular_growth|accelerating_uptrend": {
        profile: "long_growth_hot",
        label: "長期成長＋加速上行",
        note: "公司很好，但現在可能偏熱"
      },
      "stable_compounder|healthy_pullback": {
        profile: "stable_pullback",
        label: "穩定複利＋健康回檔",
        note: "適合保守型 FCN 與中長期持有"
      },
      "structural_decline|weak_rebound": {
        profile: "decline_rebound",
        label: "結構轉弱＋弱勢反彈",
        note: "容易誤判，不宜太早樂觀"
      },
      "structural_decline|persistent_downtrend": {
        profile: "decline_downtrend",
        label: "結構轉弱＋持續下跌",
        note: "高風險型態，未來可直接接 reject"
      }
    },

    default_profile: {
      profile: "mixed",
      label: "混合型態",
      note: "長中期訊號不一致，需搭配其他分數判斷"
    }
  }
};

// ------------------------------------------
// 取 config
// ------------------------------------------
function getCfg(context = {}, key, fallback = {}) {
  const cfg = context?.[key];
  return getObject(cfg, fallback);
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
function getCategoryMap(context = {}) {
  return getCfg(context, "STOCK_CATEGORY_BASELINE", DEFAULTS.STOCK_CATEGORY_BASELINE);
}

export function getCategory(stock = {}) {
  return stock.category || "speculative";
}

export function getBaselineLabel(stock = {}, context = {}) {
  const map = getCategoryMap(context);
  return map[getCategory(stock)]?.label || "投機";
}

export function calcBaselineScore(stock = {}, context = {}) {
  const map = getCategoryMap(context);
  return toNumber(map[getCategory(stock)]?.base, 1);
}

// ------------------------------------------
// Pure 用：中期波動度
// ------------------------------------------
export function calcMidTermVolatility(stock = {}, context = {}) {
  const cfg = getCfg(context, "STOCK_VOLATILITY", DEFAULTS.STOCK_VOLATILITY);
  const weights = getObject(cfg.weights, DEFAULTS.STOCK_VOLATILITY.weights);

  const r1m = abs(stock.ret_1m);
  const r6m = abs(stock.ret_6m);
  const r12m = abs(stock.ret_12m);

  return round(
    toNumber(weights.r1m, 0.1) * r1m +
    toNumber(weights.r6m, 0.3) * r6m +
    toNumber(weights.r12m, 0.6) * r12m,
    4
  );
}

export function calcVolScore(volatility = 0, context = {}) {
  const cfg = getCfg(context, "STOCK_VOLATILITY", DEFAULTS.STOCK_VOLATILITY);
  const bands = getArray(cfg.score_bands, DEFAULTS.STOCK_VOLATILITY.score_bands);
  const v = abs(volatility);

  for (const band of bands) {
    if (v <= toNumber(band.max, 999)) {
      return round(toNumber(band.score, 0), 3);
    }
  }

  return round(toNumber(cfg.floor_score, -3), 3);
}

export function calcVolLabel(volatility = 0, context = {}) {
  const cfg = getCfg(context, "STOCK_VOLATILITY", DEFAULTS.STOCK_VOLATILITY);
  const labels = getArray(cfg.labels, DEFAULTS.STOCK_VOLATILITY.labels);
  const v = abs(volatility);

  for (const row of labels) {
    if (v <= toNumber(row.max, 999)) {
      return row.label || "未分類";
    }
  }

  return "未分類";
}

// ------------------------------------------
// Pure Stock
// ------------------------------------------
export function calcPureStockScore(stock = {}, context = {}) {
  const baseline = calcBaselineScore(stock, context);
  const midVol = calcMidTermVolatility(stock, context);
  const volScore = calcVolScore(midVol, context);

  return round(baseline + volScore, 2);
}

export function getPureReason(stock = {}, context = {}) {
  const baselineLabel = getBaselineLabel(stock, context);
  const baseline = calcBaselineScore(stock, context);
  const midVol = calcMidTermVolatility(stock, context);
  const volScore = calcVolScore(midVol, context);
  const volLabel = calcVolLabel(midVol, context);

  return `${baselineLabel}股、Baseline=${baseline}、中期波動=${(midVol * 100).toFixed(1)}%、${volLabel}、VolScore=${volScore}`;
}

// ------------------------------------------
// Snapshot
// ------------------------------------------
export function calcMomentum(stock = {}, context = {}) {
  const cfg = getCfg(context, "STOCK_SNAPSHOT", DEFAULTS.STOCK_SNAPSHOT);
  const w = getObject(cfg.momentum_weights, DEFAULTS.STOCK_SNAPSHOT.momentum_weights);

  const r1d = toNumber(stock.ret_1d, 0);
  const r1w = toNumber(stock.ret_1w, 0);
  const r1m = toNumber(stock.ret_1m, 0);

  return round(
    toNumber(w.r1d, 0.4) * r1d +
    toNumber(w.r1w, 0.5) * r1w +
    toNumber(w.r1m, 0.1) * r1m,
    4
  );
}

function getSnapshotBand(movePct = 0, context = {}) {
  const cfg = getCfg(context, "STOCK_SNAPSHOT", DEFAULTS.STOCK_SNAPSHOT);
  const bands = getArray(cfg.score_bands, DEFAULTS.STOCK_SNAPSHOT.score_bands);

  for (const band of bands) {
    if (movePct <= toNumber(band.max, 999)) {
      return band;
    }
  }

  return bands[bands.length - 1] || {};
}

export function calcSnapshotScore(movePct = 0, context = {}) {
  return toNumber(getSnapshotBand(movePct, context).score, 0);
}

export function getSnapshotBucket(movePct = 0, context = {}) {
  return getSnapshotBand(movePct, context).bucket || "-";
}

export function getSnapshotReason(movePct = 0, context = {}) {
  return getSnapshotBand(movePct, context).reason || "-";
}

export function calcSnapshot(stock = {}, context = {}) {
  const momentum = calcMomentum(stock, context);
  const movePct = round(momentum * 100, 2);

  return {
    snapshot_momentum: momentum,
    snapshot_move_pct: movePct,
    snapshot_bucket: getSnapshotBucket(movePct, context),
    snapshot_score: calcSnapshotScore(movePct, context),
    snapshot_reason: getSnapshotReason(movePct, context)
  };
}

// ------------------------------------------
// 舊版 Trend（保留給 suggestion 使用）
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

  if (r12m < -0.2 && r6m < -0.1 && r1m < -0.05) {
    return {
      trend: "downtrend",
      trend_label: "弱勢下跌",
      trend_note: "中長期偏弱，需避免當成 FCN 核心標的"
    };
  }

  if (r12m < -0.15 && r1m > 0.03) {
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

export function calcShortSwing(stock = {}, context = {}) {
  const cfg = getCfg(context, "STOCK_EVENT", DEFAULTS.STOCK_EVENT);
  const d = getShortSwingDays(stock);
  const w = getArray(cfg.short_swing_weights, DEFAULTS.STOCK_EVENT.short_swing_weights);

  let total = 0;
  for (let i = 0; i < 6; i++) {
    total += toNumber(w[i], 0) * toNumber(d[i], 0);
  }

  return round(total, 2);
}

export function calcShortSwingScore(shortSwing = 0, context = {}) {
  const cfg = getCfg(context, "STOCK_EVENT", DEFAULTS.STOCK_EVENT);
  const curve = getObject(cfg.score_curve, DEFAULTS.STOCK_EVENT.score_curve);
  const v = toNumber(shortSwing, 0);

  const centerLeftX = toNumber(curve.center_left_x, -2);
  const centerRightX = toNumber(curve.center_right_x, 2);
  const leftMidScore = toNumber(curve.left_mid_score, -3);
  const rightMidScore = toNumber(curve.right_mid_score, 5);
  const leftOuterX = toNumber(curve.left_outer_x, -10);
  const rightOuterX = toNumber(curve.right_outer_x, 10);
  const leftOuterScore = toNumber(curve.left_outer_score, -5);
  const rightOuterScore = toNumber(curve.right_outer_score, 9);
  const leftCapScore = toNumber(curve.left_cap_score, -6);
  const rightCapScore = toNumber(curve.right_cap_score, 10);
  const capExtendRange = toNumber(curve.cap_extend_range, 4);

  if (v >= centerLeftX && v <= 0) {
    const t = (-v) / abs(centerLeftX || -2);
    return round(leftMidScore * Math.sin((Math.PI / 2) * t), 2);
  }

  if (v > 0 && v <= centerRightX) {
    const t = v / centerRightX;
    return round(rightMidScore * Math.sin((Math.PI / 2) * t), 2);
  }

  if (v < centerLeftX && v >= leftOuterX) {
    const t = ((-v) - abs(centerLeftX)) / (abs(leftOuterX) - abs(centerLeftX));
    return round(leftMidScore + (leftOuterScore - leftMidScore) * smoothstep(t), 2);
  }

  if (v > centerRightX && v <= rightOuterX) {
    const t = (v - centerRightX) / (rightOuterX - centerRightX);
    return round(rightMidScore + (rightOuterScore - rightMidScore) * smoothstep(t), 2);
  }

  if (v < leftOuterX) {
    const t = Math.min(((-v) - abs(leftOuterX)) / capExtendRange, 1);
    return round(leftOuterScore + (leftCapScore - leftOuterScore) * smoothstep(t), 2);
  }

  if (v > rightOuterX) {
    const t = Math.min((v - rightOuterX) / capExtendRange, 1);
    return round(rightOuterScore + (rightCapScore - rightOuterScore) * smoothstep(t), 2);
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

export function calcEventScore(stock = {}, context = {}) {
  const shortSwing = calcShortSwing(stock, context);
  const eventScore = calcShortSwingScore(shortSwing, context);

  return {
    short_swing: shortSwing,
    event_score: eventScore,
    event_reason: getShortSwingReason(shortSwing, eventScore),
    delta_days: getShortSwingDays(stock)
  };
}

// ------------------------------------------
// Trend Rate / Trend Profile 骨架
// ------------------------------------------
function matchRule(rule = {}, data = {}) {
  const checks = [
    ["r1m_gt", data.r1m, (a, b) => a > b],
    ["r1m_gte", data.r1m, (a, b) => a >= b],
    ["r1m_lt", data.r1m, (a, b) => a < b],
    ["r1m_lte", data.r1m, (a, b) => a <= b],

    ["r3m_gt", data.r3m, (a, b) => a > b],
    ["r3m_gte", data.r3m, (a, b) => a >= b],
    ["r3m_lt", data.r3m, (a, b) => a < b],
    ["r3m_lte", data.r3m, (a, b) => a <= b],

    ["r6m_gt", data.r6m, (a, b) => a > b],
    ["r6m_gte", data.r6m, (a, b) => a >= b],
    ["r6m_lt", data.r6m, (a, b) => a < b],
    ["r6m_lte", data.r6m, (a, b) => a <= b],

    ["r12m_gt", data.r12m, (a, b) => a > b],
    ["r12m_gte", data.r12m, (a, b) => a >= b],
    ["r12m_lt", data.r12m, (a, b) => a < b],
    ["r12m_lte", data.r12m, (a, b) => a <= b]
  ];

  for (const [key, value, fn] of checks) {
    if (rule[key] !== undefined && !fn(toNumber(value, 0), toNumber(rule[key], 0))) {
      return false;
    }
  }

  return true;
}

function findFirstMatchedRule(rules = {}, data = {}) {
  for (const [key, rule] of Object.entries(rules)) {
    if (key === "default") continue;
    if (matchRule(rule, data)) {
      return {
        key,
        label: rule.label || key,
        note: rule.note || ""
      };
    }
  }

  const fallback = getObject(rules.default, {});
  return {
    key: "default",
    label: fallback.label || "未分類",
    note: fallback.note || ""
  };
}

export function calcTrendRate(stock = {}, context = {}) {
  const cfg = getCfg(context, "TREND_ENGINE", DEFAULTS.TREND_ENGINE);
  const weights = getObject(cfg.trend_rate_weights, DEFAULTS.TREND_ENGINE.trend_rate_weights);
  const negativeOnly = cfg.use_negative_only_for_trend_rate !== false;

  const r1m = negativeOnly ? minZero(stock.ret_1m) : toNumber(stock.ret_1m, 0);
  const r3m = negativeOnly ? minZero(stock.ret_3m) : toNumber(stock.ret_3m, 0);
  const r6m = negativeOnly ? minZero(stock.ret_6m) : toNumber(stock.ret_6m, 0);
  const r12m = negativeOnly ? minZero(stock.ret_12m) : toNumber(stock.ret_12m, 0);

  const rate =
    toNumber(weights.r1m, 0) * r1m +
    toNumber(weights.r3m, 0) * r3m +
    toNumber(weights.r6m, 0) * r6m +
    toNumber(weights.r12m, 0) * r12m;

  return round(rate, 4);
}

export function classifyTrendProfile(stock = {}, context = {}) {
  const cfg = getCfg(context, "TREND_ENGINE", DEFAULTS.TREND_ENGINE);

  const data = {
    r1m: toNumber(stock.ret_1m, 0),
    r3m: toNumber(stock.ret_3m, 0),
    r6m: toNumber(stock.ret_6m, 0),
    r12m: toNumber(stock.ret_12m, 0)
  };

  const longRules = getObject(cfg.long_trend_rules, DEFAULTS.TREND_ENGINE.long_trend_rules);
  const midRules = getObject(cfg.mid_trend_rules, DEFAULTS.TREND_ENGINE.mid_trend_rules);
  const profileMap = getObject(cfg.profile_map, DEFAULTS.TREND_ENGINE.profile_map);
  const defaultProfile = getObject(cfg.default_profile, DEFAULTS.TREND_ENGINE.default_profile);

  const longTrend = findFirstMatchedRule(longRules, data);
  const midTrend = findFirstMatchedRule(midRules, data);

  const profileKey = `${longTrend.key}|${midTrend.key}`;
  const mapped = getObject(profileMap[profileKey], defaultProfile);

  return {
    long_trend: longTrend.key,
    long_trend_label: longTrend.label,
    long_trend_note: longTrend.note,

    mid_trend: midTrend.key,
    mid_trend_label: midTrend.label,
    mid_trend_note: midTrend.note,

    trend_profile: mapped.profile || "mixed",
    trend_profile_label: mapped.label || "混合型態",
    trend_profile_note: mapped.note || "",

    trend_rate: calcTrendRate(stock, context)
  };
}

// ------------------------------------------
// Event Stock
// ------------------------------------------
export function calcEventStockScore(stock = {}, context = {}) {
  const pure = calcPureStockScore(stock, context);
  const snapshot = calcSnapshot(stock, context).snapshot_score;
  const eventScore = calcEventScore(stock, context).event_score;

  return round(pure + snapshot + eventScore, 2);
}

// ------------------------------------------
// Bias / suggestion
// ------------------------------------------
export function getStockBias(stock = {}, context = {}) {
  const pure = calcPureStockScore(stock, context);
  const snapshot = calcSnapshot(stock, context).snapshot_score;
  const eventScore = calcEventScore(stock, context).event_score;
  const eventStock = calcEventStockScore(stock, context);

  if (pure < 3) return "negative";
  if (eventStock >= 16) return "very_positive";
  if (eventStock >= 12) return "positive";
  if (eventStock >= 7) return "neutral";
  if (snapshot < 0 || eventScore < 0) return "cautious";
  return "neutral";
}

export function getSuggestion(stock = {}, context = {}) {
  const cfg = getCfg(context, "STOCK_SUGGESTION", DEFAULTS.STOCK_SUGGESTION);
  const texts = getObject(cfg.texts, DEFAULTS.STOCK_SUGGESTION.texts);
  const thresholds = getObject(cfg.event_stock_thresholds, DEFAULTS.STOCK_SUGGESTION.event_stock_thresholds);

  const pure = calcPureStockScore(stock, context);
  const eventStock = calcEventStockScore(stock, context);
  const trend = classifyTrend(stock).trend;
  const eventScore = calcEventScore(stock, context).event_score;

  if (pure < toNumber(cfg.reject_if_pure_lt, DEFAULTS.STOCK_SUGGESTION.reject_if_pure_lt)) {
    return texts.reject || "避免納入 FCN";
  }

  const rejectTrends = getArray(cfg.reject_trends, DEFAULTS.STOCK_SUGGESTION.reject_trends);
  if (rejectTrends.includes(trend)) {
    return texts.reject || "避免納入 FCN";
  }

  if (eventStock >= toNumber(thresholds.priority, 16)) {
    return texts.priority || "優先列入 FCN 候選";
  }

  if (eventStock >= toNumber(thresholds.include, 12)) {
    return texts.include || "可列入 FCN 候選";
  }

  if (eventStock >= toNumber(thresholds.neutral, 7)) {
    return texts.neutral || "中性觀察";
  }

  if (eventScore <= toNumber(cfg.conservative_if_event_score_lte, -4)) {
    return texts.conservative || "保守觀察";
  }

  return texts.conservative || "保守觀察";
}

// ------------------------------------------
// 主輸出：單檔完整評估
// ------------------------------------------
export function evaluateStock(stock = {}, context = {}) {
  const baseline_score = calcBaselineScore(stock, context);
  const baseline_label = getBaselineLabel(stock, context);

  const mid_term_volatility = calcMidTermVolatility(stock, context);
  const vol_score = calcVolScore(mid_term_volatility, context);
  const vol_label = calcVolLabel(mid_term_volatility, context);

  const pure_stock_score = calcPureStockScore(stock, context);
  const pure_reason = getPureReason(stock, context);

  const trendInfo = classifyTrend(stock);
  const trendProfile = classifyTrendProfile(stock, context);

  const snapshot = calcSnapshot(stock, context);
  const eventInfo = calcEventScore(stock, context);
  const event_stock_score = calcEventStockScore(stock, context);

  const stock_bias = getStockBias(stock, context);
  const suggestion = getSuggestion(stock, context);

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
    ret_3m: toNumber(stock.ret_3m, 0),
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

    trend_rate: trendProfile.trend_rate,

    long_trend: trendProfile.long_trend,
    long_trend_label: trendProfile.long_trend_label,
    long_trend_note: trendProfile.long_trend_note,

    mid_trend: trendProfile.mid_trend,
    mid_trend_label: trendProfile.mid_trend_label,
    mid_trend_note: trendProfile.mid_trend_note,

    trend_profile: trendProfile.trend_profile,
    trend_profile_label: trendProfile.trend_profile_label,
    trend_profile_note: trendProfile.trend_profile_note,

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
