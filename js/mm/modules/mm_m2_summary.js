(function(){
  function arr(v){return Array.isArray(v)?v:[]}
  function num(v,d=0){const x=Number(v);return Number.isFinite(x)?x:d}
  function fmt(v,d=2){return num(v,0).toLocaleString('en-US',{maximumFractionDigits:d})}
  function wan(v){return `${fmt(v,0)}萬`}
  function readJson(key){try{return JSON.parse(localStorage.getItem(key)||'null')||null}catch(e){return null}}
  function sum(list,fn){return arr(list).reduce((s,x)=>s+num(fn(x),0),0)}
  function statusText(x){return String(x.status||x.zone||x.state||'').toLowerCase()}
  function amt(x){return num(x.amount_wan??x.amount??x.principal_wan??x.principal??x.exposure??x.total_exposure,0)}
  function countAmt(list,pred){const rows=arr(list).filter(pred);return {qty:rows.length,amt:sum(rows,amt)}}
  function readM2(){return {handoff:window.__M2_TO_MARKET_FCN_HANDOFF__||readJson('MM_M2_PLANNER_HANDOFF'),selection:window.__M2_MARKET_FCN_SELECTION_SUMMARY__||readJson('MM_M2_SELECTION_SUMMARY')}}
  function stageSummary(steps){
    const out={};
    arr(steps).forEach(s=>{const k=s.stage||'未分階段';out[k]=(out[k]||0)+num(s.amount_wan,0)});
    return out;
  }
  function strategySummary(steps){
    const out={};
    arr(steps).forEach(s=>{const k=s.strategy||'未分類';out[k]=(out[k]||0)+num(s.amount_wan,0)});
    return out;
  }
  function render(state){
    const e=MMUI.q('b1-m2-summary'); if(!e) return;
    const runtime=arr(state.data.marketRuntime);
    const fcn=arr(state.data.fcnPool);
    const pos=arr(state.data.positions);
    const rows=fcn.length?fcn:(pos.length?pos:runtime);
    const totalAmt=sum(rows,amt)||sum(runtime,x=>x.total_exposure)||sum(pos,x=>x.exposure||x.total_exposure);
    const inputAmt=sum(rows,x=>x.input_amount_wan??x.input_amt??x.input??0);
    const inputRate=totalAmt>0?inputAmt/totalAmt*100:0;
    const outputRows=countAmt(rows,x=>/hard|release|maturity|exit|到期|出場/.test(statusText(x)));
    const danger=countAmt(rows,x=>/danger|ki|risk|破|下限|危險/.test(statusText(x))||num(x.total_exposure,0)>=15);
    const tracking=countAmt(rows,x=>/watch|tracking|追蹤|觀察/.test(statusText(x))||(num(x.total_exposure,0)>=8&&num(x.total_exposure,0)<15));
    const health=countAmt(rows,x=>/healthy|safe|健康|安全/.test(statusText(x))||(num(x.total_exposure,0)>0&&num(x.total_exposure,0)<8));
    const ctx=readM2();
    const steps=arr(ctx.handoff&&ctx.handoff.steps);
    const planWan=sum(steps,x=>x.amount_wan)||num(ctx.selection&&ctx.selection.total_target_wan,0);
    const selectedWan=num(ctx.selection&&ctx.selection.selected_total_wan,0);
    const stages=stageSummary(steps);
    const strategies=strategySummary(steps);
    const inputPlan=Object.entries(strategies).map(([k,v])=>`${k} ${wan(v)}`).join(' / ')||'待接 M2 Planner';
    const poolEval=danger.qty>0?'需處理風險':tracking.qty>0?'需追蹤':'健康';
    e.innerHTML=`
      <div class='metric'><span>Total AMT</span><b>${MMUI.num(totalAmt)}</b></div>
      <div class='metric'><span>Input AMT</span><b>${MMUI.num(inputAmt)}</b></div>
      <div class='metric'><span>投入率</span><b>${fmt(inputRate,1)}%</b></div>
      <div class='metric'><span>Output AMT 本月確定出場</span><b>${MMUI.num(outputRows.amt)}</b></div>
      <div class='metric'><span>Input Plan</span><b>${inputPlan}</b></div>
      <div class='metric'><span>FCN Pool Evaluation</span><b>${poolEval}</b></div>
      <div class='metric'><span>Danger QTY / AMT</span><b>${danger.qty} / ${MMUI.num(danger.amt)}</b></div>
      <div class='metric'><span>Tracking QTY / AMT</span><b>${tracking.qty} / ${MMUI.num(tracking.amt)}</b></div>
      <div class='metric'><span>Health QTY / AMT</span><b>${health.qty} / ${MMUI.num(health.amt)}</b></div>
      <div class='sub' style='margin-top:8px'><b>三階段規劃</b><br>${Object.entries(stages).map(([k,v])=>`${k}：${wan(v)}`).join('<br>')||'待接 Maturity Cashflow'}</div>
      <div class='metric'><span>今日規劃 / 已選 FCN</span><b>${wan(planWan)} / ${wan(selectedWan)}</b></div>
      <div class='card-actions'>
        <a href='./m2/index.html' class='btn'>2. Holding Zones</a>
        <a href='./m2/index.html' class='btn'>3. Maturity Cashflow</a>
        <a href='./m2/index.html' class='btn'>4.D FCN 遴選</a>
      </div>`;
  }
  window.MMModuleM2={render};
})();
