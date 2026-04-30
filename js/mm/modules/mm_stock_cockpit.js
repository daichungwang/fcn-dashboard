(function(){
  function arr(v){return Array.isArray(v)?v:[]}
  function symbols(state){const r=arr(state.data.marketRuntime); const s=r.map(x=>x.symbol).filter(Boolean); return s.length?s:['NVDA'];}
  function bySymbol(list,s){return arr(list).find(x=>(x.symbol||x.ticker||'')===s)||{};}
  function avg(list,key){const a=arr(list).map(x=>+x[key]).filter(Number.isFinite); return a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN;}
  function render(state){
    const el=MMUI.q('c1-stock-cockpit'); if(!el) return;
    const syms=symbols(state); if(!syms.includes(state.symbol)) state.symbol='NVDA';
    const s=state.symbol||'NVDA';
    const runtime=bySymbol(state.data.marketRuntime,s);
    const long=bySymbol(state.data.runtimeLong,s);
    const m7=bySymbol(state.data.m7Scores,s);
    const m1=bySymbol(state.data.m1Profiles,s) || bySymbol(state.data.m1Candidates,s);
    const cat=(runtime.category||m7.category||m1.category||'--'); const sub=(runtime.subcategory||m1.subcategory||'--');
    const price=+runtime.price; const d1=+runtime.change_1d; const w1=+runtime.change_1w; const m1p=+runtime.change_1m; const m3=+runtime.change_3m; const y1=+runtime.change_12m;
    const fair=+long.regression_fair_price_today; const conf=long.regression_confidence_level;
    const m1All=arr(state.data.m1Profiles); const m7All=arr(state.data.m7Scores); const sameCatM1=m1All.filter(x=>(x.subcategory||x.category)===sub || x.category===cat); const sameCatM7=m7All.filter(x=>(x.subcategory||x.category)===sub || x.category===cat);
    const conclusion=`${s}：M1 quality ${(+m1.m1_score||0)>=75?'strong':'mixed'}, M7 today ${(+m7.m7_score||0)>=80?'high':'moderate'}, exposure ${(+runtime.total_exposure||0)>=15?'already high':'manageable'}; suitable for tracking, not aggressive new FCN.`;
    const scoreBox=(name,val,subAvg,p30Avg)=>`<div class='module-card'><b>${name}</b><div class='metric'><span>${s}</span><b>${MMUI.num(val)}</b></div><div class='metric'><span>Sub-category avg</span><b>${MMUI.num(subAvg)}</b></div><div class='metric'><span>Pool30 avg</span><b>${MMUI.num(p30Avg)}</b></div></div>`;
    el.innerHTML=`
      <div class='search-row'>
        <select id='c1-symbol'>${syms.map(x=>`<option ${x===s?'selected':''}>${x}</option>`).join('')}</select>
        <input id='c1-search' placeholder='Search symbol'>
        <a href='../m1_new_stock.html'><button>Open m1_new_stock</button></a>
        <a href='../m1.html'><button>Open m1</button></a>
        <a href='m7.html'><button>Open M7</button></a>
      </div>
      <div class='module-card'>
        <div style='display:flex;justify-content:space-between;align-items:center'><h3 style='margin:0'>${s} ${runtime.name||m1.company_name||''}</h3><span class='pill ${state.demoUsed?'warn':'ok'}'>${state.demoUsed?'DEMO DATA':'LIVE DATA'}</span></div>
        <div class='sub'>Category: ${cat} | Sub-category: ${sub}</div>
        <div style='margin-top:8px;font-weight:700'>${conclusion}</div>
      </div>
      <div class='grid-2' style='margin-top:10px'>
        <div>
          <div class='module-card'><b>Price & Position</b>
            <div class='metric'><span>Today price / Delta %</span><b>${MMUI.num(price)} / ${MMUI.pct(d1)}</b></div>
            <div class='metric'><span>1W / 1M / 3M / 12M</span><b>${MMUI.pct(w1)} / ${MMUI.pct(m1p)} / ${MMUI.pct(m3)} / ${MMUI.pct(y1)}</b></div>
            <div class='metric'><span>Regression fair price today</span><b>${MMUI.num(fair)}</b></div>
            <div class='metric'><span>Regression confidence</span><b>${conf??'--'}</b></div>
            <div class='metric'><span>Price vs regression</span><b>${Number.isFinite(price)&&Number.isFinite(fair)?MMUI.pct((price-fair)/fair*100):'--'}</b></div>
            <div class='metric'><span>Price vs historical position</span><b>${runtime.historical_position??'--'}</b></div>
            <div class='metric'><span>Price position since December</span><b>${runtime.position_since_december??'--'}</b></div>
          </div>
        </div>
        <div>
          <div class='grid-2'>
            ${scoreBox('M1 score',m1.m1_score,avg(sameCatM1,'m1_score'),avg(state.data.pool30,'m1_score'))}
            ${scoreBox('M7 score',m7.m7_score,avg(sameCatM7,'m7_score'),avg(state.data.pool30,'m7_score'))}
            ${scoreBox('Valuation score',m7.valuation_score,avg(sameCatM7,'valuation_score'),avg(state.data.pool30,'valuation_score'))}
            ${scoreBox('Trend score',m7.trend_score,avg(sameCatM7,'trend_score'),avg(state.data.pool30,'trend_score'))}
            ${scoreBox('Structure score',m7.structure_score,avg(sameCatM7,'structure_score'),avg(state.data.pool30,'structure_score'))}
            ${scoreBox('Money score',m7.money_score,avg(sameCatM7,'money_score'),avg(state.data.pool30,'money_score'))}
          </div>
        </div>
      </div>
      <details><summary>M1 quality detail</summary><div class='sub'>M1 score: ${MMUI.num(m1.m1_score)} | Coverage: ${m1.research_coverage??'--'}</div></details>
      <details><summary>M7 today decision detail</summary><div class='sub'>M7: ${MMUI.num(m7.m7_score)} | Val/Trend/Struct/Money: ${MMUI.num(m7.valuation_score)} / ${MMUI.num(m7.trend_score)} / ${MMUI.num(m7.structure_score)} / ${MMUI.num(m7.money_score)}</div></details>
      <details><summary>Technical detail</summary><div class='sub'>Short swing: ${runtime.short_swing??'--'} | Trend: ${runtime.trend??'--'} | Structure: ${runtime.structure??'--'} | Money: ${runtime.money??'--'}</div></details>
      <details><summary>Exposure detail</summary><div class='sub'>M2 FCN exposure: ${runtime.m2_exposure??'--'} | M6 stock exposure: ${runtime.m6_exposure??'--'} | Total: ${runtime.total_exposure??'--'}</div></details>
      <details><summary>Research note detail</summary><div class='sub'>Delivery willingness: ${m1.delivery_willingness??'--'} | Notes: ${m1.note||'--'}</div></details>`;
    MMUI.q('c1-symbol')?.addEventListener('change',e=>MMState.set({symbol:e.target.value}));
    MMUI.q('c1-search')?.addEventListener('input',e=>{const t=e.target.value.toUpperCase(); const pick=syms.find(x=>x.includes(t)); if(pick) MMState.set({symbol:pick});});
  }
  window.MMModuleCockpit={render};
})();
