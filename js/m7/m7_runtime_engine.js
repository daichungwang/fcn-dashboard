// ==========================================
// M7 Runtime Engine V2
// 讀取 m7_new_stock_pool.json
// 輸出 m7_new_stock_today.json
// ==========================================

import fs from "fs";
import path from "path";

const INPUT_FILE = path.resolve("./data/m7/m7_new_stock_pool.json");
const OUTPUT_FILE = path.resolve("./data/m7/m7_new_stock_today.json");

function toArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw?.data && Array.isArray(raw.data)) return raw.data;
  if (raw?.data && typeof raw.data === "object") return Object.values(raw.data);
  return [];
}

function calcValuationScore(row) {
  const model = row.valuation_model || "PEG";
  const peg = row.PEG ?? null;

  if (model === "PEG") {
    if (peg === null || peg === undefined) return 10;
    if (peg <= 0.8) return 40;
    if (peg <= 1.0) return 34;
    if (peg <= 1.2) return 28;
    if (peg <= 1.5) return 20;
    if (peg <= 2.0) return 10;
    return 0;
  }

  if (model === "NON_PEG") {
    return 20;
  }

  if (model === "PE") {
    return 18;
  }

  if (model === "ETF") {
    return 15;
  }

  return 15;
}

function calcTechnicalScore(r1m, r3m) {
  let score = 0;

  if (r1m !== null && r1m !== undefined) {
    if (r1m >= 10) score += 20;
    else if (r1m >= 5) score += 15;
    else if (r1m >= 0) score += 8;
    else if (r1m >= -5) score += 3;
  }

  if (r3m !== null && r3m !== undefined) {
    if (r3m >= 20) score += 15;
    else if (r3m >= 10) score += 10;
    else if (r3m >= 0) score += 5;
    else if (r3m >= -10) score += 2;
  }

  return Math.min(score, 35);
}

function calcMoneyScore(volumeRatio, r1w) {
  if (volumeRatio !== null && volumeRatio !== undefined) {
    if (volumeRatio >= 2) return 25;
    if (volumeRatio >= 1.5) return 20;
    if (volumeRatio >= 1.2) return 15;
    if (volumeRatio >= 1.0) return 10;
    return 5;
  }

  if (r1w !== null && r1w !== undefined) {
    if (r1w >= 8) return 20;
    if (r1w >= 4) return 15;
    if (r1w >= 0) return 10;
    return 5;
  }

  return 8;
}

function getAction(score, allowFCN = true) {
  if (!allowFCN) return "移除";
  if (score >= 75) return "加入";
  if (score >= 60) return "觀察";
  return "移除";
}

function buildReason(row, vScore, tScore, mScore) {
  const reasons = [];

  if (row.valuation_model === "PEG") {
    if (vScore >= 28) reasons.push("PEG合理");
    else if (vScore <= 10) reasons.push("PEG偏高");
  } else if (row.valuation_model === "NON_PEG") {
    reasons.push("非PEG股採中性估值");
  } else if (row.valuation_model === "ETF") {
    reasons.push("ETF採中性估值");
  }

  if (tScore >= 20) reasons.push("短中期動能偏強");
  else if (tScore <= 8) reasons.push("動能偏弱");

  if (mScore >= 15) reasons.push("資金維持流入");
  else if (mScore <= 6) reasons.push("資金動能不足");

  if (row.category === "core") reasons.push("核心可接");
  if (row.category === "speculative") reasons.push("高波動不適合FCN");

  return reasons.join("，") || "資料中性，先觀察";
}

function buildTags(row, vScore, tScore, mScore) {
  const tags = [];

  if (row.category === "core") tags.push("核心");
  if (row.category === "growth") tags.push("成長");
  if (row.category === "defensive") tags.push("防禦");
  if (row.category === "income") tags.push("收益");
  if (row.category === "speculative") tags.push("投機");

  if (vScore >= 28) tags.push("估值合理");
  if (tScore >= 20) tags.push("動能強");
  if (mScore >= 15) tags.push("資金偏多");

  return tags;
}

function run() {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error("找不到 m7_new_stock_pool.json");
  }

  const raw = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  const rows = toArray(raw);

  const result = rows.map((row) => {
    const r1w = row["1週漲跌幅"];
    const r1m = row["1月漲跌幅"];
    const r3m = row["3月漲跌幅"];
    const vol = row["量比"];

    const vScore = calcValuationScore(row);
    const tScore = calcTechnicalScore(r1m, r3m);
    const mScore = calcMoneyScore(vol, r1w);
    const qScore = row["品質分數"] ?? 0;

    let total = vScore + tScore + mScore + qScore;

    if (row.category === "core") total += 5;
    if (row.category === "defensive") total += 3;
    if (row.category === "income") total += 1;
    if (row.category === "speculative") total -= 10;

    const action = getAction(total, row.allow_fcn !== false);

    return {
      "股號": row.symbol,
      "股名": row["名稱"],
      "產業": row.sector,
      "子產業": row.subsector,
      "分類": row.category,
      "估值模型": row.valuation_model,
      "風險等級": row["波動等級"],

      "股價": row["現價"],
      "PEG": row["PEG"],

      "valuation_score": vScore,
      "technical_score": tScore,
      "money_score": mScore,
      "quality_score": qScore,

      "today_score": total,

      "1週漲跌幅": r1w,
      "1月漲跌幅": r1m,
      "3月漲跌幅": r3m,
      "量比": vol,

      "建議動作": action,
      "建議原因": buildReason(row, vScore, tScore, mScore),
      "觀察標籤": buildTags(row, vScore, tScore, mScore)
    };
  });

const sorted = result
  .filter((x) => x["股號"])
  .filter((x) => x["分類"] !== "speculative")
  .sort((a, b) => b.today_score - a.today_score)
  .map((x, i) => ({
    "排名": i + 1,
    ...x
  }));

 const picks = sorted;

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
