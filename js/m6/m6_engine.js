// ==========================================
// M6 Engine v5（整合 M3 Market Comment 強化版）
// ==========================================

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

// ==========================================
// M7 Today
// ==========================================
function normalizeM7TodayMap(m7TodayRaw = []) {
  const map = {};

  for (const item of m7TodayRaw || []) {
    const symbol = String(item["股號"] || "").toUpperCase();
    if (!symbol) continue;

    map[symbol] = {
      symbol,
      name: item["股名"],

      today_score: item["today_score"],
      valuation_score: item["valuation_score"],
      trend_score: item["trend_score"],
      structure_score: item["structure_score"],
      timing_score: item["timing_score"],
      money_score: item["money_score"],

      trend_state: item["趨勢判讀"]?.["趨勢狀態"],
      structure_state: item["趨勢判讀"]?.["結構狀態"],
      timing_state: item["趨勢判讀"]?.["時機狀態"],

      why_yes: item["why_yes"] || [],
      why_no: item["why_no"] || [],

      valuation_note: item["估值說明"] || "",
      final_note: item["最終說明"] || "",

      valuation_data: item["估值資料"] || {}
    };
  }

  return map;
}

// ==========================================
// 🔥 M3 強化（關鍵在這）
// ==========================================
function buildEnhancedM3Comment(item) {
  return `
Event：${toNumber(item.event_stock_score)} ｜ ShortSwing：${toNumber(item.short_swing_score)}
Mid-Term Volatility：${toNumber(item.mid_volatility)}
Trend Rate：${toNumber(item.trend_rate)}

Long Trend：${item.long_trend || "-"}
Mid Trend：${item.mid_trend || "-"}
Trend Profile：${item.trend_profile || "-"}

Why：
${safeArray(item.why).join("\n")}

Why Not：
${safeArray(item.whyNot).join("\n")}
`;
}

function normalizeM3Map(m3Raw = {}) {
  const map = {};

  const stockResults = Array.isArray(m3Raw.stockResults)
    ? m3Raw.stockResults
    : [];

  for (const item of stockResults) {
    const symbol = String(item.symbol || "").toUpperCase();
    if (!symbol) continue;

    const why = safeArray(item.why);
    const whyNot = safeArray(item.whyNot);

    map[symbol] = {
      symbol,
      pure_stock_score: toNumber(item.pure_stock_score, null),
      snapshot_score: toNumber(item.snapshot_score, null),
      event_stock_score: toNumber(item.event_stock_score, null),
      delta_stock_score: toNumber(item.delta_stock_score, null),

      // 🔥 新增這些
      short_swing_score: item.short_swing_score,
      mid_volatility: item.mid_volatility,
      trend_rate: item.trend_rate,
      long_trend: item.long_trend,
      mid_trend: item.mid_trend,
      trend_profile: item.trend_profile,

      why,
      whyNot,

      // 🔥 關鍵：覆蓋 market_comment
      market_comment:
        buildEnhancedM3Comment(item),

      display_comment:
        buildEnhancedM3Comment(item)
    };
  }

  return map;
}

// ==========================================
// 🔥🔥🔥 M3 → 完整 Market Comment 組合
// ==========================================
function buildFullM3Comment(item) {

  return `
Event：${toNumber(item.event_stock_score)} ｜ ShortSwing：${toNumber(item.short_swing_score)}
Mid-Term Volatility：${toNumber(item.mid_volatility)}
Trend Rate：${toNumber(item.trend_rate)}

Long Trend：${item.long_trend || "-"}
Mid Trend：${item.mid_trend || "-"}
Trend Profile：${item.trend_profile || "-"}

Why：
${safeArray(item.why).join("\n")}

Why Not：
${safeArray(item.whyNot).join("\n")}
`;
}

// ==========================================
// 主資料整合
// ==========================================
export function buildM6ViewModel(raw = {}) {

  const m7Map = normalizeM7TodayMap(raw.m7TodayRaw || []);
  const m3Map = normalizeM3Map(raw.m3Raw || {});

  const result = [];

  for (const symbol in m7Map) {
    const m7 = m7Map[symbol];
    const m3 = m3Map[symbol] || {};

    result.push({
      symbol,

      // M7
      ...m7,

      // M3
      ...m3,

      display_comment: m3.market_comment || ""
    });
  }

  return result;
}
