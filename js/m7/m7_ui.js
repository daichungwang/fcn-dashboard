// ==========================================
// M7 UI FINAL PRO
// Dashboard + 分區 + 展開分析 + M2 曝險整合
// ==========================================

async function loadM7() {
  try {
    const res = await fetch("./data/m7/m7_new_stock_today.json?v=" + Date.now());
    if (!res.ok) throw new Error("無法讀取 m7_new_stock_today.json");
    const data = await res.json();

    renderTop(data);
    renderDashboard(data);
    renderSections(data);
  } catch (err) {
    const wrap = document.getElementById("m7-sections");
    if (wrap) {
      wrap.innerHTML = `<div class="error-box">載入失敗：${err.message}</div>`;
    }
  }
}

// ------------------------------------------
// TOP
// ------------------------------------------
function renderTop(data) {
  const timeEl = document.getElementById("m7-time");
  const subEl = document.getElementById("m7-subtitle");

  if (timeEl) {
    timeEl.innerText = `更新時間：${safe(data.generated_at) || "--"}`;
  }

  if (subEl) {
    subEl.innerText =
      `M7 總樣本 ${num(data.total_count)} 檔` +
      (data.m2_generated_at ? ` ｜ M2 更新：${data.m2_generated_at}` : "");
  }
}

// ------------------------------------------
// DASHBOARD
// ------------------------------------------
function renderDashboard(data) {
  const wrap = document.getElementById("m7-dashboard");
  if (!wrap) return;

  const all = data.all || [];
  const todayRecommend = data.today_recommend || [];
  const conservativeWatch = data.conservative_watch || [];
  const removeList = data.remove_list || [];
  const aggressiveRecommend = data.aggressive_recommend || [];
  const watchList = data.watch_list || [];

  const avgScore = avg(all.map(x => num(x["today_score"])));
  const avgPEG = avg(all.map(x => num(x["估值資料"]?.["PEG"])));
  const avgVolRatio = avg(all.map(x => num(x["量比"])));

  const pullbackCount = all.filter(x => x["趨勢判讀"]?.["結構狀態"] === "pullback").length;
  const hotCount = all.filter(x => x["趨勢判讀"]?.["結構狀態"] === "hot").length;
  const topCount = all.filter(x => x["趨勢判讀"]?.["結構狀態"] === "top").length;
  const downtrendCount = all.filter(x => x["趨勢判讀"]?.["趨勢狀態"] === "down").length;

  const highExposureCount = all.filter(x => x["曝險警示"]?.level === "high").length;
  const mediumExposureCount = all.filter(x => x["曝險警示"]?.level === "medium").length;

  wrap.innerHTML = `
    <div class="dash-grid">
      ${dashCard("積極推薦", aggressiveRecommend.length, "今日推薦中，扣除曝險過高標的")}
      ${dashCard("今日推薦", todayRecommend.length, "條件符合，可列入今日候選")}
      ${dashCard("觀察名單", watchList.length, "保守觀察中，曝險較可控者")}
      ${dashCard("保守觀察", conservativeWatch.length, "條件部分符合，仍需等待")}
      ${dashCard("建議剔除", removeList.length, "結構或風險不適合 FCN")}
      ${dashCard("平均總分", formatNum(avgScore, 1), "全部樣本平均 today score")}
    </div>

    <div class="dash-grid dash-grid-2">
      ${dashCard("回檔結構", pullbackCount, "長期向上、中期回檔，較理想")}
      ${dashCard("偏熱結構", hotCount, "結構健康，但位置偏熱")}
      ${dashCard("做頭結構", topCount, "3M / 6M 同步轉弱")}
      ${dashCard("年線下行", downtrendCount, "長期趨勢有問題")}
      ${dashCard("高曝險警示", highExposureCount, "投入比或 FCN 參與度偏高")}
      ${dashCard("中曝險警示", mediumExposureCount, "應控制加碼節奏")}
    </div>

    <div class="dash-notes">
      <div class="note-card">
        <div class="note-title">整體市場 / 結構概況</div>
        <div class="note-text">
          平均 PEG：<strong>${formatNum(avgPEG, 2)}</strong> ｜ 
          平均量比：<strong>${formatNum(avgVolRatio, 2)}</strong><br>
          目前較理想的「回檔結構」共 <strong>${pullbackCount}</strong> 檔，
          「做頭結構」共 <strong>${topCount}</strong> 檔。
        </div>
      </div>

      <div class="note-card">
        <div class="note-title">開發版說明</div>
        <div class="note-text">
          目前畫面保留全部股票，包含低分與建議剔除名單，目的是協助觀察不同結構、估值、資金與持倉曝險狀態。
        </div>
      </div>
    </div>
  `;
}

