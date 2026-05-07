// ============================================================================
// MM FCN Simulating & Allocating Engine v2.1
// File: js/mm/modules/mm_fcn_simulating_allocating_engine_v2.js
// Purpose:
//   Adds explainable FCN classification + 6 Final Label statistic cards.
//   It does NOT replace mm_filter.js. It is an intelligence/rendering layer.
// ============================================================================

window.MMFCNEngineV2 = (() => {
  const FINAL_LABELS = [
    "保守單",
    "高風險保守單",
    "合理單",
    "高風險合理單",
    "積極單",
    "不建議承做"
  ];

  const FINAL_LABEL_DEFINITIONS = {
    "保守單": "Worst-of 標的以 Highlight 為主，最多 1 檔 Watch、0 檔 Simulation，且 FCN 結構不是高壓條件。",
    "高風險保守單": "股票 basket 屬保守或高品質，但 FCN 結構偏進攻，例如 Strike/KI 偏高或天期偏長；不能視為純保守單。",
    "合理單": "允許 Watch 混合，最多 1 檔 Simulation，收益與 worst-of 風險相對平衡。",
    "高風險合理單": "Basket 屬合理單，但 Strike/KI/天期偏進攻；需要用 M8 Fair Yield 與 portfolio fit 再確認。",
    "積極單": "含較多 Watch / Simulation / high-vol booster，以 coupon 為優先，接受較高 worst-of 風險。",
    "不建議承做": "超過既定 basket boundary，或資料不足、M8/fair check 不合格，暫不建議承做。"
  };

  function toNumber(v, d = 0) {
    const x = Number(v);
    return Number.isFinite(x) ? x : d;
  }

  function firstFinite(values, d = null) {
    for (const v of values || []) {
      const x = Number(v);
      if (Number.isFinite(x)) return x;
    }
    return d;
  }

  function upper(x) {
    return String(x || "").trim().toUpperCase();
  }

  function arr(v) {
    return Array.isArray(v) ? v : [];
  }

  function clean(values) {
    return arr(values).map(Number).filter(Number.isFinite);
  }

  function mean(values) {
    const xs = clean(values);
    if (!xs.length) return null;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  }

  function std(values) {
    const xs = clean(values);
    if (xs.length <= 1) return 0;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((s, x) => s + Math.pow(x - m, 2), 0) / xs.length);
  }

  function cv(values) {
    const xs = clean(values);
    const m = mean(xs);
    if (!m) return null;
    return std(xs) / Math.abs(m);
  }

  function fmt(v, digits = 2) {
    const x = Number(v);
    return Number.isFinite(x) ? x.toFixed(digits) : "-";
  }

  function pct(v, digits = 2) {
    const x = Number(v);
    return Number.isFinite(x) ? `${x.toFixed(digits)}%` : "-";
  }

  function month(v) {
    const x = Number(v);
    return Number.isFinite(x) ? `${x.toFixed(1)}M` : "-";
  }

  function getSymbols(record = {}) {
    return arr(record.symbols || record.basket_symbols || record.underlyings || record.basket || record.stocks)
      .map(x => typeof x === "string" ? upper(x) : upper(x.symbol || x.ticker))
      .filter(Boolean);
  }

  function getMarketCoupon(record = {}) {
    return firstFinite([
      record.market_coupon,
      record.market_yield,
      record.coupon_pct,
      record.coupon,
      record.rate,
      record.marketRate,
      record.market_rate,
      record.evaluation?.market_coupon
    ], null);
  }

  function getFairYield(record = {}) {
    return firstFinite([
      record.fair_yield,
      record.m8_fair_yield,
      record.fairYield,
      record.m8?.fair_yield,
      record.evaluation?.fair_yield
    ], null);
  }

  function getStrike(record = {}) {
    return firstFinite([record.strike, record.Strike, record.structure?.Strike, record.structure?.strike], null);
  }

  function getKI(record = {}) {
    return firstFinite([record.ki, record.KI, record.structure?.KI, record.structure?.ki], null);
  }

  function getTenor(record = {}) {
    return firstFinite([record.tenor, record.period, record.T, record.tenor_month, record.structure?.T, record.structure?.tenor, record.structure?.tenor_month], null);
  }

  function inferPoolType(symbol, poolMap = {}, record = {}) {
    const s = upper(symbol);
    const direct = poolMap[s] || record.pool_by_symbol?.[s] || record.poolMap?.[s];
    if (direct) return String(direct).toLowerCase();

    const basket = arr(record.basket || record.stocks);
    const found = basket.find(x => upper(x.symbol || x.ticker) === s);
    if (found?.pool_type || found?.pool) return String(found.pool_type || found.pool).toLowerCase();

    return "unknown";
  }

  function buildPoolMapFromFilterResult(filterResult = {}) {
    const out = {};
    ["highlight", "watch", "simulation", "reject"].forEach(pool => {
      arr(filterResult.pools?.[pool]).forEach(row => {
        const s = upper(row.symbol || row.ticker);
        if (s) out[s] = pool;
      });
    });
    return out;
  }

  function calcComposition(record = {}, poolMap = {}) {
    const symbols = getSymbols(record);
    let h = toNumber(record.highlight_count, 0);
    let w = toNumber(record.watch_count, 0);
    let s = toNumber(record.simulation_count, 0);
    let u = 0;

    if (!h && !w && !s && symbols.length) {
      symbols.forEach(sym => {
        const pool = inferPoolType(sym, poolMap, record);
        if (["highlight", "today_highlight", "today highlight"].includes(pool)) h += 1;
        else if (pool === "watch") w += 1;
        else if (pool === "simulation") s += 1;
        else u += 1;
      });
    }

    return { highlight_count: h, watch_count: w, simulation_count: s, unknown_count: u, total_count: symbols.length };
  }

  function classifyBasketStyle(composition = {}) {
    const h = toNumber(composition.highlight_count, 0);
    const w = toNumber(composition.watch_count, 0);
    const s = toNumber(composition.simulation_count, 0);
    const total = toNumber(composition.total_count, h + w + s);

    if (total <= 0) return "invalid";
    if (s > 2) return "invalid";
    if (h >= 2 && w <= 1 && s === 0) return "conservative";
    if (s <= 1 && w <= 2) return "rational";
    if (s <= 2) return "aggressive";
    return "invalid";
  }

  function classifyWorstOf(composition = {}) {
    const w = toNumber(composition.watch_count, 0);
    const s = toNumber(composition.simulation_count, 0);
    if (s >= 2) return "simulation_heavy";
    if (s === 1) return "simulation_mixed";
    if (w >= 2) return "watch_heavy";
    if (w === 1) return "watch_mixed";
    return "highlight_heavy";
  }

  function classifyStructureAdj(record = {}) {
    const strike = toNumber(getStrike(record), 0);
    const ki = toNumber(getKI(record), 0);
    const tenor = toNumber(getTenor(record), 0);

    if (strike >= 75 || ki >= 75 || tenor >= 15) return "extreme_adj";
    if (strike >= 70 || ki >= 70 || tenor >= 9) return "high_adj";
    if (strike >= 60 || ki >= 60 || tenor >= 6) return "mid_adj";
    return "low_adj";
  }

  function buildFinalLabel({ basketStyle, adj }) {
    if (basketStyle === "invalid" || adj === "extreme_adj") return "不建議承做";
    if (basketStyle === "conservative" && ["low_adj", "mid_adj"].includes(adj)) return "保守單";
    if (basketStyle === "conservative" && adj === "high_adj") return "高風險保守單";
    if (basketStyle === "rational" && ["low_adj", "mid_adj"].includes(adj)) return "合理單";
    if (basketStyle === "rational" && adj === "high_adj") return "高風險合理單";
    if (basketStyle === "aggressive") return "積極單";
    return "不建議承做";
  }

  function calcDeltaPct({ market, fair }) {
    const m = Number(market);
    const f = Number(fair);
    if (!Number.isFinite(m) || !Number.isFinite(f) || f === 0) return null;
    return ((m / f) - 1) * 100;
  }

  function classifyMarketRegime(deltaPct) {
    const d = Number(deltaPct);
    if (!Number.isFinite(d)) return "unknown";
    if (d > 15) return "crazy_risk_on";
    if (d > 5) return "risk_on";
    if (d >= -5) return "fair";
    if (d >= -15) return "tight";
    return "very_tight";
  }

  function buildDefinition({ finalLabel, basketStyle, worstOf, adj, composition }) {
    const comp = `${composition.highlight_count}H/${composition.watch_count}W/${composition.simulation_count}S`;
    return `${FINAL_LABEL_DEFINITIONS[finalLabel] || ""}｜${comp}｜Basket=${basketStyle}｜Worst-of=${worstOf}｜Adj=${adj}`;
  }

  function classifyRecord(record = {}, context = {}) {
    const poolMap = context.poolMap || {};
    const symbols = getSymbols(record);
    const composition = calcComposition(record, poolMap);
    const basketStyle = classifyBasketStyle(composition);
    const worstOf = classifyWorstOf(composition);
    const structureAdj = classifyStructureAdj(record);
    const finalLabel = buildFinalLabel({ basketStyle, adj: structureAdj });
    const market = getMarketCoupon(record);
    const fair = getFairYield(record);
    const delta_pct = calcDeltaPct({ market, fair });
    const delta_pp = market !== null && fair !== null ? market - fair : null;

    return {
      ...record,
      symbols,
      market_coupon: market,
      fair_yield: fair,
      strike: getStrike(record),
      ki: getKI(record),
      tenor: getTenor(record),
      ...composition,
      basket_style: basketStyle,
      worst_of: worstOf,
      worst_of_quality: worstOf,
      structure_adj: structureAdj,
      adj: structureAdj,
      final_label: finalLabel,
      definition: buildDefinition({ finalLabel, basketStyle, worstOf, adj: structureAdj, composition }),
      delta_pct,
      delta_pp,
      market_regime: classifyMarketRegime(delta_pct)
    };
  }

  function topSymbols(records = [], limit = 3) {
    const counts = {};
    records.forEach(r => getSymbols(r).forEach(s => { counts[s] = (counts[s] || 0) + 1; }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([symbol, count]) => ({ symbol, count }));
  }

  function buildSegmentStats(records = []) {
    const out = {};
    FINAL_LABELS.forEach(label => {
      const rows = records.filter(r => r.final_label === label);
      const market = rows.map(r => r.market_coupon);
      const fair = rows.map(r => r.fair_yield);
      const deltaPct = rows.map(r => r.delta_pct);
      const deltaPp = rows.map(r => r.delta_pp);
      const strike = rows.map(r => r.strike);
      const ki = rows.map(r => r.ki);
      const tenor = rows.map(r => r.tenor);

      out[label] = {
        label,
        definition: FINAL_LABEL_DEFINITIONS[label],
        count: rows.length,
        market_rate_mean: mean(market),
        market_rate_cv: cv(market),
        market_mean: mean(market),
        coupon_cv: cv(market),
        market_best: rows.length ? Math.max(...clean(market)) : null,
        best_market_rate: rows.length ? Math.max(...clean(market)) : null,
        fair_rate_mean: mean(fair),
        fair_rate_cv: cv(fair),
        fair_mean: mean(fair),
        delta_mean_pct: mean(deltaPct),
        delta_cv_pct: cv(deltaPct),
        delta_mean: mean(deltaPct),
        delta_cv: cv(deltaPct),
        delta_mean_pp: mean(deltaPp),
        strike_mean: mean(strike),
        strike_cv: cv(strike),
        ki_mean: mean(ki),
        ki_cv: cv(ki),
        period_mean: mean(tenor),
        period_cv: cv(tenor),
        tenor_mean: mean(tenor),
        tenor_cv: cv(tenor),
        top_symbol_objects: topSymbols(rows, 3),
        top_symbols: topSymbols(rows, 3).map(x => x.symbol),
        records: rows
      };
    });
    return out;
  }

  function renderFinalLabelCards(stats = {}, options = {}) {
    const open = options.showDetailsDefault ? "open" : "";
    return `<div class="final-label-grid">${FINAL_LABELS.map(label => {
      const s = stats[label] || {};
      const top = arr(s.top_symbols).map(x => typeof x === "string" ? x : x.symbol).join(" / ") || "-";
      const isCons = label === "保守單";
      return `<div class="final-label-card">
        <div class="final-label-title">${label}</div>
        <div class="final-label-definition">${s.definition || FINAL_LABEL_DEFINITIONS[label]}</div>
        <div class="final-label-main-row">
          <div><div class="mini-label">Count</div><div class="mini-value">${toNumber(s.count, 0)}</div></div>
          <div><div class="mini-label">Market Rate mean / CV</div><div class="mini-value">${pct(s.market_rate_mean)} / ${fmt(s.market_rate_cv)}</div></div>
          <div><div class="mini-label">Delta vs Fair</div><div class="mini-value">${pct(s.delta_mean_pct)} <span class="muted">(${fmt(s.delta_mean_pp)}pp)</span></div></div>
        </div>
        ${isCons ? `<div class="final-label-highlight">保守單 Best Market Rate：<b>${pct(s.best_market_rate)}</b></div>` : ""}
        <div class="final-label-top">Top：${top}</div>
        <details class="final-label-detail" ${open}>
          <summary>展開 mean / CV</summary>
          <div class="metric-line"><span>Fair Rate</span><b>${pct(s.fair_rate_mean)}</b><em>CV ${fmt(s.fair_rate_cv)}</em></div>
          <div class="metric-line"><span>Strike</span><b>${fmt(s.strike_mean)}</b><em>CV ${fmt(s.strike_cv)}</em></div>
          <div class="metric-line"><span>KI</span><b>${fmt(s.ki_mean)}</b><em>CV ${fmt(s.ki_cv)}</em></div>
          <div class="metric-line"><span>Period</span><b>${month(s.period_mean)}</b><em>CV ${fmt(s.period_cv)}</em></div>
        </details>
      </div>`;
    }).join("")}</div>`;
  }

  function renderClassificationTable(records = []) {
    return `<div class="table-wrap"><table class="mm-fcn-classification-table">
      <thead><tr><th>Final Label</th><th>Definition</th><th>Basket</th><th>Worst-of</th><th>Adj</th><th>Comp</th><th>Market</th><th>Fair(M8)</th><th>Delta</th><th>Strike</th><th>KI</th><th>Period</th><th>Symbols</th></tr></thead>
      <tbody>${records.map(r => `<tr>
        <td><b>${r.final_label}</b></td><td>${r.definition}</td><td>${r.basket_style}</td><td>${r.worst_of}</td><td>${r.structure_adj}</td><td>${r.highlight_count}H/${r.watch_count}W/${r.simulation_count}S</td>
        <td>${pct(r.market_coupon)}</td><td>${pct(r.fair_yield)}</td><td>${pct(r.delta_pct)} (${fmt(r.delta_pp)}pp)</td>
        <td>${fmt(r.strike)}</td><td>${fmt(r.ki)}</td><td>${month(r.tenor)}</td><td>${arr(r.symbols).join(" / ")}</td>
      </tr>`).join("")}</tbody></table></div>`;
  }

  function getStyleTag() {
    return `<style>
.final-label-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.final-label-card{background:var(--panel2,#202634);border:1px solid var(--line,#30384a);border-radius:16px;padding:14px}
.final-label-title{font-weight:900;font-size:18px;margin-bottom:6px}
.final-label-definition{color:var(--muted,#aab5c8);font-size:12px;line-height:1.5;min-height:54px}
.final-label-main-row{display:grid;grid-template-columns:72px 1fr 1fr;gap:10px;margin-top:12px}
.mini-label{font-size:11px;color:var(--muted,#aab5c8);font-weight:800}
.mini-value{font-size:15px;font-weight:900;margin-top:4px}
.final-label-highlight{margin-top:10px;padding:8px 10px;border-radius:12px;background:rgba(52,211,153,.12);color:var(--green,#34d399);font-size:13px}
.final-label-top{margin-top:10px;font-size:12px;color:var(--muted,#aab5c8)}
.final-label-detail{margin-top:10px}
.final-label-detail summary{cursor:pointer;font-size:12px;color:var(--blue,#4da3ff);font-weight:900}
.metric-line{display:grid;grid-template-columns:80px 1fr 80px;gap:8px;padding:6px 0;border-bottom:1px dashed var(--line,#30384a);font-size:12px}
.metric-line em{color:var(--muted,#aab5c8);font-style:normal}.muted{color:var(--muted,#aab5c8);font-size:11px}
@media(max-width:1100px){.final-label-grid{grid-template-columns:1fr 1fr}}@media(max-width:760px){.final-label-grid{grid-template-columns:1fr}}
</style>`;
  }

  function processMarketRecords(records = [], context = {}) {
    const poolMap = context.poolMap || buildPoolMapFromFilterResult(context.filterResult || {});
    const enriched = arr(records).map(r => classifyRecord(r, { ...context, poolMap }));
    const stats = buildSegmentStats(enriched);
    return {
      records: enriched,
      stats,
      cards_html: renderFinalLabelCards(stats, context.render_options || {}),
      table_html: renderClassificationTable(enriched),
      style_html: getStyleTag()
    };
  }

  function processSimulationRuns(runs = [], context = {}) {
    const records = arr(runs).map(run => ({
      record_id: run.run_id,
      symbols: run.symbols || arr(run.basket).map(x => x.symbol),
      basket: run.basket,
      market_coupon: run.evaluation?.market_coupon,
      fair_yield: run.evaluation?.fair_yield,
      strike: run.structure?.Strike ?? run.structure?.strike,
      ki: run.structure?.KI ?? run.structure?.ki,
      tenor: run.structure?.T ?? run.structure?.tenor ?? run.structure?.tenor_month,
      type: run.structure?.type,
      result: run.evaluation?.result
    }));
    return processMarketRecords(records, context);
  }



  function getBarrierType(record = {}) {
    return String(record.barrier_type || record.type || record.structure?.type || "AKI").toUpperCase();
  }

  function getTenorBucket(record = {}) {
    const t = Number(record.tenor ?? getTenor(record));
    if (!Number.isFinite(t)) return "unknown";
    if (t <= 6) return "0-6M";
    if (t <= 9) return "6-9M";
    if (t <= 12) return "9-12M";
    return "12M+";
  }

  function buildAppleToAppleStats(records = []) {
    const groups = {};
    arr(records).forEach(r => {
      const key = [
        r.final_label || "unknown",
        r.basket_style || "unknown",
        r.structure_adj || "unknown",
        getTenorBucket(r),
        getBarrierType(r)
      ].join("__");
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });

    return Object.entries(groups).map(([key, rows]) => {
      const [finalLabel, basketStyle, structureAdj, tenorBucket, barrierType] = key.split("__");
      const market = rows.map(r => r.market_coupon);
      const fair = rows.map(r => r.fair_yield);
      const delta = rows.map(r => r.delta_pct);
      const deltaMean = mean(delta);
      return {
        key,
        final_label: finalLabel,
        basket_style: basketStyle,
        structure_adj: structureAdj,
        tenor_bucket: tenorBucket,
        barrier_type: barrierType,
        count: rows.length,
        market_mean: mean(market),
        fair_mean: mean(fair),
        delta_mean: deltaMean,
        delta_cv: cv(delta),
        regime: classifyMarketRegime(deltaMean),
        records: rows
      };
    }).sort((a, b) => (b.count || 0) - (a.count || 0));
  }

  function process(records = [], context = {}) {
    const poolMap = context.poolMap || buildPoolMapFromFilterResult(context.filterResult || {});
    const enriched = arr(records).map(r => classifyRecord(r, { ...context, poolMap }));
    const stats = buildSegmentStats(enriched);
    const appleToApple = buildAppleToAppleStats(enriched);
    return {
      records: enriched,
      stats,
      apple_to_apple: appleToApple,
      cards_html: renderFinalLabelCards(stats, context.render_options || {}),
      table_html: renderClassificationTable(enriched),
      style_html: getStyleTag()
    };
  }

  return {
    FINAL_LABELS,
    FINAL_LABEL_DEFINITIONS,
    classifyRecord,
    classifyBasketStyle,
    classifyWorstOf,
    classifyStructureAdj,
    buildFinalLabel,
    buildSegmentStats,
    buildAppleToAppleStats,
    process,
    processMarketRecords,
    processSimulationRuns,
    renderFinalLabelCards,
    renderClassificationTable,
    getStyleTag,
    buildPoolMapFromFilterResult
  };
})();
