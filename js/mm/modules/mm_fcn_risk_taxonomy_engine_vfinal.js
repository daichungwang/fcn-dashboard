// ============================================================================
// MM FCN Risk Taxonomy & Pool Allocation Engine vFinal
// Path: js/mm/modules/mm_fcn_risk_taxonomy_engine_vfinal.js
// Purpose:
//   1) Define pure FCN structure risk from Strike + KI
//   2) Define basket pool by worst-of pool composition
//   3) Apply time validity policy
//   4) Enrich market / simulation FCN records for dashboard display
// ============================================================================

window.MMFcnRiskTaxonomyEngine = (() => {
  const STRUCTURE_LEVELS = [
    "Low",
    "Medium-Low",
    "Medium",
    "Medium-High",
    "High",
    "Very High"
  ];

  const STRUCTURE_LEVEL_ZH = {
    "Low": "低風險",
    "Medium-Low": "中低風險",
    "Medium": "中風險",
    "Medium-High": "中高風險",
    "High": "高風險",
    "Very High": "極高風險",
    "Extremely High": "極端高風險"
  };

  const BASKET_POOLS = ["保守池", "合理池", "積極池", "投機池", "拒絕池"];

  const TIME_LABELS = ["極短期", "短期", "中期", "長期", "超長期"];

  const POOL_TARGET_RATE = {
    "保守池": { min: 10, max: 15 },
    "合理池": { min: 15, max: 19 },
    "積極池": { min: 19, max: 99 },
    "投機池": { min: 0, max: 99 },
    "拒絕池": { min: 0, max: 0 }
  };

  function toNumber(v, d = 0) {
    const x = Number(v);
    return Number.isFinite(x) ? x : d;
  }

  function nullableNumber(v) {
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  }

  function upper(x) {
    return String(x || "").trim().toUpperCase();
  }

  function clean(arr = []) {
    return (arr || []).map(Number).filter(Number.isFinite);
  }

  function mean(arr = []) {
    const xs = clean(arr);
    if (!xs.length) return null;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  }

  function std(arr = []) {
    const xs = clean(arr);
    if (xs.length <= 1) return 0;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / xs.length);
  }

  function cv(arr = []) {
    const xs = clean(arr);
    const m = mean(xs);
    if (!m) return null;
    return std(xs) / Math.abs(m);
  }

  function getStrikeRisk(strike = 0) {
    const x = toNumber(strike);
    if (x < 60) return "Low";
    if (x <= 64) return "Medium-Low";
    if (x === 65) return "Medium";
    if (x <= 70) return "Medium-High";
    if (x <= 74) return "High";
    return "Very High";
  }

  function getKIRisk(ki = 0) {
    const x = toNumber(ki);
    if (x < 50) return "Low";
    if (x <= 54) return "Medium-Low";
    if (x === 55) return "Medium";
    if (x <= 59) return "Medium-High";
    if (x <= 64) return "High";
    if (x <= 70) return "Very High";
    return "Extremely High";
  }

  function applyCompressionRule(strike, ki) {
    const s = toNumber(strike);
    const k = toNumber(ki);
    if (s !== k || s <= 0 || k <= 0) {
      return {
        compression_applied: false,
        effective_strike: s,
        effective_ki: k
      };
    }
    return {
      compression_applied: true,
      effective_strike: s + 5,
      effective_ki: k - 2.5
    };
  }

  function levelIndex(level) {
    if (level === "Extremely High") return 6;
    const idx = STRUCTURE_LEVELS.indexOf(level);
    return idx >= 0 ? idx : 2;
  }

  function levelByIndex(idx) {
    if (idx >= STRUCTURE_LEVELS.length) return "Very High";
    if (idx < 0) return "Low";
    return STRUCTURE_LEVELS[idx];
  }

  function getStructureRisk(strikeRisk, kiRisk) {
    const s = levelIndex(strikeRisk);
    const k = levelIndex(kiRisk);

    // System rule discussed: use Strike as the execution-risk anchor, then let KI
    // escalate when downside risk is clearly worse.
    let score = s;
    if (k >= s + 2) score += 1;
    if (s >= 4 && k >= 3) score = Math.max(score, 4);
    if (s >= 5 || k >= 5) score = Math.max(score, 5);
    if (k >= 6) score = 5;

    return levelByIndex(score);
  }

  function getTimeLabel(months = 0) {
    const m = toNumber(months);
    if (m <= 2) return "極短期";
    if (m <= 4) return "短期";
    if (m <= 7) return "中期";
    if (m <= 10) return "長期";
    return "超長期";
  }

  function getBasketPool({ highlight = 0, watch = 0, simulation = 0, reject = 0, unknown = 0, external_speculative = false }) {
    const h = toNumber(highlight);
    const w = toNumber(watch);
    const s = toNumber(simulation);
    const r = toNumber(reject);
    const u = toNumber(unknown);

    if (r > 0 || u > 0 || external_speculative) return "投機池";
    if (h >= 1 && w <= 1 && s === 0) return "保守池";
    if (w <= 2 && s <= 1) return "合理池";
    if (s >= 1) return "積極池";
    return "拒絕池";
  }

  function getAllowedMonths(pool, structureRisk) {
    const policy = {
      "保守池": {
        "Low": 99,
        "Medium-Low": 99,
        "Medium": 12,
        "Medium-High": 10,
        "High": 6,
        "Very High": 0
      },
      "合理池": {
        "Low": 12,
        "Medium-Low": 12,
        "Medium": 10,
        "Medium-High": 7,
        "High": 4,
        "Very High": 2
      },
      "積極池": {
        "Low": 9,
        "Medium-Low": 9,
        "Medium": 9,
        "Medium-High": 6,
        "High": 3,
        "Very High": 2
      },
      "投機池": {
        "Low": 3,
        "Medium-Low": 2,
        "Medium": 0,
        "Medium-High": 0,
        "High": 0,
        "Very High": 0
      }
    };
    return policy?.[pool]?.[structureRisk] ?? 0;
  }

  function getValidity(pool, structureRisk, months) {
    if (pool === "拒絕池") return "INVALID";
    const allowed = getAllowedMonths(pool, structureRisk);
    if (!allowed) return "INVALID";
    const m = toNumber(months);
    if (m <= allowed) return "OK";
    if (m <= allowed + 2 && pool !== "投機池") return "WARNING";
    return "INVALID";
  }

  function getSymbols(record = {}) {
    const raw = record.symbols || record.basket_symbols || record.underlyings || record.basket || record.stocks || [];
    return Array.isArray(raw)
      ? raw.map(x => typeof x === "string" ? upper(x) : upper(x.symbol || x.ticker)).filter(Boolean)
      : [];
  }

  function getPoolCountsFromRecord(record = {}) {
    return {
      highlight: toNumber(record.highlight ?? record.highlight_count),
      watch: toNumber(record.watch ?? record.watch_count),
      simulation: toNumber(record.simulation ?? record.simulation_count),
      reject: toNumber(record.reject ?? record.reject_count),
      unknown: toNumber(record.unknown ?? record.unknown_count)
    };
  }

  function getFinalLabel(pool, structureRisk, timeLabel = null) {
    const zh = STRUCTURE_LEVEL_ZH[structureRisk] || structureRisk;
    return timeLabel ? `${zh}${pool.replace("池", "")}｜${timeLabel}` : `${zh}${pool.replace("池", "")}`;
  }

  function calcDeltaPct(market, fair) {
    const m = nullableNumber(market);
    const f = nullableNumber(fair);
    if (m === null || f === null || f === 0) return null;
    return ((m / f) - 1) * 100;
  }

  function classifyRegime(deltaPct) {
    const d = nullableNumber(deltaPct);
    if (d === null) return "unknown";
    if (d > 15) return "crazy_risk_on";
    if (d > 5) return "risk_on";
    if (d >= -5) return "fair";
    if (d >= -15) return "tight";
    return "very_tight";
  }

  function buildRiskNote({ pool, structureRisk, timeLabel, validity, marketCoupon, fairYield }) {
    const delta = calcDeltaPct(marketCoupon, fairYield);
    const deltaText = delta === null ? "無法比對 M8" : `Market vs Fair = ${delta.toFixed(1)}%`;

    if (validity === "INVALID") {
      return `${pool} + ${STRUCTURE_LEVEL_ZH[structureRisk] || structureRisk} + ${timeLabel} 超出政策邊界，不建議承做。${deltaText}`;
    }
    if (validity === "WARNING") {
      return `${pool} + ${STRUCTURE_LEVEL_ZH[structureRisk] || structureRisk} + ${timeLabel} 接近時間上限，只適合小部位或需更高超額補償。${deltaText}`;
    }
    return `${pool} + ${STRUCTURE_LEVEL_ZH[structureRisk] || structureRisk} + ${timeLabel} 在政策範圍內，下一步看是否達標與是否優於同池低風險解。${deltaText}`;
  }

  function processRecord(record = {}) {
    const strike = toNumber(record.strike ?? record.Strike ?? record.structure?.Strike ?? record.structure?.strike);
    const ki = toNumber(record.ki ?? record.KI ?? record.structure?.KI ?? record.structure?.ki);
    const tenor = toNumber(record.tenor ?? record.T ?? record.period ?? record.tenor_month ?? record.structure?.T ?? record.structure?.tenor_month);
    const marketCoupon = nullableNumber(record.market_coupon ?? record.market_yield ?? record.coupon_pct ?? record.rate ?? record.evaluation?.market_coupon);
    const fairYield = nullableNumber(record.fair_yield ?? record.m8_fair_yield ?? record.m8?.fair_yield ?? record.evaluation?.fair_yield);

    const compression = applyCompressionRule(strike, ki);
    const strikeRisk = getStrikeRisk(compression.effective_strike);
    const kiRisk = getKIRisk(compression.effective_ki);
    const structureRisk = getStructureRisk(strikeRisk, kiRisk);
    const timeLabel = getTimeLabel(tenor);
    const counts = getPoolCountsFromRecord(record);
    const pool = getBasketPool({ ...counts, external_speculative: record.external_speculative === true });
    const validity = getValidity(pool, structureRisk, tenor);
    const deltaPct = calcDeltaPct(marketCoupon, fairYield);
    const deltaPp = (marketCoupon !== null && fairYield !== null) ? marketCoupon - fairYield : null;

    return {
      ...record,
      symbols: getSymbols(record),
      strike,
      ki,
      tenor,
      market_coupon: marketCoupon,
      fair_yield: fairYield,
      strike_risk: strikeRisk,
      ki_risk: kiRisk,
      strike_risk_zh: STRUCTURE_LEVEL_ZH[strikeRisk] || strikeRisk,
      ki_risk_zh: STRUCTURE_LEVEL_ZH[kiRisk] || kiRisk,
      structure_risk: structureRisk,
      structure_risk_zh: STRUCTURE_LEVEL_ZH[structureRisk] || structureRisk,
      compression_applied: compression.compression_applied,
      effective_strike: compression.effective_strike,
      effective_ki: compression.effective_ki,
      basket_pool: pool,
      time_label: timeLabel,
      validity,
      final_label: getFinalLabel(pool, structureRisk, timeLabel),
      final_label_no_time: getFinalLabel(pool, structureRisk, null),
      delta_pct: deltaPct,
      delta_pp: deltaPp,
      market_regime: classifyRegime(deltaPct),
      risk_note: buildRiskNote({ pool, structureRisk, timeLabel, validity, marketCoupon, fairYield })
    };
  }

  function processRecords(records = []) {
    return (records || []).map(processRecord);
  }

  function buildSegmentStats(records = []) {
    const groups = {};
    processRecords(records).forEach(r => {
      const key = r.final_label_no_time || r.final_label;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });

    return Object.fromEntries(Object.entries(groups).map(([label, rows]) => {
      const market = rows.map(r => r.market_coupon);
      const fair = rows.map(r => r.fair_yield);
      const delta = rows.map(r => r.delta_pct);
      const strike = rows.map(r => r.strike);
      const ki = rows.map(r => r.ki);
      const tenor = rows.map(r => r.tenor);
      const timeMix = {};
      rows.forEach(r => { timeMix[r.time_label] = (timeMix[r.time_label] || 0) + 1; });

      return [label, {
        label,
        count: rows.length,
        market_mean: mean(market),
        market_cv: cv(market),
        fair_mean: mean(fair),
        fair_cv: cv(fair),
        delta_mean: mean(delta),
        delta_cv: cv(delta),
        strike_mean: mean(strike),
        strike_cv: cv(strike),
        ki_mean: mean(ki),
        ki_cv: cv(ki),
        tenor_mean: mean(tenor),
        tenor_cv: cv(tenor),
        time_mix: timeMix,
        records: rows
      }];
    }));
  }

  return {
    STRUCTURE_LEVELS,
    STRUCTURE_LEVEL_ZH,
    BASKET_POOLS,
    TIME_LABELS,
    POOL_TARGET_RATE,
    getStrikeRisk,
    getKIRisk,
    applyCompressionRule,
    getStructureRisk,
    getTimeLabel,
    getBasketPool,
    getAllowedMonths,
    getValidity,
    getFinalLabel,
    process: processRecord,
    processRecord,
    processRecords,
    buildSegmentStats,
    mean,
    cv
  };
})();