function dashCard(title, value, sub) {
  return `
    <div class="dash-card">
      <div class="dash-title">${title}</div>
      <div class="dash-value">${value}</div>
      <div class="dash-sub">${sub}</div>
    </div>
  `;
}

// ------------------------------------------
// 分區
// ------------------------------------------
function renderSections(data) {
  const wrap = document.getElementById("m7-sections");
  if (!wrap) return;

  wrap.innerHTML = `
    ${section("積極推薦", data.aggressive_recommend || [], "最值得優先查看；條件符合，且目前曝險不算過高。")}
    ${section("今日推薦", data.today_recommend || [], "符合今日候選邏輯，但不代表可無限制加碼。")}
    ${section("觀察名單", data.watch_list || [], "保守觀察中，相對可追蹤的名單。")}
    ${section("保守觀察", data.conservative_watch || [], "條件部分符合，需等待更佳結構或價格。")}
    ${section("建議剔除", data.remove_list || [], "目前結構或風險不適合做 FCN，但保留供開發觀察。")}
  `;
}

function section(title, list, desc) {
  if (!list || !list.length) return "";

  const preview = list.slice(0, 3);
  const hidden = list.slice(3);
  const sectionId = "sec_" + title.replace(/\s+/g, "_");

  return `
    <div class="section-block">
      <div class="section-head">
        <div>
          <div class="section-title">${title}</div>
          <div class="section-desc">${desc}</div>
        </div>
        <div class="section-count">${list.length} 檔</div>
      </div>

      <div class="section-cards">
        ${preview.map(cardHTML).join("")}
      </div>

      ${
        hidden.length > 0
          ? `
        <div class="section-toggle-row">
          <button class="toggle-btn" onclick="toggleSection('${sectionId}', this)">
            展開全部 (${list.length})
          </button>
        </div>
        <div id="${sectionId}" class="hidden-list hidden">
          ${hidden.map(cardHTML).join("")}
        </div>
      `
          : ""
      }
    </div>
  `;
}

// ------------------------------------------
// 卡片
// ------------------------------------------
function cardHTML(x) {
  const warn = x["曝險警示"] || {};
  const scoreClass = scoreCls(num(x["today_score"]));
  const actionClass = actionCls(x["建議動作"]);
  const bucket = safe(x["ui_bucket"]);

  return `
    <div class="stock-card">
      <div class="card-head">
        <div class="card-left">
          <div class="title-row">
            <div class="stock-title">${safe(x["股號"])} ${safe(x["股名"])}</div>
            <div class="bucket-tag">${bucket}</div>
          </div>
          <div class="stock-sub">
            ${safe(x["產業"])} ｜ ${safe(x["子產業"])} ｜ 分類：${safe(x["分類"])} ｜ 風險：${safe(x["風險等級"])}
          </div>
        </div>

        <div class="card-right">
          <div class="score ${scoreClass}">${num(x["today_score"])}</div>
          <div class="action-pill ${actionClass}">${safe(x["建議動作"])}</div>
        </div>
      </div>

      <div class="summary-box">
        <strong>總結：</strong>${safe(x["最終說明"])}
      </div>

      ${exposureBlock(x)}

      <div class="detail-btn-row">
        <button class="detail-btn" onclick="toggleDetail(this)">展開分析</button>
      </div>

      <div class="detail-wrap hidden">
        ${analysisBlock(x)}
      </div>
    </div>
  `;
}

// ------------------------------------------
// 曝險區塊
// ------------------------------------------
function exposureBlock(x) {
  const e = x["持倉曝險"] || {};
  const warn = x["曝險警示"] || {};

  return `
    <div class="exposure-box">
      <div class="exposure-head">持倉曝險</div>

      <div class="mini-grid">
        <div class="mini-item"><span class="mini-label">FCN數量</span><span class="mini-value">${num(e["FCN數量"])}</span></div>
        <div class="mini-item"><span class="mini-label">投入資金比</span><span class="mini-value">${formatNum(num(e["投入資金比"]), 2)}%</span></div>
        <div class="mini-item"><span class="mini-label">Danger / Watch / Healthy</span><span class="mini-value">${num(e["Danger"])} / ${num(e["Watch"])} / ${num(e["Healthy"])}</span></div>
      </div>

      <div class="warn-box ${warn.level || "normal"}">
        ${safe(warn.text)}
      </div>
    </div>
  `;
}

