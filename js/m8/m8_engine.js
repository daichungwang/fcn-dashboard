// ==========================================
// M8 ENGINE FINAL
// 讀取：data/m7/m7_new_stock_today.json
// 輸出：data/m8/m8_today.json
// 限制：最多 30 個情境
// ==========================================

import fs from "fs";
import path from "path";

const INPUT_FILE = path.resolve("./data/m7/m7_new_stock_today.json");
const OUTPUT_FILE = path.resolve("./data/m8/m8_today.json");
const MAX_SCENARIOS = 30;

// ------------------------------------------
// 工具
// ------------------------------------------
function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function avg(arr) {
  const valid = arr.filter(v => Number.isFinite(v));
  if (!valid.length) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function uniqueBy(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

// ------------------------------------------
// 讀 M7
// ------------------------------------------
function loadM7() {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error("找不到 data/m7/m7_new_stock_today.json");
  }

  const raw = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  const all = Array.isArray(raw.all) ? raw.all : [];

  return { raw, all };
}

// ------------------------------------------
// 股票池過濾
// ------------------------------------------
function isEligible(stock, mode = "strict") {
  const category = stock["分類"];
  const trendState = stock["趨勢判讀"]?.["趨勢狀態"];
  const structureState = stock["趨勢判讀"]?.["結構狀態"];
  const exposureLevel = stock["曝險警示"]?.level || "normal";
  const bucket = stock["ui_bucket"];

  if (trendState === "down") return false;
  if (structureState === "top") return false;
  if (category === "speculative") return false;
  if (exposureLevel === "high") return false;

  if (mode === "strict") {
    return bucket === "積極推薦";
  }

  // loose
  return bucket === "積極推薦" || bucket === "觀察名單";
}

function buildStockPool(all, mode = "strict") {
  const filtered = all.filter(x => isEligible(x, mode));

  const core = filtered.filter(x => x["分類"] === "core");
  const growth = filtered.filter(x => x["分類"] === "growth");
  const defensive = filtered.filter(x => x["分類"] === "defensive");
  const income = filtered.filter(x => x["分類"] === "income");

  return { core, growth, defensive, income, filtered };
}

// ------------------------------------------
// 組合模板
// ------------------------------------------
function pickTop(arr, n) {
  return arr.slice(0, n);
}

function buildCombos(pool) {
  const combos = [];

  // A. 主力：2 Core + 1 Growth + 1 Defensive
  if (pool.core.length >= 2 && pool.growth.length >= 1 && pool.defensive.length >= 1) {
    combos.push({
      name: "主力",
      stocks: [
        ...pickTop(pool.core, 2),
        pool.growth[0],
        pool.defensive[0]
      ]
    });
  }

  // B. 保守：2 Core + 2 Defensive
  if (pool.core.length >= 2 && pool.defensive.length >= 2) {
    combos.push({
      name: "保守",
      stocks: [
        ...pickTop(pool.core, 2),
        ...pickTop(pool.defensive, 2)
      ]
    });
  }

  // C. 收益：2 Core + 1 Growth + 1 Income
  if (pool.core.length >= 2 && pool.growth.length >= 1 && pool.income.length >= 1) {
    combos.push({
      name: "收益",
      stocks: [
        ...pickTop(pool.core, 2),
        pool.growth[0],
        pool.income[0]
      ]
    });
  }

  // D. 精簡：2 Core + 1 Growth
  if (pool.core.length >= 2 && pool.growth.length >= 1) {
    combos.push({
      name: "精簡",
      stocks: [
        ...pickTop(pool.core, 2),
        pool.growth[0]
      ]
    });
  }

  // E. 防守成長：1 Core + 1 Growth + 1 Defensive
  if (pool.core.length >= 1 && pool.growth.length >= 1 && pool.defensive.length >= 1) {
    combos.push({
      name: "防守成長",
      stocks: [
        pool.core[0],
        pool.growth[0],
        pool.defensive[0]
      ]
    });
  }

  // 去重
  return uniqueBy(combos, c => c.stocks.map(s => s["股號"]).sort().join("|"));
}

// ------------------------------------------
// 10年保護線代理值
// 目前先用 M7 的 12月跌幅 / 結構作 proxy
// 後續可替換成真實 10Y MA 資料
// 回傳百分比，例如 55 / 60
// ------------------------------------------
function estimateProtection(stock) {
  const r12 = num(stock["12月漲跌幅"], 0);
  const category = stock["分類"];
  const structure = stock["趨勢判讀"]?.["結構狀態"];

  let base = 60;

  if (category === "core") base = 58;
  else if (category === "defensive") base = 60;
  else if (category === "growth") base = 55;
  else if (category === "income") base = 55;

  if (r12 >= 30) base -= 3;
  else if (r12 >= 15) base -= 2;
  else if (r12 < 0) base += 3;

  if (structure === "pullback") base -= 2;
  if (structure === "hot") base += 2;
  if (structure === "rebound") base += 1;

  if (base < 50) base = 50;
  if (base > 65) base = 65;

  return base;
}

// ------------------------------------------
// KI 候選
// ------------------------------------------
function buildKICandidates(protection) {
  if (protection <= 52) return [50, 55];
  if (protection <= 58) return [55, 60];
  if (protection <= 63) return [60, 65];
  return [];
}

// ------------------------------------------
// Strike 候選
// 修正版：0.6 × Worst PEG + 0.4 × Avg PEG
// ------------------------------------------
function buildStrikeCandidates(pegCombo) {
  if (pegCombo < 0.8) return [65, 70, 75];
  if (pegCombo <= 1.0) return [65, 70];
  if (pegCombo <= 1.2) return [60, 65];
  if (pegCombo <= 1.5) return [55, 60];
  if (pegCombo <= 2.0) return [50, 55];
  return [];
}

// ------------------------------------------
// 分數
// ------------------------------------------
function scoreKI(ki) {
  if (ki <= 55) return 8;
  if (ki <= 60) return 4;
  if (ki <= 65) return 0;
  if (ki <= 70) return -4;
  if (ki <= 75) return -8;
  return -10;
}

function scoreGap(gap) {
  if (gap === 0) return 5;
  if (gap < 10) return -7;
  if (gap === 10) return 5;
  if (gap <= 13) return 4;
  if (gap <= 15) return 3;
  if (gap <= 18) return 0;
  if (gap <= 20) return -4;
  if (gap <= 22) return -5;
  if (gap < 25) return -8;
  return -10;
}

function scoreTenor(t) {
  if (t >= 0 && t <= 3) return 5;
  if (t >= 4 && t <= 6) return 2;
  if (t === 6) return 0;
  if (t >= 7 && t <= 9) return -2;
  if (t >= 10 && t <= 12) return -5;
  return -10;
}

function scoreRate(r) {
  if (r < 10) return -10;
  if (r <= 12) return -4;
  if (r < 15) return -2;
  if (r < 16) return 0;
  if (r < 18) return 3;
  if (r < 20) return 5;
  if (r < 24) return 8;
  return 10;
}

function scoreType(type) {
  if (type === "EKI") return 2;
  if (type === "AKI") return 0;
  if (type === "Down-KI") return 1;
  return 0;
}

// ------------------------------------------
// 模擬說明
// ------------------------------------------
function buildScenarioComment(ki, gap, rate, total) {
  const parts = [];

  if (ki <= 55) parts.push("保護強");
  else if (ki <= 60) parts.push("保護尚可");
  else parts.push("保護偏弱");

  if (gap === 10) parts.push("Gap最佳");
  else if (gap < 10) parts.push("Gap太小");
  else if (gap <= 15) parts.push("Gap合理");
  else if (gap <= 20) parts.push("Gap中性");
  else parts.push("Gap偏大");

  if (rate >= 20) parts.push("收益偏高");
  else if (rate >= 16) parts.push("收益平衡");
  else parts.push("收益一般");

  if (total >= 8) parts.push("整體可做");
  else if (total >= 6.5) parts.push("可先觀察");
  else parts.push("條件不足");

  return parts.join("、");
}

// ------------------------------------------
// 從組合建立情境
// ------------------------------------------
function generateScenariosForCombo(combo, startId = 1) {
  const stocks = combo.stocks;

  const basicScores = stocks.map(s => num(s["quality_score"] ?? s["品質分數"], 0));
  const todayScores = stocks.map(s => num(s["today_score"], 0));
  const pegs = stocks.map(s => num(s["估值資料"]?.["PEG"], 9)).filter(v => v > 0);

  const worstStock = [...stocks].sort((a, b) => {
    const aScore = num(a["quality_score"] ?? a["品質分數"], 0);
    const bScore = num(b["quality_score"] ?? b["品質分數"], 0);
    return aScore - bScore;
  })[0];

  const avgBasic = avg(basicScores);
  const worstBasic = num(worstStock["quality_score"] ?? worstStock["品質分數"], 0);
  const stockComponent = 0.6 * worstBasic + 0.4 * avgBasic;

  const avgToday = avg(todayScores);
  const todayComponent = avgToday;

  const worstPeg = num(worstStock["估值資料"]?.["PEG"], 9);
  const avgPeg = avg(pegs);
  const pegCombo = 0.6 * worstPeg + 0.4 * avgPeg;

  const protection = estimateProtection(worstStock);
  const kis = buildKICandidates(protection);
  const strikes = buildStrikeCandidates(pegCombo);

  const tenors = [6, 9, 12];
  const rates = [16, 18, 20, 24];
  const types = ["EKI", "AKI"];

  const scenarios = [];
  let seq = startId;

  outer:
  for (const ki of kis) {
    for (const strike of strikes) {
      if (strike < ki) continue;

      const gap = strike - ki;
      if (!(gap === 0 || (gap >= 10 && gap < 25))) continue;

      for (const tenor of tenors) {
        for (const rate of rates) {
          for (const type of types) {
            const kiScore = scoreKI(ki);
            const gapScore = scoreGap(gap);
            const tenorScore = scoreTenor(tenor);
            const rateScore = scoreRate(rate);
            const typeScore = scoreType(type);

            const conditionComponent =
              0.3 * kiScore +
              0.2 * gapScore +
              0.3 * tenorScore +
              0.6 * rateScore +
              typeScore;

            const totalScore = stockComponent + todayComponent + conditionComponent;

            scenarios.push({
              "模擬編號": `SIM_${String(seq).padStart(3, "0")}`,
              "組合類型": combo.name,
              "股票組合": stocks.map(s => s["股號"]),

              "最差股票": worstStock["股號"],
              "平均基本股票分數": round2(avgBasic),
              "最差股票分數": round2(worstBasic),
              "股票基本分數組件": round2(stockComponent),

              "平均今日分數": round2(avgToday),
              "今日分數組件": round2(todayComponent),

              "KI": ki,
              "Strike": strike,
              "Gap": gap,
              "天期月數": tenor,
              "利率": rate,
              "產品類型": type,

              "KI分數": kiScore,
              "Gap分數": gapScore,
              "天期分數": tenorScore,
              "利率分數": rateScore,
              "產品類型分數": typeScore,

              "條件分數組件": round2(conditionComponent),
              "FCN總分": round2(totalScore),

              "模擬結果": totalScore >= 8 ? "可做" : totalScore >= 6.5 ? "觀察" : "不做",
              "模擬說明": buildScenarioComment(ki, gap, rate, totalScore),

              "最後更新日期": new Date().toISOString().slice(0, 10)
            });

            seq += 1;
            if (scenarios.length >= MAX_SCENARIOS) break outer;
          }
        }
      }
    }
  }

  return scenarios;
}

// ------------------------------------------
// 主程式
// ------------------------------------------
function run() {
  const { all } = loadM7();

  const strictPool = buildStockPool(all, "strict");
  let combos = buildCombos(strictPool);

  // strict 不夠，再補 loose
  if (!combos.length) {
    const loosePool = buildStockPool(all, "loose");
    combos = buildCombos(loosePool);
  }

  if (!combos.length) {
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify([], null, 2), "utf-8");
    console.log("⚠️ 找不到可用組合，已輸出空陣列");
    return;
  }

  let allScenarios = [];
  let simStart = 1;

  for (const combo of combos) {
    const remain = MAX_SCENARIOS - allScenarios.length;
    if (remain <= 0) break;

    const comboScenarios = generateScenariosForCombo(combo, simStart).slice(0, remain);
    allScenarios.push(...comboScenarios);
    simStart = allScenarios.length + 1;
  }

  allScenarios.sort((a, b) => num(b["FCN總分"]) - num(a["FCN總分"]));

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allScenarios, null, 2), "utf-8");

  console.log(`✅ M8 完成，產生情境數: ${allScenarios.length}`);
}

run();
