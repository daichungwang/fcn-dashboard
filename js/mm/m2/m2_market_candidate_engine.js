// ============================================================
// M2 Market Candidate Engine v70
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
        {need_id:'sinopac_aggressive',bank:'永豐',category:'aggressive',title:'積極單',target_amount:60000,min_amount:30000,priority:2},
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

  function marketCouponScore(coupon){
    return clamp(coupon/3.5,0,10);
  }

  function fcnConditionScore(row){
    const strike=n(row.strike_pct,70);
    const ki=n(row.ki_pct,60);
    const tenor=n(row.tenor_month,6);

    let score=10;
    score -= Math.max(0,(strike-65)/5);
    score -= Math.max(0,(ki-55)/5);
    score -= Math.max(0,(tenor-6)/3);

    if(Math.abs(strike-ki)<=10) score+=0.5;
    if(row.memory_type) score+=0.3;

    return clamp(score,0,10);
  }

  function needMatchScore(need,row){
    let score=0;
    const dna=row.basket_dna||{};

    if(need.bank && row.bank===need.bank) score+=2;
    if((row.slot_candidates||[]).includes(need.category)) score+=4;

    if(need.category==='aggressive'){
      if(dna.speculative_required) return 0;
      if(['AI_CORE','MEMORY_TACTICAL','TURNAROUND_TACTICAL'].includes(dna.personality)) score+=3;
    }

    if(need.category==='short_spec'){
      if(dna.speculative_required) score+=4;
      if(dna.dual_type_allowed) score+=2;
      if(n(row.tenor_month,0)<=6) score+=1;
    }

    if(need.category==='defensive_balance'){
      if(dna.personality==='DEFENSIVE_PLATFORM') score+=5;
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
    return need.bank===row.bank?10:5;
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

        const couponScore=marketCouponScore(row.coupon_pct);
        const conditionScore=fcnConditionScore(row);

        const m1=row.m1_score;
        const m7=row.m7_score;

        const fcnScore=
          0.40*couponScore +
          0.25*conditionScore +
          0.15*m1 +
          0.20*m7;

        matched.push({
          ...row,
          need_id:need.need_id,
          need_title:need.title||need.category,
          target_amount:need.target_amount,
          min_amount:need.min_amount,

          m8_fair_rate:Number(m8Fair.toFixed(2)),
          final_fair_ref:Number(finalRef.toFixed(2)),
          fair_gap:Number(fairGap.toFixed(2)),

          market_coupon_score:Number(couponScore.toFixed(2)),
          fcn_condition_score:Number(conditionScore.toFixed(2)),
          fcn_score:Number(fcnScore.toFixed(3)),

          candidate_score:Number(fcnScore.toFixed(3)),

          planner_need_match:match,
          risk_fit_score:risk,
          bank_fit_score:bank,

          amount_wan:Math.max(1,Math.round(n(need.min_amount,30000)/10000)),

          action:fcnScore>=8?'Promote':fcnScore>=6.5?'Update':'Watch'
        });
      });

      const ranked=(diversity?diversity.applyDiversity(matched.sort((a,b)=>b.fcn_score-a.fcn_score)):matched)
        .sort((a,b)=>b.candidate_score-a.candidate_score);

      counters.displayed=Math.min(10,ranked.length);

      result[need.need_id]={
        need,
        candidates:ranked.slice(0,10),
        diagnostics:counters
      };
    });

    return {planner,rows,result};
  }

  window.M2MarketCandidateEngine={
    fallbackPlannerResult,
    getPlannerResult,
    buildMarketCandidatesFromPlanner
  };
})();
