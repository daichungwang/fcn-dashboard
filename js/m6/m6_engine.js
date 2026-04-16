// ==========================================
// M6 Engine v3
// 振宇專用｜Positions + Market Runtime + M7 Today + M3 Commentary 聚合引擎
// 路徑：/js/m6/m6_engine.js
// ==========================================
// ==========================================
// 振宇 FCN 系統
// Proprietary System - All Rights Reserved
// Unauthorized copying or commercial use is prohibited
// All rights reserved by Gaya.Wang
// ==========================================
// ==========================================


function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeDivide(a, b, fallback = 0) {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y) || y === 0) return fallback;
  return x / y;
}

function round2(value) {
  return Math.round(toNumber(value, 0) * 100) / 100;
}

function sum(arr, selector) {
  return arr.reduce((acc, item) => acc + toNumber(selector(item), 0), 0);
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function uniqueArray(arr = []) {
  return [...new Set((arr || []).filter(Boolean))];
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

// ==========================================
// 讀取 JSON
// ==========================================

export async function loadJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`讀取失敗: ${url} (${res.status})`);
  }
  return await res.json();
}

// ==========================================
// M7 Today 正規化
// ==========================================

function normalizeM7TodayMap(m7TodayRaw = []) {
  const arr = Array.isArray(m7TodayRaw) ? m7TodayRaw : [];
  const map = {};

  for (const item of arr) {
    const symbol = String(item["股號"] || item.symbol || "").toUpperCase().trim();
    if (!symbol) continue;

    map[symbol] = {
      symbol,
      name: item["股名"] || item.name || symbol,
      sector: item["產業"] || item.sector || "",
      subsector: item["子產業"] || item.subsector || "",
      category: item["分類"] || item.category || "",
      risk_level: item["風險等級"] || item.risk_level || "",
      today_score: toNumber(item["today_score"], null),
      rank_today: toNumber(item["排名"], null),

      trend_state: item["趨勢判讀"]?.["趨勢狀態"] || "",
      structure_state: item["趨勢判讀"]?.["結構狀態"] || "",
      timing_state: item["趨勢判讀"]?.["時機狀態"] || "",

      valuation_score: toNumber(item["valuation_score"], null),
      trend_score: toNumber(item["trend_score"], null),
      structure_score: toNumber(item["structure_score"], null),
      timing_score: toNumber(item["timing_score"], null),
      money_score: toNumber(item["money_score"], null),
      quality_score: toNumber(item["quality_score"], null),

      ui_bucket: item["ui_bucket"] || "",
      action_today: item["建議動作"] || "",
      exposure: item["持倉曝險"] || {},
      exposure_alert: item["曝險警示"] || {},
      why_yes: Array.isArray(item["why_yes"]) ? item["why_yes"] : [],
      why_no: Array.isArray(item["why_no"]) ? item["why_no"] : [],
      valuation_note: item["估值說明"] || "",
      final_note: item["最終說明"] || "",
    };
  }

  return map;
}

// ==========================================
// M3 正規化
// 來源預設：./data/m3/m3_output.json
// 目標：把 stockResults 內的 why / whyNot / market_comment 依 symbol 對成 map
// ==========================================

function buildM3CommentText(stock = {}) {
  const why = safeArray(stock.why);
  const whyNot = safeArray(stock.whyNot);

  const yesText = why.length ? `✔ ${why.join(" ｜ ")}` : "✔ 無明顯優勢";
  const noText = whyNot.length ? `⚠ ${whyNot.join(" ｜ ")}` : "⚠ 無明顯風險";

  return `${yesText}； ${noText}`;
}

function normalizeM3Map(m3Raw = {}) {
  const map = {};

  if (!m3Raw || typeof m3Raw !== "object") return map;

  const stockResults = Array.isArray(m3Raw.stockResults) ? m3Raw.stockResults : [];

  for (const item of stockResults) {
    const symbol = String(item.symbol || "").toUpperCase().trim();
    if (!symbol) continue;

    const why = safeArray(item.why);
    const whyNot = safeArray(item.whyNot);

    map[symbol] = {
      symbol,
      pure_stock_score: toNumber(item.pure_stock_score, null),
      snapshot_score: toNumber(item.snapshot_score, null),
      event_stock_score: toNumber(item.event_stock_score, null),
      delta_stock_score: toNumber(item.delta_stock_score, null),
      bucket: item.bucket || "",
      suggestion: item.suggestion || "",
      trend: item.trend || "",

      why,
      whyNot,
      market_comment: item.market_comment || buildM3CommentText({ why, whyNot }),
      display_comment: item.display_comment || item.market_comment || buildM3CommentText({ why, whyNot }),
    };
  }

  return map;
}

