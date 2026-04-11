// ==========================================
// M8 Basket Engine
// 振宇 FCN 系統
// 目的：
// 1. 讀取 M7 輸出
// 2. 建立 4 大池：today_highlight / watch / simulation / reject
// 3. 從 simulation_pool 自動分群
// 4. 產出可供 M8 rate engine 使用的 basket candidates
// 5. 輸出 Top baskets
//
// 注意：
// - 不改 M7 total 邏輯
// - 不重算 valuation / total
// - 只做最小必要過濾 + basket 組合
// ==========================================

import fs from "fs";
import path from "path";

const INPUT_FILE = path.resolve("./data/m7/m7_new_stock_today.json");
const OUTPUT_FILE = path.resolve("./data/m8/m8_basket_candidates.json");

// ------------------------------------------
// 基本工具
// ------------------------------------------
function safeNum(v, fallback = 0) {
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

function uniqBy(arr, keyFn) {
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

function avg(arr) {
  if (!Array.isArray(arr) || !arr.length) return 0;
  return arr.reduce((sum, x) => sum + x, 0) / arr.length;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);

  if (lower === upper) return sorted[lower];

  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function pickTop(arr, n, sorter) {
  return [...arr].sort(sorter).slice(0, n);
}

function notNull(x) {
  return x !== null && x !== undefined;
}

// ------------------------------------------
// 角色白名單
// 目的：避免核心可接股被錯殺
// ------------------------------------------
const ANCHOR_SYMBOLS = new Set([
  "MSFT", "GOOG", "AAPL", "AMZN", "META", "NVDA", "TSM", "AVGO",
  "ORCL", "UNH", "COST", "REGN", "QQQ", "LQD"
]);

const DEFENSIVE_LIKE = new Set([
  "UNH", "COST", "REGN", "QQQ", "LQD", "TGT", "WMT", "PG", "KO", "PEP", "JNJ"
]);

const HARD_REJECT_SYMBOLS = new Set([
  "COIN", "SOFI", "ALAB", "CRDO"
]);

const HIGH_BETA_SYMBOLS = new Set([
  "MU", "MRVL", "AMD", "ARM", "AAL", "CCL", "LVS", "TSLA", "PLTR", "COIN", "SOFI", "ALAB", "CRDO"
]);

// ------------------------------------------
// 讀取 M7
// ------------------------------------------
function loadM7() {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error("找不到 m7_new_stock_today.json");
  }

  const raw = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  const rows = Array.isArray(raw.all) ? raw.all : [];

  return {
    generated_at: raw.generated_at || null,
    m2_generated_at: raw.m2_generated_at || null,
    rows
  };
}

// ------------------------------------------
// 取欄位
// ------------------------------------------
function getMetrics(row) {
  const trend = row["趨勢判讀"] || {};
  const exposure = row["持倉曝險"] || {};
  const exposureWarning = row["曝險警示"] || {};
  const score = row["分數拆解"] || {};
  const valData = row["估值資料"] || {};

  return {
    symbol: row["股號"],
    name: row["股名"],
    category: row["分類"],
    riskLevel: row["風險等級"],

    todayScore: safeNum(row["today_score"], safeNum(score["總分"], 0)),
    valuationScore: safeNum(row["valuation_score"], safeNum(score["估值分"], 0)),
    trendScore: safeNum(row["trend_score"], safeNum(score["趨勢分"], 0)),
    structureScore: safeNum(row["structure_score"], safeNum(score["結構分"], 0)),
    timingScore: safeNum(row["timing_score"], safeNum(score["時機分"], 0)),
    moneyScore: safeNum(row["money_score"], safeNum(score["資金分"], 0)),
    qualityScore: safeNum(row["quality_score"], safeNum(score["品質分"], 0)),
    categoryAdjust: safeNum(row["category_adjust"], safeNum(score["類別調整"], 0)),

    trendState: trend["趨勢狀態"] || "",
    structureState: trend["結構狀態"] || "",
    timingState: trend["時機狀態"] || "",

    exposureLevel: exposureWarning.level || "normal",
    dangerCount: safeNum(exposure["Danger"], 0),
    watchCount: safeNum(exposure["Watch"], 0),
    healthyCount: safeNum(exposure["Healthy"], 0),
    investedRatio: safeNum(exposure["投入資金比"], 0),

    valuationRaw: safeNum(valData["ValuationRaw"], safeNum(score["估值原始分"], 0)),
    forwardPE: safeNum(valData["ForwardPE"], null),
    peRatio: safeNum(valData["PERatio"], null),
    growth: safeNum(valData["EPS成長率"], null),
    qualityFactor: safeNum(valData["QualityFactor"], null),

    whyYes: Array.isArray(row.why_yes) ? row.why_yes : [],
    whyNo: Array.isArray(row.why_no) ? row.why_no : [],
    finalComment: row["最終說明"] || "",
    raw: row
  };
}

// ------------------------------------------
// 4 大池
// 核心原則：
// 1. today_score 為主排序
// 2. reject 只做最小必要風控
// 3. simulation_pool 固定名額，避免 M8 斷料
// ------------------------------------------
function isReject(metrics, p35) {
  const symbol = metrics.symbol;

  if (HARD_REJECT_SYMBOLS.has(symbol)) return true;
  if (metrics.category === "speculative") return true;
  if (metrics.trendState === "down") return true;
  if (metrics.exposureLevel === "high" && metrics.dangerCount > 0) return true;

  // 結構 flat + timing hot + 分數落在後段，視為真 reject
  if (
    metrics.structureState === "flat" &&
    metrics.timingState === "hot" &&
    metrics.todayScore < p35
  ) {
    return true;
  }

  return false;
}

function isAnchorReserve(metrics) {
  return (
    ANCHOR_SYMBOLS.has(metrics.symbol) &&
    metrics.category !== "speculative" &&
    metrics.trendState !== "down"
  );
}

function buildPools(rows) {
  const metricsRows = rows.map(getMetrics).filter(x => x.symbol);

  const allScores = metricsRows.map(x => x.todayScore);
  const p35 = percentile(allScores, 0.35);

  // 全排序：絕對不能破壞 M7 total → M8 rate 的映射
  const allSorted = [...metricsRows].sort((a, b) => b.todayScore - a.todayScore);

  const rejectPool = allSorted.filter(x => isReject(x, p35));

  const nonReject = allSorted.filter(x => !isReject(x, p35));

  // simulation_pool：主排序仍是 todayScore
  // 先取非 reject 前 15 名，再補 anchor reserve
  let simulationPool = nonReject.slice(0, 15);

  const reserveAnchors = nonReject.filter(isAnchorReserve);
  simulationPool = uniqBy([...simulationPool, ...reserveAnchors], x => x.symbol);

  // 若太多，保留前 18；若太少，至少保留前 12
  simulationPool = simulationPool
    .sort((a, b) => b.todayScore - a.todayScore)
    .slice(0, 18);

  if (simulationPool.length < 12) {
    simulationPool = nonReject.slice(0, Math.min(12, nonReject.length));
  }

  const todayHighlightCandidates = simulationPool.filter(x =>
    x.structureState !== "flat" &&
    x.timingState !== "hot" &&
    x.exposureLevel !== "high"
  );

  const todayHighlightPool = todayHighlightCandidates
    .sort((a, b) => b.todayScore - a.todayScore)
    .slice(0, 5);

  const todayHighlightSet = new Set(todayHighlightPool.map(x => x.symbol));

  const watchPool = simulationPool.filter(x => !todayHighlightSet.has(x.symbol));

  return {
    p35: round2(p35),
    all_sorted: allSorted,
    today_highlight_pool: todayHighlightPool,
    watch_pool: watchPool,
    simulation_pool: simulationPool,
    reject_pool: rejectPool
  };
}

// ------------------------------------------
// 角色分群
// 這一步不是重算分數，而是決定 basket 用途
// ------------------------------------------
function inferRole(metrics) {
  const symbol = metrics.symbol;
  const category = metrics.category;

  const isAnchor =
    ANCHOR_SYMBOLS.has(symbol) ||
    (
      metrics.valuationScore >= 50 &&
      metrics.trendScore >= 6 &&
      ["core", "defensive", "income"].includes(category)
    );

  const isYieldDriver =
    metrics.structureScore >= 6 &&
    metrics.timingScore >= 6 &&
    metrics.moneyScore >= 6 &&
    (
      HIGH_BETA_SYMBOLS.has(symbol) ||
      ["cyclical_high_beta"].includes(category) ||
      ["AMD", "MU", "MRVL", "AMAT", "ARM", "AVGO"].includes(symbol)
    );

  const isSweetSpot =
    ["sweet", "sweet_max"].includes(metrics.structureState) &&
    metrics.trendState !== "down";

  const isDefensiveLike =
    DEFENSIVE_LIKE.has(symbol) ||
    category === "defensive" ||
    symbol === "QQQ" ||
    symbol === "LQD";

  if (isAnchor) return "anchor";
  if (isYieldDriver) return "yield_driver";
  if (isSweetSpot) return "sweet_spot";
  if (isDefensiveLike) return "defensive_like";
  return "neutral";
}

function attachRoles(pool) {
  return pool.map(x => ({
    ...x,
    role: inferRole(x)
  }));
}

// ------------------------------------------
// Basket 組合規則
// 高利率型：2 yield + 1 anchor + 1 sweet/neutral
// 平衡型：2 anchor + 1 yield + 1 neutral/defensive
// 保守型：3 anchor/defensive + 1 defensive/neutral
// 進攻型：3 yield + 1 anchor（最多少量）
// ------------------------------------------
function combine4(arrA, arrB, arrC, arrD) {
  const baskets = [];
  for (const a of arrA) {
    for (const b of arrB) {
      for (const c of arrC) {
        for (const d of arrD) {
          const symbols = [a.symbol, b.symbol, c.symbol, d.symbol];
          if (new Set(symbols).size < 4) continue;
          baskets.push([a, b, c, d]);
        }
      }
    }
  }
  return baskets;
}

function basketTypeRule(type, roles) {
  if (type === "high_yield") {
    return roles.filter(x => x.role === "yield_driver");
  }
  if (type === "balance") {
    return roles.filter(x => x.role === "anchor" || x.role === "defensive_like");
  }
  if (type === "defensive") {
    return roles.filter(x => x.role === "anchor" || x.role === "defensive_like");
  }
  if (type === "aggressive") {
    return roles.filter(x => x.role === "yield_driver");
  }
  return [];
}

function makeBasketCandidates(simulationPoolWithRoles) {
  const anchors = simulationPoolWithRoles.filter(x => x.role === "anchor");
  const yields = simulationPoolWithRoles.filter(x => x.role === "yield_driver");
  const sweets = simulationPoolWithRoles.filter(x => x.role === "sweet_spot" || x.role === "neutral");
  const defensives = simulationPoolWithRoles.filter(x => x.role === "defensive_like");
  const neutrals = simulationPoolWithRoles.filter(x => x.role === "neutral" || x.role === "sweet_spot");

  const raw = [];

  // 1. 高利率型：2 yield + 1 anchor + 1 sweet/neutral
  for (const basket of combine4(yields, yields, anchors, sweets)) {
    raw.push({
      basket_type: "high_yield",
      stocks: basket
    });
  }

  // 2. 平衡型：2 anchor + 1 yield + 1 neutral/defensive
  for (const basket of combine4(anchors, anchors, yields, [...neutrals, ...defensives])) {
    raw.push({
      basket_type: "balance",
      stocks: basket
    });
  }

  // 3. 保守型：3 anchor/defensive + 1 defensive/neutral
  const anchorDef = uniqBy([...anchors, ...defensives], x => x.symbol);
  for (const basket of combine4(anchorDef, anchorDef, anchorDef, [...defensives, ...neutrals])) {
    raw.push({
      basket_type: "defensive",
      stocks: basket
    });
  }

  // 4. 進攻型：3 yield + 1 anchor
  for (const basket of combine4(yields, yields, yields, anchors)) {
    raw.push({
      basket_type: "aggressive",
      stocks: basket
    });
  }

  // 去重
  const dedup = uniqBy(raw, x => {
    const symbols = x.stocks.map(s => s.symbol).sort().join("|");
    return `${x.basket_type}::${symbols}`;
  });

  return dedup;
}

// ------------------------------------------
// Basket 風控
// ------------------------------------------
function countHighBeta(stocks) {
  return stocks.filter(x =>
    HIGH_BETA_SYMBOLS.has(x.symbol) ||
    x.role === "yield_driver" ||
    x.category === "cyclical_high_beta"
  ).length;
}

function countAnchors(stocks) {
  return stocks.filter(x => x.role === "anchor").length;
}

function passesBasketRiskRule(candidate) {
  const stocks = candidate.stocks;
  const highBetaCount = countHighBeta(stocks);
  const anchorCount = countAnchors(stocks);

  // 至少一檔 anchor
  if (anchorCount < 1) return false;

  // 限制過度 high beta
  if (candidate.basket_type !== "aggressive" && highBetaCount > 2) return false;
  if (candidate.basket_type === "aggressive" && highBetaCount > 3) return false;

  // Defensive 型不能太多高 beta
  if (candidate.basket_type === "defensive" && highBetaCount > 1) return false;

  return true;
}

// ------------------------------------------
// Basket Score
// 仍以 M7 todayScore 為主
// 不重造新分數，只做 basket 層排序
// ------------------------------------------
function scoreBasket(candidate) {
  const stocks = candidate.stocks;

  const avgToday = avg(stocks.map(x => x.todayScore));
  const avgStructure = avg(stocks.map(x => x.structureScore));
  const avgTiming = avg(stocks.map(x => x.timingScore));
  const avgMoney = avg(stocks.map(x => x.moneyScore));
  const avgValuation = avg(stocks.map(x => x.valuationScore));

  const anchorCount = countAnchors(stocks);
  const highBetaCount = countHighBeta(stocks);
  const exposurePenalty = stocks.some(x => x.exposureLevel === "high") ? 2 : 0;
  const mediumExposurePenalty = stocks.filter(x => x.exposureLevel === "medium").length * 0.6;

  let typeBonus = 0;
  if (candidate.basket_type === "high_yield") typeBonus = 1.2;
  if (candidate.basket_type === "balance") typeBonus = 1.0;
  if (candidate.basket_type === "defensive") typeBonus = 0.8;
  if (candidate.basket_type === "aggressive") typeBonus = 0.4;

  const basketScore =
    avgToday * 0.5 +
    avgStructure * 0.2 +
    avgTiming * 0.1 +
    avgMoney * 0.1 +
    avgValuation * 0.1 +
    anchorCount * 1.5 +
    typeBonus -
    highBetaCount * 1.2 -
    exposurePenalty -
    mediumExposurePenalty;

  return {
    avg_today_score: round2(avgToday),
    avg_structure_score: round2(avgStructure),
    avg_timing_score: round2(avgTiming),
    avg_money_score: round2(avgMoney),
    avg_valuation_score: round2(avgValuation),
    anchor_count: anchorCount,
    high_beta_count: highBetaCount,
    basket_score: round2(basketScore)
  };
}

// ------------------------------------------
// 預估 basket 特性
// 這裡先不取代 M8 rate，只做 type 預估
// 真正 rate 請後續丟給 M8 engine
// ------------------------------------------
function inferBasketRateBand(candidate, scoreObj) {
  if (candidate.basket_type === "high_yield") {
    return "18% ~ 24%";
  }
  if (candidate.basket_type === "balance") {
    return "14% ~ 18%";
  }
  if (candidate.basket_type === "defensive") {
    return "10% ~ 13%";
  }
  if (candidate.basket_type === "aggressive") {
    return "20% ~ 26%";
  }

  // fallback
  if (scoreObj.avg_today_score >= 90) return "17% ~ 22%";
  if (scoreObj.avg_today_score >= 80) return "14% ~ 18%";
  return "10% ~ 14%";
}

function inferBasketReason(candidate) {
  const symbols = candidate.stocks.map(x => x.symbol);
  const type = candidate.basket_type;

  if (type === "high_yield") {
    return "以高波動半導體/成長股拉高 coupon，搭配至少一檔核心 anchor 壓住 worst-of。";
  }
  if (type === "balance") {
    return "核心股做底，加一檔 yield driver 提升利率，適合主力配置。";
  }
  if (type === "defensive") {
    return "以可接核心股與防禦型標的為主，追求較低風險與穩定率。";
  }
  if (type === "aggressive") {
    return "高 beta 標的比例較高，僅適合少量配置，目標是最大化 rate。";
  }

  return `Basket：${symbols.join(" / ")}。`;
}

// ------------------------------------------
// 輸出整理
// ------------------------------------------
function formatBasket(candidate, scoreObj) {
  const symbols = candidate.stocks.map(x => x.symbol);
  const names = candidate.stocks.map(x => x.name);

  return {
    basket_type: candidate.basket_type,
    symbols,
    names,
    stocks: candidate.stocks.map(x => ({
      symbol: x.symbol,
      name: x.name,
      role: x.role,
      category: x.category,
      today_score: x.todayScore,
      valuation_score: x.valuationScore,
      trend_score: x.trendScore,
      structure_score: x.structureScore,
      timing_score: x.timingScore,
      money_score: x.moneyScore,
      exposure_level: x.exposureLevel
    })),
    ...scoreObj,
    expected_rate_band: inferBasketRateBand(candidate, scoreObj),
    reason: inferBasketReason(candidate)
  };
}

// ------------------------------------------
// 主流程
// ------------------------------------------
function run() {
  const m7 = loadM7();
  const pools = buildPools(m7.rows);

  const simulationPoolWithRoles = attachRoles(pools.simulation_pool);

  const allCandidates = makeBasketCandidates(simulationPoolWithRoles)
    .filter(passesBasketRiskRule)
    .map(x => {
      const scoreObj = scoreBasket(x);
      return formatBasket(x, scoreObj);
    })
    .sort((a, b) => b.basket_score - a.basket_score);

  // 各類型取前段，避免全部被同一類型洗掉
  const topHighYield = allCandidates.filter(x => x.basket_type === "high_yield").slice(0, 5);
  const topBalance = allCandidates.filter(x => x.basket_type === "balance").slice(0, 5);
  const topDefensive = allCandidates.filter(x => x.basket_type === "defensive").slice(0, 3);
  const topAggressive = allCandidates.filter(x => x.basket_type === "aggressive").slice(0, 2);

  const topCandidates = uniqBy(
    [...topHighYield, ...topBalance, ...topDefensive, ...topAggressive]
      .sort((a, b) => b.basket_score - a.basket_score),
    x => x.symbols.slice().sort().join("|")
  ).slice(0, 10);

  const output = {
    generated_at: new Date().toISOString(),
    source_generated_at: m7.generated_at,
    m2_generated_at: m7.m2_generated_at,

    blueprint: {
      core_principle_1: "不改 M7 today_score / valuationRaw 邏輯",
      core_principle_2: "simulation_pool 一定保底，避免 M8 斷料",
      core_principle_3: "basket score 以 avg(today_score) 為主，其他只做微調",
      pool_logic: {
        reject_pool: "speculative / trend down / high exposure + danger / 結構flat且timing hot且落在後段",
        simulation_pool: "非 reject 前 15 名，並保留 anchor reserve",
        today_highlight_pool: "simulation_pool 中結構非 flat、timing 非 hot、exposure 非 high 的前 5 名",
        watch_pool: "simulation_pool 扣掉 today_highlight_pool"
      },
      basket_logic: {
        high_yield: "2 yield + 1 anchor + 1 sweet/neutral",
        balance: "2 anchor + 1 yield + 1 neutral/defensive",
        defensive: "3 anchor/defensive + 1 defensive/neutral",
        aggressive: "3 yield + 1 anchor"
      }
    },

    pools: {
      p35_score: pools.p35,
      today_highlight_pool: pools.today_highlight_pool.map(x => ({
        symbol: x.symbol,
        today_score: x.todayScore,
        role: inferRole(x),
        category: x.category
      })),
      watch_pool: pools.watch_pool.map(x => ({
        symbol: x.symbol,
        today_score: x.todayScore,
        role: inferRole(x),
        category: x.category
      })),
      simulation_pool: simulationPoolWithRoles.map(x => ({
        symbol: x.symbol,
        today_score: x.todayScore,
        role: x.role,
        category: x.category
      })),
      reject_pool: pools.reject_pool.map(x => ({
        symbol: x.symbol,
        today_score: x.todayScore,
        category: x.category
      }))
    },

    top_baskets: topCandidates,
    basket_candidates_count: allCandidates.length
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");

  console.log(`✅ m8_basket_candidates.json 已產出`);
  console.log(`✅ simulation_pool: ${simulationPoolWithRoles.length} 檔`);
  console.log(`✅ basket candidates: ${allCandidates.length} 組`);
  console.log(`✅ top baskets: ${topCandidates.length} 組`);
}

run();
