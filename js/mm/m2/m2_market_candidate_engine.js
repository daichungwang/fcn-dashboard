// ============================================================
// M2 Market Candidate Engine v69
// Path: js/mm/m2/m2_market_candidate_engine.js
// Purpose: plannerResult x market_fcn_history matching.
// ============================================================
(function(){
  if(window.M2MarketCandidateEngine) return;

  const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  const clamp=(v,min=0,max=10)=>Math.max(min,Math.min(max,v));

  function fallbackPlannerResult(){
    return {
      source:'fallback_v066_result_first',
      available_capital:130000,
      priority_queue:[
        {need_id:'sinopac_short_spec',bank:'永豐',category:'short_spec',title:'短期投機機會',target_amount:40000,min_amount:30000,priority:1},
        {need_id:'sinopac_aggressive',bank:'永豐',category:'積極單',target_amount:60000,min_amount:30000,priority:2},
        {need_id:'fubon_short_spec',bank:'富邦',category:'short_spec',title:'短期投機機會',target_amount:10000,min_amount:10000,priority:3}
      ]
    };
  }

  function getPlannerResult(input){
    const p=input||window.__M2_PLANNER_RESULT__||window.M2_PLANNER_RESULT||fallbackPlannerResult();
    if(!Array.isArray(p.priority_queue)||!p.priority_queue.length) return fallbackPlannerResult();
    return p;
  }

  function getFairRate(row){
    const direct=n(row.m8_fair_rate??row.fair_rate??row.old_fair_rate??row.m8,NaN);
    if(Number.isFinite(direct)) return direct;
    const coupon=n(row.coupon_pct,0);
    const strike=n(row.strike_pct,0);
    const ki=n(row.ki_pct,0);
    const tenor=n(row.tenor_month,0);
    const riskAdj=(strike>=75?1.2:0)+(ki>=65?1.0:0)+(tenor>=12?0.4:0);
    return Math.max(5, coupon - 2.0 + riskAdj);
  }

  function getFinalRef(row,m8Fair){
    const direct=n(row.final_fair_rate??row.final??row.new_final_fair,NaN);
    if(Number.isFinite(direct)) return direct;
    return m8Fair + 0.5;
  }

  function needMatchScore(need,row){
    let score=0;
    if(need.bank && row.bank===need.bank) score+=3;
    if((row.slot_candidates||[]).includes(need.category)) score+=3;
    if(need.category==='short_spec'){
      if(n(row.tenor_month,0)<=6) score+=2;
      if(n(row.ki_pct,0)<=60 || row.ki_pct==null) score+=1;
      if(['B_MEMORY','D_SPECULATIVE','C_TSLA_MOMENTUM','A_AI_CORE'].includes(row.template_group)) score+=1;
    }else if(need.category==='aggressive'){
      if(n(row.coupon_pct,0)>=18) score+=2;
      if(['A_AI_CORE','B_MEMORY','D_SPECULATIVE'].includes(row.template_group)) score+=2;
      if(n(row.tenor_month,0)>=4 && n(row.tenor_month,0)<=12) score+=1;
    }else if(need.category==='defensive_balance'){
      if(row.template_group==='E_DEFENSIVE') score+=4;
    }
    return clamp(score,0,10);
  }

  function riskFitScore(need,row){
    const r=row.risk_bucket;
    if(need.category==='short_spec') return {LOW:8,MEDIUM_LOW:9,MEDIUM:8,MEDIUM_HIGH:6,HIGH:4,VERY_HIGH:2}[r]??5;
    if(need.category==='aggressive') return {LOW:6,MEDIUM_LOW:8,MEDIUM:9,MEDIUM_HIGH:8,HIGH:6,VERY_HIGH:3}[r]??5;
    return {LOW:10,MEDIUM_LOW:9,MEDIUM:7,MEDIUM_HIGH:5,HIGH:3,VERY_HIGH:1}[r]??5;
  }

  function bankFitScore(need,row){
    return need.bank===row.bank?10:4;
  }

  function fairGapScore(gap){
    return clamp(5 + gap, 0, 10);
  }

  function buildMarketCandidatesFromPlanner(plannerResult, marketRows){
    const classifier=window.M2MarketRowClassifier;
    const diversity=window.M2MarketDiversityEngine;
    if(!classifier) throw new Error('M2MarketRowClassifier not loaded');
    const planner=getPlannerResult(plannerResult);
    const rows=(Array.isArray(marketRows)?marketRows:[])
      .map((r,i)=>classifier.classifyMarketRow(r,i))
      .filter(r=>Number.isFinite(Number(r.coupon_pct))&&Number.isFinite(Number(r.tenor_month))&&r.symbols.length);

    const result={};
    (planner.priority_queue||[]).forEach(need=>{
      const matched=[];
      const counters={market_rows:rows.length,planner_matched:0,m8_fair_ok:0,risk_fit:0,displayed:0};
      rows.forEach(row=>{
        const match=needMatchScore(need,row);
        if(match<=0) return;
        counters.planner_matched++;
        const m8Fair=getFairRate(row);
        const finalRef=getFinalRef(row,m8Fair);
        const fairGap=n(row.coupon_pct,0)-m8Fair;
        if(fairGap>=-3) counters.m8_fair_ok++;
        const risk=riskFitScore(need,row);
        if(risk>=4) counters.risk_fit++;
        const bank=bankFitScore(need,row);
        const gapScore=fairGapScore(fairGap);
        const baseScore=0.30*match + 0.25*gapScore + 0.20*risk + 0.15*bank + 0.10*7;
        matched.push({
          ...row,
          need_id:need.need_id,
          need_title:need.title||need.category,
          target_amount:need.target_amount,
          min_amount:need.min_amount,
          m8_fair_rate:Number(m8Fair.toFixed(2)),
          final_fair_ref:Number(finalRef.toFixed(2)),
          fair_gap:Number(fairGap.toFixed(2)),
          base_score:Number(baseScore.toFixed(3)),
          candidate_score:Number(baseScore.toFixed(3)),
          planner_need_match:match,
          risk_fit_score:risk,
          bank_fit_score:bank,
          amount_wan:Math.max(1,Math.round(n(need.min_amount,30000)/10000)),
          action:fairGap>=2?'Promote':fairGap>=0?'Update':'Watch'
        });
      });
      const ranked=(diversity?diversity.applyDiversity(matched.sort((a,b)=>b.base_score-a.base_score)):matched)
        .sort((a,b)=>b.candidate_score-a.candidate_score);
      counters.displayed=Math.min(10,ranked.length);
      result[need.need_id]={need,candidates:ranked.slice(0,10),diagnostics:counters};
    });
    return {planner,rows,result};
  }

  window.M2MarketCandidateEngine={
    fallbackPlannerResult,
    getPlannerResult,
    buildMarketCandidatesFromPlanner
  };
})();
