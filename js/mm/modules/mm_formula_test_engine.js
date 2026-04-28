/*
  M7 Formula Test Engine
  Path in repo: js/mm/modules/mm_formula_test_engine.js

  Purpose:
  - Independent formula debug page for M7 what-if calculation.
  - Does NOT modify data files.
  - Does NOT re-rank or re-normalize cross-stock distribution during what-if.
  - Missing sub-factors use fallback rules and are explicitly shown in trace.
*/

(function () {
  "use strict";

  const DATA_PATHS = {
    scores: "../data/m7_sandbox/m7_v2_scores.json",
    compare: "../data/m7_sandbox/m7_v2_ab_compare.json",
    manifest: "../data/m7_sandbox/m7_v2_run_manifest.json",
    runtime: "../data/market_runtime.json",
    fundamentals: "../data/m7/m7_fundamental_data.json"
  };

  const DEFAULT_PARAMS = Object.freeze({
    raw_valuation_weight: 0.30,
    raw_trend_weight: 0.25,
    raw_structure_weight: 0.20,
    raw_timing_weight: 0.10,
    raw_money_weight: 0.10,

    trend_linear_weight: 0.50,
    trend_acceleration_weight: 0.20,
    trend_ma100_weight: 0.30,

    money_volume_weight: 0.70,
    money_top_weight: 0.30,

    top_adjustment_weight: 1.00,
    top_adjustment_cap: 1.50
  });

  const PARAM_DEFS = [
    ["raw_valuation_weight", "M7 Raw - Valuation Weight", 0, 0.60, 0.01],
    ["raw_trend_weight", "M7 Raw - Trend Weight", 0, 0.60, 0.01],
    ["raw_structure_weight", "M7 Raw - Structure Weight", 0, 0.60, 0.01],
    ["raw_timing_weight", "M7 Raw - Timing Weight", 0, 0.40, 0.01],
    ["raw_money_weight", "M7 Raw - Money Weight", 0, 0.40, 0.01],
    ["trend_linear_weight", "Trend - Linear Slope Weight", 0, 1, 0.01],
    ["trend_acceleration_weight", "Trend - Acceleration Weight", 0, 1, 0.01],
    ["trend_ma100_weight", "Trend - MA100 / 20W Weight", 0, 1, 0.01],
    ["money_volume_weight", "Money - Volume Flow Weight", 0, 1, 0.01],
    ["money_top_weight", "Money - Top Signal Weight", 0, 1, 0.01],
    ["top_adjustment_weight", "Final - Top Adjustment Weight", 0, 2, 0.01],
    ["top_adjustment_cap", "Final - Top Adjustment Cap", 0, 3, 0.05]
  ];

  const state = {
    scores: [],
    compare: [],
    manifest: null,
    runtime: [],
    fundamentals: [],
    selectedSymbol: null,
    params: { ...DEFAULT_PARAMS },
    decimals: 2
  };

  const $ = (id) => document.getElementById(id);

  function num(v, fallback = null) {
    const x = Number(v);
    return Number.isFinite(x) ? x : fallback;
  }

  function clamp(x, lo, hi) {
    const n = num(x, 0);
    return Math.max(lo, Math.min(hi, n));
  }

  function fmt(v, d = state.decimals) {
    const x = num(v, null);
    if (x === null) return "--";
    return x.toFixed(d);
  }

  function deltaClass(v) {
    const x = num(v, 0);
    if (Math.abs(x) < 0.00001) return "zero";
    return x > 0 ? "pos" : "neg";
  }

  function field(row, keys, fallback = null) {
    if (!row) return fallback;
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
    }
    return fallback;
  }

  function symbolOf(row) {
    return String(field(row, ["symbol", "ticker", "Symbol"], "")).toUpperCase();
  }

  function asArray(payload) {
  if (Array.isArray(payload)) return payload;

  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && Array.isArray(payload.scores)) return payload.scores;
  if (payload && Array.isArray(payload.items)) return payload.items;
  if (payload && Array.isArray(payload.rows)) return payload.rows;
  if (payload && Array.isArray(payload.results)) return payload.results;
  if (payload && Array.isArray(payload.records)) return payload.records;

  if (payload && typeof payload === "object") {
    const values = Object.values(payload);

    const firstArray = values.find(v => Array.isArray(v));
    if (firstArray) return firstArray;

    if (
      values.length &&
      values.every(v => v && typeof v === "object" && !Array.isArray(v))
    ) {
      return values;
    }
  }

  return [];
}

  async function loadJson(path, optional = false) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      if (optional) return null;
      throw new Error(`Load failed: ${path} / ${err.message}`);
    }
  }

  function findBySymbol(arr, sym) {
    const s = String(sym || "").toUpperCase();
    return arr.find(x => symbolOf(x) === s) || null;
  }

  function getRows() {
    return state.scores.map(row => {
      const sym = symbolOf(row);
      const cmp = findBySymbol(state.compare, sym);
      const rt = findBySymbol(state.runtime, sym);
      const fd = findBySymbol(state.fundamentals, sym);
      return { row, cmp, rt, fd, sym };
    }).filter(x => x.sym);
  }

  function getBaseScores(ctx) {
    const { row, cmp } = ctx;
    const valuation = num(field(row, ["valuation_score", "valuation", "m7_valuation_score"], field(cmp, ["valuation_score"])), 0);
    const trend = num(field(row, ["trend_score", "trend", "m7_trend_score"], field(cmp, ["trend_score"])), 0);
    const structure = num(field(row, ["structure_score", "structure", "m7_structure_score"], field(cmp, ["structure_score"])), 0);
    const timing = num(field(row, ["timing_score", "timing", "event_score", "short_swing_score"], field(cmp, ["timing_score"])), 0);
    const money = num(field(row, ["money_score", "money", "flow_score"], field(cmp, ["money_score"])), 0);
    const top = num(field(row, ["top_score", "top_adjustment", "compare_adjustment", "zscore_adjustment"], field(cmp, ["top_score", "top_adjustment", "compare_adjustment"])), 0);
    const m7Now = num(field(row, ["m7_v2_score", "m7_final_score", "final_score", "score"], field(cmp, ["m7_v2_score", "m7_final_score", "score"])), null);
    return { valuation, trend, structure, timing, money, top, m7Now };
  }

  function normalizeWeights(obj, keys) {
    const vals = keys.map(k => Math.max(0, num(obj[k], 0)));
    const sum = vals.reduce((a, b) => a + b, 0);
    if (sum <= 0) {
      const equal = 1 / keys.length;
      return Object.fromEntries(keys.map(k => [k, equal]));
    }
    return Object.fromEntries(keys.map((k, i) => [k, vals[i] / sum]));
  }

  function scoreFromRawFactor(value, fallbackScore, scale, center = 0) {
    const v = num(value, null);
    if (v === null) return { score: fallbackScore, usedFallback: true };
    return { score: clamp((v - center) * scale + 5, 0, 10), usedFallback: false };
  }

  function computeTrend(ctx, base, params) {
    const { row, rt } = ctx;
    const audit = [];

    const linearDirect = num(field(row, ["trend_linear_score", "linear_trend_score", "long_term_linear_score"], null), null);
    const accelDirect = num(field(row, ["trend_acceleration_score", "acceleration_score", "quadratic_acceleration_score"], null), null);
    const maDirect = num(field(row, ["trend_ma100_score", "ma100_score", "ma20w_score", "ma_trend_score"], null), null);

    let linear = linearDirect;
    if (linear === null) {
      const slope = field(row, ["linear_slope", "trend_linear_slope", "structure_slope"], null);
      const res = scoreFromRawFactor(slope, base.trend, 500, 0);
      linear = res.score;
      audit.push(res.usedFallback ? "trend.linear: missing raw slope; fallback to current trend_score" : "trend.linear: derived from slope");
    } else audit.push("trend.linear: direct score field used");

    let accel = accelDirect;
    if (accel === null) {
      const qa = field(row, ["quadratic_a", "trend_quadratic_a", "acceleration"], null);
      const res = scoreFromRawFactor(qa, base.trend, 50000, 0);
      accel = res.score;
      audit.push(res.usedFallback ? "trend.acceleration: missing acceleration factor; fallback to current trend_score" : "trend.acceleration: derived from quadratic_a");
    } else audit.push("trend.acceleration: direct score field used");

    let ma = maDirect;
    if (ma === null) {
      const ret6m = field(row, ["ret_6m"], field(rt, ["ret_6m"], null));
      const ret12m = field(row, ["ret_12m"], field(rt, ["ret_12m"], null));
      const proxy = num(ret6m, null) !== null ? ret6m : ret12m;
      const res = scoreFromRawFactor(proxy, base.trend, 18, 0);
      ma = res.score;
      audit.push(res.usedFallback ? "trend.ma100: missing MA/proxy return; fallback to current trend_score" : "trend.ma100: proxy from 6M/12M return");
    } else audit.push("trend.ma100: direct score field used");

    const w = normalizeWeights(params, ["trend_linear_weight", "trend_acceleration_weight", "trend_ma100_weight"]);
    const newScore = clamp(
      linear * w.trend_linear_weight +
      accel * w.trend_acceleration_weight +
      ma * w.trend_ma100_weight,
      0, 10
    );

    return { now: base.trend, new: newScore, parts: { linear, accel, ma, weights: w }, audit };
  }

  function computeMoney(ctx, base, params) {
    const { row, rt } = ctx;
    const audit = [];
    let volumeScore = num(field(row, ["money_volume_score", "volume_score", "flow_volume_score"], null), null);
    if (volumeScore === null) {
      const vr = field(row, ["volume_ratio"], field(rt, ["volume_ratio"], null));
      if (num(vr, null) === null) {
        volumeScore = base.money;
        audit.push("money.volume: missing volume_ratio; fallback to current money_score");
      } else {
        volumeScore = clamp(5 + Math.log(Math.max(0.1, num(vr, 1))) * 2.2, 0, 10);
        audit.push("money.volume: derived from log(volume_ratio)");
      }
    } else audit.push("money.volume: direct score field used");

    let topSignal = num(field(row, ["money_top_score", "top_money_score", "top_signal_score"], null), null);
    if (topSignal === null) {
      topSignal = base.money;
      audit.push("money.top: missing top money factor; fallback to current money_score, so changing weight should not create fake collapse");
    } else audit.push("money.top: direct score field used");

    const w = normalizeWeights(params, ["money_volume_weight", "money_top_weight"]);
    const newScore = clamp(volumeScore * w.money_volume_weight + topSignal * w.money_top_weight, 0, 10);
    return { now: base.money, new: newScore, parts: { volumeScore, topSignal, weights: w }, audit };
  }

  function computeTop(base, params) {
    const capped = clamp(base.top, -Math.abs(params.top_adjustment_cap), Math.abs(params.top_adjustment_cap));
    const newTop = clamp(capped * params.top_adjustment_weight, -Math.abs(params.top_adjustment_cap), Math.abs(params.top_adjustment_cap));
    return { now: base.top, new: newTop, capped };
  }

  function computeM7(ctx, params = state.params) {
    const base = getBaseScores(ctx);
    const trend = computeTrend(ctx, base, params);
    const money = computeMoney(ctx, base, params);
    const top = computeTop(base, params);

    const rawWeights = normalizeWeights(params, [
      "raw_valuation_weight", "raw_trend_weight", "raw_structure_weight", "raw_timing_weight", "raw_money_weight"
    ]);

    const rawNow =
      base.valuation * rawWeights.raw_valuation_weight +
      base.trend * rawWeights.raw_trend_weight +
      base.structure * rawWeights.raw_structure_weight +
      base.timing * rawWeights.raw_timing_weight +
      base.money * rawWeights.raw_money_weight;

    const rawNew =
      base.valuation * rawWeights.raw_valuation_weight +
      trend.new * rawWeights.raw_trend_weight +
      base.structure * rawWeights.raw_structure_weight +
      base.timing * rawWeights.raw_timing_weight +
      money.new * rawWeights.raw_money_weight;

    const reconstructedNow = clamp(rawNow + top.now, 0, 10);
    const m7Now = base.m7Now === null ? reconstructedNow : base.m7Now;
    const newScore = clamp(rawNew + top.new, 0, 10);

    const scores = {
      valuation: { now: base.valuation, new: base.valuation },
      trend: { now: base.trend, new: trend.new },
      structure: { now: base.structure, new: base.structure },
      timing: { now: base.timing, new: base.timing },
      money: { now: base.money, new: money.new },
      top: { now: top.now, new: top.new },
      raw: { now: rawNow, new: rawNew },
      m7: { now: m7Now, new: newScore },
      reconstructedNow: { now: reconstructedNow, new: reconstructedNow }
    };

    const traceLines = [];
    traceLines.push(`SYMBOL = ${ctx.sym}`);
    traceLines.push(`M7 now source = ${base.m7Now === null ? "reconstructed raw+top" : "data field m7_v2_score/m7_final_score"}`);
    traceLines.push("");
    traceLines.push("RAW WEIGHTS normalized:");
    Object.entries(rawWeights).forEach(([k,v]) => traceLines.push(`  ${k} = ${v.toFixed(4)}`));
    traceLines.push("");
    traceLines.push("TREND:");
    traceLines.push(`  linear=${fmt(trend.parts.linear)} * w=${trend.parts.weights.trend_linear_weight.toFixed(4)}`);
    traceLines.push(`  acceleration=${fmt(trend.parts.accel)} * w=${trend.parts.weights.trend_acceleration_weight.toFixed(4)}`);
    traceLines.push(`  ma100_proxy=${fmt(trend.parts.ma)} * w=${trend.parts.weights.trend_ma100_weight.toFixed(4)}`);
    traceLines.push(`  trend now=${fmt(base.trend)} / trend new=${fmt(trend.new)} / delta=${fmt(trend.new - base.trend)}`);
    traceLines.push("");
    traceLines.push("MONEY:");
    traceLines.push(`  volumeScore=${fmt(money.parts.volumeScore)} * w=${money.parts.weights.money_volume_weight.toFixed(4)}`);
    traceLines.push(`  topSignal=${fmt(money.parts.topSignal)} * w=${money.parts.weights.money_top_weight.toFixed(4)}`);
    traceLines.push(`  money now=${fmt(base.money)} / money new=${fmt(money.new)} / delta=${fmt(money.new - base.money)}`);
    traceLines.push("");
    traceLines.push("FINAL:");
    traceLines.push(`  rawNow = valuation*wv + trend*wt + structure*ws + timing*wi + money*wm = ${fmt(rawNow)}`);
    traceLines.push(`  rawNew = valuation*wv + trendNew*wt + structure*ws + timing*wi + moneyNew*wm = ${fmt(rawNew)}`);
    traceLines.push(`  top now=${fmt(top.now)} / capped=${fmt(top.capped)} / top new=${fmt(top.new)}`);
    traceLines.push(`  M7 new = clamp(rawNew + topNew, 0, 10) = ${fmt(newScore)}`);

    const audit = [...trend.audit, ...money.audit];
    audit.push(`top: clamp top adjustment to ±${fmt(params.top_adjustment_cap)} then multiply by top_adjustment_weight`);
    audit.push("global: no cross-stock re-normalization in what-if mode");

    return { ctx, base, scores, trend, money, top, rawWeights, trace: traceLines.join("\n"), audit };
  }

  function renderParamControls() {
    const box = $("paramControls");
    box.innerHTML = PARAM_DEFS.map(([key, label, min, max, step]) => `
      <div class="param">
        <div class="param-top"><span class="param-name">${label}</span><span class="param-val" id="pv_${key}">${fmt(state.params[key], 2)}</span></div>
        <input id="p_${key}" type="range" min="${min}" max="${max}" step="${step}" value="${state.params[key]}">
      </div>
    `).join("");
    PARAM_DEFS.forEach(([key]) => {
      $("p_" + key).addEventListener("input", (e) => {
        state.params[key] = num(e.target.value, DEFAULT_PARAMS[key]);
        $("pv_" + key).textContent = fmt(state.params[key], 2);
        render();
      });
    });
  }

  function metricRow(name, now, newer) {
    const d = num(newer, 0) - num(now, 0);
    return `<div class="metric"><div>${name}</div><div class="num">${fmt(now)}</div><div class="num">${fmt(newer)}</div><div class="num ${deltaClass(d)}">${fmt(d)}</div></div>`;
  }

  function renderParamsTable() {
    $("paramTable").innerHTML = PARAM_DEFS.map(([key, label]) => metricRow(label, DEFAULT_PARAMS[key], state.params[key])).join("");
  }

  function renderScoreTable(result) {
    const s = result.scores;
    $("scoreTable").innerHTML = [
      metricRow("valuation score", s.valuation.now, s.valuation.new),
      metricRow("trend score", s.trend.now, s.trend.new),
      metricRow("structure score", s.structure.now, s.structure.new),
      metricRow("timing score", s.timing.now, s.timing.new),
      metricRow("money score", s.money.now, s.money.new),
      metricRow("top score / adjustment", s.top.now, s.top.new),
      metricRow("raw score", s.raw.now, s.raw.new),
      metricRow("M7 final", s.m7.now, s.m7.new)
    ].join("");
  }

  function renderAudit(result) {
    $("auditBox").innerHTML = `
      <table>
        <thead><tr><th>Rule</th><th>Status</th></tr></thead>
        <tbody>
          ${result.audit.map(x => `<tr><td>${escapeHtml(x)}</td><td>${x.includes("fallback") ? "fallback" : "ok"}</td></tr>`).join("")}
        </tbody>
      </table>
    `;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
  }

  function renderDeltaPreview() {
    const rows = getRows().map(ctx => {
      const r = computeM7(ctx, state.params);
      return { sym: ctx.sym, now: r.scores.m7.now, newer: r.scores.m7.new, delta: r.scores.m7.new - r.scores.m7.now };
    }).sort((a,b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0,30);
    $("deltaPreview").innerHTML = `
      <thead><tr><th>Symbol</th><th>Now</th><th>New</th><th>Delta</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${r.sym}</td><td>${fmt(r.now)}</td><td>${fmt(r.newer)}</td><td class="${deltaClass(r.delta)}">${fmt(r.delta)}</td></tr>`).join("")}</tbody>
    `;
  }

  function renderSymbolOptions() {
    const q = String($("searchBox").value || "").trim().toUpperCase();
    const rows = getRows().filter(x => {
      if (!q) return true;
      const name = String(field(x.row, ["name", "company_name"], "")).toUpperCase();
      return x.sym.includes(q) || name.includes(q);
    });
    const sel = $("symbolSelect");
    const current = state.selectedSymbol;
    sel.innerHTML = rows.map(x => {
      const name = field(x.row, ["name", "company_name"], "");
      return `<option value="${x.sym}">${x.sym}${name ? " - " + escapeHtml(name) : ""}</option>`;
    }).join("");
    if (current && rows.some(x => x.sym === current)) sel.value = current;
    else if (rows[0]) state.selectedSymbol = rows[0].sym;
  }

  function render() {
    renderParamsTable();
    const ctx = getRows().find(x => x.sym === state.selectedSymbol) || getRows()[0];
    if (!ctx) return;
    state.selectedSymbol = ctx.sym;
    const result = computeM7(ctx, state.params);
    const d = result.scores.m7.new - result.scores.m7.now;

    $("kpiNow").textContent = fmt(result.scores.m7.now);
    $("kpiNew").textContent = fmt(result.scores.m7.new);
    $("kpiDelta").textContent = fmt(d);
    $("kpiDelta").className = deltaClass(d);

    const name = field(ctx.row, ["name", "company_name"], "");
    $("selectedMeta").textContent = `${ctx.sym}${name ? " / " + name : ""}`;
    $("ruleBox").innerHTML = `Fallback rule：缺少 trend/money 子因子時，該子項回到目前 score，不做硬推估；因此單純改 acceleration 或 money top weight 不應再造成 M7 delta 異常放大或異常崩跌。`;
    renderScoreTable(result);
    $("traceBox").textContent = result.trace;
    renderAudit(result);
    renderDeltaPreview();
  }

  function resetParams() {
    state.params = { ...DEFAULT_PARAMS };
    PARAM_DEFS.forEach(([key]) => {
      const el = $("p_" + key);
      const pv = $("pv_" + key);
      if (el) el.value = state.params[key];
      if (pv) pv.textContent = fmt(state.params[key], 2);
    });
    render();
  }

  function exportTrace() {
    const ctx = getRows().find(x => x.sym === state.selectedSymbol) || getRows()[0];
    if (!ctx) return;
    const result = computeM7(ctx, state.params);
    const payload = {
      generated_at: new Date().toISOString(),
      symbol: ctx.sym,
      params: state.params,
      scores: result.scores,
      audit: result.audit,
      trace: result.trace
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `m7_formula_trace_${ctx.sym}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function init() {
    try {
      $("loadStatus").textContent = "Loading data...";
      const [scores, compare, manifest, runtime, fundamentals] = await Promise.all([
        loadJson(DATA_PATHS.scores),
        loadJson(DATA_PATHS.compare, true),
        loadJson(DATA_PATHS.manifest, true),
        loadJson(DATA_PATHS.runtime, true),
        loadJson(DATA_PATHS.fundamentals, true)
      ]);
      state.scores = asArray(scores);
      state.compare = asArray(compare);
      state.manifest = manifest;
      state.runtime = asArray(runtime);
      state.fundamentals = asArray(fundamentals);

      if (!state.scores.length) throw new Error("m7_v2_scores has no rows");
      state.selectedSymbol = symbolOf(state.scores[0]);
      $("loadStatus").textContent = `Loaded ${state.scores.length} M7 rows`;

      renderSymbolOptions();
      renderParamControls();
      render();

      $("symbolSelect").addEventListener("change", (e) => { state.selectedSymbol = e.target.value; render(); });
      $("searchBox").addEventListener("input", () => { renderSymbolOptions(); render(); });
      $("decimalInput").addEventListener("change", (e) => { state.decimals = clamp(num(e.target.value, 2), 1, 4); render(); });
      $("btnReset").addEventListener("click", resetParams);
      $("btnExport").addEventListener("click", exportTrace);
    } catch (err) {
      console.error(err);
      $("loadStatus").textContent = "Load failed";
      $("ruleBox").className = "warn";
      $("ruleBox").textContent = err.message;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
