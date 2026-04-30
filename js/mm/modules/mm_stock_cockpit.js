(function(){
  function symbols(state){ const r=Array.isArray(state.data.marketRuntime)?state.data.marketRuntime:[]; return r.map(x=>x.symbol).filter(Boolean); }
  function render(state){ const el=MMUI.q('c1-stock-cockpit'); if(!el) return; const syms=symbols(state); if(!syms.includes(state.symbol)&&syms.length) state.symbol=syms[0];
    el.innerHTML=`<div class='search-row'><input id='c1-search' placeholder='Search symbol/name'><select id='c1-symbol'>${syms.map(s=>`<option ${s===state.symbol?'selected':''}>${s}</option>`).join('')}</select></div><div class='grid-2'><div class='panel'><h3>Current Position</h3><div class='metric'><span>price/category</span><b>-- / --</b></div><div class='metric'><span>M2 exposure</span><b>--</b></div><div class='metric'><span>M6 exposure</span><b>--</b></div></div><div class='panel'><h3>Technical Today</h3><div class='metric'><span>1D/1W/1M/3M/6M/12M</span><b>--</b></div><div class='metric'><span>short swing/trend/structure/money</span><b>--</b></div></div></div><div class='grid-2'><div class='panel'><h3>M7 Today Decision</h3><div class='metric'><span>M7 score + factors</span><b>--</b></div></div><div class='panel'><h3>M1 Quality Decision</h3><div class='metric'><span>M1 score/category/pool30</span><b>--</b></div></div></div>`;
    MMUI.q('c1-symbol')?.addEventListener('change',e=>MMState.set({symbol:e.target.value}));
    MMUI.q('c1-search')?.addEventListener('input',e=>{const t=e.target.value.toUpperCase(); const pick=syms.find(s=>s.includes(t)); if(pick) MMState.set({symbol:pick});});
  }
  window.MMModuleCockpit={render};
})();
