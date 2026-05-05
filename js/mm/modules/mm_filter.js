// ==========================================
// MM FILTER ENGINE v2 (SANDBOX)
// ==========================================

window.runMMFilter = function(input) {

  const stocks = input?.stocks || [];

  // ================================
  // 1. VOL CALC
  // ================================
  stocks.forEach(s => {
    s.vol_score = calcVolScore(s);
    s.vol_band = getVolBand(s.vol_score);
  });

  // ================================
  // 2. POOL CLASSIFICATION
  // ================================
  const pools = {
    highlight: [],
    watch: [],
    simulation: [],
    reject: []
  };

  stocks.forEach(s => {

    if (!s.allow_fcn || s.reject_reason) {
      pools.reject.push(s);
      return;
    }

    // simulation pool（最寬）
    pools.simulation.push(s);

    // highlight 判斷
    if (
      s.priority_score >= 75 &&
      s.vol_band !== "extreme" &&
      (s.m2_util ?? 0) < 0.8 &&
      s.m6_timing !== "hot" &&
      (s.amt_signal ?? 0) > 0.6
    ) {
      pools.highlight.push(s);
    } else {
      pools.watch.push(s);
    }

  });

  // ================================
  // 3. SORT
  // ================================
  const sortFn = (a, b) => (b.priority_score || 0) - (a.priority_score || 0);

  Object.keys(pools).forEach(k => {
    pools[k].sort(sortFn);
  });

  // ================================
  // 4. CATEGORY GROUP
  // ================================
  const categories = ["core","growth","income","defensive","speculative"];

  const category_map = {};
  categories.forEach(c => category_map[c] = []);

  stocks.forEach(s => {
    if (category_map[s.category]) {
      category_map[s.category].push(s);
    }
  });

  // ================================
  // 5. BASKET BUILD
  // ================================
  const baskets = [];

  // A: Priority Top
  const top3 = pools.highlight.slice(0, 3);
  if (top3.length >= 2) {
    baskets.push(buildBasket("PRIORITY_TOP", top3));
  }

  // B: Category Balanced
  const balanced = [];
  categories.forEach(c => {
    if (category_map[c]?.length > 0) {
      balanced.push(category_map[c][0]);
    }
  });
  if (balanced.length >= 3) {
    baskets.push(buildBasket("CATEGORY_BALANCED", balanced.slice(0,5)));
  }

  // C: Hybrid
  const hybrid = [
    ...(pools.highlight.slice(0,2)),
    ...(pools.watch.slice(0,2))
  ];
  if (hybrid.length >= 3) {
    baskets.push(buildBasket("HYBRID", hybrid.slice(0,5)));
  }

  // ================================
  // 6. ALLOCATION v0
  // ================================
  let total_capacity = Math.max(...stocks.map(s => s.max_addable_amt || 0), 0);
  let remaining = total_capacity;

  const allocation = [];

  baskets.forEach((b, idx) => {

    if (remaining <= 0) return;

    const suggested = Math.min(b.basket_cap, remaining);

    allocation.push({
      basket_id: b.id,
      basket_cap: b.basket_cap,
      alloc: suggested,
      remaining_after: remaining - suggested
    });

    remaining -= suggested;
  });

  // ================================
  // 7. SUMMARY
  // ================================
  const summary = {
    total_stocks: stocks.length,
    highlight: pools.highlight.length,
    watch: pools.watch.length,
    simulation: pools.simulation.length,
    reject: pools.reject.length,
    total_capacity,
    allocated: total_capacity - remaining,
    remaining
  };

  return {
    summary,
    pools,
    category_map,
    baskets,
    allocation,
    raw: stocks
  };
};


// ==========================================
// VOL CALC
// ==========================================

function calcVolScore(s) {
  const d1 = Math.abs(num(s.ret_1d));
  const d2 = Math.abs(num(s.ret_2d));
  const w1 = Math.abs(num(s.ret_1w));
  const w2 = Math.abs(num(s.ret_2w));
  const ma = Math.abs(num(s.ma_slope));

  return (
    0.05 * d1 +
    0.10 * d2 +
    0.40 * w1 +
    0.35 * ma +
    0.10 * w2
  );
}

function getVolBand(v) {
  if (v < 3) return "low";
  if (v < 7) return "mid";
  if (v < 12) return "high";
  return "extreme";
}


// ==========================================
// BASKET BUILDER
// ==========================================

function buildBasket(id, stocks) {

  const caps = stocks.map(s => s.max_addable_amt || 0);
  const basket_cap = Math.min(...caps);

  return {
    id,
    symbols: stocks.map(s => s.symbol),
    basket_cap,
    avg_score: avg(stocks.map(s => s.priority_score)),
    avg_vol: avg(stocks.map(s => s.vol_score)),
    stocks
  };
}


// ==========================================
// UTIL
// ==========================================

function num(x) {
  return Number(x ?? 0);
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a,b)=>a+b,0) / arr.length;
}
