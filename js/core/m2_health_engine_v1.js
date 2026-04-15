// ==========================================
// M2 Health Engine V1.6 FINAL
// 振宇 FCN 系統｜持倉健檢引擎
// Snapshot / End / 決策燈號 / 趨勢 / 提早出場 / 到期專區 / KI記憶
// ==========================================

const M2_EARLY_EXIT_STATE_KEY = "m2_early_exit_state_v1";
const M2_KNOCKIN_STATE_KEY = "m2_knockin_state_v1";

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
// 日期工具
// ------------------------------
function toDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value) {
  const d = toDate(value);
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

function addDays(dateValue, days) {
  const d = toDate(dateValue);
  if (!d) return null;
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function addMonthsSafe(dateValue, months) {
  const d = toDate(dateValue);
  if (!d) return null;

  const x = new Date(d);
  const originalDay = x.getDate();
  x.setMonth(x.getMonth() + months);

  if (x.getDate() < originalDay) {
    x.setDate(0);
  }
  return x;
}

function daysBetween(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  if (!da || !db) return 0;
  return Math.max(0, Math.floor((db - da) / (1000 * 60 * 60 * 24)));
}

function getFCNId(fcn) {
  return String(fcn.fcn_id || "").trim();
}

function getEntryTime(fcn) {
  return fcn.entry_time || fcn.created_time || fcn.date || "";
}

function getMaturityDate(fcn) {
  if (fcn.exit_time) {
    const d = toDate(fcn.exit_time);
    if (d) return d;
  }

  const entry = getEntryTime(fcn);
  const tenor = toNumber(fcn.tenor, 0);
  if (!entry || !tenor) return null;

  return addMonthsSafe(entry, tenor);
}

// ------------------------------
// localStorage state
// ------------------------------
function readLocalJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function readEarlyExitState() {
  return readLocalJson(M2_EARLY_EXIT_STATE_KEY);
}

function writeEarlyExitState(state) {
  writeLocalJson(M2_EARLY_EXIT_STATE_KEY, state);
}

function readKnockInState() {
  return readLocalJson(M2_KNOCKIN_STATE_KEY);
}

function writeKnockInState(state) {
  writeLocalJson(M2_KNOCKIN_STATE_KEY, state);
}

// ------------------------------
// 提早出場
// entry + 37天後開始
// 任一檔現價 > 進場價 即永久 remark
// 全 basket 都 remark → early exit ready
// ------------------------------
function calcEarlyExitInterest(fcn, endDateStr) {
  const investAmt = toNumber(fcn.amt, 0);
  const annualRatePct = toNumber(fcn.rate, 0);
  const entryTime = getEntryTime(fcn);

  if (!investAmt || !annualRatePct || !entryTime || !endDateStr) {
    return {
      early_exit_days_held: 0,
      early_exit_interest_amt: 0,
      early_exit_interest_pct: 0
    };
  }

  const heldDays = daysBetween(entryTime, endDateStr);
  const interestAmt = investAmt * (annualRatePct / 100) * (heldDays / 365);
  const interestPct = investAmt ? (interestAmt / investAmt) * 100 : 0;

  return {
    early_exit_days_held: heldDays,
    early_exit_interest_amt: round(interestAmt),
    early_exit_interest_pct: round(interestPct)
  };
}

function calcEarlyExit(fcn, marketRuntime = {}, state = {}) {
  const fcnId = getFCNId(fcn);
  const basket = Array.isArray(fcn.basket) ? fcn.basket : [];
  const entryTime = getEntryTime(fcn);
  const checkStartDate = addDays(entryTime, 37);
  const maturityDate = getMaturityDate(fcn);
  const now = new Date();

  const eligible = !!checkStartDate && now >= checkStartDate;
  const beforeMaturity = maturityDate ? now < maturityDate : true;

  if (!state[fcnId]) state[fcnId] = {};
  const bucket = state[fcnId];

  const stocks = basket.map(symbol => {
    if (!bucket[symbol]) {
      bucket[symbol] = {
        met: false,
        remark_date: ""
      };
    }

    const entryPrice = toNumber(fcn.entry_prices?.[symbol], 0);
    const runtime = marketRuntime?.[symbol] || {};
    const priceNow = toNumber(runtime.price_now, 0);

    const prevMet = !!bucket[symbol].met;
    const prevDate = bucket[symbol].remark_date || "";

    const canRemarkToday =
      eligible &&
      entryPrice > 0 &&
      priceNow > 0 &&
      priceNow > entryPrice;

    const met = prevMet || canRemarkToday;
    const remarkDate = prevDate || (canRemarkToday ? formatDate(now) : "");

    if (met) {
      bucket[symbol].met = true;
      bucket[symbol].remark_date = remarkDate;
    }

    return {
      symbol,
      entry_price: round(entryPrice),
      price_now: round(priceNow),
      met,
      remark_date: remarkDate,
      remark_label: met ? "滿足出場條件" : "未滿足"
    };
  });

  const remarkCount = stocks.filter(s => s.met).length;
  const totalCount = stocks.length;
  const allMet = totalCount > 0 && remarkCount === totalCount;
  const ready = eligible && beforeMaturity && allMet;

  const remarkDates = stocks
    .map(s => s.remark_date)
    .filter(Boolean)
    .sort();

  const lastRemarkDate = remarkDates.length ? remarkDates[remarkDates.length - 1] : "";
  const interestInfo = ready
    ? calcEarlyExitInterest(fcn, lastRemarkDate)
    : calcEarlyExitInterest(fcn, formatDate(now));

  return {
    early_exit_eligible: eligible,
    early_exit_before_maturity: beforeMaturity,
    early_exit_ready: ready,
    early_exit_check_start_date: formatDate(checkStartDate),
    early_exit_maturity_date: formatDate(maturityDate),
    early_exit_remark_count: remarkCount,
    early_exit_total_count: totalCount,
    early_exit_last_remark_date: lastRemarkDate,
    early_exit_stocks: stocks,
    ...interestInfo
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

  const lossPct = Math.min(lossPctRaw, 0);
  const lossAmt = investAmt * (lossPct / 100);

  const monthsHeld = fullMonthsHeld(fcn.entry_time || fcn.created_time);
  const monthlyRate = annualRate / 12;
  const snapshotInterestAmt = investAmt * monthlyRate * monthsHeld;
  const snapshotInterestPct = investAmt ? (snapshotInterestAmt / investAmt) * 100 : 0;

  const snapshotBalanceAmt = lossAmt + snapshotInterestAmt;
  const snapshotBalancePct = investAmt ? (snapshotBalanceAmt / investAmt) * 100 : 0;

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

    category: poolMap[symbol]?.category ?? "",
    sector: poolMap[symbol]?.sector ?? "",
    subsector: poolMap[symbol]?.subsector ?? "",

    pure_stock: runtime.pure_stock ?? null,
    snapshot_score: runtime.snapshot_score ?? null,
    event_stock: runtime.event_stock ?? null,
    trend: runtime.trend ?? "",
    trend_note: runtime.trend_note ?? "",

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
// AKI / DACN：KI 記憶
// EKI：不記憶
// ------------------------------
function updateKnockInState(fcn, stocks, knockInState) {
  const fcnId = getFCNId(fcn);
  if (!fcnId) return { has_knock_in: false, knock_in_date: "" };

  const isEKI = !!fcn.eki;

  if (isEKI) {
    return {
      has_knock_in: false,
      knock_in_date: ""
    };
  }

  if (!knockInState[fcnId]) {
    knockInState[fcnId] = {
      has_knock_in: false,
      knock_in_date: ""
    };
  }

  const bucket = knockInState[fcnId];
  const today = formatDate(new Date());

  const knockedToday = (stocks || []).some(s => toNumber(s.price_now) < toNumber(s.ki_price));

  if (knockedToday) {
    bucket.has_knock_in = true;
    bucket.knock_in_date = bucket.knock_in_date || today;
  }

  return {
    has_knock_in: !!bucket.has_knock_in,
    knock_in_date: bucket.knock_in_date || ""
  };
}

// ------------------------------
// 到期專區
// 提早出場 / 滿期安全 / 接股可能
// 到期前10天不管什麼狀態都進專區
// AKI/DACN：到期看 strike，且曾破 KI 不可回健康
// EKI：到期看 KI，不記憶 KI
// ------------------------------
function calcMaturityZone(fcn, stocks, earlyExit) {
  const now = new Date();
  const maturityDate = getMaturityDate(fcn);
  const days_to_maturity = maturityDate ? daysBetween(now, maturityDate) : 9999;
  const in_maturity_window = days_to_maturity <= 10;

  const isEKI = !!fcn.eki;

  const all_above_strike = (stocks || []).length > 0 && stocks.every(s => toNumber(s.price_now) >= toNumber(s.strike_price));
  const any_below_strike = (stocks || []).some(s => toNumber(s.price_now) < toNumber(s.strike_price));

  const all_above_ki = (stocks || []).length > 0 && stocks.every(s => toNumber(s.price_now) >= toNumber(s.ki_price));
  const any_below_ki = (stocks || []).some(s => toNumber(s.price_now) < toNumber(s.ki_price));

  let maturity_safe = false;
  let maturity_risk = false;
  let maturity_label = "";
  let maturity_color = "";
  let maturity_note = "";

  if (earlyExit.early_exit_ready) {
    maturity_label = "提早出場";
    maturity_color = "blue";
    maturity_note = "已滿足提早出場條件";
  } else if (in_maturity_window) {
    if (isEKI) {
      if (all_above_ki) {
        maturity_safe = true;
        maturity_label = "滿期安全";
        maturity_color = "green";
        maturity_note = "EKI 到期判斷：全部標的已回到 KI 以上";
      } else if (any_below_ki) {
        maturity_risk = true;
        maturity_label = "接股可能";
        maturity_color = "red";
        maturity_note = "EKI 到期判斷：仍有標的低於 KI，存在接股風險";
      }
    } else {
      if (all_above_strike) {
        maturity_safe = true;
        maturity_label = "滿期安全";
        maturity_color = "green";
        maturity_note = "AKI / DACN 到期判斷：全部標的已回到 Strike 以上";
      } else if (any_below_strike) {
        maturity_risk = true;
        maturity_label = "接股可能";
        maturity_color = "red";
        maturity_note = "AKI / DACN 到期判斷：仍有標的低於 Strike，存在接股風險";
      }
    }
  }

  return {
    days_to_maturity,
    in_maturity_window,
    all_above_strike,
    any_below_strike,
    all_above_ki,
    any_below_ki,
    maturity_safe,
    maturity_risk,
    maturity_label,
    maturity_color,
    maturity_note
  };
}

// ------------------------------
// FCN 層級計算
// ------------------------------
function calcFCN(fcn, market, poolMap = {}, earlyExitState = {}, knockInState = {}) {
  const stocks = (fcn.basket || [])
    .map(symbol => calcStockHealth(symbol, fcn, market, poolMap))
    .filter(Boolean);

  if (!stocks.length) return null;

  const sorted = sortStocks(stocks);

  const danger_count = sorted.filter(s => s.stock_health === "danger").length;
  const watch_count = sorted.filter(s => s.stock_health === "watch").length;
  const healthy_count = sorted.filter(s => s.stock_health === "healthy").length;

  const earlyExit = calcEarlyExit(fcn, market, earlyExitState);
  const knockInInfo = updateKnockInState(fcn, sorted, knockInState);
  const maturity = calcMaturityZone(fcn, sorted, earlyExit);

  let fcn_health = "healthy";

  // AKI / DACN：曾破 KI 之後，不可回健康
  if (!fcn.eki && knockInInfo.has_knock_in) {
    const anyBelowStrike = sorted.some(s => toNumber(s.price_now) < toNumber(s.strike_price));
    if (anyBelowStrike) {
      fcn_health = "danger";
    } else {
      fcn_health = "watch";
    }
  } else {
    if (danger_count > 0) fcn_health = "danger";
    else if (watch_count > 0) fcn_health = "watch";
    else fcn_health = "healthy";
  }

  const worst = sorted[0];
  const decision = getDecisionSignal(
    worst.snapshot_balance_pct,
    worst.end_balance_pct,
    fcn_health
  );

  const earlyExitStockMap = {};
  (earlyExit.early_exit_stocks || []).forEach(s => {
    earlyExitStockMap[s.symbol] = s;
  });

  const mergedStocks = sorted.map(s => ({
    ...s,
    early_exit_met: !!earlyExitStockMap[s.symbol]?.met,
    early_exit_remark_date: earlyExitStockMap[s.symbol]?.remark_date || ""
  }));

  const earlyExitLabel = earlyExit.early_exit_ready
    ? "⏩ 可提早出場"
    : earlyExit.early_exit_eligible
      ? `⏳ 提早出場追蹤中 ${earlyExit.early_exit_remark_count}/${earlyExit.early_exit_total_count}`
      : "尚未進入提早出場觀察期";

  return {
    ...fcn,
    fcn_health,
    worst_of: worst.symbol,
    danger_count,
    watch_count,
    healthy_count,
    worst_dist_to_ki_pct: worst.dist_to_ki_pct,
    worst_dist_to_strike_pct: worst.dist_to_strike_pct,

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

    decision_signal: decision.signal,
    decision_label: decision.label,
    decision_note: decision.note,

    ...earlyExit,
    early_exit_label: earlyExitLabel,

    ...knockInInfo,
    maturity,

    stocks: mergedStocks
  };
}

// ------------------------------
// 股票聚合
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

  const earlyExitState = readEarlyExitState();
  const knockInState = readKnockInState();

  const active = (fcnPool || []).filter(f => f.status === "active");

  const fcns = active
    .map(f => calcFCN(f, marketRuntime, poolMap, earlyExitState, knockInState))
    .filter(Boolean);

  writeEarlyExitState(earlyExitState);
  writeKnockInState(knockInState);

  // 到期專區：提早出場 or 到期前10天
  const maturity_zone = fcns.filter(f =>
    f.early_exit_ready || f.maturity?.in_maturity_window
  );

  const maturity_exit = maturity_zone
    .filter(f => f.early_exit_ready)
    .sort((a, b) => String(b.early_exit_last_remark_date || "").localeCompare(String(a.early_exit_last_remark_date || "")));

  const maturity_safe = maturity_zone
    .filter(f => !f.early_exit_ready && f.maturity?.maturity_safe)
    .sort((a, b) => toNumber(a.maturity?.days_to_maturity, 9999) - toNumber(b.maturity?.days_to_maturity, 9999));

  const maturity_risk = maturity_zone
    .filter(f => !f.early_exit_ready && f.maturity?.maturity_risk)
    .sort((a, b) => toNumber(a.maturity?.days_to_maturity, 9999) - toNumber(b.maturity?.days_to_maturity, 9999));

  // 一般分區：已進到期專區的，不重複放入
  const nonMaturityFCNs = fcns.filter(f => !(f.early_exit_ready || f.maturity?.in_maturity_window));

  const danger = nonMaturityFCNs.filter(f => f.fcn_health === "danger");
  const watch = nonMaturityFCNs.filter(f => f.fcn_health === "watch");
  const healthy = nonMaturityFCNs.filter(f => f.fcn_health === "healthy");

  const stockMap = buildStockAggregation(fcns);

  return {
    fcns,
    maturity_zone,
    maturity_exit,
    maturity_safe,
    maturity_risk,
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
      ${f.eki ? "🟢 EKI" : "⚪ AKI / DACN"}<br>
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
