// =========================
// 振宇 FCN 系統｜main.js V7.2
// M3 完整引擎版 + FCN Basket Generator
// 不動 M2
// =========================

const appState = {
  newsMode: "pure",
  currentGroup: "all",
  currentScope: "all",
  newsExpanded: {
    international: false,
    finance: false,
    ai: false,
    fcn: false,
  },
  m3ModelExpanded: false,
  stocksRaw: [],
  stocksComputed: [],
  basketResults: [],
};

// ---------- M1 基礎資料 ----------
const marketRows = [
  { name: "VIX", value: 21, prev: 20, change: "+5.0%", note: "恐慌升溫" },
  { name: "S&P 500", value: 6606, prev: 6550, change: "+0.9%", note: "大盤偏多" },
  { name: "Nasdaq", value: 22090, prev: 21800, change: "+1.3%", note: "科技偏強" },
  { name: "Dow", value: 46021, prev: 45800, change: "+0.5%", note: "權值偏穩" },
  { name: "10Y", value: 4.26, prev: 4.20, change: "+1.4%", note: "殖利率升" },
  { name: "20Y", value: 4.84, prev: 4.78, change: "+1.3%", note: "殖利率升" },
];

const topHeadlines = [
  {
    title: "聯準會高利率延續",
    summary: "利率環境維持高檔，成長股估值與 FCN 利率條件同步受影響。",
  },
  {
    title: "AI 投資支出未見降溫",
    summary: "雲端與半導體資本支出維持高檔，AI 核心股延續主線地位。",
  },
  {
    title: "殖利率走高、波動未退",
    summary: "市場風險偏好受抑，FCN 組合應更重視 Worst-of 與結構穩定性。",
  },
];
 
const newsGroups = [
  {
    key: "international",
    title: "🌍 國際新聞",
    items: [
      {
        title: "聯準會維持高利率政策",
        summary: "市場預期降息時間延後，資金成本維持高檔。",
        impact: "SPY, QQQ",
        strength: "high",
        direction: "負向",
      },
      {
        title: "中東地緣風險升溫",
        summary: "能源與避險需求同步升溫，市場風險偏好下降。",
        impact: "Oil, Gold, SPY",
        strength: "medium",
        direction: "負向",
      },
      {
        title: "歐洲製造業仍疲弱",
        summary: "全球景氣復甦不均，週期股承壓。",
        impact: "CAT, BA, GM",
        strength: "medium",
        direction: "負向",
      },
    ],
  },
  {
    key: "finance",
    title: "💹 財經新聞",
    items: [
      {
        title: "美國 CPI 高於預期",
        summary: "通膨壓力未退，政策轉向時間點延後。",
        impact: "SPY, QQQ, TLT",
        strength: "high",
        direction: "負向",
      },
      {
        title: "10Y / 20Y 殖利率同步上升",
        summary: "資金成本墊高，估值股壓力增加。",
        impact: "QQQ, 高估值成長股",
        strength: "medium",
        direction: "負向",
      },
      {
        title: "美元偏強",
        summary: "全球風險資產表現分化，新興市場壓力升高。",
        impact: "全球股市 / 原物料",
        strength: "low",
        direction: "中性偏負",
      },
    ],
  },
  {
    key: "ai",
    title: "🤖 AI 新聞",
    items: [
      {
        title: "AI 應用加速落地",
        summary: "企業導入加快，雲端支出維持強勢。",
        impact: "MSFT, AMZN, NVDA",
        strength: "high",
        direction: "正向",
      },
      {
        title: "ASIC 需求持續升溫",
        summary: "客製化 AI 晶片需求擴大，網通與半導體受惠。",
        impact: "AVGO, TSM",
        strength: "medium",
        direction: "正向",
      },
      {
        title: "大型雲端資本支出維持高檔",
        summary: "AI 基礎設施投資尚未放緩。",
        impact: "MSFT, AMZN, NVDA, TSM",
        strength: "high",
        direction: "正向",
      },
    ],
  },
  {
    key: "fcn",
    title: "📦 FCN 新聞",
    items: [
      {
        title: "高利率環境延續",
        summary: "FCN 利率條件維持吸引力，但也反映風險補償要求較高。",
        impact: "FCN 新單",
        strength: "high",
        direction: "中性",
      },
      {
        title: "科技股波動仍高",
        summary: "提高利率同時，也提高 Worst-of 風險。",
        impact: "AI / 成長型 Basket",
        strength: "high",
        direction: "負向",
      },
      {
        title: "防守型標的穩定性提升",
        summary: "有利於做低波動、低風險補位。",
        impact: "UNH, PG, KO",
        strength: "medium",
        direction: "正向",
      },
    ],
  },
];

// ---------- M2 範例資料（保留原邏輯，不動） ----------
const positions = [
  { id: "FCN-1", worstOf: "AMZN", coupon: 18, tenor: 7, status: "追蹤" },
  { id: "FCN-2", worstOf: "AVGO", coupon: 22, tenor: 9, status: "健康" },
  { id: "FCN-3", worstOf: "NVDA", coupon: 25, tenor: 6, status: "健康" },
  { id: "FCN-4", worstOf: "MSFT", coupon: 21, tenor: 9, status: "健康" },
  { id: "FCN-5", worstOf: "GOOG", coupon: 19, tenor: 12, status: "追蹤" },
  { id: "FCN-6", worstOf: "TSM", coupon: 20, tenor: 6, status: "健康" },
  { id: "FCN-7", worstOf: "AAPL", coupon: 24, tenor: 9, status: "健康" },
  { id: "FCN-8", worstOf: "QQQ", coupon: 17, tenor: 6, status: "追蹤" },
  { id: "FCN-9", worstOf: "SPY", coupon: 23, tenor: 12, status: "健康" },
  { id: "FCN-10", worstOf: "META", coupon: 18, tenor: 9, status: "風險" },
];

