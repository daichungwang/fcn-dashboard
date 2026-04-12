// ==========================================
// M7 Basket Engine V2（正確結構版）
// 修正：不再砍高波動股票
// 核心：先定角色 → 再組 Basket
// ==========================================

const PATH_POOL = "./data/m7/m7_new_stock_pool.json";
const PATH_TODAY = "./data/m7/m7_new_stock_today.json";

// ------------------------------------------
function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

// ------------------------------------------
// 讀資料
// ------------------------------------------
async function loadJson(path) {
  const res = await fetch(path + "?v=" + Date.now());
  return await res.json();
}

// ------------------------------------------
// 建立 pool map
// ------------------------------------------
function buildPoolMap(poolRaw) {
  const map = new Map();

  if (poolRaw.data) {
    Object.values(poolRaw.data).forEach(x => {
      map.set(x.symbol, x);
    });
  }

  return map;
}

// ------------------------------------------
// 🚀 核心：角色分類（重點）
// ------------------------------------------
function getRole(stock) {
  const c = stock.category;

  // CORE
  if (c === "core") return "CORE_BASE";

  // 成長股（半導體 / AI）
  if (c === "growth") return "YIELD_DRIVER";

  // 防守
  if (c === "defensive" || c === "income") return "DEFENSIVE";

  // 投機 / 事件
  if (c === "speculative") return "EVENT";

  return "OTHER";
}

// ------------------------------------------
// 建立 universe（不砍股票）
// ------------------------------------------
function buildUniverse(poolMap, todayRaw) {
  return todayRaw.simulation_pool.map(s => {
    const meta = poolMap.get(s["股號"]);

    return {
      symbol: s["股號"],
      name: s["股名"],
      category: meta.category,
      total: n(s.today_score),
      exposure: s["曝險警示"]?.level || "normal",
      role: getRole(meta)
    };
  });
}

// ------------------------------------------
// 排序（曝險只是排序，不刪除）
// ------------------------------------------
function sortStocks(list) {
  return [...list].sort((a, b) => {
    const score = b.total - a.total;
    return score;
  });
}

// ------------------------------------------
// 🚀 建立角色池
// ------------------------------------------
function groupByRole(universe) {
  return {
    core: universe.filter(x => x.role === "CORE_BASE"),
    yield: universe.filter(x => x.role === "YIELD_DRIVER"),
    defensive: universe.filter(x => x.role === "DEFENSIVE"),
    event: universe.filter(x => x.role === "EVENT")
  };
}

// ------------------------------------------
// 🚀 積極型（重寫）
// ------------------------------------------
function buildAggressive(groups) {

  const core = sortStocks(groups.core);
  const yielders = sortStocks(groups.yield);
  const def = sortStocks(groups.defensive);
  const event = sortStocks(groups.event);

  const basket = [];

  // 1️⃣ 核心底座
  if (core[0]) basket.push(core[0]);

  // 2️⃣ 第二底座
  if (core[1]) basket.push(core[1]);

  // 🔥 3️⃣ 收益來源（強制）
  if (yielders[0]) basket.push(yielders[0]);

  // 🔥 4️⃣ 收益來源（強制）
  if (yielders[1]) basket.push(yielders[1]);

  // 5️⃣ 平衡或事件
  if (def[0]) {
    basket.push(def[0]);
  } else if (event[0]) {
    basket.push(event[0]);
  }

  return basket;
}

// ------------------------------------------
// 理性型
// ------------------------------------------
function buildRational(groups) {

  const core = sortStocks(groups.core);
  const yielders = sortStocks(groups.yield);
  const def = sortStocks(groups.defensive);

  const basket = [];

  if (core[0]) basket.push(core[0]);
  if (core[1]) basket.push(core[1]);

  if (yielders[0]) basket.push(yielders[0]);

  if (def[0]) basket.push(def[0]);

  if (core[2]) basket.push(core[2]);

  return basket;
}

// ------------------------------------------
// 保守型
// ------------------------------------------
function buildConservative(groups) {

  const core = sortStocks(groups.core);
  const def = sortStocks(groups.defensive);

  const basket = [];

  if (core[0]) basket.push(core[0]);
  if (core[1]) basket.push(core[1]);
  if (core[2]) basket.push(core[2]);

  if (def[0]) basket.push(def[0]);

  return basket;
}

// ------------------------------------------
// render basket
// ------------------------------------------
function renderBasket(id, basket, title) {
  const el = document.getElementById(id);

  el.innerHTML = `
    <div style="font-weight:800;font-size:18px;margin-bottom:10px">
      ${title}
    </div>
    ${basket.map(s => `
      <div style="padding:8px;border-bottom:1px solid #eee">
        ${s.symbol} (${s.role}) ｜ score ${round2(s.total)}
      </div>
    `).join("")}
  `;
}

// ------------------------------------------
// 主程式
// ------------------------------------------
async function init() {

  const poolRaw = await loadJson(PATH_POOL);
  const todayRaw = await loadJson(PATH_TODAY);

  const poolMap = buildPoolMap(poolRaw);

  const universe = buildUniverse(poolMap, todayRaw);

  const groups = groupByRole(universe);

  // 🚀 建 basket
  const aggressive = buildAggressive(groups);
  const rational = buildRational(groups);
  const conservative = buildConservative(groups);

  renderBasket("aggressive-basket", aggressive, "🔥 積極型");
  renderBasket("rational-basket", rational, "🟡 理性型");
  renderBasket("conservative-basket", conservative, "🟢 保守型");

  console.log("M7 Basket V2", { universe, groups, aggressive });
}

document.addEventListener("DOMContentLoaded", init);
