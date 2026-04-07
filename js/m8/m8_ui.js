// ==========================================
// M8 UI FINAL
// 對應：data/m8/m8_today.json
// 路徑：js/m8/m8_ui.js
// ==========================================

async function loadM8() {
  try {
    const res = await fetch("./data/m8/m8_today.json?v=" + Date.now());
    if (!res.ok) throw new Error("無法讀取 m8_today.json");
    const data = await res.json();

    const rows = Array.isArray(data) ? data : (data.scenarios || []);

    renderTop(rows);
    renderDashboard(rows);
    renderSections(rows);
  } catch (err) {
    const wrap = document.getElementById("m8-sections");
    if (wrap) {
      wrap.innerHTML = `<div class="error-box">載入失敗：${err.message}</div>`;
    }
  }
}

// ------------------------------------------
// TOP
// ------------------------------------------
function renderTop(rows) {
  const timeEl = document.getElementById("m8-time");
  const subEl = document.getElementById("m8-subtitle");

  const total = rows.length;
  const doable = rows.filter(x => x["模擬結果"] === "可做").length;
  const watch = rows.filter(x => x["模擬結果"] === "觀察").length;
  const reject = rows.filter(x => x["模擬結果"] === "不做").length;

  if (timeEl) {
    timeEl.innerText = `更新時間：${new Date().toISOString()}`;
  }

  if (subEl) {
    subEl.innerText = `情境總數 ${total} ｜ 可做 ${doable} ｜ 觀察 ${watch} ｜ 不做 ${reject}`;
  }
}

// ------------------------------------------
// DASHBOARD
// ------------------------------------------
function renderDashboard(rows) {
  const wrap = document.getElementById("m8-dashboard");
  if (!wrap) return;

  const doable = rows.filter(x => x["模擬結果"] === "可做");
  const watch = rows.filter(x => x["模擬結果"] === "觀察");
  const reject = rows.filter(x => x["模擬結果"] === "不做");

  const avgScore = avg(rows.map(x => num(x["FCN總分"])));
  const best = rows[0];
  const avgKI = avg(rows.map(x => num(x["KI"])));
  const avgStrike = avg(rows.map(x => num(x["Strike"])));
  const avgGap = avg(rows.map(x => num(x["Gap"])));
  const avgRate = avg(rows.map(x => num(x["利率"])));
  const avgTenor = avg(rows.map(x => num(x["天期月數"])));

  wrap.innerHTML = `
    <div class="dash-grid">
      ${dashCard(
        "Overall",
        `情境 ${rows.length} 組 ｜ 可做 ${doable.length} ｜ 觀察 ${watch.length} ｜ 不做 ${reject.length}`,
        "這裡看今天整體 FCN 模擬分布。"
      )}

      ${dashCard(
        "最佳組合",
        best
          ? `${safe(best["股票組合"]?.join(" / "))} ｜ 分數 ${showValue(best["FCN總分"])}`
          : "目前無資料",
        best ? `最差股票：${safe(best["最差股票"])} ｜ 類型：${safe(best["產品類型"])}` : ""
      )}

      ${dashCard(
        "平均參數",
        `KI ${formatNum(avgKI, 1)} ｜ Strike ${formatNum(avgStrike, 1)} ｜ Gap ${formatNum(avgGap, 1)}`,
        `平均天期 ${formatNum(avgTenor, 1)} 月 ｜ 平均利率 ${formatNum(avgRate, 1)}%`
      )}

      ${dashCard(
        "平均總分",
        `${formatNum(avgScore, 2)}`,
        "用來快速判斷今天整體 FCN 條件是否偏友善。"
      )}
    </div>
  `;
}

function dashCard(title, value, desc) {
  return `
    <div class="dash-card">
      <div class="dash-title">${title}</div>
      <div class="dash-value">${value}</div>
      <div class="dash-desc">${desc}</div>
    </div>
  `;
}

// ------------------------------------------
// Sections
// ------------------------------------------
function renderSections(rows) {
  const wrap = document.getElementById("m8-sections");
  if (!wrap) return;

  const doable = rows.filter(x => x["模擬結果"] === "可做");
  const watch = rows.filter(x => x["模擬結果"] === "觀察");
  const reject = rows.filter(x => x["模擬結果"] === "不做");

  wrap.innerHTML = `
    ${scenarioSection("可做情境", doable, true, 3)}
    ${scenarioSection("觀察情境", watch, false, 2)}
    ${scenarioSection("不做情境", reject, false, 1)}
  `;
}

