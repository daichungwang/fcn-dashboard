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

  function getLineColFromIndex(text, index) {
    const safeIndex = Math.max(0, Math.min(index, text.length));
    const prefix = text.slice(0, safeIndex);
    const lines = prefix.split("\n");
    const line = lines.length;
    const col = (lines[lines.length - 1] || "").length + 1;
    return { line, col };
  }

  function parseDashboardJson(raw) {
    const text = (raw || "").replace(/^\uFEFF/, "");
    try {
      return { data: JSON.parse(text), repaired: false };
    } catch (primaryError) {
      const repairedText = text.replace(/,\s*([}\]])/g, "$1");
      try {
        return { data: JSON.parse(repairedText), repaired: true };
      } catch (secondaryError) {
        const posMatch = /position\s+(\d+)/i.exec(String(primaryError?.message || ""));
        if (posMatch) {
          const pos = Number(posMatch[1]);
          const lc = getLineColFromIndex(text, pos);
          primaryError.message = `${primaryError.message}（約第 ${lc.line} 行，第 ${lc.col} 欄）`;
        }
        throw primaryError;
      }
    }
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

  function renderActiveBuildContext(ctx) {
    const box = document.getElementById("active-build-context");
    if (!box) return;

    const rows = [
      `• 目前任務：${ctx?.current_task || "--"}`,
      `• 本輪重點：${ctx?.current_focus || "--"}`,
      `• 正式版已鎖定模組：${(ctx?.production_modules_locked || []).join(", ") || "--"}`,
      `• 目前 Sandbox：${(ctx?.sandbox_modules_active || []).join(", ") || "--"}`,
      `• 這輪可做：${(ctx?.allowed_scope || []).join(", ") || "--"}`,
      `• 這輪不要動：${(ctx?.forbidden_scope || []).join(", ") || "--"}`
    ];

    box.innerHTML = rows.join("<br>");
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

  function renderData(rows) {
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
      renderActiveBuildContext(dashboardData.active_build_context || {});
      renderOverview(dashboardData.overview || {});
      renderEngines(dashboardData.engines || []);
      renderData(dashboardData.data_artifacts || []);
      renderFormulas(dashboardData.formula_domains || []);
      renderModules(dashboardData.modules || []);
      renderRisks(dashboardData.blockers || []);
      renderMilestones(dashboardData.milestones || []);
      renderHandoffMemory(dashboardData.handoff_memory || {});
      const raw = await res.text();
      const parsed = parseDashboardJson(raw);
      const data = parsed.data;
      if (parsed.repaired) {
        setError("資料檔偵測到常見 JSON 尾逗號，已自動修復後載入。請同步修正原始 JSON。");
      }
      const data = await res.json();

      document.getElementById("generatedAt").textContent = `資料時間：${data.generated_at || "--"} ｜ 版本：${data.version || "--"}`;
      renderActiveBuildContext(data.active_build_context || {});
      renderOverview(data.overview || {});
      renderEngines(data.engines || []);
      renderData(data.data_artifacts || []);
      renderFormulas(data.formula_domains || []);
      renderModules(data.modules || []);
      renderRisks(data.blockers || []);
      renderMilestones(data.milestones || []);
      renderHandoffMemory(data.handoff_memory || {});
    } catch (err) {
      setError(`Engine Progress Dashboard 載入失敗：${err.message}`);
    }
  }

  init();
})();
