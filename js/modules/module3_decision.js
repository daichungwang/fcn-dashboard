import { FCN_SCENARIOS } from "../../data/fcn_scenarios.js";
import { FCN_RUNTIME } from "../../data/fcn_runtime.js";
import { calcFCNPure } from "../core/fcn_engine.js";

async function loadMarketRuntime() {
  const res = await fetch("./data/market_runtime.json");
  if (!res.ok) {
    throw new Error("market_runtime.json 載入失敗");
  }
  return await res.json();
}

const state = {
  selectedBasket: [],
  expanded: false,
  marketRuntime: {}
};

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

function renderLayout() {
  const root = document.getElementById("module3");
  if (!root) return;

  root.innerHTML = `
    <div class="card">
      <h2>模組三｜FCN 決策系統</h2>
      <button id="run-sim">執行 FCN 模擬</button>
      <div id="m3-result"></div>
    </div>
  `;
}

function bindEvents() {
  document
    .getElementById("run-sim")
    ?.addEventListener("click", runSimulation);
}

function getMockBasket() {
  return [
    { symbol: "NVDA", category: "核心" },
    { symbol: "TSM", category: "核心" },
    { symbol: "MSFT", category: "核心" },
    { symbol: "UNH", category: "防禦" }
  ];
}

function runSimulation() {
  const basket = getMockBasket();
  state.selectedBasket = basket;

  const activeIds = FCN_RUNTIME.activeScenarioIds || [];

  const activeScenarios = FCN_SCENARIOS.filter(s =>
    activeIds.includes(s.id)
  );

  const results = activeScenarios.map(s => {
    const result = calcFCNPure({
      stocks: basket,
      rate: s.rate,
      period: s.period,
      ki: s.ki,
      strike: s.strike,
      eki: s.eki
    });

    return {
      name: s.name,
      params: s,
      score: result.total,
      detail: {
        ...result.breakdown,
        symbols: basket.map(x => x.symbol)
      }
    };
  });

  renderResults(results);
}

function renderResults(results) {
  const container = document.getElementById("m3-result");
  if (!container) return;

  container.innerHTML = results.map((r, i) => {
    const symbols = r.detail.symbols || ["NVDA"];

    let worst = null;
    let worstRet = 999;

    symbols.forEach(sym => {
      const s = state.marketRuntime[sym];
      if (!s || s.ret_1d == null) return;

      if (s.ret_1d < worstRet) {
        worstRet = s.ret_1d;
        worst = { ...s, symbol: sym };
      }
    });

    const price = worst ? Number(worst.price_now).toFixed(2) : "-";
    const ret = worst ? (worst.ret_1d * 100).toFixed(2) + "%" : "-";
    const worstSymbol = worst ? worst.symbol : "-";

    return `
      <div class="stock-card">
        <b>${r.name} | ${r.score}</b>
        <button onclick="toggleDetail(${i})">展開</button>

        <div id="detail-${i}" style="display:block;">
          stock:${r.detail.stock} ｜ Worst: ${worstSymbol} ${price} (${ret})<br/>
          rate:${r.detail.rate}<br/>
          period:${r.detail.period}<br/>
          p_risk:${r.detail.p_risk}<br/>
          sri:${r.detail.sri}<br/>
          eki:${r.detail.eki}
        </div>
      </div>
    `;
  }).join("");
}

window.toggleDetail = function(index) {
  const el = document.getElementById(`detail-${index}`);
  if (!el) return;
  el.style.display = el.style.display === "none" ? "block" : "none";
};
