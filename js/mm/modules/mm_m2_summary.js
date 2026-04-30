(function(){
  function arr(v){return Array.isArray(v)?v:[]}
  function render(state){
    const e=MMUI.q('b1-m2-summary'); if(!e) return;
    const runtime=arr(state.data.marketRuntime);
    const fcn=arr(state.data.fcnPool);
    const pos=arr(state.data.positions);
    const exp=(x)=>+x.exposure||+x.total_exposure||0;
    const total=runtime.reduce((a,b)=>a+(+b.total_exposure||0),0) || pos.reduce((a,b)=>a+exp(b),0);
    const safe=runtime.filter(x=>(+x.total_exposure||0)>0 && (+x.total_exposure||0)<8).length;
    const tracking=runtime.filter(x=>(+x.total_exposure||0)>=8 && (+x.total_exposure||0)<15).length;
    const kiRisk=runtime.filter(x=>(+x.total_exposure||0)>=15).length;
    const earlyExit=fcn.filter(x=>String(x.status||'').toLowerCase().includes('early')).length;
    const maturity=fcn.filter(x=>String(x.status||'').toLowerCase().includes('maturity')).length;
    e.innerHTML=`
      <div class='metric'><span>Total FCN exposure</span><b>${MMUI.num(total)}</b></div>
      <div class='metric'><span>Safe positions</span><b>${safe||0}</b></div>
      <div class='metric'><span>Tracking positions</span><b>${tracking||0}</b></div>
      <div class='metric'><span>KI risk positions</span><b>${kiRisk||0}</b></div>
      <div class='metric'><span>Early exit candidates</span><b>${earlyExit||0}</b></div>
      <div class='metric'><span>Maturity upcoming</span><b>${maturity||0}</b></div>
      <a href='m7.html'><button>Go M2 Module</button></a>`;
  }
  window.MMModuleM2={render};
})();
