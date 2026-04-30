(function(){
  const state={initialized:false,data:{},warnings:[],demoUsed:false,symbol:'NVDA',radar:{view:'alerts',category:'all',risk:'',m7min:'',m1min:'',maxExposure:''},uiCheckMode:false};
  const listeners=[];
  function get(){return state;}
  function set(patch){Object.assign(state,patch); listeners.forEach(fn=>fn(state));}
  function onChange(fn){listeners.push(fn);}
  window.MMState={get,set,onChange};
})();
