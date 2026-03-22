// =========================
// 振宇 FCN 系統｜main.js
// 最終完整版
// =========================

const appState = {
  newsMode: "pure", // pure / news
  currentGroup: "all",
  currentScope: "all",
  newsExpanded: {
    international: false,
    finance: false,
    ai: false,
    fcn: false,
  },
  m3ModelExpanded: false,
};

// ---------- M1 資料 ----------
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

// ---------- M2 資料 ----------
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

// ---------- M3-A 資料 ----------
const stocks = [
  {
    symbol: "TSM",
    name: "Taiwan Semiconductor Manufacturing",
    basket: "core",
    allow: true,
    baselineLabel: "核心",
    baselineScore: 10,
    pureLabel: "核心",
    pureScore: 10,
    eventLabel: "核心",
    eventScore: 9.6,
    note: "AI半導體核心資產，適合FCN主骨架",
    price: "$338.79",
    pe25: "--",
    pe26: "--",
    eps26: "--",
    news: "TSM產能滿載",
  },
  {
    symbol: "NVDA",
    name: "NVIDIA",
    basket: "core",
    allow: true,
    baselineLabel: "核心",
    baselineScore: 10,
    pureLabel: "核心",
    pureScore: 9.2,
    eventLabel: "平衡",
    eventScore: 8.7,
    note: "AI主軸龍頭，但事件與波動需持續監控",
    price: "$178.56",
    pe25: "--",
    pe26: "--",
    eps26: "--",
    news: "AI需求強勁",
  },
  {
    symbol: "AVGO",
    name: "Broadcom",
    basket: "core",
    allow: true,
    baselineLabel: "核心",
    baselineScore: 10,
    pureLabel: "核心",
    pureScore: 9.4,
    eventLabel: "核心",
    eventScore: 9.0,
    note: "AI與網通結合，適合核心配置",
    price: "$--",
    pe25: "--",
    pe26: "--",
    eps26: "--",
    news: "ASIC需求升高",
  },
  {
    symbol: "MSFT",
    name: "Microsoft",
    basket: "core",
    allow: true,
    baselineLabel: "核心",
    baselineScore: 10,
    pureLabel: "核心",
    pureScore: 9.6,
    eventLabel: "核心",
    eventScore: 9.8,
    note: "雲端與AI應用核心龍頭",
    price: "$389.02",
    pe25: "--",
    pe26: "--",
    eps26: "--",
    news: "AI應用加速落地",
  },
  {
    symbol: "AAPL",
    name: "Apple",
    basket: "core",
    allow: true,
    baselineLabel: "核心",
    baselineScore: 10,
    pureLabel: "核心",
    pureScore: 9.5,
    eventLabel: "核心",
    eventScore: 9.2,
    note: "消費平台核心資產，流動性佳",
    price: "$--",
    pe25: "--",
    pe26: "--",
    eps26: "--",
    news: "蘋果生態穩定",
  },
  {
    symbol: "GOOG",
    name: "Alphabet",
    basket: "core",
    allow: true,
    baselineLabel: "核心",
    baselineScore: 10,
    pureLabel: "核心",
    pureScore: 9.4,
    eventLabel: "核心",
    eventScore: 9.5,
    note: "平台與雲端核心標的",
    price: "$--",
    pe25: "--",
    pe26: "--",
    eps26: "--",
    news: "雲端與AI整合",
  },
  {
    symbol: "AMZN",
    name: "Amazon",
    basket: "growth",
    allow: true,
    baselineLabel: "平衡",
    baselineScore: 8,
    pureLabel: "平衡",
    pureScore: 8.0,
    eventLabel: "核心",
    eventScore: 8.6,
    note: "雲端強，但消費與估值使其較適合作為補位",
    price: "$--",
    pe25: "--",
    pe26: "--",
    eps26: "--",
    news: "零售與AWS雙強",
  },
  {
    symbol: "META",
    name: "Meta Platforms",
    basket: "growth",
    allow: true,
    baselineLabel: "平衡",
    baselineScore: 8,
    pureLabel: "平衡",
    pureScore: 8.4,
    eventLabel: "核心",
    eventScore: 8.9,
    note: "平台型成長股，適合與核心搭配",
    price: "$--",
    pe25: "--",
    pe26: "--",
    eps26: "--",
    news: "廣告業務回升",
  },
  {
    symbol: "CRM",
    name: "Salesforce",
    basket: "growth",
    allow: true,
    baselineLabel: "平衡",
    baselineScore: 8,
    pureLabel: "平衡",
    pureScore: 7.8,
    eventLabel: "平衡",
    eventScore: 8.0,
    note: "企業雲端成長股",
    price: "$--",
    pe25: "--",
    pe26: "--",
    eps26: "--",
    news: "企業需求穩定",
  },
  {
    symbol: "NOW",
    name: "ServiceNow",
    basket: "growth",
    allow: true,
    baselineLabel: "平衡",
    baselineScore: 8,
    pureLabel: "平衡",
    pureScore: 7.9,
    eventLabel: "平衡",
    eventScore: 8.1,
    note: "企業數位化成長股",
    price: "$--",
    pe25: "--",
    pe26: "--",
    eps26: "--",
    news: "數位轉型需求強",
  },
  {
    symbol: "UNH",
    name: "UnitedHealth",
    basket: "defensive",
    allow: true,
    baselineLabel: "防守",
    baselineScore: 7,
    pureLabel: "防守",
    pureScore: 7.3,
    eventLabel: "防守",
    eventScore: 7.2,
    note: "醫療防守核心，適合作為波動緩衝",
    price: "$--",
    pe25: "--",
    pe26: "--",
    eps26: "--",
    news: "醫療需求穩定",
  },
  {
    symbol: "PG",
    name: "Procter & Gamble",
    basket: "defensive",
    allow: true,
    baselineLabel: "防守",
    baselineScore: 7,
    pureLabel: "防守",
    pureScore: 7.2,
    eventLabel: "防守",
    eventScore: 7.4,
    note: "消費防守型資產",
    price: "$--",
    pe25: "--",
    pe26: "--",
    eps26: "--",
    news: "消費穩定",
  },
  {
    symbol: "KO",
    name: "Coca-Cola",
    basket: "defensive",
    allow: true,
    baselineLabel: "防守",
    baselineScore: 7,
    pureLabel: "防守",
    pureScore: 7.1,
    eventLabel: "防守",
    eventScore: 7.2,
    note: "穩定現金流，適合防禦補位",
    price: "$--",
    pe25: "--",
    pe26: "--",
    eps26: "--",
    news: "現金流穩健",
  },
  {
    symbol: "CAT",
    name: "Caterpillar",
    basket: "cyclical",
    allow: true,
    baselineLabel: "平衡",
    baselineScore: 8,
    pureLabel: "平衡",
    pureScore: 7.4,
    eventLabel: "平衡",
    eventScore: 7.1,
    note: "景氣循環股，需看總經與工業景氣",
    price: "$--",
    pe25: "--",
    pe26: "--",
    eps26: "--",
    news: "工業需求變動",
  },
  {
    symbol: "BA",
    name: "Boeing",
    basket: "cyclical",
    allow: false,
    baselineLabel: "避免",
    baselineScore: 1,
    pureLabel: "避免",
    pureScore: 2.0,
    eventLabel: "避免",
    eventScore: 1.4,
    note: "事件風險高，不建議做FCN",
    price: "$--",
    pe25: "--",
    pe26: "--",
    eps26: "--",
    news: "監管壓力高",
  },
  {
    symbol: "GM",
    name: "General Motors",
    basket: "cyclical",
    allow: true,
    baselineLabel: "收益",
    baselineScore: 4,
    pureLabel: "收益",
    pureScore: 4.6,
    eventLabel: "收益",
    eventScore: 4.4,
    note: "汽車循環股，偏收益型",
    price: "$--",
    pe25: "--",
    pe26: "--",
    eps26: "--",
    news: "汽車景氣循環",
  },
  {
    symbol: "PLTR",
    name: "Palantir",
    basket: "speculative",
    allow: false,
    baselineLabel: "避免",
    baselineScore: 1,
    pureLabel: "收益",
    pureScore: 3.8,
    eventLabel: "平衡",
    eventScore: 7.2,
    note: "高波動高題材，投機屬性強",
    price: "$--",
    pe25: "--",
    pe26: "--",
    eps26: "--",
    news: "國防AI題材強",
  },
  {
    symbol: "COIN",
    name: "Coinbase",
    basket: "speculative",
    allow: false,
    baselineLabel: "避免",
    baselineScore: 1,
    pureLabel: "收益",
    pureScore: 3.0,
    eventLabel: "收益",
    eventScore: 3.5,
    note: "高度受加密市場影響",
    price: "$--",
    pe25: "--",
    pe26: "--",
    eps26: "--",
    news: "加密資產波動大",
  },
  {
    symbol: "SOFI",
    name: "SoFi",
    basket: "speculative",
    allow: false,
    baselineLabel: "避免",
    baselineScore: 1,
    pureLabel: "收益",
    pureScore: 3.5,
    eventLabel: "收益",
    eventScore: 3.3,
    note: "金融科技題材股，波動偏高",
    price: "$--",
    pe25: "--",
    pe26: "--",
    eps26: "--",
    news: "金融科技題材反覆",
  },
  {
    symbol: "SPY",
    name: "SPDR S&P 500 ETF",
    basket: "core",
    allow: true,
    baselineLabel: "核心",
    baselineScore: 10,
    pureLabel: "核心",
    pureScore: 9.8,
    eventLabel: "核心",
    eventScore: 9.9,
    note: "最穩的大盤ETF核心資產",
    price: "$--",
    pe25: "--",
    pe26: "--",
    eps26: "--",
    news: "大盤代表性",
  },
  {
    symbol: "QQQ",
    name: "Invesco QQQ Trust",
    basket: "core",
    allow: true,
    baselineLabel: "核心",
    baselineScore: 10,
    pureLabel: "核心",
    pureScore: 9.1,
    eventLabel: "核心",
    eventScore: 9.0,
    note: "科技ETF核心資產",
    price: "$--",
    pe25: "--",
    pe26: "--",
    eps26: "--",
    news: "科技ETF代表性",
  },
];

