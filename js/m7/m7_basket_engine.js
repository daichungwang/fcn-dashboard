// ==========================================
// M7 Basket Engine FINAL
// 振宇版：不自分類，只吃兩份 M7 JSON
// 1) data/m7/m7_new_stock_pool.json
// 2) data/m7/m7_new_stock_today.json
//
// 核心原則：
// - pool 決定分類與 allow_fcn
// - today.simulation_pool 決定今日可用 universe
// - basket engine 只做：交集 / 排序 / slot 建議 / basket 建議
// ==========================================

const PATH_POOL = "./data/m7/m7_new_stock_pool.json";
const PATH_TODAY = "./data/m7/m7_new_stock_today.json";

// ------------------------------------------
// 基本工具
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

// ------------------------------------------
// 讀檔
// ------------------------------------------
async function loadJson(path) {
  const res = await fetch(path + "?v=" + Date.now());
  if (!res.ok) {
    throw new Error(`讀取失敗：${path}`);
  }
  return await res.json();
}

async function loadSources() {
  const [poolRaw, todayRaw] = await Promise.all([
    loadJson(PATH_POOL),
    loadJson(PATH_TODAY)
  ]);

  return {
    poolRaw,
    todayRaw
  };
}

// ------------------------------------------
// Pool Map
// 支援兩種格式：
// 1) { data: { NVDA: {...}, ... } }
// 2) [{ symbol: "NVDA", ...}, ...]
// ------------------------------------------
function buildPoolMap(poolRaw) {
  const map = new Map();

  if (poolRaw && typeof poolRaw === "object" && !Array.isArray(poolRaw) && poolRaw.data) {
    Object.values(poolRaw.data).forEach(row => {
      const symbol = safe(row.symbol).toUpperCase();
      if (!symbol) return;
      map.set(symbol, row);
    });
    return map;
  }

  if (Array.isArray(poolRaw)) {
    poolRaw.forEach(row => {
      const symbol = safe(row.symbol).toUpperCase();
      if (!symbol) return;
      map.set(symbol, row);
    });
  }

  return map;
}

// ------------------------------------------
// 交集：只取 simulation_pool
// 並以 m7_new_stock_pool.json 的 category / allow_fcn 為準
// ------------------------------------------
function buildUniverse(poolMap, todayRaw) {
  const simulationPool = Array.isArray(todayRaw.simulation_pool)
    ? todayRaw.simulation_pool
    : [];

  const universe = simulationPool
    .map(item => {
      const symbol = safe(item["股號"]).toUpperCase();
      const meta = poolMap.get(symbol);

      if (!meta) return null;

      return {
        symbol,
        name: safe(item["股名"], safe(meta["名稱"], meta.name || symbol)),

        // 以 pool 為準
        category: safe(meta.category).toLowerCase(),
        sector: safe(meta.sector),
        subsector: safe(meta.subsector),
        allow_fcn: meta.allow_fcn !== false && meta["是否納入新股票池"] !== false,
        pool_result: safe(meta["新股票池結果"], safe(meta.result, "")),

        // 以 today 為準
        total: n(item.today_score),
        valuation: n(item.valuation_score),
        trend: n(item.trend_score),
        structure: n(item.structure_score),
        timing: n(item.timing_score),
        money: n(item.money_score),

        trendRaw: n(item.trendRaw),
        snapshot: n(item.snapshot),
        growth: item.growth === null || item.growth === undefined ? null : n(item.growth),
        growthScore: item.growthScore === null || item.growthScore === undefined ? null : n(item.growthScore),

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

        rawToday: item,
        rawPool: meta
      };
    })
    .filter(Boolean)
    .filter(x => x.allow_fcn)
    .filter(x => !x.rejectType);

  return uniqBy(universe, "symbol");
}

// ------------------------------------------
// 分組與排序
// 規則：同類內 high exposure 先看，再看 total
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

// ------------------------------------------
// 類別顯示名稱
// ------------------------------------------
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

// ------------------------------------------
// slot 選股工具
// ------------------------------------------
function filterStocks(list, predicate) {
  return list.filter(predicate);
}

function pickByScoreBand(list, band) {
  return list.filter(x => scoreBand(x.total) === band);
}

function pickNotHighExposure(list) {
  return list.filter(x => x.exposureLevel !== "high");
}

