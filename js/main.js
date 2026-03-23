// ==========================
// 振宇 FCN 系統 V7.5（乾淨版）
// ==========================

let poolData = [];

// ===== 載入資料 =====
async function loadPoolData() {
  try {
    const res = await fetch("./data/pool.json");
    poolData = await res.json();

    renderM3A(poolData);
  } catch (e) {
    console.error("load error", e);
  }
}

// ==========================
// M3-A（完全重寫）
// ==========================

function renderM3A(data = []) {
  const container = document.getElementById("m3a-container");
  if (!container) return;

  container.innerHTML = "";

  data.forEach(stock => {

    const card = document.createElement("div");
    card.className = "m3-card";

    // ===== Summary =====
    const summary = document.createElement("div");
    summary.className = "card-summary";

    summary.innerHTML = `
      <div style="font-size:18px;font-weight:bold;">
        ${stock.symbol} ｜ ${stock.name}
      </div>
      <div>Baseline：${stock.baseline ?? "-"}</div>
      <div>Pure：${stock.pure ?? "-"}</div>
      <div style="color:${(stock.delta_pure ?? 0)>=0?'green':'red'}">
        ΔPure：${stock.delta_pure ?? 0}
      </div>
    `;

    // ===== Button =====
    const btn = document.createElement("button");
    btn.className = "toggle-btn";
    btn.textContent = "展開";

    // ===== Body =====
    const body = document.createElement("div");
    body.className = "card-body";
    body.style.display = "none";

    body.innerHTML = `
      <div>價格：${stock.price ?? "--"}</div>
      <div>Ret：${stock.ret_1m ?? 0} / ${stock.ret_6m ?? 0} / ${stock.ret_12m ?? 0}</div>
      <div>Vol：${stock.vol_1m ?? 0} / ${stock.vol_6m ?? 0} / ${stock.vol_12m ?? 0}</div>
      <div>Vol Score：${stock.vol_score ?? 0}</div>
      <div>FCN：${stock.fcn_pure ?? "-"} / ${stock.fcn_event ?? "-"}</div>
    `;

    // ===== Toggle =====
    btn.onclick = () => {
      const open = body.style.display === "block";
      body.style.display = open ? "none" : "block";
      btn.textContent = open ? "展開" : "收合";
    };

    // ===== 組裝 =====
    card.appendChild(summary);
    card.appendChild(btn);
    card.appendChild(body);

    container.appendChild(card);
  });
}

// ==========================
// 全部展開 / 收合（唯一控制點）
// ==========================

function expandAll() {
  document.querySelectorAll(".card-body").forEach(el => {
    el.style.display = "block";
  });
  document.querySelectorAll(".toggle-btn").forEach(btn => {
    btn.textContent = "收合";
  });
}

function collapseAll() {
  document.querySelectorAll(".card-body").forEach(el => {
    el.style.display = "none";
  });
  document.querySelectorAll(".toggle-btn").forEach(btn => {
    btn.textContent = "展開";
  });
}

// ==========================
// 初始化
// ==========================

document.addEventListener("DOMContentLoaded", () => {
  loadPoolData();
});
