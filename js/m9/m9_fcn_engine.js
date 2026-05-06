// ==========================================
// M9 FCN ENGINE (MONTHLY CASHFLOW VERSION)
// ==========================================
// 核心修正：
// 1) FCN 本月 / 次月 / 次次月不是看「今天單點」，而是看「整個月份區間」。
// 2) 所有 coupon 入帳日以 record create/entry date 為起點推估。
// 3) 保留目前 M9 的 record date + 49 天首次入帳規則。
// 4) 提前出場 / 到期結算若有 out/maturity date，採 +12 天入帳 buffer。
// 5) maturity_time 缺漏時，不再直接讓 coupon 歸零；只標示資料缺漏。

// ---------- 工具 ----------
function parseDate(v){
  if(!v) return null;
  if(v instanceof Date && !isNaN(v)) return v;
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

function addDays(d, days){
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function addMonths(d, months){
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

function startOfMonth(d){
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(d){
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function getMonthRange(offset=0, baseDate=new Date()){
  const d = addMonths(baseDate, offset);
  return {
    start: startOfMonth(d),
    end: endOfMonth(d),
    label: `${d.getFullYear()}/${d.getMonth() + 1}`
  };
}

function isWithinRange(d, start, end){
  if(!d || !start || !end) return false;
  return d >= start && d <= end;
}

function formatDateYYYYMMDD(d){
  if(!d) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getBank(item){
  if(item?.tw_bank) return item.tw_bank;
  if(item?.bank) return item.bank;
  if(item?.fcn_id?.includes("富邦")) return "富邦";
  if(item?.fcn_id?.includes("永豐")) return "永豐";
  return "其他";
}

function allHit(record){
  if(!record) return false;
  const arr = Object.values(record);
  if(!arr.length) return false;
  return arr.every(x => x && x.hit === true);
}

function parsePossibleDate(v){
  if(!v) return null;
  const d = parseDate(v);
  return d;
}

function getHitDateFromRecordValue(v){
  if(!v || typeof v !== "object") return null;
  const keys = [
    "exit_date", "early_exit_date", "knock_out_date", "ko_date",
    "out_date", "hit_date", "observation_date", "observe_date",
    "date", "coupon_date", "settlement_date"
  ];
  for(const k of keys){
    const d = parsePossibleDate(v[k]);
    if(d) return d;
  }
  return null;
}

function getEarlyExitDate(item){
  const record = item?.early_exit_record;
  if(!record) return null;

  const dates = [];
  Object.entries(record).forEach(([k,v]) => {
    const hit = v && typeof v === "object" ? v.hit === true : false;
    if(!hit) return;
    const valueDate = getHitDateFromRecordValue(v);
    const keyDate = parsePossibleDate(k);
    if(valueDate) dates.push(valueDate);
    else if(keyDate) dates.push(keyDate);
  });

  if(!dates.length) return null;
  dates.sort((a,b)=>a-b);
  return dates[dates.length - 1];
}

function getNumber(item, keys, fallback=0){
  for(const k of keys){
    const v = Number(item?.[k]);
    if(Number.isFinite(v) && v !== 0) return v;
  }
  return fallback;
}

// ---------- FCN 日期常數 ----------
// 目前 fcn_pool.json 的 entry_time 實務上較接近「create date / 建立日」。
// 使用者確認：
//   create/record date + 5~9 天 ≈ 真正 entry date，正常先抓 +7 天
//   record date + 37 天 ≈ 滿一個月 / 第一期觀察日
//   入帳最晚再 +10 天，加 2 天 buffer
// 因此：record date + 49 天 = 第一次 coupon 入帳保守日。
const FCN_EST_ENTRY_DAYS_FROM_RECORD = 7;
const FCN_FIRST_COUPON_DAYS_FROM_RECORD = 37;
const FCN_COUPON_DEPOSIT_DELAY_DAYS = 10;
const FCN_BUFFER_DAYS = 2;
const FCN_FIRST_DEPOSIT_DAYS_FROM_RECORD =
  FCN_FIRST_COUPON_DAYS_FROM_RECORD +
  FCN_COUPON_DEPOSIT_DELAY_DAYS +
  FCN_BUFFER_DAYS; // 49

// 提前出場 / 到期結算入帳：out/maturity date +10 days +2 days buffer = +12
const FCN_EXIT_DEPOSIT_DAYS = 12;

// 一般 monthly coupon：首次入帳後，每 30 天推估下一期入帳。
const FCN_COUPON_CYCLE_DAYS = 30;

function getRecordDate(item){
  return parseDate(item?.entry_time || item?.create_time || item?.create_date || item?.record_date);
}

function getEstimatedEntryDate(item){
  const recordDate = getRecordDate(item);
  return recordDate ? addDays(recordDate, FCN_EST_ENTRY_DAYS_FROM_RECORD) : null;
}

function getFirstCouponDepositDateByRecordDate(item){
  const recordDate = getRecordDate(item);
  return recordDate ? addDays(recordDate, FCN_FIRST_DEPOSIT_DAYS_FROM_RECORD) : null;
}

function getMaturityDate(item){
  return parseDate(item?.maturity_time || item?.maturity_date || item?.mature_date);
}

function getMultiplier(idx){
  if(idx <= 1) return 1;
  if(idx === 2) return 0.88;
  return 0.64;
}

function getBaseCouponTwd(item, usd=33){
  const amt = getNumber(item, ["amt", "amount", "notional", "principal"], 0);
  const rate = getNumber(item, ["rate", "coupon_rate", "yield", "annual_rate"], 0);
  const fx = item?.currency === "USD" ? usd : 1;
  const base = amt * (rate / 100) / 12;
  return { amt, rate, fx, baseTwd: base * fx };
}

function getFinalCutoffDate(item){
  const earlyExitDate = getEarlyExitDate(item);
  const maturityDate = getMaturityDate(item);
  if(earlyExitDate) return earlyExitDate;
  if(maturityDate) return maturityDate;
  return null;
}

function buildCouponSchedule(item, usd=33, horizonMonths=18, baseDate=new Date()){
  const recordDate = getRecordDate(item);
  const estimatedEntryDate = getEstimatedEntryDate(item);
  const firstDepositDate = getFirstCouponDepositDateByRecordDate(item);
  const maturityDate = getMaturityDate(item);
  const earlyExit = allHit(item?.early_exit_record);
  const earlyExitDate = getEarlyExitDate(item);
  const finalCutoffDate = getFinalCutoffDate(item);
  const {amt, rate, baseTwd} = getBaseCouponTwd(item, usd);
  const isActive = item?.status === "active";

  const schedule = [];
  if(!recordDate || !firstDepositDate || !amt || !rate || !isActive){
    return {
      schedule,
      recordDate,
      estimatedEntryDate,
      firstDepositDate,
      maturityDate,
      earlyExit,
      earlyExitDate,
      amt,
      rate,
      isActive
    };
  }

  const horizonEnd = endOfMonth(addMonths(baseDate, horizonMonths));
  let depositDate = new Date(firstDepositDate);
  let idx = 1;

  while(depositDate <= horizonEnd && idx <= 36){
    // 若有提前出場或到期日，正常 coupon 只產生到 out/maturity 當日以前。
    // out/maturity 之後的最後結算入帳另由 exitDeposit 處理。
    if(finalCutoffDate && depositDate > addDays(finalCutoffDate, FCN_EXIT_DEPOSIT_DAYS)) break;

    if(!finalCutoffDate || depositDate <= addDays(finalCutoffDate, FCN_EXIT_DEPOSIT_DAYS)){
      // 若 depositDate 落在 out/maturity 後 12 天內，仍視為最後一期可能入帳。
      schedule.push({
        type: "coupon",
        idx,
        depositDate: new Date(depositDate),
        amount: baseTwd * getMultiplier(idx)
      });
    }

    depositDate = addDays(firstDepositDate, idx * FCN_COUPON_CYCLE_DAYS);
    idx += 1;
  }

  // 若明確提前出場，而且可抓到 out date，補一筆 out +12 的結算入帳點。
  // 如果剛好同日已有一般 coupon，避免重複加總，僅當那天沒有 schedule 時加入。
  if(earlyExit && earlyExitDate){
    const exitDepositDate = addDays(earlyExitDate, FCN_EXIT_DEPOSIT_DAYS);
    const hasSameDate = schedule.some(x => formatDateYYYYMMDD(x.depositDate) === formatDateYYYYMMDD(exitDepositDate));
    if(exitDepositDate <= horizonEnd && !hasSameDate){
      const nextIdx = Math.max(1, schedule.filter(x => x.type === "coupon").length + 1);
      schedule.push({
        type: "early_exit_deposit",
        idx: nextIdx,
        depositDate: exitDepositDate,
        amount: baseTwd * getMultiplier(nextIdx)
      });
    }
  }

  // 若已到期但沒有提前出場，補一筆 maturity +12 的最後結算入帳。
  // 例：FCN935K 到期日 2026-04-27 → 2026-05-09 入帳，應列入 5 月。
  if(!earlyExit && maturityDate){
    const maturityDepositDate = addDays(maturityDate, FCN_EXIT_DEPOSIT_DAYS);
    const hasSameDate = schedule.some(x => formatDateYYYYMMDD(x.depositDate) === formatDateYYYYMMDD(maturityDepositDate));
    if(maturityDepositDate <= horizonEnd && !hasSameDate){
      const nextIdx = Math.max(1, schedule.filter(x => x.type === "coupon").length + 1);
      schedule.push({
        type: "maturity_deposit",
        idx: nextIdx,
        depositDate: maturityDepositDate,
        amount: baseTwd * getMultiplier(nextIdx)
      });
    }
  }

  schedule.sort((a,b)=>a.depositDate-b.depositDate);

  return {
    schedule,
    recordDate,
    estimatedEntryDate,
    firstDepositDate,
    maturityDate,
    earlyExit,
    earlyExitDate,
    amt,
    rate,
    isActive
  };
}

function calcCouponForRange(item, rangeStart, rangeEnd, usd=33){
  const info = buildCouponSchedule(item, usd, 18, rangeStart || new Date());
  const amount = info.schedule
    .filter(x => isWithinRange(x.depositDate, rangeStart, rangeEnd))
    .reduce((s,x)=>s + Number(x.amount || 0), 0);
  return { amount, deposits: info.schedule.filter(x => isWithinRange(x.depositDate, rangeStart, rangeEnd)), info };
}

function calcCouponForMonth(item, offset=0, usd=33, baseDate=new Date()){
  const range = getMonthRange(offset, baseDate);
  return calcCouponForRange(item, range.start, range.end, usd);
}

// 舊介面保留：但現在 calcCoupon(offset) 代表「該 offset 月份區間加總」，不是今天單點。
function calcCoupon(item, offset=0, usd=33){
  return calcCouponForMonth(item, offset, usd).amount;
}

function getMonthStatusAndZeroReason(item, offset=0, usd=33, baseDate=new Date()){
  const range = getMonthRange(offset, baseDate);
  const result = calcCouponForRange(item, range.start, range.end, usd);
  const info = result.info;
  const today = new Date();
  const monthEnd = range.end;
  const maturityDate = info.maturityDate;
  const firstDepositDate = info.firstDepositDate;

  let statusText = "正常持有中";
  let statusCode = "active_holding";
  let zeroReason = result.amount > 0 ? "—" : "本月無入帳日";

  if(!info.recordDate){
    statusText = "資料異常";
    statusCode = "missing_record_date";
    zeroReason = "record/entry_time missing";
  }else if(!info.isActive){
    statusText = "非 active";
    statusCode = "not_active";
    zeroReason = "非 active";
  }else if(!info.amt){
    statusText = "資料異常";
    statusCode = "missing_amt";
    zeroReason = "amt missing/zero";
  }else if(!info.rate){
    statusText = "資料異常";
    statusCode = "missing_rate";
    zeroReason = "rate missing/zero";
  }else if(info.earlyExit){
    statusText = "已提前出場";
    statusCode = "early_exit";
    if(result.amount <= 0) zeroReason = info.earlyExitDate ? "已提前出場，本月無入帳日" : "已提前出場，缺 out date";
  }else if(maturityDate && today > maturityDate){
    statusText = "已到期";
    statusCode = "matured";
    if(result.amount <= 0) zeroReason = "已到期，本月無入帳日";
  }else if(maturityDate && (maturityDate - today) / (1000*60*60*24) <= 7){
    statusText = "7天內到期";
    statusCode = "maturing_soon";
    if(result.amount <= 0) zeroReason = "即將到期，本月無入帳日";
  }else if(firstDepositDate && monthEnd < firstDepositDate){
    statusText = "等待首次入帳";
    statusCode = "before_first_deposit";
    zeroReason = "等待首次入帳";
  }else if(firstDepositDate && today < firstDepositDate && isWithinRange(firstDepositDate, range.start, range.end)){
    statusText = "本月預計首次入帳";
    statusCode = "first_deposit_this_month";
    if(result.amount <= 0) zeroReason = "本月無入帳日";
  }else if(!maturityDate){
    statusText = "到期日缺漏";
    statusCode = "missing_maturity_but_calculated";
    if(result.amount <= 0) zeroReason = "maturity_time missing / 本月無入帳日";
  }

  if(result.amount > 0) zeroReason = "—";

  const depositTypes = result.deposits.map(x => x.type).join(" / ") || "—";
  const depositDates = result.deposits.map(x => formatDateYYYYMMDD(x.depositDate)).join(" / ") || "—";

  return { ...result, range, statusText, statusCode, zeroReason, depositTypes, depositDates };
}

// ---------- 載入 ----------
async function loadFcnPool(){
  try{
    const res = await fetch("./data/fcn_pool.json");
    return await res.json();
  }catch(e){
    console.error("load fcn_pool failed", e);
    return [];
  }
}

// ---------- Summary ----------
function buildFcnSummary(pool, usd=33){
  const active = (pool || []).filter(x=>x.status === "active");

  let t1=0, t2=0, t3=0;
  const bankMap = {};

  active.forEach(item=>{
    const bank = getBank(item);
    const c1 = calcCoupon(item,0,usd);
    const c2 = calcCoupon(item,1,usd);
    const c3 = calcCoupon(item,2,usd);

    t1+=c1; t2+=c2; t3+=c3;

    if(!bankMap[bank]){
      bankMap[bank]={thisMonth:0,nextMonth:0,thirdMonth:0,count:0};
    }
    bankMap[bank].thisMonth+=c1;
    bankMap[bank].nextMonth+=c2;
    bankMap[bank].thirdMonth+=c3;
    bankMap[bank].count+=1;
  });

  return {
    total:{thisMonth:t1,nextMonth:t2,thirdMonth:t3},
    byBank:bankMap,
    count:active.length
  };
}

// ---------- Table ----------
function buildFcnTable(pool, usd=33){
  return (pool || [])
    .filter(x=>x.status === "active")
    .map(item=>{
      const d0 = getMonthStatusAndZeroReason(item,0,usd);
      const d1 = getMonthStatusAndZeroReason(item,1,usd);
      const d2 = getMonthStatusAndZeroReason(item,2,usd);
      const info = d0.info;
      const thisDeposits = d0.deposits.map(x=>formatDateYYYYMMDD(x.depositDate)).join(" / ");
      const thisDepositTypes = d0.deposits.map(x=>x.type).join(" / ");

      return {
        id:item.fcn_id || item.id || "—",
        bank:getBank(item),
        recordDate:formatDateYYYYMMDD(info.recordDate),
        estimatedEntryDate:formatDateYYYYMMDD(info.estimatedEntryDate),
        firstCouponDepositDate:formatDateYYYYMMDD(info.firstDepositDate),
        maturityDate:formatDateYYYYMMDD(info.maturityDate),
        thisMonth:d0.amount,
        nextMonth:d1.amount,
        thirdMonth:d2.amount,
        thisMonthDepositDates:thisDeposits || "—",
        thisMonthDepositTypes:thisDepositTypes || "—",
        earlyExit:info.earlyExit,
        statusText:d0.statusText,
        statusCode:d0.statusCode,
        zeroReason:d0.zeroReason,
        amt:info.amt,
        rate:info.rate
      };
    });
}

// ---------- 12個月 ----------
function buildCashflow12M(pool, usd=33){
  const active = (pool || []).filter(x=>x.status === "active");
  const arr=[];

  for(let i=0;i<12;i++){
    const range = getMonthRange(i);
    let total=0;
    active.forEach(item=>{
      total += calcCouponForRange(item, range.start, range.end, usd).amount;
    });

    arr.push({
      label:range.label,
      value:total
    });
  }

  return arr;
}

function getCouponDebug(item, offset=0, usd=33){
  return getMonthStatusAndZeroReason(item, offset, usd);
}

function getFcnState(item, offset=0, usd=33){
  return getMonthStatusAndZeroReason(item, offset, usd);
}

// 掛到 window（讓 m9.html 能用）
window.M9_FCN = {
  loadFcnPool,
  buildFcnSummary,
  buildFcnTable,
  buildCashflow12M,
  buildCouponSchedule,
  calcCoupon,
  calcCouponForMonth,
  calcCouponForRange,
  getCouponDebug,
  getFcnState,
  getMonthRange,
  getRecordDate,
  getEstimatedEntryDate,
  getFirstCouponDepositDateByRecordDate,
  getMaturityDate,
  getEarlyExitDate,
  formatDateYYYYMMDD,
  constants:{
    FCN_EST_ENTRY_DAYS_FROM_RECORD,
    FCN_FIRST_COUPON_DAYS_FROM_RECORD,
    FCN_COUPON_DEPOSIT_DELAY_DAYS,
    FCN_BUFFER_DAYS,
    FCN_FIRST_DEPOSIT_DAYS_FROM_RECORD,
    FCN_EXIT_DEPOSIT_DAYS,
    FCN_COUPON_CYCLE_DAYS
  }
};
