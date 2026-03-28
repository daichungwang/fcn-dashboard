// ==========================================
// macro_to_stock_engine.js V1
// 振宇 FCN 系統｜M1 → Stock Engine
// 功能：把總經 / 波動 / 新聞偏向 轉成股票評分調整值
// ==========================================

// ------------------------------------------
// 工具
// ------------------------------------------
function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeText(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function includesAny(text, keywords = []) {
  const lower = safeText(text).toLowerCase();
  return keywords.some(k => lower.includes(String(k).toLowerCase()));
}

// ------------------------------------------
// 1) 總經環境評分
// ------------------------------------------
export function evaluateMacroEnvironment(macro = {}) {
  let score = 0;
  const reasons = [];

  const vix = toNumber(macro.vix, 0);
  const us10y = toNumber(macro.us10y, 0);
  const cpi_yoy = toNumber(macro.cpi_yoy, 0);
  const ppi_yoy = toNumber(macro.ppi_yoy, 0);
  const sp500_change = toNumber(macro.sp500_change, 0);
  const nasdaq_change = toNumber(macro.nasdaq_change, 0);

  // VIX
  if (vix >= 30) {
    score -= 6;
    reasons.push("VIX >= 30，市場恐慌偏高");
  } else if (vix >= 25) {
    score -= 4;
    reasons.push("VIX >= 25，波動偏高");
  } else if (vix <= 15 && vix > 0) {
    score += 2;
    reasons.push("VIX <= 15，市場相對穩定");
  }

  // 美債殖利率
  if (us10y >= 4.8) {
    score -= 3;
    reasons.push("美債殖利率偏高，壓抑成長股估值");
  } else if (us10y > 0 && us10y <= 3.8) {
    score += 2;
    reasons.push("美債殖利率相對溫和");
  }

  // CPI / PPI
  if (cpi_yoy >= 3.5) {
    score -= 2;
    reasons.push("CPI 偏高，通膨壓力仍在");
  } else if (cpi_yoy > 0 && cpi_yoy <= 2.5) {
    score += 1;
    reasons.push("CPI 相對溫和");
  }

  if (ppi_yoy >= 3.5) {
    score -= 1;
    reasons.push("PPI 偏高，企業成本壓力較大");
  }

  // 指數氣氛
  if (sp500_change <= -2) {
    score -= 2;
    reasons.push("S&P 500 單日跌幅較大");
  } else if (sp500_change >= 1.5) {
    score += 1;
    reasons.push("S&P 500 單日表現偏正向");
  }

  if (nasdaq_change <= -2.5) {
    score -= 2;
    reasons.push("NASDAQ 單日跌幅較大");
  } else if (nasdaq_change >= 2) {
    score += 1;
    reasons.push("NASDAQ 單日表現偏強");
  }

  let bias = "neutral";
  if (score >= 3) bias = "positive";
  else if (score <= -3) bias = "negative";

  return {
    score,
    bias,
    reasons
  };
}

// ------------------------------------------
// 2) 個股類型加權
// 你之前定義：AI硬體風險較低，AI軟體中性偏正
// ------------------------------------------
export function evaluateStockTypeBias(stock = {}) {
  const type = safeText(stock.type, "").toLowerCase();
  const symbol = safeText(stock.symbol, "");
  let score = 0;
  const reasons = [];

  if (includesAny(type, ["ai/硬體", "ai硬體", "semiconductor", "半導體"])) {
    score += 4;
    reasons.push(`${symbol} 屬 AI硬體/半導體，FCN 接股接受度較高`);
  } else if (includesAny(type, ["ai/軟體", "軟體", "platform", "平台"])) {
    score += 1;
    reasons.push(`${symbol} 屬平台/軟體，給小幅正向`);
  } else if (includesAny(type, ["defensive", "防禦"])) {
    score += 2;
    reasons.push(`${symbol} 屬防禦型類股`);
  } else if (includesAny(type, ["event", "事件"])) {
    score -= 2;
    reasons.push(`${symbol} 屬事件股，波動不確定性較高`);
  }

  return { score, reasons };
}

// ------------------------------------------
// 3) 波動懲罰
// ------------------------------------------
export function evaluateVolatilityPenalty(stock = {}) {
  const volatility = safeText(stock.volatility, "");
  const symbol = safeText(stock.symbol, "");
  let score = 0;
  const reasons = [];

  if (volatility === "高") {
    score -= 3;
    reasons.push(`${symbol} 波動高`);
  } else if (volatility === "中") {
    score -= 1;
    reasons.push(`${symbol} 波動中`);
  } else if (volatility === "低") {
    score += 1;
    reasons.push(`${symbol} 波動低`);
  }

  return { score, reasons };
}

// ------------------------------------------
// 4) 新聞偏向（簡化版）
// newsList 格式範例：
// [
//   {
//     title: "...",
//     summary: "...",
//     sentiment: "positive" | "negative" | "neutral",
//     related: ["NVDA", "TSM"]
//   }
// ]
// ------------------------------------------
export function evaluateNewsBias(stock = {}, newsList = []) {
  const symbol = safeText(stock.symbol, "");
  let score = 0;
  const reasons = [];

  newsList.forEach(news => {
    const related = Array.isArray(news.related) ? news.related : [];
    if (!related.includes(symbol)) return;

    const sentiment = safeText(news.sentiment, "neutral");

    if (sentiment === "positive") {
      score += 2;
      reasons.push(`${symbol} 有正向新聞`);
    } else if (sentiment === "negative") {
      score -= 3;
      reasons.push(`${symbol} 有負向新聞`);
    }
  });

  return { score, reasons };
}

// ------------------------------------------
// 5) M1 → Stock 最終轉換
// ------------------------------------------
export function buildMacroStockSignal(stock = {}, macro = {}, newsList = []) {
  const symbol = safeText(stock.symbol, "");

  const macroPart = evaluateMacroEnvironment(macro);
  const typePart = evaluateStockTypeBias(stock);
  const volPart = evaluateVolatilityPenalty(stock);
  const newsPart = evaluateNewsBias(stock, newsList);

  const totalAdjustment =
    macroPart.score +
    typePart.score +
    volPart.score +
    newsPart.score;

  let tag = "觀察";
  if (totalAdjustment >= 5) tag = "正向加權";
  else if (totalAdjustment <= -5) tag = "負向加權";

  return {
    symbol,
    macro_score: macroPart.score,
    type_score: typePart.score,
    volatility_score: volPart.score,
    news_score: newsPart.score,
    total_adjustment: totalAdjustment,
    tag,
    reasons: [
      ...macroPart.reasons,
      ...typePart.reasons,
      ...volPart.reasons,
      ...newsPart.reasons
    ]
  };
}

// ------------------------------------------
// 6) 整個股票池批次轉換
// ------------------------------------------
export function buildMacroStockSignals(pool = [], macro = {}, newsList = []) {
  if (!Array.isArray(pool)) return [];

  return pool.map(stock => buildMacroStockSignal(stock, macro, newsList));
}
// ==========================================
// 🔧 舊版接口相容（給 m1_event_engine 用）
// ==========================================
export function applyMacroToStock({ macroEvents, stock }) {
  return buildMacroStockSignal(
    stock,
    {},                 // macro 暫時不使用
    macroEvents || []
  );
}

