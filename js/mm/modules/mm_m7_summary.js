(function(){
  function rowsFrom(raw){ return Array.isArray(raw)?raw:(raw&&Array.isArray(raw.rows)?raw.rows:[]); }
  function render(state){
    const el=MMUI.q('b4-m7-summary'); if(!el) return;
    const rows=rowsFrom(state.data.m7Scores); const audit=state.data.m7Audit||{};
    const avg=rows.length?rows.reduce((a,b)=>a+(Number(b.m7_score||b.score)||0),0)/rows.length:NaN;
    const selected=rows.filter(r=>r.selected||r.is_selected).length;
    const cat={}; rows.forEach(r=>{const c=(r.category||'unknown'); cat[c]=(cat[c]||0)+1;});
    const whySel=`score≥80: ${rows.filter(r=>(+r.m7_score||0)>=80).length}`;
    const whyNot=`valuation weak:${audit.valuation_weak_count??'--'} trend weak:${audit.trend_weak_count??'--'} structure weak:${audit.structure_weak_count??'--'}`;
    el.innerHTML=`<div class='metric'><span>M7 rows</span><b>${rows.length||'--'}</b></div>
      <div class='metric'><span>M7 average score</span><b>${MMUI.num(avg)}</b></div>
      <div class='metric'><span>Selected / total</span><b>${selected}/${rows.length||'--'}</b></div>
      <div class='metric'><span>Category breakdown</span><b>${Object.entries(cat).map(([k,v])=>`${k}:${v}`).join(' | ')||'--'}</b></div>
      <div class='metric'><span>Why selected</span><b>${whySel}</b></div>
      <div class='metric'><span>Why not selected</span><b>${whyNot}</b></div>
      <div class='metric'><span>Formula test summary</span><b>Val:${audit.valuation_weight??'--'} Trend:${audit.trend_weight??'--'} Struct:${audit.structure_weight??'--'} Money:${audit.money_weight??'--'}</b></div>
      <div class='metric'><span>V/T/S/M factors</span><b>${audit.valuation_avg??'--'} / ${audit.trend_avg??'--'} / ${audit.structure_avg??'--'} / ${audit.money_avg??'--'}</b></div>
      <div class='metric'><span>Fallback / warning count</span><b>${audit.fallback_count??'--'} / ${audit.warning_count??'--'}</b></div>
      <div class='metric'><span>M7 ↔ Formula Test linkage</span><b>${rows.length?'Linked':'--'}</b></div>
      <div style='margin-top:10px;display:flex;gap:8px;'><a href='m7.html'><button>Go M7</button></a><a href='formula_test.html'><button>Go Formula Test</button></a></div>`;
  }
  window.MMModuleM7={render};
})();
