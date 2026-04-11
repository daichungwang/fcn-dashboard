<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<title>M7 Basket Dashboard</title>

<style>
body {
  font-family: Arial;
  background: #f5f7fb;
  padding: 20px;
}

h1 { margin-bottom: 20px; }

.section {
  margin-bottom: 30px;
}

.card {
  background: white;
  padding: 14px;
  margin: 10px 0;
  border-radius: 12px;
  box-shadow: 0 3px 8px rgba(0,0,0,0.06);
  cursor: pointer;
}

.header {
  display: flex;
  justify-content: space-between;
}

.badge {
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 12px;
  margin-left: 6px;
}

.green { background:#e6f7ec; color:#1a7f37; }
.blue { background:#e6f0ff; color:#2455c3; }
.gray { background:#eee; color:#666; }

.highlight-aggressive { background:#ffe6e6; color:#c0392b; }
.highlight-neutral { background:#fff4e6; color:#d68910; }
.highlight-defensive { background:#eafaf1; color:#1e8449; }

.detail {
  display:none;
  margin-top:10px;
  font-size:13px;
  color:#555;
}
</style>
</head>

<body>

<h1>M7 Basket Dashboard</h1>

<div class="section">
  <h2>🔥 Today Highlight</h2>
  <div id="highlight"></div>
</div>

<div class="section">
  <h2>📊 Simulation Pool</h2>
  <div id="simulation"></div>
</div>

<div class="section">
  <h2>👀 Watch Pool</h2>
  <div id="watch"></div>
</div>

<script type="module">

// ============================
// IMPORT ENGINE
// ============================
import { runM7Basket } from "/fcn-dashboard/js/m8/basket_engine.js";

// ============================
// INIT
// ============================
async function init() {

  const res = await fetch("./data/m7/m7_new_stock_today.json");
  const m7 = await res.json();

  const result = runM7Basket(m7);

  render("highlight", result.highlight, true);
  render("simulation", result.simulation);
  render("watch", result.watch);
}

// ============================
// RENDER
// ============================
function render(id, list, isHighlight=false) {

  const el = document.getElementById(id);

  if (!list || list.length === 0) {
    el.innerHTML = "<p>（無資料）</p>";
    return;
  }

  el.innerHTML = list.map(s => {

    const tierColor =
      s.tier === "優先" ? "green" :
      s.tier === "穩健" ? "blue" :
      "gray";

    const highlightColor =
      s.type === "積極" ? "highlight-aggressive" :
      s.type === "理性" ? "highlight-neutral" :
      "highlight-defensive";

    return `
    <div class="card" onclick="toggle(this)">
      
      <div class="header">
        <div>
          <b>${s.symbol}</b> ${s.name || ""}
          <span class="badge ${tierColor}">${s.tier || ""}</span>
          ${isHighlight ? `<span class="badge ${highlightColor}">${s.type}</span>` : ""}
        </div>

        <div>${s.score?.toFixed(2)}</div>
      </div>

      <div class="detail">
        類別：${s.category}<br>
        valuationRaw：${s.raw?.valuation_raw}<br>
        trend：${s.raw?.trend_score}<br>
        snapshot：${s.raw?.snapshot_score}<br>
        growth：${s.raw?.growth_score}
      </div>

    </div>
    `;

  }).join("");
}

// ============================
// TOGGLE
// ============================
window.toggle = function(el) {
  const d = el.querySelector(".detail");
  d.style.display = d.style.display === "block" ? "none" : "block";
}

// ============================
init();
// ============================

</script>

</body>
</html>
