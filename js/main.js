import { renderModule1News } from "./modules/module1_news.js?v=10";
import { renderModule2Health } from "./modules/module2_health.js?v=10";
import { renderModule3Decision } from "./modules/module3_decision.js?v=10";

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return res.json();
}

async function init() {
  const m1 = document.getElementById("module1-news");
  const m2 = document.getElementById("module2-health");
  const m3 = document.getElementById("module3-decision");

  let positions = [];
  let pool = [];
  let newsData = null;
  let config = {};

  try {
    positions = await loadJson("./data/positions.json");
  } catch (error) {
    console.error("positions load error:", error);
    if (m2) m2.innerHTML = `<p>positions.json 載入失敗</p>`;
  }

  try {
    pool = await loadJson("./data/pool.json");
  } catch (error) {
    console.error("pool load error:", error);
    if (m2) m2.innerHTML = `<p>pool.json 載入失敗</p>`;
  }

  try {
    newsData = await loadJson("./data/news.json");
  } catch (error) {
    console.error("news load error:", error);
    if (m1) m1.innerHTML = `<p>news.json 載入失敗</p>`;
  }

  try {
    config = await loadJson("./data/config.json");
  } catch (error) {
    console.error("config load error:", error);
    if (m3) m3.innerHTML = `<p>config.json 載入失敗</p>`;
  }

  try {
    if (m1 && newsData) {
      m1.innerHTML = renderModule1News(newsData);
    }
  } catch (error) {
    console.error("module1 render error:", error);
    if (m1) m1.innerHTML = `<p>module1 render 錯誤</p>`;
  }

  try {
    if (m2 && positions && pool) {
      m2.innerHTML = renderModule2Health(positions, pool);
    }
  } catch (error) {
    console.error("module2 render error:", error);
    if (m2) m2.innerHTML = `<p>module2 render 錯誤</p>`;
  }

  try {
    if (m3) {
  m3.innerHTML = renderModule3Decision(pool);
}
    }
  } catch (error) {
    console.error("module3 render error:", error);
    if (m3) m3.innerHTML = `<p>module3 render 錯誤</p>`;
  }
}

init();
