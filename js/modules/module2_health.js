function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pctString(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "未提供";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function priceString(v) {
  if (v === null || v === undefined || Number.isNaN(v) || Number(v) <= 0) return "未提供";
  return `${Number(v).toFixed(2)}`;
}

function getToday() {
  return new Date();
}

function daysBetween(a, b) {
  const ms = 1000 * 60 * 60 * 24;
  return Math.ceil((b - a) / ms);
}

function parseDateFlexible(v) {
  if (!v) return null;
  if (v instanceof Date) return v;

  const s = String(v).trim();

  // 先吃民國格式
  const m = s.match(/^(\d{2,3})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (m) {
    const rocYear = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const year = rocYear + 1911;
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) return d;
  }

  // 再吃西元格式
  const iso = s.replace(/\./g, "-").replace(/\//g, "-");
  const d2 = new Date(iso);
  if (!isNaN(d2.getTime())) return d2;

  return null;
}

function getPoolMap(pool) {
  const map = {};
  (pool || []).forEach(item => {
    if (item?.symbol) map[item.symbol] = item;
  });
  return map;
}

function getQuotePrice(symbol, poolMap) {
  const p = safeNum(poolMap?.[symbol]?.price);
  if (p === null || p <= 0) return null;
  return p;
}

function getSymbols(position) {
  if (Array.isArray(position?.underlyings)) return position.underlyings.filter(Boolean);
  if (Array.isArray(position?.symbols)) return position.symbols.filter(Boolean);
  if (typeof position?.symbols === "string") {
    return position.symbols.split(",").map(s => s.trim()).filter(Boolean);
  }
  if (typeof position?.basket === "string") {
    return position.basket.split(",").map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function getRefPriceMap(position) {
  if (position?.refPrice && typeof position.refPrice === "object") return position.refPrice;
  return {};
}

function getKiPriceMap(position) {
  if (position?.kiPrice && typeof position.kiPrice === "object") return position.kiPrice;
  return {};
}

function getStrikePriceMap(position) {
  if (position?.strikePrice && typeof position.strikePrice === "object") return position.strikePrice;
  return {};
}

// 進場價倒推：觸發價(=refPrice) → 下限價格 → 執行價格
function getEntryPrice(symbol, position) {
  const refMap = getRefPriceMap(position);
  const kiMap = getKiPriceMap(position);
  const strikeMap = getStrikePriceMap(position);

  const refPrice = safeNum(refMap[symbol]);
  if (refPrice !== null && refPrice > 0) return refPrice;

  const kiPrice = safeNum(kiMap[symbol]);
  const strikePrice = safeNum(strikeMap[symbol]);

  const kiRatio = safeNum(position.ki);
  const strikeRatio = safeNum(position.strike);

  if (kiPrice !== null && kiPrice > 0 && kiRatio !== null && kiRatio > 0) {
    return kiPrice / kiRatio;
  }

  if (strikePrice !== null && strikePrice > 0 && strikeRatio !== null && strikeRatio > 0) {
    return strikePrice / strikeRatio;
  }

  return null;
}

// 規則：沒有下限價時，下限價 = 執行價
function getLowerBarrierRatio(position) {
  const ki = safeNum(position.ki);
  const strike = safeNum(position.strike);
  if (ki === null || ki === 0) return strike;
  return ki;
}

function getLowerPrice(symbol, position) {
  const kiMap = getKiPriceMap(position);
  const strikeMap = getStrikePriceMap(position);

  const kiPrice = safeNum(kiMap[symbol]);
  if (kiPrice !== null && kiPrice > 0) return kiPrice;

  const strikePrice = safeNum(strikeMap[symbol]);
  if (strikePrice !== null && strikePrice > 0) return strikePrice;

  return null;
}

function getStrikePrice(symbol, position) {
  const strikeMap = getStrikePriceMap(position);
  const strikePrice = safeNum(strikeMap[symbol]);
  if (strikePrice !== null && strikePrice > 0) return strikePrice;
  return null;
}

function getCurrentRatioPct(price, entry) {
  if (price === null || price <= 0 || entry === null || entry <= 0) return null;
  return (price / entry) * 100;
}

function getDistancePct(price, target) {
  if (price === null || price <= 0 || target === null || target <= 0) return null;
  return ((price - target) / target) * 100;
}

function getPerUnderlyingRows(position, poolMap) {
  const symbols = getSymbols(position);

  return symbols.map(symbol => {
    const price = getQuotePrice(symbol, poolMap);
    const entry = getEntryPrice(symbol, position);
    const lowerPrice = getLowerPrice(symbol, position);
    const strikePrice = getStrikePrice(symbol, position);

    const currentRatioPct = getCurrentRatioPct(price, entry);
    const distToLower = getDistancePct(price, lowerPrice);
    const distToStrike = getDistancePct(price, strikePrice);

    return {
      symbol,
      price,
      entry,
      currentRatioPct,
      lowerPrice,
      distToLower,
      strikePrice,
      distToStrike
    };
  });
}

function getWorstRow(rows) {
  const valid = rows.filter(r => r.currentRatioPct !== null);
  if (!valid.length) return null;
  valid.sort((a, b) => a.currentRatioPct - b.currentRatioPct);
  return valid[0];
}

function getDataIssues(position, rows) {
  const issues = [];
  const symbols = getSymbols(position);

  if (!symbols.length) issues.push("缺少標的");

  rows.forEach(r => {
    if (r.price === null || r.price <= 0) issues.push(`${r.symbol} 無現價`);
    if (r.entry === null) issues.push(`${r.symbol} 無法倒推出進場價`);
    if (r.lowerPrice === null) issues.push(`${r.symbol} 無法取得下限價格`);
    if (r.strikePrice === null) issues.push(`${r.symbol} 無法取得執行價格`);
  });

  return issues;
}

function getMaturityInfo(position) {
  const raw = position.exit_date || position.maturity_date || position.expiry_date || null;
  const maturityDate = parseDateFlexible(raw);

  if (!maturityDate) {
    return { raw, date: null, days: null, tag: "待確認" };
  }

  const days = daysBetween(getToday(), maturityDate);
  let tag = "正常";
  if (days <= 7) tag = "7天內到期";
  else if (days <= 30) tag = "30天內到期";

  return { raw, date: maturityDate, days, tag };
}

function getStatusFromWorstRow(worstRow) {
  if (!worstRow) return "待確認";
  if (worstRow.distToLower === null) return "待確認";
  if (worstRow.distToLower < 0) return "風險";
  if (worstRow.distToLower < 10) return "追蹤";
  return "健康";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderDetailTable(item) {
  const rowsHtml = item.rows.map(r => `
    <div class="m2-detail-row">
      <div class="m2-detail-symbol">${escapeHtml(r.symbol)}</div>
      <div class="m2-detail-metrics">
        <div>現價：${priceString(r.price)}</div>
        <div>進場價：${priceString(r.entry)}</div>
        <div>現價比：${pctString(r.currentRatioPct)}</div>
        <div>下限價格：${priceString(r.lowerPrice)}</div>
        <div>距離下限價：${pctString(r.distToLower)}</div>
        <div>執行價格：${priceString(r.strikePrice)}</div>
        <div>距離執行價：${pctString(r.distToStrike)}</div>
      </div>
    </div>
  `).join("");

  const reason = item.status === "待確認"
    ? `缺少資料：${escapeHtml(item.issues.join("、"))}`
    : `Worst-of = ${escapeHtml(item.worstSymbol || "未判定")}，目前${item.status === "風險" ? "已跌破下限價格" : item.status === "追蹤" ? "接近下限價格" : "仍在安全區"}`;

  return `
    <div class="m2-detail-box">
      <div class="m2-detail-summary">
        <div>年化配息：${item.couponText}</div>
        <div>天期：${item.tenorText}</div>
        <div>到期：${item.maturity.raw || "未提供"}${item.maturity.days !== null ? ` ｜ 剩餘 ${item.maturity.days} 天` : ""}</div>
        <div>到期狀況：${item.maturity.tag}${item.maturity.days !== null ? `（${item.maturity.days}天）` : ""}</div>
      </div>
      ${rowsHtml}
      <div class="m2-detail-conclusion">結論：${reason}</div>
    </div>
  `;
}

function renderMiniCard(item, idx) {
  return `
    <div class="m2-position-card">
      <div class="m2-position-head">
        <div class="m2-position-name">${escapeHtml(item.name)}</div>
        <div class="m2-status m2-status-${item.statusClass}">${item.status}</div>
      </div>

      <div class="m2-line">標的：${escapeHtml(item.symbols.join(", ") || "未提供")}</div>
      <div class="m2-line">Worst-of：${escapeHtml(item.worstSymbol || "未判定")}</div>
      <div class="m2-line">距離下限價：${item.worstRow ? pctString(item.worstRow.distToLower) : "未提供"}</div>
      <div class="m2-line">到期：${item.maturity.raw || "未提供"}${item.maturity.days !== null ? ` ｜ 剩餘 ${item.maturity.days} 天` : ""}</div>

      <div class="m2-actions">
        <button class="m2-btn" onclick="toggleM2Detail('m2-detail-${idx}')">展開明細</button>
      </div>

      <div id="m2-detail-${idx}" class="m2-hidden">
        ${renderDetailTable(item)}
      </div>
    </div>
  `;
}

function renderSection(title, items, key, toneClass) {
  const first = items[0];
  const rest = items.slice(1);

  return `
    <div class="m2-section ${toneClass}">
      <div class="m2-section-title">${title}（${items.length}）</div>
      ${first ? renderMiniCard(first, `${key}-0`) : `<div class="m2-empty">目前無資料</div>`}
      ${
        rest.length
          ? `
            <div class="m2-actions">
              <button class="m2-btn" onclick="toggleM2Detail('m2-list-${key}')">展開更多</button>
            </div>
            <div id="m2-list-${key}" class="m2-hidden">
              ${rest.map((item, i) => renderMiniCard(item, `${key}-${i + 1}`)).join("")}
            </div>
          `
          : ""
      }
    </div>
  `;
}

export function renderModule2Health(positions, pool) {
  const poolMap = getPoolMap(pool);

  const normalized = (positions || []).map((position, idx) => {
    const rows = getPerUnderlyingRows(position, poolMap);
    const issues = getDataIssues(position, rows);
    const worstRow = getWorstRow(rows);
    const maturity = getMaturityInfo(position);

    let status = "健康";
    if (issues.length > 0) {
      status = "待確認";
    } else {
      status = getStatusFromWorstRow(worstRow);
    }

    const statusClass =
      status === "風險" ? "danger" :
      status === "追蹤" ? "watch" :
      status === "健康" ? "healthy" :
      "pending";

    return {
      idx,
      name: position.name || position.id || `FCN-${idx + 1}`,
      symbols: getSymbols(position),
      rows,
      issues,
      worstRow,
      worstSymbol: worstRow?.symbol || null,
      status,
      statusClass,
      maturity,
      couponText: position.coupon ? `${(Number(position.coupon) * 100).toFixed(2)}%` : "未提供",
      tenorText: position.tenor ? `${position.tenor} 個月` : "未提供"
    };
  });

  const danger = normalized.filter(x => x.status === "風險");
  const watch = normalized.filter(x => x.status === "追蹤");
  const healthy = normalized.filter(x => x.status === "健康");
  const pending = normalized.filter(x => x.status === "待確認");

  const total = normalized.length;
  const pct = (n) => total ? `${Math.round((n / total) * 100)}%` : "0%";

  const topPriority =
    danger.find(x => x.maturity.days !== null && x.maturity.days <= 7) ||
    danger[0] ||
    watch.find(x => x.maturity.days !== null && x.maturity.days <= 30) ||
    watch[0] ||
    pending[0] ||
    healthy[0] ||
    null;

  return `
    <div class="m2-wrap">
      <div class="m2-summary-card">
        <div class="m2-summary-title">持倉健康總覽</div>
        <div class="m2-summary-grid">
          <div class="m2-summary-item">
            <div class="m2-summary-label">全部</div>
            <div class="m2-summary-value">${total}</div>
          </div>
          <div class="m2-summary-item healthy">
            <div class="m2-summary-label">健康</div>
            <div class="m2-summary-value">${healthy.length}</div>
            <div class="m2-summary-sub">${pct(healthy.length)}</div>
          </div>
          <div class="m2-summary-item watch">
            <div class="m2-summary-label">追蹤</div>
            <div class="m2-summary-value">${watch.length}</div>
            <div class="m2-summary-sub">${pct(watch.length)}</div>
          </div>
          <div class="m2-summary-item danger">
            <div class="m2-summary-label">風險</div>
            <div class="m2-summary-value">${danger.length}</div>
            <div class="m2-summary-sub">${pct(danger.length)}</div>
          </div>
          <div class="m2-summary-item pending">
            <div class="m2-summary-label">待確認</div>
            <div class="m2-summary-value">${pending.length}</div>
            <div class="m2-summary-sub">${pct(pending.length)}</div>
          </div>
        </div>
      </div>

      ${
        topPriority ? `
          <div class="m2-top-risk-card">
            <div class="m2-section-title">最需處理</div>
            <div class="m2-position-name">${escapeHtml(topPriority.name)}</div>
            <div class="m2-line">Worst-of：${escapeHtml(topPriority.worstSymbol || "未判定")}</div>
            <div class="m2-line">距離下限價：${topPriority.worstRow ? pctString(topPriority.worstRow.distToLower) : "未提供"}</div>
            <div class="m2-line">狀態：<span class="m2-status m2-status-${topPriority.statusClass}">${topPriority.status}</span></div>
            <div class="m2-line">到期：${topPriority.maturity.raw || "未提供"}${topPriority.maturity.days !== null ? ` ｜ 剩餘 ${topPriority.maturity.days} 天` : ""}</div>
            <div class="m2-actions">
              <button class="m2-btn" onclick="toggleM2Detail('m2-top-priority')">展開詳細</button>
            </div>
            <div id="m2-top-priority" class="m2-hidden">
              ${renderDetailTable(topPriority)}
            </div>
          </div>
        ` : ""
      }

      ${renderSection("風險持倉", danger, "danger", "danger")}
      ${renderSection("追蹤持倉", watch, "watch", "watch")}
      ${renderSection("健康持倉", healthy, "healthy", "healthy")}
      ${pending.length ? renderSection("待確認持倉", pending, "pending", "pending") : ""}
    </div>
  `;
}

window.toggleM2Detail = function(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("m2-hidden");
};
