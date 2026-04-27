window.MMBlueprint=(function(){

function render(){

  const box=document.getElementById("m7-formula-registry");
  if(!box) return;

  box.innerHTML=`
    <pre>
M7 Score =
0.45 valuation
+0.25 trend
+0.20 structure
+0.10 money

Trend =
0.5 linear
+0.3 ma200
+0.2 acceleration
    </pre>
  `;
}

return {render};

})();
