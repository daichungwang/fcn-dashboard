// ==========================================
// M7 Runtime Engine FINAL + M2 Exposure + Today Highlight
// 讀取：
//   data/m7/m7_new_stock_pool.json
//   data/m7/m2_stock_exposure.json
// 輸出：
//   data/m7/m7_new_stock_today.json
// ==========================================

import fs from "fs";
import path from "path";

const INPUT_FILE = path.resolve("./data/m7/m7_new_stock_pool.json");
const M2_FILE = path.resolve("./data/m7/m2_stock_exposure.json");
const OUTPUT_FILE = path.resolve("./data/m7/m7_new_stock_today.json");

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
// 估值
// ------------------------------------------
function buildValuationData(row) {
  const model = row.valuation_model || "PEG";
  const peg = safeNum(row["PEG"], null);
  const price = safeNum(row["現價"], null);
  const epsNow = safeNum(row["目前EPS"], null);
  const epsNext = safeNum(row["明年EPS"], null);

  let peForward = null;
  let growth = null;
  let score = 15;
  let level = "中性";
  let text = "資料不足";

  if (price !== null && epsNext !== null && epsNext > 0) {
    peForward = price / epsNext;
  }

  if (epsNow !== null && epsNext !== null && epsNow > 0 && epsNext > 0) {
    growth = ((epsNext / epsNow) - 1) * 100;
  }

  if (model === "PEG") {
    if (peg === null) {
      score = 10;
      level = "資料不足";
      text = "PEG 資料不足";
    } else if (peg < 0.8) {
      score = 40;
      level = "低估";
    } else if (peg <= 1.0) {
      score = 34;
      level = "合理偏低";
    } else if (peg <= 1.2) {
      score = 28;
      level = "合理";
    } else if (peg <= 1.5) {
      score = 20;
      level = "偏貴";
    } else if (peg <= 2.0) {
      score = 10;
      level = "偏高";
    } else {
      score = 0;
      level = "高估";
    }

    if (peg !== null) {
      text =
        `PEG ${peg.toFixed(2)}（${level}）` +
        (peForward !== null ? `，Forward PE ${peForward.toFixed(1)}` : "") +
        (growth !== null ? `，EPS成長 ${growth.toFixed(1)}%` : "");
    }
  } else if (model === "NON_PEG") {
    score = 20;
    level = "中性估值";
    text =
      `非 PEG 類股，採中性估值` +
      (peForward !== null ? `，Forward PE ${peForward.toFixed(1)}` : "") +
      (growth !== null ? `，EPS成長 ${growth.toFixed(1)}%` : "");
  } else if (model === "PE") {
    score = 18;
    level = "中性偏保守";
    text =
      `PE 類股，採中性偏保守估值` +
      (peForward !== null ? `，Forward PE ${peForward.toFixed(1)}` : "") +
      (growth !== null ? `，EPS成長 ${growth.toFixed(1)}%` : "");
  } else if (model === "ETF") {
    score = 15;
    level = "ETF";
    text = "ETF 不適用 PEG，採中性估值";
  }

  return {
    model,
    peg: round2(peg),
    pe_forward: round2(peForward),
    growth: round2(growth),
    level,
    score,
    text
  };
}

// ------------------------------------------
// 趨勢 / 結構 / 溫度
// ------------------------------------------
function getArrow(v) {
  if (v === null || v === undefined) return "未知";
  return v >= 0 ? "↑" : "↓";
}

