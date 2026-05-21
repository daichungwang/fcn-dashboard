(function(){
  if(window.MMM2CashflowEngine) return;
  const TARGET_BANK_WAN={"富邦":90,"永豐":50};
  const STAGES=[
    {id:'priority',title:'第一階段｜優先規劃',amount_wan:5},
    {id:'short_term',title:'第二階段｜短期規劃',amount_wan:15},
    {id:'strategic',title:'第三階段｜策略佈局',amount_wan:15}
  ];
  const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  const arr=v=>Array.isArray(v)?v:[];
  const sum=(list,fn)=>arr(list).reduce((s,x)=>s+n(fn(x),0),0);
  const statusText=x=>String(x&&(x.status||x.lifecycle||x.zone||x.state||x.label)||'').toLowerCase();
  const amountWan=x=>{
    const v=n(x&&(x.amt??x.amount_usd??x.notional_usd??x.principal_usd),NaN);
    if(Number.isFinite(v)) return v/10000;
    const w=n(x&&(x.amount_wan??x.principal_wan),NaN);
    if(Number.isFinite(w)) return w;
    const legacy=n(x&&(x.amount??x.principal??x.exposure??x.total_exposure),0);
    return legacy>1000?legacy/10000:legacy;
  };
  function isActive(row){return row&&row.status==='active'&&row.has_position===true&&row.is_portfolio===true;}
  function getBank(row){
    const raw=String(row&&(row.tw_bank||row.broker_tw||row.channel_bank||row.bank_channel||row.bank||row.broker||row.source||row.bank_source)||'').toLowerCase();
    if(raw.includes('sinopac')||raw.includes('永豐')) return '永豐';
    if(raw.includes('fubon')||raw.includes('富邦')) return '富邦';
    return '';
  }
  function countAmt(rows){return {qty:arr(rows).length,amt_wan:sum(rows,amountWan)}}
  function inputByBank(rows){
    const out={"富邦":0,"永豐":0};
    arr(rows).forEach(r=>{const b=getBank(r); if(out[b]!=null) out[b]+=amountWan(r);});
    return out;
  }
  function buildPlanner(){
    const steps=[
      {step:1,stage:STAGES[0].title,strategy:'長期穩定現金流',bank:'永豐',source:'sinopac',amount_wan:3},
      {step:2,stage:STAGES[0].title,strategy:'長期穩定現金流',bank:'富邦',source:'fubon',amount_wan:2},
      {step:3,stage:STAGES[1].title,strategy:'長期穩定現金流',bank:'富邦',source:'fubon',amount_wan:3},
      {step:4,stage:STAGES[1].title,strategy:'積極單',bank:'富邦',source:'fubon',amount_wan:3},
      {step:5,stage:STAGES[1].title,strategy:'長期穩定現金流',bank:'永豐',source:'sinopac',amount_wan:3},
      {step:6,stage:STAGES[1].title,strategy:'短期投機單',bank:'富邦',source:'fubon',amount_wan:3},
      {step:7,stage:STAGES[1].title,strategy:'積極單',bank:'永豐',source:'sinopac',amount_wan:3},
      {step:8,stage:STAGES[2].title,strategy:'合理投資型',bank:'富邦',source:'fubon',amount_wan:3},
      {step:9,stage:STAGES[2].title,strategy:'短期投機單',bank:'富邦',source:'fubon',amount_wan:3},
      {step:10,stage:STAGES[2].title,strategy:'長期穩定現金流',bank:'永豐',source:'sinopac',amount_wan:3},
      {step:11,stage:STAGES[2].title,strategy:'合理投資型',bank:'富邦',source:'fubon',amount_wan:2},
      {step:12,stage:STAGES[2].title,strategy:'積極單',bank:'富邦',source:'fubon',amount_wan:1},
      {step:13,stage:STAGES[2].title,strategy:'長期穩定現金流',bank:'富邦',source:'fubon',amount_wan:1}
    ];
    const stageSummary={},strategySummary={},bankSummary={};
    steps.forEach(s=>{stageSummary[s.stage]=(stageSummary[s.stage]||0)+s.amount_wan;strategySummary[s.strategy]=(strategySummary[s.strategy]||0)+s.amount_wan;bankSummary[s.bank]=(bankSummary[s.bank]||0)+s.amount_wan;});
    return {steps,stageSummary,strategySummary,bankSummary,firstStage:steps.filter(s=>s.stage===STAGES[0].title)};
  }
  function getRuntimeZones(data,activeRows){
    const rt=data.m2Runtime||data.m2_runtime||data.runtime||data.healthRuntime||data.health_runtime||{};
    const has=Array.isArray(rt.danger)||Array.isArray(rt.watch)||Array.isArray(rt.healthy);
    if(has) return {danger:countAmt(rt.danger||[]),tracking:countAmt(rt.watch||[]),health:countAmt(rt.healthy||[]),source:'m2_runtime'};
    return {danger:{qty:0,amt_wan:0},tracking:{qty:0,amt_wan:0},health:{qty:arr(activeRows).length,amt_wan:sum(activeRows,amountWan)},source:'active_fcn_fallback'};
  }
  function build(state){
    const data=(state&&state.data)||{};
    const fcn=arr(data.fcnPool||data.fcn_pool);
    const pos=arr(data.positions);
    const runtime=arr(data.marketRuntime||data.market_runtime);
    const allRows=fcn.length?fcn:(pos.length?pos:runtime);
    const activeRows=fcn.length?fcn.filter(isActive):allRows;
    const totalPlanWan=TARGET_BANK_WAN['富邦']+TARGET_BANK_WAN['永豐'];
    const bankInput=inputByBank(activeRows);
    const inputAmtWan=bankInput['富邦']+bankInput['永豐'];
    const achieveRatePct=totalPlanWan?inputAmtWan/totalPlanWan*100:0;
    const output={qty:arr(allRows).filter(x=>/hard|release|maturity|exit|到期|出場/.test(statusText(x))||(x&&x.has_position===false&&!!x.exit_time)).length,amt_wan:sum(arr(allRows).filter(x=>/hard|release|maturity|exit|到期|出場/.test(statusText(x))||(x&&x.has_position===false&&!!x.exit_time)),amountWan)};
    const zones=getRuntimeZones(data,activeRows);
    const planner=buildPlanner();
    const selected=window.__M2_MARKET_FCN_SELECTION_SUMMARY__||null;
    return {
      version:'mm_m2_cashflow_engine_v1_follow_m2_logic',
      total_amt_wan:totalPlanWan,
      input_amt_wan:inputAmtWan,
      achieve_rate_pct:achieveRatePct,
      output_amt_wan:output.amt_wan,
      output_qty:output.qty,
      bank_target_wan:TARGET_BANK_WAN,
      bank_input_wan:bankInput,
      bank_gap_wan:{'富邦':TARGET_BANK_WAN['富邦']-bankInput['富邦'],'永豐':TARGET_BANK_WAN['永豐']-bankInput['永豐']},
      input_plan_steps:planner.firstStage,
      input_plan_strategy_wan:planner.firstStage.reduce((o,s)=>{o[s.strategy]=(o[s.strategy]||0)+s.amount_wan;return o;},{}),
      stages:planner.stageSummary,
      strategy_plan_wan:planner.strategySummary,
      bank_plan_wan:planner.bankSummary,
      all_steps:planner.steps,
      fcn_pool_evaluation: zones.danger.qty>0?'需處理風險':zones.tracking.qty>0?'需追蹤':'健康',
      danger:zones.danger,tracking:zones.tracking,health:zones.health,zone_source:zones.source,
      selected_total_wan:n(selected&&selected.selected_total_wan,0),
      selected_summary:selected||null,
      source_rows:allRows.length,
      active_rows:activeRows.length
    };
  }
  window.MMM2CashflowEngine={build};
})();
