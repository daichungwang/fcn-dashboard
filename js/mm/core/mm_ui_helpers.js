(function(){
  const q=(id)=>document.getElementById(id);
  const num=(v,d=2)=>Number.isFinite(Number(v))?Number(v).toFixed(d):'--';
  const pct=(v)=>Number.isFinite(Number(v))?`${Number(v).toFixed(2)}%`:'--';
  const badge=(t,c='warn')=>`<span class="pill ${c}">${t}</span>`;
  function setWarningBadge(keys){ const n=q('mm-warning-badge'); if(n) n.innerHTML=keys.length?badge(`Missing data: ${keys.join(', ')}`,'warn'):badge('All data sources loaded','ok'); }
  window.MMUI={q,num,pct,badge,setWarningBadge};
})();
