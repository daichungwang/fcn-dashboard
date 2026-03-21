import { renderModule1News } from "./modules/module1_news.js";
import { renderModule2Health } from "./modules/module2_health.js";
import { renderModule3 } from "./modules/module3_decision.js";

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return res.json();
}

function mergeQuoteIntoItem(item, quotesMap) {
  const symbol = item?.symbol;
  if (!symbol) return item;

  const quote = quotesMap?.[symbol] || {};

  return {
    ...item,
    price: quote.price ?? item.price ?? null,
    price_change_pct: quote.price_change_pct ?? item.price_change_pct ?? null,
    perf_1m_pct: quote.perf_1m_pct ?? item.perf_1m_pct ?? null,
    perf_6m_pct: quote.perf_6m_pct ?? item.perf_6m_pct ?? null,
    pe_2025: quote.pe_2025 ?? item.pe_2025 ?? null,
    pe_2026: quote.pe_2026 ?? item.pe_2026 ?? null,
    eps_2026: quote.eps_2026 ?? item.eps_2026 ?? null
  };
}

function mergeQuotesIntoList(list, quotesMap) {
  if (!Array.isArray(list)) return [];
  return list.map(item => mergeQuoteIntoItem(item, quotesMap));
}

async function init() {
  const m1 = document.getElementById("module1-news");
  const m2 = document.getElementById("module2-health");
  const m3 = document.getElementById("module3-decision");

  let positions = [];
  let pool = [];
  let newsData = null;
  let marketData = null;
  let quotesData = {};
  let config = {};

  // === 載入 positions ===
  try {
    positions = await loadJson("./data/positions.json");
  } catch (error) {
    console.error("positions load error:", error);
    if (m2) m2.innerHTML = `<p>positions.json 載入失敗</p>`;
  }

  // === 載入 pool ===
  try {
    pool = await loadJson("./data/pool.json");
  } catch (error) {
    console.error("pool load error:", error);
    if (m2) m2.innerHTML = `<p>pool.json 載入失敗</p>`;
    if (m3) m3.innerHTML = `<p>pool.json 載入失敗</p>`;
  }

  // === 載入 quotes ===
  try {
    quotesData = await loadJson("./data/quotes.json");
  } catch (error) {
    console.error("quotes load error:", error);
  }

  // === merge quotes 到 pool / positions ===
  pool = mergeQuotesIntoList(pool, quotesData);
  positions = mergeQuotesIntoList(positions, quotesData);

  // === 載入 news ===
  try {
    newsData = await loadJson("./data/news.json");
  } catch (error) {
    console.error("news load error:", error);
    if (m1) m1.innerHTML = `<p>news.json 載入失敗</p>`;
  }

  // === 載入 market ===
  try {
    marketData = await loadJson("./data/market.json");
  } catch (error) {
    console.error("market load error:", error);
  }

  // === 載入 config ===
  try {
    config = await loadJson("./data/config.json");
  } catch (error) {
    console.error("config load error:", error);
  }

  // === Module1 ===
  try {
    if (m1 && newsData) {
      m1.innerHTML = renderModule1News(newsData, marketData);
    } else if (m1) {
      m1.innerHTML = `<p>目前無新聞資料</p>`;
    }
  } catch (error) {
    console.error("module1 render error:", error);
    if (m1) m1.innerHTML = `<p>module1 render 錯誤</p>`;
  }

  // === Module2 ===
  try {
    if (m2 && positions.length > 0 && pool.length > 0) {
      m2.innerHTML = renderModule2Health(positions, pool);
    } else if (m2 && positions.length === 0) {
      m2.innerHTML = `<p>目前沒有持倉資料</p>`;
    }
  } catch (error) {
    console.error("module2 render error:", error);
    if (m2) m2.innerHTML = `<p>module2 render 錯誤</p>`;
  }

  // === Module3 ===
try {
  if (m3 && pool.length > 0) {
    config.newsData = newsData;

    window.__DATA__ = {
      pool,
      positions,
      newsData,
      marketData,
      quotesData,
      config
    };

    window.rerenderModule3 = function () {
      if (!m3 || !window.__DATA__) return;
      m3.innerHTML = renderModule3(window.__DATA__);
    };

    window.rerenderModule3();
  } else if (m3) {
    m3.innerHTML = `<p>目前沒有 Pool 資料</p>`;
  }

} catch (error) {
  console.error("module3 render error:", error);
  if (m3) m3.innerHTML = `
  
module3 render 錯誤

`;
}
}

init();

