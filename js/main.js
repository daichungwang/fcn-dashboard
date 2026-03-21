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
