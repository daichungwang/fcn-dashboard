import { evaluateStockUniverse } from "./core/stock_engine.js";
import { evaluateFCN } from "./core/fcn_engine.js";

// -----------------------------
// Load
// -----------------------------
async function loadJSON(path) {
  const res = await fetch(path);
  return await res.json();
}

// -----------------------------
// M3 主流程
// -----------------------------
window.runM3 = async function () {

  document.getElementById("status").innerHTML = "⏳ running...";

  const pool30 = await loadJSON("./data/pool30.json");
  const market = await loadJSON("./data/market_runtime.json");
  const params = await loadJSON("./data/parameter_matrix.json");

  // =============================
  // M3.1 股票評分
  // =============================
  const stocks = evaluateStockUniverse(pool30, market);

  // =============================
  // M3.2 過濾（核心邏輯）
  // =============================
  const cleanPool = stocks.filter(s => {
    const pure = s.pure_stock_score;
    const event = s.event_stock_score;
    const delta = event - pure;

    return (
      pure >= 5 &&
      event >= 6 &&
      delta > 0 &&
      s.suggestion !== "避免納入 FCN"
    );
  });

  renderPool(cleanPool);

  // =============================
  // M3.3 Simulation
  // =============================
  let results = [];

  params
    .filter(p => p.enabled)
    .forEach(p => {

      const combos = generateCombos(cleanPool, p.basket_size);

      combos.forEach((combo, i) => {

        const fcn = evaluateFCN({
          id: p.id + "_" + i,
          basket: combo.map(s => s.symbol),
          ki: p.ki,
          strike: p.strike,
          yield: p.rate,
          period: p.tenor,
          eki: p.eki
        }, combo);

        if (fcn) results.push(fcn);

      });

    });

  // =============================
  // M3.4 Ranking
  // =============================
  results.sort((a, b) => b.event_fcn - a.event_fcn);

  renderFCN(results.slice(0, 20));

  document.getElementById("status").innerHTML =
    `✅ 完成｜Stock:${stocks.length}｜Clean:${cleanPool.length}｜FCN:${results.length}`;
};

// -----------------------------
// 組合產生
// -----------------------------
function generateCombos(arr, size) {
  const result = [];

  function helper(start, combo) {
    if (combo.length === size) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }

  if (arr.length >= size) helper(0, []);
  return result;
}

// -----------------------------
// UI
// -----------------------------
function renderPool(pool) {
  const el = document.getElementById("pool");

  el.innerHTML = pool.map(s => `
    <div>
      ${s.symbol}｜
      Pure ${s.pure_stock_score.toFixed(1)}｜
      Event ${s.event_stock_score.toFixed(1)}｜
      Δ ${(s.event_stock_score - s.pure_stock_score).toFixed(1)}
    </div>
  `).join("");
}

function renderFCN(list) {
  const el = document.getElementById("fcn-table");

  el.innerHTML = list.map(f => {
    const delta = f.delta_fcn_pct;
    const cls = delta >= 0 ? "green" : "red";

    return `
      <tr>
        <td>${f.basket}</td>
        <td>${f.worst_of}</td>
        <td>${f.pure_fcn.toFixed(1)}</td>
        <td>${f.event_fcn.toFixed(1)}</td>
        <td class="${cls}">${delta.toFixed(1)}%</td>
        <td>${f.suggestion}</td>
      </tr>
    `;
  }).join("");
}
