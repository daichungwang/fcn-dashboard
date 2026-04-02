// ==========================================
// decision_module_v1.js
// 振宇 FCN 系統｜Decision Module V1
// 讀取：pool30 / fcn_pool / market_runtime
// 輸出：runtime_cache / history（先存 localStorage）
// ==========================================

const RUNTIME_CACHE_KEY = "runtime_cache_v1";
const FCN_HISTORY_KEY = "fcn_snapshot_history_v1";

// ------------------------------------------
// 工具
// ------------------------------------------
function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function avg(arr = []) {
  if (!arr.length) return 0;
  return round(arr.reduce((a, b) => a + b, 0) / arr.length, 2);
}

function safeReadJsonFromLocalStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeWriteJsonToLocalStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value, null, 2));
}

function nowIso() {
  return new Date().toISOString();
}

function getStatusClass(status) {
  return {
    inquiry: "s-inquiry",
    watch: "s-watch",
    active: "s-active",
    closed: "s-closed",
    expired: "s-expired"
  }[status] || "";
}

// ------------------------------------------
// Pool30 category baseline
// 依你目前 stock_engine 的 category 邏輯
// ------------------------------------------
const CATEGORY_MAP = {
  core: { label: "核心", base: 10 },
  growth: { label: "成長", base: 8 },
  defensive: { label: "防禦", base: 7 },
  income: { label: "收益", base: 6 },
  speculative: { label: "投機", base: 1 }
};

function getCategory(stock = {}) {
  return stock.category || "speculative";
}

function getBaselineLabel(stock = {}) {
  return CATEGORY_MAP[getCategory(stock)]?.label || "投機";
}

function calcBaselineScore(stock = {}) {
  return CATEGORY_MAP[getCategory(stock)]?.base ?? 1;
}

// ------------------------------------------
// Pure stock：中期波動邏輯
// 公式：0.1*|1m| + 0.3*|6m| + 0.6*|12m|
// ------------------------------------------
function calcMidTermVolatility(stock = {}) {
  const r1m = Math.abs(toNumber(stock.ret_1m, 0));
  const r6m = Math.abs(toNumber(stock.ret_6m, 0));
  const r12m = Math.abs(toNumber(stock.ret_12m, 0));
  return round(0.1 * r1m + 0.3 * r6m + 0.6 * r12m, 4);
}

// 依你現有程式截圖邏輯
function calcVolScore(volatility = 0) {
  const v = Math.abs(toNumber(volatility, 0));
  let score = 0;

  if (v <= 0.05) {
    score = 0;
  } else if (v <= 0.60) {
    // 每 5% 一格，從 0 慢慢扣到 -2
    const extra = v - 0.05;
    const steps = Math.floor(extra / 0.05) + 1;
    score = Math.max(-2, -(steps * 0.2));
  } else if (v <= 0.80) {
    score = -2.5;
  } else {
    score = -3;
  }

  return round(score, 2);
}

function calcVolLabel(volatility = 0) {
  const v = Math.abs(toNumber(volatility, 0));
  if (v <= 0.20) return "低波動";
  if (v <= 0.40) return "中等波動";
  if (v <= 0.60) return "中高波動";
  return "高波動";
}

function calcPureStock(stock = {}) {
  const baseline = calcBaselineScore(stock);
  const midVol = calcMidTermVolatility(stock);
  const volScore = calcVolScore(midVol);
  return round(baseline + volScore, 2);
}

// ------------------------------------------
// Snapshot：你現在已定稿版本
// momentum = 0.6*1d + 0.3*1w + 0.1*1m
// ------------------------------------------
function calcMomentum(stock = {}) {
  const r1d = toNumber(stock.ret_1d, 0);
  const r1w = toNumber(stock.ret_1w, 0);
  const r1m = toNumber(stock.ret_1m, 0);
  return round(0.6 * r1d + 0.3 * r1w + 0.1 * r1m, 4);
}

