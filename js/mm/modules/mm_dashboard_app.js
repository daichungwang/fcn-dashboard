(function(){
 async function init(){ const st=MMState.get(); if(st.initialized) return; MMState.set({initialized:true});
  const loaded=await MMDataLoader.loadAll(); MMState.set({data:loaded.data,warnings:loaded.warnings}); MMUI.setWarningBadge(loaded.warnings);
  renderAll(); MMState.onChange(()=>renderAll());
 }
 function renderAll(){ const s=MMState.get(); MMModuleTop?.render(s); MMModuleM7?.render(s); MMModuleM2?.render(s); MMModuleM6?.render(s); MMModuleM3?.render(s); MMModuleM1?.render(s); MMModuleCockpit?.render(s); MMModuleRadar?.render(s); }
 window.addEventListener('DOMContentLoaded',init);
})();