function pickTop(list, count) {
  return list.slice(0, count);
}

function mergeUnique(...lists) {
  return uniqBy(lists.flat(), "symbol");
}

// ------------------------------------------
// 風格定義：slot-based
// 這裡只做「建議框架」
// ------------------------------------------
function buildStyleDefinitions() {
  return {
    aggressive: {
      style_name: "積極型",
      target_rate: "19% ~ 25%",
      fcn_condition: "55 / 65 / 6m / AKI / 3~5檔",
      description: "高分核心股做底座，必須加入成長波動來源，再配一檔防禦或 income 平衡 worst-of 失控風險。",
      slots: [
        {
          key: "slot1",
          title: "第 1 檔建議",
          must: false,
          category_hint: "core",
          score_rule: "high (score >= 84)",
          desc: "高分核心股，做 basket 品質底座。"
        },
        {
          key: "slot2",
          title: "第 2 檔建議",
          must: false,
          category_hint: "core / growth",
          score_rule: "middle (score >= 75)",
          desc: "第二層品質股，可用核心或大型成長。"
        },
        {
          key: "slot3",
          title: "第 3 檔建議",
          must: true,
          category_hint: "growth",
          score_rule: "low+ (score >= 70)",
          desc: "積極型的核心來源，沒有 growth 就沒有高利率。"
        },
        {
          key: "slot4",
          title: "第 4 檔建議",
          must: true,
          category_hint: "defensive / income",
          score_rule: "today usable",
          desc: "平衡籃子風險，降低 worst-of 失控。"
        },
        {
          key: "slot5",
          title: "第 5 檔建議",
          must: true,
          category_hint: "speculative / core low / growth low",
          score_rule: "today usable",
          desc: "最後一腳拉利率，但必須人工 review。"
        }
      ]
    },

    rational: {
      style_name: "理性型",
      target_rate: "15% ~ 19%",
      fcn_condition: "55 / 65 / 6m / AKI / 3~5檔",
      description: "以 core 為主體，搭配一檔 growth 與一檔 defensive/income，兼顧收益與可接性。",
      slots: [
        {
          key: "slot1",
          title: "第 1 檔建議",
          must: true,
          category_hint: "core",
          score_rule: "high (score >= 84)",
          desc: "高分核心股，做穩定底座。"
        },
        {
          key: "slot2",
          title: "第 2 檔建議",
          must: true,
          category_hint: "core",
          score_rule: "middle/high (score >= 75)",
          desc: "第二檔核心股，維持可接性。"
        },
        {
          key: "slot3",
          title: "第 3 檔建議",
          must: true,
          category_hint: "growth",
          score_rule: "low+ (score >= 70)",
          desc: "提升利率，但不能過度進攻。"
        },
        {
          key: "slot4",
          title: "第 4 檔建議",
          must: true,
          category_hint: "defensive / income",
          score_rule: "today usable",
          desc: "平衡風險。"
        },
        {
          key: "slot5",
          title: "第 5 檔建議",
          must: false,
          category_hint: "core / income",
          score_rule: "today usable",
          desc: "視利率目標與 basket 品質補位。"
        }
      ]
    },

    conservative: {
      style_name: "保守型",
      target_rate: "12% ~ 15%",
      fcn_condition: "55 / 65 / 6m / AKI / 3~5檔",
      description: "保守型重視接股安全，可接受 3 檔都來自前兩欄，也可 2 core + 1 defensive / income。",
      slots: [
        {
          key: "slot1",
          title: "第 1 檔建議",
          must: true,
          category_hint: "core",
          score_rule: "high (score >= 84)",
          desc: "第一層高品質核心。"
        },
        {
          key: "slot2",
          title: "第 2 檔建議",
          must: true,
          category_hint: "core",
          score_rule: "middle/high (score >= 75)",
          desc: "第二層核心。"
        },
        {
          key: "slot3",
          title: "第 3 檔建議",
          must: true,
          category_hint: "defensive / income / core",
          score_rule: "today usable",
          desc: "保守型第三檔可用 defensive / income，也可再補 core。"
        },
        {
          key: "slot4",
          title: "第 4 檔建議",
          must: false,
          category_hint: "income / core",
          score_rule: "today usable",
          desc: "依利率需求補位。"
        },
        {
          key: "slot5",
          title: "第 5 檔建議",
          must: false,
          category_hint: "core",
          score_rule: "today usable",
          desc: "保守型最後一檔優先補品質，不補波動。"
        }
      ]
    }
  };
}

