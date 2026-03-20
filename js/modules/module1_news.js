function calcDeltaPct(current, previous) {
  const c = Number(current);
  const p = Number(previous);
  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return null;
  return ((c - p) / p) * 100;
}

function formatDeltaPct(current, previous) {
  const delta = calcDeltaPct(current, previous);
  if (delta === null) return "-";
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
}

function formatValue(key, value) {
  if (value === null || value === undefined) return "-";

  if (["us10y", "us20y"].includes(key)) return `${value}%`;
  return `${value}`;
}

function marketInterpretation(key, current, previous) {
  const delta = calcDeltaPct(current, previous);
  if (delta === null) return "無法判讀";

  switch (key) {
    case "vix":
      return delta > 0 ? "恐慌上升" : "恐慌下降";
    case "nasdaq":
      return delta > 0 ? "科技股轉強" : "科技股轉弱";
    case "sp500":
      return delta > 0 ? "大盤穩定偏多" : "大盤壓力上升";
    case "dow":
      return delta > 0 ? "權值股偏穩" : "權值股轉弱";
    case "us10y":
    case "us20y":
      return delta > 0 ? "利率上升" : "利率下降";
    case "oil":
      return delta > 0 ? "通膨壓力略升" : "通膨壓力舒緩";
    case "gold":
      return delta > 0 ? "避險需求增加" : "避險需求下降";
    case "cpi":
      return delta > 0 ? "通膨升溫" : "通膨下降";
    case "ppi":
      return delta > 0 ? "生產端通膨升溫" : "生產端通膨下降";
    case "tw_index":
      return delta > 0 ? "台股偏強" : "台股偏弱";
    default:
      return "中性";
  }
}

function marketRow(label, key, data) {
  if (!data) return "";

  const current = data.current;
  const previous = data.previous;
  const delta = calcDeltaPct(current, previous);
  const deltaText = formatDeltaPct(current, previous);
  const deltaClass = delta === null ? "" : delta >= 0 ? "up" : "down";

  return `
    <tr>
      <td>${label}</td>
      <td>${formatValue(key, current)}</td>
      <td>${formatValue(key, previous)}</td>
      <td class="${deltaClass}">${deltaText}</td>
      <td>${marketInterpretation(key, current, previous)}</td>
    </tr>
  `;
}

