(function(){
  function rowsFrom(raw){if(Array.isArray(raw)) return raw; if(raw&&Array.isArray(raw.rows)) return raw.rows; return []}
  function render(state){
    const el=MMUI.q('b4-m7-summary'); if(!el) return;
    const src=state.data.m7Scores||{}; const rows=rowsFrom(src); const audit=state.data.m7Audit||{};
    const avg=rows.length?rows.reduce((a,b)=>a+(+b.m7_score||+b.score||0),0)/rows.length:NaN;
    const selected=rows.filter(r=>r.selected||r.is_selected||(+r.m7_score||0)>=80).length;
    const cat={}; rows.forEach(r=>{const c=r.category||'Other'; cat[c]=(cat[c]||0)+1;});
    const whySel=rows.filter(r=>(+r.m7_score||0)>=80).length;
    const whyNotVal=rows.filter(r=>(+r.valuation_score||100)<60).length;
    const whyNotTrend=rows.filter(r=>(+r.trend_score||100)<60).length;
    const whyNotStruct=rows.filter(r=>(+r.structure_score||100)<60).length;
    const vAvg=rows.length?rows.reduce((a,b)=>a+(+b.valuation_score||0),0)/rows.length:NaN;
    const tAvg=rows.length?rows.reduce((a,b)=>a+(+b.trend_score||0),0)/rows.length:NaN;
    const sAvg=rows.length?rows.reduce((a,b)=>a+(+b.structure_score||0),0)/rows.length:NaN;
    const mAvg=rows.length?rows.reduce((a,b)=>a+(+b.money_score||0),0)/rows.length:NaN;
    el.innerHTML=`
      <div class='metric'><span>M7 rows</span><b>${rows.length}</b></div>
      <div class='metric'><span>M7 average score</span><b>${MMUI.num(avg)}</b></div>
      <div class='metric'><span>Selected / total</span><b>${selected}/${rows.length}</b></div>
      <div class='metric'><span>Category breakdown</span><b>${Object.entries(cat).map(([k,v])=>`${k}:${v}`).join(' | ')||'--'}</b></div>
      <div class='metric'><span>Why selected</span><b>High score candidates: ${whySel}</b></div>
      <div class='metric'><span>Why not selected</span><b>Val weak:${whyNotVal} | Trend weak:${whyNotTrend} | Struct weak:${whyNotStruct}</b></div>
      <div class='metric'><span>Formula test summary</span><b>Val:${audit.valuation_weight??'--'} Trend:${audit.trend_weight??'--'} Struct:${audit.structure_weight??'--'} Money:${audit.money_weight??'--'}</b></div>
      <div class='metric'><span>Val/Trend/Structure/Money avg</span><b>${MMUI.num(vAvg)} / ${MMUI.num(tAvg)} / ${MMUI.num(sAvg)} / ${MMUI.num(mAvg)}</b></div>
      <div class='metric'><span>Fallback / Warning count</span><b>${audit.fallback_count??0} / ${audit.warning_count??0}</b></div>
      <div class='metric'><span>M7 ↔ Formula Test linkage</span><b>${rows.length?'Connected':'--'} | Config:${audit? 'Loaded':'--'}</b></div>
      <div class='metric'><span>Generated at / Scope</span><b>${src.generated_at||'--'} / ${src.scope||'--'}</b></div>
      <div style='margin-top:10px;display:flex;gap:8px;'><a href='m7.html'><button>Go M7</button></a><a href='formula_test.html'><button>Go Formula Test</button></a></div>`;
  }
  window.MMModuleM7={render};
})();
