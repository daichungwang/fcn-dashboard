// ============================================================
// M2 Market Row Classifier v71
// Path: js/mm/m2/m2_market_row_classifier.js
// Purpose: classify market_fcn_history rows for M2/4D selector.
// Core idea: FCN is a worst-of product. Basket type is decided by
// worst-of risk hierarchy, not by single stock labels or coupon sorting.
// ============================================================
(function(){
  if(window.M2MarketRowClassifier) return;

  const n=(v,d=null)=>Number.isFinite(Number(v))?Number(v):d;

  const STOCK_RISK_CLASS={
    // Defensive / stabilizers
    GOOG:'DEFENSIVE', GOOGL:'DEFENSIVE', AAPL:'DEFENSIVE', MSFT:'DEFENSIVE',
    LQD:'DEFENSIVE', UNH:'DEFENSIVE', REGN:'DEFENSIVE', QQQ:'DEFENSIVE',

    // Core AI / institutional liquid growth
    NVDA:'CORE_AI', TSM:'CORE_AI', AVGO:'CORE_AI', SMH:'CORE_AI',
    AMAT:'CORE_AI', QCOM:'CORE_AI', AMD:'CORE_AI', ORCL:'CORE_AI', META:'CORE_AI', AMZN:'CORE_AI',

    // Aggressive / tactical / cyclical / turnaround
    MU:'AGGRESSIVE', SNDK:'AGGRESSIVE', WDC:'AGGRESSIVE', INTC:'AGGRESSIVE',
    MRVL:'AGGRESSIVE', ARM:'AGGRESSIVE', TSLA:'AGGRESSIVE',

    // Speculative / narrative / high beta
    COIN:'SPECULATIVE', SOFI:'SPECULATIVE', ALAB:'SPECULATIVE', CRDO:'SPECULATIVE',
    PLTR:'SPECULATIVE', COHR:'SPECULATIVE', LITE:'SPECULATIVE', SMCI:'SPECULATIVE'
  };

  const RISK_RANK={UNKNOWN:0,DEFENSIVE:1,CORE_AI:2,AGGRESSIVE:3,SPECULATIVE:4};

  function normalizeSymbol(x){
    return String(x||'')
      .trim()
      .toUpperCase()
      .replace(/\s+(UW|UN|UQ|UR)$/,'')
      .replace(/\s+/g,'');
  }

  function normalizeBasketSymbols(v){
    const raw=Array.isArray(v)?v:String(v||'').split(/[,+/|;\s]+/);
    return raw.map(normalizeSymbol).filter(Boolean).filter(s=>s!=='-'&&s!=='--');
  }

  function normalizedBasketKey(symbols){
    return Array.from(new Set(normalizeBasketSymbols(symbols))).sort().join('+');
  }

  function sourceToBank(source){
    const s=String(source||'').toLowerCase();
    if(s.includes('sinopac')||s.includes('永豐')) return '永豐';
    if(s.includes('fubon')||s.includes('富邦')) return '富邦';
    return source||'-';
  }

  function getStockRiskClass(symbol){
    return STOCK_RISK_CLASS[normalizeSymbol(symbol)]||'UNKNOWN';
  }

  function getBasketRiskBreakdown(symbols){
    return (symbols||[]).map(symbol=>({
      symbol,
      risk_class:getStockRiskClass(symbol),
      rank:RISK_RANK[getStockRiskClass(symbol)]||0
    }));
  }

  function getWorstOfRiskClass(symbols){
    const breakdown=getBasketRiskBreakdown(symbols);
    if(!breakdown.length) return 'UNKNOWN';
    return breakdown.slice().sort((a,b)=>b.rank-a.rank)[0].risk_class;
  }

  function classifyBasketDNA(symbols){
    const list=normalizeBasketSymbols(symbols);
    const breakdown=getBasketRiskBreakdown(list);
    const worst_class=getWorstOfRiskClass(list);
    const classes=new Set(breakdown.map(x=>x.risk_class));

    const dna={
      engine:'worst_of_base_v71',
      worst_of_risk_class:worst_class,
      risk_breakdown:breakdown,
      basket_tags:[],
      basket_type:'watch',
      final_fcn_type:'watch',
      aggressive_allowed:false,
      speculative_required:false,
      dual_type_allowed:false,
      conservative_income_allowed:false,
      defensive_income_allowed:false
    };

    if(worst_class==='SPECULATIVE'){
      dna.basket_type='SPECULATIVE';
      dna.final_fcn_type='short_spec';
      dna.basket_tags=['WORST_OF_SPECULATIVE','HIGH_BETA'];
      dna.speculative_required=true;
      return dna;
    }

    if(worst_class==='AGGRESSIVE'){
      dna.basket_type='AGGRESSIVE';
      dna.final_fcn_type='dual';
      dna.basket_tags=['WORST_OF_AGGRESSIVE','TACTICAL'];
      dna.aggressive_allowed=true;
      dna.dual_type_allowed=true;
      return dna;
    }

    if(classes.has('CORE_AI') && classes.has('DEFENSIVE')){
      dna.basket_type='CONSERVATIVE_INCOME';
      dna.final_fcn_type='conservative_income';
      dna.basket_tags=['DEFENSIVE_PLUS_CORE_AI','CASHFLOW'];
      dna.conservative_income_allowed=true;
      return dna;
    }

    if(worst_class==='CORE_AI'){
      dna.basket_type='CONSERVATIVE_INCOME';
      dna.final_fcn_type='conservative_income';
      dna.basket_tags=['CORE_AI_CASHFLOW'];
      dna.conservative_income_allowed=true;
      return dna;
    }

    if(worst_class==='DEFENSIVE'){
      dna.basket_type='DEFENSIVE_INCOME';
      dna.final_fcn_type='defensive_income';
      dna.basket_tags=['DEFENSIVE_ONLY','LOW_VOL'];
      dna.defensive_income_allowed=true;
      return dna;
    }

    return dna;
  }

  function detectTemplate(symbols){
    const dna=classifyBasketDNA(symbols);
    if(dna.basket_type==='SPECULATIVE') return 'D_SPECULATIVE';
    if(dna.basket_type==='AGGRESSIVE') return 'B_TACTICAL_AGGRESSIVE';
    if(dna.basket_type==='CONSERVATIVE_INCOME') return 'A_CONSERVATIVE_INCOME';
    if(dna.basket_type==='DEFENSIVE_INCOME') return 'E_DEFENSIVE_INCOME';
    return 'F_OTHERS';
  }

  function tenorBucket(tenor){
    tenor=n(tenor,0);
    if(tenor<=3) return 'VERY_SHORT';
    if(tenor<=6) return 'SHORT';
    if(tenor<=9) return 'MID';
    if(tenor<=12) return 'LONG';
    return 'VERY_LONG';
  }

  function riskBucket(strike,ki,tenor){
    strike=n(strike,0);
    ki=n(ki,0);
    tenor=n(tenor,0);
    let score=0;
    if(strike>=80) score+=4; else if(strike>=75) score+=3; else if(strike>=70) score+=2; else if(strike>=65) score+=1;
    if(ki>=70) score+=4; else if(ki>=65) score+=3; else if(ki>=60) score+=2; else if(ki>=55) score+=1;
    if(tenor>=12) score+=1;
    if(score>=7) return 'VERY_HIGH';
    if(score>=5) return 'HIGH';
    if(score>=3) return 'MEDIUM_HIGH';
    if(score>=2) return 'MEDIUM';
    if(score>=1) return 'MEDIUM_LOW';
    return 'LOW';
  }

  function categoryCandidates(row){
    const out=[];
    const dna=row.basket_dna||{};

    if(dna.basket_type==='SPECULATIVE') return ['short_spec'];
    if(dna.basket_type==='AGGRESSIVE') return ['short_spec','aggressive'];
    if(dna.basket_type==='CONSERVATIVE_INCOME') return ['core_income','conservative_income'];
    if(dna.basket_type==='DEFENSIVE_INCOME') return ['defensive_balance','core_income'];

    out.push('watch');
    return out;
  }

  function classifyMarketRow(row,idx=0){
    const symbols=normalizeBasketSymbols(row.symbols||row.basket||row.basket_display);
    const coupon=n(row.coupon_pct??row.market_coupon??row.market_rate,null);
    const tenor=n(row.tenor_month??row.tenor,null);
    const strike=n(row.strike_pct??row.strike,null);
    const ki=n(row.ki_pct??row.ki,null);

    const basket_dna=classifyBasketDNA(symbols);

    const classified={
      ...row,
      row_index:idx,
      product_id:row.product_id||row.fcn_id||`MKT-${idx+1}`,
      source:row.source||'-',
      bank:sourceToBank(row.source),
      symbols,
      basket_key:normalizedBasketKey(symbols),
      coupon_pct:coupon,
      tenor_month:tenor,
      strike_pct:strike,
      ki_pct:ki,
      barrier_type:row.barrier_type||row.type||'NA',
      memory_type:row.memory_type||row.memory||'',
      upstream_bank:row.upstream_bank||'-',
      basket_dna,
      basket_type:basket_dna.basket_type,
      worst_of_risk_class:basket_dna.worst_of_risk_class,
      risk_breakdown:basket_dna.risk_breakdown,
      m1_score:n(row.m1_score,6),
      m7_score:n(row.m7_score,6),
      m1_fallback:!Number.isFinite(Number(row.m1_score)),
      m7_fallback:!Number.isFinite(Number(row.m7_score))
    };

    classified.template_group=detectTemplate(symbols);
    classified.tenor_bucket=tenorBucket(tenor);
    classified.risk_bucket=riskBucket(strike,ki,tenor);
    classified.slot_candidates=categoryCandidates(classified);
    classified.final_fcn_type=basket_dna.final_fcn_type;

    return classified;
  }

  window.M2MarketRowClassifier={
    normalizeBasketSymbols,
    normalizedBasketKey,
    sourceToBank,
    getStockRiskClass,
    getBasketRiskBreakdown,
    getWorstOfRiskClass,
    detectTemplate,
    classifyBasketDNA,
    tenorBucket,
    riskBucket,
    classifyMarketRow
  };
})();
