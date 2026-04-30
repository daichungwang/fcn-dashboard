(function(){
  const SOURCES={
    engineProgress:'../data/mm/engine_progress_dashboard.json',
    m7Scores:'../data/m7_sandbox/m7_v2_scores.json',
    m7Audit:'../data/m7_sandbox/m7_formula_input_audit.json',
    runtimeLong:'../data/runtime_staging/market_runtime_long_horizon.json',
    marketRuntime:'../data/market_runtime.json',
    pool30:'../data/pool30.json',
    m1Candidates:'../data/m1/m1_candidate_80.json',
    m1Profiles:'../data/m1/m1_stock_profile_all.json',
    fcnPool:'../data/fcn_pool.json',
    positions:'../data/positions.json'
  };
  const DEMO={
    marketRuntime:[{symbol:'NVDA',price:950.12,change_1d:1.2,m1_score:82,m7_score:88,total_exposure:12,category:'core'},{symbol:'MSFT',price:420.5,change_1d:-0.4,m1_score:78,m7_score:80,total_exposure:9,category:'growth'}],
    m7Scores:[{symbol:'NVDA',m7_score:88,selected:true,category:'Core'},{symbol:'MSFT',m7_score:80,selected:true,category:'Growth'},{symbol:'JNJ',m7_score:70,selected:false,category:'Defensive'}],
    m1Candidates:[{symbol:'NVDA'},{symbol:'MSFT'},{symbol:'AVGO'}],
    positions:[{symbol:'NVDA',exposure:7.5},{symbol:'MSFT',exposure:4.0}],
    m7Audit:{valuation_weight:0.3,trend_weight:0.3,structure_weight:0.2,money_weight:0.2,warning_count:1,fallback_count:0}
  };
  async function loadJson(path){ try{const r=await fetch(path); if(!r.ok) throw new Error(String(r.status)); return await r.json();}catch(e){return {__missing:true,__error:String(e)};} }
  async function loadAll(){
    const entries=await Promise.all(Object.entries(SOURCES).map(async ([k,p])=>[k,await loadJson(p)]));
    const data=Object.fromEntries(entries); const warnings=[]; let demoUsed=false;
    for(const [k,v] of Object.entries(data)){ if(v&&v.__missing){warnings.push(k); if(DEMO[k]){data[k]=DEMO[k]; data[k].__demo=true; demoUsed=true;} else data[k]=Array.isArray(DEMO.marketRuntime)?[]:{}; }}
    if((!Array.isArray(data.marketRuntime)||!data.marketRuntime.length)&&DEMO.marketRuntime){data.marketRuntime=DEMO.marketRuntime; demoUsed=true;}
    if((!Array.isArray(data.m7Scores)||!data.m7Scores.length)&&DEMO.m7Scores){data.m7Scores=DEMO.m7Scores; demoUsed=true;}
    if((!Array.isArray(data.m1Candidates)||!data.m1Candidates.length)&&DEMO.m1Candidates){data.m1Candidates=DEMO.m1Candidates; demoUsed=true;}
    if((!Array.isArray(data.positions)||!data.positions.length)&&DEMO.positions){data.positions=DEMO.positions; demoUsed=true;}
    if((!data.m7Audit||data.m7Audit.__missing)&&DEMO.m7Audit){data.m7Audit=DEMO.m7Audit; demoUsed=true;}
    return {data,warnings,sources:SOURCES,demoUsed};
  }
  window.MMDataLoader={loadAll,SOURCES};
})();
