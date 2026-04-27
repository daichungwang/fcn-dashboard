window.MMParameterBrain = (function(){

function n(v,d=0){
  const x=Number(v);
  return Number.isFinite(x)?x:d;
}

function renderMainWeights(){

  const box=document.getElementById("m7-main-weight-controls");
  if(!box) return;

  const w = MM_STATE.config.m7_v2_weights || {};

  const keys=["valuation","trend","structure","timing","money"];

  box.innerHTML=keys.map(k=>`
    <div class="form-row">
      <div>${k}</div>
      <div>${n(w[k]).toFixed(2)}</div>
      <div>
        <input class="mm-weight-input"
               data-key="${k}"
               value="${n(w[k]).toFixed(2)}"/>
      </div>
      <div>0</div>
    </div>
  `).join("");
}

function renderTrendWeights(){

  const box=document.getElementById("trend-internal-weight-controls");
  if(!box) return;

  const t = MM_STATE.config?.trend?.internal_weights || {};

  const keys=["linear","ma200","acceleration"];

  box.innerHTML=keys.map(k=>`
    <div class="form-row">
      <div>${k}</div>
      <div>${n(t[k]).toFixed(2)}</div>
      <div>
        <input class="mm-weight-input"
               data-key="${k}"
               value="${n(t[k]).toFixed(2)}"/>
      </div>
      <div>0</div>
    </div>
  `).join("");
}

function bind(){

  document.querySelectorAll(".mm-weight-input").forEach(input=>{
    input.oninput=()=>{
      window.MMRefreshAll();
    };
  });
}

function render(){
  renderMainWeights();
  renderTrendWeights();
  bind();
}

return {render};

})();
