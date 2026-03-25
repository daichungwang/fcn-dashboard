async function loadMarketRuntime() {
  const res = await fetch("./data/market_runtime.json");
  if (!res.ok) {
    throw new Error("market_runtime.json 載入失敗");
  }
  return await res.json();
}

/* ==========================================
   module3_decision.js V1（穩定完整版）
========================================== */

import { FCN_SCENARIOS } from "../../data/fcn_scenarios.js";
import { FCN_RUNTIME } from "../../data/fcn_runtime.js";
import { calcFCNPure } from "../core/fcn_engine.js";

// 🔹 取得啟用情境
function getActiveScenarios() {
  const idSet = new Set(FCN_RUNTIME.activeScenarioIds || []);
  return FCN_SCENARIOS.filter(s => idSet.has(s.id));
}

// 狀態
const state = {
  selectedBasket: [],
  expanded: false,
  marketRuntime: {}
};

// 初始化
export async function initModule3() {
  renderLayout();

  try {
    state.marketRuntime = await loadMarketRuntime();
    console.log("✅ market_runtime loaded", state.marketRuntime);
  } catch (err) {
    console.error("❌ market_runtime 載入失敗", err);
    state.marketRuntime = {};
  }

  bindEvents();
}

// UI
function renderLayout() {
  const root = document.getElementById("module3");
  if (!root) return;

  root.innerHTML = `
    <div>
      <h2>模組三｜FCN 決策系統</h2>
      <button id="run-sim">執行 FCN 模擬</button>
      <div id="m3-result"></div>
    </div>
  `;
}

// 綁定事件
function bindEvents() {
  document
    .getElementById("run-sim")
    ?.addEventListener("click", runSimulation);
}

// Mock Basket
function getMockBasket() {
  return [
    { symbol: "NVDA", baseline_label: "核心", ret_1m: 10, ret_6m: 25, ret_12m: 40 },
    { symbol: "TSM", baseline_label: "核心", ret_1m: 8, ret_6m: 20, ret_12m: 35 },
    { symbol: "MSFT", baseline_label: "核心", ret_1m: 6, ret_6m: 18, ret_12m: 28 },
    { symbol: "UNH", baseline_label: "防禦", ret_1m: 3, ret_6m: 10, ret_12m: 18 }
  ];
}

// 核心
function runSimulation() {
  const basket = getMockBasket();

  const scenarios = getActiveScenarios();

  const results = scenarios.map(s => {
    const r = calcFCNPure({
      stocks: basket,
      rate: s.rate,
      period: s.period,
      ki: s.ki,
      strike: s.strike,
      eki: s.eki
    });

    return {
      name: s.name,
      score: r.total,
      detail: r.breakdown
    };
  });

  renderResults(results);
}

// UI 顯示
function renderResults(results) {
  const container = document.getElementById("m3-result");
  if (!container) return;
   // 取得 basket 股票（假設存在 r.detail.symbols）
const symbols = r.detail.symbols || ["NVDA"];

// 找最差表現
let worst = null;
let worstRet = 999;

symbols.forEach(sym => {
    const s = state.marketRuntime[sym];
    if (!s || s.ret_1d == null) return;

    if (s.ret_1d < worstRet) {
        worstRet = s.ret_1d;
        worst = s;
        worst.symbol = sym;
    }
});

const price = worst ? worst.price_now : "-";
const ret = worst ? (worst.ret_1d * 100).toFixed(2) + "%" : "-";
const worstSymbol = worst ? worst.symbol : "-";
  container.innerHTML = results.map((r, i) => {

    // ⭐⭐⭐ 這裡才可以用 r ⭐⭐⭐

    const symbols = r.detail.symbols || ["NVDA"];

    let worst = null;
    let worstRet = 999;

    symbols.forEach(sym => {
        const s = state.marketRuntime[sym];
        if (!s || s.ret_1d == null) return;

        if (s.ret_1d < worstRet) {
            worstRet = s.ret_1d;
            worst = s;
            worst.symbol = sym;
        }
    });

    const price = worst ? worst.price_now : "-";
    const ret = worst ? (worst.ret_1d * 100).toFixed(2) + "%" : "-";
    const worstSymbol = worst ? worst.symbol : "-";

    return `
    <div>
        <b>${r.name} | ${r.score}</b>
        <button onclick="toggleDetail(${i})">展開</button>

        <div id="detail-${i}" style="display:none;">
            stock:${r.detail.stock} ｜ Worst: ${worstSymbol} ${price} (${ret})<br>
            rate:${r.detail.rate}<br>
            period:${r.detail.period}<br>
            p_risk:${r.detail.p_risk}<br>
            sri:${r.detail.sri}<br>
            eki:${r.detail.eki}
        </div>
    </div>
    `;
}).join("");
}

// 展開
window.toggleDetail = function(index) {
  const el = document.getElementById(`detail-${index}`);
  if (!el) return;

  el.style.display =
    el.style.display === "none" ? "block" : "none";
};