// ==========================================
// 讀取主資料
// ==========================================

export async function loadM6Data(options = {}) {
  const positionsUrl = options.positionsUrl || "./data/positions.json";
  const marketUrl = options.marketUrl || "./data/market_runtime.json";
  const m7TodayUrl = options.m7TodayUrl || "./data/m7/m7_new_stock_today.json";
  const m3OutputUrl = options.m3OutputUrl || "./data/m3/m3_output.json";

  const [positions, marketRuntime, m7TodayRaw, m3Raw] = await Promise.all([
    loadJson(positionsUrl),
    loadJson(marketUrl),
    loadJson(m7TodayUrl).catch(() => []),
    loadJson(m3OutputUrl).catch(() => ({})),
  ]);

  return {
    positions: Array.isArray(positions) ? positions : [],
    marketRuntime: marketRuntime && typeof marketRuntime === "object" ? marketRuntime : {},
    m7TodayMap: normalizeM7TodayMap(m7TodayRaw),
    m3Map: normalizeM3Map(m3Raw),
  };
}

// ==========================================
// Runtime + M7 Today + M3 對接
// 先用：
// 1M -> 代 MA50
// 6M -> 代 MA200
// 12M -> 年線
// ==========================================

export function applyDataSources(positionLike, marketRuntime = {}, m7TodayMap = {}, m3Map = {}) {
  const symbol = String(positionLike.symbol || "").toUpperCase();
  const rt = marketRuntime[symbol] || {};
  const m7 = m7TodayMap[symbol] || {};
  const m3 = m3Map[symbol] || {};

  const current = toNumber(
    rt.price_now,
    toNumber(positionLike.current, 0)
  );

  const line1W = toNumber(rt.price_ref_1w, current);
  const line1M = toNumber(rt.price_ref_1m, current);   // 代 MA50
  const line6M = toNumber(rt.price_ref_3m, current);   // 代 MA200
  const line12M = toNumber(rt.price_ref_12m, current); // 年線

  return {
    ...positionLike,
    symbol,

    // M7 Today
    name: m7.name || positionLike.name || symbol,
    sector: m7.sector || positionLike.sector || "",
    subsector: m7.subsector || positionLike.subsector || "",
    category: m7.category || positionLike.category || "",
    risk_level: m7.risk_level || positionLike.risk_level || "",

    today_score: m7.today_score,
    rank_today: m7.rank_today,
    trend_state: m7.trend_state || "",
    structure_state: m7.structure_state || "",
    timing_state: m7.timing_state || "",
    valuation_score: m7.valuation_score,
    trend_score: m7.trend_score,
    structure_score: m7.structure_score,
    timing_score: m7.timing_score,
    money_score: m7.money_score,
    quality_score: m7.quality_score,
    ui_bucket: m7.ui_bucket || "",
    action_today: m7.action_today || "",
    exposure: m7.exposure || {},
    exposure_alert: m7.exposure_alert || {},
    why_yes: Array.isArray(m7.why_yes) ? clone(m7.why_yes) : [],
    why_no: Array.isArray(m7.why_no) ? clone(m7.why_no) : [],
    valuation_note: m7.valuation_note || "",
    final_note: m7.final_note || "",

    // M3 Commentary
    pure_stock_score: m3.pure_stock_score,
    snapshot_score: m3.snapshot_score,
    event_stock_score: m3.event_stock_score,
    delta_stock_score: m3.delta_stock_score,
    m3_bucket: m3.bucket || "",
    m3_suggestion: m3.suggestion || "",
    m3_trend: m3.trend || "",
    why: Array.isArray(m3.why) ? clone(m3.why) : [],
    whyNot: Array.isArray(m3.whyNot) ? clone(m3.whyNot) : [],
    market_comment: m3.market_comment || "",
    display_comment: m3.display_comment || m3.market_comment || "",

    // Market runtime
    current,
    line_1w: line1W,
    line_1m: line1M,
    line_6m: line6M,
    line_12m: line12M,
    volume: toNumber(rt.volume, 0),
    volume_ratio: toNumber(rt.volume_ratio, 0),
    delta_1d: toNumber(rt.delta_1d, 0),
    ret_1d: toNumber(rt.ret_1d, 0),
    ret_1w: toNumber(rt.ret_1w, 0),
    ret_1m: toNumber(rt.ret_1m, 0),
    ret_3m: toNumber(rt.ret_3m, 0),
    ret_6m: toNumber(rt.ret_6m, 0),
    ret_12m: toNumber(rt.ret_12m, 0),
    swing_days: Array.isArray(rt.swing_days) ? clone(rt.swing_days) : [],
    last_update: rt.last_update || "-",
  };
}

