// ==========================================
// M7 Runtime Engine FINAL
// 結構版 / FCN版 / 對應 12M + 6M + 3M + 1W
// 讀取 data/m7/m7_new_stock_pool.json
// 輸出 data/m7/m7_new_stock_today.json
// ==========================================

import fs from "fs";
import path from "path";

const INPUT_FILE = path.resolve("./data/m7/m7_new_stock_pool.json");
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
// 估值：數據 + 評語 + 分數
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
// 年線 = 12M
// 月線 / 結構 = 6M + 3M
// 週線 = 1W
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

  // 1) 年線：趨勢方向
  if (r12m === null || r12m === undefined) {
    trendState = "unknown";
  } else if (r12m < 0) {
    trendState = "down";
  } else if (r12m >= 15) {
    trendState = "up_strong";
  } else {
    trendState = "up_mild";
  }

  // 2) 結構：6M + 3M
  // 你定義的重點：
  // - 年線向上或緩升，但 6M / 3M 同步下彎 = 做頭，按兵不動
  // - 年線向上 + 6M上 + 3M下 = 回檔，較理想
  if (trendState === "down") {
    structureState = "downtrend";
  } else {
    if (r6m > 0 && r3m < 0) {
      structureState = "pullback";      // 年線上、6M上、3M下：回檔
    } else if (r6m > 0 && r3m > 0) {
      structureState = "hot";           // 全部都上：健康但偏熱
    } else if (r6m < 0 && r3m < 0) {
      structureState = "top";           // 你定義的做頭 / 結構轉弱
    } else if (r6m < 0 && r3m > 0) {
      structureState = "rebound";       // 弱勢反彈
    } else {
      structureState = "neutral";
    }
  }

  // 3) 溫度：1W
  if (r1w !== null && r1w !== undefined) {
    if (r1w > 8) timingState = "overheat";
    else if (r1w < -5) timingState = "dip";
    else timingState = "normal";
  }

  // 分數
  let trendScore = 0;
  if (trendState === "up_strong") trendScore = 30;
  else if (trendState === "up_mild") trendScore = 22;
  else if (trendState === "down") trendScore = 0;
  else trendScore = 10;

  let structureScore = 0;
  if (structureState === "pullback") structureScore = 20;  // FCN 最喜歡
  else if (structureState === "hot") structureScore = 10;
  else if (structureState === "rebound") structureScore = 4;
  else if (structureState === "top") structureScore = 0;
  else if (structureState === "downtrend") structureScore = 0;
  else structureScore = 6;

  let timingAdjust = 0;
  if (timingState === "dip") timingAdjust = 5;
  else if (timingState === "overheat") timingAdjust = -5;
  else timingAdjust = 0;

  let structureText = "";
  if (structureState === "pullback") {
    structureText = "年線仍向上，6月結構仍撐住，但3月回檔，屬於較理想的 FCN 回檔結構。";
  } else if (structureState === "hot") {
    structureText = "年線與中期結構都向上，結構健康，但目前位置偏熱，不宜急追。";
  } else if (structureState === "top") {
    structureText = "年線仍高位，但 3月與6月結構同步轉弱，屬於明顯做頭，宜按兵不動。";
  } else if (structureState === "downtrend") {
    structureText = "年線已轉弱，長期趨勢向下，不適合做 FCN。";
  } else if (structureState === "rebound") {
    structureText = "中期結構仍弱，目前較像弱勢反彈，不宜積極進場。";
  } else {
    structureText = "結構中性，需搭配估值與資金面再判斷。";
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
// 解釋
// ------------------------------------------
function buildWhyYes(row, valuation, structure, moneyScore, qScore) {
  const arr = [];

  if (row.category === "core") arr.push("核心股");
  if (row.category === "defensive") arr.push("防禦型");
  if (qScore >= 5) arr.push("品質高");
  if (valuation.score >= 28) arr.push("估值合理");
  if (structure.trend_state === "up_strong" || structure.trend_state === "up_mild") {
    arr.push("年線向上");
  }
  if (structure.structure_state === "pullback") arr.push("中期回檔，價格較合理");
  if (moneyScore >= 15) arr.push("資金支持");

  return arr;
}

function buildWhyNo(row, valuation, structure, moneyScore) {
  const arr = [];

  if (row.valuation_model === "PEG" && valuation.peg !== null && valuation.peg > 1.6) {
    arr.push(`PEG ${valuation.peg} 偏高`);
  }
  if (structure.structure_state === "top") arr.push("3月與6月結構同步轉弱，屬做頭");
  if (structure.trend_state === "down") arr.push("年線向下，長期趨勢不佳");
  if (structure.timing_state === "overheat") arr.push("週線過熱，不宜追高");
  if (moneyScore <= 5) arr.push(`量比 ${row["量比"] ?? "--"} 偏低，資金不足`);
  if (row.category === "speculative") arr.push("高波動投機股，不適合 FCN");

  return arr;
}

function buildAction(row, structure, total) {
  if (row.allow_fcn === false) return "移除";
  if (row.category === "speculative") return "移除";
  if (structure.trend_state === "down") return "移除";
  if (structure.structure_state === "top") return "移除";

  if (total >= 75) return "加入";
  if (total >= 55) return "觀察";
  return "移除";
}

function buildFinalComment(action, valuation, structure, moneyScore) {
  const parts = [];

  if (structure.structure_text) parts.push(structure.structure_text);
  if (valuation.text) parts.push(`估值面：${valuation.text}。`);

  if (moneyScore <= 5) parts.push("資金面偏弱。");
  else if (moneyScore >= 15) parts.push("資金面尚可。");

  if (action === "加入") {
    parts.push("整體條件支持，可列入 FCN 候選。");
  } else if (action === "觀察") {
    parts.push("條件部分符合，但仍需等待更佳位置或更清楚的結構。");
  } else {
    parts.push("目前不適合做 FCN。");
  }

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

    const whyYes = buildWhyYes(row, valuation, structure, moneyScore, qScore);
    const whyNo = buildWhyNo(row, valuation, structure, moneyScore);
    const action = buildAction(row, structure, total);
    const finalComment = buildFinalComment(action, valuation, structure, moneyScore);

    return {
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

      "建議動作": action,
      "why_yes": whyYes,
      "why_no": whyNo,
      "估值說明": valuation.text,
      "結構說明": structure.structure_text,
      "最終說明": finalComment
    };
  });

  const sorted = result
    .filter((x) => x["股號"])
    .sort((a, b) => b.today_score - a.today_score)
    .map((x, i) => ({
      "排名": i + 1,
      ...x
    }));

  const picks = sorted.filter((x) => x["建議動作"] !== "移除");

  const output = {
    generated_at: new Date().toISOString(),
    total_count: sorted.length,
    today_pick_count: picks.length,
    today_picks: picks,
    all: sorted
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");
  console.log(`✅ m7_new_stock_today.json 已產出，共 ${picks.length} 檔候選`);
}

run();
