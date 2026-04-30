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
  async function loadJson(path){
    try{ const r=await fetch(path); if(!r.ok) throw new Error(String(r.status)); return await r.json(); }
    catch(e){ return {__missing:true,__error:String(e)}; }
  }
  async function loadAll(){
    const entries=await Promise.all(Object.entries(SOURCES).map(async ([k,p])=>[k,await loadJson(p)]));
    const data=Object.fromEntries(entries);
    const warnings=entries.filter(([,v])=>v&&v.__missing).map(([k])=>k);
    console.log('[MM] data loaded',Object.keys(data).length,'sources; warnings:',warnings);
    return {data,warnings,sources:SOURCES};
  }
  window.MMDataLoader={loadAll,SOURCES};
})();
