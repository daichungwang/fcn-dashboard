// ==========================================
// M7 UI FINAL PRO
// M2風格｜Dashboard四塊｜三大卡
// 對應 m7_runtime_engine.js FINAL
// ==========================================

async function loadM7() {
  try {
    const res = await fetch("./data/m7/m7_new_stock_today.json?v=" + Date.now());
    if (!res.ok) throw new Error("無法讀取 m7_new_stock_today.json");
    const data = await res.json();

    renderTop(data);
    renderDashboard(data);
    renderMainCards(data);
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
      (data.m2_generated_at ? ` ｜ M2更新：${data.m2_generated_at}` : "");
  }
}

// ------------------------------------------
// DASHBOARD（四塊）
// 1. 技術面分析
// 2. Overall
// 3. 投資金額健檢分析
// 4. 今日組合推薦
// ------------------------------------------
function renderDashboard(data) {
  const wrap = document.getElementById("m7-dashboard");
  if (!wrap) return;

  const aggressive = data.aggressive_recommend || [];
  const watch = [...(data.watch_list || [])];
  const conservative = [...(data.conservative_watch || [])];
  const remove = data.remove_list || [];
  const all = data.all || [];

  const overallWatchCount = watch.length + conservative.length;

  const techSummary = [
    `回檔：${num(data.pullback_count)}`,
    `偏熱：${num(data.overheat_count)}`,
    `做頭：${num(data.top_count)}`,
    `年線下行：${num(data.downtrend_count)}`
  ].join(" ｜ ");

  const overallSummary = [
    `總數：${num(data.total_count)}`,
    `積極推薦：${aggressive.length}`,
    `觀察名單：${overallWatchCount}`,
    `建議剔除：${remove.length}`
  ].join(" ｜ ");

  const investHealth = [
    `高曝險：${num(data.high_exposure)}`,
    `中曝險：${num(data.mid_exposure)}`
  ].join(" ｜ ");

  const combo = buildComboSummary(aggressive);

  wrap.innerHTML = `
    <div class="dash-grid">
      ${dashCard(
        "技術面分析",
        techSummary,
        data.market_comment || "以長期趨勢、中期結構、短期波動三層判讀今日風向。"
      )}

      ${dashCard(
        "Overall",
        overallSummary,
        "觀察目前篩選結果與三大分類分布。"
      )}

      ${dashCard(
        "投資金額健檢分析",
        investHealth,
        "用持倉集中度與 Danger / Watch / Healthy 觀察是否該調整曝險。"
      )}

      ${dashCard(
        "今日組合推薦",
        combo.value,
        combo.desc
      )}
    </div>
  `;
}

function dashCard(title, value, desc) {
  return `
    <div class="dash-card">
      <div class="dash-title">${title}</div>
      <div class="dash-value text-block">${value}</div>
      <div class="dash-desc">${desc}</div>
    </div>
  `;
}

function buildComboSummary(aggressive) {
  if (!aggressive || !aggressive.length) {
    return {
      value: "目前無積極推薦",
      desc: "暫無適合的 FCN 模擬組合。"
    };
  }

  const byCategory = {};
  aggressive.forEach(x => {
    const key = x["分類"] || "other";
    if (!byCategory[key]) byCategory[key] = [];
    byCategory[key].push(x["股號"]);
  });

  const parts = Object.entries(byCategory).map(([k, arr]) => {
    return `${k}：${arr.length}檔（${arr.join(" / ")}）`;
  });

  return {
    value: parts.join(" ｜ "),
    desc: "開發階段不限制檔數，先完整顯示 baseline 分類 / 檔數 / 名字。"
  };
}

// ------------------------------------------
// 三大卡
// 1. 積極推薦卡（含今日推薦，排最前）
// 2. 觀察名單卡（含保守觀察）
// 3. 建議剔除卡
// ------------------------------------------
function renderMainCards(data) {
  const wrap = document.getElementById("m7-sections");
  if (!wrap) return;

  const aggressive = sortAggressive(data.aggressive_recommend || []);
  const watchBucket = mergeWatchBucket(data.watch_list || [], data.conservative_watch || []);
  const removeBucket = data.remove_list || [];

  wrap.innerHTML = `
    ${mainCard(
      "積極推薦",
      aggressive,
      "含今日推薦，今日首選會排最前並標示原因。",
      true,
      3
    )}

    ${mainCard(
      "觀察名單",
      watchBucket,
      "整合觀察名單與保守觀察，方便集中追蹤。",
      false,
      1
    )}

    ${mainCard(
      "建議剔除",
      removeBucket,
      "目前結構或風險不適合做 FCN，但保留作為開發觀察。",
      false,
      1
    )}
  `;
}

function mergeWatchBucket(watchList, conservativeWatch) {
  const merged = [...watchList, ...conservativeWatch];
  return merged.sort((a, b) => b.today_score - a.today_score);
}

