import { runM8Case } from "../core/m8_batch_engine.js";

// ==========================================
// M7 Basket Engine FINAL
// 1. 保留 simulation_pool 全 15 檔，不再刪股票
// 2. 以 pool 決定分類，但 allow_fcn / reject 只標記，不過濾
// 3. 直接呼叫 M8 產生 Pair Fair Yield
// 4. 預建議 Basket 再整組送 M8，顯示真實 Basket Fair Yield
// 5. 新增達成率 Dashboard
// ==========================================
// 振宇 FCN 系統
// Proprietary System - All Rights Reserved
// Unauthorized copying or commercial use is prohibited
// All rights reserved by Gaya.Wang
// ==========================================
// ==========================================

const PATH_POOL = "./data/m7/m7_new_stock_pool.json";
const PATH_TODAY = "./data/m7/m7_new_stock_today.json";

const M8_PROXY_CONFIG = {
  KI: 55,
  Strike: 65,
  T: 6,
  type: "AKI"
};

// ------------------------------------------
// 工具
// ------------------------------------------
function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function round2(v) {
  const x = Number(v);
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0;
}

function safe(v, d = "") {
  return v === undefined || v === null ? d : v;
}

function avg(arr, key) {
  if (!arr.length) return 0;
  return arr.reduce((sum, x) => sum + n(x[key]), 0) / arr.length;
}

