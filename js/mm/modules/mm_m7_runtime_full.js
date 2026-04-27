(function () {
  const DATA_PATH = "../data/mm/engine_progress_dashboard.json";
  const SCORES_PATH = "../data/m7_sandbox/m7_v2_scores.json";
  const AUDIT_PATH = "../data/m7_sandbox/m7_formula_input_audit.json";
  const RUNTIME_PATH = "../data/runtime_staging/market_runtime_long_horizon.json";
  const M7_PARAM_CONFIG_PATH = "../configs/mm/m7_v2_parameter_config.json";
  const CONFIG_STORAGE_KEY = "mm_parameter_config_v1";

  let DASHBOARD_DATA = {};
  let SCORES_DATA = {};
  let AUDIT_DATA = {};
  let RUNTIME_DATA = {};
  let M7_PARAM_CONFIG = {};
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

  function clearError() {
    const box = document.getElementById("dashboard-error");
    if (!box) return;
    box.style.display = "none";
    box.textContent = "";
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

  function formatNum(v, digits = 2) {
    const n = num(v, null);
    if (n === null || Number.isNaN(n)) return "--";
    return n.toFixed(digits);
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
    const cfg = M7_PARAM_CONFIG?.m7_v2_weights || {};
    return {
      valuation: num(cfg.valuation, 0.45),
      trend: num(cfg.trend, 0.25),
      structure: num(cfg.structure, 0.20),
      timing: num(cfg.timing, 0.00),
      money: num(cfg.money, 0.10)
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
    const timing = num(row.timing_score, 0);
    const money = num(row.money_score, 0);

    return (
      weights.valuation * valuation +
      weights.trend * trend +
      weights.structure * structure +
      weights.timing * timing +
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
      (fields || []).map(field => `${factor}.${field}`)
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

              const originalEsc = String(originalValue).replace(/"/g, "&quot;");
              const currentEsc = String(currentValue).replace(/"/g, "&quot;");

              return `
                <div class="control-item">
                  <label>${x.label || "--"}</label>
                  <input class="mm-param-input" data-key="${key}" data-original="${originalEsc}" value="${currentEsc}" />
                  <input disabled class="mm-param-original" value="original = ${originalEsc}" style="margin-top:6px;" />
                  <input disabled class="mm-param-changed" value="changed = ${currentEsc}" style="margin-top:6px;" />
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
    const scoreRows = getScoreRows();
    const params = readWhatIfParamsFromDom();

    renderOutputDemo(
      DASHBOARD_DATA.output_demo || {},
      buildExplainContext()
    );

    renderM7Readiness(
      DASHBOARD_DATA.m7_complete_readiness_check || {},
      DASHBOARD_DATA.compare_governance || {}
    );

    renderOverview(
      DASHBOARD_DATA.overview || {}
    );

    const currentSymbol =
      document.getElementById("stock-query-input")?.value || "NVDA";

    renderStandardStockCard(currentSymbol);

    
    renderStocksDisplayTable();
const resultBox = document.getElementById("m7-what-if-results");
    if (resultBox) {
      resultBox.innerHTML = renderWhatIfResultsTable(scoreRows, params);
    }

    const rankingBox = document.getElementById("ranking-impact");
    if (rankingBox) {
      rankingBox.innerHTML = renderWhatIfResultsTable(scoreRows, params);
    }
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
  const stock = {
    ...(data?.prototype_symbol_snapshot || {}),
    ...(explain.scoreRow || {})
  };

  const impacted = enrichImpactRows([stock])[0] || stock;
  const runtime = explain.runtimeRow || {};

  const oldScore = impacted.mm_original_score || stock.m7_v2_score || 0;
  const newScore = impacted.mm_changed_score || oldScore;
  const deltaScore = newScore - oldScore;

  function fmt(v, d = 2) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "--";
    return n.toFixed(d);
  }

  function deltaClass(v) {
    if (v > 0) return "color:green;font-weight:bold;";
    if (v < 0) return "color:red;font-weight:bold;";
    return "";
  }

  return `
  
  <details class="collapsible-section" open>
    <summary>C1 股票查詢區（預設 NVDA standard stock）</summary>

    <div class="group-box">

      <!-- Layer 1 -->
      <div class="group-title">1. 股票身份卡</div>
      <table class="preview-table">
        <tbody>
          <tr>
            <td>Symbol</td>
            <td>${stock.symbol || "--"}</td>
            <td>Name</td>
            <td>${stock.name || "--"}</td>
          </tr>
          <tr>
            <td>Price</td>
            <td>${fmt(runtime.price_now)}</td>
            <td>1D Delta</td>
            <td>${fmt(runtime.ret_1d)}%</td>
          </tr>
          <tr>
            <td>Category</td>
            <td>${stock.category || "--"}</td>
            <td>Subsector</td>
            <td>${stock.subsector || "--"}</td>
          </tr>
          <tr>
            <td>Category Sub</td>
            <td>${stock.category_sub || "--"}</td>
            <td>Archetype</td>
            <td>${stock.valuation_archetype || "--"}</td>
          </tr>
        </tbody>
      </table>

      <br>

      <!-- Layer 2 -->
      <div class="group-title">2. 核心分數（Now / New / Delta）</div>
      <table class="preview-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Now</th>
            <th>New</th>
            <th>Delta</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>M1 Score</td>
            <td>${fmt(stock.m1_score)}</td>
            <td>${fmt(stock.m1_score)}</td>
            <td>--</td>
          </tr>
          <tr>
            <td>M7 Raw</td>
            <td>${fmt(stock.m7_raw_score)}</td>
            <td>${fmt(stock.m7_raw_score)}</td>
            <td>--</td>
          </tr>
          <tr>
            <td>M7 V2</td>
            <td>${fmt(oldScore)}</td>
            <td>${fmt(newScore)}</td>
            <td style="${deltaClass(deltaScore)}">${fmt(deltaScore)}</td>
          </tr>
          <tr>
            <td>Effective</td>
            <td>${fmt(stock.m7_effective_score)}</td>
            <td>${fmt(newScore)}</td>
            <td style="${deltaClass(deltaScore)}">${fmt(deltaScore)}</td>
          </tr>
        </tbody>
      </table>

      <br>

      <!-- Layer 3 -->
      <div class="group-title">3. 主因子（Now）</div>
      <table class="preview-table">
        <thead>
          <tr>
            <th>Factor</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Valuation</td><td>${fmt(stock.valuation_score)}</td></tr>
          <tr><td>Trend</td><td>${fmt(stock.trend_score)}</td></tr>
          <tr><td>Structure</td><td>${fmt(stock.structure_score)}</td></tr>
          <tr><td>Timing</td><td>${fmt(stock.timing_score)}</td></tr>
          <tr><td>Money</td><td>${fmt(stock.money_score)}</td></tr>
        </tbody>
      </table>

      <br>

      <!-- Layer 4 -->
      <details class="collapsible-section">
        <summary>Trend Detail</summary>
        <div class="mini">
          Linear Score: ${fmt(stock.trend_linear_score)}<br>
          MA Score: ${fmt(stock.trend_ma_score)}<br>
          Acceleration Score: ${fmt(stock.trend_acceleration_score)}<br>
          Linear Annualized: ${fmt(stock.trend_linear_annualized_pct)}%<br>
          MA Annualized: ${fmt(stock.trend_ma_annualized_pct)}%<br>
          Recent 3Y: ${fmt(stock.trend_recent_3y_annualized_pct)}%<br>
        </div>
      </details>

      <details class="collapsible-section">
        <summary>Valuation Detail</summary>
        <div class="mini">
          Forward PE: ${fmt(stock.feature_snapshot?.valuation?.forward_pe)}<br>
          Anchor PE: ${fmt(stock.feature_snapshot?.valuation?.anchor_pe)}<br>
          PEG: ${fmt(stock.feature_snapshot?.valuation?.peg)}<br>
          EPS Growth: ${fmt(stock.feature_snapshot?.valuation?.eps_growth)}%
        </div>
      </details>

      <details class="collapsible-section">
        <summary>Structure Detail</summary>
        <div class="mini">
          Best Model: ${stock.best_structure_model || "--"}<br>
          Best R²: ${fmt(stock.best_structure_r2)}<br>
          Dispersion: ${fmt(stock.structure_dispersion)}<br>
          Stability: ${fmt(stock.structure_stability)}
        </div>
      </details>

      <details class="collapsible-section">
        <summary>Data Health</summary>
        <div class="mini">
          Coverage: ${fmt(stock.coverage_pct)}%<br>
          Warning: ${stock.warning_flag ? "YES" : "NO"}<br>
          History Weeks: ${stock.history_weeks || "--"}<br>
          Horizon: ${stock.history_horizon_used || "--"}
        </div>
      </details>

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

    const factorStats = factor => stats(rows.map(r => r[factor]));

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
            + ${weights.timing.toFixed(2)} × timing
            + ${weights.money.toFixed(2)} × money
          </div>
          <div class="mini">原公式：0.45 × valuation + 0.25 × trend + 0.20 × structure + 0.00 × timing + 0.10 × money</div>
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


  function renderM7ParameterSnapshot() {
    const cfg = M7_PARAM_CONFIG || {};
    const w = cfg.m7_v2_weights || {};
    const trend = cfg.trend || {};
    const tw = trend.internal_weights || {};
    const legacy = cfg.legacy_raw_fallback || {};
    const val = cfg.valuation || {};
    const money = cfg.money || {};

    const pct = x => {
      const n = num(x, null);
      return n === null ? "--" : `${(n * 100).toFixed(1)}%`;
    };

    return `
      <details class="collapsible-section" open>
        <summary>Current M7 Parameter Snapshot / 目前 M7 v2 參數快照</summary>
        <div class="group-box">
          <div class="group-title">M7 v2 weights（總分權重）</div>
          <table class="preview-table">
            <tbody>
              <tr><td>valuation</td><td>${pct(w.valuation)}</td><td>trend</td><td>${pct(w.trend)}</td></tr>
              <tr><td>structure</td><td>${pct(w.structure)}</td><td>timing</td><td>${pct(w.timing)}</td></tr>
              <tr><td>money</td><td>${pct(w.money)}</td><td>formula</td><td>0.45 valuation + 0.25 trend + 0.20 structure + 0 timing + 0.10 money</td></tr>
            </tbody>
          </table>
        </div>
        <div class="group-box">
          <div class="group-title">Trend internal weights（趨勢內部權重）</div>
          <table class="preview-table">
            <tbody>
              <tr><td>linear</td><td>${pct(tw.linear)}</td><td>MA200</td><td>${pct(tw.ma200)}</td></tr>
              <tr><td>acceleration</td><td>${pct(tw.acceleration)}</td><td>annualization</td><td>${trend.annualization_formula || "annualized = exp(weekly_slope * 52) - 1"}</td></tr>
              <tr><td>acceleration period</td><td>${trend.periods?.acceleration_recent_weeks || "--"} weeks</td><td>compare</td><td>${trend.periods?.acceleration_compare || "--"}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="group-box">
          <div class="group-title">Fallback Rule（歷史資料不足規則）</div>
          <div class="mini">${legacy.rule || "if history_weeks < 156 then use m7_raw_score; else use m7_v2_score"}</div>
          <div class="mini" style="margin-top:6px;">Reason: ${legacy.reason || "--"}</div>
        </div>
        <div class="group-box">
          <div class="group-title">Valuation / Money status</div>
          <div class="mini">Valuation: ${val.formula || "--"}</div>
          <div class="mini" style="margin-top:6px;">Money: ${money.status || "--"} ｜ inputs: ${(money.current_inputs || []).join(", ") || "--"}</div>
        </div>
      </details>
    `;
  }

  function renderTrendDiagnosticsLeaderboard(scoreRows) {
    const rows = [...(scoreRows || [])]
      .filter(r => r && r.symbol)
      .sort((a, b) => num(b.trend_score, -999) - num(a.trend_score, -999))
      .slice(0, 18);

    return `
      <details class="collapsible-section" open>
        <summary>Trend Diagnostics Leaderboard / 趨勢診斷排行</summary>
        <div class="group-box">
          <table class="preview-table">
            <thead>
              <tr>
                <th>Symbol</th><th>Trend</th><th>Linear %</th><th>MA %</th><th>Recent 3Y %</th><th>Accel Δ%</th>
                <th>Linear Score</th><th>MA Score</th><th>Accel Score</th><th>Mode</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${r.symbol || "--"}</td>
                  <td>${formatNum(r.trend_score)}</td>
                  <td>${formatNum(r.trend_linear_annualized_pct)}</td>
                  <td>${formatNum(r.trend_ma_annualized_pct)}</td>
                  <td>${formatNum(r.trend_recent_3y_annualized_pct)}</td>
                  <td>${formatNum(r.trend_acceleration_annualized_delta_pct)}</td>
                  <td>${formatNum(r.trend_linear_score)}</td>
                  <td>${formatNum(r.trend_ma_score)}</td>
                  <td>${formatNum(r.trend_acceleration_score)}</td>
                  <td>${r.trend_mode || "--"}</td>
                </tr>
              `).join("") || "<tr><td colspan='10'>No rows</td></tr>"}
            </tbody>
          </table>
          <div class="mini" style="margin-top:8px;">Trend 新公式：linear / MA 都以 weekly slope × 52 年化；acceleration = recent 3Y annualized - full annualized。</div>
        </div>
      </details>
    `;
  }

  function renderFallbackMonitor(scoreRows) {
    const rows = (scoreRows || []).filter(r => r?.m7_v2_fallback_to_raw || r?.trend_fallback_to_raw || num(r?.history_weeks, 9999) < 156);
    return `
      <details class="collapsible-section">
        <summary>Fallback Monitor / 歷史資料不足監控（${rows.length}）</summary>
        <div class="group-box">
          <table class="preview-table">
            <thead>
              <tr><th>Symbol</th><th>History Weeks</th><th>Horizon</th><th>Effective Score</th><th>Source</th><th>Reason</th></tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${r.symbol || "--"}</td>
                  <td>${r.history_weeks ?? "--"}</td>
                  <td>${r.history_horizon_used || "--"}</td>
                  <td>${formatNum(r.m7_effective_score ?? r.m7_v2_score ?? r.m7_raw_score)}</td>
                  <td>${r.m7_effective_score_source || (r.m7_v2_fallback_to_raw ? "m7_raw_score" : "m7_v2_score")}</td>
                  <td>${r.trend_fallback_reason || "history_weeks < 156"}</td>
                </tr>
              `).join("") || "<tr><td colspan='6'>No fallback rows. All rows have enough history.</td></tr>"}
            </tbody>
          </table>
        </div>
      </details>
    `;
  }

  function renderRankingDelta(scoreRows) {
    const rows = [...(scoreRows || [])].filter(r => r && r.symbol);
    const oldRank = [...rows]
      .sort((a, b) => num(b.m7_raw_score, -999) - num(a.m7_raw_score, -999))
      .reduce((m, r, i) => (m[r.symbol] = i + 1, m), {});

    const newRanked = [...rows]
      .sort((a, b) => num(b.m7_effective_score ?? b.m7_v2_score, -999) - num(a.m7_effective_score ?? a.m7_v2_score, -999))
      .map((r, i) => ({
        ...r,
        raw_rank: oldRank[r.symbol] || null,
        effective_rank: i + 1,
        rank_delta: (oldRank[r.symbol] || i + 1) - (i + 1)
      }));

    const movers = newRanked
      .filter(r => Math.abs(num(r.rank_delta, 0)) > 0)
      .sort((a, b) => Math.abs(num(b.rank_delta, 0)) - Math.abs(num(a.rank_delta, 0)))
      .slice(0, 20);

    return `
      <details class="collapsible-section">
        <summary>Ranking Delta / Raw vs Effective 排名變化</summary>
        <div class="group-box">
          <table class="preview-table">
            <thead>
              <tr><th>Symbol</th><th>Raw Rank</th><th>Effective Rank</th><th>Δ Rank</th><th>Raw</th><th>V2</th><th>Effective</th><th>Source</th></tr>
            </thead>
            <tbody>
              ${movers.map(r => `
                <tr>
                  <td>${r.symbol || "--"}</td>
                  <td>${r.raw_rank ?? "--"}</td>
                  <td>${r.effective_rank ?? "--"}</td>
                  <td>${r.rank_delta > 0 ? "+" : ""}${r.rank_delta}</td>
                  <td>${formatNum(r.m7_raw_score)}</td>
                  <td>${formatNum(r.m7_v2_score)}</td>
                  <td>${formatNum(r.m7_effective_score ?? r.m7_v2_score)}</td>
                  <td>${r.m7_effective_score_source || "--"}</td>
                </tr>
              `).join("") || "<tr><td colspan='8'>No rank delta rows.</td></tr>"}
            </tbody>
          </table>
        </div>
      </details>
    `;
  }


  function defaultWhatIfParams() {
    const w = M7_PARAM_CONFIG?.m7_v2_weights || {};
    const tw = M7_PARAM_CONFIG?.trend?.internal_weights || {};
    const fb = M7_PARAM_CONFIG?.legacy_raw_fallback || {};
    return {
      valuation: num(w.valuation, 0.45),
      trend: num(w.trend, 0.25),
      structure: num(w.structure, 0.20),
      timing: num(w.timing, 0.00),
      money: num(w.money, 0.10),
      linear: num(tw.linear, 0.35),
      ma200: num(tw.ma200, 0.50),
      acceleration: num(tw.acceleration, 0.15),
      fallbackWeeks: num(fb.fallback_history_weeks, 156)
    };
  }

  function renderWhatIfSimulator(scoreRows) {
    const p = defaultWhatIfParams();
    const input = (key, label, value, step = '0.01') => `
      <div class="control-item">
        <label>${label}</label>
        <input class="m7-sim-input" data-key="${key}" type="number" step="${step}" value="${value}" />
      </div>
    `;

    return `
      <details class="collapsible-section" open>
        <summary>MM v1.6 What-if Simulator / 前端即時參數模擬</summary>
        <div class="group-box">
          <div class="group-title">A. M7 v2 top weights（總分權重）</div>
          <div class="control-grid">
            ${input('valuation', 'valuation weight', p.valuation)}
            ${input('trend', 'trend weight', p.trend)}
            ${input('structure', 'structure weight', p.structure)}
            ${input('timing', 'timing weight', p.timing)}
            ${input('money', 'money weight', p.money)}
          </div>
          <div class="mini" id="m7-sim-top-sum" style="margin-top:8px;"></div>
        </div>

        <div class="group-box">
          <div class="group-title">B. Trend internal weights（趨勢內部權重）</div>
          <div class="control-grid">
            ${input('linear', 'linear weight', p.linear)}
            ${input('ma200', 'MA200 weight', p.ma200)}
            ${input('acceleration', 'acceleration weight', p.acceleration)}
            ${input('fallbackWeeks', 'fallback weeks', p.fallbackWeeks, '1')}
          </div>
          <div class="mini" id="m7-sim-trend-sum" style="margin-top:8px;"></div>
        </div>

        <div class="top-actions" style="margin:12px 0;">
          <button id="m7-sim-recalc" type="button">Recalculate What-if</button>
          <button id="m7-sim-reset" type="button">Reset to Config</button>
        </div>

        <div class="group-box">
          <div class="group-title">C. Ranking Impact（前端重算，不寫回 config）</div>
          <div id="m7-what-if-results">${renderWhatIfResultsTable(scoreRows, p)}</div>
        </div>
        <div class="mini">說明：此區只用目前 m7_v2_scores.json 的 factor output 前端重算，方便建立參數手感；不改 Python、不寫回 JSON、不影響 production。</div>
      </details>
    `;
  }

  function readWhatIfParamsFromDom() {
    const base = defaultWhatIfParams();

    // 先讀所有 what-if inputs
    document.querySelectorAll(".m7-sim-input").forEach(input => {
      const key = input.dataset.key;
      if (!key) return;
      const n = num(input.value, null);
      if (n !== null) base[key] = n;
    });

    // 再讀左側 Parameter Brain，讓左側 B1/B2 成為最高優先控制器
    document
      .querySelectorAll("#m7-main-weight-controls .m7-sim-input, #trend-internal-weight-controls .m7-sim-input")
      .forEach(input => {
        const key = input.dataset.key;
        if (!key) return;
        const n = num(input.value, null);
        if (n !== null) base[key] = n;
      });

    return base;
  }

  function whatIfRows(scoreRows, params) {
    const rows = [...(scoreRows || [])].filter(r => r && r.symbol);

    const originalRank = [...rows]
      .sort((a, b) => num(b.m7_effective_score ?? b.m7_v2_score, -999) - num(a.m7_effective_score ?? a.m7_v2_score, -999))
      .reduce((m, r, i) => (m[r.symbol] = i + 1, m), {});

    const changedRows = rows.map(r => {
      const changedTrend =
        params.linear * num(r.trend_linear_score, 0) +
        params.ma200 * num(r.trend_ma_score, 0) +
        params.acceleration * num(r.trend_acceleration_score, 0);

      const changedV2Unclamped =
        params.valuation * num(r.valuation_score, 0) +
        params.trend * changedTrend +
        params.structure * num(r.structure_score, 0) +
        params.timing * num(r.timing_score, 0) +
        params.money * num(r.money_score, 0);

      const fallback = num(r.history_weeks, 999999) < params.fallbackWeeks;
      const changedEffective = fallback ? num(r.m7_raw_score, 0) : changedV2Unclamped;
      const originalEffective = num(r.m7_effective_score ?? r.m7_v2_score, 0);

      return {
        ...r,
        whatif_trend_score: changedTrend,
        whatif_v2_score: changedV2Unclamped,
        whatif_effective_score: changedEffective,
        whatif_fallback_to_raw: fallback,
        whatif_score_delta: changedEffective - originalEffective,
        original_rank: originalRank[r.symbol] || null
      };
    });

    return [...changedRows]
      .sort((a, b) => num(b.whatif_effective_score, -999) - num(a.whatif_effective_score, -999))
      .map((r, i) => ({
        ...r,
        whatif_rank: i + 1,
        whatif_rank_delta: (r.original_rank || i + 1) - (i + 1)
      }));
  }

  function renderWhatIfResultsTable(scoreRows, params) {
    const ranked = whatIfRows(scoreRows, params);
    const movers = ranked
      .sort((a, b) => {
        const ad = Math.abs(num(a.whatif_rank_delta, 0)) * 10 + Math.abs(num(a.whatif_score_delta, 0));
        const bd = Math.abs(num(b.whatif_rank_delta, 0)) * 10 + Math.abs(num(b.whatif_score_delta, 0));
        return bd - ad;
      })
      .slice(0, 24);

    const topSum = params.valuation + params.trend + params.structure + params.timing + params.money;
    const trendSum = params.linear + params.ma200 + params.acceleration;

    return `
      <div class="mini" style="margin-bottom:8px;">
        top weight sum=${topSum.toFixed(3)} ｜ trend internal sum=${trendSum.toFixed(3)} ｜ fallback weeks=${params.fallbackWeeks}
      </div>
      <table class="preview-table">
        <thead>
          <tr>
            <th>Symbol</th><th>Old Rank</th><th>New Rank</th><th>Δ Rank</th>
            <th>Old Eff</th><th>New Eff</th><th>Δ Score</th>
            <th>New Trend</th><th>New V2</th><th>Fallback?</th>
          </tr>
        </thead>
        <tbody>
          ${movers.map(r => `
            <tr>
              <td>${r.symbol || '--'}</td>
              <td>${r.original_rank ?? '--'}</td>
              <td>${r.whatif_rank ?? '--'}</td>
              <td>${r.whatif_rank_delta > 0 ? '+' : ''}${r.whatif_rank_delta}</td>
              <td>${formatNum(r.m7_effective_score ?? r.m7_v2_score)}</td>
              <td>${formatNum(r.whatif_effective_score)}</td>
              <td>${formatNum(r.whatif_score_delta, 3)}</td>
              <td>${formatNum(r.whatif_trend_score)}</td>
              <td>${formatNum(r.whatif_v2_score)}</td>
              <td>${r.whatif_fallback_to_raw ? 'YES' : 'NO'}</td>
            </tr>
          `).join('') || "<tr><td colspan='10'>No rows</td></tr>"}
        </tbody>
      </table>
    `;
  }

  function updateWhatIfSummary(params) {
    const topBox = document.getElementById('m7-sim-top-sum');
    const trendBox = document.getElementById('m7-sim-trend-sum');
    const topSum = params.valuation + params.trend + params.structure + params.timing + params.money;
    const trendSum = params.linear + params.ma200 + params.acceleration;
    if (topBox) topBox.textContent = `Top weights sum = ${topSum.toFixed(3)}（建議接近 1.000；這裡先允許 what-if 不強制 normalize）`;
    if (trendBox) trendBox.textContent = `Trend internal weights sum = ${trendSum.toFixed(3)}（建議接近 1.000）`;
  }

  function bindWhatIfSimulator(scoreRows) {
    const recalc = () => {
      const params = readWhatIfParamsFromDom();
      updateWhatIfSummary(params);
      const resultBox = document.getElementById('m7-what-if-results');
      if (resultBox) resultBox.innerHTML = renderWhatIfResultsTable(scoreRows, params);
    };

    const recalcBtn = document.getElementById('m7-sim-recalc');
    const resetBtn = document.getElementById('m7-sim-reset');
    if (recalcBtn) recalcBtn.addEventListener('click', recalc);
    document.querySelectorAll('.m7-sim-input').forEach(input => input.addEventListener('input', recalc));
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        const p = defaultWhatIfParams();
        document.querySelectorAll('.m7-sim-input').forEach(input => {
          const key = input.dataset.key;
          if (key && p[key] !== undefined) input.value = p[key];
        });
        recalc();
      });
    }
    recalc();
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

    const fallbackRows = rows.filter(r => r?.m7_v2_fallback_to_raw || r?.trend_fallback_to_raw || num(r?.history_weeks, 9999) < 156);
    const trendRows = rows.filter(r => r?.trend_linear_annualized_pct !== undefined || r?.trend_ma_annualized_pct !== undefined);

    const automationActions = [
      "Step 1: edit configs/mm/m7_v2_parameter_config.json",
      "Step 2: run python scripts/new/build_m7_v2_scores.py",
      "Step 3: validate m7_v2_scores.json output fields",
      "Step 4: inspect ranking delta / fallback monitor / trend diagnostics in MM dashboard"
    ];

    const taskNotes = dashboardData?.active_build_context?.current_task || "--";

    box.innerHTML = `
      <div class="group-box">
        <div class="group-title">Automation Status</div>
        <div class="mini">Current Task: ${taskNotes}</div>
        <table class="preview-table">
          <tbody>
            <tr><td>M7 analysis entry</td><td><a href="./m7.html">Open mm/m7.html</a></td><td>mode</td><td>config-driven sandbox</td></tr>
            <tr><td>score rows</td><td>${rows.length}</td><td>runtime symbols</td><td>${runtimeKeys.length}</td></tr>
            <tr><td>avg confidence</td><td>${avgConfidence}</td><td>data warnings</td><td>${warningRows.length}</td></tr>
            <tr><td>coverage &lt; 80</td><td>${lowCoverageRows.length}</td><td>missing_price_refs</td><td>${missingPriceRefRows.length}</td></tr>
            <tr><td>trend annualized fields</td><td>${trendRows.length}</td><td>fallback rows</td><td>${fallbackRows.length}</td></tr>
          </tbody>
        </table>
      </div>
      ${renderWhatIfSimulator(rows)}
      ${renderM7ParameterSnapshot()}
      ${renderTrendDiagnosticsLeaderboard(rows)}
      ${renderFallbackMonitor(rows)}
      ${renderRankingDelta(rows)}
      <details class="collapsible-section">
        <summary>Automation Sequence / 控制中心自動化序列</summary>
        <div class="group-box mini">${automationActions.map(x => `• ${x}`).join("<br>")}</div>
      </details>
      <details class="collapsible-section">
        <summary>Operator Notes / 操作說明</summary>
        <div class="group-box mini">
          • 此區塊用來確認 MM config → Python engine → M7 sandbox output 已接通。<br>
          • 目前 dashboard 讀取 config 與 score output，但不直接執行 Python；調完 config 後仍需在本機跑 engine。<br>
          • trend_score 可大於 10，因為我們已把 trend 視為 raw alpha signal；m7_v2_score 仍會依總分公式聚合。<br>
          • timing factor 不刪除，但 M7 v2 weight = 0；M6 可用同一 engine 改不同權重。
        </div>
      </details>
    `;
    bindWhatIfSimulator(rows);
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


  function renderParameterBrainDirectControls() {
    const mainBox = document.getElementById("m7-main-weight-controls");
    const trendBox = document.getElementById("trend-internal-weight-controls");
    const p = defaultWhatIfParams();

    const row = (key, nowVal) => `
      <div class="form-row mm-brain-row" data-key="${key}" data-original="${Number(nowVal).toFixed(2)}">
        <div>${key}</div>
        <div>${Number(nowVal).toFixed(2)}</div>
        <div>
          <input
            class="m7-sim-input mm-brain-input"
            data-key="${key}"
            type="number"
            step="0.01"
            value="${Number(nowVal).toFixed(2)}"
          />
        </div>
        <div class="mm-brain-delta">0.00</div>
      </div>
    `;

    if (mainBox) {
      const keys = ["valuation", "trend", "structure", "timing", "money"];
      mainBox.innerHTML = keys.map(key => row(key, p[key] ?? 0)).join("");
    }

    if (trendBox) {
      const keys = ["linear", "ma200", "acceleration"];
      trendBox.innerHTML = keys.map(key => row(key, p[key] ?? 0)).join("");
    }

    document.querySelectorAll(".mm-brain-input").forEach(input => {
      input.oninput = () => {
        const key = input.dataset.key;
        const rowEl = input.closest(".mm-brain-row");
        const original = num(rowEl?.dataset.original, 0);
        const changed = num(input.value, original);
        const deltaEl = rowEl?.querySelector(".mm-brain-delta");

        if (deltaEl) {
          const d = changed - original;
          deltaEl.textContent = Math.abs(d) < 0.000001 ? "0.00" : (d > 0 ? "+" : "") + d.toFixed(2);
          deltaEl.className = "mm-brain-delta " + (d > 0 ? "delta-pos" : d < 0 ? "delta-neg" : "delta-flat");
        }

        // 同步同 key 的 hidden what-if simulator input，避免 hidden inputs 覆蓋左側參數
        document.querySelectorAll(`.m7-sim-input[data-key="${key}"]`).forEach(other => {
          if (other !== input) other.value = input.value;
        });

        refreshImpactOnly();
      };
    });
  }


  function renderStocksDisplayTable() {
    const tbody = document.getElementById("stocks-display-tbody");
    if (!tbody) return;

    const searchInput = document.getElementById("stock-table-search");
    const sortSelect = document.getElementById("stock-table-sort");
    const categorySelect = document.getElementById("stock-table-category");

    const runtimeRows = getRuntimeRows();
    const params = readWhatIfParamsFromDom();
    let rows = whatIfRows(getScoreRows(), params);

    // populate category dropdown once
    if (categorySelect && categorySelect.options.length <= 1) {
      const cats = Array.from(new Set(rows.map(r => r.category).filter(Boolean))).sort();
      cats.forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        categorySelect.appendChild(opt);
      });
    }

    const keyword = String(searchInput?.value || "").trim().toUpperCase();
    const category = String(categorySelect?.value || "").trim();
    const sortKey = sortSelect?.value || "rank_delta";

    if (keyword) {
      rows = rows.filter(r =>
        String(r.symbol || "").toUpperCase().includes(keyword) ||
        String(r.name || "").toUpperCase().includes(keyword)
      );
    }

    if (category) {
      rows = rows.filter(r => String(r.category || "") === category);
    }

    rows.sort((a, b) => {
      if (sortKey === "new_score") return num(b.whatif_effective_score, -999) - num(a.whatif_effective_score, -999);
      if (sortKey === "score_delta") return num(b.whatif_score_delta, -999) - num(a.whatif_score_delta, -999);
      if (sortKey === "symbol") return String(a.symbol || "").localeCompare(String(b.symbol || ""));
      return Math.abs(num(b.whatif_rank_delta, 0)) - Math.abs(num(a.whatif_rank_delta, 0));
    });

    const statusText = (r) => {
      const parts = [];
      if (r.today_fcn_pool_status) parts.push(r.today_fcn_pool_status);
      if (r.pool30 || r.in_pool30) parts.push("pool30");
      if (r.recommendation) parts.push(r.recommendation);
      if (!parts.length) {
        const s = num(r.whatif_effective_score ?? r.m7_effective_score ?? r.m7_v2_score, 0);
        if (s >= 8) parts.push("推薦");
        else if (s >= 7) parts.push("候選");
        else parts.push("觀察");
      }
      return parts.join(" / ");
    };

    const deltaClass = (v) => v > 0 ? "delta-pos" : v < 0 ? "delta-neg" : "delta-flat";

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="13">No rows</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const rt = runtimeRows[r.symbol] || {};
      const price = rt.price_now ?? r.price_now ?? r.price;
      const dayDelta = rt.ret_1d ?? r.ret_1d;
      const oldRank = r.original_rank ?? "--";
      const newRank = r.whatif_rank ?? "--";
      const m1Now = r.m1_score;
      const m7Now = r.m7_effective_score ?? r.m7_v2_score ?? r.m7_raw_score;
      const m7New = r.whatif_effective_score ?? m7Now;
      const expandHtml = `
        <details class="subsection" style="margin:6px 0;">
          <summary>Detail</summary>
          <div class="subsection-body">
            <b>L1 M1</b> ｜ M1 Score: ${formatNum(r.m1_score)}<br>
            <b>L2 M2</b> ｜ status: ${r.today_fcn_pool_status || "--"}<br>
            <b>L3 M7</b> ｜ valuation ${formatNum(r.valuation_score)}, trend ${formatNum(r.trend_score)}, structure ${formatNum(r.structure_score)}, timing ${formatNum(r.timing_score)}, money ${formatNum(r.money_score)}<br>
            <b>L4 M8</b> ｜ reserved for fair rate / basket linkage<br>
            <b>L5 M6</b> ｜ reserved for stock execution / market comment
          </div>
        </details>
      `;

      return `
        <tr>
          <td>${expandHtml}</td>
          <td>${oldRank}</td>
          <td>${newRank}</td>
          <td><b>${r.symbol || "--"}</b><br><span class="muted">${r.name || "--"}</span></td>
          <td>${formatNum(price)}</td>
          <td class="${deltaClass(num(dayDelta, 0))}">${formatNum(dayDelta)}%</td>
          <td>${formatNum(m1Now)}</td>
          <td>${formatNum(m1Now)}</td>
          <td>${formatNum(m7Now)}</td>
          <td class="${deltaClass(num(m7New,0)-num(m7Now,0))}">${formatNum(m7New)}</td>
          <td>${r.category || "--"}</td>
          <td>${r.category_sub || r.subsector || "--"}</td>
          <td>${statusText(r)}</td>
        </tr>
      `;
    }).join("");
  }

  function bindStocksDisplayTable() {
    const searchInput = document.getElementById("stock-table-search");
    const sortSelect = document.getElementById("stock-table-sort");
    const categorySelect = document.getElementById("stock-table-category");
    const refreshBtn = document.getElementById("stock-table-refresh");

    if (searchInput) searchInput.oninput = renderStocksDisplayTable;
    if (sortSelect) sortSelect.onchange = renderStocksDisplayTable;
    if (categorySelect) categorySelect.onchange = renderStocksDisplayTable;
    if (refreshBtn) refreshBtn.onclick = renderStocksDisplayTable;
  }


  async function init() {
    try {
      clearError();

      const [dashboardRes, scoresRes, auditRes, runtimeRes, m7ParamConfigRes] = await Promise.all([
        fetch(DATA_PATH, { cache: "no-store" }),
        fetch(SCORES_PATH, { cache: "no-store" }),
        fetch(AUDIT_PATH, { cache: "no-store" }),
        fetch(RUNTIME_PATH, { cache: "no-store" }),
        fetch(M7_PARAM_CONFIG_PATH, { cache: "no-store" })
      ]);

      if (!dashboardRes.ok) throw new Error(`讀取失敗：${dashboardRes.status}`);

      DASHBOARD_DATA = await dashboardRes.json();
      SCORES_DATA = scoresRes.ok ? await scoresRes.json() : {};
      AUDIT_DATA = auditRes.ok ? await auditRes.json() : {};
      RUNTIME_DATA = runtimeRes.ok ? await runtimeRes.json() : {};
      M7_PARAM_CONFIG = m7ParamConfigRes.ok ? await m7ParamConfigRes.json() : {};

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
      renderParameterBrainDirectControls();
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

      const currentSymbol =
        document.getElementById("stock-query-input")?.value || "NVDA";
      renderStandardStockCard(currentSymbol);
      bindStockQuery();
      bindStocksDisplayTable();
      renderStocksDisplayTable();
      refreshImpactOnly();

    } catch (err) {
      setError(`Engine Progress Dashboard 載入失敗：${err.message}`);
    }
  }