function sortAggressive(list) {
  return [...list].sort((a, b) => {
    return (b.is_today_highlight === true) - (a.is_today_highlight === true)
      || b.today_score - a.today_score;
  });
}

function mainCard(title, list, desc, defaultOpen = false, previewCount = 3) {
  if (!list || !list.length) return "";

  const preview = list.slice(0, previewCount);
  const hidden = list.slice(previewCount);
  const safeId = "card_" + title.replace(/\s+/g, "_");

  return `
    <div class="main-card">
      <div class="main-header" onclick="toggleMainCard('${safeId}')">
        <div>
          <div class="main-title">${title}</div>
          <div class="main-desc">${desc}</div>
        </div>
        <div class="main-count">${list.length} 檔</div>
      </div>

      <div id="${safeId}" class="main-body ${defaultOpen ? "" : "hidden"}">
        <div class="name-summary">${buildNameSummary(title, list)}</div>

        ${preview.map(cardHTML).join("")}

        ${
          hidden.length > 0
            ? `
          <div class="toggle-row">
            <button class="toggle-btn" onclick="toggleList('${safeId}_list', this, ${list.length})">
              展開全部 (${list.length})
            </button>
          </div>
          <div id="${safeId}_list" class="hidden-list hidden">
            ${hidden.map(cardHTML).join("")}
          </div>
        `
            : ""
        }
      </div>
    </div>
  `;
}

function buildNameSummary(title, list) {
  if (!list || !list.length) return "—";

  if (title === "積極推薦") {
    const highlights = list.filter(x => x.is_today_highlight).map(x => x["股號"]);
    const others = list.filter(x => !x.is_today_highlight).map(x => x["股號"]);

    const parts = [];
    if (highlights.length) parts.push(`今日推薦：${highlights.join(" / ")}`);
    if (others.length) parts.push(`其餘：${others.join(" / ")}`);
    return parts.join(" ｜ ");
  }

  return list.map(x => x["股號"]).join(" / ");
}

// ------------------------------------------
// 股票卡
// ------------------------------------------
function cardHTML(x) {
  const scoreClass = scoreCls(num(x["today_score"]));
  const actionClass = actionCls(x["建議動作"]);
  const warnLevel = x["曝險警示"]?.level || "normal";

  return `
    <div class="stock-card">
      <div class="card-head">
        <div class="card-left">
          <div class="title-row">
            <div class="stock-title">
              ${x.is_today_highlight ? "🔥 " : ""}${safe(x["股號"])} ${safe(x["股名"])}
            </div>
            ${x.is_today_highlight ? `<div class="today-tag">今日推薦</div>` : ""}
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

      ${
        x.is_today_highlight
          ? `
        <div class="highlight-box">
          <strong>今日推薦原因：</strong>${safe(x.today_highlight_reason) || "—"}
        </div>
      `
          : ""
      }

      <div class="summary-box">
        <strong>總結：</strong>${safe(x["最終說明"])}
      </div>

      ${exposureBlock(x, warnLevel)}

      <div class="detail-btn-row">
        <button class="detail-btn" onclick="toggleDetail(this)">展開分析</button>
      </div>

      <div class="detail-wrap hidden">
        ${analysisBlock(x)}
      </div>
    </div>
  `;
}

function exposureBlock(x, warnLevel) {
  const e = x["持倉曝險"] || {};
  const warn = x["曝險警示"] || {};

  return `
    <div class="exposure-box">
      <div class="exposure-head">持倉曝險</div>

      <div class="mini-grid">
        <div class="mini-item">
          <span class="mini-label">FCN數量</span>
          <span class="mini-value">${num(e["FCN數量"])}</span>
        </div>

        <div class="mini-item">
          <span class="mini-label">投入資金比</span>
          <span class="mini-value">${formatNum(num(e["投入資金比"]), 2)}%</span>
        </div>

        <div class="mini-item">
          <span class="mini-label">Danger / Watch / Healthy</span>
          <span class="mini-value">${num(e["Danger"])} / ${num(e["Watch"])} / ${num(e["Healthy"])}</span>
        </div>
      </div>

      <div class="warn-box ${warnLevel}">
        ${safe(warn.text)}
      </div>
    </div>
  `;
}

