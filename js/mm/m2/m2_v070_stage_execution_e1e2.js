// ============================================================
// MM/M2 v070 E1/E2 Stage Execution Module (isolated)
// Safe add-on: does not replace planner or FCN main render.
// v070g fix: no global MutationObserver render loop.
// ============================================================
(function(){
  if(window.__M2_V070_STAGE_EXECUTION_E1E2__) return;
  window.__M2_V070_STAGE_EXECUTION_E1E2__ = true;

  const BANK_SOURCE = { '永豐':'sinopac', '富邦':'fubon' };
  const STATE = window.__M2_STAGE_EXECUTION_STATE__ || (window.__M2_STAGE_EXECUTION_STATE__ = {
    window: '2',
    selected: {},
    openE1: true,
    openE2: true
  });
  let rows = [];
  let loaded = false;
  let loading = false;
  let rendering = false;
  const n = (v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  const wan = v => `${Math.floor(n(v,0)).toLocaleString('en-US')}萬`;
  const pct = v => `${n(v,0).toFixed(1)}%`;

  function css(){
    if(document.getElementById('m2StageExecCss')) return;
    const s=document.createElement('style');
    s.id='m2StageExecCss';
    s.textContent=`
      .m2e-panel{border:1px solid #e5e7eb;border-radius:16px;background:#fff;padding:13px;margin-top:14px}
      .m2e-panel>summary{cursor:pointer;font-size:16px;font-weight:950;list-style:none}.m2e-panel>summary::-webkit-details-marker{display:none}.m2e-panel>summary:before{content:'▶';margin-right:8px}.m2e-panel[open]>summary:before{content:'▼'}
      .m2e-note{border:1px solid #dbeafe;background:#f8fbff;border-radius:12px;padding:10px;line-height:1.6;font-size:13px;margin:10px 0}
      .m2e-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;align-items:center}.m2e-btn{background:#f1f5f9!important;color:#111!important;border:1px solid #d8dde6!important;border-radius:10px!important;padding:7px 10px!important;font-weight:950}.m2e-btn.active{background:#111!important;color:#fff!important;border-color:#111!important}
      .m2e-step{border:1px solid #e5e7eb;border-radius:16px;background:#fbfdff;padding:12px;margin:12px 0}.m2e-step-title{font-size:15px;font-weight:950}.m2e-step-sub{font-size:12px;color:#64748b;margin-top:4px}
      .m2e-strip{display:flex;gap:12px;overflow-x:auto;padding:10px 0 12px}.m2e-card{min-width:285px;max-width:285px;border:1px solid #e5e7eb;border-left:4px solid #2563eb;border-radius:14px;background:#fff;padding:11px;font-size:12px}.m2e-card.selected{border-color:#16a34a;border-left-color:#16a34a;background:#f0fdf4}.m2e-card-top{display:flex;justify-content:space-between;gap:8px;font-weight:950}.m2e-line{color:#475569;line-height:1.55;margin-top:4px}.m2e-tags{display:flex;gap:5px;flex-wrap:wrap;margin:7px 0}.m2e-tag{background:#eef2f7;border-radius:999px;padding:3px 7px;font-weight:950;font-size:11px}
      .m2e-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.m2e-kpi{border:1px solid #e5e7eb;border-radius:14px;background:#fff;padding:10px}.m2e-kpi label{font-size:12px;color:#64748b;font-weight:950}.m2e-kpi b{display:block;font-size:20px;margin-top:3px}.m2e-table{width:100%;border-collapse:collapse;min-width:720px}.m2e-table th,.m2e-table td{border-bottom:1px solid #eee;padding:8px;text-align:left;white-space:nowrap;font-size:13px}.m2e-table th{background:#fafafa;color:#555}
      @media(max-width:1000px){.m2e-grid{grid-template-columns:1fr}.m2e-card{min-width:260px}}
    `;
    document.head.appendChild(s);
  }

  function parseRows(raw){
    const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.rows) ? raw.rows : (Array.isArray(raw?.data) ? raw.data : []));
    return arr.map((r,i)=>{
      const under = r.underlyings || r.symbols || r.basket || r.tickers || [];
      const symbols = Array.isArray(under) ? under : String(under||'').split(/[,+/ ]+/).filter(Boolean);
      const source = String(r.source || r.bank_source || r.broker || '').toLowerCase();
      const coupon = n(r.market_coupon || r.coupon || r.rate || r.coupon_pct, 0);
      const id = r.id || r.fcn_id || r.code || r.name || `FCN${i+1}`;
      const date = r.date || r.trade_date || r.quote_date || r.generated_at || r.updated_at || r.created_at || '';
      return {...r,_idx:i,_id:String(id),_source:source,_coupon:coupon,_date:String(date),_symbols:symbols,_tenor:r.tenor||r.months||r.period||'',_strike:r.strike||r.strike_pct||'',_ki:r.ki||r.ki_pct||'',_template:r.template||r.template_id||r.strategy_template||''};
    });
  }
  function load(){
    if(loaded || loading) return;
    loading=true;
    fetch('../../data/mm/market_fcn_history.json')
      .then(r=>r.ok?r.json():Promise.reject(r.status))
      .then(j=>{rows=parseRows(j); loaded=true; loading=false; render();})
      .catch(()=>fetch('/fcn-dashboard/data/mm/market_fcn_history.json').then(r=>r.json()).then(j=>{rows=parseRows(j); loaded=true; loading=false; render();}).catch(()=>{rows=[]; loaded=true; loading=false; render();}));
  }
  function plan(){ return window.__M2_ALLOCATION_PLAN_BLUEPRINT__ || null; }
  function filterWindow(list){
    const mode=STATE.window||'2';
    if(mode==='all') return list;
    const days=mode==='5'?5:2;
    const dated=list.map(r=>({...r,_t:Date.parse(r._date)})).filter(r=>Number.isFinite(r._t));
    if(!dated.length) return list;
    const maxT=Math.max(...dated.map(r=>r._t));
    const cutoff=maxT-(days-1)*86400000;
    return dated.filter(r=>r._t>=cutoff);
  }
  function forStep(step){
    const source=BANK_SOURCE[step.bank];
    return filterWindow(rows).filter(r=>r._source===source).sort((a,b)=>b._coupon-a._coupon).slice(0,10);
  }
  function key(step,row){ return `${step.step}__${row._id}__${row._idx}`; }
  function renderBtns(){
    return `<div class="m2e-actions"><b>History Data Window</b>${[['2','2天'],['5','5天'],['all','ALL']].map(([k,l])=>`<button type="button" class="m2e-btn ${STATE.window===k?'active':''}" data-m2e-window="${k}">${l}</button>`).join('')}<span style="font-size:12px;color:#64748b">目前：${STATE.window==='all'?'ALL':STATE.window+'天'}｜Market rows ${rows.length}</span></div>`;
  }
  function card(step,row){
    const k=key(step,row); const checked=!!STATE.selected[k];
    return `<div class="m2e-card ${checked?'selected':''}"><div class="m2e-card-top"><label><input type="checkbox" data-m2e-select="${k}" data-step="${step.step}" data-amount="${step.amount_wan||0}" ${checked?'checked':''}> ${row._id}</label><span>建議 ${wan(step.amount_wan)}</span></div><div class="m2e-line">${row._source}｜${row._date||'-'}</div><div class="m2e-tags">${row._symbols.slice(0,5).map(x=>`<span class="m2e-tag">${x}</span>`).join('')}</div><div><b>${n(row._coupon,0).toFixed(2)}%</b>｜${row._tenor||'-'}｜Strike/KI ${row._strike||'-'}/${row._ki||'-'}</div><div class="m2e-line">M8 Fair ${row.m8_fair_rate?n(row.m8_fair_rate).toFixed(2)+'%':'-'}｜Gap ${row.m8_gap?n(row.m8_gap).toFixed(2)+'%':'-'}</div><div class="m2e-tags"><span class="m2e-tag">Bank 10/10</span><span class="m2e-tag">Simple</span><span class="m2e-tag">${row._template||'template -'}</span></div></div>`;
  }
  function selectedItems(p){
    const out=[];
    (p?.allocation_steps||[]).forEach(st=>forStep(st).forEach(r=>{const k=key(st,r); if(STATE.selected[k]) out.push({step:st,row:r,amount_wan:n(STATE.selected[k].amount_wan, st.amount_wan)});}));
    return out;
  }
  function summary(p){
    const items=selectedItems(p); const steps=p?.allocation_steps||[];
    const total=steps.reduce((s,x)=>s+n(x.amount_wan),0); const sel=items.reduce((s,x)=>s+n(x.amount_wan),0);
    const byStage={}, byStrategy={}, byBank={};
    steps.forEach(s=>{byStage[s.stage_title]=byStage[s.stage_title]||{target:0,selected:0};byStage[s.stage_title].target+=n(s.amount_wan);byStrategy[s.strategy_title]=byStrategy[s.strategy_title]||{target:0,selected:0};byStrategy[s.strategy_title].target+=n(s.amount_wan);byBank[s.bank]=byBank[s.bank]||{target:0,selected:0};byBank[s.bank].target+=n(s.amount_wan);});
    items.forEach(it=>{byStage[it.step.stage_title].selected+=it.amount_wan;byStrategy[it.step.strategy_title].selected+=it.amount_wan;byBank[it.step.bank].selected+=it.amount_wan;});
    const out={version:'v070g_isolated_e1e2',history_window:STATE.window,target_total_wan:total,selected_total_wan:sel,achievement_pct:total?sel/total*100:0,stage_summary:byStage,strategy_summary:byStrategy,bank_summary:byBank,selected_fcn_orders:items.map(it=>({step:it.step.step,stage:it.step.stage_title,strategy:it.step.strategy_title,bank:it.step.bank,amount_wan:it.amount_wan,fcn_id:it.row._id,source:it.row._source,coupon:it.row._coupon}))};
    window.__M2_STAGE_EXECUTION_SUMMARY__=out; return out;
  }
  function rowsHtml(obj){ return Object.entries(obj||{}).map(([k,v])=>`<tr><td><b>${k}</b></td><td>${wan(v.target)}</td><td>${wan(v.selected)}</td><td>${v.target?pct(v.selected/v.target*100):'0.0%'}</td></tr>`).join(''); }
  function e1(p){
    const open=STATE.openE1?' open':'';
    return `<details class="m2e-panel" id="planner-e1"${open}><summary>E1. FCN 階段執行｜Planner Driven FCN Selection</summary>${renderBtns()}<div class="m2e-note">硬規則：永豐只使用 source=sinopac；富邦只使用 source=fubon。第一版先用同銀行 + coupon 排序，M8 fair rate 只先顯示。</div>${(p?.allocation_steps||[]).map(st=>{const list=forStep(st);return `<div class="m2e-step"><div class="m2e-step-title">Step ${st.step}｜${st.strategy_title}｜${st.bank}｜${wan(st.amount_wan)}</div><div class="m2e-step-sub">source=${BANK_SOURCE[st.bank]}｜Matched ${list.length}｜Displayed ${list.length}</div><div class="m2e-strip">${list.map(r=>card(st,r)).join('')||'<div class="m2e-note">目前篩選條件下沒有符合銀行的 FCN。</div>'}</div></div>`;}).join('')}</details>`;
  }
  function e2(p){
    const s=summary(p); const open=STATE.openE2?' open':'';
    return `<details class="m2e-panel" id="planner-e2"${open}><summary>E2. FCN 階段執行彙整｜Execution Summary</summary><div class="m2e-grid"><div class="m2e-kpi"><label>總階段目標</label><b>${wan(s.target_total_wan)}</b></div><div class="m2e-kpi"><label>已勾選</label><b>${wan(s.selected_total_wan)}</b></div><div class="m2e-kpi"><label>達成率</label><b>${pct(s.achievement_pct)}</b></div><div class="m2e-kpi"><label>History Window</label><b>${s.history_window}</b></div></div><h3>階段達成率</h3><table class="m2e-table"><thead><tr><th>階段</th><th>目標</th><th>已選</th><th>達成率</th></tr></thead><tbody>${rowsHtml(s.stage_summary)}</tbody></table><h3>策略達成率</h3><table class="m2e-table"><thead><tr><th>策略</th><th>目標</th><th>已選</th><th>達成率</th></tr></thead><tbody>${rowsHtml(s.strategy_summary)}</tbody></table><h3>銀行達成率</h3><table class="m2e-table"><thead><tr><th>銀行</th><th>目標</th><th>已選</th><th>達成率</th></tr></thead><tbody>${rowsHtml(s.bank_summary)}</tbody></table></details>`;
  }
  function render(){
    if(rendering) return;
    rendering = true;
    try{
      css(); load();
      const p=plan(); const anchor=document.getElementById('planner-output') || document.getElementById('planner-stage-simulation');
      if(!p || !anchor) return;
      let root=document.getElementById('m2StageExecutionE1E2');
      if(!root){root=document.createElement('div');root.id='m2StageExecutionE1E2'; anchor.insertAdjacentElement('afterend', root);}
      root.innerHTML=e1(p)+e2(p);
    } finally {
      setTimeout(()=>{rendering=false;},60);
    }
  }
  document.addEventListener('click',function(ev){
    const w=ev.target.closest('[data-m2e-window]'); if(w){STATE.window=w.getAttribute('data-m2e-window'); render(); return;}
  },true);
  document.addEventListener('change',function(ev){
    const c=ev.target.closest('[data-m2e-select]'); if(!c) return;
    const k=c.getAttribute('data-m2e-select'); const amt=n(c.getAttribute('data-amount'),0);
    if(c.checked) STATE.selected[k]={amount_wan:amt,selected_at:new Date().toISOString()}; else delete STATE.selected[k];
    render();
  },true);
  document.addEventListener('toggle',function(ev){
    if(ev.target.id==='planner-e1') STATE.openE1=ev.target.open;
    if(ev.target.id==='planner-e2') STATE.openE2=ev.target.open;
  },true);
  document.addEventListener('DOMContentLoaded',()=>setTimeout(render,900));
  document.addEventListener('click',()=>setTimeout(render,500),true);
  let tries=0;
  const timer=setInterval(()=>{tries++; render(); if(document.getElementById('m2StageExecutionE1E2') || tries>10) clearInterval(timer);},800);
})();
