// =========================
// 振宇 FCN 系統｜main.js
// 工程版完整覆蓋
// 對應：M1 / M2 / M3
// =========================

// ---------- 全域狀態 ----------
const appState = {
  newsMode: "news",
  currentGroup: "all",
  currentScope: "all",
  demoMode: false,
};

// ---------- 基礎資料（工程版暫用，可之後改成 JSON / API） ----------
const marketRows = [
  { name: "VIX", value: 21, prev: 20, change: "+5.0%", note: "恐慌升溫" },
  { name: "S&P 500", value: 6606, prev: 6550, change: "+0.9%", note: "大盤偏多" },
  { name: "Nasdaq", value: 22090, prev: 21800, change: "+1.3%", note: "科技偏強" },
  { name: "Dow", value: 46021, prev: 45800, change: "+0.5%", note: "權值偏穩" },
  { name: "10Y", value: 4.26, prev: 4.20, change: "+1.4%", note: "殖利率升" },
  { name: "20Y", value: 4.84, prev: 4.78, change: "+1.3%", note: "殖利率升" },
];

const newsItems = [
  {
    title: "聯準會維持高利率政策",
    summary: "市場預期降息時間延後，資金成本維持高檔。",
    impact: "SPY, QQQ",
    strength: "high",
    direction: "負向",
  },
  {
    title: "AI 應用加速落地",
    summary: "企業導入加快，雲端支出維持強勢。",
    impact: "MSFT, AMZN",
    strength: "medium",
    direction: "正向",
  },
  {
    title: "美國 CPI 高於預期",
    summary: "通膨壓力未退，政策轉向延後。",
    impact: "SPY",
    strength: "high",
    direction: "負向",
  },
];

const positions = Array.from({ length: 10 }).map((_, i) => ({
  id: `FCN-${i + 1}`,
  worstOf: ["AMZN", "AVGO", "NVDA", "MSFT", "GOOG", "TSM", "AAPL", "QQQ", "SPY", "META"][i],
  coupon: [18, 22, 25, 21, 19, 20, 24, 17, 23, 18][i],
  tenor: [7, 9, 6, 9, 12, 6, 9, 6, 12, 9][i],
}));

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

// ---------- 樣式輔助 ----------
function injectUtilityStyles() {
  if (document.getElementById("fcn-main-inline-style")) return;
  const style = document.createElement("style");
  style.id = "fcn-main-inline-style";
  style.textContent = `
    .m3a-summary-grid {
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:14px;
      margin-bottom:16px;
    }
    .m3a-summary-card {
      background:#fff;
      border:1px solid #e5e7eb;
      border-radius:18px;
      box-shadow:0 2px 10px rgba(0,0,0,.05);
      padding:16px;
    }
    .m3a-summary-title { color:#6b7280; font-size:14px; margin-bottom:8px; }
    .m3a-summary-value { font-size:44px; font-weight:900; line-height:1; }
    .m3a-summary-value.up { color:#16a34a; }
    .m3a-summary-value.down { color:#dc2626; }

    .stock-card,.position-card,.m3-card,.news-card {
      background:#fff;
      border:1px solid #e5e7eb;
      border-radius:18px;
      box-shadow:0 2px 10px rgba(0,0,0,.05);
      padding:16px;
      margin-bottom:14px;
    }
    .stock-head,.position-id { font-size:24px; font-weight:900; margin-bottom:10px; }
    .stock-meta { color:#6b7280; font-size:13px; margin-bottom:10px; }
    .stock-row,.line { margin:7px 0; font-size:15px; line-height:1.5; }
    .detail,.stock-extra {
      display:none;
      margin-top:12px;
      padding:12px;
      border:1px solid #e5e7eb;
      border-radius:14px;
      background:#f9fafb;
    }
    .group-tabs {
      display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;
    }
    .tab-btn,.btn {
      appearance:none;
      border:1px solid #cfd4dc;
      background:#fff;
      color:#2563eb;
      padding:10px 16px;
      border-radius:999px;
      font-weight:800;
      font-size:15px;
      box-shadow:0 1px 2px rgba(0,0,0,.03);
      cursor:pointer;
    }
    .tab-btn.active { background:#2563eb; color:#fff; border-color:#2563eb; }
    .btn-row { display:flex; gap:10px; flex-wrap:wrap; margin:0 0 14px; }
    .tag-core { color:#2563eb; font-weight:800; }
    .tag-balance { color:#16a34a; font-weight:800; }
    .tag-defensive { color:#ca8a04; font-weight:800; }
    .tag-avoid { color:#dc2626; font-weight:800; }
    .delta-positive { color:#16a34a; font-weight:800; }
    .delta-negative { color:#dc2626; font-weight:800; }
    .mini-note { color:#6b7280; font-size:14px; }
    .news-table {
      width:100%;
      border-collapse:collapse;
      overflow:hidden;
      border-radius:14px;
      font-size:14px;
      margin-top:12px;
    }
    .news-table th,.news-table td {
      border:1px solid #d1d5db;
      padding:12px 10px;
      text-align:left;
      background:#fff;
      vertical-align:top;
    }
    .news-table th {
      background:#6b6b6b;
      color:#fff;
      font-size:15px;
    }
  `;
  document.head.appendChild(style);
}

