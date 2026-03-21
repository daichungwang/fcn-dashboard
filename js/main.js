import { renderModule1News } from "./modules/module1_news.js";
import { renderModule2Health } from "./modules/module2_health.js";

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return res.json();
}

async function safeLoadJson(path, fallback = null) {
  try {
    return await loadJson(path);
  } catch (error) {
    console.warn(`safeLoadJson fallback for ${path}`, error);
    return fallback;
  }
}

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

window.toggleM2Detail = function (btn) {
  if (!btn) return;

  const card = btn.closest(".m2-position-card"); // ⭐關鍵
  if (!card) return;

  const detail = card.querySelector("[data-detail]");
  if (!detail) return;

  const isHidden =
    detail.style.display === "none" || detail.style.display === "";

  detail.style.display = isHidden ? "block" : "none";
  btn.textContent = isHidden ? "收合詳細" : "展開詳細";
};
window.expandAllM2Details = function () {
  document.querySelectorAll(".m2-position-card").forEach((card) => {
    const detail = card.querySelector("[data-detail]");
    const btn = card.querySelector(".m2-detail-btn");
    if (detail) detail.style.display = "block";
    if (btn) btn.textContent = "收合詳細";
  });
};

window.collapseAllM2Details = function () {
  document.querySelectorAll(".m2-position-card").forEach((card) => {
    const detail = card.querySelector("[data-detail]");
    const btn = card.querySelector(".m2-detail-btn");
    if (detail) detail.style.display = "none";
    if (btn) btn.textContent = "展開詳細";
  });
};
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

function calcPureScore(stock) {
  let score = stock.baseline_score ?? 5;

  if (stock.volatility_level === "LOW") score += 0.3;
  if (stock.volatility_level === "HIGH") score -= 0.6;

  if (stock.downside_risk_level === "LOW") score += 0.3;
  if (stock.downside_risk_level === "HIGH") score -= 0.6;

  if (stock.allow_fcn === false) score -= 1.5;

  if (stock.basket_role === "CORE") score += 0.4;
  if (stock.basket_role === "DEFENSIVE") score += 0.2;
  if (stock.basket_role === "YIELD") score -= 0.5;
  if (stock.basket_role === "AVOID") score -= 1.2;

  return clampScore(score);
}

function calcEventImpact(stock) {
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

  return enrichedPool;
}

function initDashboard(enrichedPool = []) {
  const stockTotal = enrichedPool.length || 21;
  const stockPick = enrichedPool.filter((s) => s.pure_score >= 7).length || 8;
  const fcnTotal = stockTotal || 21;
  const fcnPick = enrichedPool.filter((s) => s.allow_fcn).length || 20;

  const stockRate = Math.round((stockPick / stockTotal) * 100);
  const fcnRate = Math.round((fcnPick / fcnTotal) * 100);

  const avgBaseline =
    enrichedPool.length > 0
      ? enrichedPool.reduce((sum, s) => sum + (s.baseline_score ?? 0), 0) / enrichedPool.length
      : 8.0;

  const avgPure =
    enrichedPool.length > 0
      ? enrichedPool.reduce((sum, s) => sum + (s.pure_score ?? 0), 0) / enrichedPool.length
      : 7.7;

  const avgEventImpact =
    enrichedPool.length > 0
      ? enrichedPool.reduce((sum, s) => sum + (s.event_impact ?? 0), 0) / enrichedPool.length
      : -0.3;

  const avgEvent = avgPure + avgEventImpact;
  const dPure = Number((avgPure - avgBaseline).toFixed(1));
  const dEvent = Number((avgEvent - avgPure).toFixed(1));

  const risk = Number(
    Math.min(
      10,
      Math.max(
        1,
        6 +
          enrichedPool.filter((s) => s.volatility_level === "HIGH").length * 0.1 +
          Math.abs(dPure) * 0.5 +
          Math.abs(dEvent) * 0.8
      )
    ).toFixed(1)
  );

  const fcnScore = Number(
    Math.max(1, Math.min(10, (avgPure + avgEvent) / 2)).toFixed(1)
  );

  const systemScore = 8.2;

  const m1Stock = document.getElementById("m1-stock");
  const m1Fcn = document.getElementById("m1-fcn");
  const m2Risk = document.getElementById("m2-risk");
  const m2DPure = document.getElementById("m2-dpure");
  const m2DEvent = document.getElementById("m2-devent");
  const m3Score = document.getElementById("m3-score");
  const m4Score = document.getElementById("m4-score");

  if (m1Stock) m1Stock.textContent = `股票建議率：${stockRate}%`;
  if (m1Fcn) m1Fcn.textContent = `FCN 建議率：${fcnRate}%`;
  if (m2Risk) m2Risk.textContent = `風險指數：${risk}`;
  if (m2DPure) m2DPure.textContent = `ΔPure：${dPure > 0 ? "+" : ""}${dPure}`;
  if (m2DEvent) m2DEvent.textContent = `ΔEvent：${dEvent > 0 ? "+" : ""}${dEvent}`;
  if (m3Score) m3Score.textContent = `適合度：${fcnScore}`;
  if (m4Score) m4Score.textContent = `System Score：${systemScore}`;
}

function renderM3Placeholders() {
  const m3b = document.getElementById("m3b-content");
  const m3c = document.getElementById("m3c-content");

  if (m3b) {
    m3b.innerHTML = `
      <div class="stock-card">
        <div class="stock-head">M3-B 開發中</div>
        <div class="stock-note">下一步將接入 FCN 組合遴選與建議。</div>
      </div>
    `;
  }

  if (m3c) {
    m3c.innerHTML = `
      <div class="stock-card">
        <div class="stock-head">M3-C 開發中</div>
        <div class="stock-note">下一步將接入外部 FCN 單筆評估。</div>
      </div>
    `;
  }
}

async function init() {
  const m1 = document.getElementById("module1-news");
  const m2 = document.getElementById("module2-health");

  const [newsData, marketData, pool, positions, config] = await Promise.all([
    safeLoadJson("./data/news.json", {}),
    safeLoadJson("./data/market.json", {}),
    safeLoadJson("./data/pool.json", []),
    safeLoadJson("./data/positions.json", []),
    safeLoadJson("./data/config.json", {})
  ]);

  const pool20 = await safeLoadJson("./data/pool20.json", pool);

  try {
    if (m1) {
      m1.innerHTML = renderModule1News(newsData, marketData, config);
    }
  } catch (error) {
    console.error("module1 render error:", error);
    if (m1) m1.innerHTML = `<p>module1 render 錯誤</p>`;
  }

  try {
    if (m2) {
      m2.innerHTML = renderModule2Health(positions, pool);
    }
  } catch (error) {
    console.error("module2 render error:", error);
    if (m2) m2.innerHTML = `<p>module2 render 錯誤</p>`;
  }

  const enrichedPool = renderM3AStocks(pool20) || [];
  initDashboard(enrichedPool);
  renderM3Placeholders();
}

init();