function findStockBySymbol(symbol) {
  const rows = getScoreRows();
  if (!rows.length) return null;

  const s = String(symbol || "").trim().toUpperCase();

  return rows.find(r => r.symbol === s) || null;
}

function renderStandardStockCard(symbol = "NVDA") {
  const stock = findStockBySymbol(symbol);

  const container = document.getElementById("standard-stock-card");
  if (!container) return;

  if (!stock) {
    container.innerHTML = `
      <div class="panel">
        <h3>Stock Not Found</h3>
        <div class="muted">${symbol}</div>
      </div>
    `;
    return;
  }

  const runtime = getRuntimeRows()[stock.symbol] || {};

  const oldScore =
    stock.m7_effective_score ??
    stock.m7_v2_score ??
    stock.m7_raw_score ??
    0;

  const changedRows = whatIfRows(getScoreRows(), readWhatIfParamsFromDom());
  const changedStock =
    changedRows.find(x => x.symbol === stock.symbol) || {};

  const newScore =
    changedStock.whatif_effective_score ??
    oldScore;

  const scoreDelta = newScore - oldScore;

  function fmt(v, d=2){
    const n = Number(v);
    if(!Number.isFinite(n)) return "--";
    return n.toFixed(d);
  }

  function deltaClass(v){
    if(v>0) return "delta-pos";
    if(v<0) return "delta-neg";
    return "delta-flat";
  }

  container.innerHTML = `
  
  <!-- Layer 1 -->
  <div class="panel" style="margin-bottom:12px;">
    <h3>${stock.symbol} | ${stock.name}</h3>

    <div class="grid-3">
      <div class="mini-card">
        <div class="muted">Price</div>
        <b>${fmt(runtime.price_now)}</b>
      </div>

      <div class="mini-card">
        <div class="muted">1D Delta</div>
        <b class="${deltaClass(runtime.ret_1d)}">
          ${fmt(runtime.ret_1d)}%
        </b>
      </div>

      <div class="mini-card">
        <div class="muted">Category</div>
        <b>${stock.category || "--"}</b>
      </div>
    </div>

    <div class="grid-3" style="margin-top:10px;">
      <div class="mini-card">
        <div class="muted">Subsector</div>
        <b>${stock.subsector || "--"}</b>
      </div>

      <div class="mini-card">
        <div class="muted">Category Sub</div>
        <b>${stock.category_sub || "--"}</b>
      </div>

      <div class="mini-card">
        <div class="muted">Archetype</div>
        <b>${stock.valuation_archetype || "--"}</b>
      </div>
    </div>
  </div>

  <!-- Layer 2 -->
  <div class="panel" style="margin-bottom:12px;">
    <h3>Core Scores (Now / New / Delta)</h3>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Now</th>
            <th>New</th>
            <th>Delta</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>M1</td>
            <td>${fmt(stock.m1_score)}</td>
            <td>${fmt(stock.m1_score)}</td>
            <td>--</td>
          </tr>

          <tr>
            <td>M7 Raw</td>
            <td>${fmt(stock.m7_raw_score)}</td>
            <td>${fmt(stock.m7_raw_score)}</td>
            <td>--</td>
          </tr>

          <tr>
            <td>M7 Effective</td>
            <td>${fmt(oldScore)}</td>
            <td>${fmt(newScore)}</td>
            <td class="${deltaClass(scoreDelta)}">
              ${fmt(scoreDelta)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Layer 3 -->
  <div class="panel">
    <h3>Main Factors</h3>

    <div class="grid-5">
      <div class="mini-card">
        <div class="muted">Valuation</div>
        <b>${fmt(stock.valuation_score)}</b>
      </div>

      <div class="mini-card">
        <div class="muted">Trend</div>
        <b>${fmt(stock.trend_score)}</b>
      </div>

      <div class="mini-card">
        <div class="muted">Structure</div>
        <b>${fmt(stock.structure_score)}</b>
      </div>

      <div class="mini-card">
        <div class="muted">Timing</div>
        <b>${fmt(stock.timing_score)}</b>
      </div>

      <div class="mini-card">
        <div class="muted">Money</div>
        <b>${fmt(stock.money_score)}</b>
      </div>
    </div>
  </div>

  <!-- Layer 4 -->
  <details class="subsection">
    <summary>Trend Detail</summary>
    <div class="subsection-body">
      linear annualized:
      ${fmt(stock.trend_linear_annualized_pct)}%
      <br>
      MA annualized:
      ${fmt(stock.trend_ma_annualized_pct)}%
      <br>
      recent 3Y:
      ${fmt(stock.trend_recent_3y_annualized_pct)}%
      <br>
      acceleration:
      ${fmt(stock.trend_acceleration_annualized_delta_pct)}%
    </div>
  </details>

  <details class="subsection">
    <summary>Valuation Detail</summary>
    <div class="subsection-body">
      PE:
      ${fmt(stock.feature_snapshot?.valuation?.forward_pe)}
      <br>
      Anchor:
      ${fmt(stock.feature_snapshot?.valuation?.anchor_pe)}
      <br>
      PEG:
      ${fmt(stock.feature_snapshot?.valuation?.peg)}
      <br>
      EPS Growth:
      ${fmt(stock.feature_snapshot?.valuation?.eps_growth)}%
    </div>
  </details>

  <details class="subsection">
    <summary>Structure Detail</summary>
    <div class="subsection-body">
      Best Model:
      ${stock.best_structure_model}
      <br>
      R²:
      ${fmt(stock.best_structure_r2)}
      <br>
      Stability:
      ${fmt(stock.structure_stability)}
    </div>
  </details>

  <details class="subsection">
    <summary>Data Health</summary>
    <div class="subsection-body">
      Coverage:
      ${fmt(stock.coverage_pct)}%
      <br>
      History Weeks:
      ${stock.history_weeks}
      <br>
      Horizon:
      ${stock.history_horizon_used}
    </div>
  </details>
  `;
}

function bindStockQuery() {
  const btn = document.getElementById("stock-query-btn");
  const input = document.getElementById("stock-query-input");

  if (!btn || !input) return;

  btn.onclick = () => {
    renderStandardStockCard(input.value);
  };

  input.onkeypress = (e) => {
    if (e.key === "Enter") {
      renderStandardStockCard(input.value);
    }
  };
}

  window.MMFullRuntime = {
    init,
    refreshImpactOnly,
    renderParameterBrainDirectControls,
    renderStandardStockCard,
    renderStocksDisplayTable,
    renderM7Readiness,
    renderOutputDemo,
    renderOverview,
    renderActiveBuildContext,
    renderHandoffMemory,
    renderRisks,
    renderMilestones
  };
})();
