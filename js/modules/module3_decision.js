export function renderModule3(data) {
  const el = document.getElementById("module3-decision");

  if (!el) return;

  el.innerHTML = `
    <div style="padding:16px;">
      <h3>Module3 已成功載入 ✅</h3>
      <p>Pool 數量：${data.pool?.length || 0}</p>
    </div>
  `;
}

export function renderModule3(data) {
  const container = document.getElementById("module3-decision");
  if (!container) return;

  const pool = data.pool || [];

  // === 分類 ===
  const groups = {
    core: [],
    defensive: [],
    balanced: [],
    income: [],
    avoid: []
  };

  pool.forEach(stock => {
    if (stock.final_score >= 80) groups.core.push(stock);
    else if (stock.final_score >= 70) groups.defensive.push(stock);
    else if (stock.final_score >= 60) groups.balanced.push(stock);
    else if (stock.final_score >= 50) groups.income.push(stock);
    else groups.avoid.push(stock);
  });

  // === UI ===
  container.innerHTML = `
  <h2>📊 Module3：進場決策</h2>

  ${renderGroup("核心", groups.core, "core")}
  ${renderGroup("防守", groups.defensive, "defensive")}
  ${renderGroup("平衡", groups.balanced, "balanced")}
  ${renderGroup("收益", groups.income, "income")}
  ${renderGroup("避免", groups.avoid, "avoid", true)}

  ${renderAll(pool)}

  ${renderM3B(groups)}

  ${renderM3C()}
  `;
}

// ========================
// 分類區塊
// ========================
function renderGroup(title, list, key, isAvoid = false) {
  return `
  <div class="card ${isAvoid ? "danger" : ""}">
    <div class="card-header">
      <strong>${title}</strong>（${list.length}）
      <button onclick="toggle('${key}')">點擊展開</button>
      <button onclick="toggle('${key}_detail')">詳細</button>
    </div>

    <div id="${key}" class="hidden">
      ${list.slice(0, 5).map(renderSimple).join("")}
    </div>

    <div id="${key}_detail" class="hidden">
      ${list.map(renderDetail).join("")}
    </div>
  </div>
  `;
}

// ========================
// 簡版（決策用）
// ========================
function renderSimple(s) {
  return `
  <div class="stock-simple">
    <div>
      <b>${s.symbol}</b>｜${s.industry || ""}
    </div>
    <div>
      final ${s.final_score} ｜ base ${s.base_score} ｜ news ${s.news_score || 0}
    </div>
    <div>
      risk ${s.risk_score} ｜ ${s.risk_level}
    </div>
    <div class="reason">
      ${s.reason || ""}
    </div>
  </div>
  `;
}

// ========================
// 詳細版
// ========================
function renderDetail(s) {
  return `
  <div class="stock-detail">
    <div><b>${s.symbol}</b>｜${s.industry}</div>
    <div>final ${s.final_score} ｜ base ${s.base_score} ｜ news ${s.news_score || 0}</div>
    <div>價格 ${s.price || "-"} ｜ 漲跌 ${s.change || "-"}</div>
    <div>PE25 ${s.pe25 || "-"} ｜ PE26 ${s.pe26 || "-"}</div>
    <div>EPS26 ${s.eps26 || "-"}</div>
    <div class="news">
      ${(s.news || []).map(n => `• ${n}`).join("<br>")}
    </div>
  </div>
  `;
}

// ========================
// 全部股票
// ========================
function renderAll(pool) {
  return `
  <div class="card">
    <div class="card-header">
      全部股票（${pool.length}）
      <button onclick="toggle('all_detail')">詳細</button>
    </div>
    <div id="all_detail" class="hidden">
      ${pool.map(renderSimple).join("")}
    </div>
  </div>
  `;
}

// ========================
// M3-B 推薦
// ========================
function renderM3B(groups) {
  const combos = [];

  if (groups.core.length >= 3) {
    combos.push({
      name: "核心組合",
      stocks: groups.core.slice(0, 3)
    });
  }

  if (groups.defensive.length >= 3) {
    combos.push({
      name: "防守組合",
      stocks: groups.defensive.slice(0, 3)
    });
  }

  return `
  <h3>📦 今日 FCN 推薦</h3>
  ${combos.map(c => `
    <div class="combo">
      <b>${c.name}</b>
      <div>${c.stocks.map(s => s.symbol).join(" / ")}</div>
    </div>
  `).join("")}
  `;
}

// ========================
// M3-C
// ========================
function renderM3C() {
  return `
  <h3>🧮 外部 FCN 評分</h3>

  <div class="card">
    <input id="stock1" placeholder="標的1">
    <input id="stock2" placeholder="標的2">
    <input id="stock3" placeholder="標的3">

    <input id="rate" placeholder="利率">
    <input id="tenor" placeholder="天期">

    <button onclick="runScoring()">開始評分</button>

    <div id="scoreResult"></div>
  </div>

  <h3>🔍 股票查詢</h3>
  <input id="searchInput" placeholder="輸入股票">
  <button onclick="searchStock()">查詢</button>

  <div id="searchResult"></div>
  `;
}

// ========================
// 展開控制
// ========================
window.toggle = function(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("hidden");
};

// ========================
// 查詢
// ========================
window.searchStock = function() {
  const val = document.getElementById("searchInput").value.toUpperCase();
  const pool = window.__DATA__.pool || [];

  const s = pool.find(x => x.symbol === val);
  const box = document.getElementById("searchResult");

  if (!s) {
    box.innerHTML = "找不到";
    return;
  }

  box.innerHTML = renderDetail(s);
};

// ========================
// 假評分
// ========================
window.runScoring = function() {
  document.getElementById("scoreResult").innerHTML = `
    總分：+5<br>
    建議：可做
  `;
};
