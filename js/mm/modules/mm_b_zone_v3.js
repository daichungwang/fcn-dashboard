// ==========================================
// MM B ZONE v4 (Portfolio Decision only)
// Deprecated duplicate B1/B2/B5 blocks are hidden.
// Detail summaries are rendered by dedicated modules below.
// ==========================================

window.renderBZone = function(data) {
  const el = document.getElementById("b-zone");
  if (!el) return;

  const fcnPool = data?.fcn_pool || [];
  const b1 = computeB1(fcnPool);
  const b2 = computeB2(fcnPool);
  const decision = computeDecision(b1, b2);

  el.innerHTML = `${renderDecision(decision)}`;
};

function computeB1(pool) {
  let total = 0;
  let maturity = 0, danger = 0, watch = 0, healthy = 0;
  let maturity_cnt = 0, danger_cnt = 0, watch_cnt = 0, healthy_cnt = 0;
  const broker = {};
  const alerts = [];

  pool.forEach(f => {
    const amt = f.amount || 0;
    total += amt;
    const b = getBroker(f);
    if (!broker[b]) broker[b] = { total: 0, count: 0, maturity: 0, danger: 0, watch: 0, healthy: 0 };
    broker[b].total += amt;
    broker[b].count++;
    if (f.status === "maturity") { maturity += amt; maturity_cnt++; broker[b].maturity += amt; alerts.push(`📅 到期：${fmt(amt)}`); }
    else if (f.status === "danger") { danger += amt; danger_cnt++; broker[b].danger += amt; alerts.push(`⚠️ ${f.worst_of || "標的"} 破線`); }
    else if (f.status === "watch") { watch += amt; watch_cnt++; broker[b].watch += amt; }
    else { healthy += amt; healthy_cnt++; broker[b].healthy += amt; }
  });

  return { total, maturity, danger, watch, healthy, maturity_cnt, danger_cnt, watch_cnt, healthy_cnt, broker, alerts };
}

function computeB2(pool) {
  const total_capital = 1200000;
  const invested = pool.reduce((s, f) => s + (f.amount || 0), 0);
  const available = total_capital - invested;
  const ratio = invested / total_capital;
  return { total_capital, invested, available, ratio };
}

function computeDecision(b1, b2) {
  let action = "正常配置";
  let level = "標準";
  let color = "green";
  if (b2.ratio > 0.9) { action = "暫停加碼"; level = "保守"; color = "red"; }
  else if (b2.ratio > 0.7) { action = "降低節奏"; level = "標準"; color = "orange"; }
  else if (b2.ratio < 0.4) { action = "可積極布局"; level = "積極"; color = "green"; }
  return { action, level, color };
}

function renderDecision(d) {
  return `
  <div class="b-block" style="border:2px solid #ddd;padding:12px;border-radius:12px;">
    <div style="font-weight:900;font-size:16px;">Portfolio Decision</div>
    <div>👉 ${d.action}</div>
    <div>配置等級：${d.level}</div>
  </div>`;
}

function fmt(x){ return (x||0).toLocaleString(); }
function getBroker(row){
  const raw = String(row?.broker || row?.bank || "").toLowerCase();
  if(raw.includes("fubon")) return "富邦";
  if(raw.includes("sinopac")) return "永豐";
  return "其他";
}
