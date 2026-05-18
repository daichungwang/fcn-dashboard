// ============================================================
// M2 Market Row Classifier v69
// Path: js/mm/m2/m2_market_row_classifier.js
// Purpose: classify market_fcn_history rows for M2/4D selector.
// ============================================================
(function(){
  if(window.M2MarketRowClassifier) return;

  const n=(v,d=null)=>Number.isFinite(Number(v))?Number(v):d;

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

  function detectTemplate(symbols){
    const set=new Set(normalizeBasketSymbols(symbols));
    if(['MU','SNDK'].some(s=>set.has(s))) return 'B_MEMORY';
    if(['COIN','SOFI','ALAB','CRDO','PLTR'].some(s=>set.has(s))) return 'D_SPECULATIVE';
    if(['AAPL','GOOG','GOOGL','MSFT','LQD','UNH','REGN','PG','KO'].some(s=>set.has(s))) return 'E_DEFENSIVE';
    if(['NVDA','TSM','AVGO','SMH','AMD','MRVL','ARM','AMAT','QCOM','ORCL','INTC'].some(s=>set.has(s))) return 'A_AI_CORE';
    if(['TSLA'].some(s=>set.has(s))) return 'C_TSLA_MOMENTUM';
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
    const coupon=n(row.coupon_pct,0);
    const tenor=n(row.tenor_month,0);
    const t=row.template_group;
    const out=[];
    if(tenor<=6 && (coupon>=18 || ['B_MEMORY','D_SPECULATIVE','C_TSLA_MOMENTUM'].includes(t))) out.push('short_spec');
    if(coupon>=18 || ['A_AI_CORE','B_MEMORY','D_SPECULATIVE'].includes(t)) out.push('aggressive');
    if(coupon>=12 && tenor>=6) out.push('core_income');
    if(['E_DEFENSIVE','F_INCOME'].includes(t) || ['AAPL','GOOG','GOOGL','MSFT','LQD'].some(s=>row.symbols.includes(s))) out.push('defensive_balance');
    if(!out.length) out.push('watch');
    return out;
  }

  function classifyMarketRow(row,idx=0){
    const symbols=normalizeBasketSymbols(row.symbols||row.basket||row.basket_display);
    const coupon=n(row.coupon_pct??row.market_coupon??row.market_rate,null);
    const tenor=n(row.tenor_month??row.tenor,null);
    const strike=n(row.strike_pct??row.strike,null);
    const ki=n(row.ki_pct??row.ki,null);
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
      upstream_bank:row.upstream_bank||'-'
    };
    classified.template_group=detectTemplate(symbols);
    classified.tenor_bucket=tenorBucket(tenor);
    classified.risk_bucket=riskBucket(strike,ki,tenor);
    classified.slot_candidates=categoryCandidates(classified);
    return classified;
  }

  window.M2MarketRowClassifier={
    normalizeBasketSymbols,
    normalizedBasketKey,
    sourceToBank,
    detectTemplate,
    tenorBucket,
    riskBucket,
    classifyMarketRow
  };
})();
