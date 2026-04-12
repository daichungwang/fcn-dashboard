import { runM8Case } from "../core/m8_batch_engine.js";

// ==========================================
// M7 Basket Engine FINAL
// 1. 不自分類，吃 M7 pool + M7 today
// 2. 用 simulation_pool 當今日 universe
// 3. L4 直接呼叫 M8 runM8Case 跑 Pair Fair Yield
// 4. 預建議 Basket 再整組丟 M8，直接顯示 Basket Fair Yield
// ==========================================

const PATH_POOL = "./data/m7/m7_new_stock_pool.json";
const PATH_TODAY = "./data/m7/m7_new_stock_today.json";

// 固定 M8 測試條件
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
// Universe
// ------------------------------------------
function buildUniverse(poolMap, todayRaw) {
  const simulationPool = Array.isArray(todayRaw.simulation_pool)
    ? todayRaw.simulation_pool
    : [];

  const universe = simulationPool
    .map(item => {
      const symbol = String(item["股號"] || "").toUpperCase();
      const meta = poolMap.get(symbol);

      if (!meta) return null;

      return {
        symbol,
        name: safe(item["股名"], safe(meta["名稱"], meta.name || symbol)),

        category: safe(meta.category).toLowerCase(),
        sector: safe(meta.sector),
        subsector: safe(meta.subsector),
        allow_fcn: meta.allow_fcn !== false && meta["是否納入新股票池"] !== false,
        pool_result: safe(meta["新股票池結果"], safe(meta.result, "")),

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
        rejectType: item.reject_type || null,

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
    })
    .filter(Boolean)
     // ❌ 不刪股票
.map(x => ({
  ...x,
  isRejected: !!x.rejectType,
  isBlocked: x.allow_fcn === false
}));

  return uniqBy(universe, "symbol");
}

// ------------------------------------------
// 分組 / 排序
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
    speculative: []
  };

  universe.forEach(s => {
    const c = s.category;
    if (grouped[c]) grouped[c].push(s);
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
    speculative: "SPECULATIVE"
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
// L4: Pair Fair Yield map
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
    speculative: grouped.speculative.length
  };

  let comment = "今日結構均衡。";

  if (counts.core >= 4 && counts.growth >= 2) {
    comment = "今日 simulation pool 兼具核心與成長，理性型最容易成立，積極型也可驗證。";
  } else if (counts.core >= 4 && counts.defensive + counts.income >= 2) {
    comment = "今日結構偏核心穩健，理性型與保守型較有優勢。";
  } else if (counts.growth >= 3 && counts.core <= 2) {
    comment = "今日結構偏進攻，若做 FCN 必須嚴格控制防禦與 income 權重。";
  } else if (counts.speculative > 0) {
    comment = "今日 pool 中仍有 speculative 類，僅供觀察，不宜直接納入。";
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
// L3: Slot 候選
// ------------------------------------------
function buildStyleDefinitions() {
  return {
    aggressive: {
      style_name: "積極型",
      target_rate: "19% ~ 25%",
      description: "至少兩格收益來源，Pair Fair Yield 要明顯偏高。",
      slots: [
        { key: "slot1", title: "第 1 檔建議", must: false, category_hint: "core", score_rule: "high", desc: "高品質底座。" },
        { key: "slot2", title: "第 2 檔建議", must: false, category_hint: "core / growth", score_rule: "middle+", desc: "第二底座或大型成長。" },
        { key: "slot3", title: "第 3 檔建議", must: true, category_hint: "growth", score_rule: "high pair fair yield", desc: "第一收益來源。" },
        { key: "slot4", title: "第 4 檔建議", must: true, category_hint: "growth / ETF / income", score_rule: "high pair fair yield", desc: "第二收益來源。" },
        { key: "slot5", title: "第 5 檔建議", must: true, category_hint: "defensive / speculative / ETF", score_rule: "balance / boost", desc: "平衡或放大器。" }
      ]
    },
    rational: {
      style_name: "理性型",
      target_rate: "15% ~ 19%",
      description: "2 core + 1 growth + 1 defensive/income。",
      slots: [
        { key: "slot1", title: "第 1 檔建議", must: true, category_hint: "core", score_rule: "high", desc: "高品質核心。" },
        { key: "slot2", title: "第 2 檔建議", must: true, category_hint: "core", score_rule: "middle/high", desc: "第二層核心。" },
        { key: "slot3", title: "第 3 檔建議", must: true, category_hint: "growth", score_rule: "middle/high pair fair yield", desc: "收益來源。" },
        { key: "slot4", title: "第 4 檔建議", must: true, category_hint: "defensive / income", score_rule: "today usable", desc: "平衡風險。" },
        { key: "slot5", title: "第 5 檔建議", must: false, category_hint: "core / income", score_rule: "optional", desc: "視利率補位。" }
      ]
    },
    conservative: {
      style_name: "保守型",
      target_rate: "12% ~ 15%",
      description: "2~3 core + defensive/income，高 Pair Fair Yield 檔數受限。",
      slots: [
        { key: "slot1", title: "第 1 檔建議", must: true, category_hint: "core", score_rule: "high", desc: "第一核心。" },
        { key: "slot2", title: "第 2 檔建議", must: true, category_hint: "core", score_rule: "middle/high", desc: "第二核心。" },
        { key: "slot3", title: "第 3 檔建議", must: true, category_hint: "defensive / income / core", score_rule: "low proxy", desc: "低 proxy 為佳。" },
        { key: "slot4", title: "第 4 檔建議", must: false, category_hint: "income / core", score_rule: "optional", desc: "補位。" },
        { key: "slot5", title: "第 5 檔建議", must: false, category_hint: "core", score_rule: "optional", desc: "補品質。" }
      ]
    }
  };
}

function byPairYieldDesc(list) {
  return [...list].sort((a, b) => n(b.pairFairYield, -1) - n(a.pairFairYield, -1));
}

function buildSlotCandidates(styleKey, grouped, universe) {
  const styles = buildStyleDefinitions();
  const style = styles[styleKey];

  const core = grouped.core || [];
  const growth = grouped.growth || [];
  const defensive = grouped.defensive || [];
  const income = grouped.income || [];
  const speculative = grouped.speculative || [];

  const highYield = byPairYieldDesc(universe.filter(x => n(x.pairFairYield) >= 16));
  const midYield = byPairYieldDesc(universe.filter(x => n(x.pairFairYield) >= 14 && n(x.pairFairYield) < 16));
  const lowYield = byPairYieldDesc(universe.filter(x => n(x.pairFairYield) > 0 && n(x.pairFairYield) < 14));

  let slots = [];

  if (styleKey === "aggressive") {
    slots = [
      { ...style.slots[0], candidates: pickTop(core.filter(x => !x.isAnchor || x.category === "core"), 4) },
      { ...style.slots[1], candidates: mergeUnique(pickTop(core, 3), pickTop(growth, 4)).slice(0, 5) },
      { ...style.slots[2], candidates: mergeUnique(pickTop(byPairYieldDesc(growth), 5), pickTop(highYield, 5)).slice(0, 6) },
      { ...style.slots[3], candidates: mergeUnique(pickTop(highYield, 5), pickTop(midYield, 4)).slice(0, 6) },
      { ...style.slots[4], candidates: mergeUnique(pickTop(defensive, 3), pickTop(income, 3), pickTop(speculative, 2)).slice(0, 5) }
    ];
  }

  if (styleKey === "rational") {
    slots = [
      { ...style.slots[0], candidates: pickTop(core, 4) },
      { ...style.slots[1], candidates: pickTop(core.slice(1), 4) },
      { ...style.slots[2], candidates: mergeUnique(pickTop(byPairYieldDesc(growth), 4), pickTop(midYield, 4)).slice(0, 5) },
      { ...style.slots[3], candidates: mergeUnique(pickTop(defensive, 4), pickTop(income, 4)).slice(0, 5) },
      { ...style.slots[4], candidates: mergeUnique(pickTop(core, 3), pickTop(income, 3)).slice(0, 4) }
    ];
  }

  if (styleKey === "conservative") {
    slots = [
      { ...style.slots[0], candidates: pickTop(core, 4) },
      { ...style.slots[1], candidates: pickTop(core.slice(1), 4) },
      { ...style.slots[2], candidates: mergeUnique(pickTop(lowYield, 4), pickTop(defensive, 4), pickTop(income, 4), pickTop(core, 3)).slice(0, 6) },
      { ...style.slots[3], candidates: mergeUnique(pickTop(income, 3), pickTop(core, 3), pickTop(lowYield, 3)).slice(0, 4) },
      { ...style.slots[4], candidates: pickTop(core, 3) }
    ];
  }

  slots.forEach(slot => {
    slot.candidates = uniqBy(slot.candidates, "symbol");
  });

  return {
    ...style,
    slots
  };
}

// ------------------------------------------
// L4: Basket 建議
// ------------------------------------------
function buildBasketFromSlots(styleSpec) {
  const chosen = [];
  const used = new Set();

  styleSpec.slots.forEach(slot => {
    if (!slot.candidates?.length) return;
    const first = slot.candidates.find(x => !used.has(x.symbol));
    if (!first) return;

    if (slot.must || chosen.length < 5) {
      chosen.push({
        slot: slot.title,
        must: slot.must,
        stock: first
      });
      used.add(first.symbol);
    }
  });

  const stocks = chosen.map(x => x.stock);

  return {
    style_name: styleSpec.style_name,
    target_rate: styleSpec.target_rate,
    basket_count: stocks.length,
    symbols: stocks.map(x => x.symbol),
    avg_total: round2(avg(stocks, "total")),
    avg_pair_fair_yield: round2(avg(stocks.filter(x => x.pairFairYield), "pairFairYield")),
    avg_normalized_proxy: round2(avg(stocks.filter(x => x.normalizedProxy), "normalizedProxy")),
    picks: chosen
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
      ${structure.comment}<br>
      Anchor：${structure.anchorSymbol || "--"} ｜ Anchor Score：${round2(structure.anchorScore)} ｜ Proxy Base Yield：${round2(structure.proxyBaseYield)}
    </div>
  `;
}

function renderCategoryBreakdown(grouped) {
  const el = document.getElementById("category-breakdown");
  if (!el) return;

  const order = ["core", "growth", "defensive", "income", "speculative"];

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
  return `
    <div class="stock-line">
      <div class="stock-main">
        <strong>${s.symbol}</strong> ${s.name}
        <span class="pill">${s.exposureLevel}</span>
        <span class="pill muted-pill">${scoreBand(s.total)}</span>
        ${s.isAnchor ? `<span class="pill">ANCHOR</span>` : ""}
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
      <div class="style-sub">目標利率：${styleSpec.target_rate}</div>
      <div class="style-desc">${styleSpec.description}</div>
    </div>

    ${styleSpec.slots.map(slot => `
      <div class="slot-card">
        <div class="slot-top">
          <div class="slot-title">${slot.title}</div>
          <div class="slot-tag">${slot.must ? "must" : "optional"}</div>
        </div>
        <div class="slot-desc">
          類型：${slot.category_hint} ｜ 規則：${slot.score_rule}<br>
          ${slot.desc}
        </div>
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
          <div class="basket-sub">策略目標：${basket.target_rate}</div>
          <div class="basket-sub">
            Basket Fair Yield：${basket.m8_fair_yield != null ? basket.m8_fair_yield + "%" : "--"}
          </div>
          <div class="basket-sub">
            BasketVol：${basket.m8_basket_vol != null ? basket.m8_basket_vol : "--"}
            ｜ VolAdj：${basket.m8_vol_adj != null ? basket.m8_vol_adj : "--"}
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
        <div class="stats-line">
          Basket Fair Yield ${basket.m8_fair_yield != null ? basket.m8_fair_yield : "--"}
        </div>
        <div class="stats-line">
          BasketVol ${basket.m8_basket_vol != null ? basket.m8_basket_vol : "--"}
          ｜ VolAdj ${basket.m8_vol_adj != null ? basket.m8_vol_adj : "--"}
        </div>
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

    const aggressive = buildSlotCandidates("aggressive", grouped, universe);
    const rational = buildSlotCandidates("rational", grouped, universe);
    const conservative = buildSlotCandidates("conservative", grouped, universe);

    const aggressiveBasketRaw = buildBasketFromSlots(aggressive);
    const rationalBasketRaw = buildBasketFromSlots(rational);
    const conservativeBasketRaw = buildBasketFromSlots(conservative);

    const aggressiveBasket = await enrichBasketWithM8(aggressiveBasketRaw);
    const rationalBasket = await enrichBasketWithM8(rationalBasketRaw);
    const conservativeBasket = await enrichBasketWithM8(conservativeBasketRaw);

    renderMeta(todayRaw, universe, pairContext);
    renderTodayStructure(structure);
    renderCategoryBreakdown(grouped);

    renderStyleSlots("aggressive-slots", aggressive);
    renderStyleSlots("rational-slots", rational);
    renderStyleSlots("conservative-slots", conservative);

    renderBasketRecommendation("aggressive-basket", aggressiveBasket);
    renderBasketRecommendation("rational-basket", rationalBasket);
    renderBasketRecommendation("conservative-basket", conservativeBasket);

    window.__M7_BASKET_DEBUG__ = {
      poolRaw,
      todayRaw,
      pairContext,
      universe,
      grouped,
      structure,
      aggressive,
      rational,
      conservative,
      aggressiveBasket,
      rationalBasket,
      conservativeBasket
    };

  } catch (err) {
    console.error(err);
    const el = document.getElementById("basket-error");
    if (el) el.textContent = `載入失敗：${err.message}`;
  }
}

document.addEventListener("DOMContentLoaded", initBasketEngine);
