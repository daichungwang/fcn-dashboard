// ==========================================
// M7 Runtime Engine FINAL NORMALIZED + U7 PRO
// 保留原本評分 / 估值 / 曝險 / scoreboard
// 新增：
// 1. 四池 today_highlight_pool / watch_pool / simulation_pool / reject_pool
// 2. pool_rules
// 3. pool_summary
// 4. reject_type / reject_reasons / pool_reason
// 5. trendRaw / snapshot / growth / growthScore 透明欄位
// 6. 不動原本 aggressive_recommend / watch_list / remove_list / all
// ==========================================
// 振宇 FCN 系統
// Proprietary System - All Rights Reserved
// Unauthorized copying or commercial use is prohibited
// All rights reserved by Gaya.Wang
// ==========================================
// ==========================================

import fs from "fs";
import path from "path";

const INPUT_FILE = path.resolve("./data/m7/m7_fundamental_data.json");
const M2_FILE = path.resolve("./data/m7/m2_stock_exposure.json");
const OUTPUT_FILE = path.resolve("./data/m7/m7_new_stock_today.json");
const SCOREBOARD_FILE = path.resolve("./data/m7/m7_scoreboard.json");

// ------------------------------------------
// 工具
// ------------------------------------------
function toArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw?.data && Array.isArray(raw.data)) return raw.data;
  if (raw?.data && typeof raw.data === "object") return Object.values(raw.data);
  return [];
}

function safeNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(v, max));
}

function getArrow(v) {
  if (v === null || v === undefined) return "未知";
  return v >= 0 ? "↑" : "↓";
}

// ------------------------------------------
// 讀取 M2 曝險資料
// ------------------------------------------
function loadM2Exposure() {
  if (!fs.existsSync(M2_FILE)) {
    return {
      generated_at: null,
      total_invested: 0,
      stocks: {}
    };
  }

  const raw = JSON.parse(fs.readFileSync(M2_FILE, "utf-8"));
  return {
    generated_at: raw.generated_at || null,
    total_invested: safeNum(raw.total_invested, 0),
    stocks: raw.stocks || {}
  };
}

// ------------------------------------------
// 類別 / valuation class / anchor
// ------------------------------------------
const VALUATION_OVERRIDE = {
  MSFT: { valuation_class: "AI_PLATFORM_CORE", anchor_pe: 34 },
  META: { valuation_class: "AI_PLATFORM_CORE", anchor_pe: 34 },
  GOOG: { valuation_class: "AI_PLATFORM_CORE", anchor_pe: 35 },
  AMZN: { valuation_class: "PLATFORM_MIXED", anchor_pe: 28 },
  AAPL: { valuation_class: "CONSUMER_PLATFORM", anchor_pe: 34 },

  NVDA: { valuation_class: "AI_SEMI_LEADER", anchor_pe: 27 },
  AVGO: { valuation_class: "AI_SEMI_LEADER", anchor_pe: 35 },
  ARM: { valuation_class: "AI_SEMI_LEADER", anchor_pe: 30 },

  TSM: { valuation_class: "AI_SEMI_CYCLICAL", anchor_pe: 30 },
  AMAT: { valuation_class: "AI_SEMI_CYCLICAL", anchor_pe: 26 },
  AMD: { valuation_class: "AI_SEMI_CYCLICAL", anchor_pe: 22 },
  MU: { valuation_class: "AI_SEMI_CYCLICAL", anchor_pe: 20 },
  MRVL: { valuation_class: "AI_SEMI_CYCLICAL", anchor_pe: 22 },

  BAC: { valuation_class: "FINANCIAL", anchor_pe: 10 },
  LQD: { valuation_class: "ETF_INCOME", anchor_pe: 22 },
  QQQ: { valuation_class: "ETF_GROWTH", anchor_pe: 26 },

  AAL: { valuation_class: "CYCLICAL", anchor_pe: 12 },
  CCL: { valuation_class: "CYCLICAL", anchor_pe: 12 },
  LVS: { valuation_class: "CYCLICAL", anchor_pe: 15 },

  COIN: { valuation_class: "SPECULATIVE", anchor_pe: 18 },
  SOFI: { valuation_class: "SPECULATIVE", anchor_pe: 18 },
  ALAB: { valuation_class: "SPECULATIVE", anchor_pe: 18 },
  CRDO: { valuation_class: "SPECULATIVE", anchor_pe: 18 },
  TGT: { valuation_class: "INCOME", anchor_pe: 13 },
  COST: { valuation_class: "INCOME", anchor_pe: 18 },
  TSLA: { valuation_class: "SPECULATIVE", anchor_pe: 20 },
  PLTR: { valuation_class: "SPECULATIVE", anchor_pe: 22 }
};

function inferCategory(row) {
  const symbol = row.symbol || "";
  const sector = row.sector || "";
  const subsector = row.subsector || "";

  if (["COIN", "SOFI", "ALAB", "CRDO", "TSLA", "PLTR"].includes(symbol)) {
    return "speculative";
  }

  if (["AAL", "CCL", "LVS", "MGM"].includes(symbol)) {
    return "cyclical_high_beta";
  }

  if (sector === "FINANCIAL") return "income";
  if (sector === "ETF") return "income";
  if (sector === "DEFENSIVE") return "defensive";
  if (
    sector === "TRAVEL" ||
    subsector === "AIRLINE" ||
    subsector === "CRUISE" ||
    subsector === "CASINO"
  ) {
    return "cyclical_high_beta";
  }

  return "core";
}

