function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function normalizeDirection(direction) {
  const d = String(direction || "").toLowerCase();
  if (d === "positive" || d === "正向") return "positive";
  if (d === "negative" || d === "負向") return "negative";
  return "neutral";
}

function directionLabel(direction) {
  const d = normalizeDirection(direction);
  if (d === "positive") return "🟢 正向";
  if (d === "negative") return "🔴 負向";
  return "⚪ 中性";
}

function strengthLabel(level) {
  const v = String(level || "").toLowerCase();
  if (v === "high") return "high";
  if (v === "medium") return "medium";
  if (v === "low") return "low";
  return "medium";
}

function getFinalDirection(news, key) {
  window.__module1Overrides = window.__module1Overrides || {};
  const userChoice = window.__module1Overrides[key];
  if (userChoice) return normalizeDirection(userChoice);
  return normalizeDirection(news.ai_direction || "neutral");
}

function getTopNews(data) {
  const all = [
    ...(data?.global || []),
    ...(data?.finance || []),
    ...(data?.ai || []),
    ...(data?.fcn || [])
  ];

  return all
    .filter((n) => String(n.level || "").toLowerCase() === "high")
    .slice(0, 3);
}

function renderMarketTable(marketData) {
  const pickDisplayValue = (v) => {
    if (v == null) return "-";
    if (typeof v !== "object") return v;

    return (
      v.value ??
      v.current ??
      v.latest ??
      v.now ??
      v.close ??
      v.price ??
      (typeof v.data === "object"
        ? (v.data?.value ?? v.data?.current ?? v.data?.latest ?? v.data?.price)
        : undefined) ??
      "-"
    );
  };

  const pickPreviousValue = (v) => {
    if (v == null) return "-";
    if (typeof v !== "object") return "-";

    return (
      v.previous ??
      v.prev ??
      v.last ??
      v.yesterday ??
      (typeof v.data === "object"
        ? (v.data?.previous ?? v.data?.prev ?? v.data?.last)
        : undefined) ??
      "-"
    );
  };

  const formatDeltaPercent = (current, previous) => {
    const c = Number(current);
    const p = Number(previous);
    if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return "--";

    const pct = ((c - p) / p) * 100;
    const sign = pct > 0 ? "+" : "";
    return `${sign}${pct.toFixed(1)}%`;
  };

  const deltaClass = (current, previous) => {
    const c = Number(current);
    const p = Number(previous);
    if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return "";
    if (c > p) return "market-up";
    if (c < p) return "market-down";
    return "market-flat";
  };

  const pickComment = (name, current, previous) => {
    const key = String(name || "").toLowerCase();
    const c = Number(current);
    const p = Number(previous);

    if (!Number.isFinite(c) || !Number.isFinite(p)) return "";

    const delta = c - p;

    if (key.includes("vix")) return delta > 0 ? "恐慌升溫" : "波動降溫";
    if (key.includes("nasdaq")) return delta > 0 ? "科技偏強" : "科技轉弱";
    if (key.includes("sp")) return delta > 0 ? "大盤偏多" : "大盤偏弱";
    if (key.includes("dow")) return delta > 0 ? "權值偏穩" : "權值轉弱";
    if (key.includes("10y") || key.includes("20y")) return delta > 0 ? "殖利率升" : "殖利率降";
    if (key.includes("oil")) return delta > 0 ? "通膨壓力升" : "成本壓力降";
    if (key.includes("gold")) return delta > 0 ? "避險升溫" : "避險降溫";
    if (key.includes("cpi") || key.includes("ppi")) return delta > 0 ? "通膨升溫" : "通膨降溫";
    if (key.includes("tw")) return delta > 0 ? "台股偏強" : "台股偏弱";

    return "";
  };

  const prettyName = (name) => {
    const map = {
      vix: "VIX",
      sp500: "S&P 500",
      nasdaq: "Nasdaq",
      dow: "Dow",
      us10y: "10Y",
      us20y: "20Y",
      oil: "Oil",
      gold: "Gold",
      cpi: "CPI",
      ppi: "PPI",
      tw_index: "台股"
    };
    return map[name] || name;
  };

  const rows = Array.isArray(marketData)
    ? marketData.map((item) => {
        const name = item.name ?? item.label ?? "-";
        const current = pickDisplayValue(item);
        const previous = pickPreviousValue(item);
        return {
          name,
          current,
          previous,
          deltaPct: formatDeltaPercent(current, previous),
          deltaClassName: deltaClass(current, previous),
          comment: pickComment(name, current, previous)
        };
      })
    : Object.entries(marketData || {}).map(([name, value]) => {
        const current = pickDisplayValue(value);
        const previous = pickPreviousValue(value);
        return {
          name,
          current,
          previous,
          deltaPct: formatDeltaPercent(current, previous),
          deltaClassName: deltaClass(current, previous),
          comment: pickComment(name, current, previous)
        };
      });

  if (!rows.length) return "";

  return `
    <div class="section">
      <h3>📊 市場指標</h3>
      <table class="market-table">
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
          ${rows.map((r) => `
            <tr>
              <td>${escapeHtml(prettyName(r.name))}</td>
              <td>${escapeHtml(r.current)}</td>
              <td>${escapeHtml(r.previous)}</td>
              <td class="${r.deltaClassName}">${escapeHtml(r.deltaPct)}</td>
              <td>${escapeHtml(r.comment || "--")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderChoiceButtons(key) {
  window.__module1Overrides = window.__module1Overrides || {};
  const override = window.__module1Overrides[key] || "ai";

  return `
    <div class="news-choice-row" data-news-key="${key}">
      <button type="button" class="news-choice-btn ${override === "ai" ? "active-ai" : ""}" onclick="setNewsDirection('${key}', 'ai', this)">採用AI</button>
      <button type="button" class="news-choice-btn ${override === "positive" ? "active" : ""}" onclick="setNewsDirection('${key}', 'positive', this)">正向</button>
      <button type="button" class="news-choice-btn ${override === "neutral" ? "active" : ""}" onclick="setNewsDirection('${key}', 'neutral', this)">中性</button>
      <button type="button" class="news-choice-btn ${override === "negative" ? "active" : ""}" onclick="setNewsDirection('${key}', 'negative', this)">負向</button>
    </div>
  `;
}

function renderNewsCard(news, key, expanded = false) {
  const finalDirection = getFinalDirection(news, key);
  const aiDirection = normalizeDirection(news.ai_direction || "neutral");
  const aiStrength = strengthLabel(news.ai_strength || "low");
  const impacts = Array.isArray(news.impact) ? news.impact.join(", ") : "";
  const detailId = `news-detail-${key}`;
  const hasDetail = Boolean(news.ai_reason || news.summary);

  return `
    <div class="news-card" data-news-card="${key}" data-ai-direction="${aiDirection}">
      <div class="news-title">${escapeHtml(news.title)}</div>
      <div class="news-summary">${escapeHtml(news.summary || "")}</div>

      <div class="news-meta-line">
        <span>影響：${escapeHtml(impacts || "未提供")}</span>
        <span>強度：${escapeHtml(news.level || "medium")}</span>
        <span class="news-final-direction">
          最終方向：
          <span data-news-final="${key}">${directionLabel(finalDirection)}</span>
        </span>
      </div>

      <div class="news-ai-box">
        <div class="news-ai-title">AI判定 ${directionLabel(aiDirection)} (${escapeHtml(aiStrength)})</div>
        <div class="news-ai-reason">理由：${escapeHtml(news.ai_reason || "未提供")}</div>
      </div>

      <div class="news-user-choice-title">你的選擇</div>
      ${renderChoiceButtons(key)}

      ${
        hasDetail
          ? `
        <button type="button" class="news-link-btn" onclick="toggleNews('${detailId}', this)">
          ${expanded ? "點擊收合" : "點擊展開"}
        </button>

        <div id="${detailId}" class="${expanded ? "" : "hidden"}">
          <div class="news-detail-box">
            <div class="news-detail-title">完整說明</div>
            <div class="news-detail-text">${escapeHtml(news.summary || "目前無更多內容")}</div>
          </div>
        </div>
      `
          : ""
      }
    </div>
  `;
}

function renderSection(title, list, keyPrefix) {
  const sectionId = `section-${keyPrefix}`;
  const safeList = Array.isArray(list) ? list : [];

  return `
    <div class="section">
      <div class="section-header">
        <h3>${title}（${safeList.length}）</h3>
        <button type="button" class="section-toggle-btn" onclick="toggleNews('${sectionId}', this)">
          點擊展開
        </button>
      </div>

      <div id="${sectionId}" class="hidden">
        ${
          safeList.length
            ? safeList.map((news, idx) => renderNewsCard(news, `${keyPrefix}-${idx}`, false)).join("")
            : `<p>目前無資料</p>`
        }
      </div>

      ${safeList.length === 0 ? `<p>目前無資料</p>` : ""}
    </div>
  `;
}

export function renderModule1News(newsData, marketData) {
  if (!newsData) return `<p>目前無新聞資料</p>`;

  const topNews = getTopNews(newsData);

  setTimeout(() => {
    updateNewsModeUI();
    bindNewsModeEvents();
  }, 0);

  return `
    <div class="module1">
      <div class="summary">
        <div style="font-size:22px; font-weight:800; margin-bottom:12px;">Module1 新聞雷達</div>

        <div class="news-mode-bar">
          <div class="news-mode-title">決策模式</div>
          <div class="news-mode-toggle">
            <button id="mode-pure" class="news-mode-btn">純模型</button>
            <button id="mode-news" class="news-mode-btn">新聞加權</button>
          </div>
          <div id="news-mode-status" class="news-mode-status">
            模式：新聞加權（含市場情緒）
          </div>
        </div>

        <div>
          國際：${newsData.global?.length || 0}
          ｜ 財經：${newsData.finance?.length || 0}
          ｜ AI：${newsData.ai?.length || 0}
          ｜ FCN：${newsData.fcn?.length || 0}
        </div>
      </div>

      ${renderMarketTable(marketData)}

      ${
        topNews.length > 0
          ? `
        <div class="section">
          <h3>🔥 今日重點（${topNews.length}）</h3>
          <div class="news-list">
            ${topNews.map((news, idx) => renderNewsCard(news, `top-${idx}`, true)).join("")}
          </div>
        </div>
      `
          : ""
      }

      ${renderSection("🌍 國際新聞", newsData.global || [], "global")}
      ${renderSection("💰 財經新聞", newsData.finance || [], "finance")}
      ${renderSection("🤖 AI 趨勢", newsData.ai || [], "ai")}
      ${renderSection("📦 FCN 影響", newsData.fcn || [], "fcn")}

      <div class="section">
        <div class="module1-action-row">
          <button type="button" class="news-mode-btn action-btn" onclick="rerunDecision()">🔄 重新計算</button>
          <button type="button" class="news-mode-btn action-btn" onclick="exportPDF()">📄 匯出 PDF</button>
        </div>
      </div>
    </div>
  `;
}

window.toggleNews = function (id, el) {
  const target = document.getElementById(id);
  if (!target) return;

  const willOpen = target.classList.contains("hidden");
  target.classList.toggle("hidden");

  if (el) {
    el.textContent = willOpen ? "點擊收合" : "點擊展開";
  }
};

window.setNewsDirection = function (key, direction, btn) {
  window.__module1Overrides = window.__module1Overrides || {};

  const controls = document.querySelector(`[data-news-key="${key}"]`);
  const card = document.querySelector(`[data-news-card="${key}"]`);
  const finalEl = document.querySelector(`[data-news-final="${key}"]`);

  if (!controls) return;

  const buttons = controls.querySelectorAll(".news-choice-btn");
  buttons.forEach((b) => b.classList.remove("active", "active-ai"));

  let targetText = "採用AI";
  if (direction === "positive") targetText = "正向";
  if (direction === "neutral") targetText = "中性";
  if (direction === "negative") targetText = "負向";

  buttons.forEach((b) => {
    if (b.textContent === targetText) {
      b.classList.add(direction === "ai" ? "active-ai" : "active");
    }
  });

  if (direction === "ai") {
    delete window.__module1Overrides[key];
  } else {
    window.__module1Overrides[key] = direction;
  }

  if (finalEl && card) {
    const aiDirection = card.dataset.aiDirection || "neutral";
    const effectiveDirection = direction === "ai" ? aiDirection : direction;
    finalEl.textContent = directionLabel(effectiveDirection);
  }
};

window.rerunDecision = function () {
  if (typeof window.rerenderModule3 === "function") {
    window.rerenderModule3();
    alert("已依目前新聞判定重新計算 Module3");
  } else {
    alert("目前無法重新計算 Module3");
  }
};

window.exportPDF = function () {
  window.print();
};

window.newsMode = "news";

function updateNewsModeUI() {
  const pureBtn = document.getElementById("mode-pure");
  const newsBtn = document.getElementById("mode-news");
  const status = document.getElementById("news-mode-status");
  if (!pureBtn || !newsBtn || !status) return;

  const isNewsOn = window.newsMode === "news";

  pureBtn.classList.toggle("active", !isNewsOn);
  newsBtn.classList.toggle("active", isNewsOn);

  status.textContent = isNewsOn
    ? "模式：新聞加權（含市場情緒）"
    : "模式：純模型（不含新聞）";
}

function bindNewsModeEvents() {
  const pureBtn = document.getElementById("mode-pure");
  const newsBtn = document.getElementById("mode-news");
  if (!pureBtn || !newsBtn) return;

  pureBtn.onclick = () => {
    window.newsMode = "pure";
    updateNewsModeUI();
    if (typeof window.rerenderModule3 === "function") {
      window.rerenderModule3();
    }
  };

  newsBtn.onclick = () => {
    window.newsMode = "news";
    updateNewsModeUI();
    if (typeof window.rerenderModule3 === "function") {
      window.rerenderModule3();
    }
  };
}
