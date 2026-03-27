import { buildNewsRuntime } from "./modules/m1_event_engine.js";

function fmt(n) {
  return Number(n || 0).toFixed(4);
}

function fmtArr(arr = []) {
  return "[" + arr.map(x => fmt(x)).join(", ") + "]";
}

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(path);
  return res.json();
}

function render(stockMap, stockPool) {
  const root = document.body;

  const list = stockPool
    .map(s => ({
      symbol: s.symbol,
      ...(stockMap[s.symbol] || {})
    }))
    .sort((a, b) => b.event_score - a.event_score);

  const box = document.createElement("div");

  list.forEach((s, i) => {
    const div = document.createElement("div");
    div.style.border = "1px solid #ddd";
    div.style.padding = "10px";
    div.style.margin = "10px";

    div.innerHTML = `
      <b>#${i + 1} ${s.symbol}</b><br/>
      event_score: ${fmt(s.event_score)}<br/>
      macro_avg: ${fmt(s.macro_avg)}<br/>
      industry_avg: ${fmt(s.industry_avg)}<br/>
      market_avg: ${fmt(s.market_avg)}<br/>
      news_count: ${s.news_count}<br/>
      <hr/>
      macro_scores: ${fmtArr(s.macro_scores)}<br/>
      industry_scores: ${fmtArr(s.industry_scores)}<br/>
      market_scores: ${fmtArr(s.market_scores)}
    `;

    box.appendChild(div);
  });

  root.appendChild(box);
}

async function main() {
  const [
    news,
    pool,
    impact,
    sector,
    market,
    sensitivity
  ] = await Promise.all([
    loadJson("./data/news_input.json"),
    loadJson("./data/pool30.json"),
    loadJson("./data/impact_table_v2.json"),
    loadJson("./data/sector_map_v1.json"),
    loadJson("./data/market_rule_table_v1.json"),
    loadJson("./data/stock_sensitivity_map_v1.json")
  ]);

  const runtime = buildNewsRuntime(
    "2026",
    news,
    impact,
    sector,
    market,
    pool,
    sensitivity
  );

  console.log(runtime);
  window.stockEventMap = runtime.stock_event_map;

  render(runtime.stock_event_map, pool);
}

main();
