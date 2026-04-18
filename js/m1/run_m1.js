import { runM1Engine } from "./m1_engine.js";

async function main() {
  try {
    const pool30Raw = await fetch("data/pool30.json").then(r => r.json());
    const m7TodayRaw = await fetch("data/m7/m7_new_stock_today.json").then(r => r.json());

    const pool30 = Array.isArray(pool30Raw)
      ? pool30Raw
      : (pool30Raw.stocks || pool30Raw.data || []);

    const m7Today = Array.isArray(m7TodayRaw)
      ? m7TodayRaw
      : (m7TodayRaw.stocks || m7TodayRaw.data || []);

    const merged = mergeM1Inputs(pool30, m7Today);

    console.log("MERGED INPUT:", merged);

    const result = runM1Engine(merged);

    console.log("M1 RESULT:", result);

    renderM1(result);
  } catch (err) {
    console.error("M1 error:", err);
  }
}

function mergeM1Inputs(pool30, m7Today) {
  const m7Map = new Map();

  for (const row of m7Today) {
    const symbol = String(
      row.symbol || row.ticker || row.stock || ""
    ).toUpperCase().trim();

    if (!symbol) continue;
    m7Map.set(symbol, row);
  }

  return pool30.map(stock => {
    const symbol = String(stock.symbol || stock.ticker || "").toUpperCase().trim();
    const m7 = m7Map.get(symbol) || {};

    return {
      ...stock,
      symbol,

      // ---- M7 借三項 ----
      valuation_score:
        toNum(m7.valuation_score) ??
        toNum(m7.ValuationScore) ??
        toNum(m7.valuation),

      trend_score:
        toNum(m7.trend_score) ??
        toNum(m7.TrendScore) ??
        toNum(m7.trend),

      quality_score:
        toNum(m7.quality_score) ??
        toNum(m7.QualityScore) ??
        toNum(m7.quality),

      // ---- 先保留 M3 欄位位置，現在可能還沒有 ----
      pure_stock_score:
        toNum(stock.pure_stock_score) ??
        toNum(m7.pure_stock_score),

      snapshot_score:
        toNum(stock.snapshot_score) ??
        toNum(m7.snapshot_score),

      event_stock_score:
        toNum(stock.event_stock_score) ??
        toNum(m7.event_stock_score),

      // ---- capex/profit 先保留 ----
      capex:
        toNum(stock.capex) ??
        toNum(m7.capex),

      profit:
        toNum(stock.profit) ??
        toNum(m7.profit)
    };
  });
}

function toNum(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function renderM1(data) {
  const el = document.getElementById("m1_output");
  if (!el) return;

  el.innerHTML = `
    <h2>M1 Engine Output</h2>

    <h3>Category Stats</h3>
    <pre>${JSON.stringify(data.stats, null, 2)}</pre>

    <h3>Top Stocks</h3>
    <pre>${JSON.stringify(
      data.scores
        .sort((a, b) => b.M1_score - a.M1_score)
        .slice(0, 15),
      null,
      2
    )}</pre>
  `;
}

main();
