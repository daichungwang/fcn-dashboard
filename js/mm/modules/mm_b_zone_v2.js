// ==========================================
// MM B ZONE v2 (NON-MODULE VERSION)
// ==========================================

window.renderBZone = function(data) {
  const el = document.getElementById("b-zone");
  if (!el) return;

  const fcnPool = data?.fcn_pool || [];
  const m1 = data?.m1_scores || {};

  const b1 = computeB1(fcnPool);
  const b2 = computeB2(fcnPool);
  const b5 = m1.summary || {};

  const decision = computePortfolioDecision(b1, b2);

  el.innerHTML = `
    ${renderPortfolioDecision(decision)}
    ${renderB2(b2, decision)}
    ${renderB1(b1)}
    ${renderB5(b5)}
  `;
};

// ==========================================
// B1 — M2 全貌 + Risk Alert
// ==========================================

function computeB1(pool) {
  let total = 0;
  let danger = 0;
  let watch = 0;
  let maturity = 0;

  const alerts = [];

  pool.forEach(f => {
    const amt = f.amount || 0;
    total += amt;

    if (f.status === "danger") {
      danger += amt;
      alerts.push(`⚠️ ${f.worst_of || "Unknown"} 接近破線`);
    }

    if (f.status === "watch") {
      watch += amt;
    }

    if (f.status === "maturity") {
      maturity += amt;
      alerts.push(`📅 到期壓力：USD ${fmt(amt)}`);
    }
  });

  return { total, danger, watch, maturity, alerts };
}

// ==========================================
// B2 — 資金配置
// ==========================================

function computeB2(pool) {
  const total_capital = 1200000;
  const invested = pool.reduce((s, f) => s + (f.amount || 0), 0);
  const available = total_capital - invested;
  const ratio = invested / total_capital;

  return { total_capital, invested, available, ratio };
}

// ==========================================
// Portfolio Decision
// ==========================================

function computePortfolioDecision(b1, b2) {
  let action = "正常配置";
  let level = "標準";
  let color = "green";

  if (b2.ratio > 0.9) {
    action = "暫停加碼";
    level = "保守";
    color = "red";
  } else if (b2.ratio > 0.7) {
    action = "降低節奏";
    level = "標準";
    color = "orange";
  } else if (b2.ratio < 0.4) {
    action = "可積極布局";
    level = "積極";
    color = "green";
  }

  return { action, level, color };
}

// ==========================================
// UI
// ==========================================

function renderPortfolioDecision(d) {
  return `
  <div class="b-block" style="border:2px solid #ddd;padding:12px;border-radius:12px;">
    <div style="font-weight:900;font-size:16px;margin-bottom:6px;">Portfolio Decision</div>
    <div>👉 ${d.action}</div>
    <div>配置等級：${d.level}</div>
  </div>
  `;
}

function renderB2(d, decision) {
  return `
  <div class="b-block">
    <h3>B2 資金配置</h3>
    <div>總資金：USD ${fmt(d.total_capital)}</div>
    <div>已投FCN：USD ${fmt(d.invested)}</div>
    <div>可用資金：USD ${fmt(d.available)}</div>
    <div>投資水位：${(d.ratio * 100).toFixed(1)}%</div>
    <div>👉 建議：${decision.action}</div>
  </div>
  `;
}

function renderB1(d) {
  return `
  <div class="b-block">
    <h3>B1 M2 / FCN 全貌</h3>
    <div>總曝險：USD ${fmt(d.total)}</div>
    <div>破線：USD ${fmt(d.danger)}</div>
    <div>追蹤：USD ${fmt(d.watch)}</div>
    <div>到期：USD ${fmt(d.maturity)}</div>
    <div>${d.alerts.map(a => `<div>${a}</div>`).join("")}</div>
  </div>
  `;
}

function renderB5(s) {
  return `
  <div class="b-block">
    <h3>B5 M1 / 股票品質</h3>
    <div>Coverage：${s.profile_count || 0} / ${s.total || 0}</div>
    <div>Candidate：${s.candidate_count || 0}</div>
    <div>M1 Avg：${fmt(s.avg_m1_score)}</div>
  </div>
  `;
}

// ==========================================
// UTIL
// ==========================================

function fmt(x) {
  return (x || 0).toLocaleString();
}