function calcSnapshotScore(stock = {}) {
  const movePct = round(calcMomentum(stock) * 100, 2);

  if (movePct <= -30) return 10;
  if (movePct <= -25) return 9;
  if (movePct <= -20) return 8;
  if (movePct <= -15) return 6;
  if (movePct <= -10) return 4;
  if (movePct <= -5) return 2;
  if (movePct <= 5) return 0;
  if (movePct <= 10) return -1;
  if (movePct <= 15) return -2;
  if (movePct <= 20) return -3;
  if (movePct <= 25) return -4;
  if (movePct <= 30) return -5;
  return -8;
}

function calcSnapshotBucket(stock = {}) {
  const movePct = round(calcMomentum(stock) * 100, 2);

  if (movePct <= -30) return "<= -30%";
  if (movePct <= -25) return "-30% ~ -25%";
  if (movePct <= -20) return "-25% ~ -20%";
  if (movePct <= -15) return "-20% ~ -15%";
  if (movePct <= -10) return "-15% ~ -10%";
  if (movePct <= -5) return "-10% ~ -5%";
  if (movePct <= 5) return "-5% ~ +5%";
  if (movePct <= 10) return "+5% ~ +10%";
  if (movePct <= 15) return "+10% ~ +15%";
  if (movePct <= 20) return "+15% ~ +20%";
  if (movePct <= 25) return "+20% ~ +25%";
  if (movePct <= 30) return "+25% ~ +30%";
  return "> +30%";
}

function getSnapshotReason(stock = {}) {
  const movePct = round(calcMomentum(stock) * 100, 2);

  if (movePct <= -30) return "急跌超甜，但要確認不是壞掉";
  if (movePct <= -25) return "很甜";
  if (movePct <= -20) return "很甜";
  if (movePct <= -15) return "明顯回檔";
  if (movePct <= -10) return "健康修正";
  if (movePct <= -5) return "開始變甜";
  if (movePct <= 5) return "中性區";
  if (movePct <= 10) return "偏貴";
  if (movePct <= 15) return "不甜";
  if (movePct <= 20) return "偏熱";
  if (movePct <= 25) return "過熱";
  if (movePct <= 30) return "高位危險";
  return "極度過熱";
}

function calcEventStock(stock = {}) {
  return round(calcPureStock(stock) + calcSnapshotScore(stock), 2);
}

function getTrendLabel(stock = {}) {
  const score = calcSnapshotScore(stock);
  if (score >= 8) return "急跌修正";
  if (score >= 4) return "長多回檔";
  if (score >= 2) return "弱勢下跌";
  if (score >= 0) return "中性";
  if (score >= -2) return "高位強勢";
  return "過熱";
}

function getTrendNote(stock = {}) {
  const trend = getTrendLabel(stock);
  if (trend === "急跌修正") return "跌得夠深，利率可能轉甜，但要小心不是壞掉";
  if (trend === "長多回檔") return "長期趨勢仍強，短期修正，進入 FCN 甜蜜點";
  if (trend === "弱勢下跌") return "中長期偏弱，需避免當成 FCN 核心標的";
  if (trend === "中性") return "沒有明確趨勢優勢，需要搭配 Snapshot 判斷";
  if (trend === "高位強勢") return "中長期很強，但位置偏高，FCN 不宜追價";
  return "位置過熱，追價風險高";
}

// ------------------------------------------
// FCN pure / event：先做 V1
// 結構分數 + 股票層均值
// ------------------------------------------
function calcKIScore(ki, eki = false) {
  if (eki || ki === null || ki === undefined) return 5;
  const v = toNumber(ki, 0);
  if (v <= 55) return 8;
  if (v <= 60) return 4;
  if (v <= 65) return 0;
  if (v <= 70) return -4;
  if (v <= 75) return -8;
  return -99;
}

function calcStrikeScore(strike) {
  const v = toNumber(strike, 0);
  if (v <= 60) return 10;
  if (v <= 65) return 5;
  if (v <= 67) return -1;
  if (v <= 70) return -3;
  if (v <= 75) return -5;
  if (v <= 80) return -10;
  return -99;
}

function calcYieldScore(rate) {
  const v = toNumber(rate, 0);
  if (v < 10) return -99;
  if (v < 12) return -4;
  if (v < 15) return -2;
  if (v < 16) return 0;
  if (v < 18) return 3;
  if (v < 20) return 5;
  if (v < 24) return 8;
  return 10;
}