// ------------------------------------------
// 依風格建立 slot 候選
// ------------------------------------------
function buildSlotCandidates(styleKey, grouped, universe) {
  const styles = buildStyleDefinitions();
  const style = styles[styleKey];

  const core = grouped.core || [];
  const growth = grouped.growth || [];
  const defensive = grouped.defensive || [];
  const income = grouped.income || [];
  const speculative = grouped.speculative || [];

  const safeCore = pickNotHighExposure(core);
  const safeGrowth = pickNotHighExposure(growth);
  const safeDef = pickNotHighExposure(defensive);
  const safeIncome = pickNotHighExposure(income);
  const safeSpec = pickNotHighExposure(speculative);

  const allSafe = pickNotHighExposure(universe);

  const slots = [];

  if (styleKey === "aggressive") {
    slots.push({
      ...style.slots[0],
      candidates: mergeUnique(
        pickTop(pickByScoreBand(safeCore, "high"), 6),
        pickTop(pickByScoreBand(safeCore, "middle"), 3)
      )
    });

    slots.push({
      ...style.slots[1],
      candidates: mergeUnique(
        pickTop(pickByScoreBand(safeCore, "middle"), 4),
        pickTop(pickByScoreBand(safeGrowth, "high"), 4),
        pickTop(pickByScoreBand(safeGrowth, "middle"), 4)
      )
    });

    slots.push({
      ...style.slots[2],
      candidates: mergeUnique(
        pickTop(filterStocks(safeGrowth, x => x.total >= 70), 8),
        pickTop(filterStocks(safeCore, x => x.total >= 70 && x.risk === "高"), 4)
      )
    });

    slots.push({
      ...style.slots[3],
      candidates: mergeUnique(
        pickTop(safeDef, 6),
        pickTop(safeIncome, 6)
      )
    });

    slots.push({
      ...style.slots[4],
      candidates: mergeUnique(
        pickTop(filterStocks(safeSpec, x => x.total >= 70), 4),
        pickTop(filterStocks(safeGrowth, x => x.total >= 70), 4),
        pickTop(filterStocks(safeCore, x => x.total >= 70 && scoreBand(x.total) === "low"), 4)
      )
    });
  }

  if (styleKey === "rational") {
    slots.push({
      ...style.slots[0],
      candidates: mergeUnique(
        pickTop(pickByScoreBand(safeCore, "high"), 6)
      )
    });

    slots.push({
      ...style.slots[1],
      candidates: mergeUnique(
        pickTop(filterStocks(safeCore, x => x.total >= 75), 8)
      )
    });

    slots.push({
      ...style.slots[2],
      candidates: mergeUnique(
        pickTop(filterStocks(safeGrowth, x => x.total >= 70), 8),
        pickTop(filterStocks(safeCore, x => x.total >= 70 && x.risk === "高"), 3)
      )
    });

    slots.push({
      ...style.slots[3],
      candidates: mergeUnique(
        pickTop(safeDef, 6),
        pickTop(safeIncome, 6)
      )
    });

    slots.push({
      ...style.slots[4],
      candidates: mergeUnique(
        pickTop(filterStocks(safeCore, x => x.total >= 70), 6),
        pickTop(safeIncome, 4)
      )
    });
  }

  if (styleKey === "conservative") {
    slots.push({
      ...style.slots[0],
      candidates: mergeUnique(
        pickTop(pickByScoreBand(safeCore, "high"), 6)
      )
    });

    slots.push({
      ...style.slots[1],
      candidates: mergeUnique(
        pickTop(filterStocks(safeCore, x => x.total >= 75), 8)
      )
    });

    slots.push({
      ...style.slots[2],
      candidates: mergeUnique(
        pickTop(safeDef, 8),
        pickTop(safeIncome, 8),
        pickTop(filterStocks(safeCore, x => x.total >= 70), 4)
      )
    });

    slots.push({
      ...style.slots[3],
      candidates: mergeUnique(
        pickTop(safeIncome, 6),
        pickTop(filterStocks(safeCore, x => x.total >= 70), 6)
      )
    });

    slots.push({
      ...style.slots[4],
      candidates: mergeUnique(
        pickTop(filterStocks(safeCore, x => x.total >= 70), 6)
      )
    });
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
// basket 建議：先從 slot 中各取第一名
// 不是最終下單，只是 M7 的預建議
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
    fcn_condition: styleSpec.fcn_condition,
    description: styleSpec.description,
    basket_count: stocks.length,
    symbols: stocks.map(x => x.symbol),
    avg_total: round2(avg(stocks, "total")),
    avg_valuation: round2(avg(stocks, "valuation")),
    avg_trend: round2(avg(stocks, "trend")),
    avg_structure: round2(avg(stocks, "structure")),
    avg_timing: round2(avg(stocks, "timing")),
    avg_money: round2(avg(stocks, "money")),
    picks: chosen
  };
}

