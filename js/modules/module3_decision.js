:::writing{variant=“standard” id=“m3_module_v1”}
/* ==========================================
module3_decision.js V1
M3｜FCN Decision UI（可用版）
========================================== */
import { FCN_SCENARIOS } from "../../data/fcn_scenarios.js";
import { FCN_RUNTIME } from "../../data/fcn_runtime.js";
import { calcFCNPure } from "../core/fcn_engine.js";

function getActiveScenarios() {
  const idSet = new Set(FCN_RUNTIME.activeScenarioIds || []);
  return FCN_SCENARIOS.filter(s => idSet.has(s.id));
}
// ——————————————
// 狀態
// ——————————————
const state = {
selectedBasket: [],
expanded: false
};

// ——————————————
// 初始化
// ——————————————
export function initModule3() {
renderLayout();
bindEvents();
}

// ——————————————
// UI Layout
// ——————————————
function renderLayout() {
const root = document.getElementById(“module3”);
if (!root) return;

root.innerHTML = `

模組三｜FCN 決策系統

  <div id="m3-basket"></div>

  <button id="run-sim">執行 FCN 模擬</button>

  <div id="m3-result"></div>
</div>

`;
}

// ——————————————
// 綁定事件
// ——————————————
function bindEvents() {
document.getElementById(“run-sim”)
?.addEventListener(“click”, runSimulation);
}

// ——————————————
// 設定 Basket（暫時寫死，下一版會接 pool）
// ——————————————
function getMockBasket() {
return [
{ symbol: “NVDA”, category: “核心” },
{ symbol: “TSM”, category: “核心” },
{ symbol: “MSFT”, category: “核心” },
{ symbol: “UNH”, category: “防禦” }
];
}

// ——————————————
// 執行模擬
// ——————————————
function runSimulation() {
const basket = getMockBasket();
state.selectedBasket = basket;

const activeIds = FCN_RUNTIME.activeScenarioIds;

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
  detail: result.breakdown
};
  });

renderResults(results);
}

// ——————————————
// 顯示結果
// ——————————————
function renderResults(results) {
const container = document.getElementById(“m3-result”);
if (!container) return;

container.innerHTML = results.map((r, i) => `


${r.name}｜Score：${r.score}
  <button onclick="toggleDetail(${i})">
    展開細節
  </button>

  <div id="detail-${i}" style="display:none;">
    stock：${r.detail.stock}<br/>
    rate：${r.detail.rate}<br/>
    period：${r.detail.period}<br/>
    p_risk：${r.detail.p_risk}<br/>
    sri：${r.detail.sri}<br/>
    eki：${r.detail.eki}
  </div>
</div>

`).join(””);
}

// ——————————————
// 展開 / 收合
// ——————————————
window.toggleDetail = function(index) {
const el = document.getElementById(detail-${index});
if (!el) return;

el.style.display =
el.style.display === “none” ? “block” : “none”;
};
:::

  
