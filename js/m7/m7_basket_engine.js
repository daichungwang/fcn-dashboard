// ==========================================
// M7 Basket Engine V2 FIXED
// 修正版：補回 meta / structure / category / slot render
// ==========================================

const PATH_POOL = "./data/m7/m7_new_stock_pool.json";
const PATH_TODAY = "./data/m7/m7_new_stock_today.json";

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function round2(v) {
  return Math.round(n(v) * 100) / 100;
}

async function loadJson(path) {
  const res = await fetch(path + "?v=" + Date.now());
  if (!res.ok) throw new Error(`讀取失敗：${path}`);
  return await res.json();
}

function buildPoolMap(poolRaw) {
  const map = new Map();
  if (poolRaw?.data) {
    Object.values(poolRaw.data).forEach(x => {
      if (x?.symbol) map.set(x.symbol, x);
    });
  }
  return map;
}

function getRole(meta) {
  const c = String(meta?.category || "").toLowerCase();

  if (c === "core") return "CORE_BASE";
  if (c === "growth") return "YIELD_DRIVER";
  if (c === "defensive" || c === "income") return "DEFENSIVE";
  if (c === "speculative") return "EVENT";
  return "OTHER";
}

function buildUniverse(poolMap, todayRaw) {
  const sim = Array.isArray(todayRaw?.simulation_pool) ? todayRaw.simulation_pool : [];

  return sim.map(s => {
    const symbol = s["股號"];
    const meta = poolMap.get(symbol) || {};

    return {
      symbol,
      name: s["股名"],
      category: meta.category || "unknown",
      sector: meta.sector || "",
      subsector: meta.subsector || "",
      role: getRole(meta),

      total: n(s.today_score),
      valuation: n(s.valuation_score),
      trend: n(s.trend_score),
      structure: n(s.structure_score),
      timing: n(s.timing_score),
      money: n(s.money_score),

      exposure: s["曝險警示"]?.level || "normal",
      exposureText: s["曝險警示"]?.text || "",

      ranking: n(s["排名"]),
      raw: s
    };
  });
}

function sortStocks(list) {
  const exposureOrder = { high: 3, medium: 2, normal: 1, low: 0 };

  return [...list].sort((a, b) => {
    const ea = exposureOrder[a.exposure] ?? 1;
    const eb = exposureOrder[b.exposure] ?? 1;
    if (eb !== ea) return eb - ea;
    return b.total - a.total;
  });
}

function groupByCategory(universe) {
  return {
    core: sortStocks(universe.filter(x => x.category === "core")),
    growth: sortStocks(universe.filter(x => x.category === "growth")),
    defensive: sortStocks(universe.filter(x => x.category === "defensive")),
    income: sortStocks(universe.filter(x => x.category === "income")),
    speculative: sortStocks(universe.filter(x => x.category === "speculative"))
  };
}

function categoryLabel(key) {
  const map = {
    core: "CORE",
    growth: "GROWTH",
    defensive: "DEFENSIVE",
    income: "INCOME",
    speculative: "SPECULATIVE"
  };
  return map[key] || key;
}

function pickTop(list, count) {
  return list.slice(0, count);
}

function mergeUnique(...arrs) {
  const m = new Map();
  arrs.flat().forEach(x => {
    if (x?.symbol) m.set(x.symbol, x);
  });
  return Array.from(m.values());
}

// -----------------------------
// 三種 basket
// -----------------------------
function buildAggressive(groups) {
  return mergeUnique(
    pickTop(groups.core, 2),
    pickTop(groups.growth, 2),
    pickTop(groups.defensive, 1),
    pickTop(groups.income, 1),
    pickTop(groups.speculative, 1)
  ).slice(0, 5);
}

function buildRational(groups) {
  return mergeUnique(
    pickTop(groups.core, 2),
    pickTop(groups.growth, 1),
    pickTop(groups.defensive, 1),
    pickTop(groups.income, 1)
  ).slice(0, 5);
}

function buildConservative(groups) {
  return mergeUnique(
    pickTop(groups.core, 3),
    pickTop(groups.defensive, 1),
    pickTop(groups.income, 1)
  ).slice(0, 5);
}

