async function loadM7() {
  const res = await fetch("data/m7/m7_new_stock_today.json");
  if (!res.ok) throw new Error("無法讀取 M7 檔案");
  return await res.json();
}

/**
 * 若不想讓 fallback 參與計算
 * 直接改成 const FALLBACK_STOCKS = {};
 */
const FALLBACK_STOCKS = {
  INTC: {
    "股號": "INTC",
    "股名": "Intel",
    "產業": "AI_SEMI",
    "子產業": "CPU",
    "風險等級": "中",
    "today_score": 62,
    "_source": "fallback"
  }
};

function allM7Stocks(m7json) {
  return [
    ...(m7json.aggressive_recommend || []),
    ...(m7json.watch_list || []),
    ...(m7json.remove_list || []),
    ...(m7json.all || [])
  ];
}

function findStock(m7json, symbol) {
  const stock = allM7Stocks(m7json).find(
    s => String(s["股號"] || "").toUpperCase() === symbol
  );

  if (stock) return { ...stock, _source: "m7" };
  if (FALLBACK_STOCKS[symbol]) return FALLBACK_STOCKS[symbol];

  throw new Error(`M7 找不到股票: ${symbol}`);
}

function getTodayScore(stock) {
  return Number(stock.today_score || 0);
}

function getSector(stock) {
  return String(stock["產業"] || "OTHER");
}

function getSubsector(stock) {
  return String(stock["子產業"] || "OTHER");
}

function getRiskLevel(stock) {
  return String(stock["風險等級"] || "");
}

function calcWeaknesses(scores) {
  return scores.map(s => 100 - s).sort((a, b) => b - a);
}

/**
 * 新版 BW：soft worst
 * BW = 0.5 * worst + 0.5 * avg
 */
function calcBW(weaknesses) {
  const sorted = [...weaknesses].sort((a, b) => b - a);
  const worst = sorted[0];
  const avg = weaknesses.reduce((a, b) => a + b, 0) / weaknesses.length;

  return 0.5 * worst + 0.5 * avg;
}

/**
 * Tail：縮小版
 * TailAdj = 0.05 * (worst - avg)
 */
function calcTailAdj(weaknesses) {
  const sorted = [...weaknesses].sort((a, b) => b - a);
  const worst = sorted[0];
  const avg = weaknesses.reduce((a, b) => a + b, 0) / weaknesses.length;

  return 0.05 * (worst - avg);
}

/**
 * KI：
 * - KI=55 -> 0.5
 * - 55~75 正常加速
 * - >75 降速，避免高 KI 爆掉
 */
function calcKIAdj(KI) {
  if (KI <= 75) {
    return 0.5 + 0.12 * (KI - 55) + 0.004 * Math.pow(KI - 55, 2);
  }

  const kiAt75 = 0.5 + 0.12 * (75 - 55) + 0.004 * Math.pow(75 - 55, 2);
  return kiAt75 + 0.05 * (KI - 75);
}

/**
 * Tenor：
 * 2M = 0
 * 6M = 1
 */
function calcTenorAdj(T) {
  return 0.25 * (T - 2);
}

/**
 * Strike：
 * base = 55
 * 權重已減半
 */
function calcStrikeAdj(strike) {
  return 0.05 * (strike - 55);
}

/**
 * Type：
 * EKI = 0
 * DACN = 0.5
 * AKI = 1
 */
function calcTypeAdj(type) {
  if (type === "DACN") return 0.5;
  if (type === "AKI") return 1;
  return 0; // EKI
}

/**
 * Resonance：保留，但溫和版
 */
