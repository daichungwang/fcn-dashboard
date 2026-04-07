// ==========================================
// M7 Runtime Engine（最終版）
// 讀取 /data/m7/m7_new_stock_pool.json
// 輸出 /data/m7/m7_new_stock_today.json
// ==========================================

import fs from "fs";
import path from "path";

// ------------------------------------------
// 路徑
// ------------------------------------------
const INPUT_FILE = path.resolve("./data/m7/m7_new_stock_pool.json");
const OUTPUT_FILE = path.resolve("./data/m7/m7_new_stock_today.json");

// ------------------------------------------
// 工具
// ------------------------------------------
function toNumber(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(v) {
  return v === null ? null : Math.round(v * 100) / 100;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ------------------------------------------
// 估值分數（PEG）
// ------------------------------------------
function calcValuationScore(peg) {
  if (peg === null) return 10;

  if (peg <= 0.8) return 40;
  if (peg <= 1.0) return 34;
  if (peg <= 1.2) return 28;
  if (peg <= 1.5) return 20;
  if (peg <= 2.0) return 10;
  return 0;
}

// ------------------------------------------
// 技術分數
// ------------------------------------------
function calcTechnicalScore(r1m, r3m) {
  let score = 0;

  if (r1m !== null) {
    if (r1m >= 10) score += 20;
    else if (r1m >= 5) score += 15;
    else if (r1m >= 0) score += 8;
    else if (r1m >= -5) score += 3;
  }

  if (r3m !== null) {
    if (r3m >= 20) score += 15;
    else if (r3m >= 10) score += 10;
    else if (r3m >= 0) score += 5;
    else if (r3m >= -10) score += 2;
  }

  return clamp(score, 0, 35);
}

// ------------------------------------------
// 資金分數
// ------------------------------------------
function calcMoneyScore(volumeRatio, r1w) {
  if (volumeRatio !== null) {
    if (volumeRatio >= 2) return 25;
    if (volumeRatio >= 1.5) return 20;
    if (volumeRatio >= 1.2) return 15;
    if (volumeRatio >= 1.0) return 10;
    return 5;
  }

  if (r1w !== null) {
    if (r1w >= 8) return 20;
    if (r1w >= 4) return 15;
    if (r1w >= 0) return 10;
    return 5;
  }

  return 8;
}

// ------------------------------------------
// 動作判斷
// ------------------------------------------
function getAction(score) {
  if (score >= 75) return "加入";
  if (score >= 60) return "觀察";
  return "移除";
}

// ------------------------------------------
// 主流程
// ------------------------------------------
function run() {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error("找不到 m7_new_stock_pool.json");
  }

  const raw = fs.readFileSync(INPUT_FILE, "utf-8");
  const data = JSON.parse(raw);

  const rows = Array.isArray(data) ? data : data.data || [];

  const result = rows.map((row) => {
    const peg = toNumber(row.peg);
    const price = toNumber(row.price);
    const r1w = toNumber(row.ret_1w);
    const r1m = toNumber(row.ret_1m);
    const r3m = toNumber(row.ret_3m);
    const vol = toNumber(row.volume_ratio);

    const quality = toNumber(row.quality_score, 0);

    const vScore = calcValuationScore(peg);
    const tScore = calcTechnicalScore(r1m, r3m);
    const mScore = calcMoneyScore(vol, r1w);

    const total = Math.round(clamp(vScore + tScore + mScore + quality, 0, 105));

    return {
      股號: row.symbol,
      股名: row.name,
      產業: row.sector || "",
      風險等級: row.risk_level || "中",

      股價: round2(price),
      PEG: round2(peg),

      valuation_score: vScore,
      technical_score: tScore,
      money_score: mScore,
      quality_score: quality,

      today_score: total,

      "1週漲跌幅": round2(r1w),
      "1月漲跌幅": round2(r1m),
      "3月漲跌幅": round2(r3m),
      量比: round2(vol),

      建議動作: getAction(total)
    };
  });

  // 排序
  const sorted = result
    .filter(x => x.股號)
    .sort((a, b) => b.today_score - a.today_score)
    .map((x, i) => ({
      排名: i + 1,
      ...x
    }));

  const picks = sorted.filter(x => x.建議動作 !== "移除");

  const output = {
    generated_at: new Date().toISOString(),
    total_count: sorted.length,
    today_pick_count: picks.length,
    today_picks: picks,
    all: sorted
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log("✅ M7 today 已產出");
}

run();