function buildStructureAnalysis(r12m, r6m, r3m, r1w) {
  const yearArrow = getArrow(r12m);
  const month6Arrow = getArrow(r6m);
  const month3Arrow = getArrow(r3m);
  const weekArrow = getArrow(r1w);

  let trendState = "unknown";
  let structureState = "neutral";
  let timingState = "normal";

  if (r12m === null || r12m === undefined) {
    trendState = "unknown";
  } else if (r12m < 0) {
    trendState = "down";
  } else if (r12m >= 15) {
    trendState = "up_strong";
  } else {
    trendState = "up_mild";
  }

  if (trendState === "down") {
    structureState = "downtrend";
  } else {
    if (r6m > 0 && r3m < 0) {
      structureState = "pullback";
    } else if (r6m > 0 && r3m > 0) {
      structureState = "hot";
    } else if (r6m < 0 && r3m < 0) {
      structureState = "top";
    } else if (r6m < 0 && r3m > 0) {
      structureState = "rebound";
    } else {
      structureState = "neutral";
    }
  }

  if (r1w !== null && r1w !== undefined) {
    if (r1w > 8) timingState = "overheat";
    else if (r1w < -5) timingState = "dip";
  }

  let trendScore = 0;
  if (trendState === "up_strong") trendScore = 30;
  else if (trendState === "up_mild") trendScore = 22;
  else if (trendState === "down") trendScore = 0;
  else trendScore = 10;

  let structureScore = 0;
  if (structureState === "pullback") structureScore = 20;
  else if (structureState === "hot") structureScore = 10;
  else if (structureState === "rebound") structureScore = 4;
  else if (structureState === "top") structureScore = 0;
  else if (structureState === "downtrend") structureScore = 0;
  else structureScore = 6;

  let timingAdjust = 0;
  if (timingState === "dip") timingAdjust = 5;
  else if (timingState === "overheat") timingAdjust = -5;

  let structureText = "";
  if (structureState === "pullback") {
    structureText = "年線仍向上，中期回檔，屬較理想的 FCN 結構。";
  } else if (structureState === "hot") {
    structureText = "長中期結構健康，但位置偏熱，不宜追高。";
  } else if (structureState === "top") {
    structureText = "年線仍高位，但 3M / 6M 同步轉弱，屬明顯做頭，宜按兵不動。";
  } else if (structureState === "downtrend") {
    structureText = "年線下行，長期趨勢已轉弱，不適合做 FCN。";
  } else if (structureState === "rebound") {
    structureText = "中期仍弱，目前偏向弱勢反彈。";
  } else {
    structureText = "結構中性，需搭配其他面向判斷。";
  }

  return {
    year_arrow: yearArrow,
    month6_arrow: month6Arrow,
    month3_arrow: month3Arrow,
    week_arrow: weekArrow,
    trend_state: trendState,
    structure_state: structureState,
    timing_state: timingState,
    trend_score: trendScore,
    structure_score: structureScore,
    timing_adjust: timingAdjust,
    structure_text: structureText
  };
}

// ------------------------------------------
// 資金 / 類別
// ------------------------------------------
function calcMoneyScore(volumeRatio) {
  const v = safeNum(volumeRatio, null);
  if (v === null) return 8;
  if (v >= 1.5) return 20;
  if (v >= 1.2) return 15;
  if (v >= 0.7) return 10;
  return 5;
}