function calcResonance(stocks) {
  const N = stocks.length;

  const sectorCount = {};
  const themeCount = {};
  let highRiskCount = 0;

  for (const stock of stocks) {
    const sec = getSector(stock).toUpperCase();
    const sub = getSubsector(stock).toUpperCase();
    const risk = getRiskLevel(stock);

    sectorCount[sec] = (sectorCount[sec] || 0) + 1;

    const themeKey =
      sec.includes("AI") || sec.includes("SEMI") || sec.includes("PLATFORM") ||
      sub.includes("AI") || sub.includes("GPU") || sub.includes("CPU") ||
      sub.includes("FOUNDRY") || sub.includes("ASIC") || sub.includes("CLOUD") ||
      sub.includes("IP")
        ? "AI_STYLE"
        : sec;

    themeCount[themeKey] = (themeCount[themeKey] || 0) + 1;

    if (risk === "高") highRiskCount += 1;
  }

  const maxSector = Math.max(...Object.values(sectorCount));
  const maxTheme = Math.max(...Object.values(themeCount));

  const sectorScore = maxSector / N;
  const themeScore = maxTheme / N;
  const valuationSync = highRiskCount / N;

  const resonanceIndex =
    0.45 * sectorScore +
    0.35 * themeScore +
    0.20 * valuationSync;

  const resonanceAdj = 0.6 * Math.pow(resonanceIndex, 2);

  return {
    resonance_index: Number(resonanceIndex.toFixed(4)),
    resonance_adj: Number(resonanceAdj.toFixed(2)),
    resonance_breakdown: {
      sector_score: Number(sectorScore.toFixed(4)),
      theme_score: Number(themeScore.toFixed(4)),
      valuation_sync: Number(valuationSync.toFixed(4))
    }
  };
}

/**
 * Structure：
 * Gap 先不納入
 */
function calcStructure(KI, T, strike, type, stocks) {
  const kiAdj = calcKIAdj(KI);
  const tenorAdj = calcTenorAdj(T);
  const strikeAdj = calcStrikeAdj(strike);
  const typeAdj = calcTypeAdj(type);
  const resonance = calcResonance(stocks);

  const raw =
    kiAdj +
    tenorAdj +
    strikeAdj +
    typeAdj +
    resonance.resonance_adj;

  return {
    ki_adj: Number(kiAdj.toFixed(2)),
    tenor_adj: Number(tenorAdj.toFixed(2)),
    strike_adj: Number(strikeAdj.toFixed(2)),
    type_adj: Number(typeAdj.toFixed(2)),
    resonance_index: resonance.resonance_index,
    resonance_adj: resonance.resonance_adj,
    resonance_breakdown: resonance.resonance_breakdown,
    structure_total: Number(raw.toFixed(2))
  };
}

function pricingView(diff) {
  if (diff >= 2) return "便宜";
  if (diff >= 0.5) return "略便宜";
  if (diff > -0.5) return "合理";
  if (diff > -2) return "偏貴";
  return "明顯偏貴";
}

async function runM8Case({ caseName, symbols, KI, Strike, T, type, marketYield }) {
  if (!Array.isArray(symbols) || symbols.length < 2 || symbols.length > 5) {
    throw new Error(`${caseName}: basket 只支援 2~5 檔`);
  }

  const m7 = await loadM7();
  const stocks = symbols.map(sym => findStock(m7, String(sym).toUpperCase()));
  const scores = stocks.map(getTodayScore);

  const weaknesses = calcWeaknesses(scores);
  const BW = calcBW(weaknesses);

  const basketPremium =
    0.15 * BW +
    0.0008 * BW * BW;

  const tailAdj = calcTailAdj(weaknesses);

  const structure = calcStructure(KI, T, Strike, type, stocks);

  const fairYield =
    6 +
    basketPremium +
    structure.structure_total +
    tailAdj;

  const delta = marketYield - fairYield;

  let note = "";
  if (basketPremium < 7 && delta > 4) {
    note = "Basket 偏低";
  } else if (Math.abs(delta) <= 1) {
    note = "接近";
  }

  return {
    case_name: caseName,
    symbols,
    KI: Number(KI),
    strike: Number(Strike),
    tenor: Number(T),
    type,

    stock_sources: stocks.map(s => ({
      symbol: s["股號"],
      source: s._source || "m7"
    })),

    scores: scores.map(x => Number(x.toFixed(2))),
    weaknesses: weaknesses.map(x => Number(x.toFixed(2))),
    BW: Number(BW.toFixed(2)),
    tail_adj: Number(tailAdj.toFixed(2)),

    market_yield: Number(marketYield.toFixed(2)),
    base: 6,
    basket_premium: Number(basketPremium.toFixed(2)),

    ki_adj: structure.ki_adj,
    tenor_adj: structure.tenor_adj,
    strike_adj: structure.strike_adj,
    type_adj: structure.type_adj,
    resonance_index: structure.resonance_index,
    resonance_adj: structure.resonance_adj,
    resonance_breakdown: structure.resonance_breakdown,

    structure_total: structure.structure_total,
    fair_yield: Number(fairYield.toFixed(2)),
    pricing_delta: Number(delta.toFixed(2)),
    pricing_view: pricingView(delta),
    note
  };
}
