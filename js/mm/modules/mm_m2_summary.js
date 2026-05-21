(function(){
  function fmt(v,d=2){const x=Number(v||0);return x.toLocaleString('en-US',{maximumFractionDigits:d})}
  function wan(v){return Number.isFinite(Number(v))?`${fmt(v,0)}萬`:'--'}
  function pct(v){return Number.isFinite(Number(v))?`${fmt(v,1)}%`:'--'}
  function safeObj(v){return v&&typeof v==='object'?v:{qty:0,amt_wan:0}}
  function render(state){
    const e=MMUI.q('b1-m2-summary');
    if(!e) return;
    if(!window.MMM2CashflowEngine){
      e.innerHTML='<div class="metric"><span>M2 Cashflow Engine</span><b>not loaded</b></div>';
      return;
    }
    const m2=window.MMM2CashflowEngine.build(state)||{};
    const lines=Array.isArray(m2.monthly_action_plan_lines)?m2.monthly_action_plan_lines:[];
    const planHtml=lines.length?lines.join('<br>'):(m2.input_plan_wan>0?`第一階段：預計投入 ${wan(m2.input_plan_wan)}`:'目前無需投入規劃');
    const stageHtml=Object.entries(m2.stages||{}).map(([k,v])=>`${k}：${wan(v)}`).join('<br>');
    const signal=m2.fcn_pool_signal||{};
    const danger=safeObj(m2.danger), tracking=safeObj(m2.tracking), health=safeObj(m2.health);
    const color=signal.level==='good'?'#188b58':signal.level==='warn'?'#b9770e':'#c62828';
    e.innerHTML=`
      <div class='metric'><span>FCN Target AMT</span><b>${wan(m2.fcn_target_amt_wan||m2.total_amt_wan)}</b></div>
      <div class='metric'><span>FCN Pool 目前已投資</span><b>${wan(m2.fcn_pool_amt_wan||m2.input_amt_wan)}</b></div>
      <div class='metric'><span>投資達成率</span><b>${pct(m2.achieve_rate_pct)}</b></div>
      <div class='metric'><span>Output AMT 本月確定出場</span><b>${wan(m2.output_amt_wan)}</b></div>
      <div class='metric'><span>Input Plan 第一階段投入</span><b>${wan(m2.input_plan_wan)}</b></div>
      <div class='metric'><span>FCN Pool Evaluation</span><b style='color:${color}'>${m2.fcn_pool_evaluation||'--'} ${pct(m2.fcn_pool_evaluation_pct)}</b></div>
      <div class='sub' style='margin-top:8px'><b>本月投資計畫</b><br>${planHtml}</div>
      <div class='sub' style='margin-top:8px'><b>三階段現金流</b><br>${stageHtml}</div>
      <div class='metric'><span>今日規劃 / 已選 FCN</span><b>${wan(m2.in_plan_wan)} / ${wan(m2.selected_total_wan)}</b></div>
      <div class='sub' style='margin-top:8px;color:#667085'>${m2.dashboard_note||''}<br>${m2.planner_hint||''}</div>
      <div class='metric'><span>Danger / Tracking / Health</span><b>${danger.qty||0} / ${tracking.qty||0} / ${health.qty||0}</b></div>
      <div class='card-actions'>
        <a href='./m2/index.html' class='btn'>2. Holding Zones</a>
        <a href='./m2/index.html' class='btn'>3. Maturity Cashflow</a>
        <a href='./m2/index.html' class='btn'>4.D FCN 遴選</a>
      </div>`;
  }
  window.MMModuleM2={render};
})();