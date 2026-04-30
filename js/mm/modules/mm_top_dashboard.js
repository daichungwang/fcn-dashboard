(function(){
  function arr(v){
    if(Array.isArray(v)) return v;
    if(v && Array.isArray(v.rows)) return v.rows;
    if(v && Array.isArray(v.data)) return v.data;
    if(v && Array.isArray(v.scores)) return v.scores;
    return [];
  }

  function num(v,d=2){
    const n=Number(v);
    return Number.isFinite(n)?n.toFixed(d):'--';
  }

  function sum(list,key){
    return arr(list).reduce((a,b)=>a+(+b[key]||0),0);
  }

  function avg(list,key){
    const rows=arr(list).filter(x=>Number.isFinite(+x[key]));
    if(!rows.length) return '--';
    return num(rows.reduce((a,b)=>a+(+b[key]||0),0)/rows.length);
  }

  function card(name,status,k1,v1,k2,v2,go){
    return `
      <div class="module-card">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
          <b>${name}</b>
          <span class="pill ${status==='Ready'?'ok':'warn'}">${status}</span>
        </div>
        <div class="metric"><span>${k1}</span><b>${v1}</b></div>
        <div class="metric"><span>${k2}</span><b>${v2}</b></div>
        <a href="${go}"><button>Go ${name}</button></a>
      </div>
    `;
  }

  function render(state){
    const el=MMUI.q('top-dashboard');
    if(!el) return;

    const data=state.data||{};
    const m7Rows=arr(data.m7Scores);
    const m1Rows=arr(data.m1Candidates);
    const positions=arr(data.positions);
    const fcnPool=arr(data.fcnPool);

    const m7Count=m7Rows.length;
    const m7Avg=avg(m7Rows,'m7_score');

    const m1Count=m1Rows.length;
    const stockExposure=sum(positions,'exposure');
    const fcnExposure=sum(fcnPool,'amount') || sum(fcnPool,'notional') || sum(fcnPool,'total_amount');

    el.innerHTML =
      card('M1','Ready','Candidates',m1Count,'Coverage','--','../m1.html')+
      card('M2','Ready','FCN Exposure',num(fcnExposure),'Risk Alerts','--','../m2.html')+
      card('M3','Watch','Scenarios','--','Qualified','--','../m7_basket.html')+
      card('M6','Watch','Stock Exposure',num(stockExposure),'Actions','--','../m6.html')+
      card('M7','Ready','Rows',m7Count,'Avg Score',m7Avg,'./m7.html')+
      card('M8','Watch','Fair Gap','--','Readiness','--','../m8_batch.html');
  }

  window.MMModuleTop={render};
})();
