// ============================================================================
// MM FCN Simulating & Allocating Engine v2
// File:
// js/mm/modules/mm_fcn_simulating_allocating_engine_v2.js
// ============================================================================

window.MMFCNEngineV2 = (() => {

  // ==========================================================================
  // CONFIG
  // ==========================================================================

  const FINAL_LABELS = [
    "保守單",
    "高風險保守單",
    "合理單",
    "高風險合理單",
    "積極單",
    "不建議承做"
  ];

  // ==========================================================================
  // UTILS
  // ==========================================================================

  function mean(arr = []) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function std(arr = []) {
    if (arr.length <= 1) return 0;

    const m = mean(arr);

    return Math.sqrt(
      arr.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) /
      arr.length
    );
  }

  function cv(arr = []) {
    const m = mean(arr);

    if (!m) return 0;

    return std(arr) / m;
  }

  function pct(v) {
    return `${Number(v || 0).toFixed(1)}%`;
  }

  function num(v) {
    return Number(v || 0).toFixed(2);
  }

  // ==========================================================================
  // MARKET CLASSIFIER
  // ==========================================================================

  function classifyBasketStyle({
    highlightCount = 0,
    watchCount = 0,
    simulationCount = 0
  }) {

    if (simulationCount > 2) {
      return "invalid";
    }

    if (
      highlightCount >= 2 &&
      watchCount <= 1 &&
      simulationCount === 0
    ) {
      return "conservative";
    }

    if (
      watchCount <= 2 &&
      simulationCount <= 1
    ) {
      return "rational";
    }

    return "aggressive";
  }

  function classifyWorstOf({
    watchCount = 0,
    simulationCount = 0
  }) {

    if (simulationCount >= 1) {
      return "simulation_heavy";
    }

    if (watchCount >= 1) {
      return "watch_mixed";
    }

    return "highlight_heavy";
  }

  function classifyAdj({
    strike = 70,
    ki = 70,
    tenor = 12
  }) {

    if (
      strike >= 75 ||
      ki >= 75 ||
      tenor >= 15
    ) {
      return "extreme_adj";
    }

    if (
      strike >= 70 ||
      ki >= 70 ||
      tenor >= 9
    ) {
      return "high_adj";
    }

    if (
      strike >= 60 ||
      ki >= 60
    ) {
      return "mid_adj";
    }

    return "low_adj";
  }

  function buildFinalLabel({
    basketStyle,
    adj
  }) {

    if (basketStyle === "invalid") {
      return "不建議承做";
    }

    if (
      basketStyle === "conservative" &&
      (adj === "low_adj" || adj === "mid_adj")
    ) {
      return "保守單";
    }

    if (
      basketStyle === "conservative" &&
      adj === "high_adj"
    ) {
      return "高風險保守單";
    }

    if (
      basketStyle === "rational" &&
      (adj === "low_adj" || adj === "mid_adj")
    ) {
      return "合理單";
    }

    if (
      basketStyle === "rational" &&
      adj === "high_adj"
    ) {
      return "高風險合理單";
    }

    return "積極單";
  }

  function buildDefinition({
    basketStyle,
    worstOf,
    adj
  }) {

    return `
Basket=${basketStyle}
WorstOf=${worstOf}
Adj=${adj}
`.trim();
  }

  // ==========================================================================
  // MARKET VS FAIR(M8)
  // ==========================================================================

  function calcDelta({
    market = 0,
    fair = 0
  }) {

    if (!fair) return 0;

    return ((market / fair) - 1) * 100;
  }

  function classifyMarketRegime(delta) {

    if (delta > 15) {
      return "crazy_risk_on";
    }

    if (delta > 5) {
      return "risk_on";
    }

    if (delta >= -5) {
      return "fair";
    }

    if (delta >= -15) {
      return "tight";
    }

    return "very_tight";
  }

  // ==========================================================================
  // SEGMENT ENGINE
  // ==========================================================================

  function buildSegmentStats(records = []) {

    const grouped = {};

    FINAL_LABELS.forEach(label => {
      grouped[label] = [];
    });

    records.forEach(r => {
      grouped[r.final_label] ||= [];
      grouped[r.final_label].push(r);
    });

    const result = {};

    Object.entries(grouped).forEach(([label, rows]) => {

      const marketArr = rows.map(x => x.market_coupon || 0);
      const fairArr = rows.map(x => x.fair_yield || 0);
      const strikeArr = rows.map(x => x.strike || 0);
      const kiArr = rows.map(x => x.ki || 0);
      const tenorArr = rows.map(x => x.tenor || 0);

      const deltaArr = rows.map(x =>
        calcDelta({
          market: x.market_coupon,
          fair: x.fair_yield
        })
      );

      const symbols = [];

      rows.forEach(r => {
        (r.symbols || []).forEach(s => {
          symbols.push(s);
        });
      });

      const topSymbols = [...new Set(symbols)].slice(0, 3);

      result[label] = {
        count: rows.length,

        market_mean: mean(marketArr),
        fair_mean: mean(fairArr),
        delta_mean: mean(deltaArr),

        coupon_cv: cv(marketArr),

        strike_mean: mean(strikeArr),
        strike_cv: cv(strikeArr),

        ki_mean: mean(kiArr),
        ki_cv: cv(kiArr),

        tenor_mean: mean(tenorArr),
        tenor_cv: cv(tenorArr),

        top_symbols: topSymbols
      };
    });

    return result;
  }

  // ==========================================================================
  // CARD RENDER
  // ==========================================================================

  function renderSegmentCards(stats) {

    return `
<div class="mm-segment-grid">

${Object.entries(stats).map(([label, s]) => {

  return `
<div class="mm-segment-card">

  <div class="seg-title">
    ${label}
  </div>

  <div class="seg-row">
    <span>Count</span>
    <span>${s.count}</span>
  </div>

  <div class="seg-row">
    <span>Top</span>
    <span>${s.top_symbols.join(" / ")}</span>
  </div>

  <hr>

  <div class="seg-row">
    <span>Market Mean</span>
    <span>${pct(s.market_mean)}</span>
  </div>

  <div class="seg-row">
    <span>Fair Mean</span>
    <span>${pct(s.fair_mean)}</span>
  </div>

  <div class="seg-row">
    <span>Delta Mean</span>
    <span>${pct(s.delta_mean)}</span>
  </div>

  <div class="seg-row">
    <span>Coupon CV</span>
    <span>${num(s.coupon_cv)}</span>
  </div>

  <hr>

  <div class="seg-table">

    <div class="seg-table-row">
      <span>Strike</span>
      <span>${num(s.strike_mean)}</span>
      <span>${num(s.strike_cv)}</span>
    </div>

    <div class="seg-table-row">
      <span>KI</span>
      <span>${num(s.ki_mean)}</span>
      <span>${num(s.ki_cv)}</span>
    </div>

    <div class="seg-table-row">
      <span>Tenor</span>
      <span>${num(s.tenor_mean)}M</span>
      <span>${num(s.tenor_cv)}</span>
    </div>

  </div>

</div>
`;
}).join("")}

</div>
`;
  }

  // ==========================================================================
  // TABLE RENDER
  // ==========================================================================

  function renderClassificationTable(records = []) {

    return `
<table class="mm-table">

<thead>
<tr>
  <th>Basket</th>
  <th>Worst-of</th>
  <th>Adj</th>
  <th>Final Label</th>
  <th>Definition</th>
  <th>Market</th>
  <th>Fair(M8)</th>
  <th>Delta</th>
</tr>
</thead>

<tbody>

${records.map(r => {

  const delta = calcDelta({
    market: r.market_coupon,
    fair: r.fair_yield
  });

  return `
<tr>

<td>${r.basket_style}</td>
<td>${r.worst_of}</td>
<td>${r.adj}</td>
<td>${r.final_label}</td>
<td>${r.definition}</td>

<td>${pct(r.market_coupon)}</td>
<td>${pct(r.fair_yield)}</td>
<td>${pct(delta)}</td>

</tr>
`;
}).join("")}

</tbody>
</table>
`;
  }

  // ==========================================================================
  // MAIN ENGINE
  // ==========================================================================

  function process(records = []) {

    const enriched = records.map(r => {

      const basketStyle = classifyBasketStyle({
        highlightCount: r.highlight_count,
        watchCount: r.watch_count,
        simulationCount: r.simulation_count
      });

      const worstOf = classifyWorstOf({
        watchCount: r.watch_count,
        simulationCount: r.simulation_count
      });

      const adj = classifyAdj({
        strike: r.strike,
        ki: r.ki,
        tenor: r.tenor
      });

      const finalLabel = buildFinalLabel({
        basketStyle,
        adj
      });

      const definition = buildDefinition({
        basketStyle,
        worstOf,
        adj
      });

      const delta = calcDelta({
        market: r.market_coupon,
        fair: r.fair_yield
      });

      const marketRegime =
        classifyMarketRegime(delta);

      return {
        ...r,

        basket_style: basketStyle,
        worst_of: worstOf,
        adj,

        final_label: finalLabel,
        definition,

        delta,
        market_regime: marketRegime
      };
    });

    const stats =
      buildSegmentStats(enriched);

    return {
      records: enriched,
      stats,

      cards_html:
        renderSegmentCards(stats),

      table_html:
        renderClassificationTable(enriched)
    };
  }

  // ==========================================================================
  // PUBLIC
  // ==========================================================================

  return {
    process
  };

})();