// -----------------------------
// Render: meta
// -----------------------------
function renderMeta(todayRaw, universe) {
  const el = document.getElementById("basket-meta");
  if (!el) return;

  el.innerHTML = `
    <div class="meta-grid">
      <div class="meta-card">
        <div class="meta-title">M7 更新時間</div>
        <div class="meta-value">${todayRaw.generated_at || "--"}</div>
      </div>
      <div class="meta-card">
        <div class="meta-title">Simulation Pool</div>
        <div class="meta-value">${Array.isArray(todayRaw.simulation_pool) ? todayRaw.simulation_pool.length : 0} 檔</div>
      </div>
      <div class="meta-card">
        <div class="meta-title">Basket Universe</div>
        <div class="meta-value">${universe.length} 檔</div>
      </div>
    </div>
  `;
}

// -----------------------------
// Render: today structure
// -----------------------------
function renderTodayStructure(groups) {
  const el = document.getElementById("today-structure");
  if (!el) return;

  el.innerHTML = `
    <div class="summary-grid">
      <div class="summary-item"><span>CORE</span><strong>${groups.core.length}</strong></div>
      <div class="summary-item"><span>GROWTH</span><strong>${groups.growth.length}</strong></div>
      <div class="summary-item"><span>DEFENSIVE</span><strong>${groups.defensive.length}</strong></div>
      <div class="summary-item"><span>INCOME</span><strong>${groups.income.length}</strong></div>
      <div class="summary-item"><span>SPECULATIVE</span><strong>${groups.speculative.length}</strong></div>
    </div>
    <div class="structure-comment">
      今日結構以 simulation pool 為準，再對回 pool 內既有分類。
    </div>
  `;
}

// -----------------------------
// Render: category breakdown
// -----------------------------
function renderCategoryBreakdown(groups) {
  const el = document.getElementById("category-breakdown");
  if (!el) return;

  const order = ["core", "growth", "defensive", "income", "speculative"];

  el.innerHTML = order.map(key => `
    <div class="category-card">
      <div class="category-title">${categoryLabel(key)}（${groups[key].length}）</div>
      ${
        groups[key].length
          ? groups[key].map(s => `
            <div class="stock-line">
              <div class="stock-main">
                <strong>${s.symbol}</strong> ${s.name}
                <span class="pill">${s.exposure}</span>
              </div>
              <div class="stock-score">
                score ${round2(s.total)} ｜ ${s.role} ｜ ranking ${s.ranking}
              </div>
              <div class="stock-note">${s.exposureText || ""}</div>
            </div>
          `).join("")
          : `<div class="empty-line">無</div>`
      }
    </div>
  `).join("");
}

// -----------------------------
// Render: slot suggestion
// -----------------------------
function renderStyleSlots(id, title, desc, slots) {
  const el = document.getElementById(id);
  if (!el) return;

  el.innerHTML = `
    <div class="style-head">
      <div class="style-title">${title}</div>
      <div class="style-desc">${desc}</div>
    </div>

    ${slots.map(slot => `
      <div class="slot-card">
        <div class="slot-top">
          <div class="slot-title">${slot.title}</div>
          <div class="slot-tag">${slot.must ? "must" : "optional"}</div>
        </div>
        <div class="slot-desc">${slot.rule}</div>
        ${
          slot.candidates.length
            ? slot.candidates.map(s => `
              <div class="candidate-line">
                <div><strong>${s.symbol}</strong> ${s.name} <span class="pill">${s.exposure}</span></div>
                <div class="candidate-meta">
                  ${s.role} ｜ score ${round2(s.total)}
                </div>
              </div>
            `).join("")
            : `<div class="empty-line">目前無候選</div>`
        }
      </div>
    `).join("")}
  `;
}

// -----------------------------
// Render: basket
// -----------------------------
function renderBasketRecommendation(id, title, basket) {
  const el = document.getElementById(id);
  if (!el) return;

  el.innerHTML = `
    <div class="basket-card">
      <div class="basket-top">
        <div>
          <div class="basket-title">${title}</div>
          <div class="basket-sub">${basket.length} 檔</div>
        </div>
        <div class="basket-score">Basket</div>
      </div>

      ${
        basket.length
          ? basket.map(s => `
            <div class="stock-line">
              <div class="stock-main">
                <strong>${s.symbol}</strong> ${s.name}
                <span class="pill">${s.role}</span>
              </div>
              <div class="stock-score">
                score ${round2(s.total)} ｜ ${s.exposure}
              </div>
            </div>
          `).join("")
          : `<div class="empty-line">目前無法形成 basket</div>`
      }
    </div>
  `;
}

