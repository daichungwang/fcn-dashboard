// ==========================================
// M7 UI（決策版）
// ==========================================

async function loadM7Today() {
  const wrap = document.getElementById("m7-list");

  try {
    const res = await fetch("./data/m7/m7_new_stock_today.json?v=" + Date.now());
    if (!res.ok) {
      throw new Error("json 讀取失敗");
    }

    const data = await res.json();
    const rows = data.today_picks || [];

    document.getElementById("m7-time").innerText =
      "更新時間：" + (data.generated_at || "--");

    document.getElementById("m7-summary").innerText =
      `今日候選 ${data.today_pick_count || 0} / ${data.total_count || 0}`;

    if (!rows.length) {
      wrap.innerHTML = `<div class="empty-box">目前沒有今日候選資料</div>`;
      return;
    }

    wrap.innerHTML = rows.map(renderCard).join("");
  } catch (err) {
    wrap.innerHTML = `<div class="error-box">載入失敗：${err.message}</div>`;
  }
}

function renderCard(row) {
  const badge = getRankBadge(row.排名);
  const reason = row["建議原因"] || autoReason(row);
  const tags = Array.isArray(row["觀察標籤"]) ? row["觀察標籤"] : autoTags(row);
  const scoreWidth = Math.max(0, Math.min(100, Number(row.today_score) || 0));

  return `
    <div class="card">
      <div class="top">
        <div class="left-block">
          <div class="rank-line">
            ${badge ? `<span class="rank-badge">${badge}</span>` : ""}
            <div class="title">${row.排名}. ${safe(row.股號)} ${safe(row.股名)}</div>
          </div>
          <div class="sub">${safe(row.產業)} ｜ 風險：${safe(row.風險等級)}</div>
        </div>

        <div class="right">
          <div class="score ${getScoreClass(row.today_score)}">${safe(row.today_score)}</div>
          <div class="action ${getActionClass(row.建議動作)}">${safe(row.建議動作)}</div>
        </div>
      </div>

      <div class="scorebar-wrap">
        <div class="scorebar-label">Today Score</div>
        <div class="scorebar">
          <div class="scorebar-fill ${getScoreBarClass(row.today_score)}" style="width:${scoreWidth}%"></div>
        </div>
      </div>

      <div class="reason-box">
        <span class="reason-title">判斷：</span>${reason}
      </div>

      <div class="tag-wrap">
        ${tags.map(tag => `<span class="tag">${tag}</span>`).join("")}
      </div>

      <div class="grid">
        <div>股價：<strong>${showValue(row.股價)}</strong></div>
        <div>PEG：<strong>${showValue(row.PEG)}</strong></div>
        <div>估值：<strong>${showValue(row.valuation_score)}</strong></div>
        <div>技術：<strong>${showValue(row.technical_score)}</strong></div>
        <div>資金：<strong>${showValue(row.money_score)}</strong></div>
        <div>Quality：<strong>${showValue(row.quality_score)}</strong></div>
        <div>1W：<strong>${showPercent(row["1週漲跌幅"])}</strong></div>
        <div>1M：<strong>${showPercent(row["1月漲跌幅"])}</strong></div>
        <div>3M：<strong>${showPercent(row["3月漲跌幅"])}</strong></div>
        <div>量比：<strong>${showValue(row["量比"])}</strong></div>
      </div>
    </div>
  `;
}

function getRankBadge(rank) {
  if (rank === 1) return "🔥 今日最強";
  if (rank === 2) return "⭐ 核心觀察";
  return "";
}

function getScoreClass(score) {
  const s = Number(score) || 0;
  if (s >= 75) return "good";
  if (s >= 60) return "mid";
  return "bad";
}

function getScoreBarClass(score) {
  const s = Number(score) || 0;
  if (s >= 75) return "fill-good";
  if (s >= 60) return "fill-mid";
  return "fill-bad";
}

function getActionClass(a) {
  if (a === "加入") return "add";
  if (a === "觀察") return "watch";
  return "remove";
}

function autoReason(row) {
  const reasons = [];

  const v = Number(row.valuation_score) || 0;
  const t = Number(row.technical_score) || 0;
  const m = Number(row.money_score) || 0;

  if (v >= 28) reasons.push("估值合理");
  else if (v <= 10) reasons.push("估值偏貴");

  if (t >= 20) reasons.push("動能偏強");
  else if (t <= 8) reasons.push("動能偏弱");

  if (m >= 15) reasons.push("資金維持流入");
  else if (m <= 6) reasons.push("資金動能不足");

  if (!reasons.length) reasons.push("目前訊號中性，先觀察");

  return reasons.join("，");
}

function autoTags(row) {
  const tags = [];

  const v = Number(row.valuation_score) || 0;
  const t = Number(row.technical_score) || 0;
  const m = Number(row.money_score) || 0;
  const risk = row["風險等級"] || "";

  if (v >= 28) tags.push("估值合理");
  if (t >= 20) tags.push("動能強");
  if (m >= 15) tags.push("資金偏多");
  if (risk === "低") tags.push("低風險");
  if (risk === "高") tags.push("高波動");

  if (!tags.length) tags.push("中性觀察");

  return tags;
}

function showValue(v) {
  return v === undefined || v === null || v === "" ? "--" : v;
}

function showPercent(v) {
  return v === undefined || v === null || v === "" ? "--" : `${v}%`;
}

function safe(v) {
  return v === undefined || v === null ? "" : String(v);
}

document.addEventListener("DOMContentLoaded", loadM7Today);