// ---------- 共用工具 ----------
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

// ---------- M1 ----------
function renderModule1() {
  const container =
    document.getElementById("module1-news") ||
    document.getElementById("module1") ||
    document.querySelector("[data-module='module1']");
  if (!container) return;

  container.innerHTML = `
    <div class="m3-card">
      <h2 style="font-size:26px;margin:0 0 10px;">Module1 新聞雷達</h2>

      <div class="line" style="font-size:20px;font-weight:800;">決策模式</div>

      <div class="btn-row" style="margin-top:14px;">
        <button class="tab-btn ${appState.newsMode === "pure" ? "active" : ""}" id="pureModeBtn" onclick="setNewsMode('pure')">純模型</button>
        <button class="tab-btn ${appState.newsMode === "news" ? "active" : ""}" id="newsModeBtn" onclick="setNewsMode('news')">新聞加權</button>
      </div>

      <div class="line"><strong>模式：</strong><span id="modeText">${appState.newsMode === "news" ? "新聞加權（含市場情緒）" : "純模型（不含新聞）"}</span></div>
      <div class="line">國際：10 ｜ 財經：10 ｜ AI：10 ｜ FCN：0</div>
    </div>

    <div class="m3-card">
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

    <div class="m3-card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <h3 style="margin:0;">🌍 國際新聞（${newsItems.length}）</h3>
        <button class="btn" onclick="toggleNewsSection()">點擊展開 / 收合</button>
      </div>
      <div id="newsSection" style="margin-top:12px;">
        ${newsItems.map((n) => `
          <div class="news-card">
            <div class="stock-head" style="font-size:18px;">${n.title}</div>
            <div class="line">${n.summary}</div>
            <div class="line"><strong>影響：</strong>${n.impact}　<strong>強度：</strong>${n.strength}　<strong>方向：</strong><span class="${n.direction === "正向" ? "delta-positive" : "delta-negative"}">${n.direction}</span></div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

// ---------- M2 ----------
function classifyPosition(pos) {
  let score = 0;

  if (pos.coupon < 10) score -= 10;
  else if (pos.coupon < 12) score -= 4;
  else if (pos.coupon < 15) score -= 2;
  else if (pos.coupon < 16) score += 0;
  else if (pos.coupon < 18) score += 3;
  else if (pos.coupon < 20) score += 5;
  else if (pos.coupon < 24) score += 8;
  else score += 10;

  if (pos.tenor <= 3) score += 5;
  else if (pos.tenor <= 6) score += 2;
  else if (pos.tenor <= 9) score -= 2;
  else if (pos.tenor <= 12) score -= 5;
  else score -= 10;

  if (score <= 0) return "風險";
  if (score <= 4) return "追蹤";
  return "健康";
}

function renderModule2() {
  const container =
    document.getElementById("module2-health") ||
    document.getElementById("module2") ||
    document.querySelector("[data-module='module2']");
  if (!container) return;

  const enriched = positions.map((p) => ({ ...p, status: classifyPosition(p) }));
  const total = enriched.length;
  const healthy = enriched.filter((p) => p.status === "健康").length;
  const watch = enriched.filter((p) => p.status === "追蹤").length;
  const risk = enriched.filter((p) => p.status === "風險").length;
  const urgent = enriched[0];

  container.innerHTML = `
    <div class="m3-card">
      <h2 style="font-size:26px;margin:0 0 10px;">持倉健康總覽</h2>

      <div class="btn-row">
        <button class="btn" onclick="expandAllM2Details()">全部展開</button>
        <button class="btn" onclick="collapseAllM2Details()">全部收合</button>
      </div>

      <div class="m3a-summary-grid">
        <div class="m3a-summary-card">
          <div class="m3a-summary-title">全部</div>
          <div class="m3a-summary-value">${total}</div>
        </div>
        <div class="m3a-summary-card">
          <div class="m3a-summary-title">健康</div>
          <div class="m3a-summary-value up">${healthy}</div>
          <div class="mini-note">${Math.round((healthy / total) * 100)}%</div>
        </div>
        <div class="m3a-summary-card">
          <div class="m3a-summary-title">追蹤</div>
          <div class="m3a-summary-value" style="color:#ca8a04;">${watch}</div>
          <div class="mini-note">${Math.round((watch / total) * 100)}%</div>
        </div>
        <div class="m3a-summary-card">
          <div class="m3a-summary-title">風險 / 待確認</div>
          <div class="m3a-summary-value down">${risk} / 0</div>
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
        ${enriched.map((p) => `
          <div class="position-card m2-position-card">
            <div class="position-id">${p.id}</div>
            <div class="line"><strong>狀態：</strong> ${p.status}</div>
            <div class="line"><strong>Worst-of：</strong> ${p.worstOf}</div>
            <div class="line"><strong>距離下限價：</strong> --</div>
            <button class="btn m2-detail-btn" onclick="toggleM2Detail(this)">展開詳細</button>
            <div class="detail" data-detail>
              <div class="line"><strong>年化配息：</strong> ${p.coupon}%</div>
              <div class="line"><strong>天期：</strong> ${p.tenor} 個月</div>
              <div class="line"><strong>到期：</strong> 未提供</div>
              <div class="line"><strong>Worst-of：</strong> ${p.worstOf}</div>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

// ---------- M3 ----------
function withDerivedScores(s) {
  const dPure = s.pureScore - s.baselineScore;
  const dEvent = s.eventScore - s.pureScore;
  return { ...s, dPure, dEvent };
}

function buildDashboard() {
  const map = {
    "m1-stock": "股票建議率：37%",
    "m1-fcn": "FCN 建議率：27%",
    "m2-risk": "風險指數：7.1",
    "m2-dpure": "ΔPure：-0.3",
    "m2-devent": "ΔEvent：-1.2",
    "m3-score": "適合度：6.8",
    "m4-score": "System Score：8.2",
  };

  Object.entries(map).forEach(([id, text]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
}

function renderM3Summary() {
  const el = document.getElementById("m3a-summary");
  if (!el) return;

  const enriched = stocks.map(withDerivedScores);
  const total = enriched.length;
  const allow = enriched.filter((s) => s.allow).length;
  const up = enriched.filter((s) => s.dEvent > 0).length;
  const down = enriched.filter((s) => s.dEvent < 0).length;

  el.innerHTML = `
    <div class="m3a-summary-grid">
      <div class="m3a-summary-card">
        <div class="m3a-summary-title">股票總數</div>
        <div class="m3a-summary-value">${total}</div>
      </div>
      <div class="m3a-summary-card">
        <div class="m3a-summary-title">可做 FCN</div>
        <div class="m3a-summary-value">${allow}</div>
      </div>
      <div class="m3a-summary-card">
        <div class="m3a-summary-title">Event 上修</div>
        <div class="m3a-summary-value up">${up}</div>
      </div>
      <div class="m3a-summary-card">
        <div class="m3a-summary-title">Event 下修</div>
        <div class="m3a-summary-value down">${down}</div>
      </div>
    </div>

    <div class="group-tabs" id="groupTabs">
      <button class="tab-btn ${appState.currentGroup === "all" ? "active" : ""}" onclick="switchGroup('all', this)">全部</button>
      <button class="tab-btn ${appState.currentGroup === "core" ? "active" : ""}" onclick="switchGroup('core', this)">核心</button>
      <button class="tab-btn ${appState.currentGroup === "growth" ? "active" : ""}" onclick="switchGroup('growth', this)">成長</button>
      <button class="tab-btn ${appState.currentGroup === "defensive" ? "active" : ""}" onclick="switchGroup('defensive', this)">防禦</button>
      <button class="tab-btn ${appState.currentGroup === "cyclical" ? "active" : ""}" onclick="switchGroup('cyclical', this)">週期</button>
      <button class="tab-btn ${appState.currentGroup === "speculative" ? "active" : ""}" onclick="switchGroup('speculative', this)">投機</button>
    </div>

    <div class="group-tabs" id="scopeTabs" style="margin-top:-4px;">
      <button class="tab-btn ${appState.currentScope === "all" ? "active" : ""}" onclick="switchScope('all', this)">全部</button>
      <button class="tab-btn ${appState.currentScope === "recommended" ? "active" : ""}" onclick="switchScope('recommended', this)">建議</button>
    </div>
  `;
}

function stockCard(s) {
  const dEvent = withDerivedScores(s).dEvent;
  return `
    <div class="stock-card">
      <div class="stock-head">${s.symbol} ｜ ${s.name}</div>
      <div class="stock-meta">
        ${s.basket.toUpperCase()} ｜ ${s.allow ? '<span class="tag-core">可做 FCN</span>' : '<span class="tag-avoid">不做 FCN</span>'}
      </div>
      <div class="stock-row">Baseline：<span class="${labelClass(s.baselineLabel)}">${s.baselineLabel}</span>（${s.baselineScore}）</div>
      <div class="stock-row">Pure：<span class="${labelClass(s.pureLabel)}">${s.pureLabel}</span>（${s.pureScore}）</div>
      <div class="stock-row">Event：<span class="${labelClass(s.eventLabel)}">${s.eventLabel}</span>（${s.eventScore}）</div>
      <div class="stock-row">ΔEvent：<span class="${deltaClass(dEvent)}">${formatSigned(dEvent)}</span></div>
      <div class="stock-row mini-note">${s.note}</div>
      <div class="btn-row" style="margin-top:12px;">
        <button class="btn" onclick="toggleStockExtra(this)">展開細節</button>
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
  if (appState.currentGroup !== "all") {
    filtered = filtered.filter((s) => s.basket === appState.currentGroup);
  }
  if (appState.currentScope === "recommended") {
    filtered = filtered.filter((s) => s.allow);
  }

  container.innerHTML = filtered.map(stockCard).join("") || `<div class="m3-card">目前沒有資料</div>`;
}

function renderM3B() {
  const el = document.getElementById("m3b-content");
  if (!el) return;

  el.innerHTML = `
    <div class="m3-card">
      <div class="line"><strong>FCN Pure Score 公式</strong></div>
      <div class="line">平均標的分數 + 分散分數 + 利率分數 + 天期分數 - 最差標的懲罰 - 波動懲罰 - 下檔風險懲罰</div>
      <div class="line" style="margin-top:10px;"><strong>目前狀態：</strong>工程版骨架已建立，下一步可直接接 FCN Basket 引擎。</div>
    </div>
  `;
}

function renderM3C() {
  const el = document.getElementById("m3c-content");
  if (!el) return;

  el.innerHTML = `
    <div class="m3-card">
      <div class="line"><strong>外部 FCN 單筆評估</strong></div>
      <div class="line">後續可匯入外部條件，依系統公式判斷利率是否合理、Worst-of 是否過弱、整體結構是否可接。</div>
    </div>
  `;
}

// ---------- 全域互動 ----------
window.setNewsMode = function (mode) {
  appState.newsMode = mode;
  renderModule1();
};

window.toggleNewsSection = function () {
  const el = document.getElementById("newsSection");
  if (!el) return;
  el.style.display = el.style.display === "none" ? "block" : "none";
};

window.togglePool = function () {
  const el = document.getElementById("pool-section");
  if (!el) return;
  el.style.display = el.style.display === "none" ? "block" : "none";
};

window.toggleM3Explain = function () {
  const el = document.getElementById("m3-explain-detail");
  if (!el) return;
  el.style.display = el.style.display === "none" ? "block" : "none";
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
  const card = btn.closest(".stock-card");
  if (!card) return;
  const extra = card.querySelector(".stock-extra");
  if (!extra) return;
  const hidden = extra.style.display === "none" || extra.style.display === "";
  extra.style.display = hidden ? "block" : "none";
  btn.textContent = hidden ? "收合細節" : "展開細節";
};

// ---------- 啟動 ----------
function init() {
  injectUtilityStyles();
  renderModule1();
  renderModule2();
  buildDashboard();
  renderM3Summary();
  renderM3A();
  renderM3B();
  renderM3C();
}

document.addEventListener("DOMContentLoaded", init);