function uniqBy(list, key) {
  const seen = new Set();
  return list.filter(item => {
    const k = item?.[key];
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function scoreBand(score) {
  const s = n(score);
  if (s >= 84) return "high";
  if (s >= 75) return "middle";
  if (s >= 70) return "low";
  return "below";
}

function exposureRank(level) {
  if (level === "high") return 3;
  if (level === "medium") return 2;
  if (level === "normal") return 1;
  return 0;
}

function toggleSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const hidden = el.style.display === "none";
  el.style.display = hidden ? "block" : "none";

  const btn = document.querySelector(`[data-toggle-id="${id}"]`);
  if (btn) {
    btn.textContent = hidden ? "收合" : "展開";
  }
}
window.toggleSection = toggleSection;

async function loadJson(path) {
  const res = await fetch(path + "?v=" + Date.now());
  if (!res.ok) throw new Error(`讀取失敗：${path}`);
  return await res.json();
}

// ------------------------------------------
// Pool map
// ------------------------------------------
function buildPoolMap(poolRaw) {
  const map = new Map();

  if (poolRaw && typeof poolRaw === "object" && !Array.isArray(poolRaw) && poolRaw.data) {
    Object.values(poolRaw.data).forEach(row => {
      const symbol = String(row.symbol || "").toUpperCase();
      if (!symbol) return;
      map.set(symbol, row);
    });
    return map;
  }

  if (Array.isArray(poolRaw)) {
    poolRaw.forEach(row => {
      const symbol = String(row.symbol || "").toUpperCase();
      if (!symbol) return;
      map.set(symbol, row);
    });
  }

  return map;
}

// ------------------------------------------
// Universe：保留 simulation_pool 全部 15 檔
// 不再 filter allow_fcn / rejectType
// 只做標記
// ------------------------------------------
function buildUniverse(poolMap, todayRaw) {
  const simulationPool = Array.isArray(todayRaw.simulation_pool)
    ? todayRaw.simulation_pool
    : [];

  const universe = simulationPool
    .map(item => {
      const symbol = String(item["股號"] || "").toUpperCase();
      const meta = poolMap.get(symbol) || {};

      return {
        symbol,
        name: safe(item["股名"], safe(meta["名稱"], meta.name || symbol)),

        category: safe(meta.category, safe(item["category"], "unknown")).toLowerCase(),
        sector: safe(meta.sector),
        subsector: safe(meta.subsector),

        allow_fcn: meta.allow_fcn !== false && meta["是否納入新股票池"] !== false,
        pool_result: safe(meta["新股票池結果"], safe(meta.result, "")),
        isBlocked: meta.allow_fcn === false || meta["是否納入新股票池"] === false,
        isRejected: !!item.reject_type,

        total: n(item.today_score),
        valuation: n(item.valuation_score),
        trend: n(item.trend_score),
        structure: n(item.structure_score),
        timing: n(item.timing_score),
        money: n(item.money_score),

        ranking: n(item["排名"]),
        risk: safe(item["風險等級"]),
        action: safe(item["建議動作"]),
        uiBucket: safe(item["ui_bucket"]),

        trendState: safe(item["趨勢判讀"]?.["趨勢狀態"]),
        structureState: safe(item["趨勢判讀"]?.["結構狀態"]),
        timingState: safe(item["趨勢判讀"]?.["時機狀態"]),

        exposureLevel: safe(item["曝險警示"]?.level, "normal"),
        exposureText: safe(item["曝險警示"]?.text, ""),
        exposureRatio: n(item["持倉曝險"]?.["投入資金比"]),
        fcnCount: n(item["持倉曝險"]?.["FCN數量"]),

        whyYes: Array.isArray(item.why_yes) ? item.why_yes : [],
        whyNo: Array.isArray(item.why_no) ? item.why_no : [],
        finalComment: safe(item["最終說明"]),
        poolReason: item.pool_reason || null,

        pairFairYield: null,
        normalizedProxy: null,
        pairBasketVol: null,
        pairVolAdj: null,
        isAnchor: false,

        rawToday: item,
        rawPool: meta
      };
    });

  return uniqBy(universe, "symbol");
}

// ------------------------------------------
// 排序 / 分組
// ------------------------------------------
function sortForReview(list) {
  return [...list].sort((a, b) => {
    const e = exposureRank(b.exposureLevel) - exposureRank(a.exposureLevel);
    if (e !== 0) return e;
    return b.total - a.total;
  });
}

function groupUniverse(universe) {
  const grouped = {
    core: [],
    growth: [],
    defensive: [],
    income: [],
    speculative: [],
    unknown: []
  };

  universe.forEach(s => {
    const c = grouped[s.category] ? s.category : "unknown";
    grouped[c].push(s);
  });

  Object.keys(grouped).forEach(k => {
    grouped[k] = sortForReview(grouped[k]);
  });

  return grouped;
}

function categoryLabel(category) {
  const map = {
    core: "CORE",
    growth: "GROWTH",
    defensive: "DEFENSIVE",
    income: "INCOME",
    speculative: "SPECULATIVE",
    unknown: "UNKNOWN"
  };
  return map[category] || category;
}

function pickTop(list, count) {
  return list.slice(0, count);
}

function mergeUnique(...lists) {
  return uniqBy(lists.flat(), "symbol");
}

// ------------------------------------------
// Pair Fair Yield map
// ------------------------------------------
function pickAnchor(universe) {
  const sorted = [...universe].sort((a, b) => b.total - a.total);
  return sorted[0] || null;
}

async function buildPairFairYieldMap(universe) {
  const anchor = pickAnchor(universe);
  if (!anchor) {
    return {
      anchor: null,
      rows: [],
      baseYield: null,
      universe
    };
  }

  const rows = [];

  for (const stock of universe) {
    if (stock.symbol === anchor.symbol) continue;

    const result = await runM8Case({
      caseName: `PAIR_${anchor.symbol}_${stock.symbol}`,
      symbols: [anchor.symbol, stock.symbol],
      KI: M8_PROXY_CONFIG.KI,
      Strike: M8_PROXY_CONFIG.Strike,
      T: M8_PROXY_CONFIG.T,
      type: M8_PROXY_CONFIG.type,
      marketYield: 0
    });

    rows.push({
      symbol: stock.symbol,
      pairFairYield: round2(result.fair_yield),
      basketVol: round2(result.basket_vol),
      volAdj: round2(result.vol_adj),
      pairPricingView: result.pricing_view || "",
      pairNote: result.note || ""
    });
  }

  const validYields = rows
    .map(r => r.pairFairYield)
    .filter(v => Number.isFinite(v) && v > 0);

  const baseYield = validYields.length ? Math.min(...validYields) : null;

  const proxyMap = new Map();
  rows.forEach(r => {
    const normalizedProxy = baseYield ? round2(r.pairFairYield / baseYield) : null;
    proxyMap.set(r.symbol, {
      ...r,
      normalizedProxy
    });
  });

  const enrichedUniverse = universe.map(s => {
    if (s.symbol === anchor.symbol) {
      return {
        ...s,
        isAnchor: true,
        pairFairYield: null,
        normalizedProxy: null,
        pairBasketVol: null,
        pairVolAdj: null
      };
    }

    const p = proxyMap.get(s.symbol);
    return {
      ...s,
      pairFairYield: p?.pairFairYield ?? null,
      normalizedProxy: p?.normalizedProxy ?? null,
      pairBasketVol: p?.basketVol ?? null,
      pairVolAdj: p?.volAdj ?? null
    };
  });

  return {
    anchor: { ...anchor, isAnchor: true },
    rows: [...proxyMap.values()].sort((a, b) => b.pairFairYield - a.pairFairYield),
    baseYield,
    universe: enrichedUniverse
  };
}

// ------------------------------------------
// 今日結構
// ------------------------------------------
function buildTodayStructure(grouped, universe, pairContext) {
  const counts = {
    core: grouped.core.length,
    growth: grouped.growth.length,
    defensive: grouped.defensive.length,
    income: grouped.income.length,
    speculative: grouped.speculative.length,
    unknown: grouped.unknown.length
  };

  let comment = "今日結構均衡。";

  if (counts.core >= 4 && counts.growth >= 2) {
    comment = "今日 simulation pool 兼具核心與成長，理性型最容易成立，積極型可再靠收益來源補強。";
  } else if (counts.core >= 4 && counts.defensive + counts.income >= 2) {
    comment = "今日結構偏核心穩健，理性型與保守型較有優勢。";
  } else if (counts.growth >= 3 && counts.core <= 2) {
    comment = "今日結構偏進攻，若做 FCN 必須嚴格控管 worst-of 風險。";
  } else if (counts.speculative > 0) {
    comment = "今日 pool 中有 speculative 類，可觀察但不宜過度集中。";
  }

  return {
    total: universe.length,
    counts,
    comment,
    anchorSymbol: pairContext?.anchor?.symbol || null,
    anchorScore: pairContext?.anchor?.total || null,
    proxyBaseYield: pairContext?.baseYield || null
  };
}

// ------------------------------------------
// 風格定義
// ------------------------------------------
function buildStyleDefinitions() {
  return {
    aggressive: {
      style_name: "積極型",
      target_min: 19,
      target_max: 25,
      today_target: 21,
      description: "高分底座 + 至少兩格收益來源 + 一格平衡器/放大器。"
    },
    rational: {
      style_name: "理性型",
      target_min: 15,
      target_max: 19,
      today_target: 17,
      description: "2 core + 1 growth + 1 defensive/income。"
    },
    conservative: {
      style_name: "保守型",
      target_min: 12,
      target_max: 15,
      today_target: 13,
      description: "2~3 core + defensive/income，高 proxy 檔數受限。"
    }
  };
}

// ------------------------------------------
// 產生不同候選組
// 讓三種風格不再長一樣
// ------------------------------------------
function byPairYieldDesc(list) {
  return [...list].sort((a, b) => n(b.pairFairYield, -1) - n(a.pairFairYield, -1));
}

function pickBySymbol(list, symbols) {
  const set = new Set(symbols);
  return list.filter(x => set.has(x.symbol));
}

function buildStyleCandidates(styleKey, grouped, universe) {
  const core = grouped.core || [];
  const growth = grouped.growth || [];
  const defensive = grouped.defensive || [];
  const income = grouped.income || [];
  const speculative = grouped.speculative || [];

  const highYield = byPairYieldDesc(universe.filter(x => n(x.pairFairYield) >= 15));
  const midYield = byPairYieldDesc(universe.filter(x => n(x.pairFairYield) >= 13 && n(x.pairFairYield) < 15));
  const lowYield = byPairYieldDesc(universe.filter(x => n(x.pairFairYield) > 0 && n(x.pairFairYield) < 13));

  if (styleKey === "aggressive") {
    const slot1 = pickTop(core, 3);
    const slot2 = mergeUnique(pickTop(core, 2), pickTop(growth, 3)).slice(0, 4);
    const slot3 = mergeUnique(pickTop(byPairYieldDesc(growth), 4), pickTop(highYield, 4)).slice(0, 5);
    const slot4 = mergeUnique(pickTop(highYield, 5), pickTop(midYield, 3)).slice(0, 5);
    const slot5 = mergeUnique(pickTop(defensive, 2), pickTop(speculative, 2), pickTop(income, 2)).slice(0, 4);
    return { slot1, slot2, slot3, slot4, slot5 };
  }

  if (styleKey === "rational") {
    const slot1 = pickTop(core, 3);
    const slot2 = pickTop(core.slice(1), 3);
    const slot3 = mergeUnique(pickTop(byPairYieldDesc(growth), 3), pickTop(midYield, 3)).slice(0, 4);
    const slot4 = mergeUnique(pickTop(defensive, 3), pickTop(income, 3)).slice(0, 4);
    const slot5 = mergeUnique(pickTop(core, 2), pickTop(income, 2), pickTop(lowYield, 2)).slice(0, 4);
    return { slot1, slot2, slot3, slot4, slot5 };
  }

  const slot1 = pickTop(core, 3);
  const slot2 = pickTop(core.slice(1), 3);
  const slot3 = mergeUnique(pickTop(lowYield, 3), pickTop(defensive, 3), pickTop(income, 3), pickTop(core, 2)).slice(0, 5);
  const slot4 = mergeUnique(pickTop(income, 2), pickTop(core, 2), pickTop(lowYield, 2)).slice(0, 4);
  const slot5 = pickTop(core, 2);
  return { slot1, slot2, slot3, slot4, slot5 };
}

// ------------------------------------------
// Slot UI 內容
// ------------------------------------------
function buildStyleSlots(styleKey, candidates) {
  const defs = buildStyleDefinitions();
  const style = defs[styleKey];

  if (styleKey === "aggressive") {
    return {
      ...style,
      slots: [
        { title: "第 1 檔建議", must: false, rule: "CORE / 高分底座", candidates: candidates.slot1 },
        { title: "第 2 檔建議", must: false, rule: "CORE 或大型 GROWTH", candidates: candidates.slot2 },
        { title: "第 3 檔建議", must: true, rule: "收益來源（高 Pair Fair Yield）", candidates: candidates.slot3 },
        { title: "第 4 檔建議", must: true, rule: "第二收益來源（高 Pair Fair Yield）", candidates: candidates.slot4 },
        { title: "第 5 檔建議", must: true, rule: "平衡器 / 放大器", candidates: candidates.slot5 }
      ]
    };
  }

  if (styleKey === "rational") {
    return {
      ...style,
      slots: [
        { title: "第 1 檔建議", must: true, rule: "CORE / 高分", candidates: candidates.slot1 },
        { title: "第 2 檔建議", must: true, rule: "CORE / 第二層", candidates: candidates.slot2 },
        { title: "第 3 檔建議", must: true, rule: "GROWTH / 中高 Pair Fair Yield", candidates: candidates.slot3 },
        { title: "第 4 檔建議", must: true, rule: "DEFENSIVE / INCOME", candidates: candidates.slot4 },
        { title: "第 5 檔建議", must: false, rule: "補位", candidates: candidates.slot5 }
      ]
    };
  }

  return {
    ...style,
    slots: [
      { title: "第 1 檔建議", must: true, rule: "CORE / 高分", candidates: candidates.slot1 },
      { title: "第 2 檔建議", must: true, rule: "CORE / 第二層", candidates: candidates.slot2 },
      { title: "第 3 檔建議", must: true, rule: "低 Proxy / Defensive / Income", candidates: candidates.slot3 },
      { title: "第 4 檔建議", must: false, rule: "Income / Core 補位", candidates: candidates.slot4 },
      { title: "第 5 檔建議", must: false, rule: "Core 補品質", candidates: candidates.slot5 }
    ]
  };
}

// ------------------------------------------
// 用 slot 建兩組推薦
// 第一組：主推
// 第二組：備選
// ------------------------------------------
function composeBasketFromSlots(styleSpec, variant = 1) {
  const used = new Set();
  const picks = [];

  styleSpec.slots.forEach(slot => {
    const idx = variant === 1 ? 0 : 1;
    const fallbackIdx = variant === 1 ? 1 : 0;

    let candidate = slot.candidates.find((x, i) => i === idx && !used.has(x.symbol));
    if (!candidate) {
      candidate = slot.candidates.find((x, i) => i === fallbackIdx && !used.has(x.symbol));
    }
    if (!candidate) {
      candidate = slot.candidates.find(x => !used.has(x.symbol));
    }
    if (!candidate) return;

    if (slot.must || picks.length < 5) {
      picks.push({
        slot: slot.title,
        must: slot.must,
        stock: candidate
      });
      used.add(candidate.symbol);
    }
  });

  const stocks = picks.map(x => x.stock);

  return {
    style_name: styleSpec.style_name,
    target_min: styleSpec.target_min,
    target_max: styleSpec.target_max,
    today_target: styleSpec.today_target,
    basket_count: stocks.length,
    symbols: stocks.map(x => x.symbol),
    avg_total: round2(avg(stocks, "total")),
    avg_pair_fair_yield: round2(avg(stocks.filter(x => x.pairFairYield), "pairFairYield")),
    avg_normalized_proxy: round2(avg(stocks.filter(x => x.normalizedProxy), "normalizedProxy")),
    picks
  };
}

async function enrichBasketWithM8(styleBasket) {
  const symbols = Array.isArray(styleBasket.symbols) ? styleBasket.symbols : [];

  if (symbols.length < 2) {
    return {
      ...styleBasket,
      m8_fair_yield: null,
      m8_basket_vol: null,
      m8_vol_adj: null,
      m8_pricing_view: null,
      m8_pre_rate: null,
      m8_note: ""
    };
  }

  const result = await runM8Case({
    caseName: `M7_${styleBasket.style_name}`,
    symbols,
    KI: M8_PROXY_CONFIG.KI,
    Strike: M8_PROXY_CONFIG.Strike,
    T: M8_PROXY_CONFIG.T,
    type: M8_PROXY_CONFIG.type,
    marketYield: 0
  });

  return {
    ...styleBasket,
    m8_fair_yield: round2(result.fair_yield),
    m8_basket_vol: round2(result.basket_vol),
    m8_vol_adj: round2(result.vol_adj),
    m8_pricing_view: result.pricing_view || "",
    m8_pre_rate: round2(result.pre_rate),
    m8_note: result.note || ""
  };
}

// ------------------------------------------
// 達成率 Dashboard
// ------------------------------------------
function buildAchievementComment({
  successCount,
  totalCount,
  avgVol,
  avgVolAdj,
  simulationPoolSize,
  validStockSize,
  categoryCount
}) {
  const reasons = [];

  if (successCount < totalCount) {
    reasons.push(
      `1️⃣ Rate無法達成\n推薦標的波動率偏低（Avg BasketVol：${round2(avgVol)}｜VolAdj：${round2(avgVolAdj)}），不足以支撐目標收益\n→ 建議調整 FCN條件`
    );
  }

  if (validStockSize < 10) {
    reasons.push(
      `2️⃣ 樣本數不足\n推薦標的數量偏少（有效標的：${validStockSize} / 原始：${simulationPoolSize}），不足以做足額推薦\n→ 今日 FCN market 可能較為嚴苛，不利承做`
    );
  }

  if (categoryCount.growth <= 2 && categoryCount.defensive >= 3) {
    reasons.push(
      `3️⃣ 結構偏保守\nCORE：${categoryCount.core}｜GROWTH：${categoryCount.growth}｜DEFENSIVE：${categoryCount.defensive}\n→ 收益驅動不足，難以形成高利率 Basket`
    );
  }

  if (!reasons.length) {
    return "今日結構與波動條件尚可，策略達成度正常。";
  }

  return `今日未能完全達成原因：\n\n${reasons.join("\n\n")}`;
}

function buildAchievementData(styleKey, baskets, grouped, universe) {
  const defs = buildStyleDefinitions();
  const style = defs[styleKey];

  const validBaskets = baskets.filter(Boolean);
  const successList = validBaskets.filter(b => n(b.m8_fair_yield) >= style.today_target);
  const rate = validBaskets.length ? round2((successList.length / validBaskets.length) * 100) : 0;

  const avgVol = validBaskets.length ? avg(validBaskets, "m8_basket_vol") : 0;
  const avgVolAdj = validBaskets.length ? avg(validBaskets, "m8_vol_adj") : 0;

  return {
    ...style,
    totalCount: validBaskets.length,
    successCount: successList.length,
    successRate: rate,
    baskets: validBaskets,
    comment: buildAchievementComment({
      successCount: successList.length,
      totalCount: validBaskets.length,
      avgVol,
      avgVolAdj,
      simulationPoolSize: universe.length,
      validStockSize: universe.length,
      categoryCount: {
        core: grouped.core.length,
        growth: grouped.growth.length,
        defensive: grouped.defensive.length
      }
    })
  };
}

// ------------------------------------------
// render
// ------------------------------------------
function renderMeta(todayRaw, universe, pairContext) {
  const el = document.getElementById("basket-meta");
  if (!el) return;

  const summary = todayRaw.pool_summary || {};

  el.innerHTML = `
    <div class="meta-grid">
      <div class="meta-card">
        <div class="meta-title">M7 更新時間</div>
        <div class="meta-value">${safe(todayRaw.generated_at, "--")}</div>
      </div>
      <div class="meta-card">
        <div class="meta-title">Simulation Pool</div>
        <div class="meta-value">${n(summary.simulation_count || universe.length)} 檔</div>
      </div>
      <div class="meta-card">
        <div class="meta-title">Anchor</div>
        <div class="meta-value">${pairContext?.anchor?.symbol || "--"}</div>
      </div>
    </div>
  `;
}

function renderTodayStructure(structure) {
  const el = document.getElementById("today-structure");
  if (!el) return;

  const c = structure.counts;

  el.innerHTML = `
    <div class="summary-grid">
      <div class="summary-item"><span>CORE</span><strong>${c.core}</strong></div>
      <div class="summary-item"><span>GROWTH</span><strong>${c.growth}</strong></div>
      <div class="summary-item"><span>DEFENSIVE</span><strong>${c.defensive}</strong></div>
      <div class="summary-item"><span>INCOME</span><strong>${c.income}</strong></div>
      <div class="summary-item"><span>SPECULATIVE</span><strong>${c.speculative}</strong></div>
    </div>
    <div class="structure-comment">
      今日結構均衡。<br>
      Anchor：${structure.anchorSymbol || "--"} ｜ Anchor Score：${round2(structure.anchorScore)} ｜ Proxy Base Yield：${round2(structure.proxyBaseYield)}
    </div>
  `;
}

function renderAchievementDashboard(dataMap) {
  const el = document.getElementById("achievement-dashboard");
  if (!el) return;

  const order = ["aggressive", "rational", "conservative"];

  el.innerHTML = `
    <div class="achievement-grid">
      ${order.map(key => renderAchievementCard(dataMap[key])).join("")}
    </div>
  `;
}

function renderAchievementCard(d) {
  const first = d.baskets[0];
  const second = d.baskets[1];

  const firstDelta = first?.m8_fair_yield != null ? round2(first.m8_fair_yield - d.today_target) : null;
  const secondDelta = second?.m8_fair_yield != null ? round2(second.m8_fair_yield - d.today_target) : null;

  return `
    <div class="achievement-card">
      <div class="achievement-title">${d.style_name}推薦股票達成率</div>
      <div class="achievement-body">
        <div class="achievement-line">策略目標：${d.target_min}% ~ ${d.target_max}% ｜ 今日目標：${d.today_target}%</div>
        <div class="achievement-line">推薦組合：${d.totalCount}組 ｜ 達成數：${d.successCount}組 ｜ 達成率：${d.successRate}%</div>

        <div class="achievement-subtitle">第一組</div>
        <div class="achievement-line">
          ${first
            ? `Basket Fair Yield：${first.m8_fair_yield}% ｜ delta：${firstDelta >= 0 ? "+" : ""}${firstDelta}%`
            : "無"}
        </div>

        <div class="achievement-subtitle">第二組</div>
        <div class="achievement-line">
          ${second
            ? `Basket Fair Yield：${second.m8_fair_yield}% ｜ delta：${secondDelta >= 0 ? "+" : ""}${secondDelta}%`
            : "股票數不足以做足額推薦"}
        </div>

        <div class="achievement-subtitle">短評</div>
        <div class="achievement-comment">${d.comment.replace(/\n/g, "<br>")}</div>
      </div>
    </div>
  `;
}

function renderCategoryBreakdown(grouped) {
  const el = document.getElementById("category-breakdown");
  if (!el) return;

  const order = ["core", "growth", "defensive", "income", "speculative", "unknown"];

  el.innerHTML = order.map(key => {
    const list = grouped[key] || [];
    return `
      <div class="category-card">
        <div class="category-title">${categoryLabel(key)}（${list.length}）</div>
        ${list.length ? list.map(renderReviewLine).join("") : `<div class="empty-line">無</div>`}
      </div>
    `;
  }).join("");
}

function renderReviewLine(s) {
  const flags = [];
  if (s.isBlocked) flags.push("blocked");
  if (s.isRejected) flags.push("rejected");
  if (s.isAnchor) flags.push("ANCHOR");

  return `
    <div class="stock-line">
      <div class="stock-main">
        <strong>${s.symbol}</strong> ${s.name}
        <span class="pill">${s.exposureLevel}</span>
        <span class="pill muted-pill">${scoreBand(s.total)}</span>
        ${flags.map(f => `<span class="pill">${f}</span>`).join("")}
      </div>
      <div class="stock-score">
        Total ${round2(s.total)} ｜ Pair Fair Yield ${s.pairFairYield != null ? round2(s.pairFairYield) : "-"} ｜ Proxy ${s.normalizedProxy != null ? round2(s.normalizedProxy) : "-"}
      </div>
      <div class="stock-note">${safe(s.exposureText)}</div>
    </div>
  `;
}

function renderStyleSlots(targetId, styleSpec) {
  const el = document.getElementById(targetId);
  if (!el) return;

  el.innerHTML = `
    <div class="style-head">
      <div class="style-title">${styleSpec.style_name}</div>
      <div class="style-sub">策略目標：${styleSpec.target_min}% ~ ${styleSpec.target_max}% ｜ 今日目標：${styleSpec.today_target}%</div>
      <div class="style-desc">${styleSpec.description}</div>
    </div>

    ${styleSpec.slots.map(slot => `
      <div class="slot-card">
        <div class="slot-top">
          <div class="slot-title">${slot.title}</div>
          <div class="slot-tag">${slot.must ? "must" : "optional"}</div>
        </div>
        <div class="slot-desc">${slot.rule}</div>
        <div class="slot-list">
          ${slot.candidates?.length
            ? slot.candidates.map(renderSlotCandidate).join("")
            : `<div class="empty-line">目前無候選</div>`
          }
        </div>
      </div>
    `).join("")}
  `;
}

function renderSlotCandidate(s) {
  return `
    <div class="candidate-line">
      <div>
        <strong>${s.symbol}</strong> ${s.name}
        <span class="pill">${categoryLabel(s.category)}</span>
        <span class="pill">${s.exposureLevel}</span>
        ${s.isAnchor ? `<span class="pill">ANCHOR</span>` : ""}
      </div>
      <div class="candidate-meta">
        score ${round2(s.total)} ｜ Pair Fair Yield ${s.pairFairYield != null ? round2(s.pairFairYield) : "-"} ｜ Proxy ${s.normalizedProxy != null ? round2(s.normalizedProxy) : "-"}
      </div>
    </div>
  `;
}

function renderBasketRecommendation(targetId, basket) {
  const el = document.getElementById(targetId);
  if (!el) return;

  el.innerHTML = `
    <div class="basket-card">
      <div class="basket-top">
        <div>
          <div class="basket-title">${basket.style_name}</div>
          <div class="basket-sub">策略目標：${basket.target_min}% ~ ${basket.target_max}% ｜ 今日目標：${basket.today_target}%</div>
          <div class="basket-sub">
            Basket Fair Yield：${basket.m8_fair_yield != null ? basket.m8_fair_yield + "%" : "--"}
          </div>
          <div class="basket-sub">
            BasketVol：${basket.m8_basket_vol != null ? basket.m8_basket_vol : "--"} ｜ VolAdj：${basket.m8_vol_adj != null ? basket.m8_vol_adj : "--"}
          </div>
        </div>
        <div class="basket-score">${basket.basket_count} 檔</div>
      </div>

      <div class="basket-block">
        <div class="block-title">M7 預建議 Basket</div>
        ${basket.picks.length ? basket.picks.map(p => `
          <div class="stock-line">
            <div class="stock-main">
              <strong>${p.stock.symbol}</strong> ${p.stock.name}
              <span class="pill">${categoryLabel(p.stock.category)}</span>
              <span class="pill">${p.must ? "must" : "optional"}</span>
              ${p.stock.isAnchor ? `<span class="pill">ANCHOR</span>` : ""}
            </div>
            <div class="stock-score">
              來源：${p.slot}
              ｜ score ${round2(p.stock.total)}
              ｜ Pair Fair Yield ${p.stock.pairFairYield != null ? round2(p.stock.pairFairYield) : "-"}
              ｜ Proxy ${p.stock.normalizedProxy != null ? round2(p.stock.normalizedProxy) : "-"}
            </div>
          </div>
        `).join("") : `<div class="empty-line">目前無法形成 basket</div>`}
      </div>

      <div class="basket-block">
        <div class="block-title">平均值</div>
        <div class="stats-line">Avg Total ${basket.avg_total}</div>
        <div class="stats-line">Basket Fair Yield ${basket.m8_fair_yield != null ? basket.m8_fair_yield : "--"}</div>
        <div class="stats-line">BasketVol ${basket.m8_basket_vol != null ? basket.m8_basket_vol : "--"} ｜ VolAdj ${basket.m8_vol_adj != null ? basket.m8_vol_adj : "--"}</div>
        <div class="stats-line">Avg Pair Fair Yield ${basket.avg_pair_fair_yield}</div>
        <div class="stats-line">Avg Proxy ${basket.avg_normalized_proxy}</div>
      </div>
    </div>
  `;
}

// ------------------------------------------
// init
// ------------------------------------------
async function initBasketEngine() {
  try {
    const [poolRaw, todayRaw] = await Promise.all([
      loadJson(PATH_POOL),
      loadJson(PATH_TODAY)
    ]);

    const poolMap = buildPoolMap(poolRaw);
    const rawUniverse = buildUniverse(poolMap, todayRaw);

    const pairContext = await buildPairFairYieldMap(rawUniverse);
    const universe = pairContext.universe || rawUniverse;

    const grouped = groupUniverse(universe);
    const structure = buildTodayStructure(grouped, universe, pairContext);

    const aggressiveCandidates = buildStyleCandidates("aggressive", grouped, universe);
    const rationalCandidates = buildStyleCandidates("rational", grouped, universe);
    const conservativeCandidates = buildStyleCandidates("conservative", grouped, universe);

    const aggressiveSlots = buildStyleSlots("aggressive", aggressiveCandidates);
    const rationalSlots = buildStyleSlots("rational", rationalCandidates);
    const conservativeSlots = buildStyleSlots("conservative", conservativeCandidates);

    const aggressiveBasket1 = await enrichBasketWithM8(composeBasketFromSlots(aggressiveSlots, 1));
    const aggressiveBasket2 = await enrichBasketWithM8(composeBasketFromSlots(aggressiveSlots, 2));
    const rationalBasket1 = await enrichBasketWithM8(composeBasketFromSlots(rationalSlots, 1));
    const rationalBasket2 = await enrichBasketWithM8(composeBasketFromSlots(rationalSlots, 2));
    const conservativeBasket1 = await enrichBasketWithM8(composeBasketFromSlots(conservativeSlots, 1));
    const conservativeBasket2 = await enrichBasketWithM8(composeBasketFromSlots(conservativeSlots, 2));

    const achievementData = {
      aggressive: buildAchievementData("aggressive", [aggressiveBasket1, aggressiveBasket2], grouped, universe),
      rational: buildAchievementData("rational", [rationalBasket1, rationalBasket2], grouped, universe),
      conservative: buildAchievementData("conservative", [conservativeBasket1, conservativeBasket2], grouped, universe)
    };

    renderMeta(todayRaw, universe, pairContext);
    renderTodayStructure(structure);
    renderAchievementDashboard(achievementData);
    renderCategoryBreakdown(grouped);

    renderStyleSlots("aggressive-slots", aggressiveSlots);
    renderStyleSlots("rational-slots", rationalSlots);
    renderStyleSlots("conservative-slots", conservativeSlots);

    renderBasketRecommendation("aggressive-basket", aggressiveBasket1);
    renderBasketRecommendation("rational-basket", rationalBasket1);
    renderBasketRecommendation("conservative-basket", conservativeBasket1);

    window.__M7_BASKET_DEBUG__ = {
      poolRaw,
      todayRaw,
      pairContext,
      universe,
      grouped,
      structure,
      aggressiveSlots,
      rationalSlots,
      conservativeSlots,
      aggressiveBasket1,
      aggressiveBasket2,
      rationalBasket1,
      rationalBasket2,
      conservativeBasket1,
      conservativeBasket2,
      achievementData
    };

  } catch (err) {
    console.error(err);
    const el = document.getElementById("basket-error");
    if (el) el.textContent = `載入失敗：${err.message}`;
  }
}

document.addEventListener("DOMContentLoaded", initBasketEngine);