// -----------------------------
// slot 建議資料
// -----------------------------
function buildSlots(groups) {
  return {
    aggressive: [
      {
        title: "第 1 檔建議",
        must: false,
        rule: "core 高分底座",
        candidates: pickTop(groups.core, 3)
      },
      {
        title: "第 2 檔建議",
        must: false,
        rule: "core 或大型 growth",
        candidates: mergeUnique(pickTop(groups.core, 2), pickTop(groups.growth, 2)).slice(0, 4)
      },
      {
        title: "第 3 檔建議",
        must: true,
        rule: "收益來源（growth）",
        candidates: pickTop(groups.growth, 4)
      },
      {
        title: "第 4 檔建議",
        must: true,
        rule: "收益來源（growth / income / defensive）",
        candidates: mergeUnique(pickTop(groups.growth, 3), pickTop(groups.income, 2), pickTop(groups.defensive, 2)).slice(0, 5)
      },
      {
        title: "第 5 檔建議",
        must: true,
        rule: "平衡器或事件來源",
        candidates: mergeUnique(pickTop(groups.defensive, 2), pickTop(groups.income, 2), pickTop(groups.speculative, 2)).slice(0, 4)
      }
    ],

    rational: [
      {
        title: "第 1 檔建議",
        must: true,
        rule: "core 高分",
        candidates: pickTop(groups.core, 3)
      },
      {
        title: "第 2 檔建議",
        must: true,
        rule: "core 第二層",
        candidates: pickTop(groups.core.slice(1), 3)
      },
      {
        title: "第 3 檔建議",
        must: true,
        rule: "growth 收益來源",
        candidates: pickTop(groups.growth, 3)
      },
      {
        title: "第 4 檔建議",
        must: true,
        rule: "defensive / income",
        candidates: mergeUnique(pickTop(groups.defensive, 3), pickTop(groups.income, 3)).slice(0, 4)
      },
      {
        title: "第 5 檔建議",
        must: false,
        rule: "core / income 補位",
        candidates: mergeUnique(pickTop(groups.core, 3), pickTop(groups.income, 2)).slice(0, 4)
      }
    ],

    conservative: [
      {
        title: "第 1 檔建議",
        must: true,
        rule: "core 高分",
        candidates: pickTop(groups.core, 3)
      },
      {
        title: "第 2 檔建議",
        must: true,
        rule: "core 第二層",
        candidates: pickTop(groups.core.slice(1), 3)
      },
      {
        title: "第 3 檔建議",
        must: true,
        rule: "defensive / income / core",
        candidates: mergeUnique(pickTop(groups.defensive, 3), pickTop(groups.income, 3), pickTop(groups.core, 3)).slice(0, 5)
      },
      {
        title: "第 4 檔建議",
        must: false,
        rule: "income / core 補位",
        candidates: mergeUnique(pickTop(groups.income, 3), pickTop(groups.core, 3)).slice(0, 4)
      },
      {
        title: "第 5 檔建議",
        must: false,
        rule: "core 補品質",
        candidates: pickTop(groups.core, 3)
      }
    ]
  };
}

// -----------------------------
// init
// -----------------------------
async function init() {
  try {
    const poolRaw = await loadJson(PATH_POOL);
    const todayRaw = await loadJson(PATH_TODAY);

    const poolMap = buildPoolMap(poolRaw);
    const universe = buildUniverse(poolMap, todayRaw);
    const groups = groupByCategory(universe);

    const aggressive = buildAggressive(groups);
    const rational = buildRational(groups);
    const conservative = buildConservative(groups);

    const slots = buildSlots(groups);

    renderMeta(todayRaw, universe);
    renderTodayStructure(groups);
    renderCategoryBreakdown(groups);

    renderStyleSlots("aggressive-slots", "積極型", "高分底座 + 至少兩格收益來源 + 一格平衡器/事件。", slots.aggressive);
    renderStyleSlots("rational-slots", "理性型", "2 core + 1 growth + 1 defensive/income。", slots.rational);
    renderStyleSlots("conservative-slots", "保守型", "保守型可 3 core，或 2 core + 1 defensive / income。", slots.conservative);

    renderBasketRecommendation("aggressive-basket", "🔥 積極型", aggressive);
    renderBasketRecommendation("rational-basket", "🟡 理性型", rational);
    renderBasketRecommendation("conservative-basket", "🟢 保守型", conservative);

    console.log("M7 Basket Fixed", { universe, groups, aggressive, rational, conservative });
  } catch (err) {
    console.error(err);
    const el = document.getElementById("basket-error");
    if (el) el.textContent = `載入失敗：${err.message}`;
  }
}

document.addEventListener("DOMContentLoaded", init);