function calcCategoryAdjust(category) {
  let adj = 0;
  if (category === "core") adj += 5;
  if (category === "defensive") adj += 3;
  if (category === "income") adj += 1;
  if (category === "speculative") adj -= 10;
  return adj;
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
  if (category === "growth") return { safe: 25, warning: 35 };
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
// 今日推薦判斷
// 只做標示與排序，不做擋單
// ------------------------------------------
function evaluateTodayHighlight(candidate) {
  const reasons = [];

  const trend = candidate["趨勢判讀"] || {};
  const longUp =
    trend["趨勢狀態"] === "up_strong" || trend["趨勢狀態"] === "up_mild";
  const pullback = trend["結構狀態"] === "pullback";
  const notTop = trend["結構狀態"] !== "top";
  const notDown = trend["趨勢狀態"] !== "down";

  if (longUp) reasons.push("長期趨勢向上");
  if (pullback) reasons.push("中期回檔");
  if (candidate["估值資料"]?.PEG !== null && safeNum(candidate["估值資料"]?.PEG, 999) < 2) {
    reasons.push("估值可接受");
  }
  if ((candidate["曝險警示"]?.level || "normal") !== "high") {
    reasons.push("曝險可控");
  }

  const highlight =
    notDown &&
    notTop &&
    longUp &&
    pullback &&
    (candidate["曝險警示"]?.level || "normal") !== "high";

  return {
    is_today_highlight: highlight,
    today_highlight_reason: reasons.join(" / ")
  };
}

// ------------------------------------------
// 分類分桶
// 不直接擋掉，只分類
// ------------------------------------------
function buildAction(row, structure, total) {
  if (row.category === "speculative") return "移除";
  if (structure.trend_state === "down") return "移除";
  if (structure.structure_state === "top") return "移除";
  if (total >= 75) return "加入";
  if (total >= 55) return "觀察";
  return "移除";
}

function buildUIBucket(action) {
  if (action === "加入") return "積極推薦";
  if (action === "觀察") return "觀察名單";
  return "建議剔除";
}

// ------------------------------------------
// 解釋
// ------------------------------------------
function buildWhyYes(row, valuation, structure, moneyScore, qScore) {
  const arr = [];
  if (row.category === "core") arr.push("核心股");
  if (row.category === "defensive") arr.push("防禦型");
  if (qScore >= 5) arr.push("品質高");
  if (valuation.score >= 28) arr.push("估值合理");
  if (structure.trend_state === "up_strong" || structure.trend_state === "up_mild") arr.push("長期趨勢向上");
  if (structure.structure_state === "pullback") arr.push("中期回檔，價格較合理");
  if (moneyScore >= 15) arr.push("市場資金支持");
  return arr;
}

function buildWhyNo(row, valuation, structure, moneyScore, exposureWarning) {
  const arr = [];
  if (row.valuation_model === "PEG" && valuation.peg !== null && valuation.peg > 1.6) {
    arr.push(`PEG ${valuation.peg} 偏高`);
  }
  if (structure.structure_state === "top") arr.push("3M / 6M 同步轉弱，屬做頭");
  if (structure.trend_state === "down") arr.push("年線下行，長期趨勢不佳");
  if (structure.timing_state === "overheat") arr.push("短期過熱，不宜追高");
  if (moneyScore <= 5) arr.push(`量比 ${row["量比"] ?? "--"} 偏低，資金不足`);
  if (row.category === "speculative") arr.push("高波動投機股，不適合 FCN");
  if (exposureWarning.level === "high") arr.push("現有持倉曝險偏高");
  return arr;
}

function buildFinalComment(action, valuation, structure, moneyScore, exposureWarning) {
  const parts = [];
  if (structure.structure_text) parts.push(structure.structure_text);
  if (valuation.text) parts.push(`估值面：${valuation.text}。`);
  if (moneyScore <= 5) parts.push("資金面偏弱。");
  else if (moneyScore >= 15) parts.push("資金面尚可。");
  if (exposureWarning?.text) parts.push(`持倉面：${exposureWarning.text}`);

  if (action === "加入") parts.push("整體條件支持，可列入 FCN 候選。");
  else if (action === "觀察") parts.push("條件部分符合，但仍需等待更佳位置。");
  else parts.push("目前不適合做 FCN。");

  return parts.join("");
}

// ------------------------------------------
// 主流程
// ------------------------------------------
function run() {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error("找不到 m7_new_stock_pool.json");
  }

  const raw = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  const rows = toArray(raw);
  const m2 = loadM2Exposure();

  const result = rows.map((row) => {
    const r1w = safeNum(row["1週漲跌幅"], null);
    const r1m = safeNum(row["1月漲跌幅"], null);
    const r3m = safeNum(row["3月漲跌幅"], null);
    const r6m = safeNum(row["6月漲跌幅"], null);
    const r12m = safeNum(row["12月漲跌幅"], null);
    const vol = safeNum(row["量比"], null);
    const qScore = safeNum(row["品質分數"], 0);

    const valuation = buildValuationData(row);
    const structure = buildStructureAnalysis(
      r12m ?? 0,
      r6m ?? r3m ?? 0,
      r3m ?? 0,
      r1w ?? 0
    );

    const moneyScore = calcMoneyScore(vol);
    const categoryAdjust = calcCategoryAdjust(row.category);

    const total =
      valuation.score +
      structure.trend_score +
      structure.structure_score +
      structure.timing_adjust +
      moneyScore +
      qScore +
      categoryAdjust;

    const action = buildAction(row, structure, total);

    const exposure = buildExposure(m2.stocks?.[row.symbol]);
    const exposureWarning = buildExposureWarning(exposure, row.category);

    const candidate = {
      "股號": row.symbol,
      "股名": row["名稱"],
      "產業": row.sector,
      "子產業": row.subsector,
      "分類": row.category,
      "估值模型": row.valuation_model,
      "風險等級": row["波動等級"],

      "股價": round2(row["現價"]),
      "PEG": round2(row["PEG"]),
      "1週漲跌幅": round2(r1w),
      "1月漲跌幅": round2(r1m),
      "3月漲跌幅": round2(r3m),
      "6月漲跌幅": round2(r6m),
      "12月漲跌幅": round2(r12m),
      "量比": round2(vol),

      "valuation_score": valuation.score,
      "trend_score": structure.trend_score,
      "structure_score": structure.structure_score,
      "timing_adjust": structure.timing_adjust,
      "money_score": moneyScore,
      "quality_score": qScore,
      "category_adjust": categoryAdjust,

      "today_score": Math.round(total),

      "趨勢判讀": {
        "年線": structure.year_arrow,
        "6月線": structure.month6_arrow,
        "3月線": structure.month3_arrow,
        "週線": structure.week_arrow,
        "趨勢狀態": structure.trend_state,
        "結構狀態": structure.structure_state,
        "溫度狀態": structure.timing_state
      },

      "估值資料": {
        "PEG": valuation.peg,
        "ForwardPE": valuation.pe_forward,
        "EPS成長率": valuation.growth
      },

      "分數拆解": {
        "估值分": valuation.score,
        "趨勢分": structure.trend_score,
        "結構分": structure.structure_score,
        "時機調整": structure.timing_adjust,
        "資金分": moneyScore,
        "品質分": qScore,
        "類別調整": categoryAdjust,
        "總分": Math.round(total)
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

    const highlight = evaluateTodayHighlight(candidate);
    candidate.is_today_highlight = highlight.is_today_highlight;
    candidate.today_highlight_reason = highlight.today_highlight_reason;

    candidate.why_yes = buildWhyYes(row, valuation, structure, moneyScore, qScore);
    candidate.why_no = buildWhyNo(row, valuation, structure, moneyScore, exposureWarning);
    candidate["估值說明"] = valuation.text;
    candidate["結構說明"] = structure.structure_text;
    candidate["最終說明"] = buildFinalComment(action, valuation, structure, moneyScore, exposureWarning);

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

  const output = {
    generated_at: new Date().toISOString(),
    m2_generated_at: m2.generated_at,
    total_count: sorted.length,

    pullback_count: sorted.filter(x => x["趨勢判讀"]?.["結構狀態"] === "pullback").length,
    overheat_count: sorted.filter(x => x["趨勢判讀"]?.["溫度狀態"] === "overheat").length,
    top_count: sorted.filter(x => x["趨勢判讀"]?.["結構狀態"] === "top").length,
    downtrend_count: sorted.filter(x => x["趨勢判讀"]?.["趨勢狀態"] === "down").length,

    high_exposure: sorted.filter(x => x["曝險警示"]?.level === "high").length,
    mid_exposure: sorted.filter(x => x["曝險警示"]?.level === "medium").length,

    market_comment: `回檔結構 ${sorted.filter(x => x["趨勢判讀"]?.["結構狀態"] === "pullback").length} 檔，做頭結構 ${sorted.filter(x => x["趨勢判讀"]?.["結構狀態"] === "top").length} 檔，今日宜重結構、輕追價。`,

    aggressive_recommend: aggressiveRecommend,
    watch_list: watchBucket,
    remove_list: removeBucket,

    all: sorted
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");
  console.log(`✅ m7_new_stock_today.json 已產出，共 ${sorted.length} 檔`);
}

run();
