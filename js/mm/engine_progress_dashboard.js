(function () {
  const DATA_PATH = "../data/mm/engine_progress_dashboard.json";
  const SCORES_PATH = "../data/m7_sandbox/m7_v2_scores.json";
  const AUDIT_PATH = "../data/m7_sandbox/m7_formula_input_audit.json";
  const RUNTIME_PATH = "../data/runtime_staging/market_runtime_long_horizon.json";
  const CONFIG_STORAGE_KEY = "mm_parameter_config_v1";

  let DASHBOARD_DATA = {};
  let SCORES_DATA = {};
  let AUDIT_DATA = {};
  let RUNTIME_DATA = {};
  let PARAM_META = [];

  function statusPill(status) {
    if (status === "PRODUCTION") return '<span class="pill ok">PRODUCTION</span>';
    if (status === "SANDBOX" || status === "STAGING") return `<span class="pill warn">${status}</span>`;
    return `<span class="pill bad">${status}</span>`;
  }

  function yn(v) {
    return v ? "✅" : "—";
  }

  function safe(v, fallback = "--") {
    return v === null || v === undefined || v === "" ? fallback : v;
  }

  function num(v, fallback = null) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function setError(msg) {
    const box = document.getElementById("dashboard-error");
    if (!box) return;
    box.style.display = "block";
    box.textContent = msg;
  }

  function card(k, v) {
    return `<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  }

  function loadSavedConfig() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveConfig(config) {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config, null, 2));
  }

  function getCurrentConfigValue(key, originalValue) {
    const saved = loadSavedConfig();
    return saved[key] !== undefined ? saved[key] : originalValue;
  }

  function deltaText(original, changed) {
    const o = num(original, null);
    const c = num(changed, null);
    if (o === null || c === null) return "--";
    const d = c - o;
    if (Math.abs(d) < 0.000001) return "0";
    return d > 0 ? `+${d.toFixed(4)}` : d.toFixed(4);
  }

 function f(v, digits = 2) {
  return formatNum(v, digits);
}

  function percent(v) {
    const n = num(v, null);
    return n === null ? "--" : `${n.toFixed(1)}%`;
  }

  function getScoreRows() {
    return Array.isArray(SCORES_DATA?.rows) ? SCORES_DATA.rows : [];
  }

  function getAuditRows() {
    return Array.isArray(AUDIT_DATA?.rows) ? AUDIT_DATA.rows : [];
  }

  function getRuntimeRows() {
    return RUNTIME_DATA?.rows || {};
  }

  function getOriginalM7Weights() {
    return {
      valuation: 0.45,
      trend: 0.25,
      structure: 0.20,
      money: 0.10
    };
  }

  function inferWeightKey(paramKey, label) {
    const s = `${paramKey || ""} ${label || ""}`.toLowerCase();

    if (s.includes("valuation") || s.includes("估值")) return "valuation";
    if (s.includes("trend") || s.includes("趨勢")) return "trend";
    if (s.includes("structure") || s.includes("結構")) return "structure";
    if (s.includes("money") || s.includes("market_acceptance") || s.includes("資金")) return "money";

    return null;
  }

  function getChangedM7Weights() {
    const base = getOriginalM7Weights();
    const weights = { ...base };
    const saved = loadSavedConfig();

    PARAM_META.forEach(meta => {
      const wKey = inferWeightKey(meta.key, meta.label);
      if (!wKey) return;

      const val = saved[meta.key];
      const n = num(val, null);

      if (n !== null && n >= 0 && n <= 1) {
        weights[wKey] = n;
      }
    });

    return weights;
  }

  function calcM7V2Score(row, weights) {
    const valuation = num(row.valuation_score, 0);
    const trend = num(row.trend_score, 0);
    const structure = num(row.structure_score, 0);
    const money = num(row.money_score, 0);

    return (
      weights.valuation * valuation +
      weights.trend * trend +
      weights.structure * structure +
      weights.money * money
    );
  }

  function enrichImpactRows(rows) {
    const originalWeights = getOriginalM7Weights();
    const changedWeights = getChangedM7Weights();

    return (rows || []).map(row => {
      const original = num(row.m7_v2_score, null);
      const recalculatedOriginal = calcM7V2Score(row, originalWeights);
      const changed = calcM7V2Score(row, changedWeights);
      const baseline = original !== null ? original : recalculatedOriginal;

      return {
        ...row,
        mm_original_score: baseline,
        mm_changed_score: changed,
        mm_delta_score: changed - baseline
      };
    });
  }

  function stats(values) {
    const arr = values.map(v => num(v, null)).filter(v => v !== null);
    if (!arr.length) return null;

    const sorted = [...arr].sort((a, b) => a - b);
    const sum = arr.reduce((a, b) => a + b, 0);
    const mean = sum / arr.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    const q = p => {
      const idx = Math.floor((sorted.length - 1) * p);
      return sorted[idx];
    };

    return {
      n: arr.length,
      mean,
      min,
      max,
      p25: q(0.25),
      p50: q(0.50),
      p75: q(0.75)
    };
  }

  function groupBy(rows, keyFn) {
    const map = {};
    rows.forEach(r => {
      const k = keyFn(r) || "UNKNOWN";
      if (!map[k]) map[k] = [];
      map[k].push(r);
    });
    return map;
  }

  function compactMissing(missingInputs) {
    if (!missingInputs || typeof missingInputs !== "object") return [];
    return Object.entries(missingInputs).flatMap(([factor, fields]) =>
      (fields || []).map(f => `${factor}.${f}`)
    );
  }

  function renderOverview(overview) {
    const el = document.getElementById("overview");
    if (!el) return;

    const rows = getScoreRows();
    const impacted = enrichImpactRows(rows);
    const finalStats = stats(impacted.map(r => r.m7_final_score));
    const changedStats = stats(impacted.map(r => r.mm_changed_score));
    const deltaStats = stats(impacted.map(r => r.mm_delta_score));

    el.innerHTML = [
      card("Overall Progress", `${overview?.overall_progress_pct ?? "--"}%`),
      card("Production Stability", overview?.production_stability || "--"),
      card("Critical Blockers", String(overview?.critical_blockers_count ?? "--")),
      card("Active Milestones", String((overview?.active_milestones || []).length)),
      card("M7 Rows", String(rows.length)),
      card("Final Avg", finalStats ? finalStats.mean.toFixed(2) : "--"),
      card("Changed Avg", changedStats ? changedStats.mean.toFixed(2) : "--"),
      card("Delta Avg", deltaStats ? deltaStats.mean.toFixed(3) : "--")
    ].join("");
  }

  function renderModuleSwitch(items) {
    const box = document.getElementById("module-switch");
    if (!box) return;

    const allowed = new Set(["M1", "M3", "M7", "M8", "M9"]);

    box.innerHTML = (items || [])
      .filter(x => allowed.has(x?.module_id))
      .map(x => {
        const isM7 = x?.module_id === "M7";
        const enabled = isM7 ? true : !!x?.enabled;
        const path = isM7 ? "./m7.html" : (x?.path || "#");

        if (enabled) {
          return `<a class="module-btn" href="${path}">${x.label || x.module_id || "--"}</a>`;
        }

        return `<span class="module-btn disabled">${x.label || x.module_id || "--"}（coming soon）</span>`;
      })
      .join("");
  }

  function renderParameterController(data) {
    const box = document.getElementById("param-controller");
    if (!box) return;

    PARAM_META = [];

    const savedConfig = loadSavedConfig();

    const controlBlock = (title, items) => `
      <details class="collapsible-section">
        <summary>${title}</summary>
        <div class="group-box">
          <div class="control-grid">
            ${(items || []).map(x => {
              const key = x.key || x.label || "unknown";
              const originalValue = x.value ?? "";
              const currentValue = savedConfig[key] !== undefined ? savedConfig[key] : originalValue;
              PARAM_META.push({
                key,
                label: x.label || key,
                value: originalValue,
                note: x.note || ""
              });

              return `
                <div class="control-item">
                  <label>${x.label || "--"}</label>
                  <input class="mm-param-input" data-key="${key}" data-original="${String(originalValue).replace(/"/g, "&quot;")}" value="${String(currentValue).replace(/"/g, "&quot;")}" />
                  <input disabled class="mm-param-original" value="original = ${String(originalValue).replace(/"/g, "&quot;")}" style="margin-top:6px;" />
                  <input disabled class="mm-param-changed" value="changed = ${String(currentValue).replace(/"/g, "&quot;")}" style="margin-top:6px;" />
                  <input disabled class="mm-param-delta" value="delta = ${deltaText(originalValue, currentValue)}" style="margin-top:6px;" />
                  <div class="mini" style="margin-top:6px;">${x.note || ""}</div>
                  <div class="mini impact-hint" style="margin-top:4px;">impact target：${inferWeightKey(key, x.label) || "metadata / display only"}</div>
                </div>
              `;
            }).join("")}
          </div>

          <div class="top-actions" style="margin-top:12px;">
            <button id="save-mm-config">Save Config</button>
            <button id="reset-mm-config">Reset Config</button>
            <button id="export-mm-config">Export Config</button>
            <button id="refresh-mm-preview">Refresh Preview</button>
          </div>

          <div class="mini">
            Save 會寫入 localStorage：${CONFIG_STORAGE_KEY}。目前為前端 preview，不會直接改 Python source。
          </div>
        </div>
      </details>
    `;

    const blueprint = data?.blueprint || {};

    const bpSection = (title, rows) => `
      <div class="group-box">
        <div class="group-title">${title}</div>
        <div>${(rows || []).map(x => `• ${x}`).join("<br>") || "--"}</div>
      </div>
    `;

    box.innerHTML = [
      `<div><b>目前 MM 參數檔（Current Config）：</b> ${data?.config_file || "--"}</div>`,
      `<details class="collapsible-section">
        <summary>Blueprint / 藍圖說明（click to expand）</summary>
        ${bpSection("A. MM 模組規則", blueprint.mm_module_rule)}
        ${bpSection("B. MM ↔ M7 功能定義", blueprint.mm_m7_definition)}
        ${bpSection("C. Full M7 定義（single-stock score engine）", blueprint.m7_full_definition)}
        ${bpSection("D. M7 因子/公式/術語/計算定義", blueprint.m7_formula_terminology)}
        ${bpSection("E. 參數影響力分級", blueprint.parameter_impact_ranking)}
      </details>`,
      controlBlock("A. 核心估值控制（Core Valuation Controls）", data?.groups?.core_valuation_controls),
      controlBlock("B. 分數架構控制（Score Architecture Controls）", data?.groups?.score_architecture_controls),
      controlBlock("C. 執行控制（Runtime / Execution Controls）", data?.groups?.runtime_execution_controls)
    ].join("");

    bindParameterActions();
  }

  function bindParameterActions() {
    document.querySelectorAll(".mm-param-input").forEach(input => {
      input.addEventListener("input", () => {
        const card = input.closest(".control-item");
        if (!card) return;

        const original = input.dataset.original;
        const changed = input.value;

        const changedBox = card.querySelector(".mm-param-changed");
        const deltaBox = card.querySelector(".mm-param-delta");

        if (changedBox) changedBox.value = `changed = ${changed}`;
        if (deltaBox) deltaBox.value = `delta = ${deltaText(original, changed)}`;

        refreshImpactOnly();
      });
    });

    const saveBtn = document.getElementById("save-mm-config");
    const resetBtn = document.getElementById("reset-mm-config");
    const exportBtn = document.getElementById("export-mm-config");
    const refreshBtn = document.getElementById("refresh-mm-preview");

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const config = {};
        document.querySelectorAll(".mm-param-input").forEach(input => {
          const key = input.dataset.key;
          const n = num(input.value, null);
          config[key] = n !== null ? n : input.value;
        });

        saveConfig(config);
        refreshImpactOnly();
        alert("MM config saved.");
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        localStorage.removeItem(CONFIG_STORAGE_KEY);
        alert("MM config reset.");
        init();
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        const config = loadSavedConfig();
        console.log("MM CONFIG EXPORT:", config);
        alert("Config exported to browser console.");
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        const config = {};
        document.querySelectorAll(".mm-param-input").forEach(input => {
          const key = input.dataset.key;
          const n = num(input.value, null);
          config[key] = n !== null ? n : input.value;
        });
        saveConfig(config);
        refreshImpactOnly();
      });
    }
  }

  function refreshImpactOnly() {
    renderOutputDemo(DASHBOARD_DATA.output_demo || {}, buildExplainContext());
    renderM7Readiness(DASHBOARD_DATA.m7_complete_readiness_check || {}, DASHBOARD_DATA.compare_governance || {});
    renderOverview(DASHBOARD_DATA.overview || {});
  }

  function buildExplainContext() {
    const prototypeSymbol = DASHBOARD_DATA?.output_demo?.prototype_symbol_snapshot?.symbol || "NVDA";
    const scoreRows = getScoreRows();
    const auditRows = getAuditRows();
    const runtimeRows = getRuntimeRows();

    const scoreRow =
      scoreRows.find(r => r.symbol === prototypeSymbol) ||
      scoreRows.find(r => r.symbol === "NVDA") ||
      scoreRows[0] ||
      {};

    const auditRow = auditRows.find(r => r.symbol === scoreRow.symbol) || {};
    const runtimeRow = runtimeRows[scoreRow.symbol] || {};

    return { scoreRow, auditRow, runtimeRow };
  }

  function renderEngineActions(rows) {
    const box = document.getElementById("engine-actions");
    if (!box) return;

    box.innerHTML = `<div class="actions-grid">${(rows || []).map(x => `
      <div class="action-card">
        <div style="font-weight:700;">${x.name || "--"}</div>
        <div style="font-size:12px; color:#667085; margin-top:4px;">${x.description || "--"}</div>
        <button class="action-btn" disabled>${x.button_label || "Run"}</button>
      </div>
    `).join("")}</div>`;
  }

  function renderPrototypeSnapshot(data, explain = {}) {
    const p = { ...(data?.prototype_symbol_snapshot || {}), ...(explain.scoreRow || {}) };
    const missingList = compactMissing(explain.auditRow?.missing_inputs);
    const coveragePct = typeof p.coverage_pct === "number"
      ? `${p.coverage_pct}%`
      : typeof explain.runtimeRow?.coverage_pct === "number"
        ? `${explain.runtimeRow.coverage_pct}%`
        : "--";

    const dataWarning = p.data_warning || explain.runtimeRow?.data_warning || "--";
    const impacted = enrichImpactRows([p])[0] || p;

    return `
      <details class="collapsible-section" open>
        <summary>Prototype Symbol Snapshot（原型單檔快照 / NVDA示範）</summary>
        <div class="group-box">
          <div class="group-title">${p.symbol || "--"} / status: ${p.today_fcn_pool_status || p.status || "--"}</div>
          <table class="preview-table">
            <tbody>
              <tr><td>valuation_score</td><td>${p.valuation_score ?? "--"}</td><td>trend_score</td><td>${p.trend_score ?? "--"}</td></tr>
              <tr><td>structure_score</td><td>${p.structure_score ?? "--"}</td><td>timing_score</td><td>${p.timing_score ?? "--"}</td></tr>
              <tr><td>money_score</td><td>${p.money_score ?? "--"}</td><td>m7_raw_score</td><td>${p.m7_raw_score ?? "--"}</td></tr>
              <tr><td>m7_v2_score original</td><td>${formatNum(impacted.mm_original_score)}</td><td>changed preview</td><td>${formatNum(impacted.mm_changed_score)}</td></tr>
              <tr><td>preview delta</td><td>${formatNum(impacted.mm_delta_score, 4)}</td><td>formula</td><td>${p.m7_v2_formula || "0.45*valuation + 0.25*trend + 0.20*structure + 0.10*money"}</td></tr>
              <tr><td>missing_fields</td><td colspan="3">${missingList.length ? missingList.join(", ") : "none"}</td></tr>
              <tr><td>coverage_pct</td><td>${coveragePct}</td><td>data_warning</td><td>${dataWarning}</td></tr>
              <tr><td>zscore</td><td>${p.zscore ?? "--"}</td><td>z_adj</td><td>${p.z_adj ?? "--"}</td></tr>
              <tr><td>h_value</td><td>${p.h_value ?? "--"}</td><td>h_adj</td><td>${p.h_adj ?? "--"}</td></tr>
              <tr><td>m7_final_score</td><td>${p.m7_final_score ?? "--"}</td><td>confidence</td><td>${typeof p.confidence === "number" ? `${p.confidence}%` : "--"}</td></tr>
            </tbody>
          </table>
        </div>
      </details>
    `;
  }

  function renderTopCompareGroups() {
    const rows = enrichImpactRows(getScoreRows());

    const symbols = ["NVDA", "TSM", "COIN", "TSLA", "LQD", "UNH", "AAPL", "GOOG"];
    const picked = symbols
      .map(s => rows.find(r => r.symbol === s))
      .filter(Boolean);

    const fallback = [...rows]
      .sort((a, b) => (b.m7_final_score || 0) - (a.m7_final_score || 0))
      .slice(0, 8);

    const finalRows = picked.length >= 6 ? picked : fallback;

    return `
      <details class="collapsible-section">
        <summary>6~8 組對照組（Extreme / Representative Compare Group）</summary>
        <div class="group-box">
          <table class="preview-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Category</th>
                <th>Sub</th>
                <th>Valuation</th>
                <th>Trend</th>
                <th>Structure</th>
                <th>Money</th>
                <th>Original</th>
                <th>Changed</th>
                <th>Delta</th>
                <th>Final</th>
              </tr>
            </thead>
            <tbody>
              ${finalRows.map(x => `
                <tr>
                  <td>${x.symbol || "--"}</td>
                  <td>${x.category || "--"}</td>
                  <td>${x.category_sub || x.subsector || "--"}</td>
                  <td>${x.valuation_score ?? "--"}</td>
                  <td>${x.trend_score ?? "--"}</td>
                  <td>${x.structure_score ?? "--"}</td>
                  <td>${x.money_score ?? "--"}</td>
                  <td>${formatNum(x.mm_original_score)}</td>
                  <td>${formatNum(x.mm_changed_score)}</td>
                  <td>${formatNum(x.mm_delta_score, 4)}</td>
                  <td>${x.m7_final_score ?? "--"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </details>
    `;
  }

  function renderAllStocksByCategory() {
    const rows = enrichImpactRows(getScoreRows());
    const byCat = groupBy(rows, r => r.category || "UNKNOWN");

    return `
      <details class="collapsible-section">
        <summary>All Stocks by 五大類 / 小類（click to expand）</summary>
        <div class="group-box">
          ${Object.entries(byCat).map(([cat, catRows]) => {
            const bySub = groupBy(catRows, r => r.category_sub || r.subsector || "UNKNOWN");
            return `
              <details class="collapsible-section">
                <summary>${cat}（${catRows.length}）</summary>
                <div class="group-box">
                  ${Object.entries(bySub).map(([sub, subRows]) => `
                    <details class="collapsible-section">
                      <summary>${sub}（${subRows.length}）</summary>
                      <table class="preview-table">
                        <thead>
                          <tr>
                            <th>Symbol</th>
                            <th>Name</th>
                            <th>Val</th>
                            <th>Trend</th>
                            <th>Structure</th>
                            <th>Timing</th>
                            <th>Money</th>
                            <th>Original</th>
                            <th>Changed</th>
                            <th>Delta</th>
                            <th>Final</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${subRows
                            .sort((a, b) => (b.m7_final_score || 0) - (a.m7_final_score || 0))
                            .map(x => `
                              <tr>
                                <td>${x.symbol || "--"}</td>
                                <td>${x.name || "--"}</td>
                                <td>${x.valuation_score ?? "--"}</td>
                                <td>${x.trend_score ?? "--"}</td>
                                <td>${x.structure_score ?? "--"}</td>
                                <td>${x.timing_score ?? "--"}</td>
                                <td>${x.money_score ?? "--"}</td>
                                <td>${formatNum(x.mm_original_score)}</td>
                                <td>${formatNum(x.mm_changed_score)}</td>
                                <td>${formatNum(x.mm_delta_score, 4)}</td>
                                <td>${x.m7_final_score ?? "--"}</td>
                                <td>${x.today_fcn_pool_status || "--"}</td>
                              </tr>
                            `).join("")}
                        </tbody>
                      </table>
                    </details>
                  `).join("")}
                </div>
              </details>
            `;
          }).join("")}
        </div>
      </details>
    `;
  }

  function renderOutputDemo(data, explain = {}) {
    const box = document.getElementById("output-demo");
    if (!box) return;

    const summaryRows = (data?.representative_groups || [])
      .map(g => `• ${g.group_name}：${g.summary || ""}`)
      .join("<br>");

    box.innerHTML = [
      `<div class="mini">Parameter → item → score；輸入參數後會即時 preview original / changed / delta。</div>`,
      renderPrototypeSnapshot(data, explain),
      renderTopCompareGroups(),
      renderAllStocksByCategory(),
      `<div class="group-box"><div class="group-title">代表組摘要（Representative Summary）</div><div>${summaryRows || "無"}</div></div>`,
      ...(data?.representative_groups || []).map(g => {
        const rows = (g.items || []).map(x => `
          <tr>
            <td>${x.symbol || "--"}</td>
            <td>${x.status || "--"}</td>
            <td>${x.category_sub || "--"}</td>
            <td>${x.valuation_archetype || "--"}</td>
            <td>${x.base_anchor ?? "--"}</td>
            <td>${x.market_regime || "--"}</td>
            <td>${x.industry_regime || "--"}</td>
            <td>${x.final_anchor ?? "--"}</td>
            <td>${x.valuation_gap ?? "--"}</td>
            <td>${x.valuation_score ?? "--"}</td>
          </tr>
        `).join("");

        return `
          <details class="collapsible-section">
            <summary>${g.group_name || "--"}（click to expand）</summary>
            <div class="group-box">
              <div class="group-title">${g.group_name || "--"}</div>
              <div class="mini">${g.summary || ""}</div>
              <table class="preview-table">
                <thead>
                  <tr>
                    <th>Symbol</th><th>Status</th><th>category_sub</th><th>archetype</th><th>base</th>
                    <th>market</th><th>industry</th><th>final</th><th>gap</th><th>score</th>
                  </tr>
                </thead>
                <tbody>${rows || "<tr><td colspan='10'>無</td></tr>"}</tbody>
              </table>
            </div>
          </details>
        `;
      }).join(""),
      `<details class="collapsible-section">
        <summary>Abnormal Movers（代表）</summary>
        <div class="group-box">
          <div>${(data?.abnormal_movers || []).map(x => `• ${x}`).join("<br>") || "無"}</div>
        </div>
      </details>`
    ].join("");
  }

  function renderM7Readiness(data, compareGov) {
    const box = document.getElementById("m7-readiness");
    if (!box) return;

    const rows = enrichImpactRows(getScoreRows());
    const originalStats = stats(rows.map(r => r.mm_original_score));
    const changedStats = stats(rows.map(r => r.mm_changed_score));
    const deltaStats = stats(rows.map(r => r.mm_delta_score));

    const factorStats = factor => stats(rows.map(r => r[f]));

    const sec = (title, rows) => `
      <div class="group-box">
        <div class="group-title">${title}</div>
        <div>${(rows || []).map(x => `• ${x}`).join("<br>") || "--"}</div>
      </div>
    `;

    const gov = compareGov || {};
    const contract = gov.output_contract || {};
    const weights = getChangedM7Weights();

    const completeItems = [
      "long horizon runtime pipeline",
      "d2~d5 timing input connection",
      "3y/5y/10y trend input connection",
      "structure regression engine",
      "formula input audit",
      "M7 Statistical Analysis Center",
      "right-panel explainability"
    ];

    const remainingItems = [
      "calibration of score curves",
      "compare layer governance",
      "M7 → M8/M3 handoff",
      "production scheduler integration"
    ];

    const statLine = s => {
      if (!s) return "--";
      return `n=${s.n}, mean=${s.mean.toFixed(2)}, p25=${s.p25.toFixed(2)}, p50=${s.p50.toFixed(2)}, p75=${s.p75.toFixed(2)}, min=${s.min.toFixed(2)}, max=${s.max.toFixed(2)}`;
    };

    box.innerHTML = `
      <details class="collapsible-section">
        <summary>Readiness 明細（click to expand）</summary>
        ${sec("A. 已完成（Complete）", completeItems)}
        ${sec("B. 未完成（Remaining）", remainingItems)}
        ${sec("C. 缺失欄位/計算/輸出定義（Missing）", data?.missing_inputs)}
        ${sec("D. 明日可交付判定（Tomorrow Readiness）", data?.tomorrow_readiness || ["M7 analysis complete; still pending production integration gates"])}

        <div class="group-box">
          <div class="group-title">3.1 公式 / Current M7 v2 Formula</div>
          <div class="formula-box">
            m7_v2_score = ${weights.valuation.toFixed(2)} × valuation
            + ${weights.trend.toFixed(2)} × trend
            + ${weights.structure.toFixed(2)} × structure
            + ${weights.money.toFixed(2)} × money
          </div>
          <div class="mini">原公式：0.45 × valuation + 0.25 × trend + 0.20 × structure + 0.10 × money</div>
        </div>

        <div class="group-box">
          <div class="group-title">3.2 公式各組變化 / Component Distribution</div>
          <table class="preview-table">
            <thead><tr><th>Component</th><th>Stats</th></tr></thead>
            <tbody>
              <tr><td>valuation_score</td><td>${statLine(factorStats("valuation_score"))}</td></tr>
              <tr><td>trend_score</td><td>${statLine(factorStats("trend_score"))}</td></tr>
              <tr><td>structure_score</td><td>${statLine(factorStats("structure_score"))}</td></tr>
              <tr><td>timing_score</td><td>${statLine(factorStats("timing_score"))}</td></tr>
              <tr><td>money_score</td><td>${statLine(factorStats("money_score"))}</td></tr>
            </tbody>
          </table>
        </div>

        <div class="group-box">
          <div class="group-title">3.3 整體分數變化 / Score Impact Preview</div>
          <table class="preview-table">
            <tbody>
              <tr><td>Original M7 v2 Score</td><td>${statLine(originalStats)}</td></tr>
              <tr><td>Changed M7 v2 Score</td><td>${statLine(changedStats)}</td></tr>
              <tr><td>Delta</td><td>${statLine(deltaStats)}</td></tr>
            </tbody>
          </table>
        </div>

        <div class="group-box">
          <div class="group-title">Compare Formula Governance（正式核准）</div>
          <div class="mini">m7_final_score：${gov.approved_formula || "--"}</div>
          <div class="mini" style="margin-top:6px;">zscore：${gov.zscore_definition || "--"}</div>
          <div class="mini" style="margin-top:6px;">historical：${gov.historical_definition || "--"}</div>
          <div class="mini" style="margin-top:6px;">historical_score：${gov.historical_score_definition || "--"}</div>
          <div class="mini" style="margin-top:6px;">Today FCN gate：${gov.today_fcn_pool_gate || "--"}</div>
        </div>

        <div class="group-box">
          <div class="group-title">Output Contract（prototype）</div>
          <pre style="white-space:pre-wrap; font-size:12px; margin:0;">${JSON.stringify(contract, null, 2)}</pre>
        </div>

        <div class="group-box">
          <div class="group-title">Deprecated Legacy Compare Semantics</div>
          <div>${(gov.deprecated_legacy_compare_semantics || []).map(x => `• ${x}`).join("<br>") || "--"}</div>
        </div>
      </details>
    `;
  }

  function renderControlCenterAutomationPanel(dashboardData, scoreRows, runtimeRows) {
    const box = document.getElementById("control-center-automation");
    if (!box) return;

    const rows = scoreRows || [];
    const runtimeKeys = Object.keys(runtimeRows || {});
    const warningRows = rows.filter(r => !!r?.data_warning);
    const lowCoverageRows = rows.filter(r => typeof r?.coverage_pct === "number" && r.coverage_pct < 80);
    const missingPriceRefRows = rows.filter(r => Array.isArray(r?.missing_price_refs) && r.missing_price_refs.length > 0);
    const confidenceNums = rows.map(r => Number(r?.confidence)).filter(Number.isFinite);
    const avgConfidence = confidenceNums.length
      ? (confidenceNums.reduce((a, b) => a + b, 0) / confidenceNums.length).toFixed(1)
      : "--";

    const automationActions = [
      "Step 1: runtime coverage check (market_runtime_long_horizon)",
      "Step 2: score recompute gate (m7_v2_scores)",
      "Step 3: audit missing-fields check (m7_formula_input_audit)",
      "Step 4: distribution sanity check (normality/category)"
    ];

    const taskNotes = dashboardData?.active_build_context?.current_task || "--";

    box.innerHTML = `
      <div class="group-box">
        <div class="group-title">Automation Status</div>
        <div class="mini">Current Task: ${taskNotes}</div>
        <table class="preview-table">
          <tbody>
            <tr><td>M7 analysis entry</td><td><a href="./m7.html">Open mm/m7.html</a></td><td>mode</td><td>read-only dashboard</td></tr>
            <tr><td>score rows</td><td>${rows.length}</td><td>runtime symbols</td><td>${runtimeKeys.length}</td></tr>
            <tr><td>avg confidence</td><td>${avgConfidence}</td><td>data warnings</td><td>${warningRows.length}</td></tr>
            <tr><td>coverage &lt; 80</td><td>${lowCoverageRows.length}</td><td>missing_price_refs</td><td>${missingPriceRefRows.length}</td></tr>
          </tbody>
        </table>
      </div>
      <details class="collapsible-section">
        <summary>Automation Sequence / 控制中心自動化序列</summary>
        <div class="group-box mini">${automationActions.map(x => `• ${x}`).join("<br>")}</div>
      </details>
      <details class="collapsible-section">
        <summary>Operator Notes / 操作說明</summary>
        <div class="group-box mini">
          • 此區塊僅提供控制中心流程與 readiness 訊號，不直接寫入任何 artifact。<br>
          • 建議先開啟 M7 分析頁確認 statistical / normal distribution / category / stock detail / formula explainability。<br>
          • 確認完成後再執行 pipeline（保持 source-only 變更流程）。
        </div>
      </details>
    `;
  }

  function setupGlobalExpandCollapse() {
    const expandBtn = document.getElementById("expand-all-btn");
    const collapseBtn = document.getElementById("collapse-all-btn");
    const all = () => Array.from(document.querySelectorAll(".collapsible-section, #system-reporting"));

    if (expandBtn) {
      expandBtn.addEventListener("click", () => all().forEach(el => { el.open = true; }));
    }

    if (collapseBtn) {
      collapseBtn.addEventListener("click", () => all().forEach(el => { el.open = false; }));
    }

    all().forEach(el => { el.open = false; });
  }

  function renderActiveBuildContext(ctx) {
    const box = document.getElementById("active-build-context");
    if (!box) return;

    const line = (v) => {
      if (Array.isArray(v)) return v.length ? v.join(", ") : "--";
      if (typeof v === "string") return v.trim() || "--";
      return v ?? "--";
    };

    box.innerHTML = [
      "目前任務 Current Task：",
      line(ctx?.current_task),
      "",
      "本輪重點 Current Focus：",
      line(ctx?.current_focus),
      "",
      "正式版已鎖定模組 Production Locked：",
      line(ctx?.production_modules_locked),
      "",
      "目前 Sandbox：",
      line(ctx?.sandbox_modules_active),
      "",
      "本輪可做 Allowed Scope：",
      line(ctx?.allowed_scope),
      "",
      "本輪禁止 Forbidden Scope：",
      line(ctx?.forbidden_scope)
    ].join("<br>");
  }

  function renderEngines(rows) {
    const tbody = document.getElementById("engine-table");
    if (!tbody) return;

    tbody.innerHTML = (rows || []).map(r => `
      <tr>
        <td>${r.name || r.engine_id || "--"}</td>
        <td>${statusPill(r.status || "--")}</td>
        <td>${r.readiness_score ?? "--"}</td>
        <td>${r.formula_externalized_pct ?? "--"}%</td>
        <td>${r.next_gate || "--"}</td>
        <td>${r.notes || "--"}</td>
      </tr>
    `).join("");
  }

  function renderDataReadiness(rows) {
    const tbody = document.getElementById("data-table");
    if (!tbody) return;

    tbody.innerHTML = (rows || []).map(r => `
      <tr>
        <td>${r.artifact_id || "--"}</td>
        <td>${statusPill(r.status || "--")}</td>
        <td>${r.coverage_pct ?? "--"}%</td>
        <td>${r.missing_rate ?? "--"}</td>
        <td>${r.freshness || "--"}</td>
        <td>${r.validator_status || "--"}</td>
      </tr>
    `).join("");
  }

  function renderFormulas(rows) {
    const tbody = document.getElementById("formula-table");
    if (!tbody) return;

    tbody.innerHTML = (rows || []).map(r => `
      <tr>
        <td>${r.domain || "--"}</td>
        <td>${r.total_formulas ?? "--"}</td>
        <td>${r.registered_formulas ?? "--"}</td>
        <td>${r.hardcoded_formulas ?? "--"}</td>
        <td>${r.normalization_pct ?? "--"}%</td>
        <td>${yn(r.policy_linked)}</td>
      </tr>
    `).join("");
  }

  function renderModules(rows) {
    const tbody = document.getElementById("module-table");
    if (!tbody) return;

    tbody.innerHTML = (rows || []).map(r => `
      <tr>
        <td>${r.module_id || "--"}</td>
        <td>${statusPill(r.status || "--")}</td>
        <td>${r.module_readiness_score ?? "--"}</td>
        <td>${yn(r.runtime_dependency_ready)}</td>
        <td>${yn(r.adapter_dependency_ready)}</td>
        <td>${yn(r.go_live_gate_passed)}</td>
      </tr>
    `).join("");
  }

  function renderRisks(rows) {
    const box = document.getElementById("risk-list");
    if (!box) return;

    const list = (rows || [])
      .map(r => `• [${r.severity || "--"}] ${r.title || "--"}（${r.status || "--"}）`)
      .join("<br>");

    box.innerHTML = list || "無";
  }

  function renderMilestones(rows) {
    const box = document.getElementById("milestone-list");
    if (!box) return;

    const list = (rows || [])
      .map(r => `• ${r.name || "--"} / ${r.phase || "--"} / ${r.status || "--"}`)
      .join("<br>");

    box.innerHTML = list || "無";
  }

  function renderHandoffMemory(mem) {
    const box = document.getElementById("handoff-memory");
    if (!box) return;

    const created = (mem?.recently_created_files || []).length
      ? (mem.recently_created_files || []).map(x => `  - ${x}`).join("<br>")
      : "  - 無";

    const modified = (mem?.recently_modified_files || []).length
      ? (mem.recently_modified_files || []).map(x => `  - ${x}`).join("<br>")
      : "  - 無";

    const risks = (mem?.known_risks || []).length
      ? (mem.known_risks || []).map(x => `  - ${x}`).join("<br>")
      : "  - 無";

    box.innerHTML = [
      "• 最近新增檔案：",
      created,
      "• 最近修改檔案：",
      modified,
      `• 上一個完成任務：${mem?.last_completed_task || "--"}`,
      `• 下一步：${mem?.next_task || "--"}`,
      "• 目前風險提醒：",
      risks
    ].join("<br>");
  }

  async function init() {
    try {
      const [dashboardRes, scoresRes, auditRes, runtimeRes] = await Promise.all([
        fetch(DATA_PATH, { cache: "no-store" }),
        fetch(SCORES_PATH, { cache: "no-store" }),
        fetch(AUDIT_PATH, { cache: "no-store" }),
        fetch(RUNTIME_PATH, { cache: "no-store" })
      ]);

      if (!dashboardRes.ok) throw new Error(`讀取失敗：${dashboardRes.status}`);

      DASHBOARD_DATA = await dashboardRes.json();
      SCORES_DATA = scoresRes.ok ? await scoresRes.json() : {};
      AUDIT_DATA = auditRes.ok ? await auditRes.json() : {};
      RUNTIME_DATA = runtimeRes.ok ? await runtimeRes.json() : {};

      const scoreRows = getScoreRows();
      const runtimeRows = getRuntimeRows();
      const explain = buildExplainContext();

      const gen = document.getElementById("generatedAt");
      if (gen) {
        gen.textContent = `資料時間：${DASHBOARD_DATA.generated_at || "--"} ｜ 版本：${DASHBOARD_DATA.version || "--"}`;
      }

      renderModuleSwitch(DASHBOARD_DATA.module_switch || []);
      renderParameterController(DASHBOARD_DATA.parameter_controller || {});
      renderEngineActions(DASHBOARD_DATA.engine_actions || []);
      renderOutputDemo(DASHBOARD_DATA.output_demo || {}, explain);
      renderM7Readiness(DASHBOARD_DATA.m7_complete_readiness_check || {}, DASHBOARD_DATA.compare_governance || {});
      renderControlCenterAutomationPanel(DASHBOARD_DATA, scoreRows, runtimeRows);
      renderActiveBuildContext(DASHBOARD_DATA.active_build_context || {});
      renderOverview(DASHBOARD_DATA.overview || {});
      renderEngines(DASHBOARD_DATA.engines || []);
      renderDataReadiness(DASHBOARD_DATA.data_artifacts || []);
      renderFormulas(DASHBOARD_DATA.formula_domains || []);
      renderModules(DASHBOARD_DATA.modules || []);
      renderRisks(DASHBOARD_DATA.blockers || []);
      renderMilestones(DASHBOARD_DATA.milestones || []);
      renderHandoffMemory(DASHBOARD_DATA.handoff_memory || {});
      setupGlobalExpandCollapse();

    } catch (err) {
      setError(`Engine Progress Dashboard 載入失敗：${err.message}`);
    }
  }

  init();
})();

