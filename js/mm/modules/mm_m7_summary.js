(function(){
  function rowsFrom(raw){ return Array.isArray(raw)?raw:(raw&&Array.isArray(raw.rows)?raw.rows:[]); }
  function render(state){
    const el=MMUI.q('b4-m7-summary'); if(!el) return;
    const rows=rowsFrom(state.data.m7Scores);
    const avg=rows.length?rows.reduce((a,b)=>a+(Number(b.m7_score||b.score)||0),0)/rows.length:NaN;
    const top=rows.filter(r=>r.selected||r.is_selected).length;
    const cat={}; rows.forEach(r=>{const c=(r.category||'unknown').toLowerCase(); cat[c]=(cat[c]||0)+1;});
    const audit=state.data.m7Audit&& !state.data.m7Audit.__missing?state.data.m7Audit:{};
    el.innerHTML=`<div class='metric'><span>M7 Rows</span><b>${rows.length||'--'}</b></div>
    <div class='metric'><span>M7 Average Score</span><b>${MMUI.num(avg)}</b></div>
    <div class='metric'><span>Top selected qty / total qty</span><b>${top}/${rows.length||'--'}</b></div>
    <div class='metric'><span>Category breakdown</span><b>${Object.entries(cat).map(([k,v])=>`${k} ${v}`).join(', ')||'--'}</b></div>
    <div class='metric'><span>Why not selected</span><b>valuation:${audit.valuation_weak_count??'--'} trend:${audit.trend_weak_count??'--'} structure:${audit.structure_weak_count??'--'} warning:${audit.warning_count??'--'} fallback:${audit.fallback_count??'--'}</b></div>
    <div class='metric'><span>Formula Test Summary</span><b>v:${audit.valuation_weight??'--'} t:${audit.trend_weight??'--'} s:${audit.structure_weight??'--'} m:${audit.money_weight??'--'}</b></div>
    <div class='metric'><span>Factor Summary</span><b>v:${audit.valuation_avg??'--'} t:${audit.trend_avg??'--'} s:${audit.structure_avg??'--'} m:${audit.money_avg??'--'}</b></div>
    <div class='metric'><span>Data Quality</span><b>fallback:${audit.fallback_count??'--'} warning:${audit.warning_count??'--'} missing runtime:${audit.missing_runtime_count??'--'}</b></div>
    <div class='metric'><span>Linkage</span><b>scores:${rows.length?'ok':'--'} param:${audit?'ok':'--'} formula:${location.href.includes('mm/')?'exists':'--'} status:linked</b></div>
    <div style='margin-top:10px;display:flex;gap:8px;'><a href='m7.html'><button>Go M7</button></a><a href='formula_test.html'><button>Go Formula Test</button></a></div>`;
  }
  window.MMModuleM7={render};
})();