// ✅ Pool 收合功能
window.togglePool = function () {
  const el = document.getElementById("pool-section");
  if (!el) return;
  el.style.display = el.style.display === "none" ? "block" : "none";
};

// ✅ Dashboard 初始化
function initDashboard() {

  // ===== M1：機會 =====
  const stockTotal = 121;
  const stockPick = 45;

  const fcnTotal = 120;
  const fcnPick = 32;

  const stockRate = Math.round((stockPick / stockTotal) * 100);
  const fcnRate = Math.round((fcnPick / fcnTotal) * 100);

  document.getElementById("m1-stock").textContent =
    `股票建議率：${stockRate}%`;

  document.getElementById("m1-fcn").textContent =
    `FCN 建議率：${fcnRate}%`;


  // ===== M2：風險 =====
  const risk = 7.1;
  const dPure = -0.3;
  const dEvent = -1.2;

  document.getElementById("m2-risk").textContent =
    `風險指數：${risk}`;

  document.getElementById("m2-dpure").textContent =
    `ΔPure：${dPure > 0 ? "+" : ""}${dPure}`;

  document.getElementById("m2-devent").textContent =
    `ΔEvent：${dEvent > 0 ? "+" : ""}${dEvent}`;


  // ===== M3：適合度 =====
  const fcnScore = 6.8;

  document.getElementById("m3-score").textContent =
    `適合度：${fcnScore}`;


  // ===== M4：系統解釋度 =====
  const systemScore = 8.2;

  document.getElementById("m4-score").textContent =
    `System Score：${systemScore}`;
}

// 執行
initDashboard();

// ===== M3-A：讀取 pool20.json 並顯示 =====
function getGroupClass(group) {
  if (group === "核心") return "tag-core";
  if (group === "平衡") return "tag-balance";
  if (group === "防守") return "tag-defensive";
  if (group === "避免") return "tag-avoid";
  return "";
}

function getDeltaClass(value) {
  if (value == null || value === "--") return "";
  const n = Number(value);
  if (Number.isNaN(n)) return "";
  if (n > 0) return "delta-positive";
  if (n < 0) return "delta-negative";
  return "";
}

function scoreToGroup(score) {
  if (score >= 9) return "核心";
  if (score >= 7) return "平衡";
  if (score >= 5) return "防守";
  if (score >= 3) return "收益";
  return "避免";
}

function clampScore(score) {
  return Math.max(1, Math.min(10, Number(score.toFixed(1))));
}

// 先做一版可動的 pure 分數
function calcPureScore(stock) {
  let score = stock.baseline_score ?? 5;

  if (stock.volatility_level === "LOW") score += 0.3;
  if (stock.volatility_level === "MEDIUM") score += 0;
  if (stock.volatility_level === "HIGH") score -= 0.6;

  if (stock.downside_risk_level === "LOW") score += 0.3;
  if (stock.downside_risk_level === "MEDIUM") score += 0;
  if (stock.downside_risk_level === "HIGH") score -= 0.6;

  if (stock.allow_fcn === false) score -= 1.5;

  if (stock.basket_role === "CORE") score += 0.4;
  if (stock.basket_role === "BALANCER") score += 0;
  if (stock.basket_role === "DEFENSIVE") score += 0.2;
  if (stock.basket_role === "YIELD") score -= 0.5;
  if (stock.basket_role === "AVOID") score -= 1.2;

  return clampScore(score);
}

// 先做一版可動的 event 分數
function calcEventImpact(stock) {
  // 先用 sector + 波動做假事件擾動，之後再接真新聞
  let impact = 0;

  if (stock.sector === "AI_SEMI") impact -= 0.4;
  if (stock.sector === "CLOUD_SOFTWARE") impact += 0.2;
  if (stock.sector === "HEALTHCARE") impact += 0.1;
  if (stock.sector === "ENERGY") impact -= 0.1;
  if (stock.sector === "ETF") impact += 0.1;

  if (stock.volatility_level === "HIGH") impact -= 0.5;
  if (stock.volatility_level === "LOW") impact += 0.2;

  if (stock.symbol === "NVDA") impact += 0.4;
  if (stock.symbol === "TSLA") impact -= 1.0;
  if (stock.symbol === "LQD") impact += 0.2;

  return Number(impact.toFixed(1));
}

function enrichStock(stock) {
  const pureScore = calcPureScore(stock);
  const pureGroup = scoreToGroup(pureScore);

  const eventImpact = calcEventImpact(stock);
  const eventScore = clampScore(pureScore + eventImpact);
  const eventGroup = scoreToGroup(eventScore);

  return {
    ...stock,
    pure_score: pureScore,
    pure_group: pureGroup,
    event_score: eventScore,
    event_group: eventGroup,
    event_impact: eventImpact
  };
}

