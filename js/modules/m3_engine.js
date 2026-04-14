// ==========================================
// m3_engine.js
// 振宇 FCN 系統｜M3 主觀偏好模擬引擎
// 完整版：Dashboard / Simulation Meta / Qualified Meta / M5 Payload
// ==========================================

import { runM8Case } from "../core/m8_batch_engine.js";
import { mergeStockData, evaluateStock } from "../core/stock_engine.js";
import { evaluateFCN } from "../core/fcn_engine.js";

// ------------------------------------------
// 工具
// ------------------------------------------
function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 2) {
  const f = 10 ** digits;
  return Math.round(toNumber(value, 0) * f) / f;
}

function safeText(v, fallback = "-") {
  if (v === null || v === undefined || v === "") return fallback;
  return String(v);
}

function normalizePctMaybe(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  if (Math.abs(n) <= 1.5) return n * 100;
  return n;
}

function formatPctMaybe(v, digits = 2) {
  const n = normalizePctMaybe(v);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} 載入失敗：${res.status}`);
  return await res.json();
}

// ------------------------------------------
// 統計工具
// ------------------------------------------
function calcStats(values) {
  const arr = (values || []).map(Number).filter(Number.isFinite);

  if (!arr.length) {
    return {
      count: 0,
      mean: null,
      std: null,
      min: null,
      max: null
    };
  }

  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance =
    arr.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / arr.length;
  const std = Math.sqrt(variance);

  return {
    count: arr.length,
    mean: round(mean, 2),
    std: round(std, 2),
    min: round(Math.min(...arr), 2),
    max: round(Math.max(...arr), 2)
  };
}

function uniqueArray(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

// ------------------------------------------
// M3 基本邏輯
// ------------------------------------------
function buildWhyWhyNot(stock) {
  const pure = toNumber(stock.pure_stock_score, 0);
  const snapshot = toNumber(stock.snapshot_score, 0);
  const eventStock = toNumber(stock.event_stock_score, 0);
  const delta = toNumber(stock.delta_stock_score, 0);

  const why = [];
  const whyNot = [];

  if (pure >= 7) why.push("Pure 分數高，屬高品質可接股");
  else if (pure >= 5) why.push("Pure 分數合格，可納入 FCN 考慮");
  else if (pure >= 4) why.push("Pure 分數勉強合格，僅可列觀察");
  else whyNot.push("Pure 分數太低，不願意接這種股票");

  if (eventStock >= 10) why.push("Event 分數高，現在時點偏甜");
  else if (eventStock >= 6) why.push("Event 分數合理，現在價格可接受");
  else if (eventStock >= 4) whyNot.push("Event 分數普通，現在不夠便宜");
  else whyNot.push("Event 分數過低，時點不適合");

  if (snapshot > 0) why.push("Snapshot 為正，短期位置有甜度");
  else if (snapshot < 0) whyNot.push("Snapshot 為負，位置偏高或偏熱");
  else whyNot.push("Snapshot 中性，沒有明顯甜度");

  if (delta > 0) why.push("Delta 為正，現在比平常更甜");
  else if (delta === 0) whyNot.push("Delta = 0，目前沒有額外甜度");
  else whyNot.push("Delta 為負，現在比平常更貴");

  if (stock.suggestion === "避免納入 FCN") whyNot.push("Stock Engine 已建議避免納入 FCN");
  if (stock.trend === "downtrend") whyNot.push("趨勢屬弱勢下跌");
  if (stock.trend === "dead_cat_bounce") whyNot.push("屬弱勢反彈，不宜誤判為甜點");

  return { why, whyNot };
}

function reviewStockForM3(stock) {
  const pure = toNumber(stock.pure_stock_score, 0);
  const eventStock = toNumber(stock.event_stock_score, 0);
  const delta = round(eventStock - pure, 2);

  let bucket = "clean";
  if (pure < 4 || stock.suggestion === "避免納入 FCN") {
    bucket = "reject";
  } else if (pure < 5 || eventStock < 6 || delta <= 0) {
    bucket = "watch";
  } else {
    bucket = "clean";
  }

  const { why, whyNot } = buildWhyWhyNot({
    ...stock,
    delta_stock_score: delta
  });

  return {
    ...stock,
    m1_event_score: toNumber(stock.event_score, 0),
    delta_stock_score: delta,
    bucket,
    why,
    whyNot
  };
}

function splitByBucket(stocks) {
  return {
    reviewed: stocks,
    clean_pool: stocks.filter(x => x.bucket === "clean"),
    watch_list: stocks.filter(x => x.bucket === "watch"),
    reject_list: stocks.filter(x => x.bucket === "reject")
  };
}

// ------------------------------------------
// 模擬組合
// ------------------------------------------
function generateCombinations(arr, size) {
  const result = [];

  function helper(start, combo) {
    if (combo.length === size) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }

  if (size > 0 && arr.length >= size) helper(0, []);
  return result;
}

function getScenarioArrays(scenario) {
  const normalizeToArray = (v, fallback = []) =>
    Array.isArray(v) ? v : (v === undefined ? fallback : [v]);

  return {
    basket_sizes: normalizeToArray(scenario.basket_size),
    kis: normalizeToArray(scenario.ki),
    strikes: normalizeToArray(scenario.strike),
    tenors: normalizeToArray(scenario.tenor),
    rates: normalizeToArray(scenario.rate),
    ekis: normalizeToArray(scenario.eki)
  };
}

function getFairFlag(gap) {
  const g = Number(gap);
  if (!Number.isFinite(g)) return "待接 M8";
  if (g >= 1.5) return "🔥 市場高估（甜）";
  if (g >= 0.5) return "👍 略甜";
  if (g >= -0.5) return "👌 合理";
  return "❌ 市場不買單";
}

// ------------------------------------------
// 健康度 / 市場評價
// ------------------------------------------
function calcHealthPct(fcn) {
  const worst = toNumber(fcn?.r1?.event_stock_score, 0);
  const avg = toNumber(fcn?.avgEventStock, 0);

  const score = 0.6 * worst + 0.4 * avg;
  return Math.max(0, Math.min(100, round((score / 12) * 100, 1)));
}

function getPreferenceLevel(eventFcn) {
  const x = toNumber(eventFcn, 0);
  if (x >= 10) return "高偏好";
  if (x >= 9) return "中高偏好";
  if (x >= 7.5) return "中偏好";
  return "低偏好";
}

function getMarketScore(gap, fairRate) {
  const g = Number(gap);
  const f = Number(fairRate);

  if (!Number.isFinite(g) || !Number.isFinite(f) || f === 0) return null;
  return round((g / f) * 100, 1);
}

function getMarketLevel(gap) {
  const g = Number(gap);
  if (!Number.isFinite(g)) return "待接 M8";
  if (g >= 1.5) return "非常划算";
  if (g >= 0.5) return "偏划算";
  if (g >= 0.0) return "合理可做";
  if (g >= -0.5) return "略嫌不足";
  if (g >= -1.5) return "不划算";
  return "明顯不划算";
}

// ------------------------------------------
// 達標條件
// ------------------------------------------
export function isQualified(f) {
  return (
    toNumber(f.event_fcn, 0) >= 8 &&
    toNumber(f.fair_gap, -999) >= -1 &&
    toNumber(f.health_pct, 0) >= 30
  );
}

// ------------------------------------------
// M3 Simulation
// ------------------------------------------
async function runSimulation(cleanPool, config) {
  const results = [];
  const scenarioGroup = config["M3_FCN情境組合參數"] || {};
  const scenarios = scenarioGroup.scenarios || [];
  const rankingCfg = config["M3_排名評分參數"] || {};
  const simCfg = config["M3_模擬控制參數"] || {};
  const maxCombinations = toNumber(simCfg.max_combinations, 50);

  for (const scenario of scenarios) {
    const arrays = getScenarioArrays(scenario);

    for (const basketSize of arrays.basket_sizes) {
      const combos = generateCombinations(cleanPool, toNumber(basketSize, 0)).slice(0, maxCombinations);

      for (let idx = 0; idx < combos.length; idx++) {
        const combo = combos[idx];

        for (const ki of arrays.kis) {
          for (const strike of arrays.strikes) {
            for (const tenor of arrays.tenors) {
              for (const rate of arrays.rates) {
                for (const eki of arrays.ekis) {
                  const type = eki ? "AKI" : "EKI";

                  const fcn = evaluateFCN({
                    id: `${safeText(scenario["名稱"], "SC")}_${idx + 1}`,
                    basket: combo.map(s => s.symbol),
                    ki: toNumber(ki, 0),
                    strike: toNumber(strike, 0),
                    yield: toNumber(rate, 0),
                    period: toNumber(tenor, 0),
                    eki: !!eki
                  }, combo);

                  if (!fcn) continue;

                  let fairRate = null;
                  let fairGap = null;
                  let fairFlag = "待接 M8";
                  let fairReason = "";

                  try {
                    const m8 = await runM8Case({
                      caseName: `${safeText(scenario["名稱"], "SC")}_${idx + 1}`,
                      symbols: combo.map(s => s.symbol),
                      KI: toNumber(ki, 0),
                      Strike: toNumber(strike, 0),
                      T: toNumber(tenor, 0),
                      type,
                      marketYield: toNumber(rate, 0)
                    });

                    fairRate = toNumber(m8?.fair_yield, null);
                    fairGap = Number.isFinite(fairRate)
                      ? round(fairRate - toNumber(rate, 0), 2)
                      : null;
                    fairFlag = safeText(m8?.pricing_view, getFairFlag(fairGap));
                    fairReason = safeText(m8?.note, "");
                  } catch (err) {
                    console.warn("M8 pricing failed:", err);
                  }

                  const eventFcn = toNumber(fcn.event_fcn, 0);
                  const healthPct = calcHealthPct(fcn);

                  results.push({
                    ...fcn,
                    scenario_name: safeText(scenario["名稱"], "未命名情境"),
                    scenario_comment: safeText(scenario["說明"], ""),
                    scenario_type: safeText(scenario["類型"], ""),
                    scenario_goal: safeText(scenario["目標"], ""),

                    basket_size: toNumber(basketSize, 0),
                    simulation_rate: toNumber(rate, 0),
                    tenor: toNumber(tenor, 0),

                    m3_score: eventFcn,

                    fair_rate: fairRate,
                    fair_gap: fairGap,
                    fair_flag: fairFlag,
                    fair_reason: fairReason,

                    health_pct: healthPct,
                    preference_level: getPreferenceLevel(eventFcn),
                    market_level: getMarketLevel(fairGap),
                    market_score: getMarketScore(fairGap, fairRate),

                    suggestion_rank:
                      eventFcn >= toNumber(rankingCfg.strong_buy_min_event_fcn, 12) ? "strong" :
                      eventFcn >= toNumber(rankingCfg.buy_min_event_fcn, 9) ? "buy" :
                      eventFcn >= toNumber(rankingCfg.watch_min_event_fcn, 6) ? "watch" :
                      "avoid"
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  results.sort((a, b) => toNumber(b.event_fcn, -999) - toNumber(a.event_fcn, -999));
  return results;
}

// ------------------------------------------
// Summary / Scenario / Rate
// ------------------------------------------
function buildSummary(selection, sims) {
  const reviewed = selection.reviewed || [];
  const clean = selection.clean_pool || [];
  const watch = selection.watch_list || [];
  const reject = selection.reject_list || [];
  const top = sims[0];

  return {
    reviewed_count: reviewed.length,
    clean_count: clean.length,
    watch_count: watch.length,
    reject_count: reject.length,
    simulation_count: sims.length,
    best_event_fcn: top ? toNumber(top.event_fcn, 0) : null,
    best_basket: top ? top.basket : ""
  };
}

function buildScenarioSummary(sims) {
  const map = {};

  sims.forEach(x => {
    const name = x.scenario_name || "未知情境";

    if (!map[name]) {
      map[name] = {
        scenario_name: name,
        scenario_comment: x.scenario_comment || "",
        total: 0,
        qualified: 0,
        best_event_fcn: -999,
        best_basket: "",
        avg_event_fcn: 0,
        rows: []
      };
    }

    map[name].total += 1;
    map[name].rows.push(x);

    if (isQualified(x)) map[name].qualified += 1;

    if (toNumber(x.event_fcn, -999) > map[name].best_event_fcn) {
      map[name].best_event_fcn = toNumber(x.event_fcn, -999);
      map[name].best_basket = x.basket;
    }
  });

  return Object.values(map)
    .map(item => {
      const avg = item.rows.reduce((sum, r) => sum + toNumber(r.event_fcn, 0), 0) / Math.max(item.rows.length, 1);
      return {
        ...item,
        avg_event_fcn: round(avg, 2),
        success_rate: round((item.qualified / Math.max(item.total, 1)) * 100, 1)
      };
    })
    .sort((a, b) => b.success_rate - a.success_rate || b.best_event_fcn - a.best_event_fcn);
}

function buildRateDistribution(sims) {
  const buckets = [
    { key: "<15", min: -Infinity, max: 15 },
    { key: "15-18", min: 15, max: 18 },
    { key: "18-20", min: 18, max: 20 },
    { key: "20以上", min: 20, max: Infinity }
  ];

  return buckets.map(b => {
    const rows = sims.filter(x => {
      const r = toNumber(x.simulation_rate, 0);
      return r >= b.min && r < b.max;
    });

    const ok = rows.filter(isQualified).length;

    return {
      bucket: b.key,
      total: rows.length,
      qualified: ok,
      success_rate: rows.length ? round((ok / rows.length) * 100, 1) : 0
    };
  });
}

// ------------------------------------------
// Simulation Meta / Qualified Meta / Compare
// ------------------------------------------
function buildSymbolStatsFromRows(rows) {
  const map = {};

  rows.forEach(row => {
    const components = Array.isArray(row.components) ? row.components : [];

    components.forEach(c => {
      const symbol = safeText(c.symbol, "");
      if (!symbol) return;

      if (!map[symbol]) {
        map[symbol] = {
          symbol,
          count: 0,
          event_scores: [],
          pure_scores: [],
          snapshot_scores: []
        };
      }

      map[symbol].count += 1;
      map[symbol].event_scores.push(toNumber(c.event_stock_score, null));
      map[symbol].pure_scores.push(toNumber(c.pure_stock_score, null));
      map[symbol].snapshot_scores.push(toNumber(c.snapshot_score, null));
    });
  });

  return Object.values(map)
    .map(x => ({
      symbol: x.symbol,
      count: x.count,
      avg_event_score: calcStats(x.event_scores).mean,
      avg_pure_score: calcStats(x.pure_scores).mean,
      avg_snapshot_score: calcStats(x.snapshot_scores).mean
    }))
    .sort((a, b) => b.count - a.count || toNumber(b.avg_event_score, 0) - toNumber(a.avg_event_score, 0));
}

function buildScenarioStatsFromRows(rows) {
  const map = {};

  rows.forEach(row => {
    const name = row.scenario_name || "未知情境";

    if (!map[name]) {
      map[name] = {
        scenario_name: name,
        scenario_type: safeText(row.scenario_type, "-"),
        scenario_goal: safeText(row.scenario_goal, "-"),
        count: 0,
        m3_scores: [],
        gaps: [],
        healths: [],
        rates: []
      };
    }

    map[name].count += 1;
    map[name].m3_scores.push(toNumber(row.event_fcn, null));
    map[name].gaps.push(toNumber(row.fair_gap, null));
    map[name].healths.push(toNumber(row.health_pct, null));
    map[name].rates.push(toNumber(row.simulation_rate, null));
  });

  return Object.values(map)
    .map(x => ({
      scenario_name: x.scenario_name,
      scenario_type: x.scenario_type,
      scenario_goal: x.scenario_goal,
      count: x.count,
      avg_m3_score: calcStats(x.m3_scores).mean,
      avg_gap: calcStats(x.gaps).mean,
      avg_health: calcStats(x.healths).mean,
      avg_rate: calcStats(x.rates).mean
    }))
    .sort((a, b) => b.count - a.count || toNumber(b.avg_m3_score, 0) - toNumber(a.avg_m3_score, 0));
}

function buildSimulationMeta(selection, sims) {
  const cleanPool = selection?.clean_pool || [];
  const scenarioMap = new Map();

  sims.forEach(row => {
    const key = row.scenario_name || "未知情境";
    if (!scenarioMap.has(key)) {
      scenarioMap.set(key, {
        scenario_name: key,
        scenario_type: safeText(row.scenario_type, "-"),
        scenario_goal: safeText(row.scenario_goal, "-"),
        source: "parameter_matrix.json / M3_FCN情境組合參數"
      });
    }
  });

  return {
    simulated_stock_count: cleanPool.length,
    simulated_stocks: cleanPool.map(s => ({
      symbol: s.symbol,
      score: round(toNumber(s.event_stock_score, 0), 2)
    })),
    scenario_count: scenarioMap.size,
    scenarios: [...scenarioMap.values()],
    stock_stats: calcStats(cleanPool.map(s => toNumber(s.event_stock_score, null))),
    gap_stats: calcStats(sims.map(s => toNumber(s.fair_gap, null))),
    m3_stats: calcStats(sims.map(s => toNumber(s.event_fcn, null))),
    health_stats: calcStats(sims.map(s => toNumber(s.health_pct, null))),
    symbol_stats: buildSymbolStatsFromRows(sims),
    scenario_stats: buildScenarioStatsFromRows(sims),
    qualification_rules: {
      m3_score_min: 8,
      fair_gap_min: -1,
      health_min: 30,
      source: "m3_engine.js / isQualified()"
    }
  };
}

function buildQualifiedMeta(sims) {
  const qualified = sims.filter(isQualified);
  const qualifiedScenarioNames = uniqueArray(qualified.map(x => x.scenario_name));

  return {
    qualified_count: qualified.length,
    qualified_stock_count: uniqueArray(
      qualified.flatMap(x => Array.isArray(x.basket) ? x.basket : String(x.basket || "").split(",").map(s => s.trim()))
    ).filter(Boolean).length,
    qualified_scenario_count: qualifiedScenarioNames.length,
    gap_stats: calcStats(qualified.map(s => toNumber(s.fair_gap, null))),
    m3_stats: calcStats(qualified.map(s => toNumber(s.event_fcn, null))),
    health_stats: calcStats(qualified.map(s => toNumber(s.health_pct, null))),
    rate_stats: calcStats(qualified.map(s => toNumber(s.simulation_rate, null))),
    symbol_stats: buildSymbolStatsFromRows(qualified),
    scenario_stats: buildScenarioStatsFromRows(qualified)
  };
}

function buildCompareStats(simMeta, qualifiedMeta) {
  const simCount = toNumber(simMeta?.symbol_stats?.length, 0);
  const qualCount = toNumber(qualifiedMeta?.symbol_stats?.length, 0);
  const simScenarioCount = toNumber(simMeta?.scenario_stats?.length, 0);
  const qualScenarioCount = toNumber(qualifiedMeta?.scenario_stats?.length, 0);

  return {
    stock_capture_rate: simCount ? round((qualCount / simCount) * 100, 1) : 0,
    scenario_capture_rate: simScenarioCount ? round((qualScenarioCount / simScenarioCount) * 100, 1) : 0,
    gap_mean_delta:
      Number.isFinite(simMeta?.gap_stats?.mean) && Number.isFinite(qualifiedMeta?.gap_stats?.mean)
        ? round(qualifiedMeta.gap_stats.mean - simMeta.gap_stats.mean, 2)
        : null,
    m3_mean_delta:
      Number.isFinite(simMeta?.m3_stats?.mean) && Number.isFinite(qualifiedMeta?.m3_stats?.mean)
        ? round(qualifiedMeta.m3_stats.mean - simMeta.m3_stats.mean, 2)
        : null,
    health_mean_delta:
      Number.isFinite(simMeta?.health_stats?.mean) && Number.isFinite(qualifiedMeta?.health_stats?.mean)
        ? round(qualifiedMeta.health_stats.mean - simMeta.health_stats.mean, 2)
        : null
  };
}

// ------------------------------------------
// Best example / Dashboard / Decision
// ------------------------------------------
function pickBestQualifiedExample(sims) {
  const qualified = sims.filter(isQualified);
  if (!qualified.length) return null;

  return [...qualified].sort((a, b) => {
    const scoreA =
      toNumber(a.event_fcn, 0) * 1.0 +
      toNumber(a.fair_gap, 0) * 0.6 +
      toNumber(a.health_pct, 0) * 0.03;

    const scoreB =
      toNumber(b.event_fcn, 0) * 1.0 +
      toNumber(b.fair_gap, 0) * 0.6 +
      toNumber(b.health_pct, 0) * 0.03;

    return scoreB - scoreA;
  })[0];
}

function buildDashboard(summary, scenarioSummary, rateDistribution, sims, selection) {
  const qualified = sims.filter(isQualified);
  const overallSuccessRate = sims.length
    ? round((qualified.length / sims.length) * 100, 1)
    : 0;

  const bestScenario = scenarioSummary.length ? scenarioSummary[0] : null;
  const simulationMeta = buildSimulationMeta(selection, sims);
  const qualifiedMeta = buildQualifiedMeta(sims);
  const compareStats = buildCompareStats(simulationMeta, qualifiedMeta);
  const bestQualifiedExample = pickBestQualifiedExample(sims);

  return {
    total_simulations: sims.length,
    total_qualified: qualified.length,
    overall_success_rate: overallSuccessRate,

    best_scenario: bestScenario,
    simulation_meta: simulationMeta,
    qualified_meta: qualifiedMeta,
    compare_stats: compareStats,
    best_qualified_example: bestQualifiedExample,

    summary,
    scenario_summary: scenarioSummary,
    rate_distribution: rateDistribution
  };
}

function buildFinalDecision(sims, topN = 5) {
  return sims
    .filter(isQualified)
    .sort((a, b) => {
      const scoreA =
        toNumber(a.event_fcn, 0) * 1.0 +
        toNumber(a.fair_gap, 0) * 0.6 +
        toNumber(a.health_pct, 0) * 0.03;

      const scoreB =
        toNumber(b.event_fcn, 0) * 1.0 +
        toNumber(b.fair_gap, 0) * 0.6 +
        toNumber(b.health_pct, 0) * 0.03;

      return scoreB - scoreA;
    })
    .slice(0, topN);
}

function buildM5Payload(selection, sims, dashboard, finalDecision) {
  return {
    generated_at: new Date().toISOString(),
    source: "M3 Engine",
    qualification_rules: dashboard?.simulation_meta?.qualification_rules || {},
    simulated_universe: {
      clean_pool_symbols: (selection?.clean_pool || []).map(x => x.symbol),
      simulated_stock_count: dashboard?.simulation_meta?.simulated_stock_count || 0,
      simulated_scenario_count: dashboard?.simulation_meta?.scenario_count || 0,
      stock_stats: dashboard?.simulation_meta?.stock_stats || {},
      gap_stats: dashboard?.simulation_meta?.gap_stats || {},
      m3_stats: dashboard?.simulation_meta?.m3_stats || {},
      health_stats: dashboard?.simulation_meta?.health_stats || {}
    },
    qualified_universe: {
      qualified_count: dashboard?.qualified_meta?.qualified_count || 0,
      qualified_stock_count: dashboard?.qualified_meta?.qualified_stock_count || 0,
      qualified_scenario_count: dashboard?.qualified_meta?.qualified_scenario_count || 0,
      gap_stats: dashboard?.qualified_meta?.gap_stats || {},
      m3_stats: dashboard?.qualified_meta?.m3_stats || {},
      health_stats: dashboard?.qualified_meta?.health_stats || {},
      rate_stats: dashboard?.qualified_meta?.rate_stats || {}
    },
    compare_stats: dashboard?.compare_stats || {},
    qualified_symbol_stats: dashboard?.qualified_meta?.symbol_stats || [],
    qualified_scenario_stats: dashboard?.qualified_meta?.scenario_stats || [],
    top_qualified_examples: finalDecision || [],
    total_simulations: sims.length
  };
}

// ------------------------------------------
// 主流程
// ------------------------------------------
export async function runM3Engine() {
  const [pool30, marketRuntime, config] = await Promise.all([
    loadJSON("./data/pool30.json"),
    loadJSON("./data/market_runtime.json"),
    loadJSON("./data/parameter_matrix.json")
  ]);

  const stockSelectionCfg = config["M3_股票篩選情境參數"] || {};

  const cleanMinPure = toNumber(stockSelectionCfg.clean_min_pure, 6);
  const cleanMinEvent = toNumber(stockSelectionCfg.clean_min_event, 6);
  const cleanMinDelta = toNumber(stockSelectionCfg.clean_min_delta, 0);
  const cleanUseDeltaGate = !!stockSelectionCfg.clean_use_delta_gate;

  const watchMinPure = toNumber(stockSelectionCfg.watch_min_pure, 5);
  const watchMinEvent = toNumber(stockSelectionCfg.watch_min_event, 5);
  const watchUseOrLogic = stockSelectionCfg.watch_use_or_logic !== false;

  const rejectIfAvoid = !!stockSelectionCfg.reject_if_suggestion_avoid;

  const stockResults = (pool30 || [])
    .map(stock => mergeStockData(stock, marketRuntime || {}))
    .map(stock => evaluateStock(stock, config))
    .map(stock => {
      const reviewed = reviewStockForM3(stock);

      const pure = toNumber(reviewed.pure_stock_score, 0);
      const eventStock = toNumber(reviewed.event_stock_score, 0);

      const passCleanBase =
        pure >= cleanMinPure &&
        eventStock >= cleanMinEvent;

      const passCleanDelta =
        !cleanUseDeltaGate || reviewed.delta_stock_score >= cleanMinDelta;

      const passWatch =
        watchUseOrLogic
          ? (pure >= watchMinPure || eventStock >= watchMinEvent)
          : (pure >= watchMinPure && eventStock >= watchMinEvent);

      if (rejectIfAvoid && reviewed.suggestion === "避免納入 FCN") {
        reviewed.bucket = "reject";
      } else if (passCleanBase && passCleanDelta) {
        reviewed.bucket = "clean";
      } else if (passWatch) {
        reviewed.bucket = "watch";
      } else {
        reviewed.bucket = "reject";
      }

      return reviewed;
    })
    .sort((a, b) => toNumber(b.event_stock_score, 0) - toNumber(a.event_stock_score, 0));

  const selection = splitByBucket(stockResults);
  const simulationResults = await runSimulation(selection.clean_pool, config);

  const summary = buildSummary(selection, simulationResults);
  const scenarioSummary = buildScenarioSummary(simulationResults);
  const rateDistribution = buildRateDistribution(simulationResults);
  const dashboard = buildDashboard(
    summary,
    scenarioSummary,
    rateDistribution,
    simulationResults,
    selection
  );

  const simCfg = config["M3_模擬控制參數"] || {};
  const topNOutput = toNumber(simCfg.top_n_output, 5);
  const finalDecision = buildFinalDecision(simulationResults, Math.min(topNOutput, 5));
  const m5_payload = buildM5Payload(selection, simulationResults, dashboard, finalDecision);

  return {
    generated_at: new Date().toISOString(),
    config,
    stockResults,
    selection,
    simulationResults,
    summary,
    scenarioSummary,
    rateDistribution,
    dashboard,
    finalDecision,
    m5_payload
  };
}

// ------------------------------------------
// 給外部 UI 用的輕量文字摘要
// ------------------------------------------
export function buildDashboardConclusion(cache) {
  const dashboard = cache.dashboard || {};
  const qualified = toNumber(dashboard.total_qualified, 0);
  const total = toNumber(dashboard.total_simulations, 0);

  if (!total) {
    return "尚未產生模擬結果。";
  }

  if (!qualified) {
    return "本次無達標組。可能原因：市場 fair rate 未支持、偏好分數不足，或結構健康度不足。";
  }

  const bestScenario = dashboard.best_scenario?.scenario_name || "未知";
  const stockCaptureRate = toNumber(dashboard.compare_stats?.stock_capture_rate, 0);
  const scenarioCaptureRate = toNumber(dashboard.compare_stats?.scenario_capture_rate, 0);

  return `本次模擬共 ${total} 組，達標 ${qualified} 組，最有效策略為「${bestScenario}」。達標標的涵蓋率 ${stockCaptureRate}%；達標情境涵蓋率 ${scenarioCaptureRate}%。`;
}
