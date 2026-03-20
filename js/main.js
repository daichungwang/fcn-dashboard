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

      renderModule3({
        pool,
        positions,
        newsData,
        marketData,
        quotesData,
        config
      });
    } else if (m3) {
      m3.innerHTML = `<p>目前沒有 Pool 資料</p>`;
    }
  } catch (error) {
    console.error("module3 render error:", error);
    if (m3) m3.innerHTML = `<p>module3 render 錯誤</p>`;
  }
}

init();
