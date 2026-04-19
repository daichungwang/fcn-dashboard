import { runM1Engine } from "./m1_engine.js";

console.log("RUN_M1 VERSION 2026-04-19 step1-fundamental");

async function main() {
  try {
    const pool30Raw = await fetch("data/pool30.json").then(r => r.json());
    const m7Raw = await fetch("data/m7/m7_new_stock_today.json").then(r => r.json());
    const fundamentalRaw = await fetch("data/m1/m1_fundamental_map.json?v=" + Date.now());

    const pool30 = normalizePool30(pool30Raw);
    const m7Stocks = normalizeM7Stocks(m7Raw);

    const merged = mergeM1Inputs(pool30, m7Stocks, fundamentalRaw || {});

    console.log("pool30 =", pool30);
    console.log("m7Stocks =", m7Stocks);
    console.log("fundamental keys =", Object.keys(fundamentalRaw || {}).slice(0, 10));
    console.log("merged first 10 =", merged.slice(0, 10));

    const result = runM1Engine(merged);

    console.log("M1 RESULT =", result);

    renderM1(result, merged);
  } catch (err) {
    console.error("M1 error:", err);
    const el = document.getElementById("m1_output");
    if (el) {
      el.innerHTML = `<pre style="color:red;">${escapeHtml(String(err?.stack || err))}</pre>`;
    }
  }
}

function normalizePool30(raw) {
  let arr = [];

  if (Array.isArray(raw)) arr = raw;
  else if (Array.isArray(raw?.stocks)) arr = raw.stocks;
  else if (Array.isArray(raw?.data)) arr = raw.data;
  else if (Array.isArray(raw?.items)) arr = raw.items;

  return arr
    .map((row) => {
      const symbol = getSymbol(row);
      return {
        ...row,
        symbol,
        name: row.name || row["股名"] || row.stock_name || "",
        category: row.category || row["分類"] || ""
      };
    })
    .filter(x => x.symbol);
}

function normalizeM7Stocks(raw) {
  const resultMap = new Map();

  for (const [key, value] of Object.entries(raw || {})) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    const looksLikeStock =
      "valuation_score" in value ||
      "trend_score" in value ||
      "quality_score" in value ||
      "today_score" in value ||
      "snapshot" in value ||
      "growth" in value ||
      "ValuationScore" in value ||
      "TrendScore" in value ||
      "QualityScore" in value;

    if (looksLikeStock) {
      const symbol = String(key).toUpperCase().trim();
      resultMap.set(symbol, {
        symbol,
        ...value
      });
    }
  }

  const candidateArrays = [
    raw?.watch_pool,
    raw?.simulation_pool,
    raw?.reject_pool,
    raw?.today_highlight_pool,
    raw?.watch_list,
    raw?.aggressive_recommend
  ];

  for (const arr of candidateArrays) {
    if (!Array.isArray(arr)) continue;

    for (const row of arr) {
      const symbol = getSymbol(row);
      if (!symbol) continue;

      if (!resultMap.has(symbol)) {
        resultMap.set(symbol, {
          symbol,
          ...row,
          category: row.category || row["分類"] || ""
        });
      }
    }
  }

  return Array.from(resultMap.values());
}

function mergeM1Inputs(pool30, m7Stocks, fundamentalMap) {
  const m7Map = new Map(
    m7Stocks.map(row => [row.symbol, row])
  );

  return pool30.map((stock) => {
    const symbol = stock.symbol;
    const m7 = m7Map.get(symbol) || {};
    const f = fundamentalMap?.[symbol] || {};

    const capexScore = calcFundamentalScore(f);

    return {
      ...stock,
      symbol,
      name: stock.name || m7.name || m7["股名"] || "",

      category:
        stock.category ||
        m7.category ||
        m7["分類"] ||
        "",

      // ---- M7 ----
      valuation_score: normalizeScore(
        pickNumber(m7, ["valuation_score", "ValuationScore", "估值分"])
      ),

      trend_score: normalizeScore(
        pickNumber(m7, ["trend_score", "TrendScore", "趨勢分"])
      ),

      quality_score: normalizeScore(
        pickNumber(m7, ["quality_score", "QualityScore", "品質分"])
      ),

      snapshot: normalizeScore(
        pickNumber(m7, ["snapshot", "Snapshot", "snapshot_score"])
      ),

      growth: pickNumber(m7, ["growth", "EPS成長率", "GrowthScoreAdj"]),

      pure_stock_score: normalizeScore(
        pickNumber(m7, ["pure_stock_score", "PureStockScore", "Pure平均"])
      ),

      snapshot_score: normalizeScore(
        pickNumber(m7, ["snapshot_score", "snapshot", "Snapshot"])
      ),

      event_stock_score: normalizeScore(
        pickNumber(m7, ["event_stock_score", "EventStockScore", "Event平均"])
      ),

      // ---- Fundamental proxy ----
      capex_ratio_prev_y: pickNumber(f, ["capex_ratio_prev_y"]),
      revenue_growth_q: pickNumber(f, ["revenue_growth_q"]),
      operating_income_growth_q: pickNumber(f, ["operating_income_growth_q"]),
      operating_income_q: pickNumber(f, ["operating_income_q"]),

      capex_score: capexScore,

      // 保留欄位，但不再強依賴真實 capex/profit
      capex: null,
      profit: null,

      _m7_raw: m7,
      _f_raw: f
    };
  });
}