// ------------------------------------------
// 分析區
// ------------------------------------------
function analysisBlock(x) {
  const breakdown = x["分數拆解"] || {};
  const valData = x["估值資料"] || {};
  const trend = x["趨勢判讀"] || {};
  const exp = x["持倉曝險"] || {};

  return `
    ${analysisSection(
      "估值面",
      [
        ["本益比 / PEG", valueLine(
          `Forward PE：${showValue(valData["ForwardPE"])}`,
          `PEG：${showValue(valData["PEG"])}`
        )],
        ["成長動能", showPercent(valData["EPS成長率"])],
        ["估值分數", showValue(breakdown["估值分"])],
        ["判斷", valuationComment(x)]
      ]
    )}

    ${analysisSection(
      "技術面",
      [
        ["長期趨勢", valueLine(
          `年線：${showValue(trend["年線"])}`,
          `12M：${showPercent(x["12月漲跌幅"])}`
        )],
        ["中期結構", valueLine(
          `6月線：${showValue(trend["6月線"])} / ${showPercent(x["6月漲跌幅"])}`,
          `3月線：${showValue(trend["3月線"])} / ${showPercent(x["3月漲跌幅"])}`
        )],
        ["短期波動", valueLine(
          `1W短期波動：${showPercent(x["1週漲跌幅"])}`,
          `溫度：${showValue(trend["溫度狀態"])}`
        )],
        ["分數", valueLine(
          `趨勢分：${showValue(breakdown["趨勢分"])}`,
          `結構分：${showValue(breakdown["結構分"])}`,
          `時機調整：${showValue(breakdown["時機調整"])}`
        )],
        ["說明", safe(x["結構說明"])]
      ]
    )}

    ${analysisSection(
      "資金面",
      [
        ["量比", showValue(x["量比"])],
        ["資金分數", showValue(breakdown["資金分"])],
        ["判斷", moneyComment(x)]
      ]
    )}

    ${analysisSection(
      "標的品質",
      [
        ["品質等級", qualityLabel(x, breakdown)],
        ["品質分數", showValue(breakdown["品質分"])],
        ["類別調整", showValue(breakdown["類別調整"])],
        ["判斷", qualityComment(x)]
      ]
    )}

    ${analysisSection(
      "持倉曝險",
      [
        ["參與程度", valueLine(
          `FCN數量：${num(exp["FCN數量"])}`,
          `投入金額：USD ${formatInt(exp["投入金額"])}`
        )],
        ["投入資金比", `${formatNum(num(exp["投入資金比"]), 2)}%`],
        ["健康度分析", `${num(exp["Danger"])} / ${num(exp["Watch"])} / ${num(exp["Healthy"])}`],
        ["判斷", safe(x["曝險警示"]?.text)]
      ]
    )}

    <div class="analysis-section">
      <div class="analysis-title">Why / Why not</div>
      <div class="why-grid">
        <div class="why-box">
          <div class="why-title">Why</div>
          <div class="why-body">${renderWhyList(x["why_yes"])}</div>
        </div>
        <div class="why-box">
          <div class="why-title">Why not</div>
          <div class="why-body">${renderWhyList(x["why_no"])}</div>
        </div>
      </div>
    </div>

    <div class="analysis-section">
      <div class="analysis-title">分數拆解</div>
      <div class="formula-box">
        估值 ${showValue(breakdown["估值分"])}
        + 趨勢 ${showValue(breakdown["趨勢分"])}
        + 結構 ${showValue(breakdown["結構分"])}
        + 時機 ${showValue(breakdown["時機調整"])}
        + 資金 ${showValue(breakdown["資金分"])}
        + 品質 ${showValue(breakdown["品質分"])}
        + 類別 ${showValue(breakdown["類別調整"])}
        = <strong>${showValue(breakdown["總分"])}</strong>
      </div>
    </div>
  `;
}

