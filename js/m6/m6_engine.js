// ==========================================
// M6 Engine v5
// 振宇專用｜Positions + Market Runtime + M7 Today + M3 Commentary 聚合引擎
// 路徑：/js/m6/m6_engine.js
// ==========================================
// ==========================================
// 振宇 FCN 系統
// Proprietary System - All Rights Reserved
// Unauthorized copying or commercial use is prohibited
// All rights reserved by Gaya.Wang
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

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function safeObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
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
// 來源：./data/m7/m7_new_stock_today.json
// ==========================================

function normalizeM7TodayMap(m7TodayRaw = []) {
  let arr = [];

  if (Array.isArray(m7TodayRaw)) {
    arr = m7TodayRaw;
  } else if (m7TodayRaw && typeof m7TodayRaw === "object") {
    // 常見包法 1：{ data:[...] }
    if (Array.isArray(m7TodayRaw.data)) {
      arr = m7TodayRaw.data;
    }
    // 常見包法 2：{ items:[...] }
    else if (Array.isArray(m7TodayRaw.items)) {
      arr = m7TodayRaw.items;
    }
    // 常見包法 3：{ stocks:[...] }
    else if (Array.isArray(m7TodayRaw.stocks)) {
      arr = m7TodayRaw.stocks;
    }
    // 常見包法 4：物件裡只有一個陣列欄位
    else {
      const firstArray = Object.values(m7TodayRaw).find(v => Array.isArray(v));
      if (Array.isArray(firstArray)) {
        arr = firstArray;
      }
    }
  }

  console.log("M7 normalize input =", m7TodayRaw);
  console.log("M7 normalize array length =", arr.length);

  const map = {};

  for (const item of arr) {
    const symbol = String(item["股號"] || item.symbol || "").toUpperCase().trim();
    if (!symbol) continue;

    const valuationData = safeObject(item["估值資料"] || item.valuation_data || {});
    const trendJudge = safeObject(item["趨勢判讀"] || item.trend_judge || {});

    map[symbol] = {
      symbol,
      name: item["股名"] || item.name || symbol,
      sector: item["產業"] || item.sector || "",
      subsector: item["子產業"] || item.subsector || "",
      category: item["分類"] || item.category || "",
      risk_level: item["風險等級"] || item.risk_level || "",

      today_score: toNumber(item["today_score"], null),
      rank_today: toNumber(item["排名"], null),

      trend_state: trendJudge["趨勢狀態"] || item.trend_state || "",
      structure_state: trendJudge["結構狀態"] || item.structure_state || "",
      timing_state: trendJudge["時機狀態"] || item.timing_state || "",

      valuation_score: toNumber(item["valuation_score"], null),
      trend_score: toNumber(item["trend_score"], null),
      structure_score: toNumber(item["structure_score"], null),
      timing_score: toNumber(item["timing_score"], null),
      money_score: toNumber(item["money_score"], null),
      quality_score: toNumber(item["quality_score"], null),

      ui_bucket: item["ui_bucket"] || "",
      action_today: item["建議動作"] || item.action_today || "",
      exposure: safeObject(item["持倉曝險"] || item.exposure || {}),
      exposure_alert: safeObject(item["曝險警示"] || item.exposure_alert || {}),

      why_yes: Array.isArray(item["why_yes"]) ? item["why_yes"] : [],
      why_no: Array.isArray(item["why_no"]) ? item["why_no"] : [],

      valuation_note: item["估值說明"] || item.valuation_note || "",
      final_note: item["最終說明"] || item.final_note || "",

      valuation_data: {
        valuation_class: valuationData["ValuationClass"] || valuationData.valuation_class || "",
        peg: toNumber(valuationData["PEG"], null),
        forward_pe: toNumber(valuationData["ForwardPE"], null),
        anchor_pe: toNumber(valuationData["AnchorPE"], null),
        pe_ratio: toNumber(valuationData["PERatio"], null),
        eps_growth: toNumber(valuationData["EPS成長率"], null),
        pe_score: toNumber(valuationData["PEScore"], null),
        growth_score: toNumber(valuationData["GrowthScore"], null),
        growth_score_adj: toNumber(valuationData["GrowthScoreAdj"], null),
        quality_momentum: toNumber(valuationData["QualityMomentum"], null),
        quality_factor: toNumber(valuationData["QualityFactor"], null),
        valuation_raw: toNumber(valuationData["ValuationRaw"], null),
      },
    };
  }

  console.log("M7 normalize map keys =", Object.keys(map).slice(0, 10));
  console.log("M7 normalize COIN =", map["COIN"]);

  return map;
}

