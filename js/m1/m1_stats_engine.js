// ==========================================
// M1 Stats Engine（正式版）
// 拆出統計 / 分布 / pool30 rule
// ==========================================

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

// ---------- basic ----------
function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr) {
  if (arr.length <= 1) return 0;
  const m = avg(arr);
  const variance =
    arr.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);

  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

// ---------- stats ----------
function buildStats(arr) {
  const nums = arr.filter(Number.isFinite);

  if (!nums.length) {
    return {
      count: 0,
      mean: 0,
      std: 0,
      p25: 0,
      p50: 0,
      p75: 0,
      cv: 0
    };
  }

  const meanVal = avg(nums);
  const stdVal = std(nums);

  return {
    count: nums.length,
    mean: +meanVal.toFixed(2),
    std: +stdVal.toFixed(2),
    cv: meanVal !== 0 ? +(stdVal / meanVal).toFixed(3) : 0,
    p25: +percentile(nums, 25).toFixed(2),
    p50: +percentile(nums, 50).toFixed(2),
    p75: +percentile(nums, 75).toFixed(2)
  };
}

// ---------- group ----------
function groupByCategory(rows) {
  const out = {
    core: [],
    growth: [],
    income: [],
    defensive: [],
    speculative: []
  };

  rows.forEach(r => {
    if (!out[r.category]) out[r.category] = [];
    out[r.category].push(r);
  });

  return out;
}

// ---------- category stats ----------
export function buildCategoryStats(rows) {
  const groups = groupByCategory(rows);
  const result = {};

  Object.keys(groups).forEach(cat => {
    result[cat] = buildStats(
      groups[cat].map(x => n(x.M1_score))
    );
  });

  return result;
}

// ---------- strict rule ----------
function classifyStrictness(cv) {
  if (cv <= 0.12) return "strict";
  if (cv > 0.20) return "loose";
  return "medium";
}

// ---------- pool30 rule ----------
export function buildPool30Rules(rows) {
  const stats = buildCategoryStats(rows);

  const rules = {};

  Object.keys(stats).forEach(cat => {
    const s = stats[cat];

    rules[cat] = {
      strictness: classifyStrictness(s.cv),
      strong: s.p75,
      pass: s.p50,
      watch: s.p25
    };
  });

  return rules;
}

// ---------- overall ----------
export function buildOverallStats(rows) {
  return buildStats(rows.map(x => n(x.M1_score)));
}
