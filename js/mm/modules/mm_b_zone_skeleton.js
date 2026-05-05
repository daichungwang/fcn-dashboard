// ==========================================
// MM B ZONE v2 (Portfolio Decision Engine)
// ==========================================

export function renderBZone(data) {
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
}

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
      alerts.push(`📅 到期壓力：${fmt(amt)}`);
    }
  });

  return {
    total,
    danger,
    watch,
    maturity,
    alerts
  };
}

// ==========================================
// B2 — 資金配置 + Allocation
// ==========================================

function computeB2(pool) {
  const total_capital = 1200000;

  const invested = pool.reduce((s, f) => s + (f.amount || 0), 0);
  const available = total_capital - invested;

  const ratio = invested / total_capital;

  return {
    total_capital,
    invested,
    available,
    ratio
  };
}

// ==========================================
// 🎯 核心：Portfolio Decision
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

  return {
    action,
    level,
    color
  };
}

// ==========================================
// UI — Portfolio Decision（最重要）
// ==========================================

function renderPortfolioDecision(d) {
  return `
  <div class="b-decision ${d.color}">
    <div class="title">Portfolio Decision</div>

    <div class="main">
      👉 ${d.action}
    </div>

    <div class="sub">
      配置等級：${d.level}
    </div>
  </div>
  `;
}

// ==========================================
// UI — B2（資金）
// ==========================================

function renderB2(d, decision) {
  return `
  <div class="b-block">
    <div class="title">B2 資金配置</div>

    <div>總資金：USD ${fmt(d.total_capital)}</div>
    <div>已投FCN：USD ${fmt(d.invested)}</div>
    <div>可用資金：USD ${fmt(d.available)}</div>

    <div class="bar">
      <div style="width:${d.ratio * 100}%"></div>
    </div>

    <div class="hint">
      投資水位：${(d.ratio * 100).toFixed(1)}%
    </div>

    <div class="recommend">
      👉 建議：${decision.action}
    </div>
  </div>
  `;
}

// ==========================================
// UI — B1（風險）
// ==========================================

function renderB1(d) {
  return `
  <div class="b-block">
    <div class="title">B1 M2 / FCN 全貌</div>

    <div>總曝險：USD ${fmt(d.total)}</div>

    <div>破線：${fmt(d.danger)}</div>
    <div>追蹤：${fmt(d.watch)}</div>
    <div>到期：${fmt(d.maturity)}</div>

    <div class="alerts">
      ${d.alerts.map(a => `<div>${a}</div>`).join("")}
    </div>
  </div>
  `;
}

// ==========================================
// UI — B5（M1品質）
// ==========================================

function renderB5(s) {
  return `
  <div class="b-block">
    <div class="title">B5 M1 / 股票品質</div>

    <div>Coverage：${s.profile_count || 0} / ${s.total || 0}</div>
    <div>Candidate：${s.candidate_count || 0}</div>

    <div>M1 Avg：${fmt(s.avg_m1_score)}</div>

    <div>
      CC：
      A ${s.cc_rank_counts?.A || 0}｜
      C ${s.cc_rank_counts?.C || 0}
    </div>
  </div>
  `;
}

// ==========================================
// UTIL
// ==========================================

function fmt(x) {
  return (x || 0).toLocaleString();
}
