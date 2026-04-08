async function loadM7() {
  const res = await fetch("data/m7/m7_new_stock_today.json");
  if (!res.ok) throw new Error("無法讀取 M7 檔案");
  return await res.json();
}

const FALLBACK_STOCKS = {
  INTC: {
    "股號": "INTC",
    "股名": "Intel",
    "產業": "AI_SEMI",
    "子產業": "CPU",
    "風險等級": "中",
    "today_score": 40,
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

function getTodayScore(stock) { return Number(stock.today_score || 0); }
function getSector(stock) { return String(stock["產業"] || "OTHER"); }
function getSubsector(stock) { return String(stock["子產業"] || "OTHER"); }
function getRiskLevel(stock) { return String(stock["風險等級"] || ""); }

function calcWeaknesses(scores) {
  return scores.map(s => 100 - s).sort((a, b) => b - a);
}

function calcBW(scores) {
  const weaknesses = calcWeaknesses(scores);
  const n = weaknesses.length;
  const avg = weaknesses.reduce((a, b) => a + b, 0) / n;

  if (n === 2) return 0.7 * weaknesses[0] + 0.3 * avg;
  if (n === 3) return 0.6 * weaknesses[0] + 0.4 * avg;
  if (n === 4) return 0.5 * weaknesses[0] + 0.3 * weaknesses[1] + 0.2 * avg;
  if (n === 5) return 0.45 * weaknesses[0] + 0.3 * weaknesses[1] + 0.15 * weaknesses[2] + 0.1 * avg;
  throw new Error("FCN basket 只支援 2~5 檔");
}

function calcKIAdj(KI) {
  return 0.18 * (KI - 65) + 0.006 * Math.pow(KI - 65, 2);
}

function calcTenorAdj(T) {
  const x = 0.18 * (T - 6) + 0.012 * Math.pow(T - 6, 2);
  return Math.min(3, Math.max(-1, x));
}

function calcStrikeAdj(strike) {
  return 0.09 * (strike - 55) + 0.003 * Math.pow(strike - 55, 2);
}

function calcTypeAdj(type) {
  if (type === "DACN") return -0.5;
  if (type === "EKI") return -1;
  return 0;
}

function calcResonanceAdj(stocks) {
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

  return Math.min(1.2, 1.2 * Math.pow(resonanceIndex, 2));
}

function calcStructure(KI, T, strike, type, stocks) {
  const kiAdj = calcKIAdj(KI);
  const tenorAdj = calcTenorAdj(T);
  const strikeAdj = calcStrikeAdj(strike);
  const typeAdj = calcTypeAdj(type);
  const resonanceAdj = calcResonanceAdj(stocks);

  const raw = kiAdj + tenorAdj + strikeAdj + typeAdj + resonanceAdj;
  const capped = Math.min(6, raw);

  return {
    ki_adj: Number(kiAdj.toFixed(2)),
    tenor_adj: Number(tenorAdj.toFixed(2)),
    strike_adj: Number(strikeAdj.toFixed(2)),
    type_adj: Number(typeAdj.toFixed(2)),
    resonance_adj: Number(resonanceAdj.toFixed(2)),
    structure_total: Number(capped.toFixed(2))
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
  if (symbols.length < 2 || symbols.length > 5) {
    throw new Error(`${caseName}: basket 只支援 2~5 檔`);
  }

  const m7 = await loadM7();
  const stocks = symbols.map(sym => findStock(m7, sym.toUpperCase()));
  const scores = stocks.map(getTodayScore);

  const BW = calcBW(scores);
  const basketPremium = 0.15 * BW;
  const structure = calcStructure(KI, T, Strike, type, stocks);

  const fairYield = 6 + basketPremium + structure.structure_total;
  const delta = marketYield - fairYield;

  let note = '';
  if (basketPremium < 7 && marketYield - fairYield > 4) {
    note = 'Basket 偏低';
  } else if (structure.structure_total > 5 && marketYield - fairYield < -2) {
    note = 'Structure 偏重';
  } else if (Math.abs(delta) <= 1) {
    note = '接近';
  }

  return {
    case_name: caseName,
    symbols,
    type,
    market_yield: Number(marketYield.toFixed(2)),
    base: 6,
    basket_premium: Number(basketPremium.toFixed(2)),
    ki_adj: structure.ki_adj,
    tenor_adj: structure.tenor_adj,
    strike_adj: structure.strike_adj,
    type_adj: structure.type_adj,
    resonance_adj: structure.resonance_adj,
    structure_total: structure.structure_total,
    fair_yield: Number(fairYield.toFixed(2)),
    pricing_delta: Number(delta.toFixed(2)),
    pricing_view: pricingView(delta),
    note
  };
}
