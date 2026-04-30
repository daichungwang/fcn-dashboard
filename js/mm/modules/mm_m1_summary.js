(function(){
  function arr(v){return Array.isArray(v)?v:[]}
  function render(state){
    const e=MMUI.q('b5-m1-summary'); if(!e) return;
    const candidates=arr(state.data.m1Candidates);
    const pool30=arr(state.data.pool30);
    const profiles=state.data.m1Profiles && !Array.isArray(state.data.m1Profiles)?Object.values(state.data.m1Profiles):arr(state.data.m1Profiles);
    const research=profiles.filter(x=>x && (x.research_coverage||x.has_research||x.coverage)).length;
    const pass=candidates.filter(x=>(+x.m7_lite_score||+x.m1_score||0)>=75).length;
    const cat={}; candidates.forEach(x=>{const c=x.category||'--'; cat[c]=(cat[c]||0)+1;});
    const catText=Object.entries(cat).slice(0,3).map(([k,v])=>`${k}:${v}`).join(' | ')||'--';
    e.innerHTML=`
      <div class='metric'><span>Candidate count</span><b>${candidates.length}</b></div>
      <div class='metric'><span>Pool30 count</span><b>${pool30.length}</b></div>
      <div class='metric'><span>Research coverage</span><b>${research}</b></div>
      <div class='metric'><span>Filter pass count</span><b>${pass}</b></div>
      <div class='metric'><span>Category distribution</span><b>${catText}</b></div>
      <a href='../m1.html'><button>Go M1 Module</button></a>`;
  }
  window.MMModuleM1={render};
})();
