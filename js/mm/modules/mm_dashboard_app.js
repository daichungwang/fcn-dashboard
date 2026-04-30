(function(){
 async function init(){ const st=MMState.get(); if(st.initialized) return; MMState.set({initialized:true});
  const loaded=await MMDataLoader.loadAll(); MMState.set({data:loaded.data,warnings:loaded.warnings,demoUsed:loaded.demoUsed});
  MMUI.setWarningBadge(loaded.warnings,loaded.demoUsed);
  MMUI.q('ui-check-toggle')?.addEventListener('click',()=>MMState.set({uiCheckMode:!MMState.get().uiCheckMode}));
  renderAll(); MMState.onChange(()=>renderAll());
 }
 function renderAll(){ const s=MMState.get(); MMModuleTop?.render(s); MMModuleM7?.render(s); MMModuleM2?.render(s); MMModuleM6?.render(s); MMModuleM3?.render(s); MMModuleM1?.render(s); MMModuleCockpit?.render(s); MMModuleRadar?.render(s); MMUI.updateDebugPanel(s);
 ['b4-m7-summary','c1-stock-cockpit','c2-all-stock-radar'].forEach(id=>{const el=MMUI.q(id); if(el) el.style.outline=s.uiCheckMode?'3px solid #ef4444':'none';});
 }
 window.addEventListener('DOMContentLoaded',init);
})();
