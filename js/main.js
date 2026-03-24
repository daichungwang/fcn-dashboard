// ==========================================
// 振宇 FCN 系統 main.js V7.5（完整穩定版）
// ==========================================

// ===== 全域狀態 =====
const appState = {
  stocks: [],
  expandedAll: false
};

// ===== 模擬資料（一定會出畫面）=====
const mockStocks = [
  { symbol: "NVDA", name: "NVIDIA", score: 10 },
  { symbol: "TSM", name: "TSMC", score: 9 },
  { symbol: "AAPL", name: "Apple", score: 8 },
  { symbol: "MSFT", name: "Microsoft", score: 9 },
  { symbol: "AMZN", name: "Amazon", score: 7 },
  { symbol: "GOOGL", name: "Google", score: 8 },
  { symbol: "META", name: "Meta", score: 7 }
];

// ===== 初始化 =====
document.addEventListener("DOMContentLoaded", () => {
  appState.stocks = mockStocks;
  renderStocks();
});

// ===== 渲染股票 =====
function renderStocks() {
  const container = document.getElementById("stock-list");
  if (!container) return;

  container.innerHTML = "";

  appState.stocks.forEach((stock, index) => {
    const card = document.createElement("div");
    card.className = "stock-card";

    card.innerHTML = `
      <div style="font-weight:bold; font-size:18px;">
        ${stock.symbol} | ${stock.name}
      </div>
      <div>Score：${stock.score}</div>

      <button onclick="toggleDetail(${index})">
        展開細節
      </button>

      <div id="detail-${index}" style="display:none; margin-top:10px;">
        👉 這裡之後會放 FCN 分析
      </div>
    `;

    container.appendChild(card);
  });
}

// ===== 單卡展開 =====
function toggleDetail(index) {
  const el = document.getElementById(`detail-${index}`);
  if (!el) return;

  if (el.style.display === "none") {
    el.style.display = "block";
  } else {
    el.style.display = "none";
  }
}

// ===== 全部展開 =====
function expandAll() {
  appState.expandedAll = true;

  appState.stocks.forEach((_, index) => {
    const el = document.getElementById(`detail-${index}`);
    if (el) el.style.display = "block";
  });
}

// ===== 全部收合 =====
function collapseAll() {
  appState.expandedAll = false;

  appState.stocks.forEach((_, index) => {
    const el = document.getElementById(`detail-${index}`);
    if (el) el.style.display = "none";
  });
}