// ------------------------------------------
// 詳細分析
// 欄位 / 值 / 分數 / 說明
// ------------------------------------------
function analysisBlock(x) {
  const score = x["分數拆解"] || {};
  const valData = x["估值資料"] || {};
  const trend = x["趨勢判讀"] || {};
  const exposure = x["持倉曝險"] || {};

  return `
    ${analysisSection(
      "分數拆解",
      [
        ["欄位", "估值 / 趨勢 / 結構 / 時機 / 資金 / 品質 / 類別"],
        ["值", valueLine(
          `估值：${showValue(score["估值分"])}`,
          `趨勢：${showValue(score["趨勢分"])}`,
          `結構：${showValue(score["結構分"])}`,
          `時機：${showValue(score["時機調整"])}`,
          `資金：${showValue(score["資金分"])}`,
          `品質：${showValue(score["品質分"])}`,
          `類別：${showValue(score["類別調整"])}`
        )],
        ["分數", `總分：${showValue(score["總分"])}`],
        ["說明", "總分用來做排序與分類，但不直接取代你的最終判斷。"]
      ]
    )}

    ${analysisSection(
      "估值面",
      [
        ["欄位", "本益比 / PEG / 成長動能"],
        ["值", valueLine(
          `Forward PE：${showValue(valData["ForwardPE"])}`,
          `PEG：${showValue(valData["PEG"])}`,
          `EPS成長率：${showPercentNum(valData["EPS成長率"])}`
        )],
        ["分數", showValue(score["估值分"])],
        ["說明", safe(x["估值說明"])]
      ]
    )}

    ${analysisSection(
      "技術面",
      [
        ["欄位", "長期趨勢 / 中期結構 / 短期波動"],
        ["值", valueLine(
          `年線：${showValue(trend["年線"])}（12M ${showPercentNum(x["12月漲跌幅"])})`,
          `6月線：${showValue(trend["6月線"])}（${showPercentNum(x["6月漲跌幅"])})`,
          `3月線：${showValue(trend["3月線"])}（${showPercentNum(x["3月漲跌幅"])})`,
          `1W短期波動：${showPercentNum(x["1週漲跌幅"])}`
        )],
        ["分數", valueLine(
          `趨勢分：${showValue(score["趨勢分"])}`,
          `結構分：${showValue(score["結構分"])}`,
          `時機調整：${showValue(score["時機調整"])}`
        )],
        ["說明", safe(x["結構說明"])]
      ]
    )}

    ${analysisSection(
      "資金面",
      [
        ["欄位", "量比 / 市場資金參與度"],
        ["值", `量比：${showValue(x["量比"])}`],
        ["分數", showValue(score["資金分"])],
        ["說明", moneyComment(x)]
      ]
    )}

    ${analysisSection(
      "標的品質",
      [
        ["欄位", "股票投資屬性 / 風險屬性"],
        ["值", valueLine(
          `分類：${safe(x["分類"])}`,
          `風險等級：${safe(x["風險等級"])}`
        )],
        ["分數", valueLine(
          `品質分：${showValue(score["品質分"])}`,
          `類別調整：${showValue(score["類別調整"])}`
        )],
        ["說明", qualityComment(x)]
      ]
    )}

    ${analysisSection(
      "持倉曝險",
      [
        ["欄位", "FCN數量 / 投入比 / 健康度"],
        ["值", valueLine(
          `FCN數量：${num(exposure["FCN數量"])}`,
          `投入金額：USD ${formatInt(exposure["投入金額"])}`,
          `投入比：${formatNum(num(exposure["投入資金比"]), 2)}%`,
          `D/W/H：${num(exposure["Danger"])} / ${num(exposure["Watch"])} / ${num(exposure["Healthy"])}`
        )],
        ["分數", "不直接擋單，只做警示與排序參考"],
        ["說明", safe(x["曝險警示"]?.text)]
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
// 說明文字
// ------------------------------------------
function moneyComment(x) {
  const vr = num(x["量比"]);
  if (vr >= 1.5) return `量比 ${formatNum(vr, 2)}，市場資金明顯追捧，資金面偏強。`;
  if (vr >= 1.0) return `量比 ${formatNum(vr, 2)}，資金面中性偏穩。`;
  if (vr >= 0.7) return `量比 ${formatNum(vr, 2)}，短期資金略保守，但未明顯失血。`;
  return `量比 ${formatNum(vr, 2)} 偏低，資金參與度不足，需觀察是否只是等待量能回流。`;
}

function qualityComment(x) {
  const category = safe(x["分類"]);
  const risk = safe(x["風險等級"]);

  if (category === "core") return `屬核心可接標的，風險屬 ${risk}，適合做為 FCN 基本持股候選。`;
  if (category === "growth") return `屬成長型標的，風險屬 ${risk}，需更重視結構與價格位置。`;
  if (category === "defensive") return `屬防禦型標的，風險相對可控，適合保守配置。`;
  if (category === "income") return `屬收益型標的，需同時觀察事件風險與結構。`;
  return `屬高風險投機類型，僅適合開發期觀察，不宜當作核心 FCN 標的。`;
}

// ------------------------------------------
// Toggle
// ------------------------------------------
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

function showPercentNum(v) {
  if (v === undefined || v === null || v === "") return "--";
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : "--";
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

function safe(v) {
  return v === undefined || v === null ? "" : String(v);
}

document.addEventListener("DOMContentLoaded", loadM7);