function analysisSection(title, rows) {
  return `
    <div class="analysis-section">
      <div class="analysis-title">${title}</div>
      <div class="analysis-table">
        ${rows.map(([label, value]) => `
          <div class="analysis-row">
            <div class="analysis-label">${label}</div>
            <div class="analysis-value">${value}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

// ------------------------------------------
// Comment builders
// ------------------------------------------
function valuationComment(x) {
  const valData = x["估值資料"] || {};
  const peg = num(valData["PEG"]);
  const pe = num(valData["ForwardPE"]);
  const growth = num(valData["EPS成長率"]);
  const model = safe(x["估值模型"]);

  if (model === "ETF") {
    return "ETF 不適用 PEG，採中性估值。";
  }

  if (model === "NON_PEG") {
    return `這類股票不以 PEG 為主，觀察本益比 ${formatNum(pe, 1)} 與成長率 ${formatNum(growth, 1)}%，目前採中性估值。`;
  }

  let pegText = "合理";
  if (peg > 1.6) pegText = "偏高";
  else if (peg > 1.3) pegText = "偏貴";
  else if (peg < 0.8) pegText = "偏低";

  let growthText = "穩健";
  if (growth >= 25) growthText = "強";
  else if (growth < 10) growthText = "弱";

  return `PEG ${formatNum(peg, 2)}，本益比約 ${formatNum(pe, 1)}，成長動能 ${growthText}；整體估值 ${pegText}。`;
}

function moneyComment(x) {
  const vr = num(x["量比"]);
  if (vr >= 1.5) return `市場資金明顯追捧，量比 ${formatNum(vr, 2)}，資金面偏強。`;
  if (vr >= 1.0) return `市場資金維持正常，量比 ${formatNum(vr, 2)}，資金面中性。`;
  if (vr >= 0.7) return `量比 ${formatNum(vr, 2)}，短期資金略保守，但未明顯失血。`;
  return `量比 ${formatNum(vr, 2)} 偏低，雖然短期股價可能偏弱，但需觀察是否只是等待量能回流。`;
}

function qualityComment(x) {
  const category = safe(x["分類"]);
  const risk = safe(x["風險等級"]);
  if (category === "core") return `屬核心可接標的，風險屬 ${risk}，可作為基本持股候選。`;
  if (category === "growth") return `屬成長型標的，風險屬 ${risk}，需更重視結構與價格位置。`;
  if (category === "defensive") return `屬防禦型標的，風險相對可控，適合保守配置。`;
  if (category === "income") return `屬收益型標的，需同時觀察事件風險與結構。`;
  return `屬高風險投機類型，需特別謹慎。`;
}

function qualityLabel(x, breakdown) {
  const score = num(breakdown["品質分"]);
  let level = "中";
  if (score >= 5) level = "高";
  else if (score < 0) level = "低";
  return `${level}（${safe(x["分類"])} / 風險 ${safe(x["風險等級"])})`;
}

// ------------------------------------------
// Toggle
// ------------------------------------------
function toggleSection(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("hidden");
  btn.textContent = el.classList.contains("hidden") ? "展開全部" : "收合";
}

function toggleDetail(btn) {
  const detail = btn.parentElement.nextElementSibling;
  if (!detail) return;
  detail.classList.toggle("hidden");
  btn.textContent = detail.classList.contains("hidden") ? "展開分析" : "收起分析";
}

// ------------------------------------------
// helpers
// ------------------------------------------
function renderWhyList(arr) {
  if (!Array.isArray(arr) || !arr.length) return "—";
  return arr.map(x => `<div class="why-item">• ${safe(x)}</div>`).join("");
}

function valueLine(...items) {
  return items.filter(Boolean).join(" ｜ ");
}

function scoreCls(score) {
  if (score >= 75) return "score-good";
  if (score >= 55) return "score-mid";
  return "score-bad";
}

function actionCls(action) {
  if (action === "加入") return "pill-add";
  if (action === "觀察") return "pill-watch";
  return "pill-remove";
}

function showValue(v) {
  return v === undefined || v === null || v === "" ? "--" : v;
}

function showPercent(v) {
  return v === undefined || v === null || v === "" ? "--" : `${formatNum(v, 2)}%`;
}

function formatNum(v, digits = 2) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : "--";
}

function formatInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : "--";
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function avg(arr) {
  const valid = arr.filter(v => Number.isFinite(v));
  if (!valid.length) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function safe(v) {
  return v === undefined || v === null ? "" : String(v);
}

document.addEventListener("DOMContentLoaded", loadM7);
