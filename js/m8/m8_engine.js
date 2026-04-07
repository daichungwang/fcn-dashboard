// ==========================================
// M8 ENGINE FINAL（<=30 scenarios）
// ==========================================

import fs from "fs";

// ------------------------------------------
// CONFIG
// ------------------------------------------
const MAX_SCENARIOS = 30;

// ------------------------------------------
// 工具
// ------------------------------------------
function avg(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function round(x) {
  return Math.round(x * 100) / 100;
}

// ------------------------------------------
// KI 候選（10年線 → Ladder）
// ------------------------------------------
function buildKICandidates(protection) {
  if (protection <= 52) return [50, 55];
  if (protection <= 58) return [55, 60];
  if (protection <= 63) return [60, 65];
  return [];
}

// ------------------------------------------
// Strike 候選（🔥修正版）
// PEG_combo = 0.6 worst + 0.4 avg
// ------------------------------------------
function buildStrikeCandidates(peg_combo) {
  if (peg_combo < 0.8) return [65, 70, 75];
  if (peg_combo <= 1.0) return [65, 70];
  if (peg_combo <= 1.2) return [60, 65];
  if (peg_combo <= 1.5) return [55, 60];
  if (peg_combo <= 2.0) return [50, 55];
  return [];
}

// ------------------------------------------
// GAP 判斷
// ------------------------------------------
function validGap(gap) {
  if (gap === 0) return true;
  if (gap >= 10 && gap < 25) return true;
  return false;
}

// ------------------------------------------
// 分數（簡化版，可再細化）
// ------------------------------------------
function scoreKI(ki) {
  if (ki <= 55) return 8;
  if (ki <= 60) return 4;
  if (ki <= 65) return 0;
  if (ki <= 70) return -4;
  return -8;
}

function scoreGap(gap) {
  if (gap === 0) return 5;
  if (gap < 10) return -7;
  if (gap <= 13) return 5;
  if (gap <= 15) return 3;
  if (gap <= 18) return 0;
  if (gap <= 20) return -4;
  if (gap <= 22) return -5;
  if (gap < 25) return -8;
  return -10;
}

function scoreTenor(t) {
  if (t <= 3) return 5;
  if (t <= 6) return 2;
  if (t === 6) return 0;
  if (t <= 9) return -2;
  if (t <= 12) return -5;
  return -10;
}

function scoreRate(r) {
  if (r < 10) return -10;
  if (r <= 12) return -4;
  if (r <= 15) return -2;
  if (r <= 16) return 0;
  if (r <= 18) return 3;
  if (r <= 20) return 5;
  if (r <= 24) return 8;
  return 10;
}

function scoreType(type) {
  if (type === "EKI") return 2;
  if (type === "AKI") return 0;
  return 1;
}

// ------------------------------------------
// 核心 Engine
// ------------------------------------------
function runM8(stocks) {

  // --------------------------------------
  // 基本資料
  // --------------------------------------
  const basicScores = stocks.map(s => s.basic_score);
  const todayScores = stocks.map(s => s.today_score);
  const pegs = stocks.map(s => s.peg);

  const worstIndex = basicScores.indexOf(Math.min(...basicScores));
  const worstStock = stocks[worstIndex];

  const worstBasic = basicScores[worstIndex];
  const avgBasic = avg(basicScores);

  const avgToday = avg(todayScores);

  const peg_combo = 0.6 * worstStock.peg + 0.4 * avg(pegs);

  // --------------------------------------
  // 候選
  // --------------------------------------
  const kis = buildKICandidates(worstStock.protection);
  const strikes = buildStrikeCandidates(peg_combo);

  const tenors = [6, 9, 12];
  const rates = [16, 18, 20, 24];
  const types = ["EKI", "AKI"];

  const scenarios = [];

  // --------------------------------------
  // 產生情境（限制 30）
  // --------------------------------------
  outer:
  for (const ki of kis) {
    for (const strike of strikes) {

      const gap = strike - ki;
      if (!validGap(gap)) continue;

      for (const tenor of tenors) {
        for (const rate of rates) {
          for (const type of types) {

            const kiScore = scoreKI(ki);
            const gapScore = scoreGap(gap);
            const tenorScore = scoreTenor(tenor);
            const rateScore = scoreRate(rate);
            const typeScore = scoreType(type);

            const conditionScore =
              0.3 * kiScore +
              0.2 * gapScore +
              0.3 * tenorScore +
              0.6 * rateScore +
              typeScore;

            const stockComponent =
              0.6 * worstBasic +
              0.4 * avgBasic;

            const totalScore =
              stockComponent +
              avgToday +
              conditionScore;

            scenarios.push({
              股票組合: stocks.map(s => s.symbol),
              最差股票: worstStock.symbol,

              KI: ki,
              Strike: strike,
              Gap: gap,
              天期月數: tenor,
              利率: rate,
              產品類型: type,

              FCN總分: round(totalScore),
              模擬結果: totalScore >= 8 ? "可做" :
                        totalScore >= 6.5 ? "觀察" : "不做"
            });

            if (scenarios.length >= MAX_SCENARIOS) break outer;
          }
        }
      }
    }
  }

  // 排序
  scenarios.sort((a, b) => b.FCN總分 - a.FCN總分);

  return scenarios;
}

// ------------------------------------------
// 測試輸入（可替換成 M7）
// ------------------------------------------
const testStocks = [
  { symbol: "NVDA", basic_score: 8, today_score: 6, peg: 1.1, protection: 55 },
  { symbol: "TSM", basic_score: 7, today_score: 5, peg: 1.0, protection: 57 },
  { symbol: "CCL", basic_score: -5, today_score: 2, peg: 1.2, protection: 52 }
];

// ------------------------------------------
// 執行
// ------------------------------------------
const result = runM8(testStocks);

// 輸出
fs.writeFileSync(
  "./data/m8/m8_today.json",
  JSON.stringify(result, null, 2)
);

console.log("M8 完成，產生情境數:", result.length);
