(function () {
  "use strict";

  const ROOT = location.pathname.includes("/fcn-dashboard/") ? "/fcn-dashboard/" : "../";
  const PATHS = {
    fcnPool: `${ROOT}data/fcn_pool.json`,
    pool30: `${ROOT}data/pool30.json`,
    universe: `${ROOT}data/m1/universe_150.json`,
    marketRuntime: `${ROOT}data/market_runtime.json`,
    prepost: `${ROOT}data/mm/prepost_runtime.json`,
    m1Scores: `${ROOT}data/m1/m1_scores.json`,
    m7Scores: `${ROOT}data/m7_sandbox/m7_v2_scores.json`
  };

  const EXCLUDED = new Set(["DX-Y.NYB", "TWD=X", "JPY=X", "CL=F", "GC=F", "SPY", "DIA", "0050.TW", "^TWII", "^VIX", "^TNX"]);
  const ALLOWED_ETF_SYMBOLS = new Set(["SMH", "QQQ", "LQD"]);
  const SPECIAL_TARGETS = new Set(["NVDA", "TSM", "SMH", "GOOG"]);
  const CACHE = {};
  const RISK_RANK = { Low: 0, Fair: 1, High: 2, "Very High": 3, Extreme: 4 };
  const SOURCE_RANK = { FCN: 0, Pool30: 1, Universe: 2 };
  const TV_SYMBOL_MAP = {
    NVDA: "NASDAQ:NVDA",
    AMD: "NASDAQ:AMD",
    AAPL: "NASDAQ:AAPL",
    MSFT: "NASDAQ:MSFT",
    META: "NASDAQ:META",
    GOOG: "NASDAQ:GOOG",
    GOOGL: "NASDAQ:GOOGL",
    AMZN: "NASDAQ:AMZN",
    TSLA: "NASDAQ:TSLA",
    AVGO: "NASDAQ:AVGO",
    MRVL: "NASDAQ:MRVL",
    ARM: "NASDAQ:ARM",
    MU: "NASDAQ:MU",
    INTC: "NASDAQ:INTC",
    ORCL: "NYSE:ORCL",
    TSM: "NYSE:TSM",
    SNPS: "NASDAQ:SNPS",
    ASML: "NASDAQ:ASML",
    AMAT: "NASDAQ:AMAT",
    COIN: "NASDAQ:COIN",
    ALAB: "NASDAQ:ALAB",
    CRDO: "NASDAQ:CRDO",
    SMH: ["AMEX:SMH", "NASDAQ:SMH"]
  };
  let ALL_ROWS = [];
  let TV_WATCHLIST = [];
  let SELECTED_SYMBOL = "NVDA";
  let ALL_STOCKS_OPEN = false;

  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
  }

  function normalizeSymbol(v) {
    return String(v || "").trim().toUpperCase();
  }

  function isDebugEnabled() {
    try {
      return window.C2_RADAR_DEBUG === true || new URLSearchParams(location.search).has("c2debug");
    } catch (err) {
      return window.C2_RADAR_DEBUG === true;
    }
  }

  function debugLog(...args) {
    if (isDebugEnabled()) console.log(...args);
  }

  function tradingViewSymbol(symbol) {
    const mapped = TV_SYMBOL_MAP[symbol];
    return Array.isArray(mapped) ? mapped[0] : mapped;
  }

  function isTradableStockSymbol(symbol, row = {}) {
    const sym = normalizeSymbol(symbol);
    if (!sym) return false;
    if (EXCLUDED.has(sym)) return false;
    if (sym.startsWith("^") && !ALLOWED_ETF_SYMBOLS.has(sym)) return false;
    if (row.runtime_category && row.runtime_category !== "stock" && !ALLOWED_ETF_SYMBOLS.has(sym)) return false;
    return /^[A-Z][A-Z0-9.\-]{0,9}$/.test(sym);
  }

  function asArray(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.rows)) return raw.rows;
    if (Array.isArray(raw.data)) return raw.data;
    if (Array.isArray(raw.stocks)) return raw.stocks;
    if (raw.rows && typeof raw.rows === "object") return Object.entries(raw.rows).map(([symbol, row]) => ({ symbol, ...row }));
    if (raw.data && typeof raw.data === "object") return Object.entries(raw.data).map(([symbol, row]) => ({ symbol, ...row }));
    if (typeof raw === "object") return Object.entries(raw).map(([symbol, row]) => ({ symbol, ...(row && typeof row === "object" ? row : { value: row }) }));
    return [];
  }

  function collectSymbols(raw, out = new Set(), depth = 0) {
    if (!raw || depth > 6) return out;
    if (typeof raw === "string") {
      const sym = normalizeSymbol(raw);
      if (isTradableStockSymbol(sym)) out.add(sym);
      return out;
    }
    if (Array.isArray(raw)) {
      raw.forEach(item => collectSymbols(item, out, depth + 1));
      return out;
    }
    if (typeof raw !== "object") return out;
    ["symbol", "ticker", "underlying"].forEach(key => {
      const sym = normalizeSymbol(raw[key]);
      if (isTradableStockSymbol(sym, raw)) out.add(sym);
    });
    ["basket", "underlyings", "symbols", "stocks"].forEach(key => collectSymbols(raw[key], out, depth + 1));
    return out;
  }

  function bySymbol(raw) {
    const map = new Map();
    asArray(raw).forEach(row => {
      const sym = normalizeSymbol(row.symbol || row.ticker || row.underlying);
      if (sym) map.set(sym, row);
    });
    return map;
  }

  async function fetchJson(path) {
    if (CACHE[path]) return CACHE[path];
    try {
      const res = await fetch(path, { cache: "no-store" });
      CACHE[path] = res.ok ? await res.json() : null;
    } catch (err) {
      console.warn("[C2RadarV2] JSON load failed", path, err);
      CACHE[path] = null;
    }
    return CACHE[path];
  }

  function safeNum(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function num(v, digits = 2) {
    const n = safeNum(v);
    if (n === null) return "--";
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  }

  function pct(v) {
    const n = safeNum(v);
    if (n === null) return "--";
    return `${n.toFixed(2)}%`;
  }

  function firstNum(...values) {
    for (const value of values) {
      const n = safeNum(value);
      if (n !== null) return n;
    }
    return null;
  }

  function firstPositiveNum(...values) {
    for (const value of values) {
      const n = safeNum(value);
      if (n !== null && n > 0) return n;
    }
    return null;
  }

  function pctValue(value) {
    const n = safeNum(value);
    if (n === null) return null;
    return Math.abs(n) <= 1 ? n * 100 : n;
  }

  function getAmount(deal) {
    return firstPositiveNum(deal.amount, deal.notional, deal.principal, deal.investment_amount, deal.face_value, deal.amt) || 0;
  }

  function buildInvestedMap(fcnPool) {
    const invested = new Map();
    asArray(fcnPool).forEach(deal => {
      const status = String(deal.status || "").toLowerCase();
      if (deal.has_position === false || ["closed", "matured", "expired", "redeemed"].includes(status)) return;
      const amount = getAmount(deal);
      collectSymbols(deal).forEach(sym => invested.set(sym, (invested.get(sym) || 0) + amount));
    });
    return invested;
  }

  function rowProfile(symbol, pool30Map, universeMap) {
    return pool30Map.get(symbol) || universeMap.get(symbol) || {};
  }

  function rowCategory(symbol, pool30Map, universeMap) {
    const row = rowProfile(symbol, pool30Map, universeMap);
    return String(row.category || row.category_main || "").toLowerCase();
  }

  function targetAmount(symbol, category) {
    if (SPECIAL_TARGETS.has(symbol)) return 700000;
    if (category === "core") return 500000;
    if (category === "growth") return 300000;
    if (category === "defensive") return 300000;
    if (category === "income") return 200000;
    if (category === "speculative") return 30000;
    return 300000;
  }

  function sourceLabel(symbol, fcnSymbols, pool30Symbols) {
    if (fcnSymbols.has(symbol)) return "FCN";
    if (pool30Symbols.has(symbol)) return "Pool30";
    return "Universe";
  }

  function pickScore(row, ...keys) {
    for (const key of keys) {
      const n = safeNum(row?.[key]);
      if (n !== null) return n;
    }
    return null;
  }

  function pickMetric(...sources) {
    for (const [row, keys] of sources) {
      for (const key of keys) {
        const n = safeNum(row?.[key]);
        if (n !== null) return n;
      }
    }
    return null;
  }

  function tierScore(value, tiers) {
    const n = safeNum(value);
    if (n === null) return null;
    let score = 0;
    tiers.forEach(([threshold, points]) => {
      if (n > threshold) score = points;
    });
    return score;
  }

  function priceHighRatio(price, ...highs) {
    const p = safeNum(price);
    if (p === null || p <= 0) return null;
    const high = firstPositiveNum(...highs);
    if (high === null || high <= 0) return null;
    return p / high;
  }

  function riskLabel(score, hasData) {
    if (!hasData) return "No Data";
    if (score <= 20) return "Low";
    if (score <= 40) return "Fair";
    if (score <= 60) return "High";
    if (score <= 80) return "Very High";
    return "Extreme";
  }

  function riskRank(risk) {
    return Object.prototype.hasOwnProperty.call(RISK_RANK, risk) ? RISK_RANK[risk] : null;
  }

  function isRiskAtLeast(risk, minRisk) {
    const rank = riskRank(risk);
    return rank !== null && rank >= RISK_RANK[minRisk];
  }

  function isRiskAtMost(risk, maxRisk) {
    const rank = riskRank(risk);
    return rank !== null && rank <= RISK_RANK[maxRisk];
  }

  function buildPool30Watchlist(pool30, m1Map, investedMap) {
    const rawRows = asArray(pool30);
    if (!rawRows.length) return [];
    const hasNativeOrder = Array.isArray(pool30) || Array.isArray(pool30?.rows) || Array.isArray(pool30?.data) || Array.isArray(pool30?.stocks);
    const seen = new Set();
    const rows = rawRows.map((row, index) => {
      const symbol = normalizeSymbol(row.symbol || row.ticker || row.underlying);
      return {
        symbol,
        index,
        invested: investedMap.get(symbol) || 0,
        m1: pickScore(m1Map.get(symbol) || {}, "M1_score", "m1_score", "score")
      };
    }).filter(row => row.symbol && TV_SYMBOL_MAP[row.symbol] && !seen.has(row.symbol) && seen.add(row.symbol));

    rows.sort((a, b) => {
      const aPriority = a.symbol === "SMH" && a.invested >= 100000 ? 0 : 1;
      const bPriority = b.symbol === "SMH" && b.invested >= 100000 ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      if (hasNativeOrder) return a.index - b.index;
      return (safeNum(b.m1) ?? -Infinity) - (safeNum(a.m1) ?? -Infinity) || a.symbol.localeCompare(b.symbol);
    });
    return rows.slice(0, 20).map(row => ({ symbol: row.symbol, tv: tradingViewSymbol(row.symbol) }));
  }

  function renderTradingViewWatchlist() {
    const el = document.getElementById("c2-tv-widget");
    if (!el) return;
    el.innerHTML = "";
    if (!TV_WATCHLIST.length) {
      el.innerHTML = "<div class='c2-tv-empty'>Pool30 watchlist not available.</div>";
      return;
    }

    const container = document.createElement("div");
    container.className = "tradingview-widget-container__widget";
    el.appendChild(container);
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js";
    script.textContent = JSON.stringify({
      colorTheme: "light",
      dateRange: "1D",
      showChart: true,
      locale: "en",
      width: "100%",
      height: 360,
      largeChartUrl: "",
      isTransparent: false,
      showSymbolLogo: true,
      showFloatingTooltip: true,
      tabs: [{
        title: "Pool30",
        symbols: TV_WATCHLIST.map(item => ({ s: item.tv, d: item.symbol }))
      }]
    });
    script.onerror = () => {
      el.innerHTML = "<div class='c2-tv-empty'>TradingView watchlist not available.</div>";
    };
    el.appendChild(script);
  }

  function buildValuationRisk(runtime, m1, m7, price, oneMonth) {
    let score = 0;
    let hasData = false;
    const reasons = [];
    const forwardPe = pickMetric([runtime, ["forward_pe", "forwardPE", "forwardPe"]], [m1, ["forward_pe", "forwardPE"]], [m7, ["forward_pe", "forwardPE"]]);
    const trailingPe = pickMetric([runtime, ["trailing_pe", "trailingPE", "pe_ratio", "trailingPe"]], [m1, ["trailing_pe", "pe_ratio", "trailingPE"]], [m7, ["trailing_pe", "pe_ratio", "trailingPE"]]);
    const ps = pickMetric([runtime, ["price_to_sales", "priceToSalesTrailing12Months", "ps_ratio"]], [m1, ["price_to_sales", "ps_ratio"]], [m7, ["price_to_sales", "ps_ratio"]]);
    const priceNow = firstPositiveNum(price, runtime.price_now, runtime.price, runtime.last_price, runtime.close, runtime.current_price, runtime.regularMarketPrice);
    const nearHigh = priceHighRatio(priceNow, runtime.price_ref_12m, runtime.price_ref_52w_high, runtime.high_52w, runtime.fiftyTwoWeekHigh, runtime.year_high);
    const ret1m = pctValue(firstNum(runtime.ret_1m, runtime.change_1m_pct, oneMonth));
    const ret3m = pctValue(firstNum(runtime.ret_3m, runtime.change_3m_pct));
    const ret6m = pctValue(firstNum(runtime.ret_6m, runtime.change_6m_pct));
    const m7Valuation = pickScore(m7, "valuation_score", "m7_valuation_score", "valuation", "valuationScore");

    const peForwardScore = tierScore(forwardPe, [[35, 15], [50, 25], [70, 35]]);
    if (peForwardScore !== null) {
      hasData = true;
      score += peForwardScore;
      if (peForwardScore) reasons.push(`Forward PE ${num(forwardPe, 1)}`);
    }

    const peTrailingScore = tierScore(trailingPe, [[50, 15], [80, 25], [100, 35]]);
    if (peTrailingScore !== null) {
      hasData = true;
      score += peTrailingScore;
      if (peTrailingScore) reasons.push(`Trailing PE ${num(trailingPe, 1)}`);
    }

    const psScore = tierScore(ps, [[12, 15], [20, 25]]);
    if (psScore !== null) {
      hasData = true;
      score += psScore;
      if (psScore) reasons.push(`P/S ${num(ps, 1)}`);
    }

    if (nearHigh !== null) {
      hasData = true;
      if (nearHigh > 0.95) {
        score += 20;
        reasons.push("Near 52W/12M high >95%");
      } else if (nearHigh > 0.90) {
        score += 15;
        reasons.push("Near 52W/12M high >90%");
      }
    }

    if (ret1m !== null) {
      hasData = true;
      if (ret1m > 15) {
        score += 10;
        reasons.push(`1M +${num(ret1m, 1)}%`);
      }
    }
    if (ret3m !== null) {
      hasData = true;
      if (ret3m > 30) {
        score += 15;
        reasons.push(`3M +${num(ret3m, 1)}%`);
      }
    }
    if (ret6m !== null) {
      hasData = true;
      if (ret6m > 60) {
        score += 20;
        reasons.push(`6M +${num(ret6m, 1)}%`);
      }
    }

    if (m7Valuation !== null) {
      hasData = true;
      if (m7Valuation < 4) {
        score += 25;
        reasons.push(`M7 valuation ${num(m7Valuation, 1)}`);
      } else if (m7Valuation < 5) {
        score += 15;
        reasons.push(`M7 valuation ${num(m7Valuation, 1)}`);
      }
    }

    const capped = Math.min(100, score);
    return {
      score: hasData ? capped : null,
      label: riskLabel(capped, hasData),
      reasons
    };
  }

  function buildFcnView(row) {
    if (row.available <= 0 && row.invested > row.target) return "Over";
    if (row.available <= 0) return "No Room";
    if (isRiskAtLeast(row.valuationRisk.label, "Very High") && safeNum(row.deltaPct) !== null && row.deltaPct > 0) return "Avoid Chase";
    if (isRiskAtLeast(row.valuationRisk.label, "High") && safeNum(row.m1) !== null && row.m1 >= 8 && safeNum(row.oneWeek) !== null && row.oneWeek < 0) return "Wait Pullback";
    if (safeNum(row.m1) !== null && row.m1 >= 7 && safeNum(row.m7) !== null && row.m7 >= 7 && row.available > 0 && isRiskAtMost(row.valuationRisk.label, "Fair")) return "OK";
    return "Watch";
  }

  function buildQuote(pp, runtime) {
    const regularPrice = firstPositiveNum(runtime.price_now, runtime.price, runtime.last_price, runtime.close, runtime.current_price);
    const prepostPrice = firstPositiveNum(pp.price_active, pp.price_pre, pp.price_post);
    const activePrice = prepostPrice !== null ? prepostPrice : regularPrice;
    const hasPrepost = prepostPrice !== null;
    let delta = null;
    let deltaPct = null;

    if (hasPrepost && activePrice !== null && regularPrice !== null && activePrice !== regularPrice) {
      delta = activePrice - regularPrice;
      deltaPct = (activePrice / regularPrice - 1) * 100;
    } else {
      delta = firstNum(runtime.change, runtime.change_1d, runtime.delta_1d);
      deltaPct = pctValue(firstNum(runtime.ret_1d, runtime.delta_pct, runtime.change_pct, runtime.change_1d_pct));
    }

    return {
      price: activePrice,
      regularPrice,
      prepost: prepostPrice,
      delta,
      deltaPct,
      session: pp.session || (hasPrepost ? "prepost" : "regular")
    };
  }

  async function buildRows() {
    const [fcnPool, pool30, universe, marketRuntime, prepost, m1Scores, m7Scores] = await Promise.all(Object.values(PATHS).map(fetchJson));
    const fcnSymbols = collectSymbols(fcnPool);
    const pool30Symbols = collectSymbols(pool30);
    const universeSymbols = collectSymbols(universe);
    const runtimeMap = bySymbol(marketRuntime);
    const pool30Map = bySymbol(pool30);
    const universeMap = bySymbol(universe);
    const prepostMap = bySymbol(prepost);
    const m1Map = bySymbol(m1Scores);
    const m7Map = bySymbol(m7Scores);
    const investedMap = buildInvestedMap(fcnPool);
    TV_WATCHLIST = buildPool30Watchlist(pool30, m1Map, investedMap);
    const ordered = [...new Set([...fcnSymbols, ...pool30Symbols, ...universeSymbols])].filter(sym => isTradableStockSymbol(sym, runtimeMap.get(sym) || {}));
    debugLog("[C2Radar] pool30 symbols count", pool30Symbols.size);
    debugLog("[C2Radar] has SMH in pool30", pool30Symbols.has("SMH"));

    const rows = ordered.map(symbol => {
      const runtime = runtimeMap.get(symbol) || {};
      const pp = prepostMap.get(symbol) || {};
      const quote = buildQuote(pp, runtime);
      const profile = rowProfile(symbol, pool30Map, universeMap);
      const category = rowCategory(symbol, pool30Map, universeMap);
      const invested = investedMap.get(symbol) || 0;
      const target = targetAmount(symbol, category);
      const available = target - invested;
      const m1 = m1Map.get(symbol) || {};
      const m7 = m7Map.get(symbol) || {};
      const oneWeek = firstNum(runtime.ret_1w, runtime.change_1w_pct);
      const oneMonth = firstNum(runtime.ret_1m, runtime.change_1m_pct);
      const source = sourceLabel(symbol, fcnSymbols, pool30Symbols);
      const name = String(profile.name || profile.company_name || runtime.name || runtime.longName || runtime.shortName || "");
      const sector = String(profile.sector || runtime.sector || "");
      const subsector = String(profile.subsector || profile.industry || runtime.industry || "");
      const baseRow = {
        symbol,
        source,
        sourcePriority: SOURCE_RANK[source] ?? 9,
        name,
        sector,
        subsector,
        category,
        searchText: `${symbol} ${name} ${sector} ${subsector} ${category}`.toLowerCase(),
        price: quote.price,
        regularPrice: quote.regularPrice,
        delta: quote.delta,
        deltaPct: quote.deltaPct,
        oneWeek,
        oneMonth,
        prepost: quote.prepost,
        session: quote.session,
        invested,
        target,
        available,
        m1: pickScore(m1, "M1_score", "m1_score", "score"),
        m7: pickScore(m7, "m7_v2_score", "M7_score", "m7_score", "score")
      };
      baseRow.valuationRisk = buildValuationRisk(runtime, m1, m7, quote.price, oneMonth);
      baseRow.goodButExpensive = safeNum(baseRow.m1) !== null && baseRow.m1 >= 8 && isRiskAtLeast(baseRow.valuationRisk.label, "Very High");
      baseRow.fcnView = buildFcnView(baseRow);
      return baseRow;
    });
    debugLog("[C2Radar] has SMH in rows", rows.some(row => row.symbol === "SMH"));
    return rows;
  }

  function moveClass(value) {
    const n = safeNum(value);
    if (n === null || n === 0) return "c2-flat";
    return n > 0 ? "c2-up" : "c2-down";
  }

  function riskClass(risk) {
    if (risk === "Extreme" || risk === "Very High") return "c2-risk-high";
    if (risk === "High") return "c2-risk-warn";
    if (risk === "Low" || risk === "Fair") return "c2-risk-ok";
    return "c2-risk-nodata";
  }

  function passThreshold(value, threshold) {
    const n = safeNum(value);
    return n !== null && n >= threshold;
  }

  function filterByValuation(row, valuation) {
    const risk = row.valuationRisk?.label;
    if (valuation === "all") return true;
    if (valuation === "low_fair") return isRiskAtMost(risk, "Fair");
    if (valuation === "high") return risk === "High";
    if (valuation === "very_high") return risk === "Very High";
    if (valuation === "extreme") return risk === "Extreme";
    if (valuation === "good_expensive") return row.goodButExpensive;
    if (valuation === "avoid_chase") return row.fcnView === "Avoid Chase";
    return true;
  }

  function filterByInvested(row, filter) {
    if (filter === "all") return true;
    if (filter === "none") return row.invested <= 0;
    if (filter === "gt0") return row.invested > 0;
    if (filter === "gte100") return row.invested >= 100000;
    if (filter === "gte300") return row.invested >= 300000;
    if (filter === "gte500") return row.invested >= 500000;
    if (filter === "gte700") return row.invested >= 700000;
    return true;
  }

  function filterByAvailable(row, filter) {
    if (filter === "all") return true;
    if (filter === "gt0") return row.available > 0;
    if (filter === "gte100") return row.available >= 100000;
    if (filter === "gte300") return row.available >= 300000;
    if (filter === "full") return row.available <= 0 && row.invested <= row.target;
    if (filter === "over") return row.invested > row.target;
    return true;
  }

  function filterByMove(row, filter) {
    const d = safeNum(row.deltaPct);
    if (filter === "all") return true;
    if (filter === "today_up") return d !== null && d > 0;
    if (filter === "today_down") return d !== null && d < 0;
    if (filter === "move2") return d !== null && Math.abs(d) > 2;
    if (filter === "move5") return d !== null && Math.abs(d) > 5;
    if (filter === "prepost_up") return row.prepost !== null && d !== null && d > 0;
    if (filter === "prepost_down") return row.prepost !== null && d !== null && d < 0;
    if (filter === "prepost_move2") return row.prepost !== null && d !== null && Math.abs(d) > 2;
    if (filter === "prepost_move5") return row.prepost !== null && d !== null && Math.abs(d) > 5;
    return true;
  }

  function filterByMomentum(row, filter) {
    const w = safeNum(row.oneWeek);
    const m = safeNum(row.oneMonth);
    if (filter === "all") return true;
    if (filter === "w_up") return w !== null && w > 0;
    if (filter === "w_down") return w !== null && w < 0;
    if (filter === "m_up") return m !== null && m > 0;
    if (filter === "m_down") return m !== null && m < 0;
    if (filter === "w_down_m_up") return w !== null && w < 0 && m !== null && m > 0;
    if (filter === "m_gt10") return m !== null && m > 10;
    if (filter === "m_gt20") return m !== null && m > 20;
    return true;
  }

  function filterByScore(row, filter) {
    if (filter === "all") return true;
    if (filter === "m1_8") return passThreshold(row.m1, 8);
    if (filter === "m1_7") return passThreshold(row.m1, 7);
    if (filter === "m7_8") return passThreshold(row.m7, 8);
    if (filter === "m7_7") return passThreshold(row.m7, 7);
    if (filter === "m1_8_m7_7") return passThreshold(row.m1, 8) && passThreshold(row.m7, 7);
    return true;
  }

  function filterRows(rows) {
    const query = String(document.getElementById("c2-radar-search")?.value || "").trim().toLowerCase();
    const source = document.getElementById("c2-radar-source")?.value || "all";
    const session = document.getElementById("c2-radar-session")?.value || "all";
    const valuation = document.getElementById("c2-radar-valuation")?.value || "all";
    const invested = document.getElementById("c2-radar-invested")?.value || "all";
    const available = document.getElementById("c2-radar-available")?.value || "all";
    const move = document.getElementById("c2-radar-move")?.value || "all";
    const momentum = document.getElementById("c2-radar-momentum")?.value || "all";
    const scorePreset = document.getElementById("c2-radar-score")?.value || "all";
    const minM1 = safeNum(document.getElementById("c2-radar-m1min")?.value);
    const minM7 = safeNum(document.getElementById("c2-radar-m7min")?.value);

    const filtered = rows.filter(row => {
      if (query && !(row.searchText || row.symbol.toLowerCase()).includes(query)) return false;
      if (source !== "all" && row.source !== source) return false;
      if (session !== "all" && row.session !== session) return false;
      if (minM1 !== null && (row.m1 === null || row.m1 < minM1)) return false;
      if (minM7 !== null && (row.m7 === null || row.m7 < minM7)) return false;
      if (!filterByValuation(row, valuation)) return false;
      if (!filterByInvested(row, invested)) return false;
      if (!filterByAvailable(row, available)) return false;
      if (!filterByMove(row, move)) return false;
      if (!filterByMomentum(row, momentum)) return false;
      if (!filterByScore(row, scorePreset)) return false;
      return true;
    });
    if (query) debugLog("[C2Radar] filtered count after search", filtered.length);
    return filtered;
  }

  function sortValue(row, sortBy) {
    if (sortBy === "source") return row.sourcePriority;
    if (sortBy === "invested") return safeNum(row.invested);
    if (sortBy === "available") return safeNum(row.available);
    if (sortBy === "price") return safeNum(row.price);
    if (sortBy === "m1") return safeNum(row.m1);
    if (sortBy === "m7") return safeNum(row.m7);
    if (sortBy === "delta_pct") return safeNum(row.deltaPct);
    if (sortBy === "one_week") return safeNum(row.oneWeek);
    if (sortBy === "one_month") return safeNum(row.oneMonth);
    if (sortBy === "valuation") return safeNum(row.valuationRisk?.score);
    return null;
  }

  function compareNullable(a, b, direction) {
    const av = safeNum(a);
    const bv = safeNum(b);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return direction === "asc" ? av - bv : bv - av;
  }

  function sortRows(rows) {
    const sortBy = document.getElementById("c2-radar-sort")?.value || "source";
    const direction = document.getElementById("c2-radar-direction")?.value || "desc";
    return [...rows].sort((a, b) => {
      if (sortBy === "source") {
        const sourceDiff = a.sourcePriority - b.sourcePriority;
        if (sourceDiff !== 0) return sourceDiff;
        const investedDiff = compareNullable(a.invested, b.invested, "desc");
        if (investedDiff !== 0) return investedDiff;
        return a.symbol.localeCompare(b.symbol);
      }
      const primary = compareNullable(sortValue(a, sortBy), sortValue(b, sortBy), direction);
      if (primary !== 0) return primary;
      const sourceDiff = a.sourcePriority - b.sourcePriority;
      if (sourceDiff !== 0) return sourceDiff;
      return a.symbol.localeCompare(b.symbol);
    });
  }

  function valuationCell(row) {
    const risk = row.valuationRisk || { label: "No Data", score: null, reasons: [] };
    const score = risk.score === null ? "--" : num(risk.score, 0);
    const note = row.goodButExpensive ? "<div class='c2-risk-note'>好公司，但價格偏高</div>" : "";
    const title = esc((risk.reasons || []).join("; ") || "No valuation inputs available");
    return `<span class="c2-risk ${riskClass(risk.label)}" title="${title}">${esc(risk.label)} ${score}</span>${note}`;
  }

  function chartSymbol(symbol) {
    const sym = normalizeSymbol(symbol || "NVDA");
    const mapped = tradingViewSymbol(sym);
    if (mapped) return mapped;
    if (sym.endsWith(".TW")) return `TWSE:${sym.replace(".TW", "")}`;
    return `NASDAQ:${sym}`;
  }

  function tradingViewChartUrl(symbol) {
    return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(chartSymbol(symbol))}`;
  }

  function tradingViewWidgetUrl(symbol) {
    const tvSymbol = chartSymbol(symbol);
    return "https://s.tradingview.com/widgetembed/?" + [
      "hideideas=1",
      "overrides=%7B%7D",
      "enabled_features=%5B%5D",
      "disabled_features=%5B%5D",
      "locale=zh_TW",
      "utm_source=daichungwang-wq.github.io",
      "utm_medium=widget",
      "utm_campaign=chart",
      "utm_term=" + encodeURIComponent(tvSymbol),
      "symbol=" + encodeURIComponent(tvSymbol),
      "interval=D",
      "range=12M",
      "hidesidetoolbar=1",
      "symboledit=0",
      "saveimage=0",
      "toolbarbg=f1f3f6",
      "studies=%5B%5D",
      "theme=light",
      "style=1",
      "timezone=Asia%2FTaipei",
      "withdateranges=1",
      "hidevolume=0",
      "allow_symbol_change=0",
      "details=0",
      "calendar=0",
      "hotlist=0"
    ].join("&");
  }

  function renderTradingViewWidget(symbol) {
    const container = document.getElementById("c2-tv-widget");
    if (!container) return;
    const selectedTvSymbol = chartSymbol(symbol);
    container.innerHTML = "";

    const frame = document.createElement("iframe");
    frame.title = `${selectedTvSymbol} price chart`;
    frame.src = tradingViewWidgetUrl(symbol);
    frame.loading = "lazy";
    frame.referrerPolicy = "origin";
    frame.className = "c2-tv-frame";
    frame.onerror = () => {
      container.innerHTML = "<div class='c2-tv-blocked'>TradingView widget was blocked. Use the link above to open the selected symbol.</div>";
    };
    container.appendChild(frame);

    const label = document.createElement("div");
    label.className = "c2-tv-side-label";
    label.innerHTML = "TradingView 外部資訊<br>非 MM / FCN 判斷資料";
    container.appendChild(label);
  }

  function selectedRow() {
    return ALL_ROWS.find(row => row.symbol === SELECTED_SYMBOL) || null;
  }

  function updateSelectedNews(row) {
    const el = document.getElementById("c2-selected-news");
    if (!el) return;
    const symbol = SELECTED_SYMBOL;
    const tv = chartSymbol(symbol);
    el.innerHTML = `
      <div class="c2-info-head">
        <b>Selected Stock News / 該股 News</b>
        <span>${esc(symbol)}</span>
      </div>
      <div class="c2-news-links">
        <a href="https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/news" target="_blank" rel="noopener">Yahoo Finance News</a>
        <a href="https://www.tradingview.com/symbols/${encodeURIComponent(tv.replace(":", "-"))}/news/" target="_blank" rel="noopener">TradingView News</a>
        <a href="https://www.google.com/search?q=${encodeURIComponent(symbol + " stock news")}" target="_blank" rel="noopener">Google News Search</a>
      </div>
      <div class="c2-info-note">External news references only; FCN decisions remain based on the left MM cards.</div>
    `;
  }

  function updateTodaySummary(row) {
    const el = document.getElementById("c2-today-summary");
    if (!el) return;
    if (!row) {
      el.innerHTML = "<div class='c2-info-empty'>Today summary is not available.</div>";
      return;
    }
    el.innerHTML = `
      <div class="c2-info-head">
        <b>Today Summary / 今日摘要</b>
        <span>${esc(row.symbol)}</span>
      </div>
      <div class="c2-summary-list">
        <div><span>Price</span><b>${num(row.price)}</b></div>
        <div><span>Delta</span><b class="${moveClass(row.deltaPct)}">${num(row.delta)} / ${pct(row.deltaPct)}</b></div>
        <div><span>1W / 1M</span><b>${pct(row.oneWeek)} / ${pct(row.oneMonth)}</b></div>
        <div><span>M1 / M7</span><b>${num(row.m1, 1)} / ${num(row.m7, 1)}</b></div>
        <div><span>FCN View</span><b>${esc(row.fcnView)}</b></div>
      </div>
    `;
  }

  function updateSelectedFcnInfo(row) {
    const el = document.getElementById("c2-selected-fcn-info");
    if (!el) return;
    if (!row) {
      el.innerHTML = "<div class='c2-info-empty'>Selected stock FCN info is not available.</div>";
      return;
    }
    el.innerHTML = `
      <div class="c2-info-head">
        <b>Selected Stock FCN Info / 該股 FCN 訊息與曝險</b>
        <span>${esc(row.symbol)}</span>
      </div>
      <div class="c2-fcn-grid">
        <div><span>Source</span><b>${esc(row.source)}</b></div>
        <div><span>FCN View</span><b>${esc(row.fcnView)}</b></div>
        <div><span>Invested</span><b>${num(row.invested, 0)}</b></div>
        <div><span>Target</span><b>${num(row.target, 0)}</b></div>
        <div><span>Available</span><b>${row.available < 0 ? `Over ${num(Math.abs(row.available), 0)}` : num(row.available, 0)}</b></div>
        <div><span>M1 / M7</span><b>${num(row.m1, 1)} / ${num(row.m7, 1)}</b></div>
        <div><span>Price</span><b>${num(row.price)}</b></div>
        <div><span>Today</span><b class="${moveClass(row.deltaPct)}">${pct(row.deltaPct)}</b></div>
      </div>
    `;
  }

  function updateSelectedRightBlocks() {
    const row = selectedRow();
    updateTodaySummary(row);
    updateSelectedNews(row);
    updateSelectedFcnInfo(row);
  }

  function setSelectedSymbol(symbol) {
    SELECTED_SYMBOL = normalizeSymbol(symbol || "NVDA") || "NVDA";
    window.MM_SELECTED_SYMBOL = SELECTED_SYMBOL;
    const url = tradingViewChartUrl(SELECTED_SYMBOL);
    const link = document.getElementById("c2-tv-link");
    const label = document.getElementById("c2-tv-selected");
    if (link) link.href = url;
    if (label) label.textContent = chartSymbol(SELECTED_SYMBOL);
    renderTradingViewWidget(SELECTED_SYMBOL);
    updateSelectedRightBlocks();
    document.querySelectorAll(".c2-pool-card").forEach(card => {
      card.classList.toggle("selected", card.dataset.symbol === SELECTED_SYMBOL);
    });
  }

  function marketWatchRows(rows) {
    const preferred = ["NVDA", "TSM", "MRVL", "AVGO", "AMD", "AAPL", "MSFT", "AMZN", "GOOG", "META", "TSLA", "SMH"];
    const bySymbolMap = new Map(rows.map(row => [row.symbol, row]));
    const picked = new Set();
    const ordered = [];
    preferred.forEach(symbol => {
      const row = bySymbolMap.get(symbol);
      if (row) {
        ordered.push(row);
        picked.add(symbol);
      }
    });
    const ranked = rows
      .filter(row => !picked.has(row.symbol))
      .sort((a, b) => a.sourcePriority - b.sourcePriority || (safeNum(b.invested) || 0) - (safeNum(a.invested) || 0) || (safeNum(b.m1) || 0) - (safeNum(a.m1) || 0) || a.symbol.localeCompare(b.symbol));
    return [...ordered, ...ranked].slice(0, 24);
  }

  function renderPoolCard(row) {
    return `<button class="c2-pool-card ${row.symbol === SELECTED_SYMBOL ? "selected" : ""}" type="button" data-symbol="${esc(row.symbol)}">
      <div class="c2-card-top"><b>${esc(row.symbol)}</b><strong>${num(row.price)}</strong></div>
      <div class="c2-card-delta ${moveClass(row.deltaPct)}"><span>${num(row.delta)}</span><span>${pct(row.deltaPct)}</span></div>
      <div class="c2-card-line"><span>1W ${pct(row.oneWeek)}</span><span>1M ${pct(row.oneMonth)}</span></div>
      <div class="c2-card-line"><span>M1 ${num(row.m1, 1)}</span><span>M7 ${num(row.m7, 1)}</span><em>${esc(row.fcnView)}</em></div>
    </button>`;
  }

  function bindMarketWatch() {
    document.querySelectorAll(".c2-pool-card").forEach(card => {
      card.addEventListener("click", () => setSelectedSymbol(card.dataset.symbol));
    });
    document.getElementById("c2-all-stocks-toggle")?.addEventListener("click", () => {
      ALL_STOCKS_OPEN = !ALL_STOCKS_OPEN;
      const panel = document.getElementById("c2-all-stocks-panel");
      const button = document.getElementById("c2-all-stocks-toggle");
      if (panel) panel.hidden = !ALL_STOCKS_OPEN;
      if (button) {
        button.setAttribute("aria-expanded", String(ALL_STOCKS_OPEN));
        button.textContent = ALL_STOCKS_OPEN ? "收合全股票區" : "展開全股票區";
      }
    });
  }

  function renderRows() {
    const body = document.getElementById("c2-radar-body");
    const count = document.getElementById("c2-radar-count");
    if (!body) return;
    const rows = sortRows(filterRows(ALL_ROWS));
    if (count) count.textContent = `${rows.length} / ${ALL_ROWS.length}`;
    body.innerHTML = rows.map(row => `<tr>
      <td><a href="../m1_new_stock.html?symbol=${encodeURIComponent(row.symbol)}">研究</a></td>
      <td class="c2-symbol">${esc(row.symbol)}</td>
      <td>${esc(row.source)}</td>
      <td>${num(row.price)}</td>
      <td class="${moveClass(row.delta)}">${num(row.delta)}</td>
      <td class="${moveClass(row.deltaPct)}">${pct(row.deltaPct)}</td>
      <td class="${moveClass(row.oneWeek)}">${pct(row.oneWeek)}</td>
      <td class="${moveClass(row.oneMonth)}">${pct(row.oneMonth)}</td>
      <td class="${moveClass(row.deltaPct)}">${num(row.prepost)}</td>
      <td>${esc(row.session)}</td>
      <td>${num(row.invested, 0)}</td>
      <td>${num(row.target, 0)}</td>
      <td>${row.available < 0 ? `Over ${num(Math.abs(row.available), 0)}` : num(row.available, 0)}</td>
      <td>${num(row.m1)}</td>
      <td>${num(row.m7)}</td>
      <td>${valuationCell(row)}</td>
      <td>${esc(row.fcnView)}</td>
    </tr>`).join("");
  }

  function renderTable(el, rows) {
    ALL_ROWS = rows;
    if (!rows.some(row => row.symbol === SELECTED_SYMBOL)) SELECTED_SYMBOL = rows[0]?.symbol || "NVDA";
    const watchRows = marketWatchRows(rows);
    const selected = watchRows.find(row => row.symbol === SELECTED_SYMBOL) || watchRows[0] || rows[0];
    SELECTED_SYMBOL = selected?.symbol || "NVDA";
    window.MM_SELECTED_SYMBOL = SELECTED_SYMBOL;
    el.innerHTML = `
      <style>
        .c2-market-watch{display:grid;grid-template-columns:minmax(260px,320px) minmax(460px,1fr) minmax(300px,360px);gap:14px;align-items:start}
        .c2-pool-list{display:grid;gap:8px;max-height:620px;overflow:auto;padding-right:2px}
        .c2-pool-card{width:100%;text-align:left;border:1px solid #e5e7eb;background:#fff;border-radius:10px;padding:10px;cursor:pointer;color:#111827}
        .c2-pool-card:hover{border-color:#93c5fd;background:#f8fbff}
        .c2-pool-card.selected{border-color:#2563eb;background:#eff6ff;box-shadow:0 0 0 2px rgba(37,99,235,.12)}
        .c2-card-top,.c2-card-delta,.c2-card-line{display:flex;align-items:center;justify-content:space-between;gap:10px}
        .c2-card-top b,.c2-card-top strong{font-size:15px;font-weight:950}
        .c2-card-delta{margin-top:6px;font-weight:900}
        .c2-card-line{margin-top:6px;color:#475569;font-size:12px;font-weight:800}
        .c2-card-line em{font-style:normal;border:1px solid #d0d5dd;border-radius:999px;padding:2px 7px;color:#334155;background:#f8fafc}
        .c2-side-stack{display:grid;gap:12px}
        .c2-chart-panel,.c2-info-panel{border:1px solid #d8e4ef;border-radius:16px;background:#fff;overflow:hidden}
        .c2-chart-panel{min-height:620px}
        .c2-chart-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid #e4edf6;background:#f8fbff}
        .c2-chart-head b{font-size:15px}
        .c2-chart-head a{border:1px solid #d0d5dd;background:#fff;color:#111827;border-radius:8px;padding:7px 10px;font-size:12px;font-weight:900;text-decoration:none}
        .c2-tv-note{display:block;margin:8px 0;padding:8px 10px;border:1px solid #f5c66b;border-radius:10px;background:#fff7e6;color:#7a4b00;font-size:12px;font-weight:800;line-height:1.5}
        .c2-tv-widget{position:relative;height:620px;min-height:620px}
        .c2-tv-frame{width:100%;height:620px;border:0;display:block;background:#fff}
        .c2-tv-side-label{position:absolute;top:10px;right:12px;z-index:2;max-width:260px;padding:6px 9px;border:1px solid #f5c66b;border-radius:10px;background:rgba(255,247,230,.96);color:#7a4b00;font-size:12px;font-weight:900;line-height:1.35;box-shadow:0 2px 8px rgba(122,75,0,.12);pointer-events:none}
        .c2-tv-blocked{display:flex;align-items:center;justify-content:center;min-height:620px;padding:24px;color:#667085;font-weight:900;text-align:center;background:#f8fafc}
        .c2-info-panel{padding:12px}
        .c2-info-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
        .c2-info-head b{font-size:15px}
        .c2-info-head span{border:1px solid #d0d5dd;border-radius:999px;background:#f8fafc;color:#334155;font-size:12px;font-weight:900;padding:3px 8px}
        .c2-news-links{display:flex;flex-wrap:wrap;gap:8px}
        .c2-news-links a{border:1px solid #d0d5dd;border-radius:8px;background:#fff;color:#111827;font-size:12px;font-weight:900;padding:7px 10px;text-decoration:none}
        .c2-info-note,.c2-info-empty{margin-top:8px;color:#667085;font-size:12px;font-weight:800}
        .c2-fcn-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
        .c2-fcn-grid div{border:1px solid #e5e7eb;border-radius:10px;background:#f8fafc;padding:8px}
        .c2-fcn-grid span{display:block;color:#667085;font-size:11px;font-weight:800;margin-bottom:4px}
        .c2-fcn-grid b{font-size:13px;font-weight:950;color:#111827}
        .c2-summary-list{display:grid;gap:8px}
        .c2-summary-list div{display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid #eef2f7;padding-bottom:7px}
        .c2-summary-list div:last-child{border-bottom:0;padding-bottom:0}
        .c2-summary-list span{color:#667085;font-size:12px;font-weight:800}
        .c2-summary-list b{font-size:13px;font-weight:950;color:#111827;text-align:right}
        .c2-all-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:14px 0 10px;padding-top:14px;border-top:1px solid #e5e7eb}
        .c2-all-head h3{margin:0;font-size:16px}
        .c2-all-toggle{border:1px solid #d0d5dd;background:#fff;color:#111827;border-radius:8px;padding:7px 10px;font-size:12px;font-weight:900;cursor:pointer}
        .c2-all-panel[hidden]{display:none}
        .c2-filter-bar{display:grid;grid-template-columns:1.4fr repeat(6,minmax(112px,.75fr));gap:8px;margin-bottom:8px;align-items:center}
        .c2-filter-row{display:grid;grid-template-columns:repeat(6,minmax(112px,1fr)) auto;gap:8px;margin-bottom:10px;align-items:center}
        .c2-filter-bar input,.c2-filter-bar select,.c2-filter-row select{min-width:0}
        .c2-symbol{font-size:16px;font-weight:950;letter-spacing:.3px}
        .c2-up{color:#be3f3f;font-weight:950}
        .c2-down{color:#188b58;font-weight:950}
        .c2-flat{color:#667085;font-weight:900}
        .c2-risk{display:inline-flex;align-items:center;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:950;border:1px solid #d0d5dd;white-space:nowrap}
        .c2-risk-ok{background:#eaf8f1;color:#188b58;border-color:#ccead9}
        .c2-risk-warn{background:#fff4df;color:#b9770e;border-color:#f1dfb5}
        .c2-risk-high{background:#fff0f0;color:#be3f3f;border-color:#f0cfcf}
        .c2-risk-nodata{background:#f2f4f7;color:#667085;border-color:#d0d5dd}
        .c2-risk-note{margin-top:3px;color:#be3f3f;font-size:11px;font-weight:900;white-space:nowrap}
        @media(max-width:1240px){.c2-market-watch{grid-template-columns:minmax(260px,320px) minmax(0,1fr)}.c2-side-stack{grid-column:1/-1;grid-template-columns:repeat(3,minmax(0,1fr))}}
        @media(max-width:1040px){.c2-market-watch{grid-template-columns:1fr}.c2-pool-list{grid-template-columns:repeat(2,minmax(0,1fr));max-height:none}.c2-side-stack{grid-template-columns:1fr}}
        @media(max-width:1180px){.c2-filter-bar,.c2-filter-row{grid-template-columns:1fr 1fr}}
        @media(max-width:860px){.c2-fcn-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:680px){.c2-pool-list{grid-template-columns:1fr}.c2-chart-head,.c2-all-head,.c2-info-head{align-items:flex-start;flex-direction:column}.c2-fcn-grid{grid-template-columns:1fr}}
      </style>
      <div class="c2-market-watch">
        <div class="c2-pool-list" aria-label="FCN Pool stocks">
          ${watchRows.map(renderPoolCard).join("") || "<div class='c2-tv-empty'>No FCN Pool stocks.</div>"}
        </div>
        <div class="c2-chart-panel">
          <div class="c2-chart-head">
            <b>TradingView Today Technical View / 今日技術圖 | <span id="c2-tv-selected">${esc(chartSymbol(SELECTED_SYMBOL))}</span></b>
            <a id="c2-tv-link" href="${esc(tradingViewChartUrl(SELECTED_SYMBOL))}" target="_blank" rel="noopener">Open TradingView for selected symbol</a>
          </div>
          <div class="c2-tv-note">⚠ TradingView 外部市場視窗｜右側排行榜 / watchlist / market info 由 TradingView 自動產生，可能顯示市場排行或非本股票資料；FCN 判斷請以左側 MM 小卡為準：Price / 1W / 1M / M1 / M7 / FCN View。</div>
          <div id="c2-tv-widget" class="c2-tv-widget">
            <div class="c2-tv-side-label">TradingView 外部資訊<br>非 MM / FCN 判斷資料</div>
          </div>
        </div>
        <div class="c2-side-stack">
          <div id="c2-today-summary" class="c2-info-panel"></div>
          <div id="c2-selected-news" class="c2-info-panel"></div>
          <div id="c2-selected-fcn-info" class="c2-info-panel"></div>
        </div>
      </div>
      <div class="c2-all-head">
        <div><h3>All Stocks Radar / 全股票區</h3><div class="sub">預設隱藏，需要時一鍵展開檢查全部股票。</div></div>
        <button id="c2-all-stocks-toggle" class="c2-all-toggle" type="button" aria-expanded="${String(ALL_STOCKS_OPEN)}">${ALL_STOCKS_OPEN ? "收合全股票區" : "展開全股票區"}</button>
      </div>
      <div id="c2-all-stocks-panel" class="c2-all-panel" ${ALL_STOCKS_OPEN ? "" : "hidden"}>
        <div class="c2-filter-bar">
          <input id="c2-radar-search" placeholder="Search Symbol" />
          <select id="c2-radar-source"><option value="all">All Source</option><option value="FCN">FCN</option><option value="Pool30">Pool30</option><option value="Universe">Universe</option></select>
          <select id="c2-radar-session"><option value="all">All Session</option><option value="pre_market">Pre</option><option value="post_market">Post</option><option value="prepost">Pre/Post</option><option value="regular">Regular</option></select>
          <select id="c2-radar-valuation"><option value="all">All Valuation</option><option value="low_fair">Low / Fair</option><option value="high">High</option><option value="very_high">Very High</option><option value="extreme">Extreme</option><option value="good_expensive">Good Company but Expensive</option><option value="avoid_chase">Avoid Chase</option></select>
          <input id="c2-radar-m1min" type="number" step="0.1" placeholder="M1 min" />
          <input id="c2-radar-m7min" type="number" step="0.1" placeholder="M7 min" />
          <span id="c2-radar-count" class="sub"></span>
        </div>
        <div class="c2-filter-row">
          <select id="c2-radar-invested"><option value="all">All Invested</option><option value="none">No Position</option><option value="gt0">Invested &gt; 0</option><option value="gte100">Invested &gt;= 100K</option><option value="gte300">Invested &gt;= 300K</option><option value="gte500">Invested &gt;= 500K</option><option value="gte700">Invested &gt;= 700K</option></select>
          <select id="c2-radar-available"><option value="all">All Available</option><option value="gt0">Available &gt; 0</option><option value="gte100">Available &gt;= 100K</option><option value="gte300">Available &gt;= 300K</option><option value="full">Full / No Room</option><option value="over">Over Target</option></select>
          <select id="c2-radar-move"><option value="all">All Move</option><option value="today_up">Today Up</option><option value="today_down">Today Down</option><option value="move2">Move &gt; 2%</option><option value="move5">Move &gt; 5%</option><option value="prepost_up">PrePost Up</option><option value="prepost_down">PrePost Down</option><option value="prepost_move2">PrePost Move &gt; 2%</option><option value="prepost_move5">PrePost Move &gt; 5%</option></select>
          <select id="c2-radar-momentum"><option value="all">All Momentum</option><option value="w_up">1W Up</option><option value="w_down">1W Down</option><option value="m_up">1M Up</option><option value="m_down">1M Down</option><option value="w_down_m_up">1W Down + 1M Up</option><option value="m_gt10">1M &gt; 10%</option><option value="m_gt20">1M &gt; 20%</option></select>
          <select id="c2-radar-score"><option value="all">All Scores</option><option value="m1_8">M1 &gt;= 8</option><option value="m1_7">M1 &gt;= 7</option><option value="m7_8">M7 &gt;= 8</option><option value="m7_7">M7 &gt;= 7</option><option value="m1_8_m7_7">M1 &gt;= 8 and M7 &gt;= 7</option></select>
          <select id="c2-radar-sort"><option value="source">Source Priority</option><option value="invested">FCN Invested</option><option value="available">Available Amount</option><option value="price">Price</option><option value="m1">M1</option><option value="m7">M7</option><option value="delta_pct">Delta%</option><option value="one_week">1W</option><option value="one_month">1M</option><option value="valuation">Valuation Risk</option></select>
          <select id="c2-radar-direction"><option value="desc">Desc</option><option value="asc">Asc</option></select>
        </div>
        <div class="table-wrap"><table><thead><tr><th>Link</th><th>Symbol</th><th>Source</th><th>Price</th><th>Delta</th><th>Delta%</th><th>1W</th><th>1M</th><th>Pre/Post</th><th>Session</th><th>FCN Invested</th><th>Target Amount</th><th>Available Amount</th><th>M1</th><th>M7</th><th>Valuation Risk</th><th>FCN View</th></tr></thead><tbody id="c2-radar-body"></tbody></table></div>
      </div>`;
    ["c2-radar-search", "c2-radar-source", "c2-radar-session", "c2-radar-valuation", "c2-radar-m1min", "c2-radar-m7min", "c2-radar-invested", "c2-radar-available", "c2-radar-move", "c2-radar-momentum", "c2-radar-score", "c2-radar-sort", "c2-radar-direction"].forEach(id => {
      document.getElementById(id)?.addEventListener("input", renderRows);
      document.getElementById(id)?.addEventListener("change", renderRows);
    });
    bindMarketWatch();
    renderRows();
    setSelectedSymbol(SELECTED_SYMBOL);
  }

  async function render() {
    const el = document.getElementById("c2-all-stock-radar");
    if (!el) return;
    el.innerHTML = "<div class='muted'>Loading C2 Stock Radar v2...</div>";
    try {
      renderTable(el, await buildRows());
    } catch (err) {
      console.warn("[C2RadarV2] render failed", err);
      el.innerHTML = "<div class='muted'>C2 Stock Radar v2 load failed.</div>";
    }
  }

  async function filterC1Select() {
    const select = document.getElementById("mm-c1-symbol-fallback");
    if (!select) return;
    const runtimeMap = bySymbol(await fetchJson(PATHS.marketRuntime));
    let changed = false;
    [...select.options].forEach(option => {
      const sym = normalizeSymbol(option.value);
      if (!isTradableStockSymbol(sym, runtimeMap.get(sym) || {})) {
        option.remove();
        changed = true;
      }
    });
    if (changed && select.value && !isTradableStockSymbol(select.value, runtimeMap.get(select.value) || {})) {
      select.value = "NVDA";
      select.dispatchEvent(new Event("change"));
    }
  }

  function watchC1Select() {
    filterC1Select();
    const observer = new MutationObserver(filterC1Select);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.MMModuleRadarV2 = { render, isTradableStockSymbol };
  window.MM_C2_STOCK_RADAR_V2_LOADED = true;
  document.addEventListener("DOMContentLoaded", () => {
    watchC1Select();
    render();
  });
})();
