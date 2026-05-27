(function(){
  let loadingV2 = false;

  function legacyRows(state){
    const mr = Array.isArray(state.data.marketRuntime) ? state.data.marketRuntime : [];
    return mr.map((r,i)=>({rank:i+1,symbol:r.symbol||'--',price:r.price,oneD:r.change_1d,m1:r.m1_score,m7:r.m7_score,totalExposure:r.total_exposure||0,category:(r.category||'').toLowerCase()}));
  }

  function legacyRender(state){
    const el = MMUI.q('c2-all-stock-radar');
    if(!el) return;
    let rows = legacyRows(state);
    const f = state.radar || {category:'all',m7min:'',m1min:'',maxExposure:''};
    if(f.category !== 'all') rows = rows.filter(r=>r.category===f.category);
    if(f.m7min !== '') rows = rows.filter(r=>(+r.m7||0)>=+f.m7min);
    if(f.m1min !== '') rows = rows.filter(r=>(+r.m1||0)>=+f.m1min);
    if(f.maxExposure !== '') rows = rows.filter(r=>(+r.totalExposure||0)<=+f.maxExposure);
    el.innerHTML = `<details><summary>Filter Weight Drawer</summary>alert/ranking/volatility/exposure weights (display only)</details><div class='search-row'><select id='radar-view'><option value='alerts'>Alerts</option><option value='m7'>M7 Ranking</option></select><select id='radar-category'><option>all</option><option>core</option><option>growth</option><option>defensive</option><option>income</option><option>speculative</option></select><input id='radar-m7min' placeholder='M7 min'><input id='radar-m1min' placeholder='M1 min'><input id='radar-maxexp' placeholder='max exposure'></div><div id='radar-alerts' class='muted'></div><div class='table-wrap'><table><thead><tr><th>rank</th><th>alert</th><th>symbol</th><th>price</th><th>1D</th><th>M1</th><th>M7</th><th>total exposure</th><th>expand</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.rank}</td><td>--</td><td>${r.symbol}</td><td>${MMUI.num(r.price)}</td><td>${MMUI.pct(r.oneD)}</td><td>${MMUI.num(r.m1)}</td><td>${MMUI.num(r.m7)}</td><td>${MMUI.num(r.totalExposure)}</td><td><button class='radar-expand' data-symbol='${r.symbol}'>+</button></td></tr><tr id='x-${r.symbol}' style='display:none'><td colspan='9'>M1/M7/M2/M6 details; M3/M8 placeholder</td></tr>`).join('')}</tbody></table></div>`;
    const alerts = window.MMAlertEngine?.compute ? MMAlertEngine.compute(rows) : {movers:[],warnings:[]};
    MMUI.q('radar-alerts').textContent = `movers: ${alerts.movers.join(', ')} | high exposure: ${alerts.warnings.join(', ')}`;
    el.querySelectorAll('.radar-expand').forEach(b=>b.onclick=()=>{const x=MMUI.q(`x-${b.dataset.symbol}`); x.style.display=x.style.display==='none'?'table-row':'none';});
    ['radar-category','radar-m7min','radar-m1min','radar-maxexp'].forEach(id=>MMUI.q(id)?.addEventListener('change',()=>MMState.set({radar:{...MMState.get().radar,category:MMUI.q('radar-category').value,m7min:MMUI.q('radar-m7min').value,m1min:MMUI.q('radar-m1min').value,maxExposure:MMUI.q('radar-maxexp').value}})));
  }

  function hasV2Script(){
    return !!document.querySelector('script[src*="mm_c2_stock_radar_v2.js"]');
  }

  function waitForV2(callback, attempts = 20){
    if(window.MMModuleRadarV2?.render){
      window.MM_C2_STOCK_RADAR_V2_LOADED = true;
      callback(true);
      return;
    }
    if(attempts <= 0){
      callback(false);
      return;
    }
    setTimeout(() => waitForV2(callback, attempts - 1), 100);
  }

  function ensureV2(callback){
    if(window.MM_C2_STOCK_RADAR_V2_LOADED && window.MMModuleRadarV2?.render){
      callback(true);
      return;
    }
    if(window.MMModuleRadarV2?.render){
      window.MM_C2_STOCK_RADAR_V2_LOADED = true;
      callback(true);
      return;
    }
    if(hasV2Script()){
      loadingV2 = true;
      waitForV2(callback);
      return;
    }
    if(loadingV2){
      waitForV2(callback);
      return;
    }
    loadingV2 = true;
    const script = document.createElement('script');
    script.src = '../js/mm/modules/mm_c2_stock_radar_v2.js';
    script.onload = () => {
      window.MM_C2_STOCK_RADAR_V2_LOADED = true;
      waitForV2(callback);
    };
    script.onerror = () => {
      console.warn('[MMModuleRadar] C2 radar v2 load failed; keep existing C2 placeholder.');
      callback(false);
    };
    document.head.appendChild(script);
  }

  function render(state){
    ensureV2((loaded) => {
      if(loaded && window.MMModuleRadarV2?.render) {
        window.MMModuleRadarV2.render(state);
      }
    });
  }

  function renderFromCurrentState(){
    const container = document.getElementById('c2-all-stock-radar');
    if(!container) return;
    const state = window.MMState?.get ? MMState.get() : {data:{},radar:{category:'all',m7min:'',m1min:'',maxExposure:''}};
    render(state);
  }

  window.MMModuleRadar = { render, legacyRender };
  window.addEventListener('DOMContentLoaded', () => {
    if(document.getElementById('c2-all-stock-radar')) {
      setTimeout(renderFromCurrentState, 250);
    }
  });
})();