function inferValuationClass(row, category) {
  const symbol = row.symbol || "";
  const sector = row.sector || "";
  const subsector = row.subsector || "";

  if (VALUATION_OVERRIDE[symbol]?.valuation_class) {
    return VALUATION_OVERRIDE[symbol].valuation_class;
  }

  if (category === "speculative") return "SPECULATIVE";
  if (category === "cyclical_high_beta") return "CYCLICAL";
  if (category === "defensive") return "DEFENSIVE";
  if (category === "income") {
    if (sector === "FINANCIAL") return "FINANCIAL";
    return "ETF_INCOME";
  }

  if (sector === "AI_APPLICATION") return "AI_PLATFORM_CORE";
  if (sector === "PLATFORM") return "CONSUMER_PLATFORM";

  if (sector === "AI_SEMI") {
    if (subsector === "GPU" || subsector === "ASIC" || subsector === "HBM") {
      return "AI_SEMI_LEADER";
    }
    return "AI_SEMI_CYCLICAL";
  }

  return "CORE_GENERIC";
}

function getAnchorPE(row, category) {
  const symbol = row.symbol || "";
  const vClass = inferValuationClass(row, category);

  if (VALUATION_OVERRIDE[symbol]?.anchor_pe) {
    return VALUATION_OVERRIDE[symbol].anchor_pe;
  }

  const anchorMap = {
    AI_PLATFORM_CORE: 32,
    CONSUMER_PLATFORM: 26,
    PLATFORM_MIXED: 28,
    AI_SEMI_LEADER: 25,
    AI_SEMI_CYCLICAL: 22,
    DEFENSIVE: 22,
    FINANCIAL: 10,
    CYCLICAL: 12,
    SPECULATIVE: 18,
    ETF_INCOME: 20,
    ETF_GROWTH: 25,
    CORE_GENERIC: 20
  };

  return anchorMap[vClass] || 20;
}

function calcCategoryBonus(category) {
  if (category === "core") return 2;
  if (category === "defensive") return 1;
  if (category === "income") return 0.5;
  if (category === "cyclical_high_beta") return -0.2;
  if (category === "speculative") return -0.5;
  return 0;
}

// ------------------------------------------
// 品質 bonus / quality factor
// ------------------------------------------
function calcQualityBonus(qualityLevel, riskLevel) {
  let bonus = 0;

  if (qualityLevel === "高") bonus += 2;
  else if (qualityLevel === "中") bonus += 1;
  else bonus -= 1;

  if (riskLevel === "高") bonus -= 1;
  else if (riskLevel === "低") bonus += 0.5;

  return clamp(bonus, -2, 2);
}

function calcQualityMomentum(r1m, r3m, r6m, r12m) {
  return (
    0.1 * (r1m ?? 0) +
    0.15 * (r3m ?? 0) +
    0.25 * (r6m ?? 0) +
    0.5 * (r12m ?? 0)
  );
}

function calcQualityFactor(q) {
  if (q >= 30) return 1.20;
  if (q >= 20) return 1.00 + (q - 20) * 0.02;
  if (q >= 10) return 0.80 + (q - 10) * 0.02;
  return 0.80;
}

// ------------------------------------------
// 估值
// ------------------------------------------
function inferValuationModel(row) {
  const sector = row.sector || "";
  if (sector === "ETF") return "ETF";

  const price = safeNum(row.price, null);
  const epsNow = safeNum(row.eps_now, null);
  const epsNext = safeNum(row.eps_next, null);

  if (price !== null && epsNow !== null && epsNext !== null && epsNow > 0 && epsNext > 0) {
    const growth = ((epsNext / epsNow) - 1) * 100;
    if (growth > 0) return "PEG";
    return "PE";
  }

  return "NON_PEG";
}

function peScoreFromRatio(peRatio) {
  if (peRatio === null || peRatio === undefined) return 20;

  if (peRatio <= 0.7) return 34;
  if (peRatio <= 0.8) return 32 + (0.8 - peRatio) * 20;
  if (peRatio <= 0.9) return 28 + (0.9 - peRatio) * 40;
  if (peRatio <= 1.1) return 20 - (peRatio - 1.0) * 80;
  if (peRatio <= 1.2) return 12 - (peRatio - 1.1) * 40;
  if (peRatio <= 1.3) return 8 - (peRatio - 1.2) * 20;
  return 6;
}

function growthScoreBase(growth) {
  if (growth === null || growth === undefined) return 3;

  if (growth <= -30) return 0;

  if (growth <= -20) return 1 + (growth + 20) * 0.1;
  if (growth <= -10) return 2 + (growth + 10) * 0.1;
  if (growth <= 0) return 3 + growth * 0.1;

  if (growth <= 10) return 3 + 0.3 * growth;

  if (growth <= 20) {
    const x = growth - 10;
    return 6 + 6.5 * Math.pow(x / 10, 1.2);
  }

  if (growth <= 27) {
    const x = growth - 20;
    return 14 + 5 * Math.pow((x * 1.1) / 10, 1.6);
  }

  return Math.min(25, 19.4 + 0.8 * Math.sqrt(growth - 27));
}

