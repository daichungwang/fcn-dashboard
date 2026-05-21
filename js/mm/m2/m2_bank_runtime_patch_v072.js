// ============================================================
// M2 Bank Runtime Patch v072
// ============================================================
(function(){
  if(window.__M2_BANK_RUNTIME_PATCH_V072__) return;
  window.__M2_BANK_RUNTIME_PATCH_V072__ = true;

  const BANK_TARGETS_WAN = { '富邦':110, '永豐':40 };
  const TOTAL_TARGET_WAN = 150;
  const TARGET_BANK_USD = { '富邦':1100000, '永豐':400000 };

  const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  const arr=v=>Array.isArray(v)?v:[];
  const sumAmt=rows=>arr(rows).reduce((s,x)=>s+n(x&&x.amt,0),0);
  const wan=usd=>Math.floor(n(usd,0)/10000);

  function includesBank(row, bank){
    return String((row && (row.tw_bank || row.bank || row.broker)) || '').includes(bank);
  }

  let lastSig='';
  function enrich(){
    const ctx=window.__M2_RUNTIME_CONTEXT__;
    if(!ctx||!ctx.groups) return false;

    const g=ctx.groups||{};
    const active=arr(g.active);
    const base=arr(g.base);

    const activeFubon=sumAmt(active.filter(x=>includesBank(x,'富邦')));
    const activeSinopac=sumAmt(active.filter(x=>includesBank(x,'永豐')));
    const baseTotal=sumAmt(base);

    const payload={
      bank_amounts_wan:{'富邦':wan(activeFubon),'永豐':wan(activeSinopac)},
      bank_targets_wan:BANK_TARGETS_WAN,
      target_bank:TARGET_BANK_USD,
      total_target_wan:TOTAL_TARGET_WAN,
      planning_base_wan:wan(baseTotal),
      bank_runtime_patch_version:'v072_bank_targets_110_40'
    };

    const sig=JSON.stringify(payload);
    if(sig===lastSig) return true;

    Object.assign(ctx,payload);
    lastSig=sig;

    const old=document.getElementById('m2v070PlanningBlueprint');
    if(old) old.remove();

    return true;
  }

  function boot(){
    try{enrich();}catch(err){console.warn('M2 bank runtime patch failed',err);}
  }

  setInterval(boot,700);
  document.addEventListener('DOMContentLoaded',boot);
  document.addEventListener('click',()=>setTimeout(boot,150),true);
})();
