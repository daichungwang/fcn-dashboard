/* ==========================================================================
   MM Item 8 Stock Allocation Health
   File: js/mm/modules/mm_item8_stock_allocation_health.js

   Read-only UI module.
   Expected DOM:
   - #mm-item8-stock-allocation-health
   ========================================================================== */

(function () {
  "use strict";

  const DATA_PATH = "../data/mm/item8_stock_allocation_health.json";
  const CONTAINER_ID = "mm-item8-stock-allocation-health";
  const TARGETS = {
    Core: 40,
    Growth: 25,
    "Defensive / Income": 15,
    Speculative: 10,
    ETF: 10
  };

  function $(id) {
    return document.getElementById(id);
  }

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function num(v, fallback = null) {
    if (v === null || v === undefined || v === "") return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function fmtAmount(v) {
    const n = num(v);
    if (n === null) return "--";
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function fmtPct(v) {
    const n = num(v);
    if (n === null) return "--";
    return `${n.toFixed(2)}%`;
  }

  function arr(v) {
    return Array.isArray(v) ? v : [];
  }

  function tone(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("risk") || text.includes("high") || text.includes("too") || text.includes("over")) return "bad";
    if (text.includes("watch") || text.includes("under") || text.includes("concentration")) return "warn";
    if (text.includes("healthy") || text.includes("normal")) return "ok";
    return "neutral";
  }

  function healthLabel(row, warnings, type) {
    const name = row.name || row.symbol || "";
    if (type === "category") {
      const hit = warnings.find(w => String(w.message || "").startsWith(name) || String(w.code || "").includes(String(name).toUpperCase().split(" ")[0]));
      if (hit) return hit.message || hit.code;
      return "Normal";
    }
    if (type === "theme") {
      const hit = warnings.find(w => String(w.message || "").startsWith(name) || String(w.code || "").startsWith(String(name).toUpperCase()));
      if (hit) return hit.message || hit.code;
      return "Normal";
    }
    return row.concentration && row.concentration !== "Normal" ? `Concentration ${row.concentration}` : "Normal";
  }

  function recommendation(row) {
    if (row.invested === 0 || row.available > 0) return "Candidate to add";
    if (row.category === "Speculative") return "Control exposure";
    return "Hold / monitor";
  }

  function topHoldings(rows, key, value, limit = 5) {
    const items = arr(rows)
      .filter(r => r && r[key] === value)
      .sort((a, b) => num(b.exposure, 0) - num(a.exposure, 0))
      .slice(0, limit)
      .map(r => `${r.symbol || "--"} ${fmtPct(r.weight)}`);
    return items.length ? items.join(" / ") : "--";
  }

  function actionForCategory(row, warnings) {
    const label = healthLabel(row, warnings, "category");
    if (label.includes("Overweight") || label.includes("Concentration")) return "Pause adds / rebalance";
    if (label.includes("Underweight")) return "Consider adding quality names";
    if (row.name === "Speculative") return "Keep capped";
    return "Maintain";
  }

  function renderWarnings(warnings) {
    if (!warnings.length) return `<div class="mm-item8-empty">No active warnings.</div>`;
    return `
      <div class="mm-item8-warnings">
        ${warnings.map(w => `
          <div class="mm-item8-warning ${tone(w.severity || w.message || w.code)}">
            <b>${esc(w.severity || "Note")}</b>
            <span>${esc(w.message || w.code || "--")}</span>
            ${w.weight !== undefined ? `<em>${fmtPct(w.weight)}</em>` : ""}
          </div>
        `).join("")}
      </div>
    `;
  }

  function table(headers, rows, cls = "") {
    return `
      <div class="mm-item8-table-wrap ${esc(cls)}">
        <table class="mm-item8-table">
          <thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>
          <tbody>${rows.join("")}</tbody>
        </table>
      </div>
    `;
  }

  function render(data) {
    const warnings = arr(data.summary && data.summary.top_warnings);
    const holdings = arr(data.single_name_concentration);
    const categories = arr(data.category_allocation);
    const themes = arr(data.theme_allocation);
    const recs = arr(data.recommendation_priority);
    const health = data.summary && data.summary.overall_health;

    const categoryRows = categories.map(row => {
      const health = healthLabel(row, warnings, "category");
      return `
        <tr>
          <td><b>${esc(row.name)}</b></td>
          <td>${fmtAmount(row.exposure)}</td>
          <td>${fmtPct(row.weight)}</td>
          <td>${TARGETS[row.name] !== undefined ? fmtPct(TARGETS[row.name]) : "--"}</td>
          <td><span class="mm-item8-pill ${tone(health)}">${esc(health)}</span></td>
          <td>${esc(topHoldings(holdings, "category", row.name))}</td>
          <td>${esc(actionForCategory(row, warnings))}</td>
        </tr>
      `;
    });

    const themeRows = themes.map(row => {
      const health = healthLabel(row, warnings, "theme");
      return `
        <tr>
          <td><b>${esc(row.name)}</b></td>
          <td>${fmtAmount(row.exposure)}</td>
          <td>${fmtPct(row.weight)}</td>
          <td><span class="mm-item8-pill ${tone(health)}">${esc(health)}</span></td>
          <td>${esc(topHoldings(holdings, "theme", row.name))}</td>
        </tr>
      `;
    });

    const concentrationRows = holdings.slice(0, 20).map(row => {
      const health = healthLabel(row, warnings, "symbol");
      return `
        <tr>
          <td><b>${esc(row.symbol)}</b></td>
          <td>${fmtAmount(row.exposure)}</td>
          <td>${fmtPct(row.weight)}</td>
          <td><span class="mm-item8-pill ${tone(health)}">${esc(health)}</span></td>
        </tr>
      `;
    });

    const recRows = recs.slice(0, 20).map((row, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><b>${esc(row.symbol)}</b></td>
        <td>${esc(row.category || "--")}</td>
        <td>${esc(row.theme || "--")}</td>
        <td>${fmtAmount(row.invested)}</td>
        <td>${row.m1_score === null || row.m1_score === undefined ? "--" : Number(row.m1_score).toFixed(2)}</td>
        <td>${row.m7_score === null || row.m7_score === undefined ? "--" : Number(row.m7_score).toFixed(2)}</td>
        <td>${esc(recommendation(row))}</td>
        <td>${esc(arr(row.reason).join(" / ") || "--")}</td>
      </tr>
    `);

    return `
      ${style()}
      <div class="mm-item8">
        <div class="mm-item8-panel">
          <div>
            <div class="mm-item8-k">Overall Health</div>
            <div class="mm-item8-title">Stock Allocation Health / 持股分析</div>
            <div class="mm-item8-sub">Runtime summary from item8_stock_allocation_health.json. Exposure is read-only.</div>
          </div>
          <div class="mm-item8-score ${tone(health)}">
            <span>${esc(health || "--")}</span>
            <b>${fmtAmount(data.summary && data.summary.total_worst_of_exposure)}</b>
            <em>Total worst-of exposure</em>
          </div>
        </div>

        <section class="mm-item8-block">
          <h3>Overall Health</h3>
          ${renderWarnings(warnings)}
        </section>

        <section class="mm-item8-block">
          <h3>Category Allocation</h3>
          ${table(["Category", "Invested Amount", "Weight %", "Target %", "Health", "Top Holdings", "Action"], categoryRows)}
        </section>

        <section class="mm-item8-block">
          <h3>Theme Allocation</h3>
          ${table(["Theme", "Invested Amount", "Weight %", "Health / Risk Note", "Top Holdings"], themeRows)}
        </section>

        <section class="mm-item8-block">
          <h3>Single Name Concentration</h3>
          ${table(["Symbol", "Invested Amount", "Weight %", "Health / Warning"], concentrationRows)}
        </section>

        <section class="mm-item8-block">
          <h3>Recommendation Priority Top 20</h3>
          ${table(["Rank", "Symbol", "Category", "Theme", "Current Invested", "M1", "M7", "Recommendation", "Reason"], recRows, "wide")}
        </section>
      </div>
    `;
  }

  function fallback(message) {
    return `
      ${style()}
      <div class="mm-item8">
        <div class="mm-item8-fallback">
          <b>Item 8 data is not available.</b>
          <span>${esc(message || "Please generate data/mm/item8_stock_allocation_health.json.")}</span>
        </div>
      </div>
    `;
  }

  function style() {
    if ($("mm-item8-style")) return "";
    return `
      <style id="mm-item8-style">
        .mm-item8{display:grid;gap:12px}
        .mm-item8-panel{display:flex;justify-content:space-between;gap:14px;align-items:stretch;border:1px solid #e4edf6;border-radius:14px;background:#f8fbff;padding:14px}
        .mm-item8-k{font-size:11px;color:#667085;font-weight:1000;text-transform:uppercase}
        .mm-item8-title{font-size:18px;font-weight:1000;color:#0f172a;margin-top:4px}
        .mm-item8-sub{font-size:12px;line-height:1.45;color:#667085;font-weight:750;margin-top:4px}
        .mm-item8-score{min-width:220px;border:1px solid #dfeaf5;border-radius:13px;background:#fff;padding:12px;text-align:right}
        .mm-item8-score span{display:inline-block;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:1000;border:1px solid #d0d5dd}
        .mm-item8-score b{display:block;font-size:24px;line-height:1.1;margin-top:8px;color:#0f172a}
        .mm-item8-score em{display:block;font-style:normal;font-size:11px;color:#667085;font-weight:800;margin-top:3px}
        .mm-item8-score.ok span,.mm-item8-pill.ok{background:#eaf8f1;color:#188b58;border-color:#ccead9}
        .mm-item8-score.warn span,.mm-item8-pill.warn{background:#fff4df;color:#b9770e;border-color:#f1dfb5}
        .mm-item8-score.bad span,.mm-item8-pill.bad{background:#fff0f0;color:#be3f3f;border-color:#f0cfcf}
        .mm-item8-block{border:1px solid #e4edf6;border-radius:14px;background:#fff;padding:12px}
        .mm-item8-block h3{font-size:14px;margin:0 0 9px;color:#0f172a}
        .mm-item8-warnings{display:grid;gap:8px}
        .mm-item8-warning{display:flex;align-items:center;gap:8px;border:1px solid #e4edf6;border-radius:12px;padding:8px 10px;background:#f8fafc;font-size:12px;line-height:1.35}
        .mm-item8-warning.bad{background:#fff0f0;border-color:#f0cfcf;color:#8a2525}
        .mm-item8-warning.warn{background:#fff4df;border-color:#f1dfb5;color:#875a08}
        .mm-item8-warning b{font-size:11px;text-transform:uppercase}
        .mm-item8-warning span{font-weight:800}
        .mm-item8-warning em{margin-left:auto;font-style:normal;font-weight:1000}
        .mm-item8-empty,.mm-item8-fallback{border:1px dashed #d8e4ef;border-radius:12px;background:#f8fafc;padding:12px;color:#667085;font-size:12px;font-weight:800}
        .mm-item8-fallback b{display:block;color:#0f172a;margin-bottom:4px}
        .mm-item8-table-wrap{overflow:auto;border:1px solid #e4edf6;border-radius:12px}
        .mm-item8-table{width:100%;border-collapse:collapse;font-size:12px;min-width:760px}
        .mm-item8-table-wrap.wide .mm-item8-table{min-width:1080px}
        .mm-item8-table th,.mm-item8-table td{padding:8px 9px;border-bottom:1px solid #edf2f7;text-align:left;vertical-align:top}
        .mm-item8-table th{background:#f8fbff;color:#667085;font-size:11px;font-weight:1000;white-space:nowrap}
        .mm-item8-table td{color:#334155;font-weight:750;line-height:1.35}
        .mm-item8-table tbody tr:last-child td{border-bottom:0}
        .mm-item8-pill{display:inline-block;border:1px solid #d0d5dd;border-radius:999px;background:#fff;padding:3px 7px;font-size:11px;font-weight:1000;white-space:nowrap}
        .mm-item8-pill.neutral{background:#f8fafc;color:#475467;border-color:#d8e4ef}
        @media (max-width: 760px){
          .mm-item8-panel{display:grid}
          .mm-item8-score{text-align:left;min-width:0}
        }
      </style>
    `;
  }

  async function init() {
    const root = $(CONTAINER_ID);
    if (!root) return;
    root.innerHTML = `<div>Loading Item 8 data...</div>`;
    try {
      const res = await fetch(DATA_PATH, { cache: "no-store" });
      if (!res.ok) {
        root.innerHTML = fallback(`Cannot load ${DATA_PATH}.`);
        return;
      }
      const data = await res.json();
      if (!data || typeof data !== "object" || !data.summary) {
        root.innerHTML = fallback("Item 8 JSON format is invalid.");
        return;
      }
      root.innerHTML = render(data);
    } catch (e) {
      console.warn("[MMItem8StockAllocationHealth] load failed", e);
      root.innerHTML = fallback("Item 8 JSON is missing or malformed.");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