// ------------------------------------------
// 今日結構
// ------------------------------------------
function buildTodayStructure(grouped, universe) {
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

  const reviewSorted = sortForReview(universe);

  return {
    total: universe.length,
    counts,
    comment,
    review_order: reviewSorted.map(x => ({
      symbol: x.symbol,
      name: x.name,
      category: x.category,
      exposure: x.exposureLevel,
      total: round2(x.total),
      ranking: x.ranking
    }))
  };
}

// ------------------------------------------
// render
// 需要 m7_basket.html 有下列區塊：
// #basket-meta
// #today-structure
// #category-breakdown
// #aggressive-slots
// #rational-slots
// #conservative-slots
// #aggressive-basket
// #rational-basket
// #conservative-basket
// #basket-error
// ------------------------------------------
function renderMeta(todayRaw, universe) {
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
        <div class="meta-title">今日 simulation pool</div>
        <div class="meta-value">${n(summary.simulation_count)} 檔</div>
      </div>
      <div class="meta-card">
        <div class="meta-title">Basket 可用 universe</div>
        <div class="meta-value">${universe.length} 檔</div>
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
    <div class="structure-comment">${structure.comment}</div>
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
      </div>
      <div class="stock-score">
        Total ${round2(s.total)} ｜ V ${round2(s.valuation)} ｜ T ${round2(s.trend)} ｜ S ${round2(s.structure)} ｜ Ti ${round2(s.timing)} ｜ M ${round2(s.money)}
      </div>
      <div class="stock-note">
        ${safe(s.exposureText)}
      </div>
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
      <div class="style-sub">${styleSpec.fcn_condition}</div>
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
      </div>
      <div class="candidate-meta">
        score ${round2(s.total)} ｜ ${scoreBand(s.total)} ｜ ranking ${n(s.ranking)}
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
          <div class="basket-sub">目標利率：${basket.target_rate}</div>
          <div class="basket-sub">${basket.fcn_condition}</div>
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
            </div>
            <div class="stock-score">
              來源：${p.slot} ｜ score ${round2(p.stock.total)} ｜ ${p.stock.exposureLevel}
            </div>
          </div>
        `).join("") : `<div class="empty-line">目前無法形成 basket</div>`}
      </div>

      <div class="basket-block">
        <div class="block-title">平均分數</div>
        <div class="stats-line">Total ${basket.avg_total}</div>
        <div class="stats-line">Valuation ${basket.avg_valuation} ｜ Trend ${basket.avg_trend} ｜ Structure ${basket.avg_structure} ｜ Timing ${basket.avg_timing} ｜ Money ${basket.avg_money}</div>
      </div>
    </div>
  `;
}

// ------------------------------------------
// init
// ------------------------------------------
async function initBasketEngine() {
  try {
    const { poolRaw, todayRaw } = await loadSources();

    const poolMap = buildPoolMap(poolRaw);
    const universe = buildUniverse(poolMap, todayRaw);
    const grouped = groupUniverse(universe);
    const structure = buildTodayStructure(grouped, universe);

    const aggressive = buildSlotCandidates("aggressive", grouped, universe);
    const rational = buildSlotCandidates("rational", grouped, universe);
    const conservative = buildSlotCandidates("conservative", grouped, universe);

    const aggressiveBasket = buildBasketFromSlots(aggressive);
    const rationalBasket = buildBasketFromSlots(rational);
    const conservativeBasket = buildBasketFromSlots(conservative);

    renderMeta(todayRaw, universe);
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
      poolMap,
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