// ==========================================
// 單筆部位損益
// ==========================================

export function calcPositionPnl(position) {
  const quantity = toNumber(position.quantity, 0);
  const cost = toNumber(position.cost, 0);
  const current = toNumber(position.current, 0);

  const marketValue = round2(quantity * current);
  const totalCost = round2(quantity * cost);
  const pnlAmount = round2((current - cost) * quantity);
  const pnlPct = round2(safeDivide(current - cost, cost, 0) * 100);
  const priceGap = round2(current - cost);

  return {
    quantity,
    cost,
    current,
    market_value: marketValue,
    total_cost: totalCost,
    pnl_amount: pnlAmount,
    pnl_pct: pnlPct,
    price_gap: priceGap,
  };
}

// ==========================================
// 強弱 / 狀態 引擎
// ==========================================

export function calcStrength(item) {
  let score = 0;

  const current = toNumber(item.current, 0);
  const cost = toNumber(item.cost, 0);
  const line1W = toNumber(item.line_1w, current);
  const line1M = toNumber(item.line_1m, current);
  const line6M = toNumber(item.line_6m, current);
  const line12M = toNumber(item.line_12m, current);

  if (current >= line1W) score += 1;
  if (current >= line1M) score += 2;
  if (current >= line6M) score += 2;
  if (current >= line12M) score += 1;
  if (current > cost) score += 2;

  if (item.trend_state === "strong") score += 1;
  if (item.timing_state === "good") score += 1;
  if (item.risk_level === "低") score += 1;
  if (item.risk_level === "高") score -= 1;

  if (score >= 7) return "強";
  if (score >= 3) return "中";
  return "弱";
}

export function calcStatus(item) {
  const current = toNumber(item.current, 0);
  const cost = toNumber(item.cost, 0);
  const line1M = toNumber(item.line_1m, current);
  const line6M = toNumber(item.line_6m, current);
  const pnlPct = round2(safeDivide(current - cost, cost, 0) * 100);

  const support1 = Array.isArray(item.support) && item.support.length
    ? toNumber(item.support[0], 0)
    : 0;

  const nearSupport = support1 > 0 ? current <= support1 * 1.03 : false;
  const below1M = current < line1M;
  const below6M = current < line6M;
  const exposureLevel = String(item.exposure_alert?.level || "").toLowerCase();
  const actionToday = String(item.action_today || "");

  if (
    pnlPct <= -8 ||
    (nearSupport && below1M) ||
    (below1M && below6M && current < cost) ||
    exposureLevel === "high" ||
    actionToday === "移除"
  ) {
    return "危險";
  }

  if (
    pnlPct < 0 ||
    below1M ||
    actionToday === "觀察" ||
    item.trend_state === "weak"
  ) {
    return "觀察";
  }

  return "健康";
}

export function calcHealthNote(item) {
  const strength = calcStrength(item);
  const status = calcStatus(item);

  if (status === "危險") {
    if (item.exposure_alert?.text) return item.exposure_alert.text;
    return "低於 1M 代理線或曝險偏高，列優先處理";
  }

  if (status === "觀察" && strength === "弱") {
    return "仍弱於 1M / 6M 代理線，先看反彈";
  }

  if (status === "觀察") {
    return "位於關鍵區，等待是否站回 1M 代理線";
  }

  return "結構尚可，可續抱追蹤";
}

