/* ==========================================================================
   MM × M1 Integration — C1 Single Stock Cockpit / Decision Engine
   File: js/mm/modules/mm_stock_cockpit.js

   Goal:
   - MM is display / decision aggregation only.
   - No heavy model logic.
   - Do not modify M1 / M7 / runtime pipeline.
   - Render C1 with L0~L4:
     L0 Stock identity + price strip
     L1 Visual decision engine
     L2 M2 risk breakdown
     L3 M7 valuation / trend
     L4 M1 score + CC source

   Expected DOM from mm/engine_progress_dashboard.html:
   - #c1-stock-cockpit
   - #mm-c1-symbol-fallback
   - #mm-c1-search-fallback
   ========================================================================== */

(function () {
  "use strict";

  const DEFAULT_SYMBOL = "NVDA";

  const PATHS = {
    marketRuntime: "../data/market_runtime.json",
    pool30: "../data/pool30.json",
    m1Universe: "../data/m1/universe_150.json",
    m1Candidate: "../data/m1/m1_candidate_80.json",
    m1Competitive: "../data/m1/m1_competitive.json",
    epsHistory: "../data/m1/eps_history_ai.json",
    m7Scores: "../data/m7_sandbox/m7_v2_scores.json",
    m2Exposure: "../data/m7/m2_stock_exposure.json",
    fcnPool: "../data/fcn_pool.json",
    profileAll: "../data/m1/m1_stock_profile_all.json",
    profileDeep: "../data/m1/m1_stock_profile.json"
  };

  const STATE = {
    initialized: false,
    activeSymbol: DEFAULT_SYMBOL,
    data: {},
    stocks: []
  };

  /* -----------------------------
     Basic helpers
  ----------------------------- */

  function $(id) {
    return document.getElementById(id);
  }

  function safeNum(v, fallback = null) {
    if (v === null || v === undefined || v === "") return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function fmtNum(v, digits = 2, dash = "--") {
    const n = safeNum(v);
    if (n === null) return dash;
    return n.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function fmtPct(v, digits = 1, dash = "--") {
    const n = safeNum(v);
    if (n === null) return dash;
    const value = Math.abs(n) <= 1 ? n * 100 : n;
    return `${value.toFixed(digits)}%`;
  }

  function clamp(n, min, max) {
    const x = safeNum(n, min);
    return Math.max(min, Math.min(max, x));
  }

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeSymbol(v) {
    return String(v || "").trim().toUpperCase();
  }

  function asArray(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.data)) return raw.data;
    if (Array.isArray(raw.items)) return raw.items;
    if (Array.isArray(raw.stocks)) return raw.stocks;
    if (Array.isArray(raw.results)) return raw.results;

    if (typeof raw === "object") {
      return Object.entries(raw)
        .filter(([k, v]) => v && typeof v === "object")
        .map(([k, v]) => ({ symbol: v.symbol || k, ...v }));
    }
    return [];
  }

  function bySymbol(raw, symbol) {
    const sym = normalizeSymbol(symbol);
    if (!raw) return null;

    if (Array.isArray(raw)) {
      return raw.find(x => normalizeSymbol(x.symbol || x.ticker) === sym) || null;
    }

    if (raw[sym]) {
      if (raw[sym] && typeof raw[sym] === "object") {
        return { symbol: sym, ...raw[sym] };
      }
      return { symbol: sym, value: raw[sym] };
    }

    const arr = asArray(raw);
    return arr.find(x => normalizeSymbol(x.symbol || x.ticker) === sym) || null;
  }

  async function fetchJson(path) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  async function loadData() {
    const existing = window.MM_DASHBOARD_DATA || window.mmDashboardData || window.MM_STATE || {};

    const fetched = {};
    await Promise.all(Object.entries(PATHS).map(async ([key, path]) => {
      fetched[key] = existing[key] || existing[path] || await fetchJson(path);
    }));

    STATE.data = { ...existing, ...fetched };
    STATE.stocks = buildSymbolList(STATE.data);
  }

  function buildSymbolList(data) {
    const symbols = new Set();

    [
      data.marketRuntime,
      data.pool30,
      data.m1Universe,
      data.m1Candidate,
      data.m1Competitive,
      data.m7Scores,
      data.m2Exposure,
      data.profileAll,
      data.profileDeep
    ].forEach(src => {
      asArray(src).forEach(x => {
        const s = normalizeSymbol(x.symbol || x.ticker);
        if (s) symbols.add(s);
      });
    });

    symbols.add(DEFAULT_SYMBOL);
    return Array.from(symbols).sort();
  }

  /* -----------------------------
     Data adapters
  ----------------------------- */

  function getRuntime(symbol) {
    const r = bySymbol(STATE.data.marketRuntime, symbol);
    return r || {};
  }

  function getM7(symbol) {
    const raw = STATE.data.m7Scores;
    const item = bySymbol(raw, symbol);
    return item || {};
  }

  function getM1(symbol) {
    const sym = normalizeSymbol(symbol);

    const comp = bySymbol(STATE.data.m1Competitive, sym) || {};
    const cand = bySymbol(STATE.data.m1Candidate, sym) || {};
    const uni = bySymbol(STATE.data.m1Universe, sym) || {};
    const pool = bySymbol(STATE.data.pool30, sym) || {};

    const inCandidate = !!Object.keys(cand).length;
    const inUniverse = !!Object.keys(uni).length;
    const inPool30 = !!Object.keys(pool).length;

    return {
      ...uni,
      ...cand,
      ...comp,
      ...pool,
      symbol: sym,
      in_universe: inUniverse,
      in_candidate: inCandidate,
      in_pool30: inPool30,
      m1_score: firstNum(
        pool.m1_score, comp.m1_score, cand.m1_score, uni.m1_score,
        pool.score, comp.score, cand.score, uni.score
      ),
      category: pool.category || comp.category || cand.category || uni.category || "",
      category_sub: pool.category_sub || comp.category_sub || cand.category_sub || uni.category_sub || "",
      filter_result: pool.filter_result || comp.filter_result || cand.filter_result || uni.filter_result || "",
      ai_recommend: Boolean(
        pool.ai_recommend || comp.ai_recommend || cand.ai_recommend ||
        String(pool.filter_result || comp.filter_result || cand.filter_result || "").toUpperCase().includes("AI")
      )
    };
  }

  function getProfile(symbol) {
    return bySymbol(STATE.data.profileDeep, symbol) ||
           bySymbol(STATE.data.profileAll, symbol) ||
           {};
  }

  function getEPS(symbol) {
    return bySymbol(STATE.data.epsHistory, symbol) || {};
  }

  function getM2Exposure(symbol) {
    const direct = bySymbol(STATE.data.m2Exposure, symbol) || {};
    const sym = normalizeSymbol(symbol);
    const fcnRows = asArray(STATE.data.fcnPool).filter(x => normalizeSymbol(x.symbol || x.ticker || x.underlying) === sym);

    const amount = sum(fcnRows.map(x => firstNum(x.amount_usd, x.notional_usd, x.principal_usd, x.amount, 0)));
    const activeCount = fcnRows.length;
    const brokers = {};
    fcnRows.forEach(x => {
      const b = x.broker || x.bank || x.account || "Unknown";
      brokers[b] = (brokers[b] || 0) + firstNum(x.amount_usd, x.notional_usd, x.principal_usd, x.amount, 0);
    });

    return {
      ...direct,
      fcn_amount_usd: firstNum(direct.fcn_amount_usd, direct.amount_usd, amount),
      active_fcn_count: firstNum(direct.active_fcn_count, direct.count, activeCount),
      concentration_pct: firstNum(direct.concentration_pct, direct.exposure_pct, direct.weight_pct),
      broker_breakdown: direct.broker_breakdown || brokers
    };
  }

  function firstNum(...vals) {
    for (const v of vals) {
      const n = safeNum(v);
      if (n !== null) return n;
    }
    return null;
  }

  function firstVal(...vals) {
    for (const v of vals) {
      if (v !== null && v !== undefined && v !== "") return v;
    }
    return null;
  }

  function sum(arr) {
    return arr.reduce((a, b) => a + (safeNum(b, 0) || 0), 0);
  }

  /* -----------------------------
     CC source / confidence
     A/B/C/D = data credibility, not EPS count
  ----------------------------- */

  function buildCCSource(symbol, m1, m7, runtime, eps) {
    const epsOk = hasEPSData(eps);
    const runtimeOk = hasRuntimeData(runtime);
    const globalOk = hasGlobalOrFundamental(runtime, m7, m1);

    let score = 0;
    if (epsOk) score += 0.34;
    if (runtimeOk) score += 0.33;
    if (globalOk) score += 0.33;

    let grade = "D";
    if (score >= 0.90) grade = "A";
    else if (score >= 0.70) grade = "B";
    else if (score >= 0.50) grade = "C";

    const missing = [];
    if (!epsOk) missing.push("EPS");
    if (!runtimeOk) missing.push("runtime");
    if (!globalOk) missing.push("global/fundamental");

    return {
      grade,
      score,
      epsOk,
      runtimeOk,
      globalOk,
      missing,
      text: `CC-${grade}`,
      note: missing.length ? `待補：${missing.join(" / ")}` : "EPS + runtime + global 資料完整"
    };
  }

  function hasEPSData(eps) {
    if (!eps || !Object.keys(eps).length) return false;
    const hist = eps.history || eps.historical_eps || eps.annual_eps || eps.eps_history || [];
    const fwd = eps.forward || eps.forward_eps || eps.estimates || eps.eps_forward || [];
    if (Array.isArray(hist) && hist.length >= 3) return true;
    if (Array.isArray(fwd) && fwd.length >= 1) return true;
    return Boolean(eps.eps_basis || eps.future_profit || eps.future_growth);
  }

  function hasRuntimeData(runtime) {
    return firstNum(
      runtime.price,
      runtime.last_price,
      runtime.close,
      runtime.current_price,
      runtime.price_now
    ) !== null;
  }

  function hasGlobalOrFundamental(runtime, m7, m1) {
    return firstNum(
      runtime.forward_pe,
      runtime.trailing_pe,
      runtime.ttm_eps,
      runtime.eps_ttm,
      runtime.market_cap,
      m7.valuation_score,
      m7.m7_v2_score,
      m1.m1_score
    ) !== null;
  }

  /* -----------------------------
     Decision Engine
  ----------------------------- */

  function buildDecision(symbol) {
    const runtime = getRuntime(symbol);
    const m7 = getM7(symbol);
    const m1 = getM1(symbol);
    const profile = getProfile(symbol);
    const eps = getEPS(symbol);
    const m2 = getM2Exposure(symbol);
    const cc = buildCCSource(symbol, m1, m7, runtime, eps);

    const price = firstNum(runtime.price, runtime.last_price, runtime.close, runtime.current_price, runtime.price_now);
    const fairPrice = firstNum(
      m7.regression_fair_price_now,
      m7.fair_price,
      m7.fair_value,
      runtime.regression_fair_price_now,
      runtime.fair_price
    );

    const valuationGapPct = price && fairPrice ? ((price - fairPrice) / fairPrice) * 100 : null;

    const m1Score = firstNum(m1.m1_score);
    const m7Score = firstNum(m7.m7_v2_score, m7.m7_score, m7.score);
    const valuationScore = firstNum(m7.valuation_score, m7.valuation);
    const trendScore = firstNum(m7.trend_score, m7.trend);
    const structureScore = firstNum(m7.structure_score, m7.structure);
    const moneyScore = firstNum(m7.money_score, m7.money);
    const timingScore = firstNum(m7.timing_score, m7.timing);

    const r2 = firstNum(
      m7.best_structure_r2,
      m7.structure_r2,
      m7.regression_r2,
      runtime.best_structure_r2
    );

    const exposurePct = firstNum(m2.concentration_pct, m2.exposure_pct, m2.weight_pct);
    const exposureLevel = getExposureLevel(exposurePct, m2.active_fcn_count);

    const qualityLevel = getScoreLevel(m1Score, 8, 7);
    const valuationLevel = getValuationLevel(valuationGapPct, valuationScore);
    const trendLevel = getTrendLevel(trendScore, r2);
    const ccLevel = cc.grade;

    const factors = [
      {
        key: "M1 Quality",
        zh: "股票品質",
        value: m1Score === null ? "--" : fmtNum(m1Score, 2),
        detail: qualityLevel.detail,
        status: qualityLevel.status,
        bar: scoreToBar(m1Score),
        source: "M1"
      },
      {
        key: "Valuation",
        zh: "估值位置",
        value: valuationGapPct === null ? (valuationScore === null ? "--" : fmtNum(valuationScore, 2)) : fmtPct(valuationGapPct),
        detail: valuationLevel.detail,
        status: valuationLevel.status,
        bar: valuationToBar(valuationGapPct, valuationScore),
        source: "M7"
      },
      {
        key: "Trend",
        zh: "趨勢品質",
        value: trendScore === null ? "--" : fmtNum(trendScore, 2),
        detail: trendLevel.detail,
        status: trendLevel.status,
        bar: scoreToBar(trendScore),
        source: "M7"
      },
      {
        key: "M2 Exposure",
        zh: "曝險壓力",
        value: exposurePct === null ? (m2.active_fcn_count ? `${m2.active_fcn_count} FCN` : "--") : fmtPct(exposurePct),
        detail: exposureLevel.detail,
        status: exposureLevel.status,
        bar: exposureToBar(exposurePct, m2.active_fcn_count),
        source: "M2"
      },
      {
        key: "CC Source",
        zh: "資料可信度",
        value: cc.text,
        detail: cc.note,
        status: cc.grade === "A" || cc.grade === "B" ? "ok" : cc.grade === "C" ? "warn" : "bad",
        bar: Math.round(cc.score * 100),
        source: "CC"
      }
    ];

    const final = finalDecision({
      m1Score,
      m7Score,
      valuationGapPct,
      valuationScore,
      trendScore,
      exposurePct,
      activeFcnCount: m2.active_fcn_count,
      cc
    });

    return {
      symbol: normalizeSymbol(symbol),
      runtime,
      m7,
      m1,
      profile,
      eps,
      m2,
      cc,
      price,
      fairPrice,
      valuationGapPct,
      m1Score,
      m7Score,
      valuationScore,
      trendScore,
      structureScore,
      moneyScore,
      timingScore,
      r2,
      factors,
      final
    };
  }

  function finalDecision(x) {
    const ccWeak = x.cc.grade === "D";
    const highQuality = x.m1Score !== null && x.m1Score >= 8;
    const okQuality = x.m1Score !== null && x.m1Score >= 7;
    const lowQuality = x.m1Score !== null && x.m1Score < 6.5;
    const overValued = x.valuationGapPct !== null && x.valuationGapPct >= 15;
    const fairOrCheap = x.valuationGapPct !== null && x.valuationGapPct <= 5;
    const veryCheap = x.valuationGapPct !== null && x.valuationGapPct <= -10;
    const badValScore = x.valuationScore !== null && x.valuationScore < 5.5;
    const strongTrend = x.trendScore !== null && x.trendScore >= 7.5;
    const weakTrend = x.trendScore !== null && x.trendScore < 5.5;
    const highExposure = (x.exposurePct !== null && x.exposurePct >= 15) || (x.activeFcnCount !== null && x.activeFcnCount >= 3);

    if (ccWeak) {
      return {
        code: "DATA_WAIT",
        label: "DATA WAIT",
        zh: "先補資料",
        status: "warn",
        reason: "CC-D：EPS / runtime / global 至少兩層不足，MM 不應直接給進場結論。",
        fcn: "不建議新做 FCN；先補資料再評估。"
      };
    }

    if (lowQuality) {
      return {
        code: "REJECT",
        label: "REJECT",
        zh: "不進主池",
        status: "bad",
        reason: "M1 quality 低於主池門檻，除非有特殊事件，不應進 Pool30。",
        fcn: "不適合當 FCN 底層。"
      };
    }

    if (highQuality && overValued && highExposure) {
      return {
        code: "WAIT_EXPOSURE",
        label: "WAIT",
        zh: "品質好但估值與曝險偏高",
        status: "warn",
        reason: "M1 品質夠，但估值高於 fair anchor 且 M2 曝險偏高，追高會放大 FCN 接股風險。",
        fcn: "只適合觀察或等折價；不建議加碼同底層 FCN。"
      };
    }

    if (highQuality && overValued) {
      return {
        code: "WAIT_VALUATION",
        label: "WAIT",
        zh: "品質好但估值偏貴",
        status: "warn",
        reason: "M1 quality 通過，但現價高於 regression / anchor 合理區，適合等回落。",
        fcn: "FCN 可列候選，但 coupon 要補償估值風險。"
      };
    }

    if (okQuality && fairOrCheap && strongTrend && !highExposure) {
      return {
        code: "BUY_OR_FCN_OK",
        label: "FCN OK",
        zh: "可研究進場 / FCN",
        status: "ok",
        reason: "M1 quality 達標，估值未明顯高估，趨勢仍在，且曝險沒有過熱。",
        fcn: "可進 FCN 候選；仍需看條件、下檔距離與票息。"
      };
    }

    if (okQuality && veryCheap && !weakTrend) {
      return {
        code: "VALUE_WATCH",
        label: "WATCH",
        zh: "估值有吸引力，等確認",
        status: "ok",
        reason: "估值相對 fair anchor 有折價，但仍需確認趨勢與基本面沒有惡化。",
        fcn: "可放入觀察名單；適合等條件變好。"
      };
    }

    if (badValScore && !strongTrend) {
      return {
        code: "WAIT_WEAK_SETUP",
        label: "WAIT",
        zh: "分數未形成一致訊號",
        status: "warn",
        reason: "估值或趨勢沒有同時支持進場，暫時不應由 MM 推動動作。",
        fcn: "不急著做；等 M7 valuation / trend 至少一項改善。"
      };
    }

    return {
      code: "WATCH",
      label: "WATCH",
      zh: "觀察",
      status: "warn",
      reason: "M1 / M7 / M2 沒有形成明確 BUY 或 REJECT，維持觀察。",
      fcn: "可放候選，但不自動進入新 FCN。"
    };
  }

  function getScoreLevel(score, strong, pass) {
    if (score === null) return { status: "warn", detail: "M1 score missing" };
    if (score >= strong) return { status: "ok", detail: `≥ ${strong}，品質層級可進主池候選` };
    if (score >= pass) return { status: "warn", detail: `≥ ${pass}，可觀察但需要 M7 / CC 支持` };
    return { status: "bad", detail: `< ${pass}，不適合主池` };
  }

  function getValuationLevel(gapPct, valuationScore) {
    if (gapPct !== null) {
      if (gapPct >= 20) return { status: "bad", detail: `高於 fair price 約 ${fmtPct(gapPct)}，追高風險高` };
      if (gapPct >= 10) return { status: "warn", detail: `高於 fair price 約 ${fmtPct(gapPct)}，等待較合理` };
      if (gapPct <= -10) return { status: "ok", detail: `低於 fair price 約 ${fmtPct(Math.abs(gapPct))}，估值有吸引力` };
      return { status: "ok", detail: "接近 fair price，估值未明顯失控" };
    }
    if (valuationScore === null) return { status: "warn", detail: "valuation data missing" };
    if (valuationScore >= 7) return { status: "ok", detail: "valuation score 偏佳" };
    if (valuationScore >= 5.5) return { status: "warn", detail: "valuation score 中性" };
    return { status: "bad", detail: "valuation score 偏弱" };
  }

  function getTrendLevel(trendScore, r2) {
    if (trendScore === null) return { status: "warn", detail: "trend score missing" };
    const r2Text = r2 === null ? "" : `，R²=${fmtNum(r2, 2)}`;
    if (trendScore >= 8) return { status: "ok", detail: `趨勢分數高${r2Text}` };
    if (trendScore >= 6.5) return { status: "ok", detail: `趨勢仍可支持持有 / 觀察${r2Text}` };
    if (trendScore >= 5) return { status: "warn", detail: `趨勢中性${r2Text}` };
    return { status: "bad", detail: `趨勢偏弱${r2Text}` };
  }

  function getExposureLevel(exposurePct, activeFcnCount) {
    if (exposurePct !== null) {
      if (exposurePct >= 20) return { status: "bad", detail: "M2 concentration 偏高，避免同底層加碼" };
      if (exposurePct >= 10) return { status: "warn", detail: "已有一定曝險，新 FCN 需保守" };
      return { status: "ok", detail: "曝險可控" };
    }
    if (activeFcnCount >= 3) return { status: "warn", detail: `${activeFcnCount} 檔 FCN，需檢查集中度` };
    if (activeFcnCount > 0) return { status: "ok", detail: `${activeFcnCount} 檔 FCN，曝險資料部分可用` };
    return { status: "ok", detail: "目前未偵測到 FCN 曝險" };
  }

  function scoreToBar(score) {
    if (score === null) return 0;
    return Math.round(clamp(score, 0, 10) * 10);
  }

  function valuationToBar(gapPct, score) {
    if (gapPct !== null) {
      const normalized = 100 - clamp((gapPct + 30) / 60 * 100, 0, 100);
      return Math.round(normalized);
    }
    return scoreToBar(score);
  }

  function exposureToBar(exposurePct, count) {
    if (exposurePct !== null) return Math.round(clamp(exposurePct, 0, 30) / 30 * 100);
    return Math.round(clamp(count || 0, 0, 5) / 5 * 100);
  }

  /* -----------------------------
     Rendering
  ----------------------------- */

  function render(symbol = STATE.activeSymbol) {
    const root = $("c1-stock-cockpit");
    if (!root) return;

    STATE.activeSymbol = normalizeSymbol(symbol || DEFAULT_SYMBOL);
    const d = buildDecision(STATE.activeSymbol);

    root.innerHTML = `
      ${styleBlock()}
      <div class="stock-header mm-c1-enhanced">
        ${renderL0(d)}
        ${renderL1(d)}
      </div>
      <div class="c1-details mm-c1-layers">
        ${renderL2(d)}
        ${renderL3(d)}
        ${renderL4(d)}
      </div>
    `;
  }

  function renderL0(d) {
    const name = firstVal(
      d.profile.name,
      d.profile.company_name,
      d.m1.name,
      d.m7.name,
      d.runtime.name,
      d.symbol
    );

    const cat = firstVal(d.m1.category, d.m7.category, d.runtime.category, "--");
    const sub = firstVal(d.m1.category_sub, d.m7.category_sub, d.runtime.category_sub, d.m7.subsector, "--");

    const oneLine = firstVal(
      d.profile.one_line,
      d.profile.business_summary,
      d.profile.company_positioning,
      d.profile.summary,
      `${d.symbol}：MM 決策卡整合 M1 quality、M7 valuation/trend、M2 exposure 與 CC source。`
    );

    const ret1d = firstNum(d.runtime.ret_1d, d.runtime.change_pct, d.runtime.day_change_pct);
    const ret1w = firstNum(d.runtime.ret_1w, d.runtime.return_1w);
    const ret1m = firstNum(d.runtime.ret_1m, d.runtime.return_1m);
    const ret3m = firstNum(d.runtime.ret_3m, d.runtime.return_3m, d.runtime.proxy_return_3m);
    const ret12m = firstNum(d.runtime.ret_12m, d.runtime.ret_1y, d.runtime.return_12m);

    const volumeRatio = firstNum(d.runtime.volume_ratio, d.m7.volume_ratio);
    const pos12m = firstNum(d.runtime.position_12m_pct, d.runtime.price_position_12m, d.runtime.range_position_12m);
    const rangePos = clamp(pos12m !== null ? (Math.abs(pos12m) <= 1 ? pos12m * 100 : pos12m) : 50, 0, 100);

    return `
      <div class="stock-header-grid">
        <div>
          <div class="stock-title-row">
            <div class="logo-pill">
              <div class="sym">${esc(d.symbol)}</div>
              <div class="cat">${esc(String(cat).toUpperCase())}</div>
            </div>
            <div class="stock-title">
              <h2>${esc(name)}</h2>
              <div class="one-line">${esc(oneLine)}</div>
              <div class="meta-row">
                <span class="chip">Category：${esc(cat)}</span>
                <span class="chip">Sub-category：${esc(sub)}</span>
                <span class="chip ${ccClass(d.cc.grade)}">${esc(d.cc.text)}：${esc(d.cc.note)}</span>
              </div>
            </div>
          </div>

          <div class="price-strip">
            <div class="mini-kpi"><div class="k">Today Price</div><div class="v">${fmtNum(d.price, 2)}</div><div class="d">現價 / runtime</div></div>
            <div class="mini-kpi"><div class="k">Δ%</div><div class="v ${retClass(ret1d)}">${fmtPct(ret1d)}</div><div class="d">今日變化</div></div>
            <div class="mini-kpi"><div class="k">1W / 1M</div><div class="v">${fmtPct(ret1w)} / ${fmtPct(ret1m)}</div><div class="d">短期表現</div></div>
            <div class="mini-kpi"><div class="k">3M / 12M</div><div class="v">${fmtPct(ret3m)} / ${fmtPct(ret12m)}</div><div class="d">中長期表現</div></div>
            <div class="mini-kpi"><div class="k">Volume / Position</div><div class="v">${volumeRatio === null ? "--" : fmtNum(volumeRatio, 2) + "x"}</div><div class="d">12M position：${pos12m === null ? "--" : fmtPct(pos12m)}</div></div>
          </div>

          <div class="range-wrap">
            <div class="range-top"><span>Today price vs Regression / Historical Position</span><span>Low → Current → High</span></div>
            <div class="range-bar">
              <div class="range-fill" style="width:${rangePos}%"></div>
              <div class="range-pin" style="left:${rangePos}%"></div>
            </div>
            <div class="range-label">
              <span>Fair / Regression：${fmtNum(d.fairPrice, 2)}</span>
              <span>Valuation Gap：${d.valuationGapPct === null ? "--" : fmtPct(d.valuationGapPct)}</span>
              <span>Confidence：${d.r2 === null ? "--" : "R² " + fmtNum(d.r2, 2)}</span>
            </div>
          </div>
        </div>

        <div>
          ${renderFinalBox(d)}
          ${renderScoreGrid(d)}
        </div>
      </div>
    `;
  }

  function renderFinalBox(d) {
    return `
      <div class="mm-final-decision ${d.final.status}">
        <div>
          <div class="mm-final-k">FINAL DECISION</div>
          <div class="mm-final-v">${esc(d.final.label)} <span>${esc(d.final.zh)}</span></div>
          <div class="mm-final-d">${esc(d.final.reason)}</div>
        </div>
        <div class="mm-final-side">
          <div class="mm-final-side-k">FCN View</div>
          <div class="mm-final-side-d">${esc(d.final.fcn)}</div>
        </div>
      </div>
    `;
  }

  function renderScoreGrid(d) {
    return `
      <div class="score-grid">
        <div class="score-box"><div class="k">M1 Score</div><div class="v">${fmtNum(d.m1Score, 2)}</div><div class="d">${d.m1.in_pool30 ? "Pool30" : d.m1.in_candidate ? "Candidate" : d.m1.in_universe ? "Universe" : "待入 Universe"}</div></div>
        <div class="score-box"><div class="k">M7 Score</div><div class="v">${fmtNum(d.m7Score, 2)}</div><div class="d">valuation + trend + structure</div></div>
        <div class="score-box"><div class="k">Valuation</div><div class="v">${fmtNum(d.valuationScore, 2)}</div><div class="d">gap：${d.valuationGapPct === null ? "--" : fmtPct(d.valuationGapPct)}</div></div>
        <div class="score-box"><div class="k">Trend</div><div class="v">${fmtNum(d.trendScore, 2)}</div><div class="d">R²：${fmtNum(d.r2, 2)}</div></div>
        <div class="score-box"><div class="k">Structure</div><div class="v">${fmtNum(d.structureScore, 2)}</div><div class="d">${esc(firstVal(d.m7.best_structure_model, d.m7.structure_model, "--"))}</div></div>
        <div class="score-box"><div class="k">Money</div><div class="v">${fmtNum(d.moneyScore, 2)}</div><div class="d">Timing：${fmtNum(d.timingScore, 2)}</div></div>
      </div>
    `;
  }

  function renderL1(d) {
    return `
      <section class="mm-decision-engine">
        <div class="mm-layer-title">
          <div>
            <h3>L1 Decision Engine / 圖像化決策引擎</h3>
            <p>不是文字卡：用 M1、M7、M2、CC 四層訊號組合出 final decision。</p>
          </div>
          <span class="pill ${d.final.status}">${esc(d.final.label)}</span>
        </div>

        <div class="mm-engine-flow">
          ${d.factors.map(renderFactor).join("")}
        </div>

        <div class="mm-engine-arrow">→</div>

        <div class="mm-engine-result ${d.final.status}">
          <div class="mm-engine-result-k">Decision Output</div>
          <div class="mm-engine-result-v">${esc(d.final.zh)}</div>
          <div class="mm-engine-result-d">${esc(d.final.reason)}</div>
        </div>
      </section>
    `;
  }

  function renderFactor(f) {
    return `
      <div class="mm-factor ${f.status}">
        <div class="mm-factor-top">
          <div>
            <div class="mm-factor-k">${esc(f.key)}</div>
            <div class="mm-factor-zh">${esc(f.zh)}</div>
          </div>
          <span>${esc(f.source)}</span>
        </div>
        <div class="mm-factor-v">${esc(f.value)}</div>
        <div class="mm-factor-bar"><i style="width:${clamp(f.bar, 0, 100)}%"></i></div>
        <div class="mm-factor-d">${esc(f.detail)}</div>
      </div>
    `;
  }

  function renderL2(d) {
    const brokers = d.m2.broker_breakdown || {};
    const brokerRows = Object.keys(brokers).length
      ? Object.entries(brokers).map(([k, v]) => `<tr><td>${esc(k)}</td><td>USD ${fmtNum(v, 0)}</td></tr>`).join("")
      : `<tr><td colspan="2">No broker breakdown</td></tr>`;

    return `
      <details open>
        <summary>L2 M2 Risk Breakdown / FCN 曝險風險</summary>
        <div class="mm-detail-grid">
          <div class="mini-kpi"><div class="k">FCN Amount</div><div class="v">USD ${fmtNum(d.m2.fcn_amount_usd, 0)}</div><div class="d">同底層 FCN 名目金額</div></div>
          <div class="mini-kpi"><div class="k">Active Count</div><div class="v">${fmtNum(d.m2.active_fcn_count, 0)}</div><div class="d">目前偵測到的 FCN 檔數</div></div>
          <div class="mini-kpi"><div class="k">Concentration</div><div class="v">${fmtPct(d.m2.concentration_pct)}</div><div class="d">M2 exposure / concentration</div></div>
        </div>
        <div class="table-wrap mm-small-table">
          <table>
            <thead><tr><th>Broker / Account</th><th>Amount</th></tr></thead>
            <tbody>${brokerRows}</tbody>
          </table>
        </div>
      </details>
    `;
  }

  function renderL3(d) {
    return `
      <details open>
        <summary>L3 M7 Valuation / Trend / Structure</summary>
        <div class="mm-detail-grid">
          <div class="mini-kpi"><div class="k">Fair Price</div><div class="v">${fmtNum(d.fairPrice, 2)}</div><div class="d">regression / anchor</div></div>
          <div class="mini-kpi"><div class="k">Valuation Gap</div><div class="v ${gapClass(d.valuationGapPct)}">${d.valuationGapPct === null ? "--" : fmtPct(d.valuationGapPct)}</div><div class="d">price vs fair price</div></div>
          <div class="mini-kpi"><div class="k">Trend Score</div><div class="v">${fmtNum(d.trendScore, 2)}</div><div class="d">linear / MA / acceleration</div></div>
          <div class="mini-kpi"><div class="k">Structure R²</div><div class="v">${fmtNum(d.r2, 2)}</div><div class="d">${esc(firstVal(d.m7.best_structure_model, d.m7.structure_model, "--"))}</div></div>
        </div>
        <div class="mm-trace">
          <div><b>M7 Score</b><span>${fmtNum(d.m7Score, 2)}</span></div>
          <div><b>Valuation</b><span>${fmtNum(d.valuationScore, 2)}</span></div>
          <div><b>Trend</b><span>${fmtNum(d.trendScore, 2)}</span></div>
          <div><b>Structure</b><span>${fmtNum(d.structureScore, 2)}</span></div>
          <div><b>Money</b><span>${fmtNum(d.moneyScore, 2)}</span></div>
          <div><b>Timing</b><span>${fmtNum(d.timingScore, 2)}</span></div>
        </div>
      </details>
    `;
  }

  function renderL4(d) {
    const ccRows = [
      ["EPS", d.cc.epsOk ? "OK" : "Missing"],
      ["Runtime", d.cc.runtimeOk ? "OK" : "Missing"],
      ["Global / Fundamental", d.cc.globalOk ? "OK" : "Missing"],
      ["CC Grade", d.cc.text],
      ["Coverage Score", fmtPct(d.cc.score)]
    ].map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("");

    return `
      <details open>
        <summary>L4 M1 Score + CC Source / 股票品質與資料可信度</summary>
        <div class="mm-detail-grid">
          <div class="mini-kpi"><div class="k">M1 Score</div><div class="v">${fmtNum(d.m1Score, 2)}</div><div class="d">M1 competitive score</div></div>
          <div class="mini-kpi"><div class="k">Pool Status</div><div class="v">${esc(d.m1.in_pool30 ? "Pool30" : d.m1.in_candidate ? "Candidate" : d.m1.in_universe ? "Universe" : "Not in Universe")}</div><div class="d">AI → Candidate → Pool30 funnel</div></div>
          <div class="mini-kpi"><div class="k">Category</div><div class="v">${esc(firstVal(d.m1.category, "--"))}</div><div class="d">${esc(firstVal(d.m1.category_sub, "--"))}</div></div>
          <div class="mini-kpi"><div class="k">CC Source</div><div class="v">${esc(d.cc.text)}</div><div class="d">${esc(d.cc.note)}</div></div>
        </div>
        <div class="table-wrap mm-small-table">
          <table>
            <thead><tr><th>Source Layer</th><th>Status</th></tr></thead>
            <tbody>${ccRows}</tbody>
          </table>
        </div>
      </details>
    `;
  }

  function retClass(v) {
    const n = safeNum(v);
    if (n === null) return "";
    return n >= 0 ? "mm-pos" : "mm-neg";
  }

  function gapClass(v) {
    const n = safeNum(v);
    if (n === null) return "";
    if (n > 15) return "mm-neg";
    if (n < -10) return "mm-pos";
    return "";
  }

  function ccClass(grade) {
    if (grade === "A" || grade === "B") return "ok";
    if (grade === "C") return "warn";
    return "bad";
  }

  function styleBlock() {
    return `
      <style>
        .mm-c1-enhanced{padding:18px}
        .mm-final-decision{
          display:grid;grid-template-columns:1.1fr .9fr;gap:10px;
          padding:14px;border-radius:18px;border:1px solid var(--line);
          background:#f8fbff;margin-bottom:10px
        }
        .mm-final-decision.ok{background:var(--good-bg);border-color:#ccead9}
        .mm-final-decision.warn{background:var(--warn-bg);border-color:#f1dfb5}
        .mm-final-decision.bad{background:var(--bad-bg);border-color:#f0cfcf}
        .mm-final-k,.mm-final-side-k{font-size:11px;color:var(--muted);font-weight:900}
        .mm-final-v{font-size:28px;font-weight:1000;margin-top:4px}
        .mm-final-v span{font-size:14px;margin-left:6px}
        .mm-final-d,.mm-final-side-d{font-size:12px;line-height:1.55;color:#334155;margin-top:6px;font-weight:750}
        .mm-final-side{background:rgba(255,255,255,.58);border:1px solid rgba(255,255,255,.75);border-radius:14px;padding:10px}
        .mm-decision-engine{
          margin-top:18px;border:1px solid #dfeaf5;border-radius:20px;
          background:linear-gradient(180deg,#fbfdff,#f6f9fd);padding:14px
        }
        .mm-layer-title{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}
        .mm-layer-title h3{margin:0;font-size:17px}
        .mm-layer-title p{margin:5px 0 0;color:var(--muted);font-size:12px;line-height:1.5}
        .mm-engine-flow{display:grid;grid-template-columns:repeat(5,minmax(140px,1fr));gap:10px}
        .mm-factor{border:1px solid #e4edf6;border-radius:16px;background:#fff;padding:12px;min-height:154px}
        .mm-factor.ok{border-color:#ccead9;background:#fbfffd}
        .mm-factor.warn{border-color:#f1dfb5;background:#fffdf8}
        .mm-factor.bad{border-color:#f0cfcf;background:#fffafa}
        .mm-factor-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
        .mm-factor-top span{font-size:10px;font-weight:900;color:#667085;background:#f2f4f7;border-radius:999px;padding:4px 7px}
        .mm-factor-k{font-size:12px;font-weight:1000}
        .mm-factor-zh{font-size:11px;color:var(--muted);margin-top:2px}
        .mm-factor-v{font-size:24px;font-weight:1000;margin-top:12px}
        .mm-factor-bar{height:8px;border-radius:999px;background:#edf2f7;overflow:hidden;margin:9px 0}
        .mm-factor-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#88c7ff,#2f80ed)}
        .mm-factor-d{font-size:12px;line-height:1.45;color:#344054;font-weight:700}
        .mm-engine-arrow{text-align:center;font-size:24px;font-weight:1000;color:#64748b;margin:10px 0 6px}
        .mm-engine-result{border-radius:16px;padding:13px;border:1px solid var(--line);background:#fff}
        .mm-engine-result.ok{background:var(--good-bg);border-color:#ccead9}
        .mm-engine-result.warn{background:var(--warn-bg);border-color:#f1dfb5}
        .mm-engine-result.bad{background:var(--bad-bg);border-color:#f0cfcf}
        .mm-engine-result-k{font-size:11px;color:var(--muted);font-weight:900}
        .mm-engine-result-v{font-size:20px;font-weight:1000;margin-top:4px}
        .mm-engine-result-d{font-size:12px;line-height:1.55;margin-top:5px;font-weight:750}
        .mm-c1-layers{padding:0 18px 18px}
        .mm-detail-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:10px 0}
        .mm-small-table table{min-width:420px}
        .mm-trace{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-top:10px}
        .mm-trace div{background:#fff;border:1px solid #e4edf6;border-radius:12px;padding:10px}
        .mm-trace b{display:block;font-size:11px;color:var(--muted)}
        .mm-trace span{display:block;font-size:18px;font-weight:1000;margin-top:4px}
        .mm-pos{color:var(--good)!important}
        .mm-neg{color:var(--bad)!important}
        @media(max-width:1180px){
          .mm-engine-flow{grid-template-columns:repeat(2,1fr)}
          .mm-detail-grid{grid-template-columns:repeat(2,1fr)}
          .mm-trace{grid-template-columns:repeat(3,1fr)}
          .mm-final-decision{grid-template-columns:1fr}
        }
        @media(max-width:720px){
          .mm-engine-flow,.mm-detail-grid,.mm-trace{grid-template-columns:1fr}
        }
      </style>
    `;
  }

  /* -----------------------------
     Controls / init
  ----------------------------- */

  function populateSymbolSelect() {
    const sel = $("mm-c1-symbol-fallback");
    if (!sel) return;

    sel.innerHTML = STATE.stocks.map(s => {
      const selected = s === STATE.activeSymbol ? "selected" : "";
      return `<option value="${esc(s)}" ${selected}>${esc(s)}</option>`;
    }).join("");

    sel.onchange = () => render(sel.value);
  }

  function bindSearch() {
    const input = $("mm-c1-search-fallback");
    if (!input) return;

    input.value = STATE.activeSymbol;
    input.onkeydown = (e) => {
      if (e.key === "Enter") {
        const sym = normalizeSymbol(input.value);
        if (sym) {
          if (!STATE.stocks.includes(sym)) {
            STATE.stocks.push(sym);
            STATE.stocks.sort();
            populateSymbolSelect();
          }
          render(sym);
          const sel = $("mm-c1-symbol-fallback");
          if (sel) sel.value = sym;
        }
      }
    };
  }

  async function init(options = {}) {
    if (STATE.initialized && !options.force) return;
    STATE.initialized = true;

    STATE.activeSymbol = normalizeSymbol(options.symbol || STATE.activeSymbol || DEFAULT_SYMBOL);
    await loadData();

    populateSymbolSelect();
    bindSearch();
    render(STATE.activeSymbol);
  }

  window.MMStockCockpit = {
    init,
    render,
    buildDecision,
    reload: async function(symbol = STATE.activeSymbol) {
      STATE.initialized = false;
      STATE.activeSymbol = normalizeSymbol(symbol || DEFAULT_SYMBOL);
      await init({ force: true, symbol: STATE.activeSymbol });
    },
    getState: () => STATE
  };

  document.addEventListener("DOMContentLoaded", () => {
    init({ symbol: DEFAULT_SYMBOL });
  });

})();