function calcTenorScore(tenor) {
  const v = toNumber(tenor, 0);
  if (v <= 3) return 5;
  if (v <= 5) return 2;
  if (v === 6) return 0;
  if (v <= 9) return -2;
  if (v <= 12) return -5;
  return -99;
}

function calcGapScore(strike, ki, eki = false) {
  if (eki || ki === null || ki === undefined) return 5;
  const gap = toNumber(strike, 0) - toNumber(ki, 0);

  if (gap === 0) return 5;
  if (gap < 10) return -7;
  if (gap === 10) return 5;
  if (gap <= 13) return 4;
  if (gap <= 15) return 3;
  if (gap <= 18) return 0;
  if (gap <= 20) return -4;
  if (gap <= 22) return -5;
  if (gap < 25) return -8;
  return -99;
}

function calcStructureScore(fcn = {}) {
  const kiScore = calcKIScore(fcn.ki, fcn.eki);
  const strikeScore = calcStrikeScore(fcn.strike);
  const yieldScore = calcYieldScore(fcn.rate);
  const tenorScore = calcTenorScore(fcn.tenor);
  const gapScore = calcGapScore(fcn.strike, fcn.ki, fcn.eki);

  const scores = [kiScore, strikeScore, yieldScore, tenorScore, gapScore];
  if (scores.includes(-99)) return -99;

  return round(scores.reduce((a, b) => a + b, 0), 2);
}

function pickWorstOf(stocks = []) {
  if (!stocks.length) return null;
  return [...stocks].sort((a, b) => a.event_stock - b.event_stock)[0];
}

function calcPureFCN(structureScore, avgPureStock) {
  if (structureScore === -99) return -99;
  return round(structureScore + avgPureStock, 2);
}

function calcEventFCN(structureScore, avgEventStock) {
  if (structureScore === -99) return -99;
  return round(structureScore + avgEventStock, 2);
}

function getDecisionSuggestion({ pureFCN = 0, eventFCN = 0, worstOf = null }) {
  if (pureFCN === -99 || eventFCN === -99) {
    return {
      suggestion: "❌ 不做",
      reason: "結構不合格"
    };
  }

  if (!worstOf) {
    return {
      suggestion: "⚠ 觀察",
      reason: "缺少 Worst-of"
    };
  }

  if (worstOf.pure_stock < 5) {
    return {
      suggestion: "❌ 不做",
      reason: "Worst-of 品質太差"
    };
  }

  if (eventFCN >= 15) {
    return {
      suggestion: "✅ 可做",
      reason: "標的、結構、時機三者同時合理"
    };
  }

  if (eventFCN >= 10) {
    return {
      suggestion: "⚠ 觀察",
      reason: "條件不差，但未明顯便宜"
    };
  }

  return {
    suggestion: "❌ 不做",
    reason: "價格或結構優勢不足"
  };
}

// ------------------------------------------
// 主流程
// ------------------------------------------
function buildStockMap(pool30 = [], marketRuntime = {}) {
  const map = {};

  pool30.forEach(base => {
    const symbol = base.symbol;
    const m = marketRuntime[symbol] || {};

    const stock = {
      ...base,
      ...m
    };

    const pure_stock = calcPureStock(stock);
    const snapshot_score = calcSnapshotScore(stock);
    const event_stock = calcEventStock(stock);

    map[symbol] = {
      ...stock,
      baseline_label: getBaselineLabel(stock),
      pure_stock,
      snapshot_score,
      event_stock,
      snapshot_bucket: calcSnapshotBucket(stock),
      snapshot_reason: getSnapshotReason(stock),
      trend: getTrendLabel(stock),
      trend_note: getTrendNote(stock)
    };
  });

  return map;
}