function growthScoreFinal(growth) {
  const base = 3;
  const oldScore = growthScoreBase(growth);

  if (growth === null || growth === undefined) return base;
  if (growth >= 0) return oldScore;

  return base + 0.5 * (oldScore - base);
}

function buildValuationData(row, category) {
  const model = inferValuationModel(row);
  const price = safeNum(row.price, null);
  const epsNow = safeNum(row.eps_now, null);
  const epsNext = safeNum(row.eps_next, null);
  const r1m = safeNum(row.ret_1m, 0);
  const r3m = safeNum(row.ret_3m, 0);
  const r6m = safeNum(row.ret_6m, 0);
  const r12m = safeNum(row.ret_12m, 0);

  let peForward = null;
  let growth = null;
  let peg = null;
  let peRatio = null;

  const anchorPE = getAnchorPE(row, category);

  if (price !== null && epsNext !== null && epsNext > 0) {
    peForward = price / epsNext;
    peRatio = peForward / anchorPE;
  }

  if (epsNow !== null && epsNext !== null && epsNow > 0 && epsNext > 0) {
    growth = ((epsNext / epsNow) - 1) * 100;
    if (growth > 0 && peForward !== null) {
      peg = peForward / growth;
    }
  }

  const peScore = peScoreFromRatio(peRatio);
  const growthScore = growthScoreFinal(growth);
  const growthScoreAdj = growthScore * 0.6;

  const qualityMomentum = calcQualityMomentum(r1m, r3m, r6m, r12m);
  const qualityFactor = calcQualityFactor(qualityMomentum);

  const valuationRaw = 4 * (0.7 * peScore + 0.3 * growthScoreAdj) * qualityFactor;
  const valuationNorm = clamp(valuationRaw, 0, 65);

  let level = "中性";
  if (valuationNorm >= 8) level = "合理偏低";
  else if (valuationNorm >= 6.5) level = "合理";
  else if (valuationNorm >= 5) level = "中性";
  else if (valuationNorm >= 3) level = "偏高";
  else level = "高估";

  const vClass = inferValuationClass(row, category);

  const text =
    `ValuationClass ${vClass}` +
    `，AnchorPE ${anchorPE}` +
    (peForward !== null ? `，Forward PE ${peForward.toFixed(2)}` : "") +
    (peRatio !== null ? `，PE Ratio ${peRatio.toFixed(2)}` : "") +
    (growth !== null ? `，EPS成長 ${growth.toFixed(2)}%` : "") +
    (peg !== null ? `，PEG ${peg.toFixed(2)}` : "") +
    `，QualityMomentum ${qualityMomentum.toFixed(2)}%` +
    `，QualityFactor ${qualityFactor.toFixed(2)}` +
    `，ValuationRaw ${valuationRaw.toFixed(2)}` +
    `，估值判定：${level}`;

  return {
    model,
    valuation_class: vClass,
    peg: round2(peg),
    pe_forward: round2(peForward),
    anchor_pe: round2(anchorPE),
    pe_ratio: round2(peRatio),
    growth: round2(growth),
    pe_score: round2(peScore),
    growth_score: round2(growthScore),
    growth_score_adj: round2(growthScoreAdj),
    quality_momentum: round2(qualityMomentum),
    quality_factor: round2(qualityFactor),
    raw_score: round2(valuationRaw),
    norm_score: round2(valuationNorm),
    level,
    text
  };
}

// ------------------------------------------
// 趨勢 / 結構 / Timing / Money
// ------------------------------------------
function calcTrendRaw(r1m, r3m, r6m, r12m) {
  return (
    0.25 * (r1m ?? 0) +
    0.25 * (r3m ?? 0) +
    0.25 * (r6m ?? 0) +
    0.25 * (r12m ?? 0)
  );
}

function trendScoreFromRawNormalized(trendRaw) {
  if (trendRaw >= 30) return 10;
  if (trendRaw >= 20) return 9;
  if (trendRaw >= 10) return 8;
  if (trendRaw >= 0) return 6;
  if (trendRaw >= -10) return 4;
  if (trendRaw >= -20) return 2;
  return 0;
}

function inferTrendState(trendRaw) {
  if (trendRaw >= 20) return "up_strong";
  if (trendRaw >= 5) return "up_mild";
  if (trendRaw > -10) return "neutral";
  if (trendRaw > -25) return "weak";
  return "down";
}

function calcShortSwing(swingDays, amp1d) {
  const days = Array.isArray(swingDays) ? swingDays : [];
  const d0 = safeNum(days[0], safeNum(amp1d, 0));
  const d1 = safeNum(days[1], 0);
  const d2 = safeNum(days[2], 0);
  const d3 = safeNum(days[3], 0);
  const d4 = safeNum(days[4], 0);
  const d5 = safeNum(days[5], 0);

  return (
    0.2 * d0 +
    0.2 * d1 +
    0.1 * d2 +
    0.1 * d3 +
    0.2 * d4 +
    0.2 * d5
  );
}

function structureScoreFromShortSwing(shortSwing) {
  if (shortSwing < -1) return 0;
  if (shortSwing <= 0) return 3;
  if (shortSwing <= 5) return 1 + 8 * Math.pow(shortSwing / 5, 1.2);
  if (shortSwing <= 10) return 8 + (shortSwing - 5) * 0.4;
  return 10;
}

