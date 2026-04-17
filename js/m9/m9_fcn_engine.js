// ==========================================
// M9 FCN Engine
// ==========================================

function parseDateSafe(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// 抓銀行名稱（從 fcn_id 最後抓）
function getBankName(fcn_id = "") {
  if (fcn_id.includes("富邦")) return "富邦";
  if (fcn_id.includes("永豐")) return "永豐";
  return "其他";
}

// 判斷是否全部 hit（提早出場）
function allHit(record = {}) {
  const arr = Object.values(record || {});
  if (!arr.length) return false;
  return arr.every(x => x && x.hit === true);
}

// 月數判斷
function getCouponMonthIndex(entryTime, asOfDate) {
  const entry = parseDateSafe(entryTime);
  if (!entry) return 0;

  const first = addDays(entry, 49);
  if (asOfDate < first) return 0;

  const diff = Math.floor((asOfDate - first) / (1000 * 60 * 60 * 24));
  return 1 + Math.floor(diff / 30);
}

// 折扣
function getMultiplier(idx) {
  if (idx <= 1) return 1.0;
  if (idx === 2) return 0.88;
  return 0.64;
}

// 單筆 FCN 利息
function calcCoupon(item, monthOffset = 0, usdToTwd = 33) {
  const now = new Date();
  const target = new Date(now);
  target.setMonth(target.getMonth() + monthOffset);

  const entry = parseDateSafe(item.entry_time);
  const maturity = parseDateSafe(item.maturity_time);

  if (!entry || !maturity) return 0;
  if (item.status !== "active") return 0;
  if (target >= maturity) return 0;
  if (allHit(item.early_exit_record)) return 0;

  const idx = getCouponMonthIndex(item.entry_time, target);
  if (idx <= 0) return 0;

  const amt = Number(item.amt || 0);
  const rate = Number(item.rate || 0);
  const fx = item.currency === "USD" ? usdToTwd : 1;

  const base = amt * (rate / 100) / 12;
  return base * getMultiplier(idx) * fx;
}

// 讀 pool
export async function loadFcnPool() {
  try {
    const res = await fetch("./data/fcn_pool.json");
    return await res.json();
  } catch (e) {
    console.error("fcn_pool.json 載入失敗", e);
    return [];
  }
}

// Summary（含銀行分類）
export function buildFcnSummary(pool, usdToTwd = 33) {
  const active = pool.filter(x => x.status === "active");

  let thisMonth = 0;
  let nextMonth = 0;
  let thirdMonth = 0;

  const bankMap = {};

  for (const item of active) {
    const bank = getBankName(item.fcn_id);

    const c1 = calcCoupon(item, 0, usdToTwd);
    const c2 = calcCoupon(item, 1, usdToTwd);
    const c3 = calcCoupon(item, 2, usdToTwd);

    thisMonth += c1;
    nextMonth += c2;
    thirdMonth += c3;

if (!bankMap[bank]) {
  bankMap[bank] = { thisMonth: 0, nextMonth: 0, thirdMonth: 0, count: 0 };
}
    bankMap[bank].count += 1;

    bankMap[bank].thisMonth += c1;
    bankMap[bank].nextMonth += c2;
    bankMap[bank].thirdMonth += c3;
  }

  return {
    total: { thisMonth, nextMonth, thirdMonth },
    byBank: bankMap
  };
}

// 明細表
export function buildFcnTable(pool, usdToTwd = 33) {
  return pool
    .filter(x => x.status === "active")
    .map(item => {
      return {
        id: item.fcn_id,
        bank: getBankName(item.fcn_id),
        amt: item.amt,
        rate: item.rate,
        thisMonth: calcCoupon(item, 0, usdToTwd),
        nextMonth: calcCoupon(item, 1, usdToTwd),
        thirdMonth: calcCoupon(item, 2, usdToTwd),
        earlyExit: allHit(item.early_exit_record)
      };
    });
}
