(function(){
  function compute(rows){ return {movers:rows.slice(0,3).map(r=>r.symbol),warnings:rows.filter(r=>(+r.totalExposure||0)>20).map(r=>r.symbol)}; }
  window.MMAlertEngine={compute};
})();