// ---------- 樣式 ----------
function injectUtilityStyles() {
  if (document.getElementById("fcn-main-inline-style")) return;

  const style = document.createElement("style");
  style.id = "fcn-main-inline-style";
  style.textContent = `
    .summary-grid{
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:14px;
      margin-bottom:16px;
    }
    .summary-card,.stock-card,.position-card,.news-card,.model-card,.basket-card{
      background:#fff;
      border:1px solid #e5e7eb;
      border-radius:18px;
      box-shadow:0 2px 10px rgba(0,0,0,.05);
      padding:16px;
      margin-bottom:14px;
    }
    .summary-title{color:#6b7280;font-size:14px;margin-bottom:8px;}
    .summary-value{font-size:44px;font-weight:900;line-height:1;}
    .summary-value.up{color:#16a34a;}
    .summary-value.down{color:#dc2626;}
    .summary-value.warn{color:#ca8a04;}
    .stock-head,.position-id,.basket-head{font-size:24px;font-weight:900;margin-bottom:10px;}
    .stock-meta{color:#6b7280;font-size:13px;margin-bottom:10px;}
    .line,.stock-row{margin:7px 0;font-size:15px;line-height:1.5;}
    .detail,.stock-extra{
      display:none;
      margin-top:12px;
      padding:12px;
      border:1px solid #e5e7eb;
      border-radius:14px;
      background:#f9fafb;
    }
    .news-table{
      width:100%;
      border-collapse:collapse;
      border-radius:14px;
      overflow:hidden;
      font-size:14px;
      margin-top:12px;
    }
    .news-table th,.news-table td{
      border:1px solid #d1d5db;
      padding:12px 10px;
      text-align:left;
      background:#fff;
      vertical-align:top;
    }
    .news-table th{
      background:#6b6b6b;
      color:#fff;
      font-size:15px;
    }
    .tag-core{color:#2563eb;font-weight:800;}
    .tag-growth{color:#16a34a;font-weight:800;}
    .tag-defensive{color:#ca8a04;font-weight:800;}
    .tag-income{color:#8b5cf6;font-weight:800;}
    .tag-spec{color:#dc2626;font-weight:800;}
    .delta-positive{color:#16a34a;font-weight:800;}
    .delta-negative{color:#dc2626;font-weight:800;}
    .mini-note{color:#6b7280;font-size:14px;}
    .m3-section-title{font-size:18px;font-weight:900;margin:18px 0 10px;}
    .m3-outline{
      background:#f9fafb;
      border:1px solid #e5e7eb;
      border-radius:14px;
      padding:14px;
      margin-bottom:14px;
    }
    .error-box{
      background:#fff7ed;
      border:1px solid #fdba74;
      color:#9a3412;
      border-radius:14px;
      padding:14px;
      margin-bottom:14px;
    }
    .basket-tags{
      display:flex;
      gap:8px;
      flex-wrap:wrap;
      margin:10px 0;
    }
    .basket-tag{
      padding:6px 10px;
      border-radius:999px;
      font-size:12px;
      border:1px solid #d1d5db;
      background:#f9fafb;
    }
    @media (max-width:640px){
      .summary-grid{grid-template-columns:1fr;}
    }
  `;
  document.head.appendChild(style);
}

