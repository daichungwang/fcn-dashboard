// ==========================================
// M4 - Learning Engine（外單評估 + 儲存）
// UI 與計算分離版
// ==========================================

import { evaluateStock } from "../core/stock_engine.js";

const STORAGE_KEY = "fcn_m4_records_v8";

let SUPPORT_DATA = {
  pool30: [],
  pool30Map: {},
  stockRuntime: {},
  stockRuntimeMap: {},
  runtimeCacheStocks: {}
};

// ------------------------------------------
// 基本工具
// ------------------------------------------
function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 2) {
  return Number(toNumber(value, 0).toFixed(digits));
}

function safeUpper(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeBasket(input = "") {
  return String(input)
    .split(",")
    .map(v => safeUpper(v))
    .filter(Boolean);
}

// ------------------------------------------
// 載入支援資料
// ------------------------------------------
async function loadJson(path, fallback = null) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path} not found`);
    return await res.json();
  } catch (err) {
    console.warn(`⚠️ load failed: ${path}`, err);
    return fallback;
  }
}

function loadRuntimeCache() {
  try {
    const raw = JSON.parse(localStorage.getItem("runtime_cache_v1") || "{}");
    const stocks = raw?.stocks || {};
    const normalized = {};
    Object.keys(stocks).forEach(sym => {
      normalized[safeUpper(sym)] = stocks[sym];
    });
    return normalized;
  } catch (err) {
    console.warn("⚠️ runtime_cache_v1 parse failed", err);
    return {};
  }
}

export async function loadSupportData() {
  const pool30 = await loadJson("./data/pool30.json", []);
  const stockRuntime = await loadJson("./data/stock_runtime.json", {});
  const runtimeCacheStocks = loadRuntimeCache();

  const pool30Map = {};
  (Array.isArray(pool30) ? pool30 : []).forEach(item => {
    const symbol = safeUpper(item.symbol);
    if (symbol) pool30Map[symbol] = item;
  });

  const stockRuntimeMap = {};
  Object.keys(stockRuntime || {}).forEach(sym => {
    stockRuntimeMap[safeUpper(sym)] = stockRuntime[sym];
  });

  SUPPORT_DATA = {
    pool30: Array.isArray(pool30) ? pool30 : [],
    pool30Map,
    stockRuntime,
    stockRuntimeMap,
    runtimeCacheStocks
  };

  return SUPPORT_DATA;
}

// ------------------------------------------
// 資料合併
// ------------------------------------------
function getMergedStock(symbol) {
  const sym = safeUpper(symbol);
  const base = SUPPORT_DATA.pool30Map[sym] || {};
  const runtime = SUPPORT_DATA.stockRuntimeMap[sym] || {};
  const cache = SUPPORT_DATA.runtimeCacheStocks[sym] || {};

  return {
    ...base,
    ...runtime,
    ...cache,
    symbol: sym
  };
}

// ------------------------------------------
// FCN 規則
// ------------------------------------------
function getWorstGroup(stocks = []) {
  const sorted = [...stocks].sort(
    (a, b) => toNumber(a.pure_stock_score, 0) - toNumber(b.pure_stock_score, 0)
  );

  const n = sorted.length;
  if (n <= 3) return sorted.slice(0, 1);
  if (n === 4) return sorted.slice(0, 2);
  if (n >= 5) return sorted.slice(0, 3);
  return sorted.slice(0, 1);
}

function getWorstStock(stocks = []) {
  const worstGroup = getWorstGroup(stocks);
  return worstGroup[0] || null;
}

function getCategoryPenalty(category) {
  switch (String(category || "").toLowerCase()) {
    case "core":
      return { worst: 3, assy: 2 };
    case "defensive":
      return { worst: 2, assy: 1 };
    case "growth":
      return { worst: 2, assy: 0 };
    case "income":
      return { worst: 1, assy: 0 };
    case "speculative":
      return { worst: -2, assy: -2 };
    default:
      return { worst: 0, assy: 0 };
  }
}

function calcSRI(stocks = []) {
  if (!stocks.length) return 0;

  const worstGroup = getWorstGroup(stocks);

  const worstPenalty =
    worstGroup.reduce((sum, s) => sum + getCategoryPenalty(s.category).worst, 0) / worstGroup.length;

  const assyPenalty =
    stocks.reduce((sum, s) => sum + getCategoryPenalty(s.category).assy, 0) / stocks.length;

  return round(0.6 * worstPenalty + 0.4 * assyPenalty, 2);
}

function calcRateScore(rate) {
  const r = toNumber(rate);
  if (r < 10) return -999;
  if (r < 12) return -4;
  if (r < 15) return -2;
  if (r < 16) return 0;
  if (r < 18) return 3;
  if (r < 20) return 5;
  if (r < 24) return 8;
  return 10;
}

function calcPeriodScore(period) {
  const m = toNumber(period);
  if (m <= 3) return 5;
  if (m <= 6) return 2;
  if (m <= 9) return -2;
  if (m <= 12) return -5;
  return -999;
}

function calcPRiskScore(strike, ki) {
  const gap = toNumber(strike) - toNumber(ki);

  if (gap === 0) return 5;
  if (gap < 10) return -7;
  if (gap === 10) return 5;
  if (gap <= 13) return 4;
  if (gap <= 15) return 3;
  if (gap <= 18) return 0;
  if (gap <= 20) return -4;
  if (gap <= 22) return -5;
  if (gap < 25) return -8;
  return -999;
}

function calcProductTypeScore(productType = "") {
  const t = safeUpper(productType);
  if (t === "EKI") return 2;
  if (t === "DACN") return -1;
  if (t === "AKI" || t === "MKI" || t === "AKI / MKI") return 0;
  return 0;
}

function calcAvgPureStock(stocks = []) {
  if (!stocks.length) return 0;
  return round(
    stocks.reduce((sum, s) => sum + toNumber(s.pure_stock_score, 0), 0) / stocks.length,
    2
  );
}

function calcAvgEventStock(stocks = []) {
  if (!stocks.length) return 0;
  return round(
    stocks.reduce((sum, s) => sum + toNumber(s.event_stock_score, 0), 0) / stocks.length,
    2
  );
}

function calcAvgEventSnapshot(stocks = []) {
  if (!stocks.length) return 0;
  return round(
    stocks.reduce((sum, s) => sum + toNumber(s.snapshot_score, 0), 0) / stocks.length,
    2
  );
}

function calcWorstOfEventSnapshot(stocks = []) {
  const worstGroup = getWorstGroup(stocks);
  if (!worstGroup.length) return 0;
  return round(
    worstGroup.reduce((sum, s) => sum + toNumber(s.snapshot_score, 0), 0) / worstGroup.length,
    2
  );
}

function calcEventFCNSnapshot(stocks = []) {
  const worst = calcWorstOfEventSnapshot(stocks);
  const avg = calcAvgEventSnapshot(stocks);
  return round(0.6 * worst + 0.4 * avg, 2);
}

function calcAvgEventNewsScore(stocks = []) {
  if (!stocks.length) return 0;
  return round(
    stocks.reduce((sum, s) => sum + toNumber(s.event_news_score, 0), 0) / stocks.length,
    2
  );
}

function calcFCNByBaseStock(baseStockScore, deal, sri) {
  const rateScore = calcRateScore(deal.coupon);
  const periodScore = calcPeriodScore(deal.tenor);
  const priskScore = calcPRiskScore(deal.strike, deal.ki);
  const productTypeScore = calcProductTypeScore(deal.product_type);

  if (rateScore === -999 || periodScore === -999 || priskScore === -999) {
    return -999;
  }

  const score =
    0.4 * toNumber(baseStockScore, 0) +
    0.2 * rateScore +
    0.1 * periodScore +
    0.1 * priskScore +
    0.1 * sri +
    productTypeScore;

  return round(score, 2);
}

function calcDeltaFCN(pureFcn, eventFcn) {
  const p = toNumber(pureFcn, 0);
  const e = toNumber(eventFcn, 0);
  if (p === 0) return 0;
  return round(((e - p) / Math.abs(p)) * 100, 2);
}

function getDeltaLabel(deltaPct) {
  const d = toNumber(deltaPct, 0);
  if (d > 100) return "非常甜";
  if (d > 50) return "偏甜";
  if (d >= -20) return "合理";
  if (d >= -50) return "偏貴";
  return "很貴";
}

function getRateComment(score) {
  if (score === -999) return "利率 < 10%，不做";
  if (score === -4) return "10–12%，偏低";
  if (score === -2) return "12–15%，普通";
  if (score === 0) return "15–16%，標準";
  if (score === 3) return "16–18%，可接受";
  if (score === 5) return "18–20%，不錯";
  if (score === 8) return "20–24%，偏高，需警覺";
  if (score === 10) return "≥24%，很高，需高度警覺";
  return "";
}

function getPeriodComment(score) {
  if (score === -999) return "天期 > 12 月，不做";
  if (score === 5) return "0–3 月，短天期佳";
  if (score === 2) return "≤6 月，偏佳";
  if (score === -2) return "7–9 月，偏長";
  if (score === -5) return "10–12 月，較長，風險提高";
  return "";
}

function getPRiskComment(score, gap) {
  const g = round(gap, 2);
  if (score === -999) return `Gap=${g}，超出可接受範圍`;
  if (score === 5 && g === 0) return "Gap = 0，特殊可接受";
  if (score === -7) return "Gap < 10，保護不足";
  if (score === 5 && g === 10) return "Gap = 10，最佳區";
  if (score === 4) return "10 < Gap ≤ 13，良好";
  if (score === 3) return "13 < Gap ≤ 15，尚可";
  if (score === 0) return "15 < Gap ≤ 18，標準";
  if (score === -4) return "18 < Gap ≤ 20，偏大";
  if (score === -5) return "20 < Gap ≤ 22，風險提高";
  if (score === -8) return "22 < Gap < 25，偏危險";
  return "";
}

function getSuggestion(pureFcn, eventFcn, deltaPct) {
  if (pureFcn === -999 || eventFcn === -999) return "不做";
  if (pureFcn >= 7 && eventFcn >= 7.5 && deltaPct > 0) return "可做";
  if (pureFcn >= 4 && eventFcn >= 4) return "觀察";
  return "不做";
}

// ------------------------------------------
// 股票 view model
// ------------------------------------------
function buildStockViewModel(stock, evalRes) {
  return {
    symbol: stock.symbol,
    name: stock.name || stock.symbol,
    category: evalRes.category || stock.category || "",
    sector: stock.sector || "",
    subsector: stock.subsector || "",

    baseline_label: evalRes.baseline_label,
    baseline_score: evalRes.baseline_score,

    pure_stock_score: evalRes.pure_stock_score,
    pure_reason: evalRes.pure_reason,
    vol_score: evalRes.vol_score,
    vol_label: evalRes.vol_label,
    mid_term_volatility: evalRes.mid_term_volatility,

    snapshot_score: evalRes.snapshot_score,
    snapshot_bucket: evalRes.snapshot_bucket,
    snapshot_reason: evalRes.snapshot_reason,
    snapshot_move_pct: evalRes.snapshot_move_pct,
    snapshot_momentum: evalRes.snapshot_momentum,

    event_stock_score: evalRes.event_stock_score,
    trend_label: evalRes.trend_label,
    trend_note: evalRes.trend_note,

    event_news_score: 0,
    event_news_reason: "M1 轉換尚未正式接入，暫不納入總分",

    price_now: stock.price_now,
    ret_1d: stock.ret_1d,
    ret_1w: stock.ret_1w,
    ret_1m: stock.ret_1m,
    ret_3m: stock.ret_3m,
    ret_6m: stock.ret_6m,
    ret_12m: stock.ret_12m
  };
}

export function buildStockBlocksData(basketInput = "") {
  const symbols = Array.isArray(basketInput) ? basketInput : normalizeBasket(basketInput);

  return symbols.map(symbol => {
    const stock = getMergedStock(symbol);
    const evalRes = evaluateStock(stock);
    return buildStockViewModel(stock, evalRes);
  });
}

// ------------------------------------------
// 主評分
// ------------------------------------------
export function evaluateDeal(deal = {}) {
  const basket = Array.isArray(deal.basket) ? deal.basket : normalizeBasket(deal.basket || "");
  const stocks = buildStockBlocksData(basket);

  const avgPureStock = calcAvgPureStock(stocks);
  const avgEventStock = calcAvgEventStock(stocks);
  const avgEventSnapshot = calcAvgEventSnapshot(stocks);
  const worstOfEventSnapshot = calcWorstOfEventSnapshot(stocks);
  const eventFcnSnapshot = calcEventFCNSnapshot(stocks);
  const avgEventNewsScore = calcAvgEventNewsScore(stocks);
  const sri = calcSRI(stocks);
  const worstStock = getWorstStock(stocks);
  const gap = round(toNumber(deal.strike) - toNumber(deal.ki), 2);

  const pureFcn = calcFCNByBaseStock(avgPureStock, deal, sri);
  const eventFcn = calcFCNByBaseStock(avgEventStock, deal, sri);
  const deltaFcnPct = calcDeltaFCN(pureFcn, eventFcn);
  const deltaLabel = getDeltaLabel(deltaFcnPct);

  const rateScore = calcRateScore(deal.coupon);
  const periodScore = calcPeriodScore(deal.tenor);
  const priskScore = calcPRiskScore(deal.strike, deal.ki);
  const productTypeScore = calcProductTypeScore(deal.product_type);

  return {
    basket,
    stocks,

    overall_fcn_score: eventFcn,
    overall_fcn_comment: `Avg Pure Stock=${avgPureStock} | Avg Event Stock=${avgEventStock} | Event FCN Snapshot=${eventFcnSnapshot} | Avg Event / News Score=${avgEventNewsScore} | SRI=${sri} | Worst-of=${worstStock?.symbol || "-"}`,

    pure_fcn_score: pureFcn,
    pure_fcn_comment: `Avg Pure Stock=${avgPureStock} | SRI=${sri} | Product Type Score=${productTypeScore}`,

    event_fcn_score: eventFcn,
    event_fcn_comment: `Avg Event Stock=${avgEventStock} | Event FCN Snapshot=${eventFcnSnapshot} | Avg Event / News Score=${avgEventNewsScore} | SRI=${sri}`,

    delta_fcn_score: deltaFcnPct,
    delta_fcn_comment: deltaLabel,

    avg_pure_stock: avgPureStock,
    avg_event_stock: avgEventStock,
    avg_event_snapshot: avgEventSnapshot,
    worst_of_event_snapshot: worstOfEventSnapshot,
    event_fcn_snapshot: eventFcnSnapshot,
    avg_event_news_score: avgEventNewsScore,

    sri,
    worst_of: worstStock?.symbol || "",

    l2: {
      ki_value: toNumber(deal.ki),
      ki_score: "",
      ki_comment: "KI 顯示欄位保留",

      strike_value: toNumber(deal.strike),
      strike_score: "",
      strike_comment: "Strike 顯示欄位保留",

      coupon_value: toNumber(deal.coupon),
      coupon_score: rateScore,
      coupon_comment: getRateComment(rateScore),

      tenor_value: toNumber(deal.tenor),
      tenor_score: periodScore,
      tenor_comment: getPeriodComment(periodScore),

      gap_value: gap,
      gap_score: priskScore,
      gap_comment: getPRiskComment(priskScore, gap),

      avg_pure_stock_value: avgPureStock,
      avg_event_stock_value: avgEventStock,
      sri_value: sri,
      worst_of_value: worstStock?.symbol || "",

      summary_comment: `Rate Score=${rateScore} | Period Score=${periodScore} | P-Risk Score=${priskScore} | Product Type Score=${productTypeScore} | Avg Pure Stock=${avgPureStock} | Avg Event Stock=${avgEventStock} | Event FCN Snapshot=${eventFcnSnapshot} | Avg Event / News Score=${avgEventNewsScore} | SRI=${sri}`
    },

    product_type_score: productTypeScore,
    rate_score: rateScore,
    period_score: periodScore,
    prisk_score: priskScore,

    suggestion: getSuggestion(pureFcn, eventFcn, deltaFcnPct)
  };
}

// ------------------------------------------
// 儲存
// ------------------------------------------
export async function saveExternalDeal(deal, result) {
  const record = {
    ...deal,
    ...result,
    decision: result?.suggestion || null,
    outcome: null,
    created_at: new Date().toISOString()
  };

  const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  history.unshift(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));

  return record;
}

export function getExternalDeals() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
}

export function clearExternalDeals() {
  localStorage.removeItem(STORAGE_KEY);
}
