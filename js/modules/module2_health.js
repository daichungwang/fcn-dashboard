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

function getStatus(pos) {
  const raw = String(pos.status || pos.health_status || "").trim();
  if (raw.includes("健康")) return "健康";
  if (raw.includes("追蹤")) return "追蹤";
  if (raw.includes("風險")) return "風險";
  if (raw.includes("待確認")) return "待確認";
  return "待確認";
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

function getDistanceToKi(pos) {
  if (pos.distance_to_ki != null) return formatPct(pos.distance_to_ki);
  if (pos.distance_to_lower != null) return formatPct(pos.distance_to_lower);
  if (pos.distance_pct != null) return formatPct(pos.distance_pct);
  return "--";
}

function getCoupon(pos) {
  return pos.coupon_annual || pos.coupon || pos.rate || null;
}

function getTenor(pos) {
  return pos.tenor_months || pos.tenor || pos.duration_months || null;
}

function getMaturity(pos) {
  return pos.maturity || pos.expiry || pos.expiration || null;
}

function renderSummaryCard(title, value, sub = "", tone = "") {
  return `
    <div style="
      background:#ffffff;
      border:1px solid #e5e7eb;
      border-radius:16px;
      padding:16px;
      box-shadow:0 2px 8px rgba(0,0,0,0.05);
    ">
      <div style="font-size:14px;color:#6b7280;margin-bottom:6px;">${escapeHtml(title)}</div>
      <div style="font-size:24px;font-weight:800;color:${tone || "#111"};">${escapeHtml(value)}</div>
      ${sub ? `<div style="margin-top:6px;font-size:14px;color:#6b7280;">${escapeHtml(sub)}</div>` : ""}
    </div>
  `;
}

function renderDetailLine(label, value) {
  return `
    <div style="margin:6px 0;font-size:15px;color:#374151;">
      <strong>${escapeHtml(label)}：</strong> ${escapeHtml(value)}
    </div>
  `;
}

function renderPositionCard(pos, index) {
  const id = getPositionId(pos, index);
  const status = getStatus(pos);
  const worstOf = getWorstOf(pos);
  const distance = getDistanceToKi(pos);
  const coupon = getCoupon(pos);
  const tenor = getTenor(pos);
  const maturity = getMaturity(pos);

  const statusColor =
    status === "健康" ? "#16a34a" :
    status === "追蹤" ? "#ca8a04" :
    status === "風險" ? "#dc2626" :
    "#6b7280";

  const detailHtml = `
    ${renderDetailLine("年化配息", coupon != null ? `${formatNum(coupon)}%` : "--")}
    ${renderDetailLine("天期", tenor != null ? `${escapeHtml(tenor)} 個月` : "--")}
    ${renderDetailLine("到期", maturity || "未提供")}
    ${renderDetailLine("到期狀況", pos.maturity_status || "待確認")}
    ${renderDetailLine("Worst-of", worstOf)}
    ${renderDetailLine("距離下限價", distance)}
  `;

  return `
    <div style="
      background:#ffffff;
      border:1px solid #e5e7eb;
      border-radius:16px;
      padding:16px;
      box-shadow:0 2px 8px rgba(0,0,0,0.05);
      margin-bottom:14px;
    ">
      <div style="font-size:22px;font-weight:800;color:#111;margin-bottom:8px;">
        ${escapeHtml(id)}
      </div>

      <div style="font-size:15px;color:#374151;margin-bottom:6px;">
        <strong>狀態：</strong>
        <span style="color:${statusColor};font-weight:700;">${escapeHtml(status)}</span>
      </div>

      <div style="font-size:15px;color:#374151;margin-bottom:6px;">
        <strong>Worst-of：</strong> ${escapeHtml(worstOf)}
      </div>

      <div style="font-size:15px;color:#374151;margin-bottom:10px;">
        <strong>距離下限價：</strong> ${escapeHtml(distance)}
      </div>

      <button onclick="toggleM2Detail(this)" style="
        padding:8px 14px;
        border:1px solid #d1d5db;
        background:#ffffff;
        border-radius:999px;
        font-size:14px;
        font-weight:700;
        color:#2563eb;
      ">展開詳細</button>

      <div style="display:none;margin-top:12px;">
        <div style="
          background:#f9fafb;
          border:1px solid #e5e7eb;
          border-radius:12px;
          padding:12px;
        ">
          ${detailHtml}
        </div>
      </div>
    </div>
  `;
}

export function renderModule2Health(positions = [], pool = []) {
  const list = Array.isArray(positions) ? positions : [];
  const total = list.length;

  const healthy = list.filter((p) => getStatus(p) === "健康").length;
  const watch = list.filter((p) => getStatus(p) === "追蹤").length;
  const risk = list.filter((p) => getStatus(p) === "風險").length;
  const pending = list.filter((p) => getStatus(p) === "待確認").length;

  const urgent =
    list.find((p) => getStatus(p) === "風險") ||
    list.find((p) => getStatus(p) === "追蹤") ||
    list.find((p) => getStatus(p) === "待確認") ||
    list[0];

  const summaryGrid = `
    <div style="
      display:grid;
      grid-template-columns:repeat(2, 1fr);
      gap:12px;
      margin-bottom:16px;
    ">
      ${renderSummaryCard("全部", total, "")}
      ${renderSummaryCard("健康", healthy, total ? `${Math.round((healthy / total) * 100)}%` : "0%", "#16a34a")}
      ${renderSummaryCard("追蹤", watch, total ? `${Math.round((watch / total) * 100)}%` : "0%", "#ca8a04")}
      ${renderSummaryCard("風險 / 待確認", `${risk} / ${pending}`, "", "#dc2626")}
    </div>
  `;

  const urgentHtml = urgent
    ? `
      <div style="
        background:#ffffff;
        border:1px solid #e5e7eb;
        border-radius:16px;
        padding:16px;
        box-shadow:0 2px 8px rgba(0,0,0,0.05);
        margin-bottom:16px;
      ">
        <div style="font-size:14px;color:#6b7280;margin-bottom:8px;">最需處理</div>
        <div style="font-size:22px;font-weight:800;color:#111;margin-bottom:8px;">
          ${escapeHtml(getPositionId(urgent, 0))}
        </div>
        <div style="font-size:15px;color:#374151;margin-bottom:6px;">
          <strong>Worst-of：</strong> ${escapeHtml(getWorstOf(urgent))}
        </div>
        <div style="font-size:15px;color:#374151;">
          <strong>距離下限價：</strong> ${escapeHtml(getDistanceToKi(urgent))}
        </div>
      </div>
    `
    : "";

  const detailList = list.length
    ? list.map((pos, index) => renderPositionCard(pos, index)).join("")
    : `<div style="color:#6b7280;">目前沒有持倉資料</div>`;

  return `
    <div style="
      background:#f8fafc;
      border:1px solid #e5e7eb;
      border-radius:18px;
      padding:16px;
      margin-bottom:20px;
    ">
      <div style="font-size:20px;font-weight:800;color:#111;margin-bottom:14px;">
        持倉健康總覽
      </div>

      ${summaryGrid}
      ${urgentHtml}

      <div style="font-size:18px;font-weight:800;color:#111;margin-bottom:12px;">
        持倉明細
      </div>

      ${detailList}
    </div>
  `;
}
