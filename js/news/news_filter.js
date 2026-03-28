/* =========================================
   News Filter V1
   功能：
   1. 過濾與 FCN / 市場高度相關的新聞
   2. 支援關鍵字 + 股票池 ticker 過濾
========================================= */

const STRONG_KEYWORDS = [
  "fed", "rate", "rates", "interest rate", "yield", "treasury",
  "inflation", "cpi", "ppi", "jobs", "employment",
  "oil", "crude", "energy", "war", "geopolitical", "geopolitics",
  "vix", "volatility", "market", "stocks", "equity",
  "ai", "artificial intelligence", "semiconductor", "chip", "gpu",
  "earnings", "guidance", "forecast", "outlook"
];

const NOISE_KEYWORDS = [
  "education", "school", "student", "gaming tips", "recipe",
  "celebrity", "movie review", "travel guide", "lifestyle",
  "fashion", "sports rumor", "dating", "restaurant", "weather only"
];

function normalizeText(raw = "") {
  return String(raw).toLowerCase().replace(/\s+/g, " ").trim();
}

function includesAny(text, keywords = []) {
  return keywords.some((kw) => text.includes(kw));
}

function countHits(text, keywords = []) {
  return keywords.reduce((count, kw) => count + (text.includes(kw) ? 1 : 0), 0);
}

function buildTickerKeywords(stockPool = []) {
  const symbols = stockPool.map((s) => String(s.symbol || "").toLowerCase());

  const nameKeywords = stockPool
    .map((s) => String(s.name || "").toLowerCase())
    .filter(Boolean);

  return [...new Set([...symbols, ...nameKeywords])];
}

/* -----------------------------------------
   單則新聞評分
----------------------------------------- */
export function scoreNewsRelevance(news, stockPool = []) {
  const title = normalizeText(news.title || "");
  const summary = normalizeText(news.summary || "");
  const source = normalizeText(news.source || "");
  const text = `${title} ${summary} ${source}`;

  const tickerKeywords = buildTickerKeywords(stockPool);

  const strongHits = countHits(text, STRONG_KEYWORDS);
  const tickerHits = countHits(text, tickerKeywords);
  const noiseHits = countHits(text, NOISE_KEYWORDS);

  let score = 0;

  score += strongHits * 2;
  score += tickerHits * 3;
  score -= noiseHits * 3;

  return {
    score,
    strongHits,
    tickerHits,
    noiseHits
  };
}

/* -----------------------------------------
   主過濾器
----------------------------------------- */
export function filterNews(rawNewsList = [], stockPool = [], options = {}) {
  const {
    minScore = 2,
    maxItems = 10,
    debug = true
  } = options;

  const scored = rawNewsList.map((item) => {
    const meta = scoreNewsRelevance(item, stockPool);
    return {
      ...item,
      _filter_score: meta.score,
      _filter_meta: meta
    };
  });

  const kept = scored
    .filter((item) => item._filter_score >= minScore)
    .sort((a, b) => b._filter_score - a._filter_score)
    .slice(0, maxItems);

  if (debug) {
    console.log("🧹 Filter scored =", scored);
    console.log("✅ Filter kept =", kept);
  }

  return kept;
}
