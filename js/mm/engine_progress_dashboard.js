(function(){
  function setError(msg){
    const box=document.getElementById('dashboard-error');
    if(!box) return;
    box.style.display='block';
    box.textContent=msg;
  }

  function clearError(){
    const box=document.getElementById('dashboard-error');
    if(!box) return;
    box.style.display='none';
    box.textContent='';
  }

  function init(){
    clearError();

    if(!window.__MM_M7_RUNTIME_LOADED__){
      setError('MM modular runtime not loaded: js/mm/modules/mm_m7_runtime_full.js');
      return;
    }

    // mm_m7_runtime_full.js 已經內部自動 init()
    // 所以這裡不用再呼叫 MMFullRuntime.init()
  }

  window.MMRefreshAll=function(){
    if(window.MMFullRuntime && typeof window.MMFullRuntime.refreshImpactOnly==='function'){
      window.MMFullRuntime.refreshImpactOnly();
    }
  };

  init();
})();