function buildFCNResults(fcnPool = [], stockMap = {}) {
  const results = [];

  for (const fcn of fcnPool) {
    const basketStocks = (fcn.basket || [])
      .map(symbol => stockMap[symbol])
      .filter(Boolean);

    if (!basketStocks.length) continue;

    const avgPureStock = avg(basketStocks.map(s => s.pure_stock));
    const avgEventStock = avg(basketStocks.map(s => s.event_stock));
    const snapshot = avg(basketStocks.map(s => s.snapshot_score));

    const structureScore = calcStructureScore(fcn);
    const pure_fcn = calcPureFCN(structureScore, avgPureStock);
    const event_fcn = calcEventFCN(structureScore, avgEventStock);
    const worst_of = pickWorstOf(basketStocks);
    const delta_fcn = round(event_fcn - pure_fcn, 2);

    const decision = getDecisionSuggestion({
      pureFCN: pure_fcn,
      eventFCN: event_fcn,
      worstOf: worst_of
    });

    results.push({
      ...fcn,
      structure_score: structureScore,
      snapshot,
      avg_pure_stock: avgPureStock,
      avg_event_stock: avgEventStock,
      pure_fcn,
      event_fcn,
      delta_fcn,
      worst_of: worst_of?.symbol || null,
      suggestion: decision.suggestion,
      reason: decision.reason
    });
  }

  return results.sort((a, b) => b.event_fcn - a.event_fcn);
}

// ------------------------------------------
// Runtime cache
// ------------------------------------------
function saveRuntimeCache(stockMap, fcnResults) {
  const data = {
    generated_at: nowIso(),
    stocks: stockMap,
    fcns: Object.fromEntries(fcnResults.map(x => [x.fcn_id, x]))
  };
  safeWriteJsonToLocalStorage(RUNTIME_CACHE_KEY, data);
  return data;
}

// ------------------------------------------
// History append
// 只 append，避免重覆
// ------------------------------------------
function appendHistory(fcnResults = []) {
  const history = safeReadJsonFromLocalStorage(FCN_HISTORY_KEY, []);

  const existingKeys = new Set(
    history.map(x => `${x.date}__${x.fcn_id}`)
  );

  const newRows = fcnResults
    .filter(x => !existingKeys.has(`${x.date}__${x.fcn_id}`))
    .map(x => ({
      date: x.date,
      fcn_id: x.fcn_id,
      bank: x.bank || null,
      basket: x.basket || [],
      tenor: x.tenor,
      rate_market: x.rate,
      autocall: x.autocall,
      strike: x.strike,
      ki: x.ki,
      eki: !!x.eki,
      currency: x.currency || "USD",
      amt: x.amt ?? null,
      snapshot: x.snapshot,
      pure_fcn: x.pure_fcn,
      event_fcn: x.event_fcn,
      avg_pure_stock: x.avg_pure_stock,
      avg_event_stock: x.avg_event_stock,
      s_snapshot: null,
      s_rate: null,
      s_event_fcn: null,
      generated_at: nowIso()
    }));

  const merged = [...history, ...newRows];
  safeWriteJsonToLocalStorage(FCN_HISTORY_KEY, merged);
  return merged;
}

// ------------------------------------------
// 對外主函式
// ------------------------------------------
export async function runDecisionModuleV1({
  pool30Path = "./data/pool30.json",
  fcnPoolPath = "./data/fcn_pool.json",
  marketRuntimePath = "./data/market_runtime.json"
} = {}) {
  const [pool30, fcnPool, marketRuntime] = await Promise.all([
    fetch(pool30Path).then(r => r.json()),
    fetch(fcnPoolPath).then(r => r.json()),
    fetch(marketRuntimePath).then(r => r.json())
  ]);

  const stockMap = buildStockMap(pool30, marketRuntime);
  const fcnResults = buildFCNResults(fcnPool, stockMap);
  const runtimeCache = saveRuntimeCache(stockMap, fcnResults);
  const history = appendHistory(fcnResults);

  return {
    stockMap,
    fcnResults,
    runtimeCache,
    history
  };
}

// ------------------------------------------
// 匯出 localStorage 的 cache / history
// 給你手動下載回 GitHub
// ------------------------------------------
export function exportDecisionArtifacts() {
  const runtimeCache = safeReadJsonFromLocalStorage(RUNTIME_CACHE_KEY, {
    generated_at: null,
    stocks: {},
    fcns: {}
  });

  const history = safeReadJsonFromLocalStorage(FCN_HISTORY_KEY, []);

  downloadJson("runtime_cache_export.json", runtimeCache);
  downloadJson("fcn_snapshot_history_export.json", history);
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
