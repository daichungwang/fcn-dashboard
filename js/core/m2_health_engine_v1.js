// ==========================================
// M2 Health Engine V1.4 FINAL
// 振宇 FCN 系統｜持倉健檢引擎（Snapshot / End / 決策燈號 / 趨勢）
// ==========================================

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round(v, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(toNumber(v) * factor) / factor;
}

function diffDays(startStr, endDate = new Date()) {
  if (!startStr) return 0;
  const start = new Date(startStr);
  if (Number.isNaN(start.getTime())) return 0;
  const ms = endDate.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function fullMonthsHeld(entryTime) {
  const days = diffDays(entryTime);
  return Math.floor(days / 30);
}

function getDecisionSignal(snapshotBalancePct, endNetPct, stockHealth) {
  if (endNetPct < -15 || (stockHealth === "danger" && snapshotBalancePct < -20)) {
    return {
      signal: "red",
      label: "🔴 優先處理",
      note: "到期淨損失偏大，或已跌破 KI 且 Snapshot 壓力過高"
    };
  }

  if (endNetPct < 0 || snapshotBalancePct < -10 || stockHealth === "watch") {
    return {
      signal: "yellow",
      label: "🟡 持續觀察",
      note: "目前仍有壓力，需追蹤後續價格與結構變化"
    };
  }

  return {
    signal: "green",
    label: "🟢 可續抱",
    note: "結構與目前狀態仍可接受"
  };
}

// ------------------------------
// 利息與損益計算
// ------------------------------
function calcInterestAndPL(fcn, stock) {
  const investAmt = toNumber(fcn.amt, 0);
  const annualRatePct = toNumber(fcn.rate, 0);
  const annualRate = annualRatePct / 100;
  const tenorMonths = toNumber(fcn.tenor, 0);

  const entryPrice = toNumber(stock.entry_price, 0);
  const priceNow = toNumber(stock.price_now, 0);
  const strikePct = toNumber(fcn.strike, 0) / 100;

  if (!investAmt || !annualRate || !tenorMonths || !entryPrice || !strikePct) {
    return {
      strike_price: 0,

      snapshot_loss_amt: 0,
      snapshot_loss_pct: 0,
      snapshot_interest_amt: 0,
      snapshot_interest_pct: 0,
      snapshot_balance_amt: 0,
      snapshot_balance_pct: 0,

      end_loss_amt: 0,
      end_loss_pct: 0,
      end_interest_amt: 0,
      end_interest_pct: 0,
      end_balance_amt: 0,
      end_balance_pct: 0,

      months_held_full: 0
    };
  }

  const strikePrice = entryPrice * strikePct;
  const lossPctRaw = strikePrice ? ((priceNow - strikePrice) / strikePrice) * 100 : 0;

  // Loss 最大 = 0；只有跌破 Strike 才計算負損失
  const lossPct = Math.min(lossPctRaw, 0);
  const lossAmt = investAmt * (lossPct / 100);

  // Snapshot 利息：只算滿月
  const monthsHeld = fullMonthsHeld(fcn.entry_time || fcn.created_time);
  const monthlyRate = annualRate / 12;
  const snapshotInterestAmt = investAmt * monthlyRate * monthsHeld;
  const snapshotInterestPct = investAmt ? (snapshotInterestAmt / investAmt) * 100 : 0;

  const snapshotBalanceAmt = lossAmt + snapshotInterestAmt;
  const snapshotBalancePct = investAmt ? (snapshotBalanceAmt / investAmt) * 100 : 0;

  // End 利息：算整段 tenor
  const endInterestAmt = investAmt * annualRate * (tenorMonths / 12);
  const endInterestPct = investAmt ? (endInterestAmt / investAmt) * 100 : 0;

  const endBalanceAmt = lossAmt + endInterestAmt;
  const endBalancePct = investAmt ? (endBalanceAmt / investAmt) * 100 : 0;

  return {
    strike_price: round(strikePrice),

    snapshot_loss_amt: round(lossAmt),
    snapshot_loss_pct: round(lossPct),
    snapshot_interest_amt: round(snapshotInterestAmt),
    snapshot_interest_pct: round(snapshotInterestPct),
    snapshot_balance_amt: round(snapshotBalanceAmt),
    snapshot_balance_pct: round(snapshotBalancePct),

    end_loss_amt: round(lossAmt),
    end_loss_pct: round(lossPct),
    end_interest_amt: round(endInterestAmt),
    end_interest_pct: round(endInterestPct),
    end_balance_amt: round(endBalanceAmt),
    end_balance_pct: round(endBalancePct),

    months_held_full: monthsHeld
  };
}

// ------------------------------
// 單一股票健康計算
// ------------------------------
function calcStockHealth(symbol, fcn, market, poolMap = {}) {
  const runtime = market?.[symbol] || {};

  const entry_price = toNumber(fcn.entry_prices?.[symbol]);
  const price_now = toNumber(runtime.price_now);

  if (!entry_price || !price_now) return null;

  const ki_pct = toNumber(fcn.ki);
  const strike_pct = toNumber(fcn.strike);

  const ki_price = entry_price * ki_pct / 100;
  const strike_price_raw = entry_price * strike_pct / 100;

  const dist_to_ki_pct = ki_price ? ((price_now - ki_price) / ki_price) * 100 : 0;
  const dist_to_strike_pct = strike_price_raw ? ((price_now - strike_price_raw) / strike_price_raw) * 100 : 0;

  let stock_health = "healthy";
  if (price_now < ki_price) stock_health = "danger";
  else if (price_now < strike_price_raw) stock_health = "watch";

  const pnl = calcInterestAndPL(fcn, {
    entry_price,
    price_now
  });

  const decision = getDecisionSignal(
    pnl.snapshot_balance_pct,
    pnl.end_balance_pct,
    stock_health
  );

  return {
    symbol,
    entry_price,
    price_now,
    ki_pct,
    strike_pct,
    ki_price: round(ki_price),
    strike_price: pnl.strike_price,
    dist_to_ki_pct: round(dist_to_ki_pct),
    dist_to_strike_pct: round(dist_to_strike_pct),
    stock_health,

    // baseline / pool info
    category: poolMap[symbol]?.category ?? "",
    sector: poolMap[symbol]?.sector ?? "",
    subsector: poolMap[symbol]?.subsector ?? "",

    // runtime / 分數
    pure_stock: runtime.pure_stock ?? null,
    snapshot_score: runtime.snapshot_score ?? null,
    event_stock: runtime.event_stock ?? null,
    trend: runtime.trend ?? "",
    trend_note: runtime.trend_note ?? "",

    // 趨勢欄位（這次補齊）
    ret_1w: runtime.ret_1w ?? runtime.chg_1w ?? null,
    ret_1m: runtime.ret_1m ?? runtime.chg_1m ?? null,
    ret_3m: runtime.ret_3m ?? runtime.chg_3m ?? null,
    ret_6m: runtime.ret_6m ?? runtime.chg_6m ?? null,
    ret_12m: runtime.ret_12m ?? runtime.chg_12m ?? null,

    decision_signal: decision.signal,
    decision_label: decision.label,
    decision_note: decision.note,

    ...pnl
  };
}

// ------------------------------
// 股票排序（最危險在前）
// ------------------------------
function sortStocks(stocks) {
  const order = { danger: 0, watch: 1, healthy: 2 };

  return [...stocks].sort((a, b) => {
    if (order[a.stock_health] !== order[b.stock_health]) {
      return order[a.stock_health] - order[b.stock_health];
    }
    return a.dist_to_ki_pct - b.dist_to_ki_pct;
  });
}

// ------------------------------
// FCN 層級計算
// ------------------------------
function calcFCN(fcn, market, poolMap = {}) {
  const stocks = (fcn.basket || [])
    .map(symbol => calcStockHealth(symbol, fcn, market, poolMap))
    .filter(Boolean);

  if (!stocks.length) return null;

  const sorted = sortStocks(stocks);

  const danger_count = sorted.filter(s => s.stock_health === "danger").length;
  const watch_count = sorted.filter(s => s.stock_health === "watch").length;
  const healthy_count = sorted.filter(s => s.stock_health === "healthy").length;

  let fcn_health = "healthy";
  if (danger_count > 0) fcn_health = "danger";
  else if (watch_count > 0) fcn_health = "watch";

  const worst = sorted[0];
  const decision = getDecisionSignal(
    worst.snapshot_balance_pct,
    worst.end_balance_pct,
    worst.stock_health
  );

  return {
    ...fcn,
    fcn_health,
    worst_of: worst.symbol,
    danger_count,
    watch_count,
    healthy_count,
    worst_dist_to_ki_pct: worst.dist_to_ki_pct,
    worst_dist_to_strike_pct: worst.dist_to_strike_pct,

    // Level 1 card - Snapshot / End
    snapshot_loss_amt: worst.snapshot_loss_amt,
    snapshot_loss_pct: worst.snapshot_loss_pct,
    snapshot_interest_amt: worst.snapshot_interest_amt,
    snapshot_interest_pct: worst.snapshot_interest_pct,
    snapshot_balance_amt: worst.snapshot_balance_amt,
    snapshot_balance_pct: worst.snapshot_balance_pct,

    end_loss_amt: worst.end_loss_amt,
    end_loss_pct: worst.end_loss_pct,
    end_interest_amt: worst.end_interest_amt,
    end_interest_pct: worst.end_interest_pct,
    end_balance_amt: worst.end_balance_amt,
    end_balance_pct: worst.end_balance_pct,

    months_held_full: worst.months_held_full,

    // decision
    decision_signal: decision.signal,
    decision_label: decision.label,
    decision_note: decision.note,

    stocks: sorted
  };
}

// ------------------------------
// 股票聚合（5.1 / 5.2 / 5.3）
// ------------------------------
function buildStockAggregation(fcns) {
  const map = {};

  fcns.forEach(f => {
    (f.stocks || []).forEach(s => {
      if (!map[s.symbol]) {
        map[s.symbol] = {
          symbol: s.symbol,
          category: s.category,
          sector: s.sector,
          subsector: s.subsector,
          pure_stock: s.pure_stock,
          event_stock: s.event_stock,
          count: 0,
          amt: 0,
          danger: 0,
          watch: 0,
          healthy: 0,
          fcns: [],
          details: []
        };
      }

      const obj = map[s.symbol];
      obj.count += 1;
      obj.amt += toNumber(f.amt);
      obj.fcns.push(f.fcn_id);
      obj.details.push({
        fcn_id: f.fcn_id,
        fcn: f,
        stock: s
      });

      if (s.stock_health === "danger") obj.danger += 1;
      else if (s.stock_health === "watch") obj.watch += 1;
      else obj.healthy += 1;
    });
  });

  return Object.values(map).sort((a, b) => b.amt - a.amt);
}

// ------------------------------
// 主入口
// ------------------------------
export function runM2HealthEngine({ fcnPool = [], marketRuntime = {}, pool30 = [] }) {
  const poolMap = {};
  (pool30 || []).forEach(p => {
    poolMap[p.symbol] = p;
  });

  const active = (fcnPool || []).filter(f => f.status === "active");

  const fcns = active
    .map(f => calcFCN(f, marketRuntime, poolMap))
    .filter(Boolean);

  const danger = fcns.filter(f => f.fcn_health === "danger");
  const watch = fcns.filter(f => f.fcn_health === "watch");
  const healthy = fcns.filter(f => f.fcn_health === "healthy");

  const stockMap = buildStockAggregation(fcns);

  return {
    fcns,
    danger,
    watch,
    healthy,
    stockMap,
    total: fcns.length,
    total_amt: round(fcns.reduce((s, f) => s + toNumber(f.amt), 0))
  };
}

// ------------------------------
// FCN 結構資訊
// ------------------------------
export function buildFCNMeta(f) {
  return `
    <div style="font-size:13px; color:#444; margin-bottom:10px; line-height:1.6;">
      <b>📦 結構：</b>
      ${f.tenor ?? "-"}M｜
      ${f.rate ?? "-"}%｜
      KI ${f.ki ?? "-"}%｜
      Strike ${f.strike ?? "-"}%｜
      Autocall ${f.autocall ?? "-"}%｜
      ${f.eki ? "🟢 EKI" : "⚪ AKI"}<br>
      建立：${f.created_time || "-"}｜
      進場：${f.entry_time || "-"}
    </div>
  `;
}

// ------------------------------
// 健康區防爆
// ------------------------------
export function limitDisplay(arr, type, showAllHealthy = false) {
  if (type === "healthy" && !showAllHealthy) {
    return arr.slice(0, 5);
  }
  return arr;
}