function inferStructureState(shortSwing) {
  if (shortSwing >= 10) return "sweet_max";
  if (shortSwing >= 5) return "sweet";
  if (shortSwing >= 2) return "building";
  return "flat";
}

function calcSnapshot(r1d, r1w, r1m) {
  return (
    0.45 * (r1d ?? 0) +
    0.35 * (r1w ?? 0) +
    0.2 * (r1m ?? 0)
  );
}

function timingScoreFromSnapshot(snapshot) {
  const score = snapshot * 2;
  return clamp(score, 3, 10);
}

function inferTimingState(snapshot) {
  if (snapshot <= -10) return "very_cold";
  if (snapshot <= -3) return "cold";
  if (snapshot < 3) return "neutral";
  if (snapshot < 10) return "warm";
  return "hot";
}

function calcMoneyScoreNormalized(volumeRatio) {
  const v = safeNum(volumeRatio, 1);
  if (v === null) return 4;
  if (v >= 1.5) return 10;
  if (v >= 1.3) return 9;
  if (v >= 1.2) return 8.5;
  if (v >= 1) return 8;
  if (v >= 0.9) return 7.5;
  if (v >= 0.8) return 7;
  if (v >= 0.6) return 6;
  if (v >= 0.5) return 5;
  if (v >= 0.4) return 4;
  return 2;
}

// ------------------------------------------
// M2 曝險
// ------------------------------------------
function buildExposure(m2Node) {
  const empty = {
    fcn_count: 0,
    invested_amount: 0,
    invested_ratio: 0,
    danger: 0,
    watch: 0,
    healthy: 0,
    avg_score_pure: null,
    avg_score_event: null
  };

  if (!m2Node) return empty;

  return {
    fcn_count: safeNum(m2Node.fcn_count, 0),
    invested_amount: safeNum(m2Node.invested_amount, 0),
    invested_ratio: safeNum(m2Node.invested_ratio, 0),
    danger: safeNum(m2Node.danger, 0),
    watch: safeNum(m2Node.watch, 0),
    healthy: safeNum(m2Node.healthy, 0),
    avg_score_pure: safeNum(m2Node.avg_score_pure, null),
    avg_score_event: safeNum(m2Node.avg_score_event, null)
  };
}

function getExposureBaseline(category) {
  if (category === "core") return { safe: 40, warning: 50 };
  if (category === "defensive") return { safe: 35, warning: 45 };
  if (category === "income") return { safe: 25, warning: 35 };
  return { safe: 20, warning: 30 };
}

function buildExposureWarning(exposure, category) {
  const baseline = getExposureBaseline(category);
  const ratio = safeNum(exposure.invested_ratio, 0);

  let level = "normal";
  let text = `投入比 ${round2(ratio)}%（安全）。`;

  if (ratio > baseline.warning) {
    level = "high";
    text = `投入比 ${round2(ratio)}%（過高），高於 ${category} 類 baseline，建議停止新增並控制集中度。`;
  } else if (ratio > baseline.safe) {
    level = "medium";
    text = `投入比 ${round2(ratio)}%（偏高），已高於 ${category} 類安全 baseline，建議保守處理。`;
  }

  if (exposure.danger > 0) {
    level = "high";
    text = `目前已有 Danger 持倉 ${exposure.danger} 檔，且投入比 ${round2(ratio)}%，應先風控。`;
  }

  return { level, text, baseline };
}

// ------------------------------------------
// 最終總分
// ------------------------------------------
function buildFinalScore({
  valuationNorm,
  trendNorm,
  structureNorm,
  timingNorm,
  moneyNorm,
  qualityBonus,
  categoryBonus
}) {
  const total =
    valuationNorm +
    0.8 * trendNorm +
    0.8 * structureNorm +
    timingNorm +
    moneyNorm +
    qualityBonus +
    categoryBonus;

  return round2(total);
}

// ------------------------------------------
// 動作 / highlight / 說明
// ------------------------------------------
function buildAction(row, metrics) {
  const category = row.category || inferCategory(row);

  const trendState = metrics.trendState;
  const timingState = metrics.timingState;
  const exposureWarning = metrics.exposureWarning || { level: "normal" };
  const exposure = metrics.exposure || {};

  const total = safeNum(metrics.total, 0);
  const valuationScore = safeNum(metrics.valuationScore, 0);
  const trendScore = safeNum(metrics.trendScore, 0);
  const structureScore = safeNum(metrics.structureScore, 0);
  const timingScore = safeNum(metrics.timingScore, 0);
  const moneyScore = safeNum(metrics.moneyScore, 0);

  const dangerCount = safeNum(exposure.danger, 0);
  const exposureLevel = exposureWarning.level || "normal";

  if (category === "speculative") return "移除";
  if (trendState === "down") return "移除";
  if (exposureLevel === "high" && dangerCount > 0) return "移除";
  if (structureScore < 5 && timingState === "hot") return "移除";
  if (valuationScore < 4.5) return "移除";
  if (structureScore < 4.5) return "移除";
  if (total < 6.2) return "移除";

  const passAggressive =
    total >= 8.5 &&
    valuationScore >= 6 &&
    trendScore >= 6 &&
    structureScore >= 6.5 &&
    timingScore >= 5.5 &&
    moneyScore >= 6 &&
    exposureLevel !== "high";

  if (passAggressive) return "加入";

  const passWatch =
    total >= 6.2 &&
    trendState !== "down";

  if (passWatch) return "觀察";

  return "移除";
}

