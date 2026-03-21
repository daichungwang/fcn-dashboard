function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;"); 
}

function formatPct(value) {
  if (value == null || value === "") return "--";
  const num = Number(value);
  if (Number.isNaN(num)) return escapeHtml(value);
  return `${num > 0 ? "+" : ""}${num.toFixed(1)}%`;
}

function formatNum(value) {
  if (value == null || value === "") return "--";
  const num = Number(value);
  if (Number.isNaN(num)) return escapeHtml(value);
  return num.toFixed(2);
}

function getPositionId(pos, index) {
  return pos.fcn_id || pos.id || `FCN-${index + 1}`;
}

function getWorstOf(pos) {
  if (typeof pos.worst_of === "string" && pos.worst_of) return pos.worst_of;
  if (typeof pos.worstOf === "string" && pos.worstOf) return pos.worstOf;

  if (Array.isArray(pos.underlyings) && pos.underlyings.length > 0) {
    const first = pos.underlyings[0];
    if (typeof first === "string") return first;
    if (first && typeof first.symbol === "string") return first.symbol;
  }

  return "--";
}

function getDistanceToKiRaw(pos) {
  const candidates = [
    pos.distance_to_ki,
    pos.distance_to_lower,
    pos.distance_pct,
    pos.distanceToKi,
    pos.distanceToLower
  ];

  for (const v of candidates) {
    if (v != null && v !== "") {
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

function getDistanceToKi(pos) {
  const raw = getDistanceToKiRaw(pos);
  return raw == null ? "--" : formatPct(raw);
}

function getCoupon(pos) {
  const candidates = [
    pos.coupon_annual,
    pos.coupon,
    pos.rate,
    pos.annual_coupon
  ];

  for (const v of candidates) {
    if (v != null && v !== "") {
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

function getTenor(pos) {
  return pos.tenor_months || pos.tenor || pos.duration_months || pos.months || null;
}

function getMaturity(pos) {
  return pos.maturity || pos.expiry || pos.expiration || pos.maturity_date || null;
}

function hasCoreFields(pos) {
  const hasWorst = getWorstOf(pos) !== "--";
  const hasCoupon = getCoupon(pos) != null;
  const hasTenor = getTenor(pos) != null;
  return hasWorst && hasCoupon && hasTenor;
}

function inferStatus(pos) {
  const raw = String(
    pos.status ||
    pos.health_status ||
    pos.state ||
    pos.condition ||
    pos.bucket ||
    ""
  ).trim();

  if (raw.includes("健康")) return "健康";
  if (raw.includes("追蹤")) return "追蹤";
  if (raw.includes("風險")) return "風險";
  if (raw.includes("待確認")) return "待確認";

  const dist = getDistanceToKiRaw(pos);

  if (dist == null) {
  return hasCoreFields(pos) ? "健康" : "待確認";
}
  

  if (dist <= 0) return "風險";
  if (dist <= 5) return "追蹤";
  return "健康";
}

function getStatusColor(status) {
  if (status === "健康") return "#16a34a";
  if (status === "追蹤") return "#ca8a04";
  if (status === "風險") return "#dc2626";
  return "#6b7280";
}

function renderSummaryCard(title, value, sub = "", tone = "") {
  return `
    <div class="m2-summary-card">
      <div class="m2-summary-title">${escapeHtml(title)}</div>
      <div class="m2-summary-value" style="${tone ? `color:${tone};` : ""}">
        ${escapeHtml(value)}
      </div>
      ${sub ? `<div class="m2-summary-sub">${escapeHtml(sub)}</div>` : ""}
    </div>
  `;
}

function renderDetailLine(label, value) {
  return `
    <div class="m2-detail-line">
      <strong>${escapeHtml(label)}：</strong> ${escapeHtml(value)}
    </div>
  `;
}

function renderPositionCard(pos, index) {
  const id = getPositionId(pos, index);
  const status = inferStatus(pos);
  const statusColor = getStatusColor(status);
  const worstOf = getWorstOf(pos);
  const distance = getDistanceToKi(pos);
  const coupon = getCoupon(pos);
  const tenor = getTenor(pos);
  const maturity = getMaturity(pos);

  const detailHtml = `
    ${renderDetailLine("年化配息", coupon != null ? `${formatNum(coupon)}%` : "--")}
    ${renderDetailLine("天期", tenor != null ? `${escapeHtml(tenor)} 個月` : "--")}
    ${renderDetailLine("到期", maturity || "未提供")}
    ${renderDetailLine("Worst-of", worstOf)}
    ${renderDetailLine("距離下限價", distance)}
  `;

  return `
    <div class="m2-position-card">
      <div class="m2-position-id">${escapeHtml(id)}</div>

      <div class="m2-position-row">
        <strong>狀態：</strong>
        <span style="color:${statusColor};font-weight:700;">${escapeHtml(status)}</span>
      </div>

      <div class="m2-position-row">
        <strong>Worst-of：</strong> ${escapeHtml(worstOf)}
      </div>

      <div class="m2-position-row">
        <strong>距離下限價：</strong> ${escapeHtml(distance)}
      </div>

      <button class="m2-detail-btn" onclick="toggleM2Detail(this)">
        展開詳細
      </button>

      <div class="m2-detail-panel" data-detail style="display:none;">
        ${detailHtml}
      </div>
    </div>
  `;
}

function injectModule2Styles() {
  if (document.getElementById("module2-health-inline-style")) return;

  const style = document.createElement("style");
  style.id = "module2-health-inline-style";
  style.textContent = `
    .m2-wrap{
      background:#f8fafc;
      border:1px solid #e5e7eb;
      border-radius:18px;
      padding:16px;
      margin-bottom:20px;
    }
    .m2-title{
      font-size:20px;
      font-weight:800;
      color:#111;
      margin-bottom:14px;
    }
    .m2-summary-grid{
      display:grid;
      grid-template-columns:repeat(2, 1fr);
      gap:12px;
      margin-bottom:16px;
    }
    .m2-summary-card{
      background:#ffffff;
      border:1px solid #e5e7eb;
      border-radius:16px;
      padding:16px;
      box-shadow:0 2px 8px rgba(0,0,0,0.05);
    }
    .m2-summary-title{
      font-size:14px;
      color:#6b7280;
      margin-bottom:6px;
    }
    .m2-summary-value{
      font-size:24px;
      font-weight:800;
      color:#111;
    }
    .m2-summary-sub{
      margin-top:6px;
      font-size:14px;
      color:#6b7280;
    }
    .m2-urgent-card{
      background:#ffffff;
      border:1px solid #e5e7eb;
      border-radius:16px;
      padding:16px;
      box-shadow:0 2px 8px rgba(0,0,0,0.05);
      margin-bottom:16px;
    }
    .m2-urgent-label{
      font-size:14px;
      color:#6b7280;
      margin-bottom:8px;
    }
    .m2-urgent-id{
      font-size:22px;
      font-weight:800;
      color:#111;
      margin-bottom:8px;
    }
    .m2-urgent-row{
      font-size:15px;
      color:#374151;
      margin-bottom:6px;
    }
    .m2-section-title{
      font-size:18px;
      font-weight:800;
      color:#111;
      margin:18px 0 12px;
    }
    .m2-position-card{
      background:#ffffff;
      border:1px solid #e5e7eb;
      border-radius:16px;
      padding:16px;
      box-shadow:0 2px 8px rgba(0,0,0,0.05);
      margin-bottom:14px;
    }
    .m2-position-id{
      font-size:22px;
      font-weight:800;
      color:#111;
      margin-bottom:10px;
    }
    .m2-position-row{
      font-size:15px;
      color:#374151;
      margin-bottom:8px;
    }
    .m2-detail-btn{
      padding:8px 14px;
      border:1px solid #d1d5db;
      background:#ffffff;
      border-radius:999px;
      font-size:14px;
      font-weight:700;
      color:#2563eb;
      margin-top:4px;
    }
    .m2-detail-panel{
      margin-top:12px;
      background:#f9fafb;
      border:1px solid #e5e7eb;
      border-radius:12px;
      padding:12px;
    }
    .m2-detail-line{
      margin:6px 0;
      font-size:15px;
      color:#374151;
    }
    .m2-empty{
      color:#6b7280;
    }
  `;
  document.head.appendChild(style);
}

export function renderModule2Health(positions = [], pool = []) {
  injectModule2Styles();

  const list = Array.isArray(positions) ? positions : [];
  const enriched = list.map((pos, index) => ({
    ...pos,
    __status: inferStatus(pos),
    __id: getPositionId(pos, index),
    __worst: getWorstOf(pos),
    __distanceRaw: getDistanceToKiRaw(pos)
  }));

  const total = enriched.length;
  const healthy = enriched.filter((p) => p.__status === "健康").length;
  const watch = enriched.filter((p) => p.__status === "追蹤").length;
  const risk = enriched.filter((p) => p.__status === "風險").length;
  const pending = enriched.filter((p) => p.__status === "待確認").length;

  const urgent =
    enriched.find((p) => p.__status === "風險") ||
    enriched.find((p) => p.__status === "追蹤") ||
    enriched.find((p) => p.__status === "待確認") ||
    enriched[0];

  const summaryGrid = `
    <div class="m2-summary-grid">
      ${renderSummaryCard("全部", total, "")}
      ${renderSummaryCard("健康", healthy, total ? `${Math.round((healthy / total) * 100)}%` : "0%", "#16a34a")}
      ${renderSummaryCard("追蹤", watch, total ? `${Math.round((watch / total) * 100)}%` : "0%", "#ca8a04")}
      ${renderSummaryCard("風險 / 待確認", `${risk} / ${pending}`, "", "#dc2626")}
    </div>
  `;

  const urgentHtml = urgent
    ? `
      <div class="m2-urgent-card">
        <div class="m2-urgent-label">最需處理</div>
        <div class="m2-urgent-id">${escapeHtml(urgent.__id)}</div>
        <div class="m2-urgent-row"><strong>Worst-of：</strong> ${escapeHtml(urgent.__worst)}</div>
        <div class="m2-urgent-row"><strong>距離下限價：</strong> ${escapeHtml(getDistanceToKi(urgent))}</div>
        <div class="m2-urgent-row"><strong>狀態：</strong> ${escapeHtml(urgent.__status)}</div>
      </div>
    `
    : "";

  const detailList = enriched.length
    ? enriched.map((pos, index) => renderPositionCard(pos, index)).join("")
    : `<div class="m2-empty">目前沒有持倉資料</div>`;

  return `
    <div class="m2-wrap">
      <div class="m2-title">持倉健康總覽</div>
      ${summaryGrid}
      ${urgentHtml}
      <div class="m2-section-title">持倉明細</div>
      ${detailList}
    </div>
  `;
}