// ---------- 樣式補強 ----------
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
    .summary-card,.stock-card,.position-card,.news-card,.model-card{
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
    .stock-head,.position-id{font-size:24px;font-weight:900;margin-bottom:10px;}
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
    .tag-balance{color:#16a34a;font-weight:800;}
    .tag-defensive{color:#ca8a04;font-weight:800;}
    .tag-avoid{color:#dc2626;font-weight:800;}
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
    .dashboard-grid{
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:14px;
    }
    @media (max-width:640px){
      .summary-grid,.dashboard-grid{grid-template-columns:1fr;}
    }
  `;
  document.head.appendChild(style);
}

// ---------- 共用 ----------
function labelClass(label) {
  if (label === "核心") return "tag-core";
  if (label === "平衡") return "tag-balance";
  if (label === "防守") return "tag-defensive";
  return "tag-avoid";
}

function deltaClass(v) {
  return v >= 0 ? "delta-positive" : "delta-negative";
}

function formatSigned(n) {
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
}

function withDerivedScores(stock) {
  return {
    ...stock,
    dPure: stock.pureScore - stock.baselineScore,
    dEvent: stock.eventScore - stock.pureScore,
  };
}

function getModeText() {
  return appState.newsMode === "news"
    ? "新聞加權（含市場情緒）"
    : "純模型（不含新聞）";
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

// ---------- M2 ----------
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
          <div class="line"><strong>0｜一句話總覽</strong></div>
          <div class="line">先看機會，再看風險；先看錯價，再等時機；先選標的，再組 FCN。</div>
        </div>

        <div class="m3-section-title">7｜FCN 實例計算（驗證層）</div>
        <div class="m3-outline">
          <div class="line"><strong>範例一｜優質組合（建議承作）</strong></div>
          <div class="line">TSM（10） + MSFT（10） + UNH（7） + AMZN（8）</div>
          <div class="line">平均標的分數 = (10 + 10 + 7 + 8) / 4 = 8.75</div>
          <div class="line">8.75 + 分散3 + 利率8 + 天期0 - 最差1 - 波動0 - 下檔1 = <strong>17.75</strong></div>
          <div class="line">結論：建議承作</div>
        </div>

        <div class="m3-outline">
          <div class="line"><strong>範例二｜中性組合（觀察）</strong></div>
          <div class="line">NVDA（10） + META（8） + CRM（8） + CAT（8）</div>
          <div class="line">平均標的分數 = (10 + 8 + 8 + 8) / 4 = 8.5</div>
          <div class="line">8.5 + 分散1 + 利率3 - 天期2 - 最差1 - 波動3 - 下檔2 = <strong>4.5</strong></div>
          <div class="line">結論：觀察</div>
        </div>

        <div class="m3-outline">
          <div class="line"><strong>範例三｜結構失衡（不做）</strong></div>
          <div class="line">TSM（10） + MSFT（10） + AMZN（8） + GM（4） + COIN（1）</div>
          <div class="line">平均標的分數 = (10 + 10 + 8 + 4 + 1) / 5 = 6.6</div>
          <div class="line">6.6 + 分散1 + 利率8 - 天期2 - 最差6 - 次差3 - 波動3 - 下檔3 = <strong>-1.4</strong></div>
          <div class="line">結論：不做</div>
          <div class="line"><strong>核心教訓：</strong>FCN 的風險不是看最好，而是看最差。</div>
        </div>

        <div class="m3-section-title">8｜Decision Dashboard</div>
        <div class="m3-outline">
          <div class="line">M1 看機會，M2 看風險，M3 做決策，M4 判斷模型能不能信。</div>
          <div class="line">Decision Dashboard = 策略層，不是選股層。</div>
        </div>

        <div class="m3-section-title">1｜核心名詞</div>
        <div class="m3-outline">
          <div class="line"><strong>Baseline</strong> = 理性市場共識（看長期定位）</div>
          <div class="line"><strong>Pure</strong> = 不含新聞事件的模型判斷（看策略觀點）</div>
          <div class="line"><strong>Event</strong> = 加入市場事件後的結果（看短期情緒偏移）</div>
          <div class="line">Baseline → Pure → Event = 長期 → 模型 → 情緒</div>
        </div>

        <div class="m3-section-title">2｜統計解釋</div>
        <div class="m3-outline">
          <div class="line"><strong>ΔPure 看價值偏差，ΔEvent 看情緒偏差</strong></div>
          <div class="line">ΔPure = Pure - Baseline</div>
          <div class="line">ΔEvent = Event - Pure</div>
          <div class="line">先看 ΔPure（值不值得），再看 ΔEvent（現在適不適合）。</div>
          <div class="line">ΔPure = 錯價；ΔEvent = 時機。</div>
        </div>

        <div class="m3-section-title">3｜五大分類</div>
        <div class="m3-outline">
          <div class="line">核心 = 10 ｜ 平衡 = 8 ｜ 防守 = 7 ｜ 收益 = 4 ｜ 避免 = 1</div>
          <div class="line">分類 = 在 FCN 裡的功能角色，不是產業分類。</div>
          <div class="line">健康的 FCN Basket：至少 2 檔核心，1 檔平衡 / 防守，收益 ≤ 1，避免 = 0。</div>
        </div>

        <div class="m3-section-title">6｜FCN 模型公式</div>
        <div class="m3-outline">
          <div class="line">FCN Pure Score = 平均標的分數 + 分散分數 + 利率分數 + 天期分數 - 最差標的懲罰 - 波動懲罰 - 下檔風險懲罰</div>
          <div class="line">利率不是獎勵，是風險的價格。</div>
        </div>

        <div class="m3-section-title">5｜股票模型公式</div>
        <div class="m3-outline">
          <div class="line">股票 Pure Score = 標的分類基礎分數 + 波動調整 + 下檔風險調整 + 類別調整 + FCN 適配調整</div>
          <div class="line">股票 Event Score = Pure Score + 事件影響</div>
          <div class="line">股票模型看風險與結構，不是直接預測價格。</div>
        </div>

        <div class="m3-section-title">4｜基本參數</div>
        <div class="m3-outline">
          <div class="line">利率 / 波動 / 下檔 / 分散 / Worst-of / 事件權重</div>
          <div class="line">先定參數，再看結果；不要先看結果，再回頭扭參數。</div>
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

  if (m1Stock) m1Stock.textContent = "股票建議率：37%";
  if (m1Fcn) m1Fcn.textContent = "FCN 建議率：27%";
  if (m2Risk) m2Risk.textContent = "風險指數：7.1";
  if (m2DPure) m2DPure.textContent = "ΔPure：-0.3";
  if (m2DEvent) m2DEvent.textContent = appState.newsMode === "news" ? "ΔEvent：-1.2" : "ΔEvent：--";
  if (m3Score) m3Score.textContent = "適合度：6.8";
  if (m4Score) m4Score.textContent = "System Score：8.2";
}

// ---------- M3-A ----------
function renderM3Summary() {
  const el = document.getElementById("m3a-summary");
  if (!el) return;

  const enriched = stocks.map(withDerivedScores);
  const total = enriched.length;
  const allow = enriched.filter((s) => s.allow).length;

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
      <button class="tab-btn ${appState.currentGroup === "core" ? "active" : ""}" onclick="switchGroup('core')">核心</button>
      <button class="tab-btn ${appState.currentGroup === "growth" ? "active" : ""}" onclick="switchGroup('growth')">成長</button>
      <button class="tab-btn ${appState.currentGroup === "defensive" ? "active" : ""}" onclick="switchGroup('defensive')">防禦</button>
      <button class="tab-btn ${appState.currentGroup === "cyclical" ? "active" : ""}" onclick="switchGroup('cyclical')">週期</button>
      <button class="tab-btn ${appState.currentGroup === "speculative" ? "active" : ""}" onclick="switchGroup('speculative')">投機</button>
    </div>

    <div class="group-tabs" style="margin-top:-4px;">
      <button class="tab-btn ${appState.currentScope === "all" ? "active" : ""}" onclick="switchScope('all')">全部</button>
      <button class="tab-btn ${appState.currentScope === "recommended" ? "active" : ""}" onclick="switchScope('recommended')">建議</button>
    </div>
  `;
}

function stockCard(stock) {
  const s = withDerivedScores(stock);
  const showEvent = appState.newsMode === "news";

  return `
    <div class="stock-card m3a-stock-card">
      <div class="stock-head">${s.symbol} ｜ ${s.name}</div>
      <div class="stock-meta">
        ${s.basket.toUpperCase()} ｜ ${s.allow ? '<span class="tag-core">可做 FCN</span>' : '<span class="tag-avoid">不做 FCN</span>'}
      </div>

      <div class="stock-row">Baseline：<span class="${labelClass(s.baselineLabel)}">${s.baselineLabel}</span>（${s.baselineScore}）</div>
      <div class="stock-row">Pure：<span class="${labelClass(s.pureLabel)}">${s.pureLabel}</span>（${s.pureScore}）</div>

      ${
        showEvent
          ? `
        <div class="stock-row">Event：<span class="${labelClass(s.eventLabel)}">${s.eventLabel}</span>（${s.eventScore}）</div>
        <div class="stock-row">ΔEvent：<span class="${deltaClass(s.dEvent)}">${formatSigned(s.dEvent)}</span></div>
      `
          : `
        <div class="stock-row">ΔPure：<span class="${deltaClass(s.dPure)}">${formatSigned(s.dPure)}</span></div>
      `
      }

      <div class="stock-row mini-note">${s.note}</div>

      <div class="btn-row" style="margin-top:12px;">
        <button class="btn m3a-detail-btn" onclick="toggleStockExtra(this)">展開細節</button>
      </div>

      <div class="stock-extra">
        <div class="line"><strong>現價：</strong>${s.price}</div>
        <div class="line"><strong>PE25：</strong>${s.pe25}</div>
        <div class="line"><strong>PE26：</strong>${s.pe26}</div>
        <div class="line"><strong>EPS26：</strong>${s.eps26}</div>
        <div class="line"><strong>事件說明：</strong>${s.news}</div>
      </div>
    </div>
  `;
}

function renderM3A() {
  const container = document.getElementById("m3a-content");
  if (!container) return;

  let filtered = [...stocks];
  if (appState.currentGroup !== "all") filtered = filtered.filter((s) => s.basket === appState.currentGroup);
  if (appState.currentScope === "recommended") filtered = filtered.filter((s) => s.allow);

  container.innerHTML = filtered.map(stockCard).join("") || `<div class="model-card">目前沒有資料</div>`;
}

// ---------- M3-B / M3-C ----------
function renderM3B() {
  const el = document.getElementById("m3b-content");
  if (!el) return;
  el.innerHTML = `
    <div class="model-card">
      <div class="line"><strong>FCN 組合遴選與建議</strong></div>
      <div class="line">目前為工程版骨架，下一步可接 Basket 生成、Worst-of 評分、利率與天期加權。</div>
      <div class="line" style="margin-top:8px;"><strong>公式摘要：</strong>平均標的分數 + 分散 + 利率 + 天期 - 最差標的 - 波動 - 下檔風險</div>
    </div>
  `;
}

function renderM3C() {
  const el = document.getElementById("m3c-content");
  if (!el) return;
  el.innerHTML = `
    <div class="model-card">
      <div class="line"><strong>外部 FCN 單筆評估</strong></div>
      <div class="line">後續可匯入外部條件，依系統公式判斷這筆單是否值得接。</div>
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

  const hit = stocks.find(
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

function init() {
  injectUtilityStyles();
  renderModule1();
  renderModule2();
  renderM3Model();
  renderDashboard();
  renderM3Summary();
  renderM3A();
  renderM3B();
  renderM3C();
  initStockSearch();
}

document.addEventListener("DOMContentLoaded", init);
