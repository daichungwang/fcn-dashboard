import { renderModule2Health } from "./modules/module2_health.js";
import { renderModule3Decision } from "./modules/module3_decision.js";

async function loadJson(path) {
  const res = await fetch(path);
  return res.json();
}

async function init() {
  const positions = await loadJson("./data/positions.json");
  const pool = await loadJson("./data/pool.json");

  const m2 = document.getElementById("module2-health");
  const m3 = document.getElementById("module3-decision");

  if (m2) {
    m2.innerHTML = renderModule2Health(positions, pool);
  }

  if (m3) {
    m3.innerHTML = renderModule3Decision(positions);
  }
}

init();