function buildUIBucket(action) {
  if (action === "加入") return "積極推薦";
  if (action === "觀察") return "觀察名單";
  return "建議剔除";
}

function evaluateTodayHighlight(candidate) {
  const reasons = [];
  const trend = candidate["趨勢判讀"] || {};

  const notDown = trend["趨勢狀態"] !== "down";
  const structureGood =
    trend["結構狀態"] === "sweet" ||
    trend["結構狀態"] === "sweet_max";
  const timingGood = safeNum(candidate["timing_score"], 0) >= 6;
  const exposureOk = (candidate["曝險警示"]?.level || "normal") !== "high";
  const valuationOk = safeNum(candidate["valuation_score"], 0) >= 5.5;

  if (notDown) reasons.push("趨勢未轉空");
  if (structureGood) reasons.push("結構夠甜");
  if (timingGood) reasons.push("時機偏正");
  if (valuationOk) reasons.push("估值合理");
  if (exposureOk) reasons.push("曝險可控");

  const highlight =
    notDown &&
    structureGood &&
    timingGood &&
    valuationOk &&
    exposureOk;

  return {
    is_today_highlight: highlight,
    today_highlight_reason: reasons.join(" / ")
  };
}

function buildWhyYes(row, valuation, trendState, structureState, timingScore, moneyScore, qualityBonus) {
  const arr = [];
  if ((row.category || inferCategory(row)) === "core") arr.push("核心股");
  if (qualityBonus >= 1.5) arr.push("品質佳");
  if (valuation.norm_score >= 6.5) arr.push("估值合理");
  if (trendState === "up_strong" || trendState === "up_mild") arr.push("中期趨勢健康");
  if (structureState === "sweet" || structureState === "sweet_max") arr.push("價格已有甜度");
  if (timingScore >= 6) arr.push("短線節奏偏佳");
  if (moneyScore >= 8) arr.push("資金支持");
  return arr;
}

function buildWhyNo(row, valuation, trendState, structureState, timingState, moneyScore, exposureWarning) {
  const arr = [];
  if (valuation.pe_ratio !== null && valuation.pe_ratio > 1.2) arr.push("PE 相對偏貴");
  if (valuation.growth !== null && valuation.growth < 0) arr.push("EPS 預估衰退");
  if (trendState === "down") arr.push("趨勢轉弱");
  if (trendState === "weak") arr.push("中期偏弱");
  if (structureState === "flat") arr.push("結構不甜");
  if (timingState === "hot") arr.push("短期偏熱");
  if (moneyScore <= 2) arr.push(`量比 ${row.volume_ratio ?? "--"} 偏低`);
  if ((row.category || inferCategory(row)) === "speculative") arr.push("投機股不適合 FCN");
  if (exposureWarning.level === "high") arr.push("現有曝險偏高");
  return arr;
}

function buildFinalComment(action, valuation, trendRaw, trendState, shortSwing, snapshot, moneyScore, exposureWarning) {
  const parts = [];

  parts.push(`趨勢面：TrendRaw ${round2(trendRaw)}，狀態 ${trendState}。`);
  parts.push(`結構面：ShortSwing ${round2(shortSwing)}，甜度已反映。`);
  parts.push(`時機面：Snapshot ${round2(snapshot)}。`);
  parts.push(`估值面：${valuation.text}。`);

  if (moneyScore <= 2) parts.push("資金面偏弱。");
  else if (moneyScore >= 8) parts.push("資金面尚可。");

  if (exposureWarning?.text) parts.push(`持倉面：${exposureWarning.text}`);

  if (action === "加入") parts.push("整體條件支持，可列入 FCN 候選。");
  else if (action === "觀察") parts.push("條件部分符合，但仍需等待更佳位置。");
  else parts.push("目前不適合做 FCN。");

  return parts.join("");
}

// ------------------------------------------
// U7：四池規則
// ------------------------------------------
function buildPoolRules() {
  return {
    reject_pool: {
      purpose: "真的不做，不進 FCN simulation",
      formula: {
        attributeReject: 'category === "speculative"',
        badCount: "Number(trendTerrible) + Number(snapshotTerrible) + Number(growthTerrible)",
        quantReject: "badCount >= 2"
      },
      params: {
        trendTerrible: "trendRaw <= -15 OR trendScore <= 2",
        snapshotTerrible: "snapshot <= -3",
        growthTerrible: "growthScore <= 2"
      }
    },
    simulation_pool: {
      purpose: "M8 / U8 原料池",
      formula: {
        simulationPool: "非 reject 股票，依 today_score 排序"
      },
      params: {
        floor: 12,
        cap: 18,
        currentCap: 15
      }
    },
    today_highlight_pool: {
      purpose: "今日優先看、優先配 basket",
      formula: {
        todayHighlight:
          'inSimulationPool && structureState !== "flat" && timingState !== "hot" && exposureLevel !== "high"'
      },
      params: {
        topN: 5
      }
    },
    watch_pool: {
      purpose: "可做、可追蹤，但今天不優先",
      formula: {
        watchPool: "simulationPool - todayHighlightPool"
      },
      params: {}
    }
  };
}