function renderMarketTable(market) {
  if (!market) {
    return `
      <div class="section">
        <h3>📊 市場指標</h3>
        <p>目前無資料</p>
      </div>
    `;
  }

  return `
    <div class="section">
      <h3>📊 市場指標</h3>
      <div class="market-table-wrap">
        <table class="market-table">
          <thead>
            <tr>
              <th>指標</th>
              <th>數值</th>
              <th>前值</th>
              <th>變化幅度</th>
              <th>說明</th>
            </tr>
          </thead>
          <tbody>
            ${marketRow("VIX", "vix", market.vix)}
            ${marketRow("Nasdaq", "nasdaq", market.nasdaq)}
            ${marketRow("S&P 500", "sp500", market.sp500)}
            ${marketRow("Dow", "dow", market.dow)}
            ${marketRow("10Y", "us10y", market.us10y)}
            ${marketRow("20Y", "us20y", market.us20y)}
            ${marketRow("Oil", "oil", market.oil)}
            ${marketRow("Gold", "gold", market.gold)}
            ${marketRow("CPI", "cpi", market.cpi)}
            ${marketRow("PPI", "ppi", market.ppi)}
            ${marketRow("台股", "tw_index", market.tw_index)}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function getEffectiveDirection(item) {
  return item.user_direction || item.ai_direction || "neutral";
}

function directionLabel(direction) {
  if (direction === "positive") return "🟢 正向";
  if (direction === "negative") return "🔴 負向";
  return "⚪ 中性";
}

function directionClass(direction) {
  if (direction === "positive") return "positive";
  if (direction === "negative") return "negative";
  return "neutral";
}

function renderDirectionControls(item, idx, prefix) {
  const key = `${prefix}-${idx}`;
  const current = item.user_direction || "ai";

  return `
    <div class="news-controls" data-news-key="${key}">
      <div class="news-ai-box">
        <div class="news-ai-row">
          <span class="news-ai-label">AI判定</span>
          <span class="news-direction-badge ${directionClass(item.ai_direction)}">
            ${directionLabel(item.ai_direction)}（${item.ai_strength || "low"}）
          </span>
        </div>
        <div class="news-ai-reason">
          理由：${item.ai_reason || "未提供"}
        </div>
      </div>

      <div class="news-user-choice-title">你的選擇</div>
      <div class="news-btn-row">
        <button type="button" class="news-btn ${current === "ai" ? "active" : ""}" onclick="setNewsDirection('${key}','ai')">採用AI</button>
        <button type="button" class="news-btn ${current === "positive" ? "active" : ""}" onclick="setNewsDirection('${key}','positive')">正向</button>
        <button type="button" class="news-btn ${current === "neutral" ? "active" : ""}" onclick="setNewsDirection('${key}','neutral')">中性</button>
        <button type="button" class="news-btn ${current === "negative" ? "active" : ""}" onclick="setNewsDirection('${key}','negative')">負向</button>
      </div>
    </div>
  `;
}

function renderNewsItem(item, idx, prefix) {
  const id = `${prefix}-${idx}`;
  const effectiveDirection = getEffectiveDirection(item);

  return `
    <div class="news-card">
      <div class="news-title">${item.title}</div>

      <div class="news-summary clamp-3">
        ${item.summary}
      </div>

      <div class="news-meta-row">
        <span>影響：${item.impact || "-"}</span>
        <span>強度：${item.level || "-"}</span>
        <span class="news-direction-badge ${directionClass(effectiveDirection)}">
          最終方向：${directionLabel(effectiveDirection)}
        </span>
      </div>

      ${renderDirectionControls(item, idx, prefix)}

      <div class="news-expand" onclick="toggleNews('${id}', this)">點擊展開</div>

      <div id="${id}" class="hidden news-expand-content">
        <div class="news-expand-box">
          <div class="news-expand-title">完整說明</div>
          <div class="news-expand-text">${item.ai_reason || "目前無更多內容"}</div>
        </div>
      </div>
    </div>
  `;
}

function renderSection(title, list, key) {
  const items = (list || []).slice(0, 10);

  return `
    <div class="section">
      <h3>${title}（${items.length}）</h3>
      <div class="news-list">
        ${items.length > 0
          ? items.map((n, i) => renderNewsItem(n, i, key)).join("")
          : `<p>目前無資料</p>`}
      </div>
    </div>
  `;
}

function getTopNews(data) {
  const all = [
    ...(data.global || []),
    ...(data.finance || []),
    ...(data.ai || []),
    ...(data.fcn || [])
  ];

  return all.filter((n) => n.level === "high").slice(0, 3);
}

export function renderModule1News(newsData, marketData) {
  if (!newsData) return `<p>目前無新聞資料</p>`;

  const topNews = getTopNews(newsData);

  return `
    <div class="module1">
      <div class="summary">
        <div style="font-size:22px; font-weight:800; margin-bottom:8px;">Module1 新聞雷達</div>
        國際：${newsData.global?.length || 0} ｜ 
        財經：${newsData.finance?.length || 0} ｜ 
        AI：${newsData.ai?.length || 0} ｜ 
        FCN：${newsData.fcn?.length || 0}
      </div>

      ${renderMarketTable(marketData)}

      ${
        topNews.length > 0
          ? `
        <div class="section">
          <h3>🔥 今日重點（${topNews.length}）</h3>
          <div class="news-list">
            ${topNews.map((n, i) => renderNewsItem(n, i, "top")).join("")}
          </div>
        </div>
      `
          : ""
      }

      ${renderSection("🌍 國際新聞", newsData.global, "global")}
      ${renderSection("💰 財經新聞", newsData.finance, "finance")}
      ${renderSection("🤖 AI 趨勢", newsData.ai, "ai")}
      ${renderSection("📦 FCN 影響", newsData.fcn, "fcn")}

      <div class="section">
        <button type="button" class="news-btn active" onclick="rerunDecision()">🔄 套用判定並重新計算</button>
      </div>
    </div>
  `;
}

window.toggleNews = function(id, el) {
  const target = document.getElementById(id);
  if (!target) return;

  const willOpen = target.classList.contains("hidden");
  target.classList.toggle("hidden");

  if (el) {
    el.textContent = willOpen ? "點擊收合" : "點擊展開";
  }
};

window.setNewsDirection = function(key, direction) {
  const controls = document.querySelector(`[data-news-key="${key}"]`);
  if (!controls) return;

  const buttons = controls.querySelectorAll(".news-btn");
  buttons.forEach((btn) => btn.classList.remove("active"));

  let targetText = "採用AI";
  if (direction === "positive") targetText = "正向";
  if (direction === "neutral") targetText = "中性";
  if (direction === "negative") targetText = "負向";

  buttons.forEach((btn) => {
    if (btn.textContent === targetText) {
      btn.classList.add("active");
    }
  });

  window.__module1Overrides = window.__module1Overrides || {};
  window.__module1Overrides[key] = direction;
};

window.rerunDecision = function() {
  alert("這一版已完成畫面與覆核流程。下一步再正式連動 Module3 重算。");
};