function renderStockCard(stock) {
  const baselineGroup = stock.baseline_group ?? "--";
  const baselineScore = stock.baseline_score ?? "--";
  const pureGroup = stock.pure_group ?? "--";
  const pureScore = stock.pure_score ?? "--";
  const eventGroup = stock.event_group ?? "--";
  const eventScore = stock.event_score ?? "--";
  const eventImpact = stock.event_impact ?? "--";

  const baselineClass = getGroupClass(baselineGroup);
  const pureClass = getGroupClass(pureGroup);
  const eventClass = getGroupClass(eventGroup);
  const deltaClass = getDeltaClass(eventImpact);

  const fcnBadge = stock.allow_fcn
    ? `<span class="tag-core">可做 FCN</span>`
    : `<span class="tag-avoid">不做 FCN</span>`;

  const impactText =
    typeof eventImpact === "number"
      ? `${eventImpact > 0 ? "+" : ""}${eventImpact}`
      : eventImpact;

  return `
    <div class="stock-card">
      <div class="stock-head">
        <strong>${stock.symbol}</strong> ｜ ${stock.name}
      </div>

      <div class="stock-meta">
        ${stock.sector} ｜ ${stock.subsector} ｜ ${fcnBadge}
      </div>

      <div class="stock-row">
        Baseline：
        <span class="${baselineClass}">${baselineGroup}</span>
        （${baselineScore}）
      </div>

      <div class="stock-row">
        Pure：
        <span class="${pureClass}">${pureGroup}</span>
        （${pureScore}）
      </div>

      <div class="stock-row">
        Event：
        <span class="${eventClass}">${eventGroup}</span>
        （${eventScore}）
      </div>

      <div class="stock-row">
        ΔEvent：
        <span class="${deltaClass}">${impactText}</span>
      </div>

      <div class="stock-note">
        ${stock.baseline_note ?? ""}
      </div>
    </div>
  `;
}

function renderM3AStocks(pool) {
  const el = document.getElementById("m3a-content");
  const summaryEl = document.getElementById("m3a-summary");
  if (!el) return;

  if (!Array.isArray(pool) || pool.length === 0) {
    el.innerHTML = `<p>目前沒有股票資料</p>`;
    if (summaryEl) summaryEl.innerHTML = "";
    return;
  }

  const enrichedPool = pool.map(enrichStock);

  const total = enrichedPool.length;
  const allowFcnCount = enrichedPool.filter((s) => s.allow_fcn).length;
  const eventUpCount = enrichedPool.filter((s) => Number(s.event_impact) > 0).length;
  const eventDownCount = enrichedPool.filter((s) => Number(s.event_impact) < 0).length;

  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="m3a-summary-grid">
        <div class="m3a-summary-card">
          <div class="m3a-summary-title">股票總數</div>
          <div class="m3a-summary-value">${total}</div>
        </div>

        <div class="m3a-summary-card">
          <div class="m3a-summary-title">可做 FCN</div>
          <div class="m3a-summary-value">${allowFcnCount}</div>
        </div>

        <div class="m3a-summary-card">
          <div class="m3a-summary-title">Event 上修</div>
          <div class="m3a-summary-value up">${eventUpCount}</div>
        </div>

        <div class="m3a-summary-card">
          <div class="m3a-summary-title">Event 下修</div>
          <div class="m3a-summary-value down">${eventDownCount}</div>
        </div>
      </div>
    `;
  }

  el.innerHTML = `
    <div class="stock-list">
      ${enrichedPool.map(renderStockCard).join("")}
    </div>
  `;
}
async function initM3A() {
  try {
    const pool20 = await loadJson("./data/pool20.json");
    renderM3AStocks(pool20);
  } catch (error) {
    console.error("M3-A 載入失敗：", error);
    const el = document.getElementById("m3a-content");
    if (el) {
      el.innerHTML = `<p>M3-A 資料載入失敗</p>`;
    }
  }
}

initM3A();

window.toggleM3Explain = function () {
  const el = document.getElementById("m3-explain-detail");
  if (!el) return;

  el.style.display = el.style.display === "none" ? "block" : "none";
};

window.togglePool = function () {
  const el = document.getElementById("pool-section");
  if (!el) return;
  el.style.display = el.style.display === "none" ? "block" : "none";
};

window.toggleM3Explain = function () {
  const el = document.getElementById("m3-explain-detail");
  if (!el) return;
  el.style.display = el.style.display === "none" ? "block" : "none";
};
