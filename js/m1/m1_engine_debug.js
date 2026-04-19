// ==========================================
// M1 ENGINE DEBUG VERSION
// 振宇專用：先查資料鏈，不先修畫面
// ==========================================

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function hasValue(v) {
  return v !== undefined && v !== null && v !== "" && !(typeof v === "number" && Number.isNaN(v));
}

function normalize(value, min, max) {
  if (!Number.isFinite(value)) return 0;
  if (max === min) return 5;
  const score = 10 * (value - min) / (max - min);
  return Math.max(0, Math.min(10, score));
}

function calcCapexRaw(stock) {
  const capexGrowth = Number(stock.capex_growth);
  const profitMargin = Number(stock.profit_margin);

  if (!Number.isFinite(capexGrowth) || !Number.isFinite(profitMargin) || profitMargin === 0) {
    return null;
  }

  return capexGrowth / profitMargin;
}

function calcCapexScore(stock) {
  const raw = calcCapexRaw(stock);
  if (raw === null) return null;

  // 之後可再調整
  return normalize(raw, -1, 3);
}

function calcM3Score(stock) {
  const pure = Number(stock.pure_score);
  const event = Number(stock.event_score);
  const snapshot = Number(stock.snapshot_score);

  if (![pure, event, snapshot].every(Number.isFinite)) return null;

  return pure + event + snapshot;
}

function calcM7Core(stock) {
  const valuation = Number(stock.valuation_score);
  const trend = Number(stock.trend_score);
  const quality = Number(stock.quality_score);

  if (![valuation, trend, quality].every(Number.isFinite)) return null;

  return valuation + trend + quality;
}

function getMissingFields(stock) {
  const requiredFields = [
    "symbol",
    "capex_growth",
    "profit_margin",
    "pure_score",
    "event_score",
    "snapshot_score",
    "valuation_score",
    "trend_score",
    "quality_score"
  ];

  return requiredFields.filter((key) => !hasValue(stock[key]));
}

function buildDebugRecord(stock) {
  const symbol = String(stock.symbol || "").trim().toUpperCase();

  const capexRaw = calcCapexRaw(stock);
  const capexScore = calcCapexScore(stock);
  const m3Score = calcM3Score(stock);
  const m7Score = calcM7Core(stock);
  const missingFields = getMissingFields(stock);

  const hasCapexBlock =
    hasValue(stock.capex_growth) &&
    hasValue(stock.profit_margin) &&
    Number(stock.profit_margin) !== 0;

  const hasM3Block =
    hasValue(stock.pure_score) &&
    hasValue(stock.event_score) &&
    hasValue(stock.snapshot_score);

  const hasM7Block =
    hasValue(stock.valuation_score) &&
    hasValue(stock.trend_score) &&
    hasValue(stock.quality_score);

  const finalEligible =
    symbol &&
    Number.isFinite(capexScore) &&
    Number.isFinite(m3Score) &&
    Number.isFinite(m7Score);

  let reason = "ok";
  if (!symbol) {
    reason = "missing symbol";
  } else if (!hasCapexBlock) {
    reason = "missing capex block";
  } else if (!hasM3Block) {
    reason = "missing m3 block";
  } else if (!hasM7Block) {
    reason = "missing m7 block";
  } else if (!finalEligible) {
    reason = "not eligible for unknown reason";
  }

  const rawScore = finalEligible
    ? (0.5 * capexScore + 0.25 * m3Score + 0.25 * m7Score)
    : null;

  return {
    symbol,
    in_universe: !!symbol,
    has_capex_growth: hasValue(stock.capex_growth),
    has_profit_margin: hasValue(stock.profit_margin),
    has_m3: hasM3Block,
    has_m7: hasM7Block,
    capex_raw: capexRaw,
    capex_score: capexScore,
    m3_score: m3Score,
    m7_score: m7Score,
    raw_score: Number.isFinite(rawScore) ? Number(rawScore.toFixed(4)) : null,
    final_in_l1: finalEligible,
    missing_fields: missingFields,
    reason
  };
}

function buildFinalScore(debugRecord) {
  return {
    symbol: debugRecord.symbol,
    score: Number(debugRecord.raw_score.toFixed(2)),
    breakdown: {
      capex: Number((debugRecord.capex_score ?? 0).toFixed(2)),
      m3: Number((debugRecord.m3_score ?? 0).toFixed(2)),
      m7: Number((debugRecord.m7_score ?? 0).toFixed(2))
    }
  };
}

function addNormalizedScore(finalScores) {
  if (!Array.isArray(finalScores) || !finalScores.length) return finalScores;

  const maxScore = Math.max(...finalScores.map((x) => Number(x.score) || 0));

  return finalScores.map((item) => ({
    ...item,
    score_norm: maxScore > 0
      ? Number(((item.score / maxScore) * 10).toFixed(2))
      : 0
  }));
}

export function runM1EngineDebug(stocks = []) {
  const debugTable = stocks.map(buildDebugRecord);

  const finalScores = debugTable
    .filter((x) => x.final_in_l1)
    .map(buildFinalScore)
    .sort((a, b) => b.score - a.score);

  const finalScoresNormalized = addNormalizedScore(finalScores);

  return {
    total_input: stocks.length,
    total_debug: debugTable.length,
    total_eligible: finalScores.length,
    debug_table: debugTable,
    final_scores: finalScoresNormalized
  };
}

// ==========================================
// 指定查詢 symbol
// ==========================================
export function findDebugBySymbols(result, symbols = []) {
  const target = symbols.map((s) => String(s || "").trim().toUpperCase());
  return (result?.debug_table || []).filter((row) => target.includes(row.symbol));
}

// ==========================================
// 只看缺資料股票
// ==========================================
export function getMissingDataList(result) {
  return (result?.debug_table || []).filter((row) => !row.final_in_l1);
}

// ==========================================
// console 輔助
// ==========================================
export function printKeyDebug(result, symbols = ["COIN", "SOFI", "QQQ"]) {
  const rows = findDebugBySymbols(result, symbols);
  console.table(rows);
  return rows;
}