// ==========================================
// 單筆部位 enrich
// ==========================================

export function enrichPosition(position, marketRuntime = {}, m7TodayMap = {}, m3Map = {}) {
  const base = applyDataSources(position, marketRuntime, m7TodayMap, m3Map);
  const pnl = calcPositionPnl(base);

  const merged = {
    ...base,
    ...pnl,
  };

  return {
    ...merged,
    strength: calcStrength(merged),
    status_eval: calcStatus(merged),
    health_note: calcHealthNote(merged),
  };
}

// ==========================================
// 同股票多筆部位聚合
// 左側總覽卡使用
// ==========================================

export function aggregatePositions(positions = [], marketRuntime = {}, m7TodayMap = {}, m3Map = {}) {
  const enriched = positions.map((p) => enrichPosition(p, marketRuntime, m7TodayMap, m3Map));
  const map = new Map();

  for (const p of enriched) {
    const symbol = p.symbol;

    if (!map.has(symbol)) {
      map.set(symbol, {
        symbol,
        name: p.name || symbol,
        sector: p.sector || "",
        subsector: p.subsector || "",
        category: p.category || "",
        risk_level: p.risk_level || "",

        today_score: p.today_score,
        rank_today: p.rank_today,
        trend_state: p.trend_state,
        structure_state: p.structure_state,
        timing_state: p.timing_state,
        valuation_score: p.valuation_score,
        trend_score: p.trend_score,
        structure_score: p.structure_score,
        timing_score: p.timing_score,
        money_score: p.money_score,
        quality_score: p.quality_score,
        ui_bucket: p.ui_bucket || "",
        action_today: p.action_today || "",
        exposure: clone(p.exposure || {}),
        exposure_alert: clone(p.exposure_alert || {}),
        why_yes: clone(p.why_yes || []),
        why_no: clone(p.why_no || []),
        valuation_note: p.valuation_note || "",
        final_note: p.final_note || "",

        // M3
        pure_stock_score: p.pure_stock_score,
        snapshot_score: p.snapshot_score,
        event_stock_score: p.event_stock_score,
        delta_stock_score: p.delta_stock_score,
        why: clone(p.why || []),
        whyNot: clone(p.whyNot || []),
        market_comment: p.market_comment || "",
        display_comment: p.display_comment || "",
        m3_bucket: p.m3_bucket || "",
        m3_suggestion: p.m3_suggestion || "",
        m3_trend: p.m3_trend || "",

        quantity: 0,
        total_cost_amount: 0,
        market_value: 0,

        current: p.current,
        line_1w: p.line_1w,
        line_1m: p.line_1m,
        line_6m: p.line_6m,
        line_12m: p.line_12m,

        volume: p.volume,
        volume_ratio: p.volume_ratio,
        delta_1d: p.delta_1d,
        ret_1d: p.ret_1d,
        ret_1w: p.ret_1w,
        ret_1m: p.ret_1m,
        ret_3m: p.ret_3m,
        ret_6m: p.ret_6m,
        ret_12m: p.ret_12m,
        swing_days: clone(p.swing_days || []),
        last_update: p.last_update,

        source_types: new Set(),
        source_ids: new Set(),
        banks: new Set(),
        roles: new Set(),

        details: [],
      });
    }

    const row = map.get(symbol);

    row.quantity += toNumber(p.quantity, 0);
    row.total_cost_amount += toNumber(p.total_cost, 0);
    row.market_value += toNumber(p.market_value, 0);

    row.source_types.add(p.source_type || "");
    row.source_ids.add(p.source_id || "");
    row.banks.add(p.bank || "");
    row.roles.add(p.role || "");

    row.details.push(p);

    // 若前面沒有 M3，後面某筆有，補進去
    if (!row.market_comment && p.market_comment) row.market_comment = p.market_comment;
    if (!row.display_comment && p.display_comment) row.display_comment = p.display_comment;
    if ((!row.why || !row.why.length) && Array.isArray(p.why) && p.why.length) row.why = clone(p.why);
    if ((!row.whyNot || !row.whyNot.length) && Array.isArray(p.whyNot) && p.whyNot.length) row.whyNot = clone(p.whyNot);
    if (!row.pure_stock_score && Number.isFinite(p.pure_stock_score)) row.pure_stock_score = p.pure_stock_score;
    if (!row.snapshot_score && Number.isFinite(p.snapshot_score)) row.snapshot_score = p.snapshot_score;
    if (!row.event_stock_score && Number.isFinite(p.event_stock_score)) row.event_stock_score = p.event_stock_score;
    if (!row.delta_stock_score && Number.isFinite(p.delta_stock_score)) row.delta_stock_score = p.delta_stock_score;
    if (!row.m3_bucket && p.m3_bucket) row.m3_bucket = p.m3_bucket;
    if (!row.m3_suggestion && p.m3_suggestion) row.m3_suggestion = p.m3_suggestion;
    if (!row.m3_trend && p.m3_trend) row.m3_trend = p.m3_trend;
  }

  const result = [];

  for (const [, row] of map.entries()) {
    const quantity = toNumber(row.quantity, 0);
    const cost = round2(safeDivide(row.total_cost_amount, quantity, 0));
    const current = toNumber(row.current, 0);
    const pnlAmount = round2(row.market_value - row.total_cost_amount);
    const pnlPct = round2(safeDivide(current - cost, cost, 0) * 100);
    const priceGap = round2(current - cost);

    const aggregateItem = {
      symbol: row.symbol,
      name: row.name,
      sector: row.sector,
      subsector: row.subsector,
      category: row.category,
      risk_level: row.risk_level,

      today_score: row.today_score,
      rank_today: row.rank_today,
      trend_state: row.trend_state,
      structure_state: row.structure_state,
      timing_state: row.timing_state,
      valuation_score: row.valuation_score,
      trend_score: row.trend_score,
      structure_score: row.structure_score,
      timing_score: row.timing_score,
      money_score: row.money_score,
      quality_score: row.quality_score,
      ui_bucket: row.ui_bucket,
      action_today: row.action_today,
      exposure: row.exposure,
      exposure_alert: row.exposure_alert,
      why_yes: row.why_yes,
      why_no: row.why_no,
      valuation_note: row.valuation_note,
      final_note: row.final_note,

      // M3
      pure_stock_score: row.pure_stock_score,
      snapshot_score: row.snapshot_score,
      event_stock_score: row.event_stock_score,
      delta_stock_score: row.delta_stock_score,
      why: row.why,
      whyNot: row.whyNot,
      market_comment: row.market_comment,
      display_comment: row.display_comment,
      m3_bucket: row.m3_bucket,
      m3_suggestion: row.m3_suggestion,
      m3_trend: row.m3_trend,

      quantity,
      cost,
      current,
      total_cost: round2(row.total_cost_amount),
      market_value: round2(row.market_value),
      pnl_amount: pnlAmount,
      pnl_pct: pnlPct,
      price_gap: priceGap,

      line_1w: row.line_1w,
      line_1m: row.line_1m,
      line_6m: row.line_6m,
      line_12m: row.line_12m,

      volume: row.volume,
      volume_ratio: row.volume_ratio,
      delta_1d: row.delta_1d,
      ret_1d: row.ret_1d,
      ret_1w: row.ret_1w,
      ret_1m: row.ret_1m,
      ret_3m: row.ret_3m,
      ret_6m: row.ret_6m,
      ret_12m: row.ret_12m,
      swing_days: row.swing_days,
      last_update: row.last_update,

      source_type: Array.from(row.source_types).filter(Boolean).join(" / "),
      source_id: Array.from(row.source_ids).filter(Boolean).join(" / "),
      bank: Array.from(row.banks).filter(Boolean).join(" / "),
      role: Array.from(row.roles).filter(Boolean).join(" / "),

      details: row.details,
    };

    result.push({
      ...aggregateItem,
      strength: calcStrength(aggregateItem),
      status_eval: calcStatus(aggregateItem),
      health_note: calcHealthNote(aggregateItem),
    });
  }

  return result;
}

