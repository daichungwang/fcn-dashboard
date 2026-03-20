function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pctText(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "未提供";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function getPoolMap(pool) {
  const map = {};
  (pool || []).forEach(item => {
    if (item?.symbol) map[item.symbol] = item;
  });
  return map;
}

function normalizeSymbols(position) {
  if (Array.isArray(position?.underlyings)) return position.underlyings.filter(Boolean);

  if (typeof position?.symbols === "string") {
    return position.symbols.split(",").map(s => s.trim()).filter(Boolean);
  }

  if (Array.isArray(position?.symbols)) return position.symbols.filter(Boolean);

  if (typeof position?.basket === "string") {
    return position.basket.split(",").map(s => s.trim()).filter(Boolean);
  }

  return [];
}

function getRefPrices(position) {
  if (position?.refPrice && typeof position.refPrice === "object") return position.refPrice;
  if (position?.reference_prices && typeof position.reference_prices === "object") return position.reference_prices;
  return {};
}

function getStrike(position) {
  return (
    safeNum(position?.strike) ??
    safeNum(position?.strike_pct) ??
    safeNum(position?.execute_price_pct) ??
    safeNum(position?.execution_price_pct)
  );
}

function getKI(position) {
  return (
    safeNum(position?.ki) ??
    safeNum(position?.lower_barrier) ??
    safeNum(position?.downside_barrier) ??
    safeNum(position?.barrier)
  );
}

// 規則：沒有下限價時，下限價 = 執行價
function getLowerBarrier(position) {
  const ki = getKI(position);
  const strike = getStrike(position);

  if (ki === null || ki === undefined || ki === 0) {
    return strike;
  }
  return ki;
}

function getQuotePrice(symbol, poolMap) {
  const item = poolMap[symbol];
  return safeNum(item?.price);
}

function getCurrentRatio(symbol, refPrices, poolMap) {
  const ref = safeNum(refPrices?.[symbol]);
  const now = getQuotePrice(symbol, poolMap);

  if (ref === null || now === null || ref === 0) return null;
  return now / ref;
}

function getWorstOf(position, poolMap) {
  const symbols = normalizeSymbols(position);
  const refPrices = getRefPrices(position);

  let worstSymbol = null;
  let worstRatio = null;

  symbols.forEach(symbol => {
    const ratio = getCurrentRatio(symbol, refPrices, poolMap);
    if (ratio === null) return;

    if (worstRatio === null || ratio < worstRatio) {
      worstRatio = ratio;
      worstSymbol = symbol;
    }
  });

  return {
    symbol: worstSymbol,
    ratio: worstRatio
  };
}

function getDistanceToBarrierPercent(position, poolMap) {
  const barrier = getLowerBarrier(position);
  const worst = getWorstOf(position, poolMap);

  if (barrier === null || barrier === undefined || barrier === 0) return null;
  if (worst.ratio === null || worst.ratio === undefined) return null;

  return ((worst.ratio - barrier) / barrier) * 100;
}

function getHealthStatus(distancePct) {
  if (distancePct === null || distancePct === undefined) return "待確認";
  if (distancePct < 0) return "危險";
  if (distancePct < 10) return "追蹤";
  return "健康";
}

function getHealthClass(status) {
  if (status === "危險") return "danger";
  if (status === "追蹤") return "watch";
  if (status === "健康") return "healthy";
  return "pending";
}

function getRiskHint(status) {
  if (status === "危險") return "已跌破風險線，需優先處理";
  if (status === "追蹤") return "接近風險線，需持續追蹤";
  if (status === "健康") return "距離下限價仍有安全空間";
  return "資料不足，暫時無法完整判斷";
}

function renderPositionCard(position, poolMap, idx, expanded = false) {
  const name = position?.name || position?.id || `持倉${idx + 1}`;
  const symbols = normalizeSymbols(position);
  const worst = getWorstOf(position, poolMap);
  const barrier = getLowerBarrier(position);
  const distancePct = getDistanceToBarrierPercent(position, poolMap);
  const status = getHealthStatus(distancePct);
  const statusClass = getHealthClass(status);
  const hint = getRiskHint(status);

  const detailId = `m2-detail-${idx}`;

  return `
    <div class="stock-card ${statusClass === "danger" ? "danger-card" : ""}">
      <div class="stock-title">${name}</div>
      <div class="stock-detail-line">標的：${symbols.length ? symbols.join(", ") : "未提供"}</div>
      <div class="stock-detail-line">Worst-of：${worst.symbol || "未判定"}</div>
      <div class="stock-detail-line">距下限價：${pctText(distancePct)}</div>
      <div class="stock-detail-line">狀態：<span class="status-${statusClass}">${status}</span></div>
      <div class="stock-detail-line">風險提示：${hint}</div>

      <div class="m3-btn-row" style="margin-top:8px;">
        <button class="m3-btn" onclick="toggleM2Detail('${detailId}')">
          ${expanded ? "點擊收合" : "點擊展開 / 收合明細"}
        </button>
      </div>

      <div id="${detailId}" class="${expanded ? "" : "m3-hidden"}">
        <div class="stock-detail-line" style="margin-top:8px;">執行價：${barrier !== null && barrier !== undefined ? `${(barrier * 100).toFixed(2)}%` : "未提供"}</div>
        <div class="stock-detail-line">參考價來源：${getKI(position) ? "原始下限價" : "以下限價=執行價規則替代"}</div>
      </div>
    </div>
  `;
}

function renderSection(title, items, poolMap, key) {
  const sectionId = `m2-section-${key}`;
  return `
    <div class="section">
      <h3>${title}（${items.length}） <button class="link-btn" onclick="toggleM2Section('${sectionId}')">點擊展開</button></h3>
      <div id="${sectionId}" class="m3-hidden">
        ${items.length ? items.map((p, i) => renderPositionCard(p, poolMap, `${key}-${i}`)).join("") : `<p>目前無資料</p>`}
      </div>
    </div>
  `;
}

export function renderModule2Health(positions, pool) {
  const poolMap = getPoolMap(pool);

  const enriched = (positions || []).map((position, idx) => {
    const worst = getWorstOf(position, poolMap);
    const distancePct = getDistanceToBarrierPercent(position, poolMap);
    const status = getHealthStatus(distancePct);

    return {
      ...position,
      __idx: idx,
      __worst: worst,
      __distancePct: distancePct,
      __status: status
    };
  });

  const danger = enriched.filter(p => p.__status === "危險");
  const watch = enriched.filter(p => p.__status === "追蹤");
  const healthy = enriched.filter(p => p.__status === "健康");
  const pending = enriched.filter(p => p.__status === "待確認");

  const topIssue =
    danger[0] ||
    watch[0] ||
    pending[0] ||
    null;

  return `
    <div class="module2-wrap">
      <div class="summary">
        <div class="summary-title">持倉健康總覽</div>
        <div class="summary-line">
          持倉總數：${enriched.length} ｜ 
          危險：<span class="status-danger">${danger.length}</span> ｜ 
          追蹤：<span class="status-watch">${watch.length}</span> ｜ 
          健康：<span class="status-healthy">${healthy.length}</span>
          ${pending.length ? ` ｜ 待確認：<span class="status-pending">${pending.length}</span>` : ""}
        </div>
      </div>

      ${
        topIssue
          ? `
        <div class="stock-card danger-card">
          <div class="stock-title">最需處理</div>
          <div class="stock-detail-line">${topIssue.name || topIssue.id || "未命名持倉"}</div>
          <div class="stock-detail-line">Worst-of：${topIssue.__worst.symbol || "未判定"}</div>
          <div class="stock-detail-line">距下限價：${pctText(topIssue.__distancePct)}</div>
          <div class="stock-detail-line">狀態：<span class="status-${getHealthClass(topIssue.__status)}">${topIssue.__status}</span></div>
        </div>
      `
          : ""
      }

      ${renderSection("危險持倉", danger, poolMap, "danger")}
      ${renderSection("追蹤持倉", watch, poolMap, "watch")}
      ${renderSection("健康持倉", healthy, poolMap, "healthy")}
      ${pending.length ? renderSection("待確認持倉", pending, poolMap, "pending") : ""}
    </div>
  `;
}

window.toggleM2Section = function(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("m3-hidden");
};

window.toggleM2Detail = function(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("m3-hidden");
};
