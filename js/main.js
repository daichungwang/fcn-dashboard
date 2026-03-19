import { renderModule1News } from "./modules/module1_news.js?v=5";
import { renderModule2Health } from "./modules/module2_health.js?v=5";
import { renderModule3Decision } from "./modules/module3_decision.js?v=5";

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return res.json();
}

async function init() {
  try {
    const positions = await loadJson("./data/positions.json");
    const pool = await loadJson("./data/pool.json");
    const newsData = await loadJson("./data/news.json");

    console.log("newsData:", newsData);

    const m1 = document.getElementById("module1-news");
    const m2 = document.getElementById("module2-health");
    const m3 = document.getElementById("module3-decision");

    if (m1) {
      m1.innerHTML = renderModule1News(newsData);
    }

    if (m2) {
      m2.innerHTML = renderModule2Health(positions, pool);
    }

    if (m3) {
      m3.innerHTML = renderModule3Decision(positions, pool);
    }
  } catch (error) {
    console.error("init error:", error);
  }
}

init();
