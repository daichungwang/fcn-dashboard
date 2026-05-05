// ==========================================
// MM FILTER ENGINE v3 (FULL INTEGRATION)
// C1 + Vol + Pool + Basket + Allocation + M8 + Market Match
// ==========================================

// ===== M8 引擎 =====
import { runM8Case } from "../core/m8_batch_engine.js";

// ==========================================
// 主入口
// ==========================================
export async function runMMFilterFull(input){

  const stocks = input?.stocks || [];
  const marketOrders = input?.market_orders || [];

  // =========================
  // 1. VOL v1
  // =========================
  stocks.forEach(s=>{
    s.vol_score = calcVolScore(s);
    s.vol_band = getVolBand(s.vol_score);
  });

  // =========================
  // 2. POOL
  // =========================
  const pools = {
    highlight:[],
    watch:[],
    simulation:[],
    reject:[]
  };

  stocks.forEach(s=>{

    if(!s.allow_fcn || s.reject_reason){
      pools.reject.push(s);
      return;
    }

    pools.simulation.push(s);

    if(
      s.priority_score >= 75 &&
      s.vol_band !== "extreme" &&
      (s.m2_util ?? 0) < 0.8 &&
      s.m6_timing !== "hot" &&
      (s.amt_signal ?? 0) > 0.6
    ){
      pools.highlight.push(s);
    }else{
      pools.watch.push(s);
    }

  });

  // =========================
  // 3. SORT
  // =========================
  const sortFn = (a,b)=>(b.priority_score||0)-(a.priority_score||0);
  Object.keys(pools).forEach(k=>pools[k].sort(sortFn));

  // =========================
  // 4. CATEGORY
  // =========================
  const categories = ["core","growth","income","defensive","speculative"];
  const category_map = {};
  categories.forEach(c=>category_map[c]=[]);

  stocks.forEach(s=>{
    if(category_map[s.category]){
      category_map[s.category].push(s);
    }
  });

  // =========================
  // 5. BASKET BUILD
  // =========================
  const baskets = [];

  const top = pools.highlight.slice(0,4);
  if(top.length>=2){
    baskets.push(await buildBasket("PRIORITY_TOP", top));
  }

  const balanced = [];
  categories.forEach(c=>{
    if(category_map[c]?.length){
      balanced.push(category_map[c][0]);
    }
  });

  if(balanced.length>=3){
    baskets.push(await buildBasket("CATEGORY_BALANCED", balanced.slice(0,5)));
  }

  const hybrid = [
    ...pools.highlight.slice(0,2),
    ...pools.watch.slice(0,2)
  ];

  if(hybrid.length>=3){
    baskets.push(await buildBasket("HYBRID", hybrid.slice(0,5)));
  }

  // =========================
  // 6. ALLOCATION v0
  // =========================
  let total_capacity = Math.max(...stocks.map(s=>s.max_addable_amt||0),0);
  let remaining = total_capacity;

  const allocation = [];

  for(const b of baskets){

    if(remaining<=0) break;

    const alloc = Math.min(b.basket_cap, remaining);

    allocation.push({
      basket_id:b.id,
      basket_cap:b.basket_cap,
      alloc,
      remaining_after:remaining-alloc
    });

    remaining -= alloc;
  }

  // =========================
  // 7. MARKET ORDER MATCH
  // =========================
  const market_match = await Promise.all(
    marketOrders.map(o=>evaluateOrder(o, stocks))
  );

  // =========================
  // 8. SUMMARY
  // =========================
  const summary = {
    total:stocks.length,
    highlight:pools.highlight.length,
    watch:pools.watch.length,
    reject:pools.reject.length,
    capacity:total_capacity,
    allocated:total_capacity-remaining,
    remaining
  };

  return {
    summary,
    pools,
    category_map,
    baskets,
    allocation,
    market_match,
    raw:stocks
  };
}

// ==========================================
// VOL v1
// ==========================================
function calcVolScore(s){
  return (
    0.05*Math.abs(num(s.ret_1d)) +
    0.10*Math.abs(num(s.ret_2d)) +
    0.40*Math.abs(num(s.ret_1w)) +
    0.35*Math.abs(num(s.ma_slope)) +
    0.10*Math.abs(num(s.ret_2w))
  );
}

function getVolBand(v){
  if(v<3) return "low";
  if(v<7) return "mid";
  if(v<12) return "high";
  return "extreme";
}

// ==========================================
// BASKET + M8
// ==========================================
async function buildBasket(id, stocks){

  const symbols = stocks.map(s=>s.symbol);
  const caps = stocks.map(s=>s.max_addable_amt||0);
  const basket_cap = Math.min(...caps);

  const avg_score = avg(stocks.map(s=>s.priority_score));
  const avg_vol = avg(stocks.map(s=>s.vol_score));

  let m8 = null;

  try{
    m8 = await runM8Case({
      caseName:id,
      symbols,
      KI:55,
      Strike:65,
      T:6,
      type:"AKI",
      marketYield:0
    });
  }catch(e){
    console.warn("M8 error",e);
  }

  return {
    id,
    symbols,
    basket_cap,
    avg_score,
    avg_vol,
    m8
  };
}

// ==========================================
// MARKET ORDER MATCH
// ==========================================
async function evaluateOrder(order, stocks){

  const stockMap = Object.fromEntries(stocks.map(s=>[s.symbol,s]));

  let matched=[];
  let rejected=[];

  for(const sym of order.symbols){

    const s = stockMap[sym];

    if(!s){
      rejected.push({sym,reason:"not_in_pool"});
      continue;
    }

    if(!s.allow_fcn || s.m2_util>0.95){
      rejected.push({sym,reason:"blocked"});
      continue;
    }

    matched.push(s);
  }

  const match_pct = matched.length / order.symbols.length;

  let m8 = null;

  try{
    m8 = await runM8Case({
      caseName:"ORDER",
      symbols:order.symbols,
      KI:order.KI,
      Strike:order.strike,
      T:order.tenor,
      type:order.type,
      marketYield:order.market_yield
    });
  }catch(e){
    console.warn("M8 order error",e);
  }

  const fair = m8?.fair_yield ?? null;
  const market = order.market_yield ?? null;

  let view="unknown";
  if(fair && market){
    if(market>fair+1) view="cheap";
    else if(market<fair-1) view="rich";
    else view="fair";
  }

  let action="REVIEW";
  if(match_pct===1 && view==="cheap") action="FOLLOW";
  else if(view==="fair") action="NEGOTIATE";
  else action="REJECT";

  const maxCap = Math.min(...matched.map(s=>s.max_addable_amt||0),Infinity);

  let suggested=0;
  if(action==="FOLLOW") suggested=maxCap;
  if(action==="NEGOTIATE") suggested=Math.floor(maxCap*0.5);

  return {
    order,
    match_pct:round(match_pct*100),
    matched:matched.map(s=>s.symbol),
    rejected,
    fair_yield:round(fair),
    market_yield:round(market),
    pricing_view:view,
    action,
    suggested_amt:suggested
  };
}

// ==========================================
// UTIL
// ==========================================
function num(x){return Number(x??0);}
function avg(arr){return arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0;}
function round(x){return x?Number(x.toFixed(2)):null;}