// ==========================================
// 右側詳情卡：某股票所有原始部位
// ==========================================

export function buildPositionDetails(symbol, positions = [], marketRuntime = {}, m7TodayMap = {}, m3Map = {}) {
  const target = String(symbol || "").toUpperCase();

  return positions
    .filter((p) => String(p.symbol || "").toUpperCase() === target)
    .map((p) => enrichPosition(p, marketRuntime, m7TodayMap, m3Map))
    .sort((a, b) => {
      const aMain = a.role === "核心部位" ? 0 : 1;
      const bMain = b.role === "核心部位" ? 0 : 1;
      return aMain - bMain;
    });
}

// ==========================================
// 排序
// ==========================================

export function sortAggregates(items = [], mode = "risk") {
  const arr = [...items];

  function statusWeight(v) {
    if (v === "危險") return 0;
    if (v === "觀察") return 1;
    return 2;
  }

  function strengthWeight(v) {
    if (v === "強") return 2;
    if (v === "中") return 1;
    return 0;
  }

  arr.sort((a, b) => {
    if (mode === "risk") {
      return (
        statusWeight(a.status_eval) - statusWeight(b.status_eval) ||
        strengthWeight(a.strength) - strengthWeight(b.strength) ||
        toNumber(a.today_score, -999) - toNumber(b.today_score, -999) ||
        a.symbol.localeCompare(b.symbol)
      );
    }

    if (mode === "strength") {
      return (
        strengthWeight(b.strength) - strengthWeight(a.strength) ||
        toNumber(b.today_score, -999) - toNumber(a.today_score, -999) ||
        a.symbol.localeCompare(b.symbol)
      );
    }

    if (mode === "pnl") {
      return toNumber(a.pnl_amount, 0) - toNumber(b.pnl_amount, 0);
    }

    if (mode === "return") {
      return toNumber(a.pnl_pct, 0) - toNumber(b.pnl_pct, 0);
    }

    if (mode === "score") {
      return toNumber(b.today_score, -999) - toNumber(a.today_score, -999);
    }

    return a.symbol.localeCompare(b.symbol);
  });

  return arr;
}

