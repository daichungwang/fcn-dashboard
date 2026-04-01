// ==========================================
// module1_news.js FINAL SKELETON
// 振宇 FCN 系統｜M1 顯示層
// 功能：
// 1) render 市場指標
// 2) render 三大新聞
// 3) render Pool30 Event Focus
// 4) render Non-Pool30 Discovery
// 5) render Rule / Action Panel
// 不做：事件引擎核心計算
// ==========================================

// ------------------------------------------
// 工具
// ------------------------------------------
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 2) {
  const n = toNumber(value, 0);
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function pctText(v, digits = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  const pct = Math.abs(n) <= 1 ? n * 100 : n;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(digits)}%`;
}

function normalizeDirection(direction) {
  const d = String(direction || "").toLowerCase();
  if (d === "positive" || d === "正向") return "positive";
  if (d === "negative" || d === "負向") return "negative";
  return "neutral";
}

function directionLabel(direction) {
  const d = normalizeDirection(direction);
  if (d === "positive") return "🟢 正向";
  if (d === "negative") return "🔴 負向";
  return "⚪ 中性";
}

function strengthLabel(level) {
  const v = String(level || "").toLowerCase();
  if (v === "high") return "高";
  if (v === "medium") return "中";
  if (v === "low") return "低";
  return "中";
}

function baselineScore(category) {
  const map = {
    core: 10,
    growth: 8,
    defensive: 7,
    income: 6,
    speculative: 4
  };
  return map[category] ?? 0;
}

function eventClass(score) {
  if (score > 0) return "positive";
  if (score < 0) return "negative";
  return "neutral";
}

function prettyMarketName(name) {
  const map = {
    vix: "VIX",
    sp500: "S&P 500",
    nasdaq: "Nasdaq",
    dow: "Dow",
    us10y: "10Y",
    us20y: "20Y",
    oil: "Oil",
    gold: "Gold",
    cpi: "CPI",
    ppi: "PPI",
    tw_index: "台股"
  };
  return map[name] || name;
}

function marketComment(name, current, previous) {
  const c = Number(current);
  const p = Number(previous);
  if (!Number.isFinite(c) || !Number.isFinite(p)) return "-";

  const delta = c - p;
  const key = String(name || "").toLowerCase();

  if (key.includes("vix")) return delta > 0 ? "恐慌升溫" : "波動降溫";
  if (key.includes("sp")) return delta > 0 ? "大盤偏多" : "大盤偏弱";
  if (key.includes("nasdaq")) return delta > 0 ? "科技偏強" : "科技轉弱";
  if (key.includes("dow")) return delta > 0 ? "權值偏穩" : "權值轉弱";
  if (key.includes("10y") || key.includes("20y")) return delta > 0 ? "殖利率升" : "殖利率降";
  if (key.includes("oil")) return delta > 0 ? "通膨壓力升" : "成本壓力降";
  if (key.includes("gold")) return delta > 0 ? "避險升溫" : "避險降溫";
  if (key.includes("cpi") || key.includes("ppi")) return delta > 0 ? "通膨升溫" : "通膨降溫";
  if (key.includes("tw")) return delta > 0 ? "台股偏強" : "台股偏弱";

  return "-";
}

function snapshotText(runtime = {}) {
  return `
    <div class="snapshot-grid">
      <div>Price Now: <b>${round(runtime.price_now, 2)}</b></div>
      <div>1D: ${pctText(runtime.ret_1d)}</div>
      <div>1W: ${pctText(runtime.ret_1w)}</div>
      <div>1M: ${pctText(runtime.ret_1m)}</div>
      <div>3M: ${pctText(runtime.ret_3m)}</div>
      <div>6M: ${pctText(runtime.ret_6m)}</div>
      <div>12M: ${pctText(runtime.ret_12m)}</div>
    </div>
  `;
}

function getSuggestion({ eventScore, eventStockScore, category }) {
  if (eventScore >= 1.5 && eventStockScore >= 9) return "✅ 今日值得留意";
  if (eventScore <= -1.5) return "❌ 今日不建議";
  if (category === "speculative" && eventScore <= 0) return "❌ 高風險觀察";
  return "⚠️ 中性觀察";
}

function whyText({ eventScore, eventRaw, signalCount }) {
  const parts = [];
  if (eventScore > 0) parts.push("事件分數正向");
  if (eventScore < 0) parts.push("事件分數偏負向");
  if (eventRaw > 0) parts.push("整體事件原始值偏正");
  if (eventRaw < 0) parts.push("整體事件原始值偏負");
  if (signalCount > 1) parts.push("同時有多則事件影響");
  return parts.length ? parts.join("；") : "目前無明確優勢";
}

function whyNotText({ category, eventScore }) {
  const parts = [];
  if (category === "speculative") parts.push("分類屬高風險");
  if (eventScore < 0) parts.push("事件偏空");
  return parts.length ? parts.join("；") : "暫無明顯風險";
}

// ------------------------------------------
// 市場指標
// ------------------------------------------
export function renderMarketTable(container, marketData = {}) {
  if (!container) return;

  const order = [
    "vix",
    "sp500",
    "nasdaq",
    "dow",
    "us10y",
    "us20y",
    "oil",
    "gold",
    "cpi",
    "ppi",
    "tw_index"
  ];

  const rows = order
    .filter(key => marketData[key] != null)
    .map((key) => {
      const node = marketData[key] || {};
      const current = node.current ?? node.value ?? node.latest ?? "-";
      const previous = node.previous ?? node.prev ?? node.last ?? "-";
      const cls =
        Number(current) > Number(previous)
          ? "market-up"
          : Number(current) < Number(previous)
            ? "market-down"
            : "market-flat";

      const pct =
        Number.isFinite(Number(current)) && Number.isFinite(Number(previous)) && Number(previous) !== 0
          ? `${Number(current) > Number(previous) ? "+" : ""}${(((Number(current) - Number(previous)) / Number(previous)) * 100).toFixed(1)}%`
          : "-";

      return `
        <tr>
          <td>${prettyMarketName(key)}</td>
          <td>${current}</td>
          <td>${previous}</td>
          <td class="${cls}">${pct}</td>
          <td>${marketComment(key, current, previous)}</td>
        </tr>
      `;
    })
    .join("");

  container.innerHTML = `
    <table class="market-table">
      <thead>
        <tr>
          <th>指標</th>
          <th>數值</th>
          <th>前值</th>
          <th>變動</th>
          <th>解讀</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ------------------------------------------
// 新聞區塊
// ------------------------------------------
function renderNewsCard(news = {}) {
  const title = escapeHtml(news.title || "-");
  const summary = escapeHtml(news.summary || "");
  const direction = directionLabel(news.direction || news.ai_direction || "neutral");
  const strength = strengthLabel(news.strength || news.level || "medium");
  const subtype = escapeHtml(news.subtype || "-");
  const sidLabel = escapeHtml(news.sid_label || "-");
  const sidScore = news.sid_score ?? "-";

  const impacted = news.impact_map
    ? Object.keys(news.impact_map).join(", ")
    : Array.isArray(news.affected_symbols)
      ? news.affected_symbols.join(", ")
      : Array.isArray(news.affected_sectors)
        ? news.affected_sectors.join(", ")
        : "-";

  const source = escapeHtml(news.source || "");
  const url = news.url ? `<a href="${escapeHtml(news.url)}" target="_blank" rel="noopener noreferrer">🔗 原文</a>` : "🔗 原文未提供";

  return `
    <div class="news-card">
      <div class="news-title">${title}</div>
      <div class="news-summary">${summary}</div>
      <div class="news-meta">
        <span>Type: ${escapeHtml(news.type || "-")}</span>
        <span>Subtype: ${subtype}</span>
        <span>方向: ${direction}</span>
        <span>強度: ${strength}</span>
      </div>
      <div class="news-meta">
        <span>SID: ${sidLabel}</span>
        <span>SID Score: ${sidScore}</span>
      </div>
      <div class="news-meta">
        <span>Impact: ${escapeHtml(impacted)}</span>
      </div>
      <div class="news-meta">
        <span>Source: ${source}</span>
        <span>${url}</span>
      </div>
    </div>
  `;
}

export function renderNewsBlock(container, title, newsList = [], expanded = false) {
  if (!container) return;

  const list = expanded ? newsList.slice(0, 10) : newsList.slice(0, 3);
  container.innerHTML = `
    <div class="section-header">
      <h3>${title}（${newsList.length}）</h3>
    </div>
    <div class="news-list">
      ${list.map(renderNewsCard).join("") || `<div class="empty">目前沒有資料</div>`}
    </div>
  `;
}

// ------------------------------------------
// Pool30 Event Focus
// data:
// - pool: [{symbol,name,sector,subsector,category,...}]
// - stockEventMap: { NVDA: {...} }
// - stockRuntime: { NVDA: {...} }
// - stockScores: { NVDA: { pure_stock_score, snapshot_score, event_stock_score } } 可選
// ------------------------------------------
export function renderPool30EventFocus(
  container,
  pool = [],
  stockEventMap = {},
  stockRuntime = {},
  stockScores = {}
) {
  if (!container) return;

  const rows = pool
    .map((stock) => {
      const eventNode = stockEventMap[stock.symbol] || {};
      const runtime = stockRuntime[stock.symbol] || {};
      const scoreNode = stockScores[stock.symbol] || {};

      const baseline = baselineScore(stock.category);
      const eventScore = round(eventNode.event_score ?? 0, 2);
      const snapshotScore = round(scoreNode.snapshot_score ?? 0, 2);
      const pureStockScore = round(scoreNode.pure_stock_score ?? baseline, 2);
      const eventStockScore = round(
        scoreNode.event_stock_score ?? (pureStockScore + snapshotScore + eventScore),
        2
      );

      return {
        ...stock,
        baseline,
        eventScore,
        snapshotScore,
        pureStockScore,
        eventStockScore,
        eventRaw: round(eventNode.event_raw ?? 0, 2),
        signalCount: toNumber(eventNode.signal_count, 0),
        activeNewsIds: eventNode.active_news_ids || [],
        runtime
      };
    })
    .filter((s) => s.eventScore !== 0)
    .sort((a, b) => Math.abs(b.eventScore) - Math.abs(a.eventScore));

  if (!rows.length) {
    container.innerHTML = `<div class="empty">今天 Pool30 暫無明確事件驅動股票</div>`;
    return;
  }

  container.innerHTML = rows.map((s) => `
    <div class="stock-card ${eventClass(s.eventScore)}">
      <div class="stock-head">
        <div class="stock-symbol">${escapeHtml(s.symbol)}</div>
        <div class="stock-tags">
          <span>${escapeHtml(s.category)}</span>
          <span>${escapeHtml(s.sector || "-")}</span>
          <span>${escapeHtml(s.subsector || "-")}</span>
        </div>
      </div>

      <div class="score-grid">
        <div>Baseline Score: <b>${s.baseline}</b></div>
        <div>Event Score: <b>${s.eventScore}</b></div>
        <div>Snapshot Score: <b>${s.snapshotScore}</b></div>
        <div>Pure Stock Score: <b>${s.pureStockScore}</b></div>
        <div>Event Stock Score: <b>${s.eventStockScore}</b></div>
      </div>

      ${snapshotText(s.runtime)}

      <div class="stock-note"><b>Suggestion:</b> ${getSuggestion(s)}</div>
      <div class="stock-note"><b>Why:</b> ${escapeHtml(whyText(s))}</div>
      <div class="stock-note"><b>Why Not:</b> ${escapeHtml(whyNotText(s))}</div>
      <div class="stock-note"><b>Active News IDs:</b> ${escapeHtml((s.activeNewsIds || []).join(", ") || "-")}</div>
    </div>
  `).join("");
}

// ------------------------------------------
// Discovery（非 Pool30）
// candidates: 陣列，外部先篩好
// [{symbol,name,sector,subsector,category,event_score,...}]
// ------------------------------------------
export function renderDiscoveryStocks(container, candidates = [], stockRuntime = {}) {
  if (!container) return;

  if (!candidates.length) {
    container.innerHTML = `<div class="empty">今天沒有明確的 Non-Pool30 新發現股票</div>`;
    return;
  }

  container.innerHTML = candidates
    .sort((a, b) => Math.abs(toNumber(b.event_score, 0)) - Math.abs(toNumber(a.event_score, 0)))
    .map((s) => {
      const runtime = stockRuntime[s.symbol] || {};
      return `
        <div class="stock-card ${eventClass(toNumber(s.event_score, 0))}">
          <div class="stock-head">
            <div class="stock-symbol">${escapeHtml(s.symbol)}</div>
            <div class="stock-tags">
              <span>${escapeHtml(s.category || "-")}</span>
              <span>${escapeHtml(s.sector || "-")}</span>
              <span>${escapeHtml(s.subsector || "-")}</span>
            </div>
          </div>

          <div class="score-grid">
            <div>Baseline Score: <b>${baselineScore(s.category)}</b></div>
            <div>Event Score: <b>${round(s.event_score, 2)}</b></div>
            <div>Snapshot Score: <b>${round(s.snapshot_score, 2)}</b></div>
            <div>Pure Stock Score: <b>${round(s.pure_stock_score, 2)}</b></div>
            <div>Event Stock Score: <b>${round(s.event_stock_score, 2)}</b></div>
          </div>

          ${snapshotText(runtime)}

          <div class="stock-note"><b>Suggestion:</b> 🟡 加入觀察 / Pool30 候選</div>
          <div class="stock-note"><b>Reason:</b> ${escapeHtml(s.reason || "由事件分數篩選浮現")}</div>
        </div>
      `;
    })
    .join("");
}

// ------------------------------------------
// Action Panel
// ------------------------------------------
export function renderActionPanel(container, addList = [], reviseList = []) {
  if (!container) return;

  container.innerHTML = `
    <div class="action-panel">
      <h3>🧾 Pool30 Action Panel</h3>

      <div class="action-group">
        <h4>新增候選</h4>
        ${addList.length
          ? addList.map(item => `
              <div class="action-item">
                <label>
                  <input type="checkbox" />
                  ${escapeHtml(item.symbol)} ｜ ${escapeHtml(item.reason || "加入觀察候選")}
                </label>
              </div>
            `).join("")
          : `<div class="empty">今天沒有新增候選</div>`}
      </div>

      <div class="action-group">
        <h4>分類調整建議</h4>
        ${reviseList.length
          ? reviseList.map(item => `
              <div class="action-item">
                ${escapeHtml(item.symbol)} ｜ ${escapeHtml(item.action || "-")} ｜ ${escapeHtml(item.reason || "-")}
              </div>
            `).join("")
          : `<div class="empty">今天沒有分類調整建議</div>`}
      </div>
    </div>
  `;
}

// ------------------------------------------
// Rule Box
// ------------------------------------------
export function renderRuleBox(container) {
  if (!container) return;

  container.innerHTML = `
    <details class="rule-box">
      <summary>📜 Rule（展開 / 收合）</summary>
      <div class="rule-content">
        <p><b>Category</b>: core / growth / defensive / income / speculative</p>
        <p><b>Baseline Score</b>: 10 / 8 / 7 / 6 / 4</p>
        <p><b>Sector（9類）</b>:
          AI_SEMI / AI_APPLICATION / PLATFORM / CONSUMER / FINANCIAL /
          HEALTHCARE / TRAVEL / ETF / ENERGY
        </p>
        <p><b>公式</b>: event_stock_score = pure_stock_score + snapshot_score + event_score</p>
        <p><b>M1 原則</b>: M1 只做 stock 層分析，不做 FCN score。</p>
      </div>
    </details>
  `;
}

// ------------------------------------------
// 總入口（選用）
// ------------------------------------------
export function renderModule1Page({
  marketContainer,
  globalNewsContainer,
  financeNewsContainer,
  aiNewsContainer,
  pool30Container,
  discoveryContainer,
  actionContainer,
  ruleContainer,

  marketData = {},
  globalNews = [],
  financeNews = [],
  aiNews = [],

  pool = [],
  stockEventMap = {},
  stockRuntime = {},
  stockScores = {},
  discoveryCandidates = [],
  addList = [],
  reviseList = []
}) {
  renderMarketTable(marketContainer, marketData);
  renderNewsBlock(globalNewsContainer, "🌍 國際新聞", globalNews, false);
  renderNewsBlock(financeNewsContainer, "💰 財經新聞", financeNews, false);
  renderNewsBlock(aiNewsContainer, "🤖 AI 趨勢", aiNews, false);

  renderPool30EventFocus(pool30Container, pool, stockEventMap, stockRuntime, stockScores);
  renderDiscoveryStocks(discoveryContainer, discoveryCandidates, stockRuntime);
  renderActionPanel(actionContainer, addList, reviseList);
  renderRuleBox(ruleContainer);
}