// ==========================================
// M3 正規化
// 來源：./data/m3/m3_output.json
// ==========================================

function buildFallbackM3CommentText(stock = {}) {
  const why = safeArray(stock.why);
  const whyNot = safeArray(stock.whyNot);

  const yesText = why.length ? `✔ ${why.join(" ｜ ")}` : "✔ 無明顯優勢";
  const noText = whyNot.length ? `⚠ ${whyNot.join(" ｜ ")}` : "⚠ 無明顯風險";

  return `${yesText}； ${noText}`;
}

function buildEnhancedM3Comment(item = {}) {
  const lines = [];

  const eventScore = toNumber(item.event_stock_score, null);
  const shortSwing =
    toNumber(item.short_swing_score, null) ??
    toNumber(item.shortSwing, null) ??
    toNumber(item["ShortSwing"], null);

  const midVol =
    toNumber(item.mid_volatility, null) ??
    toNumber(item.mid_term_volatility, null) ??
    toNumber(item["Mid-Term Volatility"], null);

  const trendRate =
    toNumber(item.trend_rate, null) ??
    toNumber(item["Trend Rate"], null);

  const longTrend =
    item.long_trend ||
    item["Long Trend"] ||
    "";

  const longTrendNote =
    item.long_trend_note ||
    item["Long Trend Note"] ||
    "";

  const midTrend =
    item.mid_trend ||
    item["Mid Trend"] ||
    "";

  const midTrendNote =
    item.mid_trend_note ||
    item["Mid Trend Note"] ||
    "";

  const trendProfile =
    item.trend_profile ||
    item["Trend Profile"] ||
    "";

  const trendProfileNote =
    item.trend_profile_note ||
    item["Trend Profile Note"] ||
    "";

  const why = safeArray(item.why);
  const whyNot = safeArray(item.whyNot);

  if (Number.isFinite(eventScore) || Number.isFinite(shortSwing)) {
    lines.push(
      `Event：${Number.isFinite(eventScore) ? round2(eventScore) : "-"} ｜ ShortSwing：${Number.isFinite(shortSwing) ? round2(shortSwing) : "-"}`
    );
  }

  if (Number.isFinite(midVol)) {
    lines.push(`Mid-Term Volatility：${midVol}`);
  }

  if (Number.isFinite(trendRate)) {
    lines.push(`Trend Rate：${trendRate}`);
  }

  if (longTrend || longTrendNote) {
    lines.push(`Long Trend：${longTrend || "-"}${longTrendNote ? ` ｜ ${longTrendNote}` : ""}`);
  }

  if (midTrend || midTrendNote) {
    lines.push(`Mid Trend：${midTrend || "-"}${midTrendNote ? ` ｜ ${midTrendNote}` : ""}`);
  }

  if (trendProfile || trendProfileNote) {
    lines.push(`Trend Profile：${trendProfile || "-"}${trendProfileNote ? ` ｜ ${trendProfileNote}` : ""}`);
  }

  if (why.length) {
    lines.push("");
    lines.push("Why");
    for (const x of why) lines.push(String(x));
  }

  if (whyNot.length) {
    lines.push("");
    lines.push("Why Not");
    for (const x of whyNot) lines.push(String(x));
  }

  if (!lines.length) {
    return item.market_comment || buildFallbackM3CommentText(item);
  }

  return lines.join("\n");
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
    const enhancedComment = buildEnhancedM3Comment(item);

    map[symbol] = {
      symbol,
      pure_stock_score: toNumber(item.pure_stock_score, null),
      snapshot_score: toNumber(item.snapshot_score, null),
      event_stock_score: toNumber(item.event_stock_score, null),
      delta_stock_score: toNumber(item.delta_stock_score, null),

      short_swing_score:
        toNumber(item.short_swing_score, null) ??
        toNumber(item.shortSwing, null) ??
        toNumber(item["ShortSwing"], null),

      mid_volatility:
        toNumber(item.mid_volatility, null) ??
        toNumber(item.mid_term_volatility, null) ??
        toNumber(item["Mid-Term Volatility"], null),

      trend_rate:
        toNumber(item.trend_rate, null) ??
        toNumber(item["Trend Rate"], null),

      long_trend: item.long_trend || item["Long Trend"] || "",
      long_trend_note: item.long_trend_note || item["Long Trend Note"] || "",
      mid_trend: item.mid_trend || item["Mid Trend"] || "",
      mid_trend_note: item.mid_trend_note || item["Mid Trend Note"] || "",
      trend_profile: item.trend_profile || item["Trend Profile"] || "",
      trend_profile_note: item.trend_profile_note || item["Trend Profile Note"] || "",

      bucket: item.bucket || "",
      suggestion: item.suggestion || "",
      trend: item.trend || "",

      why,
      whyNot,

      raw_market_comment: item.market_comment || "",
      market_comment: enhancedComment,
      display_comment: enhancedComment,
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
// 1M -> 代 MA50
// 3M -> 代 MA200
// 12M -> 年線
// ==========================================

export function applyDataSources(positionLike, marketRuntime = {}, m7TodayMap = {}, m3Map = {}) {
  const symbol = String(positionLike.symbol || "").toUpperCase();
  const rt = marketRuntime[symbol] || {};
  const m7 = m7TodayMap[symbol] || {};
  const m3 = m3Map[symbol] || {};

  const current = toNumber(rt.price_now, toNumber(positionLike.current, 0));

  const line1W = toNumber(rt.price_ref_1w, current);
  const line1M = toNumber(rt.price_ref_1m, current);
  const line3M = toNumber(rt.price_ref_3m, current);
  const line12M = toNumber(rt.price_ref_12m, current);

  return {
    ...positionLike,
    symbol,

    // M7 Today
    name: m7.name || positionLike.name || symbol,
    sector: m7.sector || positionLike.sector || "",
    subsector: m7.subsector || positionLike.subsector || "",
    category: m7.category || positionLike.category || "",
    risk_level: m7.risk_level || positionLike.risk_level || "",

    today_score: m7.today_score ?? positionLike.today_score,
    rank_today: m7.rank_today ?? positionLike.rank_today,
    trend_state: m7.trend_state || positionLike.trend_state || "",
    structure_state: m7.structure_state || positionLike.structure_state || "",
    timing_state: m7.timing_state || positionLike.timing_state || "",

    valuation_score: m7.valuation_score ?? positionLike.valuation_score,
    trend_score: m7.trend_score ?? positionLike.trend_score,
    structure_score: m7.structure_score ?? positionLike.structure_score,
    timing_score: m7.timing_score ?? positionLike.timing_score,
    money_score: m7.money_score ?? positionLike.money_score,
    quality_score: m7.quality_score ?? positionLike.quality_score,

    ui_bucket: m7.ui_bucket || positionLike.ui_bucket || "",
    action_today: m7.action_today || positionLike.action_today || "",
    exposure: m7.exposure || positionLike.exposure || {},
    exposure_alert: m7.exposure_alert || positionLike.exposure_alert || {},
    why_yes: Array.isArray(m7.why_yes) ? clone(m7.why_yes) : safeArray(positionLike.why_yes),
    why_no: Array.isArray(m7.why_no) ? clone(m7.why_no) : safeArray(positionLike.why_no),
    valuation_note: m7.valuation_note || positionLike.valuation_note || "",
    final_note: m7.final_note || positionLike.final_note || "",
    valuation_data: clone(m7.valuation_data || positionLike.valuation_data || {}),

    // M3 Commentary
    pure_stock_score: m3.pure_stock_score,
    snapshot_score: m3.snapshot_score,
    event_stock_score: m3.event_stock_score,
    delta_stock_score: m3.delta_stock_score,
    short_swing_score: m3.short_swing_score,
    mid_volatility: m3.mid_volatility,
    trend_rate: m3.trend_rate,
    long_trend: m3.long_trend || "",
    long_trend_note: m3.long_trend_note || "",
    mid_trend: m3.mid_trend || "",
    mid_trend_note: m3.mid_trend_note || "",
    trend_profile: m3.trend_profile || "",
    trend_profile_note: m3.trend_profile_note || "",
    m3_bucket: m3.bucket || "",
    m3_suggestion: m3.suggestion || "",
    m3_trend: m3.trend || "",
    why: Array.isArray(m3.why) ? clone(m3.why) : [],
    whyNot: Array.isArray(m3.whyNot) ? clone(m3.whyNot) : [],
    market_comment: m3.market_comment || "",
    display_comment: m3.display_comment || m3.market_comment || "",
    raw_market_comment: m3.raw_market_comment || "",

    // Market runtime
    current,
    line_1w: line1W,
    line_1m: line1M,
    line_3m: line3M,
    line_6m: line3M,
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
  const line3M = toNumber(item.line_3m ?? item.line_6m, current);
  const line12M = toNumber(item.line_12m, current);

  if (current >= line1W) score += 1;
  if (current >= line1M) score += 2;
  if (current >= line3M) score += 2;
  if (current >= line12M) score += 1;
  if (current > cost) score += 2;

  if (item.trend_state === "strong" || item.trend_state === "up_strong") score += 1;
  if (item.timing_state === "good" || item.timing_state === "warm") score += 1;
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
  const line3M = toNumber(item.line_3m ?? item.line_6m, current);
  const pnlPct = round2(safeDivide(current - cost, cost, 0) * 100);

  const support1 = Array.isArray(item.support) && item.support.length
    ? toNumber(item.support[0], 0)
    : 0;

  const nearSupport = support1 > 0 ? current <= support1 * 1.03 : false;
  const below1M = current < line1M;
  const below3M = current < line3M;
  const exposureLevel = String(item.exposure_alert?.level || "").toLowerCase();
  const actionToday = String(item.action_today || "");

  if (
    pnlPct <= -8 ||
    (nearSupport && below1M) ||
    (below1M && below3M && current < cost) ||
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
    return "仍弱於 1M / 3M 代理線，先看反彈";
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
    const m7 = m7TodayMap[symbol] || {};
    const m3 = m3Map[symbol] || {};

    if (!map.has(symbol)) {
      map.set(symbol, {
        symbol,
        name: p.name || m7.name || symbol,
        sector: p.sector || m7.sector || "",
        subsector: p.subsector || m7.subsector || "",
        category: p.category || m7.category || "",
        risk_level: p.risk_level || m7.risk_level || "",

        today_score: p.today_score ?? m7.today_score,
        rank_today: p.rank_today ?? m7.rank_today,
        trend_state: p.trend_state || m7.trend_state || "",
        structure_state: p.structure_state || m7.structure_state || "",
        timing_state: p.timing_state || m7.timing_state || "",
        valuation_score: p.valuation_score ?? m7.valuation_score,
        trend_score: p.trend_score ?? m7.trend_score,
        structure_score: p.structure_score ?? m7.structure_score,
        timing_score: p.timing_score ?? m7.timing_score,
        money_score: p.money_score ?? m7.money_score,
        quality_score: p.quality_score ?? m7.quality_score,
        ui_bucket: p.ui_bucket || m7.ui_bucket || "",
        action_today: p.action_today || m7.action_today || "",
        exposure: clone(p.exposure || m7.exposure || {}),
        exposure_alert: clone(p.exposure_alert || m7.exposure_alert || {}),
        why_yes: clone(p.why_yes || m7.why_yes || []),
        why_no: clone(p.why_no || m7.why_no || []),
        valuation_note: p.valuation_note || m7.valuation_note || "",
        final_note: p.final_note || m7.final_note || "",
        valuation_data: clone(p.valuation_data || m7.valuation_data || {}),

        // M3
        pure_stock_score: Number.isFinite(p.pure_stock_score) ? p.pure_stock_score : m3.pure_stock_score,
        snapshot_score: Number.isFinite(p.snapshot_score) ? p.snapshot_score : m3.snapshot_score,
        event_stock_score: Number.isFinite(p.event_stock_score) ? p.event_stock_score : m3.event_stock_score,
        delta_stock_score: Number.isFinite(p.delta_stock_score) ? p.delta_stock_score : m3.delta_stock_score,
        short_swing_score: Number.isFinite(p.short_swing_score) ? p.short_swing_score : m3.short_swing_score,
        mid_volatility: Number.isFinite(p.mid_volatility) ? p.mid_volatility : m3.mid_volatility,
        trend_rate: Number.isFinite(p.trend_rate) ? p.trend_rate : m3.trend_rate,
        long_trend: p.long_trend || m3.long_trend || "",
        long_trend_note: p.long_trend_note || m3.long_trend_note || "",
        mid_trend: p.mid_trend || m3.mid_trend || "",
        mid_trend_note: p.mid_trend_note || m3.mid_trend_note || "",
        trend_profile: p.trend_profile || m3.trend_profile || "",
        trend_profile_note: p.trend_profile_note || m3.trend_profile_note || "",
        why: clone(p.why || m3.why || []),
        whyNot: clone(p.whyNot || m3.whyNot || []),
        market_comment: p.market_comment || m3.market_comment || "",
        display_comment: p.display_comment || m3.display_comment || m3.market_comment || "",
        raw_market_comment: p.raw_market_comment || m3.raw_market_comment || "",
        m3_bucket: p.m3_bucket || m3.bucket || "",
        m3_suggestion: p.m3_suggestion || m3.suggestion || "",
        m3_trend: p.m3_trend || m3.trend || "",

        quantity: 0,
        total_cost_amount: 0,
        market_value: 0,

        current: p.current,
        line_1w: p.line_1w,
        line_1m: p.line_1m,
        line_3m: p.line_3m ?? p.line_6m,
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

    // M7 fallback
    if (!row.name && m7.name) row.name = m7.name;
    if (!row.sector && m7.sector) row.sector = m7.sector;
    if (!row.subsector && m7.subsector) row.subsector = m7.subsector;
    if (!row.category && m7.category) row.category = m7.category;
    if (!row.risk_level && m7.risk_level) row.risk_level = m7.risk_level;

    if ((row.today_score === undefined || row.today_score === null) && m7.today_score != null) row.today_score = m7.today_score;
    if ((row.rank_today === undefined || row.rank_today === null) && m7.rank_today != null) row.rank_today = m7.rank_today;
    if (!row.trend_state && m7.trend_state) row.trend_state = m7.trend_state;
    if (!row.structure_state && m7.structure_state) row.structure_state = m7.structure_state;
    if (!row.timing_state && m7.timing_state) row.timing_state = m7.timing_state;

    if ((row.valuation_score === undefined || row.valuation_score === null) && m7.valuation_score != null) row.valuation_score = m7.valuation_score;
    if ((row.trend_score === undefined || row.trend_score === null) && m7.trend_score != null) row.trend_score = m7.trend_score;
    if ((row.structure_score === undefined || row.structure_score === null) && m7.structure_score != null) row.structure_score = m7.structure_score;
    if ((row.timing_score === undefined || row.timing_score === null) && m7.timing_score != null) row.timing_score = m7.timing_score;
    if ((row.money_score === undefined || row.money_score === null) && m7.money_score != null) row.money_score = m7.money_score;
    if ((row.quality_score === undefined || row.quality_score === null) && m7.quality_score != null) row.quality_score = m7.quality_score;

    if (!row.ui_bucket && m7.ui_bucket) row.ui_bucket = m7.ui_bucket;
    if (!row.action_today && m7.action_today) row.action_today = m7.action_today;
    if ((!row.exposure || !Object.keys(row.exposure).length) && m7.exposure) row.exposure = clone(m7.exposure);
    if ((!row.exposure_alert || !Object.keys(row.exposure_alert).length) && m7.exposure_alert) row.exposure_alert = clone(m7.exposure_alert);
    if ((!row.why_yes || !row.why_yes.length) && Array.isArray(m7.why_yes) && m7.why_yes.length) row.why_yes = clone(m7.why_yes);
    if ((!row.why_no || !row.why_no.length) && Array.isArray(m7.why_no) && m7.why_no.length) row.why_no = clone(m7.why_no);
    if (!row.valuation_note && m7.valuation_note) row.valuation_note = m7.valuation_note;
    if (!row.final_note && m7.final_note) row.final_note = m7.final_note;
    if ((!row.valuation_data || !Object.keys(row.valuation_data).length) && m7.valuation_data) row.valuation_data = clone(m7.valuation_data);

    // M3 fallback
    if (!row.market_comment && p.market_comment) row.market_comment = p.market_comment;
    if (!row.display_comment && p.display_comment) row.display_comment = p.display_comment;
    if ((!row.why || !row.why.length) && Array.isArray(p.why) && p.why.length) row.why = clone(p.why);
    if ((!row.whyNot || !row.whyNot.length) && Array.isArray(p.whyNot) && p.whyNot.length) row.whyNot = clone(p.whyNot);

    if (!row.market_comment && m3.market_comment) row.market_comment = m3.market_comment;
    if (!row.display_comment && (m3.display_comment || m3.market_comment)) row.display_comment = m3.display_comment || m3.market_comment;
    if ((!row.why || !row.why.length) && Array.isArray(m3.why) && m3.why.length) row.why = clone(m3.why);
    if ((!row.whyNot || !row.whyNot.length) && Array.isArray(m3.whyNot) && m3.whyNot.length) row.whyNot = clone(m3.whyNot);

    if (!Number.isFinite(row.pure_stock_score) && Number.isFinite(p.pure_stock_score)) row.pure_stock_score = p.pure_stock_score;
    if (!Number.isFinite(row.snapshot_score) && Number.isFinite(p.snapshot_score)) row.snapshot_score = p.snapshot_score;
    if (!Number.isFinite(row.event_stock_score) && Number.isFinite(p.event_stock_score)) row.event_stock_score = p.event_stock_score;
    if (!Number.isFinite(row.delta_stock_score) && Number.isFinite(p.delta_stock_score)) row.delta_stock_score = p.delta_stock_score;
    if (!Number.isFinite(row.short_swing_score) && Number.isFinite(p.short_swing_score)) row.short_swing_score = p.short_swing_score;
    if (!Number.isFinite(row.mid_volatility) && Number.isFinite(p.mid_volatility)) row.mid_volatility = p.mid_volatility;
    if (!Number.isFinite(row.trend_rate) && Number.isFinite(p.trend_rate)) row.trend_rate = p.trend_rate;

    if (!Number.isFinite(row.pure_stock_score) && Number.isFinite(m3.pure_stock_score)) row.pure_stock_score = m3.pure_stock_score;
    if (!Number.isFinite(row.snapshot_score) && Number.isFinite(m3.snapshot_score)) row.snapshot_score = m3.snapshot_score;
    if (!Number.isFinite(row.event_stock_score) && Number.isFinite(m3.event_stock_score)) row.event_stock_score = m3.event_stock_score;
    if (!Number.isFinite(row.delta_stock_score) && Number.isFinite(m3.delta_stock_score)) row.delta_stock_score = m3.delta_stock_score;
    if (!Number.isFinite(row.short_swing_score) && Number.isFinite(m3.short_swing_score)) row.short_swing_score = m3.short_swing_score;
    if (!Number.isFinite(row.mid_volatility) && Number.isFinite(m3.mid_volatility)) row.mid_volatility = m3.mid_volatility;
    if (!Number.isFinite(row.trend_rate) && Number.isFinite(m3.trend_rate)) row.trend_rate = m3.trend_rate;

    if (!row.long_trend && m3.long_trend) row.long_trend = m3.long_trend;
    if (!row.long_trend_note && m3.long_trend_note) row.long_trend_note = m3.long_trend_note;
    if (!row.mid_trend && m3.mid_trend) row.mid_trend = m3.mid_trend;
    if (!row.mid_trend_note && m3.mid_trend_note) row.mid_trend_note = m3.mid_trend_note;
    if (!row.trend_profile && m3.trend_profile) row.trend_profile = m3.trend_profile;
    if (!row.trend_profile_note && m3.trend_profile_note) row.trend_profile_note = m3.trend_profile_note;

    if (!row.m3_bucket && (p.m3_bucket || m3.bucket)) row.m3_bucket = p.m3_bucket || m3.bucket || "";
    if (!row.m3_suggestion && (p.m3_suggestion || m3.suggestion)) row.m3_suggestion = p.m3_suggestion || m3.suggestion || "";
    if (!row.m3_trend && (p.m3_trend || m3.trend)) row.m3_trend = p.m3_trend || m3.trend || "";
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
      valuation_data: row.valuation_data,

      // M3
      pure_stock_score: row.pure_stock_score,
      snapshot_score: row.snapshot_score,
      event_stock_score: row.event_stock_score,
      delta_stock_score: row.delta_stock_score,
      short_swing_score: row.short_swing_score,
      mid_volatility: row.mid_volatility,
      trend_rate: row.trend_rate,
      long_trend: row.long_trend,
      long_trend_note: row.long_trend_note,
      mid_trend: row.mid_trend,
      mid_trend_note: row.mid_trend_note,
      trend_profile: row.trend_profile,
      trend_profile_note: row.trend_profile_note,
      why: row.why,
      whyNot: row.whyNot,
      market_comment: row.market_comment,
      display_comment: row.display_comment,
      raw_market_comment: row.raw_market_comment,
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
      line_3m: row.line_3m,
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