// ==========================================
// 總覽統計
// ==========================================

export function buildSummary(aggregateItems = []) {
  const count = aggregateItems.length;
  const totalCost = round2(sum(aggregateItems, (x) => x.total_cost));
  const totalValue = round2(sum(aggregateItems, (x) => x.market_value));
  const totalPnl = round2(totalValue - totalCost);

  const healthy = aggregateItems.filter((x) => x.status_eval === "健康").length;
  const watch = aggregateItems.filter((x) => x.status_eval === "觀察").length;
  const danger = aggregateItems.filter((x) => x.status_eval === "危險").length;

  return {
    count,
    total_cost: totalCost,
    total_value: totalValue,
    total_pnl: totalPnl,
    healthy,
    watch,
    danger,
  };
}

// ==========================================
// 策略模擬（基礎版）
// ==========================================

export function simulateSell(positionOrAggregate, sellPrice, sellQty) {
  const quantity = toNumber(positionOrAggregate.quantity, 0);
  const cost = toNumber(positionOrAggregate.cost, 0);
  const price = toNumber(sellPrice, 0);
  const qty = Math.max(0, Math.min(quantity, toNumber(sellQty, 0)));

  const cashBack = round2(price * qty);
  const realizedPnl = round2((price - cost) * qty);
  const remainingQty = round2(quantity - qty);

  return {
    sell_price: price,
    sell_qty: qty,
    cash_back: cashBack,
    realized_pnl: realizedPnl,
    remaining_qty: remainingQty,
  };
}

export function simulateSellByRatio(positionOrAggregate, sellPrice, ratio) {
  const quantity = toNumber(positionOrAggregate.quantity, 0);
  const qty = quantity * toNumber(ratio, 0);
  return simulateSell(positionOrAggregate, sellPrice, qty);
}

// ==========================================
// M6 主流程
// ==========================================

export function buildM6ViewModel(raw = {}) {
  const positions = Array.isArray(raw.positions) ? raw.positions : [];
  const marketRuntime = raw.marketRuntime || {};
  const m7TodayMap = raw.m7TodayMap || {};
  const m3Map = raw.m3Map || {};

  const aggregateItems = aggregatePositions(positions, marketRuntime, m7TodayMap, m3Map);
  const summary = buildSummary(aggregateItems);

  return {
    positions,
    marketRuntime,
    m7TodayMap,
    m3Map,
    aggregates: aggregateItems,
    summary,
  };
}