function scenarioSection(title, list, defaultOpen = false, previewCount = 3) {
  if (!list || !list.length) return "";

  const preview = list.slice(0, previewCount);
  const hidden = list.slice(previewCount);
  const id = "sec_" + title.replace(/\s+/g, "_");

  return `
    <div class="main-card">
      <div class="main-header" onclick="toggleMainCard('${id}')">
        <div>
          <div class="main-title">${title}</div>
          <div class="main-desc">${buildSectionDesc(title, list)}</div>
        </div>
        <div class="main-count">${list.length} 組</div>
      </div>

      <div id="${id}" class="main-body ${defaultOpen ? "" : "hidden"}">
        <div class="name-summary">${buildScenarioSummary(list)}</div>

        ${preview.map(cardHTML).join("")}

        ${
          hidden.length > 0
            ? `
          <div class="toggle-row">
            <button class="toggle-btn" onclick="toggleList('${id}_list', this, ${list.length})">
              展開全部 (${list.length})
            </button>
          </div>
          <div id="${id}_list" class="hidden-list hidden">
            ${hidden.map(cardHTML).join("")}
          </div>
        `
            : ""
        }
      </div>
    </div>
  `;
}

function buildSectionDesc(title, list) {
  if (title === "可做情境") {
    return "依 FCN總分排序，優先顯示最值得先看的情境。";
  }
  if (title === "觀察情境") {
    return "條件部分合理，但仍需等待更佳結構或參數。";
  }
  return "保留作為開發觀察，不代表應執行。";
}

function buildScenarioSummary(list) {
  return list
    .slice(0, 8)
    .map(x => `${safe(x["模擬編號"] || "-")}：${safe((x["股票組合"] || []).join("/"))}`)
    .join(" ｜ ");
}

// ------------------------------------------
// Card
// ------------------------------------------
function cardHTML(x) {
  const scoreClass = scoreCls(num(x["FCN總分"]));
  const resultClass = resultCls(x["模擬結果"]);
  const detailJson = encodeURIComponent(JSON.stringify(x));

  return `
    <div class="stock-card">
      <div class="card-head">
        <div class="card-left">
          <div class="title-row">
            <div class="stock-title">${safe(x["模擬編號"] || "-")}</div>
            <div class="today-tag">${safe(x["模擬結果"])}</div>
          </div>
          <div class="stock-sub">
            股票組合：${safe((x["股票組合"] || []).join(" / "))} ｜ 最差股票：${safe(x["最差股票"])}
          </div>
        </div>

        <div class="card-right">
          <div class="score ${scoreClass}" onclick="showScenarioScore('${detailJson}')">${showValue(x["FCN總分"])}</div>
          <div class="action-pill ${resultClass}">${safe(x["模擬結果"])}</div>
        </div>
      </div>

      <div class="summary-box">
        <strong>參數：</strong>
        KI ${showValue(x["KI"])} ｜ Strike ${showValue(x["Strike"])} ｜ Gap ${showValue(x["Gap"])} ｜
        天期 ${showValue(x["天期月數"])}M ｜ 利率 ${showValue(x["利率"])}% ｜ 類型 ${safe(x["產品類型"])}
      </div>

      <div class="highlight-box">
        <strong>模擬說明：</strong>${safe(x["模擬說明"] || autoComment(x))}
      </div>

      <div class="detail-btn-row">
        <button class="detail-btn" onclick="toggleDetail(this)">展開分析</button>
      </div>

      <div class="detail-wrap hidden">
        ${analysisBlock(x)}
      </div>
    </div>
  `;
}