// ---------- 共用 ----------
function safe(v, d = 0) {
  return v === null || v === undefined || Number.isNaN(Number(v)) ? d : Number(v);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function labelClass(label) {
  if (label === "核心") return "tag-core";
  if (label === "成長") return "tag-growth";
  if (label === "防禦") return "tag-defensive";
  if (label === "收益") return "tag-income";
  return "tag-spec";
}

function deltaClass(v) {
  return v >= 0 ? "delta-positive" : "delta-negative";
}

function formatSigned(n) {
  const num = Number(n || 0);
  return `${num > 0 ? "+" : ""}${num.toFixed(2)}`;
}

function getModeText() {
  return appState.newsMode === "news"
    ? "新聞加權（含市場情緒）"
    : "純模型（不含新聞）";
}

// ---------- Baseline 映射 ----------
const BASELINE_SCORE_MAP = {
  core: 10,
  defensive: 7,
  growth: 8,
  financial: 4,
  cyclical: 4,
  high_beta: 1,
  turnaround: 1,
  ETF: 7,
  bond: 7,
};

const BASELINE_GROUP_MAP = {
  core: "核心",
  defensive: "防禦",
  growth: "成長",
  financial: "收益",
  cyclical: "收益",
  high_beta: "投機",
  turnaround: "投機",
  ETF: "防禦",
  bond: "防禦",
};

function getBaselineScore(raw) {
  if (raw.baseline_score != null && !Number.isNaN(Number(raw.baseline_score))) {
    return Number(raw.baseline_score);
  }
  return BASELINE_SCORE_MAP[raw.category] ?? 5;
}

function getBaselineGroup(raw) {
  if (raw.baseline_group) return raw.baseline_group;
  return BASELINE_GROUP_MAP[raw.category] ?? "投機";
}

// ---------- Vol 自動計算 ----------
function calcVolFromReturns(raw) {
  const vol1m = Math.abs(safe(raw.ret_1m));
  const vol6m = Math.abs(safe(raw.ret_6m));
  const vol12m = Math.abs(safe(raw.ret_12m));

  const volScore = Number((0.1 * vol1m + 0.3 * vol6m + 0.6 * vol12m).toFixed(4));

  return {
    vol_1m: Number(vol1m.toFixed(4)),
    vol_6m: Number(vol6m.toFixed(4)),
    vol_12m: Number(vol12m.toFixed(4)),
    vol_score: volScore,
  };
}

// ---------- 股票 Pure ----------
function getVolFactor(group) {
  if (group === "核心") return 0.85;
  if (group === "防禦") return 1.0;
  if (group === "成長") return 1.2;
  if (group === "收益") return 1.1;
  return 1.3;
}

function getReturnBucketScore(ret) {
  const r = safe(ret);

  if (r > 1.0) return -3;
  if (r > 0.5) return -2;
  if (r > 0.2) return -1;
  if (r >= -0.2) return 0;
  if (r >= -0.4) return 1;
  if (r >= -0.6) return 2;
  return 3;
}

function getAdjustmentModel(raw, baselineGroup) {
  const score1m = getReturnBucketScore(raw.ret_1m);
  const score6m = getReturnBucketScore(raw.ret_6m);
  const score12m = getReturnBucketScore(raw.ret_12m);

  const weightedScore = Number((score1m * 0.1 + score6m * 0.3 + score12m * 0.6).toFixed(2));
  const factor = getVolFactor(baselineGroup);
  const adjustment = Number((weightedScore * factor).toFixed(2));

  return {
    score1m,
    score6m,
    score12m,
    weightedScore,
    factor,
    adjustment,
  };
}

function calcStockPure(raw, baselineScore, baselineGroup) {
  const adjustmentModel = getAdjustmentModel(raw, baselineGroup);
  const pureScore = Number((baselineScore + adjustmentModel.adjustment).toFixed(2));

  return {
    pure_score: pureScore,
    adjustmentModel,
  };
}

// ---------- 股票 Event ----------
function getNewsWeight(daysAgo, importance = 1) {
  const d = safe(daysAgo);
  const imp = safe(importance, 1);

  let timeWeight = 0;
  if (d <= 1) timeWeight = 1.0;
  else if (d <= 3) timeWeight = 0.8;
  else if (d <= 7) timeWeight = 0.6;
  else if (d <= 14) timeWeight = 0.3;
  else timeWeight = 0;

  return timeWeight * imp;
}

function getStockEventFromNews(newsList = []) {
  if (!Array.isArray(newsList) || newsList.length === 0) return 0;

  let weightedSum = 0;
  let weightTotal = 0;

  newsList.forEach((n) => {
    const weight = getNewsWeight(n.daysAgo, n.importance || 1);
    weightedSum += safe(n.impact) * weight;
    weightTotal += weight;
  });

  if (weightTotal === 0) return 0;
  return Number((weightedSum / weightTotal).toFixed(2));
}

function getEventImpact(raw) {
  const stockEvent = getStockEventFromNews(raw.newsItems || []);
  const sectorEvent = safe(raw.sectorEvent);
  const riskPreferenceEvent = safe(raw.riskPreferenceEvent);
  const macroEvent = safe(raw.macroEvent);
  const eventBias = safe(raw.event_bias);

  const rawImpact = stockEvent + sectorEvent + riskPreferenceEvent + macroEvent + eventBias;
  return Number(clamp(rawImpact, -3, 3).toFixed(2));
}

function calcStockEvent(raw, pureScore) {
  const eventImpact = getEventImpact(raw);
  const eventWeight = 0.3;
  const eventScore = Number((pureScore + eventImpact * eventWeight).toFixed(2));

  return {
    eventImpact,
    eventWeight,
    event_score: eventScore,
  };
}

// ---------- FCN 參數 ----------
function getCouponScore(coupon) {
  const c = safe(coupon, null);
  if (c === null) return null;

  if (c < 10) return null;
  if (c >= 10 && c < 12) return -4;
  if (c >= 12 && c < 15) return -2;
  if (c >= 15 && c < 16) return 0;
  if (c >= 16 && c < 18) return 3;
  if (c >= 18 && c < 20) return 5;
  if (c >= 20 && c < 24) return 8;
  if (c >= 24) return 10;

  return null;
}

function getTenorScore(tenor) {
  const t = safe(tenor, null);
  if (t === null) return null;

  if (t > 12) return null;
  if (t >= 0 && t <= 3) return 5;
  if (t >= 4 && t < 6) return 2;
  if (t === 6) return 0;
  if (t >= 7 && t <= 9) return -2;
  if (t >= 10 && t <= 12) return -5;

  return 2;
}

function getPRiskScore(strike, ki) {
  if (strike == null || ki == null) return 0;

  const distance = safe(strike) - safe(ki);

  if (distance <= 0) return null;
  if (distance >= 30) return 3;
  if (distance >= 25) return 2;
  if (distance >= 22) return 1;
  if (distance >= 18) return 0;
  if (distance >= 15) return -1;
  if (distance >= 10) return -3;
  return -5;
}

function getWorstOfPenalty(group) {
  if (group === "核心") return 3;
  if (group === "防禦") return 2;
  if (group === "成長") return 2;
  if (group === "收益") return 1;
  return -2;
}

function getAssyPenalty(group) {
  if (group === "核心") return 2;
  if (group === "防禦") return 1;
  if (group === "成長") return 0;
  if (group === "收益") return 0;
  return -2;
}

function getSRIFromBasket(basket) {
  if (!Array.isArray(basket) || basket.length === 0) return 0;

  const worstAvg =
    basket.reduce((sum, s) => sum + getWorstOfPenalty(s.baseline_group), 0) / basket.length;

  const assyAvg =
    basket.reduce((sum, s) => sum + getAssyPenalty(s.baseline_group), 0) / basket.length;

  return Number((worstAvg * 0.6 + assyAvg * 0.4).toFixed(2));
}

function getEkiScore(hasEki) {
  return hasEki ? 2 : 0;
}

// ---------- FCN 公式 ----------
function calcFCNPure(input, stockPureScore, sri) {
  const couponScore = getCouponScore(input.coupon);
  const tenorScore = getTenorScore(input.tenor);
  const pRiskScore = getPRiskScore(input.strike, input.ki);
  const ekiScore = getEkiScore(Boolean(input.eki));

  if (couponScore == null || tenorScore == null || pRiskScore == null) {
    return {
      fcn_pure: null,
      coupon_score: couponScore,
      tenor_score: tenorScore,
      p_risk_score: pRiskScore,
      sri_score: sri,
      eki_score: ekiScore,
    };
  }

  const score =
    0.4 * safe(stockPureScore) +
    0.2 * couponScore +
    0.1 * tenorScore +
    0.1 * pRiskScore +
    0.1 * sri +
    ekiScore;

  return {
    fcn_pure: Number(score.toFixed(2)),
    coupon_score: couponScore,
    tenor_score: tenorScore,
    p_risk_score: pRiskScore,
    sri_score: sri,
    eki_score: ekiScore,
  };
}

function calcFCNEvent(input, stockPureScore, stockEventScore, stockVolScore) {
  const ekiScore = getEkiScore(Boolean(input.eki));

  const score =
    0.5 * safe(stockPureScore) +
    0.25 * safe(stockEventScore) +
    0.25 * safe(stockVolScore) +
    ekiScore;

  return {
    fcn_event: Number(score.toFixed(2)),
    eki_score: ekiScore,
  };
}

// ---------- 顯示用分組 ----------
function groupFromScore(score) {
  const targets = [
    { label: "核心", value: 10 },
    { label: "成長", value: 8 },
    { label: "防禦", value: 7 },
    { label: "收益", value: 4 },
    { label: "投機", value: 1 },
  ];

  let best = targets[0];
  let minDiff = Math.abs(score - best.value);

  targets.forEach((t) => {
    const diff = Math.abs(score - t.value);
    if (diff < minDiff) {
      minDiff = diff;
      best = t;
    }
  });

  return best.label;
}

// ---------- 主引擎 ----------
function buildComputedStocks(rawList) {
  const firstPass = rawList.map((raw) => {
    const baseline_group = getBaselineGroup(raw);
    const baseline_score = getBaselineScore(raw);
    const volData = calcVolFromReturns(raw);
    const pureData = calcStockPure(raw, baseline_score, baseline_group);
    const eventData = calcStockEvent(raw, pureData.pure_score);

    return {
      ...raw,
      baseline_group,
      baseline_score,
      ...volData,
      ...pureData,
      ...eventData,
      pure_label: groupFromScore(pureData.pure_score),
      event_label: groupFromScore(eventData.event_score),
      dPure: Number((pureData.pure_score - baseline_score).toFixed(2)),
      dEvent: Number((eventData.event_score - pureData.pure_score).toFixed(2)),
    };
  });

  const sri = getSRIFromBasket(firstPass);

  return firstPass.map((stock) => {
    const fcnPureData = calcFCNPure(stock, stock.pure_score, sri);
    const fcnEventData = calcFCNEvent(stock, stock.pure_score, stock.event_score, stock.vol_score);

    return {
      ...stock,
      ...fcnPureData,
      ...fcnEventData,
    };
  });
}

// ---------- Basket Generator ----------
function nChooseK(arr, k) {
  const results = [];
  const path = [];

  function backtrack(start) {
    if (path.length === k) {
      results.push([...path]);
      return;
    }
    for (let i = start; i < arr.length; i += 1) {
      path.push(arr[i]);
      backtrack(i + 1);
      path.pop();
    }
  }

  backtrack(0);
  return results;
}

function isValidBasket(basket) {
  if (!Array.isArray(basket) || basket.length < 4 || basket.length > 5) return false;

  const coreCount = basket.filter((s) => s.baseline_group === "核心").length;
  const incomeCount = basket.filter((s) => s.baseline_group === "收益").length;
  const specCount = basket.filter((s) => s.baseline_group === "投機").length;

  if (specCount > 0) return false;
  if (coreCount < 2) return false;
  if (incomeCount > 1) return false;

  return basket.every((s) => s.fcn_pure !== null);
}

function scoreBasket(basket, params = {}) {
  const input = {
    coupon: params.coupon ?? 18,
    tenor: params.tenor ?? 6,
    strike: params.strike ?? 65,
    ki: params.ki ?? 50,
    eki: params.eki ?? false,
  };

  const avgPure = basket.reduce((sum, s) => sum + s.pure_score, 0) / basket.length;
  const avgEvent = basket.reduce((sum, s) => sum + s.event_score, 0) / basket.length;
  const avgVol = basket.reduce((sum, s) => sum + s.vol_score, 0) / basket.length;
  const sri = getSRIFromBasket(basket);

  const purePack = calcFCNPure(input, avgPure, sri);
  const eventPack = calcFCNEvent(input, avgPure, avgEvent, avgVol);

  return {
    symbols: basket.map((s) => s.symbol),
    basket,
    size: basket.length,
    avgPure: Number(avgPure.toFixed(2)),
    avgEvent: Number(avgEvent.toFixed(2)),
    avgVol: Number(avgVol.toFixed(2)),
    sri: sri,
    coupon: input.coupon,
    tenor: input.tenor,
    strike: input.strike,
    ki: input.ki,
    eki: input.eki,
    coupon_score: purePack.coupon_score,
    tenor_score: purePack.tenor_score,
    p_risk_score: purePack.p_risk_score,
    fcn_pure: purePack.fcn_pure,
    fcn_event: eventPack.fcn_event,
  };
}

function generateBaskets(stocks) {
  const candidates = stocks.filter((s) => s.baseline_group !== "投機" && s.fcn_pure !== null);

  const combos4 = nChooseK(candidates, 4);
  const valid = combos4.filter(isValidBasket);

  const scored = valid.map((basket) =>
    scoreBasket(basket, {
      coupon: 18,
      tenor: 6,
      strike: 65,
      ki: 50,
      eki: false,
    })
  );

  scored.sort((a, b) => {
    if (b.fcn_pure !== a.fcn_pure) return b.fcn_pure - a.fcn_pure;
    return b.fcn_event - a.fcn_event;
  });

  return scored.slice(0, 8);
}

// ---------- 載入 pool.json ----------
async function loadPoolData() {
  try {
    const res = await fetch("./data/pool.json");
    if (!res.ok) throw new Error(`載入失敗：${res.status}`);

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("pool.json 不是陣列格式");

    appState.stocksRaw = data;
    appState.stocksComputed = buildComputedStocks(data);
    appState.basketResults = generateBaskets(appState.stocksComputed);

    renderDashboard();
    renderM3Summary();
    renderM3A();
    renderM3B();
  } catch (err) {
    console.error(err);
    const m3a = document.getElementById("m3a-content");
    if (m3a) {
      m3a.innerHTML = `<div class="error-box">載入 data/pool.json 失敗：${err.message}</div>`;
    }
    const m3b = document.getElementById("m3b-content");
    if (m3b) {
      m3b.innerHTML = `<div class="error-box">Basket 生成失敗：${err.message}</div>`;
    }
  }
}

// ---------- M1 ----------
function renderModule1() {
  const container = document.getElementById("module1-news");
  if (!container) return;

  container.innerHTML = `
    <div class="model-card">
      <h2 style="font-size:26px;margin:0 0 10px;">Module1 新聞雷達</h2>
      <div class="line" style="font-size:20px;font-weight:800;">決策模式</div>
      <div class="btn-row" style="margin-top:14px;">
        <button class="tab-btn ${appState.newsMode === "pure" ? "active" : ""}" onclick="setNewsMode('pure')">純模型</button>
        <button class="tab-btn ${appState.newsMode === "news" ? "active" : ""}" onclick="setNewsMode('news')">新聞加權</button>
      </div>
      <div class="line"><strong>模式：</strong>${getModeText()}</div>
      <div class="line">國際：${newsGroups[0].items.length} ｜ 財經：${newsGroups[1].items.length} ｜ AI：${newsGroups[2].items.length} ｜ FCN：${newsGroups[3].items.length}</div>
    </div>

    <div class="model-card">
      <h3>📊 市場指標</h3>
      <table class="news-table">
        <thead>
          <tr>
            <th>指標</th>
            <th>數值</th>
            <th>前值</th>
            <th>變動</th>
            <th>解讀</th>
          </tr>
        </thead>
        <tbody>
          ${marketRows.map((r) => `
            <tr>
              <td>${r.name}</td>
              <td>${r.value}</td>
              <td>${r.prev}</td>
              <td class="delta-negative">${r.change}</td>
              <td>${r.note}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>

    <div class="model-card">
      <h3>🔥 今日三則重點</h3>
      ${topHeadlines.map((item, idx) => `
        <div class="news-card">
          <div class="stock-head" style="font-size:18px;">${idx + 1}. ${item.title}</div>
          <div class="line">${item.summary}</div>
        </div>
      `).join("")}
    </div>

    ${newsGroups.map((group) => `
      <div class="model-card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
          <h3 style="margin:0;">${group.title}（${group.items.length}）</h3>
          <button class="btn" onclick="toggleNewsGroup('${group.key}')">點擊展開 / 收合</button>
        </div>
        <div id="news-group-${group.key}" style="margin-top:12px;display:${appState.newsExpanded[group.key] ? "block" : "none"};">
          ${group.items.map((item) => `
            <div class="news-card">
              <div class="stock-head" style="font-size:18px;">${item.title}</div>
              <div class="line">${item.summary}</div>
              <div class="line"><strong>影響：</strong>${item.impact}　<strong>強度：</strong>${item.strength}　<strong>方向：</strong><span class="${item.direction.includes("正") ? "delta-positive" : item.direction.includes("負") ? "delta-negative" : ""}">${item.direction}</span></div>
            </div>
          `).join("")}
        </div>
      </div>
    `).join("")}
  `;
}

// ---------- M2（保留原邏輯，不動） ----------
function renderModule2() {
  const container = document.getElementById("module2-health");
  if (!container) return;

  const total = positions.length;
  const healthy = positions.filter((p) => p.status === "健康").length;
  const watch = positions.filter((p) => p.status === "追蹤").length;
  const risk = positions.filter((p) => p.status === "風險").length;
  const urgent = positions.find((p) => p.status !== "健康") || positions[0];

  container.innerHTML = `
    <div class="model-card">
      <h2 style="font-size:26px;margin:0 0 10px;">持倉健康總覽</h2>

      <div class="btn-row">
        <button class="btn" onclick="expandAllM2Details()">全部展開</button>
        <button class="btn" onclick="collapseAllM2Details()">全部收合</button>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-title">全部</div>
          <div class="summary-value">${total}</div>
        </div>
        <div class="summary-card">
          <div class="summary-title">健康</div>
          <div class="summary-value up">${healthy}</div>
          <div class="mini-note">${Math.round((healthy / total) * 100)}%</div>
        </div>
        <div class="summary-card">
          <div class="summary-title">追蹤</div>
          <div class="summary-value warn">${watch}</div>
          <div class="mini-note">${Math.round((watch / total) * 100)}%</div>
        </div>
        <div class="summary-card">
          <div class="summary-title">風險 / 待確認</div>
          <div class="summary-value down">${risk} / 0</div>
        </div>
      </div>

      <div class="position-card">
        <div class="mini-note">最需處理</div>
        <div class="position-id">${urgent.id}</div>
        <div class="line"><strong>Worst-of：</strong> ${urgent.worstOf}</div>
        <div class="line"><strong>距離下限價：</strong> --</div>
        <div class="line"><strong>狀態：</strong> ${urgent.status}</div>
      </div>

      <h3 style="margin-top:22px;">持倉明細</h3>
      <div id="positionsContainer">
        ${positions.map((p) => `
          <div class="position-card m2-position-card">
            <div class="position-id">${p.id}</div>
            <div class="line"><strong>狀態：</strong> ${p.status}</div>
            <div class="line"><strong>Worst-of：</strong> ${p.worstOf}</div>
            <div class="line"><strong>距離下限價：</strong> --</div>
            <button class="btn m2-detail-btn" onclick="toggleM2Detail(this)">展開詳細</button>
            <div class="detail" data-detail style="display:none;">
              <div class="line"><strong>年化配息：</strong> ${p.coupon}%</div>
              <div class="line"><strong>天期：</strong> ${p.tenor} 個月</div>
              <div class="line"><strong>到期：</strong> 未提供</div>
              <div class="line"><strong>Worst-of：</strong> ${p.worstOf}</div>
              <div class="line"><strong>距離下限價：</strong> --</div>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

// ---------- M3 模型說明 ----------
function renderM3Model() {
  const el = document.getElementById("m3-model-content");
  if (!el) return;

  el.innerHTML = `
    <div class="model-card">
      <div class="btn-row">
        <button class="btn" onclick="toggleM3Model()">${appState.m3ModelExpanded ? "收合完整模型說明" : "展開完整模型說明"}</button>
      </div>

      <div id="m3-model-detail" style="display:${appState.m3ModelExpanded ? "block" : "none"};">
        <div class="m3-outline">
          <div class="line"><strong>四大基礎公式</strong></div>
          <div class="line">股票 Baseline Score = market definition from AI</div>
          <div class="line">股票 Pure Score = Baseline Score + Adjustment Model</div>
          <div class="line">股票 Event Score = 股票 Pure Score + Event Impact × Event Weight</div>
          <div class="line">FCN Pure Score = 0.4×股票 Pure Score + 0.2×利率 + 0.1×天期 + 0.1×P Risk + 0.1×SRI + (EKI = 2, no EKI = 0)</div>
          <div class="line">FCN Event Score = 0.5×股票 Pure Score + 0.25×Event + 0.25×股價波動度 + (EKI = 2, no EKI = 0)</div>
        </div>

        <div class="m3-section-title">Basket Generator</div>
        <div class="m3-outline">
          <div class="line">4 檔組合</div>
          <div class="line">至少 2 檔核心</div>
          <div class="line">不含投機</div>
          <div class="line">收益最多 1 檔</div>
          <div class="line">固定條件：coupon=18 / tenor=6 / strike=65 / ki=50 / eki=false</div>
        </div>
      </div>
    </div>
  `;
}

// ---------- Dashboard ----------
function renderDashboard() {
  const m1Stock = document.getElementById("m1-stock");
  const m1Fcn = document.getElementById("m1-fcn");
  const m2Risk = document.getElementById("m2-risk");
  const m2DPure = document.getElementById("m2-dpure");
  const m2DEvent = document.getElementById("m2-devent");
  const m3Score = document.getElementById("m3-score");
  const m4Score = document.getElementById("m4-score");

  const enriched = appState.stocksComputed;
  if (!enriched.length) return;

  const pureUps = enriched.filter((s) => s.dPure > 0).length;
  const eventUps = enriched.filter((s) => s.dEvent > 0).length;

  if (m1Stock) m1Stock.textContent = `股票建議率：${Math.round((enriched.filter((s) => s.baseline_group !== "投機").length / enriched.length) * 100)}%`;
  if (m1Fcn) m1Fcn.textContent = `FCN 建議率：${Math.round((enriched.filter((s) => s.fcn_pure !== null).length / enriched.length) * 100)}%`;
  if (m2Risk) m2Risk.textContent = `風險指數：${(10 - (pureUps / enriched.length) * 5).toFixed(1)}`;
  if (m2DPure) m2DPure.textContent = `ΔPure：${pureUps}`;
  if (m2DEvent) m2DEvent.textContent = appState.newsMode === "news" ? `ΔEvent：${eventUps}` : "ΔEvent：--";
  if (m3Score) {
    const avgBasketPure = appState.basketResults.length
      ? appState.basketResults.reduce((sum, b) => sum + safe(b.fcn_pure), 0) / appState.basketResults.length
      : 0;
    m3Score.textContent = `適合度：${avgBasketPure.toFixed(2)}`;
  }
  if (m4Score) m4Score.textContent = "System Score：8.2";
}

// ---------- M3-A ----------
function renderM3Summary() {
  const el = document.getElementById("m3a-summary");
  if (!el) return;

  const enriched = appState.stocksComputed;
  if (!enriched.length) {
    el.innerHTML = `<div class="model-card">尚未載入資料</div>`;
    return;
  }

  const total = enriched.length;
  const allow = enriched.filter((s) => s.fcn_pure != null).length;

  let upTitle = "Event 上修";
  let downTitle = "Event 下修";
  let upCount = enriched.filter((s) => s.dEvent > 0).length;
  let downCount = enriched.filter((s) => s.dEvent < 0).length;

  if (appState.newsMode === "pure") {
    upTitle = "Pure 上修";
    downTitle = "Pure 下修";
    upCount = enriched.filter((s) => s.dPure > 0).length;
    downCount = enriched.filter((s) => s.dPure < 0).length;
  }

  el.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-title">股票總數</div>
        <div class="summary-value">${total}</div>
      </div>
      <div class="summary-card">
        <div class="summary-title">可做 FCN</div>
        <div class="summary-value">${allow}</div>
      </div>
      <div class="summary-card">
        <div class="summary-title">${upTitle}</div>
        <div class="summary-value up">${upCount}</div>
      </div>
      <div class="summary-card">
        <div class="summary-title">${downTitle}</div>
        <div class="summary-value down">${downCount}</div>
      </div>
    </div>

    <div class="btn-row">
      <button class="btn" onclick="expandAllM3A()">全部展開</button>
      <button class="btn" onclick="collapseAllM3A()">全部收合</button>
    </div>

    <div class="group-tabs">
      <button class="tab-btn ${appState.currentGroup === "all" ? "active" : ""}" onclick="switchGroup('all')">全部</button>
      <button class="tab-btn ${appState.currentGroup === "核心" ? "active" : ""}" onclick="switchGroup('核心')">核心</button>
      <button class="tab-btn ${appState.currentGroup === "防禦" ? "active" : ""}" onclick="switchGroup('防禦')">防禦</button>
      <button class="tab-btn ${appState.currentGroup === "成長" ? "active" : ""}" onclick="switchGroup('成長')">成長</button>
      <button class="tab-btn ${appState.currentGroup === "收益" ? "active" : ""}" onclick="switchGroup('收益')">收益</button>
      <button class="tab-btn ${appState.currentGroup === "投機" ? "active" : ""}" onclick="switchGroup('投機')">投機</button>
    </div>

    <div class="group-tabs" style="margin-top:-4px;">
      <button class="tab-btn ${appState.currentScope === "all" ? "active" : ""}" onclick="switchScope('all')">全部</button>
      <button class="tab-btn ${appState.currentScope === "recommended" ? "active" : ""}" onclick="switchScope('recommended')">建議</button>
    </div>
  `;
}

function stockCard(stock) {
  const showEvent = appState.newsMode === "news";

  return `
    <div class="stock-card m3a-stock-card">
      <div class="stock-head">${stock.symbol} ｜ ${stock.name}</div>
      <div class="stock-meta">
        ${stock.sector || stock.ai_classification || "--"} ｜ <span class="${labelClass(stock.baseline_group)}">${stock.baseline_group}</span>
      </div>

      <div class="stock-row">Baseline：<span class="${labelClass(stock.baseline_group)}">${stock.baseline_group}</span>（${stock.baseline_score}）</div>
      <div class="stock-row">Pure：<span class="${labelClass(stock.pure_label)}">${stock.pure_label}</span>（${stock.pure_score}）</div>

      ${
        showEvent
          ? `
        <div class="stock-row">Event：<span class="${labelClass(stock.event_label)}">${stock.event_label}</span>（${stock.event_score}）</div>
        <div class="stock-row">ΔEvent：<span class="${deltaClass(stock.dEvent)}">${formatSigned(stock.dEvent)}</span></div>
        <div class="stock-row mini-note">Event Impact：${formatSigned(stock.eventImpact)}</div>
      `
          : `
        <div class="stock-row">ΔPure：<span class="${deltaClass(stock.dPure)}">${formatSigned(stock.dPure)}</span></div>
      `
      }

      <div class="stock-row mini-note">${stock.note || ""}</div>

      <div class="btn-row" style="margin-top:12px;">
        <button class="btn m3a-detail-btn" onclick="toggleStockExtra(this)">展開細節</button>
      </div>

      <div class="stock-extra">
        <div class="line"><strong>現價：</strong>${stock.price_now ?? stock.price ?? "--"}</div>
        <div class="line"><strong>Ret 1D / 1W：</strong>${safe(stock.ret_1d).toFixed(2)} / ${safe(stock.ret_1w).toFixed(2)}</div>
        <div class="line"><strong>Ret 1M / 6M / 12M：</strong>${safe(stock.ret_1m).toFixed(2)} / ${safe(stock.ret_6m).toFixed(2)} / ${safe(stock.ret_12m).toFixed(2)}</div>
        <div class="line"><strong>Vol 1M / 6M / 12M：</strong>${stock.vol_1m.toFixed(2)} / ${stock.vol_6m.toFixed(2)} / ${stock.vol_12m.toFixed(2)}</div>
        <div class="line"><strong>Vol Score：</strong>${stock.vol_score.toFixed(2)}</div>
        <div class="line"><strong>Coupon / Tenor：</strong>${stock.coupon ?? "--"} / ${stock.tenor ?? "--"}</div>
        <div class="line"><strong>Strike / KI：</strong>${stock.strike ?? "--"} / ${stock.ki ?? "--"}</div>
        <div class="line"><strong>FCN Pure / Event：</strong>${stock.fcn_pure ?? "不做"} / ${stock.fcn_event ?? "--"}</div>
      </div>
    </div>
  `;
}

function renderM3A() {
  const container = document.getElementById("m3a-content");
  if (!container) return;

  let filtered = [...appState.stocksComputed];

  if (appState.currentGroup !== "all") {
    filtered = filtered.filter((s) => s.baseline_group === appState.currentGroup);
  }

  if (appState.currentScope === "recommended") {
    filtered = filtered.filter((s) => s.fcn_pure != null);
  }

  container.innerHTML =
    filtered.map(stockCard).join("") || `<div class="model-card">目前沒有資料</div>`;
}

// ---------- M3-B ----------
function renderM3B() {
  const el = document.getElementById("m3b-content");
  if (!el) return;

  const rows = appState.basketResults;
  if (!rows.length) {
    el.innerHTML = `<div class="model-card">目前無可生成的 FCN Basket</div>`;
    return;
  }

  el.innerHTML = rows
    .map(
      (b, idx) => `
      <div class="basket-card">
        <div class="basket-head">Top ${idx + 1}｜${b.symbols.join(" / ")}</div>

        <div class="basket-tags">
          ${b.basket
            .map(
              (s) =>
                `<span class="basket-tag ${labelClass(s.baseline_group)}">${s.symbol}｜${s.baseline_group}</span>`
            )
            .join("")}
        </div>

        <div class="line"><strong>平均股票 Pure：</strong>${b.avgPure}</div>
        <div class="line"><strong>平均股票 Event：</strong>${b.avgEvent}</div>
        <div class="line"><strong>平均股價波動度：</strong>${b.avgVol}</div>
        <div class="line"><strong>SRI：</strong>${b.sri}</div>
        <div class="line"><strong>利率 / 天期：</strong>${b.coupon}% / ${b.tenor} 月</div>
        <div class="line"><strong>Strike / KI：</strong>${b.strike} / ${b.ki}</div>
        <div class="line"><strong>P Risk：</strong>${b.p_risk_score}</div>
        <div class="line"><strong>FCN Pure：</strong>${b.fcn_pure}</div>
        <div class="line"><strong>FCN Event：</strong>${b.fcn_event}</div>
      </div>
    `
    )
    .join("");
}

// ---------- M3-C ----------
function renderM3C() {
  const el = document.getElementById("m3c-content");
  if (!el) return;

  el.innerHTML = `
    <div class="model-card">
      <div class="line"><strong>外部 FCN 單筆評估</strong></div>
      <div class="line">此區後續可匯入外部單筆條件，套用今日定稿的公式評估。</div>
    </div>
  `;
}

// ---------- 股票查詢 ----------
function renderStockSearchResult(query = "") {
  const el = document.getElementById("stock-result");
  if (!el) return;

  const q = query.trim().toUpperCase();
  if (!q) {
    el.innerHTML = "";
    return;
  }

  const hit = appState.stocksComputed.find(
    (s) => s.symbol.toUpperCase() === q || s.name.toUpperCase().includes(q)
  );

  if (!hit) {
    el.innerHTML = `<div class="model-card">查無資料</div>`;
    return;
  }

  el.innerHTML = stockCard(hit);
}

// ---------- 全域互動 ----------
window.setNewsMode = function (mode) {
  appState.newsMode = mode;
  renderModule1();
  renderDashboard();
  renderM3Summary();
  renderM3A();
};

window.toggleNewsGroup = function (key) {
  appState.newsExpanded[key] = !appState.newsExpanded[key];
  renderModule1();
};

window.togglePool = function () {
  const el = document.getElementById("pool-section");
  if (!el) return;
  el.style.display = el.style.display === "none" ? "block" : "none";
};

window.toggleM3Model = function () {
  appState.m3ModelExpanded = !appState.m3ModelExpanded;
  renderM3Model();
};

window.toggleM2Detail = function (btn) {
  const card = btn.closest(".m2-position-card");
  if (!card) return;
  const detail = card.querySelector("[data-detail]");
  if (!detail) return;
  const hidden = detail.style.display === "none" || detail.style.display === "";
  detail.style.display = hidden ? "block" : "none";
  btn.textContent = hidden ? "收合詳細" : "展開詳細";
};

window.expandAllM2Details = function () {
  document.querySelectorAll(".m2-position-card").forEach((card) => {
    const detail = card.querySelector("[data-detail]");
    const btn = card.querySelector(".m2-detail-btn");
    if (detail) detail.style.display = "block";
    if (btn) btn.textContent = "收合詳細";
  });
};

window.collapseAllM2Details = function () {
  document.querySelectorAll(".m2-position-card").forEach((card) => {
    const detail = card.querySelector("[data-detail]");
    const btn = card.querySelector(".m2-detail-btn");
    if (detail) detail.style.display = "none";
    if (btn) btn.textContent = "展開詳細";
  });
};

window.switchGroup = function (group) {
  appState.currentGroup = group;
  renderM3Summary();
  renderM3A();
};

window.switchScope = function (scope) {
  appState.currentScope = scope;
  renderM3Summary();
  renderM3A();
};

window.toggleStockExtra = function (btn) {
  const card = btn.closest(".m3a-stock-card");
  if (!card) return;
  const extra = card.querySelector(".stock-extra");
  if (!extra) return;
  const hidden = extra.style.display === "none" || extra.style.display === "";
  extra.style.display = hidden ? "block" : "none";
  btn.textContent = hidden ? "收合細節" : "展開細節";
};

window.expandAllM3A = function () {
  document.querySelectorAll(".m3a-stock-card").forEach((card) => {
    const extra = card.querySelector(".stock-extra");
    const btn = card.querySelector(".m3a-detail-btn");
    if (extra) extra.style.display = "block";
    if (btn) btn.textContent = "收合細節";
  });
};

window.collapseAllM3A = function () {
  document.querySelectorAll(".m3a-stock-card").forEach((card) => {
    const extra = card.querySelector(".stock-extra");
    const btn = card.querySelector(".m3a-detail-btn");
    if (extra) extra.style.display = "none";
    if (btn) btn.textContent = "展開細節";
  });
};

// ---------- 啟動 ----------
function initStockSearch() {
  const input = document.getElementById("stock-search");
  if (!input) return;

  input.addEventListener("input", (e) => {
    renderStockSearchResult(e.target.value || "");
  });
}

async function init() {
  injectUtilityStyles();
  renderModule1();
  renderModule2();
  renderM3Model();
  renderM3C();
  initStockSearch();
  await loadPoolData();
}

document.addEventListener("DOMContentLoaded", init);

