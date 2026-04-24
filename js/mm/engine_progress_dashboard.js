(function () {
  const DATA_PATH = "../data/mm/engine_progress_dashboard.json";

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
      if (x?.enabled) {
        return `<a class="module-btn" href="${x.path || '#'}">${x.label || x.module_id || "--"}</a>`;
      }
      return `<span class="module-btn disabled">${x.label || x.module_id || "--"}（coming soon）</span>`;
    }).join("");
  }

  function renderParameterController(data) {
    const box = document.getElementById("param-controller");
    if (!box) return;
    const controlBlock = (title, items) => `
      <div class="group-box">
        <div class="group-title">${title}</div>
        <div class="control-grid">${(items || []).map(x => `
          <div class="control-item">
            <label>${x.label || "--"}</label>
            <input disabled value="${x.value || "--"}" />
            <div class="mini" style="margin-top:6px;">${x.note || ""}</div>
          </div>
        `).join("")}</div>
      </div>
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
      `<details><summary>Blueprint / 藍圖說明（click to expand）</summary>
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

  function renderOutputDemo(data) {
    const box = document.getElementById("output-demo");
    if (!box) return;
    box.innerHTML = [
      `<div class="mini">Parameter → item → score（若資料不足，明確標示 unavailable）</div>`,
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
          <div class="group-box">
            <div class="group-title">${g.group_name || "--"}</div>
            <div class="mini">${g.summary || ""}</div>
            <table class="preview-table">
              <thead><tr><th>Symbol</th><th>Status</th><th>category_sub</th><th>archetype</th><th>base</th><th>market</th><th>industry</th><th>final</th><th>gap</th><th>score</th></tr></thead>
              <tbody>${rows || "<tr><td colspan='10'>無</td></tr>"}</tbody>
            </table>
          </div>
        `;
      }).join(""),
      `<div class="group-box"><div class="group-title">Abnormal Movers（代表）</div><div>${(data?.abnormal_movers || []).map(x => `• ${x}`).join("<br>") || "無"}</div></div>`
    ].join("");
  }

  function renderM7Readiness(data) {
    const box = document.getElementById("m7-readiness");
    if (!box) return;
    const sec = (title, rows) => `
      <div class="group-box">
        <div class="group-title">${title}</div>
        <div>${(rows || []).map(x => `• ${x}`).join("<br>") || "--"}</div>
      </div>
    `;
    box.innerHTML = [
      sec("A. 已完成（Complete）", data?.complete),
      sec("B. 未完成（Incomplete）", data?.incomplete),
      sec("C. 缺失欄位/計算/輸出定義（Missing）", data?.missing_inputs),
      sec("D. 明日可交付判定（Tomorrow Readiness）", data?.tomorrow_readiness),
      `<div class="mini">結論：${data?.verdict || "--"}</div>`
    ].join("");
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
      const res = await fetch(DATA_PATH, { cache: "no-store" });
      if (!res.ok) throw new Error(`讀取失敗：${res.status}`);
      const dashboardData = await res.json();

      document.getElementById("generatedAt").textContent = `資料時間：${dashboardData.generated_at || "--"} ｜ 版本：${dashboardData.version || "--"}`;
      renderModuleSwitch(dashboardData.module_switch || []);
      renderParameterController(dashboardData.parameter_controller || {});
      renderEngineActions(dashboardData.engine_actions || []);
      renderOutputDemo(dashboardData.output_demo || {});
      renderM7Readiness(dashboardData.m7_complete_readiness_check || {});
      renderActiveBuildContext(dashboardData.active_build_context || {});
      renderOverview(dashboardData.overview || {});
      renderEngines(dashboardData.engines || []);
      renderDataReadiness(dashboardData.data_artifacts || []);
      renderFormulas(dashboardData.formula_domains || []);
      renderModules(dashboardData.modules || []);
      renderRisks(dashboardData.blockers || []);
      renderMilestones(dashboardData.milestones || []);
      renderHandoffMemory(dashboardData.handoff_memory || {});
    } catch (err) {
      setError(`Engine Progress Dashboard 載入失敗：${err.message}`);
    }
  }

  init();
})();
