(function(){
  const q=(id)=>document.getElementById(id);
  const num=(v,d=2)=>Number.isFinite(Number(v))?Number(v).toFixed(d):'--';
  const pct=(v)=>Number.isFinite(Number(v))?`${Number(v).toFixed(2)}%`:'--';
  const badge=(t,c='warn')=>`<span class="pill ${c}">${t}</span>`;
  function setWarningBadge(keys,demoUsed){ const n=q('mm-warning-badge'); if(!n) return; const m=keys.length?`Missing: ${keys.join(', ')}`:'All data sources loaded'; n.innerHTML=badge((demoUsed?'DEMO DATA | ':'')+m,keys.length?'warn':'ok'); }
  function updateDebugPanel(s){const d=q('mm-debug-panel'); if(!d) return; const has=(k)=>{const v=s.data[k]; return Array.isArray(v)?v.length>0:!!v;}; d.innerHTML=`<b>Debug Panel ${s.demoUsed?'- DEMO DATA':''}</b><div>market_runtime: ${has('marketRuntime')?'✅':'❌'}</div><div>m7: ${has('m7Scores')?'✅':'❌'}</div><div>m1: ${has('m1Candidates')?'✅':'❌'}</div><div>m2: ${has('positions')?'✅':'❌'}</div><div>m6: ${has('runtimeLong')?'✅':'❌'}</div><div>Missing: ${s.warnings.join(', ')||'none'}</div><div>Stock: ${s.symbol}</div><div>C2 View: ${s.radar.view}</div>`;}
  window.MMUI={q,num,pct,badge,setWarningBadge,updateDebugPanel};
})();