function evaluateRejectMeta(candidate) {
  const category = candidate["分類"];
  const trendRaw = safeNum(candidate["trendRaw"], 0);
  const trendScore = safeNum(candidate["trend_score"], 0);
  const snapshot = safeNum(candidate["snapshot"], 0);
  const growthScore = safeNum(candidate["growthScore"], 0);

  const trendTerrible = trendRaw <= -15 || trendScore <= 2;
  const snapshotTerrible = snapshot <= -3;
  const growthTerrible = growthScore <= 2;
  const badCount =
    Number(trendTerrible) +
    Number(snapshotTerrible) +
    Number(growthTerrible);

  const attributeReject = category === "speculative";
  const quantReject = badCount >= 2;

  if (attributeReject) {
    return {
      reject_type: "attribute",
      reject_reasons: ["speculative，不符合 FCN 可接原則"],
      badCount,
      trendTerrible,
      snapshotTerrible,
      growthTerrible,
      attributeReject,
      quantReject
    };
  }

  if (quantReject) {
    const reasons = [];
    if (trendTerrible) reasons.push("Trend terrible");
    if (snapshotTerrible) reasons.push("Snapshot terrible");
    if (growthTerrible) reasons.push("GrowthScore terrible");

    return {
      reject_type: "quant",
      reject_reasons: reasons,
      badCount,
      trendTerrible,
      snapshotTerrible,
      growthTerrible,
      attributeReject,
      quantReject
    };
  }

  return {
    reject_type: null,
    reject_reasons: [],
    badCount,
    trendTerrible,
    snapshotTerrible,
    growthTerrible,
    attributeReject,
    quantReject
  };
}

function buildPoolReason(candidate, simulationSymbols, highlightSymbols) {
  const symbol = candidate["股號"];
  const rejectType = candidate["reject_type"];
  const rejectReasons = candidate["reject_reasons"] || [];

  if (rejectType) {
    return {
      pool: "reject_pool",
      reason_summary:
        rejectType === "attribute"
          ? "屬性型 Reject：本質不適合 FCN"
          : "數值型 Reject：中期 / 短線 / 成長風險過多",
      detail: rejectReasons
    };
  }

  if (highlightSymbols.has(symbol)) {
    return {
      pool: "today_highlight_pool",
      reason_summary: "Simulation 前段 + 結構非 flat + timing 非 hot + 曝險非高",
      detail: [
        'structureState !== "flat"',
        'timingState !== "hot"',
        'exposureLevel !== "high"',
        "today_score 排名前段"
      ]
    };
  }

  if (simulationSymbols.has(symbol)) {
    return {
      pool: "watch_pool",
      reason_summary: "已進 simulation，但今日不是最優先",
      detail: [
        "可做但今天不一定最甜",
        "或結構 / timing / 曝險條件未達 highlight"
      ]
    };
  }

  return {
    pool: "other",
    reason_summary: "未進 simulation 前段",
    detail: ["today_score 未進 simulation 排名前段"]
  };
}

// ------------------------------------------
// score board
// ------------------------------------------
function buildScoreboard(sortedRows) {
  const makeTable = (key) =>
    [...sortedRows]
      .sort((a, b) => (b["分數拆解"]?.[key] ?? 0) - (a["分數拆解"]?.[key] ?? 0))
      .map((x, i) => ({
        rank: i + 1,
        symbol: x["股號"],
        name: x["股名"],
        score: x["分數拆解"]?.[key] ?? 0
      }));

  return {
    generated_at: new Date().toISOString(),
    formula: {
      valuation: "Valuation = (0.6 * peScore + 0.4 * growthScore_adj) * qualityFactor ",
      trend: "trendRaw = 0.25*1M + 0.25*3M + 0.25*6M + 0.25*12M ; bucket normalize to 0~10",
      structure: "ShortSwing = 0.2*d0 + 0.2*d1 + 0.1*d2 + 0.1*d3 + 0.2*d4 + 0.2*d5 ; map to 0~10",
      timing: "snapshot = 0.45*r1d + 0.35*r1w + 0.2*r1m",
      money: "volume_ratio -> 0~10",
      final: "valuation + 0.8*trend + 0.8*structure + timing + money + quality_bonus + category_bonus"
    },
    examples: {
      valuation_demo_1: "AAPL 31.2 = (0.6*30 + 0.4*20) * 1.2 // 示意",
      valuation_demo_2: "MSFT 28.2 = (0.6*28 + 0.4*18) * 1.17 // 示意"
    },
    tables: {
      valuation: makeTable("估值分"),
      trend: makeTable("趨勢分"),
      structure: makeTable("結構分"),
      timing: makeTable("時機分"),
      money: makeTable("資金分"),
      final: makeTable("總分")
    }
  };
}

