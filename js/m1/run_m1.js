import { runM1Engine } from "./m1_engine.js";

async function main() {
  try {
    const pool30Raw = await fetch("data/pool30.json").then(r => r.json());
    const m7Raw = await fetch("data/m7/m7_new_stock_today.json").then(r => r.json());

    const pool30 = normalizePool30(pool30Raw);
    const m7Stocks = normalizeM7Stocks(m7Raw);

    const merged = mergeM1Inputs(pool30, m7Stocks);

    console.log("pool30 =", pool30);
    console.log("m7Stocks =", m7Stocks);
    console.log("merged first 10 =", merged.slice(0, 10));

    const result = runM1Engine(merged);

    console.log("M1 RESULT =", result);

    renderM1(result, merged);
  } catch (err) {
    console.error("M1 error:", err);
    const el = document.getElementById("m1_output");
    if (el) {
      el.innerHTML = `<pre style="color:red;">${String(err?.stack || err)}</pre>`;
    }
  }
}

// ---------- pool30 normalize ----------
function normalizePool30(raw) {
  let arr = [];

  if (Array.isArray(raw)) {
    arr = raw;
  } else if (Array.isArray(raw?.stocks)) {
    arr = raw.stocks;
  } else if (Array.isArray(raw?.data)) {
    arr = raw.data;
  } else if (Array.isArray(raw?.items)) {
    arr = raw.items;
  } else {
    arr = [];
  }

  return arr.map((row) => {
    const symbol = getSymbol(row);
    return {
      ...row,
      symbol,
      name: row.name || row["股名"] || row.stock_name || "",
      category: row.category || row["分類"] || ""
    };
  }).filter(x => x.symbol);
}

// ---------- m7 normalize ----------
// 支援兩種結構：
// A. object keyed by symbol
// B. array (watch_pool / simulation_pool / reject_pool ...)
function normalizeM7Stocks(raw) {
  const resultMap = new Map();

  // case A: 直接是 object by symbol
  // 但要避開 generated_at / pool_summary 這種 meta key
  for (const [key, value] of Object.entries(raw || {})) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    const looksLikeStock =
      "valuation_score" in value ||
      "trend_score" in value ||
      "quality_score" in value ||
      "today_score" in value ||
      "snapshot" in value ||
      "growth" in value;

    if (looksLikeStock) {
      const symbol = String(key).toUpperCase().trim();
      resultMap.set(symbol, {
        symbol,
        ...value
      });
    }
  }

  // case B: 在 watch_pool / simulation_pool / reject_pool 等 array 內
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

// ---------- merge ----------
function mergeM1Inputs(pool30, m7Stocks) {
  const m7Map = new Map(
    m7Stocks.map(row => [row.symbol, row])
  );

  return pool30.map((stock) => {
    const symbol = stock.symbol;
    const m7 = m7Map.get(symbol) || {};

    return {
      ...stock,
      symbol,
      name:
        stock.name ||
        m7.name ||
        m7["股名"] ||
        "",

      // category：pool30 為主，m7 為輔
      category:
        stock.category ||
        m7.category ||
        m7["分類"] ||
        "",

      // ---- M7 long-term only ----
      valuation_score: pickNumber(m7, [
        "valuation_score",
        "估值分"
      ]),
      trend_score: pickNumber(m7, [
        "trend_score",
        "趨勢分"
      ]),
      quality_score: pickNumber(m7, [
        "quality_score",
        "品質分"
      ]),

      // ---- 暫留 M3 / capex 接口 ----
      snapshot: pickNumber(m7, [
        "snapshot",
        "Snapshot"
      ]),
      growth: pickNumber(m7, [
        "growth",
        "EPS成長率"
      ]),
      pure_stock_score: pickNumber(m7, [
        "pure_stock_score",
        "Pure平均"
      ]),
      snapshot_score: pickNumber(m7, [
        "snapshot_score",
        "snapshot",
        "Snapshot"
      ]),
      event_stock_score: pickNumber(m7, [
        "event_stock_score",
        "Event平均"
      ]),

      capex: pickNumber(m7, [
        "capex",
        "Capex"
      ]),
      profit: pickNumber(m7, [
        "profit",
        "Profit",
        "net_income",
        "operating_profit"
      ]),

      _m7_raw: m7
    };
  });
}

// ---------- helper ----------
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

// ---------- render ----------
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
