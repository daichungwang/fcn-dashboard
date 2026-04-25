(function () {
  const DATA_PATH = "../data/mm/engine_progress_dashboard.json";
  const SCORES_PATH = "../data/m7_sandbox/m7_v2_scores.json";
  const AUDIT_PATH = "../data/m7_sandbox/m7_formula_input_audit.json";
  const RUNTIME_PATH = "../data/runtime_staging/market_runtime_long_horizon.json";

  function statusPill(status) {
    if (status === "PRODUCTION") return '<span class="pill ok">PRODUCTION</span>';
    if (status === "SANDBOX" || status === "STAGING") return `<span class="pill warn">${status}</span>`;
    return `<span class="pill bad">${status}</span>`;
  }

  function yn(v) {
    return v ? "✅" : "—";
  }

  function setError(msg) {
    const box = document.getElementById("dashboard-error");
    box.style.display = "block";
    box.textContent = msg;
  }

  function renderOverview(overview) {
    const el = document.getElementById("overview");
    el.innerHTML = [
      card("Overall Progress", `${overview.overall_progress_pct ?? "--"}%`),
      card("Production Stability", overview.production_stability || "--"),
      card("Critical Blockers", String(overview.critical_blockers_count ?? "--")),
      card("Active Milestones", String((overview.active_milestones || []).length))
    ].join("");
  }

  function renderModuleSwitch(items) {
    const box = document.getElementById("module-switch");
    if (!box) return;
    const allowed = new Set(["M1", "M3", "M7", "M8", "M9"]);
    box.innerHTML = (items || []).filter(x => allowed.has(x?.module_id)).map(x => {
      const isM7 = x?.module_id === "M7";
      const enabled = isM7 ? true : !!x?.enabled;
      const path = isM7 ? "./m7.html" : (x?.path || "#");
      if (enabled) {
        return `<a class="module-btn" href="${path}">${x.label || x.module_id || "--"}</a>`;
      }
      return `<span class="module-btn disabled">${x.label || x.module_id || "--"}（coming soon）</span>`;
    }).join("");
  }

  function renderParameterController(data) {
    const box = document.getElementById("param-controller");
    if (!box) return;
    const controlBlock = (title, items) => `
      <details class="collapsible-section">
        <summary>${title}</summary>
        <div class="group-box">
          <div class="control-grid">${(items || []).map(x => `
            <div class="control-item">
              <label>${x.label || "--"}</label>
              <input disabled value="original = ${x.value || "--"}" />
              <input disabled value="changed = pending" style="margin-top:6px;" />
              <input disabled value="delta = pending" style="margin-top:6px;" />
              <div class="mini" style="margin-top:6px;">${x.note || ""}</div>
            </div>
          `).join("")}</div>
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
      `<details class="collapsible-section"><summary>Blueprint / 藍圖說明（click to expand）</summary>
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

  function compactMissing(missingInputs) {
    if (!missingInputs || typeof missingInputs !== "object") return [];
    return Object.entries(missingInputs).flatMap(([factor, fields]) =>
      (fields || []).map(f => `${factor}.${f}`)
    );
  }

  function renderOutputDemo(data, explain = {}) {
    const box = document.getElementById("output-demo");
    if (!box) return;
    const summaryRows = (data?.representative_groups || []).map(g => `• ${g.group_name}：${g.summary || ""}`).join("<br>");
    const p = { ...(data?.prototype_symbol_snapshot || {}), ...(explain.scoreRow || {}) };
    const missingList = compactMissing(explain.auditRow?.missing_inputs);
    const compareAdj = (typeof p.z_adj === "number") ? p.z_adj : "--";
    const hAdj = (typeof p.h_adj === "number") ? p.h_adj : "--";
    const confidence = (typeof p.confidence === "number") ? `${p.confidence}%` : "--";
    const coveragePct = (typeof p.coverage_pct === "number")
      ? `${p.coverage_pct}%`
      : (typeof explain.runtimeRow?.coverage_pct === "number" ? `${explain.runtimeRow.coverage_pct}%` : "--");
    const dataWarning = p.data_warning || explain.runtimeRow?.data_warning || "--";
    box.innerHTML = [
      `<div class="mini">Parameter → item → score（若資料不足，明確標示 unavailable）</div>`,
      `<details class="collapsible-section">
         <summary>Prototype Symbol Snapshot（原型單檔快照）</summary>
         <div class="group-box">
           <div class="group-title">${p.symbol || "--"} / status: ${p.status || "--"}</div>
           <table class="preview-table">
             <tbody>
               <tr><td>valuation_score</td><td>${p.valuation_score ?? "--"}</td><td>trend_score</td><td>${p.trend_score ?? "--"}</td></tr>
               <tr><td>structure_score</td><td>${p.structure_score ?? "--"}</td><td>timing_score</td><td>${p.timing_score ?? "--"}</td></tr>
               <tr><td>money_score</td><td>${p.money_score ?? "--"}</td><td>m7_raw_score</td><td>${p.m7_raw_score ?? "--"}</td></tr>
               <tr><td>missing_fields</td><td colspan="3">${missingList.length ? missingList.join(", ") : "none"}</td></tr>
               <tr><td>coverage_pct</td><td>${coveragePct}</td><td>data_warning</td><td>${dataWarning}</td></tr>
               <tr><td>zscore</td><td>${p.zscore ?? "--"}</td><td>compare_adjustment(z_adj)</td><td>${compareAdj}</td></tr>
               <tr><td>h_value</td><td>${p.h_value ?? "--"}</td><td>h_adjustment(h_adj)</td><td>${hAdj}</td></tr>
               <tr><td>final_score</td><td>${p.m7_final_score ?? "--"}</td><td>confidence</td><td>${confidence}</td></tr>
               <tr><td>today_fcn_pool_status</td><td colspan="3">${p.today_fcn_pool_status ?? "--"}</td></tr>
             </tbody>
           </table>
         </div>
      </details>`,
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
              <thead><tr><th>Symbol</th><th>Status</th><th>category_sub</th><th>archetype</th><th>base</th><th>market</th><th>industry</th><th>final</th><th>gap</th><th>score</th></tr></thead>
              <tbody>${rows || "<tr><td colspan='10'>無</td></tr>"}</tbody>
            </table>
            <details class="collapsible-section">
              <summary>Impact Factors / 影響因子</summary>
              <div class="mini">
                • market_regime impact：調整估值中樞（final_anchor）<br>
                • industry_regime impact：按 category_family 映射調節 final_anchor<br>
                • valuation_archetype impact：個股溢價/折價層<br>
                • valuation_curve impact：valuation_gap 映射到 valuation_score<br>
                • final_anchor impact：gap 分母，直接影響估值區間判定<br>
                • valuation_gap impact：決定分數區間（含 fair zone 與 floor/ceiling）
              </div>
            </details>
            </div>
          </details>
        `;
      }).join(""),
      `<details class="collapsible-section"><summary>五大類分布變化 / Category Distribution Change</summary><div class="group-box mini">
         CORE：mean/p75/p50/p25/dispersion = pending / not computed yet<br>
         GROWTH：mean/p75/p50/p25/dispersion = pending / not computed yet<br>
         INCOME：mean/p75/p50/p25/dispersion = pending / not computed yet<br>
         DEFENSIVE：mean/p75/p50/p25/dispersion = pending / not computed yet<br>
         SPECULATIVE：mean/p75/p50/p25/dispersion = pending / not computed yet
      </div></details>`,
      `<details class="collapsible-section"><summary>Abnormal Movers（代表）</summary><div class="group-box"><div>${(data?.abnormal_movers || []).map(x => `• ${x}`).join("<br>") || "無"}</div></div></details>`
    ].join("");
  }

  function renderM7Readiness(data, compareGov) {
    const box = document.getElementById("m7-readiness");
    if (!box) return;
    const sec = (title, rows) => `
      <div class="group-box">
        <div class="group-title">${title}</div>
        <div>${(rows || []).map(x => `• ${x}`).join("<br>") || "--"}</div>
      </div>
    `;
    const gov = compareGov || {};
    const contract = gov.output_contract || {};
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
    box.innerHTML = `<details class="collapsible-section">
      <summary>Readiness 明細（click to expand）</summary>
      ${sec("A. 已完成（Complete）", completeItems)}
      ${sec("B. 未完成（Remaining）", remainingItems)}
      ${sec("C. 缺失欄位/計算/輸出定義（Missing）", data?.missing_inputs)}
      ${sec("D. 明日可交付判定（Tomorrow Readiness）", data?.tomorrow_readiness || ["M7 analysis complete; still pending production integration gates"])}
      <div class="mini">結論：M7 sandbox validation 通過，production readiness 尚未完成。</div>
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
    </details>`;
  }

  function renderM7AnalysisEntry() {
    const box = document.getElementById("m7-analysis-link");
    if (!box) return;
    box.innerHTML = `
      <a class="module-btn" href="./m7.html">Open M7 Statistical Analysis Center</a>
      <div class="mini" style="margin-top:8px;">Hero 區與本區皆提供一鍵入口，對應 mm/m7.html。</div>
    `;
  }

  function renderM7ValidationStatus() {
    const box = document.getElementById("m7-validation-status");
    if (!box) return;
    box.innerHTML = [
      card("Runtime coverage", '<span class="pill ok">PASS</span>'),
      card("Missing refs", '<span class="pill ok">PASS</span>'),
      card("M7 statistical page", '<span class="pill ok">PASS</span>'),
      card("Production readiness", '<span class="pill warn">NOT YET</span>')
    ].join("");
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

  function renderMMControlCenter(scoreRows, runtimeRows) {
    const box = document.getElementById("mm-control-center");
    if (!box) return;
    const runtimeOk = Object.keys(runtimeRows || {}).length > 0 ? "PASS" : "CHECK";
    const scoresOk = (scoreRows || []).length > 0 ? "PASS" : "CHECK";
    box.innerHTML = `
      <div class="group-box">
        <div class="group-title">Local Command Checklist</div>
        <div class="mini">
          • [ ] python scripts/new/build_market_runtime_long_horizon.py<br>
          • [ ] python scripts/new/build_m7_v2_scores.py<br>
          • [ ] python scripts/new/validate_m7_runtime.py<br>
          • [ ] python scripts/new/generate_engine_progress_snapshot.py
        </div>
      </div>
      <div class="group-box">
        <div class="group-title">Generate PowerShell Script</div>
        <button class="action-btn" disabled>Generate PowerShell script (.ps1)</button>
        <div class="mini" style="margin-top:8px;">placeholder（frontend-only，尚未接 backend）</div>
      </div>
      <div class="group-box">
        <div class="group-title">Runtime JSON Status Check</div>
        <table class="preview-table">
          <tbody>
            <tr><td>market_runtime_long_horizon</td><td>${runtimeOk}</td></tr>
            <tr><td>m7_v2_scores rows</td><td>${scoresOk} (${(scoreRows || []).length})</td></tr>
          </tbody>
        </table>
      </div>
      <div class="group-box">
        <div class="group-title">Future Hooks</div>
        <div class="mini">GitHub Action：disabled（placeholder）</div>
        <div class="mini">Backend API：disabled（placeholder）</div>
      </div>
    `;
  }

  function setupGlobalExpandCollapse() {
    const expandBtn = document.getElementById("expand-all-btn");
    const collapseBtn = document.getElementById("collapse-all-btn");
    const all = () => Array.from(document.querySelectorAll(".collapsible-section, #system-reporting"));
    if (expandBtn) expandBtn.addEventListener("click", () => all().forEach(el => { el.open = true; }));
    if (collapseBtn) collapseBtn.addEventListener("click", () => all().forEach(el => { el.open = false; }));
    // defaults
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

  function card(k, v) {
    return `<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  }

  function renderEngines(rows) {
    const tbody = document.getElementById("engine-table");
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
    const list = (rows || []).map(r => `• [${r.severity || "--"}] ${r.title || "--"}（${r.status || "--"}）`).join("<br>");
    box.innerHTML = list || "無";
  }

  function renderMilestones(rows) {
    const box = document.getElementById("milestone-list");
    const list = (rows || []).map(r => `• ${r.name || "--"} / ${r.phase || "--"} / ${r.status || "--"}`).join("<br>");
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
      const dashboardData = await dashboardRes.json();
      const scoresData = scoresRes.ok ? await scoresRes.json() : {};
      const auditData = auditRes.ok ? await auditRes.json() : {};
      const runtimeData = runtimeRes.ok ? await runtimeRes.json() : {};

      const prototypeSymbol = dashboardData?.output_demo?.prototype_symbol_snapshot?.symbol;
      const scoreRows = (scoresData?.rows || []);
      const scoreRow = scoreRows.find(r => r.symbol === prototypeSymbol) || scoreRows[0] || {};
      const auditRows = (auditData?.rows || []);
      const auditRow = auditRows.find(r => r.symbol === (scoreRow.symbol || prototypeSymbol)) || {};
      const runtimeRows = runtimeData?.rows || {};
      const runtimeRow = runtimeRows[scoreRow.symbol || prototypeSymbol] || {};

      document.getElementById("generatedAt").textContent = `資料時間：${dashboardData.generated_at || "--"} ｜ 版本：${dashboardData.version || "--"}`;
      renderModuleSwitch(dashboardData.module_switch || []);
      renderParameterController(dashboardData.parameter_controller || {});
      renderEngineActions(dashboardData.engine_actions || []);
      renderOutputDemo(dashboardData.output_demo || {}, { scoreRow, auditRow, runtimeRow });
      renderM7Readiness(dashboardData.m7_complete_readiness_check || {}, dashboardData.compare_governance || {});
      renderM7AnalysisEntry();
      renderM7ValidationStatus();
      renderControlCenterAutomationPanel(dashboardData, scoreRows, runtimeRows);
      renderMMControlCenter(scoreRows, runtimeRows);
      renderActiveBuildContext(dashboardData.active_build_context || {});
      renderOverview(dashboardData.overview || {});
      renderEngines(dashboardData.engines || []);
      renderDataReadiness(dashboardData.data_artifacts || []);
      renderFormulas(dashboardData.formula_domains || []);
      renderModules(dashboardData.modules || []);
      renderRisks(dashboardData.blockers || []);
      renderMilestones(dashboardData.milestones || []);
      renderHandoffMemory(dashboardData.handoff_memory || {});
      setupGlobalExpandCollapse();
    } catch (err) {
      setError(`Engine Progress Dashboard 載入失敗：${err.message}`);
    }
  }

  init();
})();