// ------------------------------------------
// 主流程
// ------------------------------------------
function run() {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error("找不到 m7_fundamental_data.json");
  }

  const raw = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  const rows = toArray(raw);
  const m2 = loadM2Exposure();

  const result = rows.map((row) => {
    const r1d = safeNum(row.ret_1d, safeNum(row.amp_1d, 0));
    const r1w = safeNum(row.ret_1w, null);
    const r1m = safeNum(row.ret_1m, null);
    const r3m = safeNum(row.ret_3m, null);
    const r6m = safeNum(row.ret_6m, null);
    const r12m = safeNum(row.ret_12m, null);
    const vol = safeNum(row.volume_ratio, null);

    const category = row.category || inferCategory(row);
    row.category = category;

    const qualityBonus = calcQualityBonus(row.quality_level, row.risk_level);
    const categoryBonus = calcCategoryBonus(category);

    const valuation = buildValuationData(row, category);

    const trendRaw = calcTrendRaw(r1m ?? 0, r3m ?? 0, r6m ?? 0, r12m ?? 0);
    const trendNorm = trendScoreFromRawNormalized(trendRaw);
    const trendState = inferTrendState(trendRaw);

    const shortSwing = calcShortSwing(row.swing_days, row.amp_1d);
    const structureNorm = structureScoreFromShortSwing(shortSwing);
    const structureState = inferStructureState(shortSwing);

    const snapshot = calcSnapshot(r1d ?? 0, r1w ?? 0, r1m ?? 0);
    const timingNorm = timingScoreFromSnapshot(snapshot);
    const timingState = inferTimingState(snapshot);

    const moneyNorm = calcMoneyScoreNormalized(vol);

    const total = buildFinalScore({
      valuationNorm: valuation.norm_score,
      trendNorm,
      structureNorm,
      timingNorm,
      moneyNorm,
      qualityBonus,
      categoryBonus
    });

    const exposure = buildExposure(m2.stocks?.[row.symbol]);
    const exposureWarning = buildExposureWarning(exposure, category);

    const action = buildAction(row, {
      total,
      valuationScore: valuation.norm_score,
      trendScore: trendNorm,
      structureScore: structureNorm,
      timingScore: timingNorm,
      moneyScore: moneyNorm,
      trendState,
      timingState,
      exposureWarning,
      exposure
    });

    const candidate = {
      "股號": row.symbol,
      "股名": row.name,
      "產業": row.sector,
      "子產業": row.subsector,
      "分類": category,
      "估值模型": valuation.model,
      "風險等級": row.risk_level,

      "股價": round2(row.price),
      "PEG": round2(valuation.peg),
      "1日漲跌幅": round2(r1d),
      "1週漲跌幅": round2(r1w),
      "1月漲跌幅": round2(r1m),
      "3月漲跌幅": round2(r3m),
      "6月漲跌幅": round2(r6m),
      "12月漲跌幅": round2(r12m),
      "量比": round2(vol),

      "valuation_score": round2(valuation.norm_score),
      "trend_score": round2(trendNorm),
      "structure_score": round2(structureNorm),
      "timing_score": round2(timingNorm),
      "money_score": round2(moneyNorm),
      "quality_score": round2(qualityBonus),
      "category_adjust": round2(categoryBonus),

      "today_score": round2(total),

      "trendRaw": round2(trendRaw),
      "snapshot": round2(snapshot),
      "growth": round2(valuation.growth),
      "growthScore": round2(valuation.growth_score),

      "趨勢判讀": {
        "年線": getArrow(r12m),
        "6月線": getArrow(r6m),
        "3月線": getArrow(r3m),
        "月線": getArrow(r1m),
        "趨勢狀態": trendState,
        "結構狀態": structureState,
        "時機狀態": timingState
      },

      "估值資料": {
        "ValuationClass": valuation.valuation_class,
        "PEG": valuation.peg,
        "ForwardPE": valuation.pe_forward,
        "AnchorPE": valuation.anchor_pe,
        "PERatio": valuation.pe_ratio,
        "EPS成長率": valuation.growth,
        "PEScore": valuation.pe_score,
        "GrowthScore": valuation.growth_score,
        "GrowthScoreAdj": valuation.growth_score_adj,
        "QualityMomentum": valuation.quality_momentum,
        "QualityFactor": valuation.quality_factor,
        "ValuationRaw": valuation.raw_score
      },

      "結構資料": {
        "swing_days": Array.isArray(row.swing_days) ? row.swing_days : [],
        "amp_1d": round2(row.amp_1d),
        "ShortSwing": round2(shortSwing)
      },

      "時機資料": {
        "Snapshot": round2(snapshot)
      },

      "分數拆解": {
        "估值原始分": round2(valuation.raw_score),
        "估值分": round2(valuation.norm_score),
        "趨勢分": round2(trendNorm),
        "結構分": round2(structureNorm),
        "時機分": round2(timingNorm),
        "資金分": round2(moneyNorm),
        "品質分": round2(qualityBonus),
        "類別調整": round2(categoryBonus),
        "總分": round2(total)
      },

      "持倉曝險": {
        "FCN數量": exposure.fcn_count,
        "投入金額": exposure.invested_amount,
        "投入資金比": round2(exposure.invested_ratio),
        "Danger": exposure.danger,
        "Watch": exposure.watch,
        "Healthy": exposure.healthy,
        "Pure平均": exposure.avg_score_pure,
        "Event平均": exposure.avg_score_event
      },

      "曝險警示": exposureWarning,

      "建議動作": action,
      "ui_bucket": buildUIBucket(action)
    };

    const rejectMeta = evaluateRejectMeta(candidate);
    candidate.reject_type = rejectMeta.reject_type;
    candidate.reject_reasons = rejectMeta.reject_reasons;
    candidate.badCount = rejectMeta.badCount;
    candidate.trendTerrible = rejectMeta.trendTerrible;
    candidate.snapshotTerrible = rejectMeta.snapshotTerrible;
    candidate.growthTerrible = rejectMeta.growthTerrible;
    candidate.attributeReject = rejectMeta.attributeReject;
    candidate.quantReject = rejectMeta.quantReject;

    const highlight = evaluateTodayHighlight(candidate);
    candidate.is_today_highlight = highlight.is_today_highlight;
    candidate.today_highlight_reason = highlight.today_highlight_reason;

    candidate.why_yes = buildWhyYes(
      row,
      valuation,
      trendState,
      structureState,
      timingNorm,
      moneyNorm,
      qualityBonus
    );

    candidate.why_no = buildWhyNo(
      row,
      valuation,
      trendState,
      structureState,
      timingState,
      moneyNorm,
      exposureWarning
    );

    candidate["估值說明"] = valuation.text;
    candidate["最終說明"] = buildFinalComment(
      action,
      valuation,
      trendRaw,
      trendState,
      shortSwing,
      snapshot,
      moneyNorm,
      exposureWarning
    );

    return candidate;
  });

  const sorted = result
    .filter((x) => x["股號"])
    .sort((a, b) => {
      return (b.is_today_highlight === true) - (a.is_today_highlight === true)
        || b.today_score - a.today_score;
    })
    .map((x, i) => ({
      "排名": i + 1,
      ...x
    }));

  const aggressiveRecommend = sorted.filter(x => x.ui_bucket === "積極推薦");
  const watchBucket = sorted.filter(x => x.ui_bucket === "觀察名單");
  const removeBucket = sorted.filter(x => x.ui_bucket === "建議剔除");

  const rejectPool = sorted.filter(x => !!x.reject_type);

  const simulationPool = sorted
    .filter(x => !x.reject_type)
    .sort((a, b) => b.today_score - a.today_score)
    .slice(0, 15);

  const todayHighlightPool = simulationPool
    .filter(x =>
      x["趨勢判讀"]?.["結構狀態"] !== "flat" &&
      x["趨勢判讀"]?.["時機狀態"] !== "hot" &&
      (x["曝險警示"]?.level || "normal") !== "high"
    )
    .sort((a, b) => b.today_score - a.today_score)
    .slice(0, 5);

  const highlightSymbols = new Set(todayHighlightPool.map(x => x["股號"]));
  const simulationSymbols = new Set(simulationPool.map(x => x["股號"]));

  const watchPool = simulationPool.filter(x => !highlightSymbols.has(x["股號"]));

  const decoratedAll = sorted.map((x) => {
    return {
      ...x,
      pool_reason: buildPoolReason(x, simulationSymbols, highlightSymbols)
    };
  });

  const poolRules = buildPoolRules();

  const output = {
    generated_at: new Date().toISOString(),
    m2_generated_at: m2.generated_at,
    total_count: decoratedAll.length,

    sweet_count: decoratedAll.filter(x =>
      x["趨勢判讀"]?.["結構狀態"] === "sweet" ||
      x["趨勢判讀"]?.["結構狀態"] === "sweet_max"
    ).length,
    hot_timing_count: decoratedAll.filter(x => x["趨勢判讀"]?.["時機狀態"] === "hot").length,
    downtrend_count: decoratedAll.filter(x => x["趨勢判讀"]?.["趨勢狀態"] === "down").length,

    high_exposure: decoratedAll.filter(x => x["曝險警示"]?.level === "high").length,
    mid_exposure: decoratedAll.filter(x => x["曝險警示"]?.level === "medium").length,

    market_comment:
      `甜點結構 ${decoratedAll.filter(x =>
        x["趨勢判讀"]?.["結構狀態"] === "sweet" ||
        x["趨勢判讀"]?.["結構狀態"] === "sweet_max"
      ).length} 檔，` +
      `下行趨勢 ${decoratedAll.filter(x =>
        x["趨勢判讀"]?.["趨勢狀態"] === "down"
      ).length} 檔，` +
      `今日宜重估值、重甜點、輕追價。`,

    pool_rules: poolRules,
    pool_summary: {
      today_highlight_count: todayHighlightPool.length,
      watch_count: watchPool.length,
      simulation_count: simulationPool.length,
      reject_count: rejectPool.length
    },

    today_highlight_pool: todayHighlightPool.map(x => ({
      ...x,
      pool_reason: buildPoolReason(x, simulationSymbols, highlightSymbols)
    })),
    watch_pool: watchPool.map(x => ({
      ...x,
      pool_reason: buildPoolReason(x, simulationSymbols, highlightSymbols)
    })),
    simulation_pool: simulationPool.map(x => ({
      ...x,
      pool_reason: buildPoolReason(x, simulationSymbols, highlightSymbols)
    })),
    reject_pool: rejectPool.map(x => ({
      ...x,
      pool_reason: buildPoolReason(x, simulationSymbols, highlightSymbols)
    })),

    aggressive_recommend: aggressiveRecommend,
    watch_list: watchBucket,
    remove_list: removeBucket,

    all: decoratedAll
  };

  const scoreboard = buildScoreboard(decoratedAll);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");
  fs.writeFileSync(SCOREBOARD_FILE, JSON.stringify(scoreboard, null, 2), "utf-8");

  console.log(`✅ m7_new_stock_today.json 已產出，共 ${decoratedAll.length} 檔`);
  console.log(`✅ m7_scoreboard.json 已產出`);
  console.log(`✅ U7 四池已加入：highlight ${todayHighlightPool.length} / watch ${watchPool.length} / sim ${simulationPool.length} / reject ${rejectPool.length}`);
}

run();