function getSymbol(obj) {
  return String(
    obj?.symbol ??
    obj?.ticker ??
    obj?.stock ??
    obj?.stock_code ??
    obj?.["股號"] ??
    ""
  ).toUpperCase().trim();
}

function pickNumber(obj, keys) {
  for (const key of keys) {
    const v = obj?.[key];
    if (v === null || v === undefined || v === "") continue;
    const num = Number(v);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function normalizeScore(v) {
  const x = Number(v);
  if (!Number.isFinite(x)) return null;

  if (x >= 0 && x <= 10) return x;
  if (x > 10 && x <= 100) return x / 10;
  if (x > 100) return 10;
  return 0;
}

function mapRangeScore(x, bands) {
  if (!Number.isFinite(x)) return null;
  for (const [min, score] of bands) {
    if (x >= min) return score;
  }
  return bands[bands.length - 1][1];
}

function calcFundamentalScore(f) {
  if (!f || typeof f !== "object") return null;

  const capex = pickNumber(f, ["capex_ratio_prev_y"]);
  const rev = pickNumber(f, ["revenue_growth_q"]);
  const opg = pickNumber(f, ["operating_income_growth_q"]);
  const opq = pickNumber(f, ["operating_income_q"]);

  const capexScore = mapRangeScore(capex, [
    [15, 10],
    [12, 8.5],
    [9, 7],
    [6, 5.5],
    [3, 4],
    [0, 2.5]
  ]);

  const revScore = mapRangeScore(rev, [
    [30, 10],
    [20, 8.5],
    [10, 7],
    [5, 5.5],
    [0, 4],
    [-999, 2]
  ]);

  const opgScore = mapRangeScore(opg, [
    [40, 10],
    [25, 8.5],
    [15, 7],
    [5, 5.5],
    [0, 4],
    [-999, 2]
  ]);

  const sizeScore = mapRangeScore(opq, [
    [12000, 10],
    [8000, 8.5],
    [4000, 7],
    [1000, 5.5],
    [1, 4],
    [0, 2]
  ]);

  const parts = [];
  if (capexScore !== null) parts.push({ w: 0.4, v: capexScore });
  if (revScore !== null) parts.push({ w: 0.2, v: revScore });
  if (opgScore !== null) parts.push({ w: 0.3, v: opgScore });
  if (sizeScore !== null) parts.push({ w: 0.1, v: sizeScore });

  if (!parts.length) return null;

  const sumW = parts.reduce((s, x) => s + x.w, 0);
  const sumV = parts.reduce((s, x) => s + x.w * x.v, 0);

  return +(sumV / sumW).toFixed(2);
}

function renderM1(data, merged) {
  const el = document.getElementById("m1_output");
  if (!el) return;

  const top20 = [...data.scores].slice(0, 20);

  el.innerHTML = `
    <h2>M1 Engine Output</h2>

    <h3>Category Stats</h3>
    <pre>${escapeHtml(JSON.stringify(data.stats, null, 2))}</pre>

    <h3>Top Stocks</h3>
    <pre>${escapeHtml(JSON.stringify(top20, null, 2))}</pre>

    <h3>Merged Sample</h3>
    <pre>${escapeHtml(JSON.stringify(merged.slice(0, 5), null, 2))}</pre>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

main();