function analysisBlock(x) {
  return `
    ${analysisSection("股票本質", [
      ["股票組合", safe((x["股票組合"] || []).join(" / "))],
      ["最差股票", safe(x["最差股票"])],
      ["平均基本股票分數", showValue(x["平均基本股票分數"])],
      ["最差股票分數", showValue(x["最差股票分數"])],
      ["股票基本分數組件", showValue(x["股票基本分數組件"])]
    ])}

    ${analysisSection("今日時點", [
      ["平均今日分數", showValue(x["平均今日分數"])],
      ["今日分數組件", showValue(x["今日分數組件"])]
    ])}

    ${analysisSection("FCN條件", [
      ["KI / Strike / Gap", `KI ${showValue(x["KI"])} ｜ Strike ${showValue(x["Strike"])} ｜ Gap ${showValue(x["Gap"])}`],
      ["天期 / 利率 / 類型", `${showValue(x["天期月數"])}M ｜ ${showValue(x["利率"])}% ｜ ${safe(x["產品類型"])}`],
      ["KI分數", showValue(x["KI分數"])],
      ["Gap分數", showValue(x["Gap分數"])],
      ["天期分數", showValue(x["天期分數"])],
      ["利率分數", showValue(x["利率分數"])],
      ["產品類型分數", showValue(x["產品類型分數"])],
      ["條件分數組件", showValue(x["條件分數組件"])]
    ])}

    ${analysisSection("總結", [
      ["FCN總分", showValue(x["FCN總分"])],
      ["模擬結果", safe(x["模擬結果"])],
      ["模擬說明", safe(x["模擬說明"] || autoComment(x))]
    ])}
  `;
}

function analysisSection(title, rows) {
  return `
    <div class="analysis-section">
      <div class="analysis-title">${title}</div>
      ${rows.map(([label, value]) => `
        <div class="analysis-row">
          <div class="analysis-label">${label}</div>
          <div class="analysis-value">${value}</div>
        </div>
      `).join("")}
    </div>
  `;
}

// ------------------------------------------
// Explainable score
// ------------------------------------------
function showScenarioScore(encoded) {
  try {
    const x = JSON.parse(decodeURIComponent(encoded));
    const text = `
模擬編號：${x["模擬編號"] || "-"}

股票基本分數組件：${x["股票基本分數組件"] ?? "--"}
平均今日分數：${x["今日分數組件"] ?? "--"}
條件分數組件：${x["條件分數組件"] ?? "--"}

KI分數：${x["KI分數"] ?? "--"}
Gap分數：${x["Gap分數"] ?? "--"}
天期分數：${x["天期分數"] ?? "--"}
利率分數：${x["利率分數"] ?? "--"}
產品類型分數：${x["產品類型分數"] ?? "--"}

FCN總分：${x["FCN總分"] ?? "--"}
模擬結果：${x["模擬結果"] ?? "--"}
`;
    alert(text);
  } catch (e) {
    alert("分數資料讀取失敗");
  }
}

// ------------------------------------------
// Helpers
// ------------------------------------------
function autoComment(x) {
  const parts = [];

  if (num(x["KI"]) <= 55) parts.push("保護強");
  else if (num(x["KI"]) <= 60) parts.push("保護尚可");
  else parts.push("保護偏弱");

  if (num(x["Gap"]) === 10) parts.push("Gap合理");
  else if (num(x["Gap"]) < 10) parts.push("Gap太小");
  else if (num(x["Gap"]) > 20) parts.push("Gap偏大");
  else parts.push("Gap可接受");

  if (num(x["利率"]) >= 20) parts.push("收益偏高");
  else if (num(x["利率"]) >= 16) parts.push("收益平衡");
  else parts.push("收益一般");

  return parts.join("、");
}

function toggleMainCard(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("hidden");
}

function toggleList(id, btn, total) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("hidden");
  btn.textContent = el.classList.contains("hidden") ? `展開全部 (${total})` : "收合";
}

function toggleDetail(btn) {
  const detail = btn.parentElement.nextElementSibling;
  if (!detail) return;
  detail.classList.toggle("hidden");
  btn.textContent = detail.classList.contains("hidden") ? "展開分析" : "收起分析";
}

function scoreCls(score) {
  if (score >= 8) return "score-good";
  if (score >= 6.5) return "score-mid";
  return "score-bad";
}

function resultCls(result) {
  if (result === "可做") return "pill-add";
  if (result === "觀察") return "pill-watch";
  return "pill-remove";
}

function avg(arr) {
  const valid = arr.filter(v => Number.isFinite(v));
  if (!valid.length) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function showValue(v) {
  return v === undefined || v === null || v === "" ? "--" : v;
}

function formatNum(v, digits = 2) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : "--";
}

function safe(v) {
  return v === undefined || v === null ? "" : String(v);
}

document.addEventListener("DOMContentLoaded", loadM8);
