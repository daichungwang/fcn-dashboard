(function(){
  function symbols(state){ const r=Array.isArray(state.data.marketRuntime)?state.data.marketRuntime:[]; return r.map(x=>x.symbol).filter(Boolean); }
  function rowFor(state,s){const r=Array.isArray(state.data.marketRuntime)?state.data.marketRuntime:[]; return r.find(x=>x.symbol===s)||{};}
  function render(state){ const el=MMUI.q('c1-stock-cockpit'); if(!el) return; const syms=symbols(state); if(!syms.includes(state.symbol)&&syms.length) state.symbol=syms[0]; const r=rowFor(state,state.symbol);
    el.innerHTML=`<div class='search-row'><input id='c1-search' placeholder='Search symbol/name'><select id='c1-symbol'>${syms.map(s=>`<option ${s===state.symbol?'selected':''}>${s}</option>`).join('')}</select><div class='pill ${state.demoUsed?'warn':'ok'}'>${state.demoUsed?'DEMO DATA':'LIVE DATA'}</div></div>
    <div class='grid-2'><div class='module-card'><b>Current Status</b><div class='metric'><span>Price</span><b>${MMUI.num(r.price)}</b></div><div class='metric'><span>Category</span><b>${r.category||'--'}</b></div><div class='metric'><span>M2/M6 exposure</span><b>${MMUI.num(r.total_exposure)}/--</b></div></div>
    <div class='module-card'><b>Technical Today</b><div class='metric'><span>1D/1W/1M</span><b>${MMUI.pct(r.change_1d)} / -- / --</b></div><div class='metric'><span>3M/6M/12M</span><b>-- / -- / --</b></div><div class='metric'><span>Swing/Trend/Structure/Money</span><b>-- / -- / -- / --</b></div></div></div>
    <div class='grid-2'><div class='module-card'><b>M7 Today Decision</b><div class='metric'><span>M7 score</span><b>${MMUI.num(r.m7_score)}</b></div><div class='metric'><span>Valuation/Trend/Structure/Money</span><b>-- / -- / -- / --</b></div><div class='metric'><span>FCN suitability</span><b>${(+r.m7_score||0)>=80?'Qualified':'Watch'}</b></div></div>
    <div class='module-card'><b>M1 Quality Decision</b><div class='metric'><span>M1 score</span><b>${MMUI.num(r.m1_score)}</b></div><div class='metric'><span>Pool30 / Research coverage</span><b>-- / --</b></div><div class='metric'><span>Delivery willingness</span><b>--</b></div></div></div>`;
    MMUI.q('c1-symbol')?.addEventListener('change',e=>MMState.set({symbol:e.target.value}));
    MMUI.q('c1-search')?.addEventListener('input',e=>{const t=e.target.value.toUpperCase(); const pick=syms.find(s=>s.includes(t)); if(pick) MMState.set({symbol:pick});});
  }
  window.MMModuleCockpit={render};
})();
