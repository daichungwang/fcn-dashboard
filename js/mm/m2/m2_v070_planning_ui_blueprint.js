// ============================================================
// MM/M2 v070e Planning UI
// Purpose: Strategy Gap First + staged allocation engine.
// Source: window.__M2_RUNTIME_CONTEXT__ from m2_mm_engine.
// ============================================================
(function(){
  if(window.__M2_V070_PLANNING_UI_BLUEPRINT__) return;
  window.__M2_V070_PLANNING_UI_BLUEPRINT__ = true;

  const PLAN_BASE_WAN = 140;
  const BANK_TARGETS_WAN = {'富邦':90,'永豐':50};
  const TARGETS = {'長期穩定現金流':40,'合理投資型':30,'積極單':20,'短期投機單':10};
  const STAGES = [
    {stage_id:'priority',title:'第一階段｜優先規劃',available_wan:5,status:'結果優先',activation:'confirmed_release'},
    {stage_id:'short_term',title:'第二階段｜短期規劃',available_wan:15,status:'條件式',activation:'conditional_release'},
    {stage_id:'strategic',title:'第三階段｜策略佈局',available_wan:15,status:'候補',activation:'candidate_only'}
  ];
  const BANK_RULES = {
    '永豐': {min_wan:3,max_wan:3,priority:1},
    '富邦': {min_wan:1,max_wan:3,priority:2}
  };
  const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  const fmt=(v,d=0)=>n(v).toLocaleString('en-US',{maximumFractionDigits:d});
  const wan=v=>`${fmt(n(v,0),0)}萬`;

  function injectCss(){
    if(document.getElementById('m2V070PlanningCss')) return;
    const style=document.createElement('style');
    style.id='m2V070PlanningCss';
    style.textContent=`.m2v070-wrap{display:grid;gap:14px;margin-top:14px}.m2v070-head,.m2v070-note{border:1px solid #dbeafe;background:#f8fbff;border-radius:14px;padding:10px;line-height:1.65;font-size:13px}.m2v070-head{padding:13px}.m2v070-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.m2v070-kpi{position:relative;overflow:hidden;border:1px solid #e5e7eb;border-radius:16px;padding:12px 12px 12px 14px;background:#fff}.m2v070-kpi:before{content:"";position:absolute;left:0;top:0;width:5px;height:100%;background:var(--accent,#64748b)}.m2v070-kpi label{display:block;font-size:12px;color:#64748b;font-weight:950}.m2v070-kpi b{display:block;font-size:22px;margin-top:4px}.m2v070-kpi span{display:block;font-size:12px;color:#667085;line-height:1.4;margin-top:4px}.m2v070-panel{border:1px solid #e5e7eb;border-radius:16px;background:#fff;padding:13px}.m2v070-panel h3{margin:0 0 8px;font-size:16px}.m2v070-table{width:100%;border-collapse:collapse;min-width:720px}.m2v070-table th,.m2v070-table td{border-bottom:1px solid #eee;padding:8px;text-align:left;white-space:nowrap;font-size:13px}.m2v070-table th{background:#fafafa;color:#555}.m2v070-under{background:#fff7ed}.m2v070-over{background:#f8fafc}.m2v070-stage{border:1px solid #e5e7eb;border-radius:18px;background:linear-gradient(135deg,#fff,#f8fafc);padding:13px;margin-top:10px}.m2v070-stage-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.m2v070-stage-title{font-size:16px;font-weight:950}.m2v070-stage-sub{font-size:13px;color:#64748b;margin-top:4px;line-height:1.45}.m2v070-pill{display:inline-block;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:950;border:1px solid #d8dde6;background:#fff;color:#334155;white-space:nowrap}.m2v070-result{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.m2v070-result div{border:1px solid #e5e7eb;border-radius:12px;background:#fff;padding:9px;font-size:13px;line-height:1.45}.m2v070-result label{display:block;font-size:12px;color:#64748b;font-weight:950;margin-bottom:3px}.m2v070-trace{margin-top:10px;border:1px dashed #cbd5e1;border-radius:14px;background:#fff;padding:10px}.m2v070-trace summary{cursor:pointer;font-weight:950}.m2v070-step{border:1px solid #eee;border-radius:12px;background:#fafafa;padding:9px;margin:8px 0;line-height:1.55;font-size:13px}.m2v070-actions{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.m2v070-actions button{background:#f1f5f9!important;color:#111!important;border:1px solid #d8dde6!important;padding:7px 10px!important;border-radius:10px!important}@media(max-width:1000px){.m2v070-kpis,.m2v070-result{grid-template-columns:1fr}}`;
    document.head.appendChild(style);
  }

  function getRuntimeAmounts(){
    const ctx=window.__M2_RUNTIME_CONTEXT__||{};
    const src=ctx.strategy_amounts_wan||{};
    const out={};
    Object.keys(TARGETS).forEach(k=>{out[k]=Number.isFinite(Number(src[k]))?Number(src[k]):null;});
    return out;
  }
  function getRuntimeBankAmounts(){
    const ctx=window.__M2_RUNTIME_CONTEXT__||{};
    const src=ctx.bank_amounts_wan||ctx.bank_used_wan||ctx.broker_amounts_wan||{};
    return {'富邦':n(src['富邦'],0),'永豐':n(src['永豐'],0)};
  }
  function bankRowsFromAmounts(amounts){
    return Object.keys(BANK_TARGETS_WAN).map(bank=>{
      const used=n(amounts[bank],0);
      const target=BANK_TARGETS_WAN[bank];
      const gap=Math.max(0,target-used);
      const gap_pct=target>0?gap/target*100:0;
      return {bank,used_wan:used,target_wan:target,gap_wan:Math.floor(gap),gap_pct};
    }).sort((a,b)=>{const d=b.gap_pct-a.gap_pct;if(Math.abs(d)>0.01)return d;return (BANK_RULES[a.bank]?.priority||9)-(BANK_RULES[b.bank]?.priority||9);});
  }
  function rowsFromAmounts(amounts){
    return Object.keys(TARGETS).map(k=>{
      const cur=amounts[k]; const target=TARGETS[k];
      const real=cur==null?null:cur/PLAN_BASE_WAN*100;
      const gap=real==null?null:real-target;
      const need=gap==null?null:(gap<0?Math.floor(PLAN_BASE_WAN*Math.abs(gap)/100):0);
      return {strategy:k,current_wan:cur,target_pct:target,real_pct:real,gap_pct:gap,need_wan:need};
    }).sort((a,b)=>{if(a.gap_pct==null&&b.gap_pct==null)return 0;if(a.gap_pct==null)return 1;if(b.gap_pct==null)return -1;const d=a.gap_pct-b.gap_pct;if(Math.abs(d)>0.5)return d;return n(b.need_wan)-n(a.need_wan);});
  }
  function buildStaticGapRows(){return rowsFromAmounts(getRuntimeAmounts());}
  function firstUnderFromAmounts(amounts){return rowsFromAmounts(amounts).filter(r=>r.gap_pct!=null&&r.gap_pct<0&&r.need_wan>0)[0]||null;}
  function chooseBankByGap(stageRemaining, bankWorking){
    const rows=bankRowsFromAmounts(bankWorking);
    for(const r of rows){
      const rule=BANK_RULES[r.bank];
      if(r.gap_wan>=rule.min_wan && stageRemaining>=rule.min_wan) return r;
    }
    const fubon=rows.find(r=>r.bank==='富邦');
    return stageRemaining>=1 && fubon && fubon.gap_wan>=1 ? fubon : null;
  }
  function allocateLot(bank, stageRemaining, strategyNeed, bankGapWan){
    const rule=BANK_RULES[bank]||BANK_RULES['富邦'];
    return Math.floor(Math.max(0, Math.min(rule.max_wan, stageRemaining, strategyNeed, bankGapWan)));
  }
  function summarizeAmounts(steps, key){
    const out={};
    steps.forEach(s=>{out[s[key]]=(out[s[key]]||0)+s.amount_wan;});
    return out;
  }
  function fmtMap(map){
    const entries=Object.entries(map||{}).filter(([,v])=>n(v)>0);
    return entries.length?entries.map(([k,v])=>`${k} ${wan(v)}`).join('、'):'無配置';
  }
  function buildAllocationPlan(){
    const start=getRuntimeAmounts();
    const working={...start};
    const bankWorking=getRuntimeBankAmounts();
    const stages=[]; const allocation_steps=[];
    let stepNo=1;
    STAGES.forEach(stage=>{
      let remaining=stage.available_wan;
      const stageSteps=[];
      const trace=[];
      while(remaining>0){
        const target=firstUnderFromAmounts(working);
        if(!target){trace.push('四類策略已無負 gap，本階段停止。');break;}
        const bankChoice=chooseBankByGap(remaining, bankWorking);
        if(!bankChoice){trace.push(`剩餘 ${wan(remaining)} 低於銀行 min lot，或銀行已無 gap，本階段停止。`);break;}
        const bank=bankChoice.bank;
        const beforeBankGapPct=bankChoice.gap_pct;
        const beforeBankGapWan=bankChoice.gap_wan;
        const amt=allocateLot(bank, remaining, target.need_wan, beforeBankGapWan);
        const rule=BANK_RULES[bank]||BANK_RULES['富邦'];
        if(amt<rule.min_wan){trace.push(`${bank} 可補 ${wan(amt)} 低於 min ${wan(rule.min_wan)}，本階段停止。`);break;}
        const s={step:stepNo++,stage_id:stage.stage_id,stage_title:stage.title,operation_type:target.strategy,strategy_title:target.strategy,bank,amount_wan:amt,bank_gap_pct_before:beforeBankGapPct,bank_gap_wan_before:beforeBankGapWan,strategy_gap_pct_before:target.gap_pct,strategy_need_wan_before:target.need_wan,display_title:`Step ${stepNo-1}｜${target.strategy}｜${bank}｜${wan(amt)}`,reason_strategy:`${target.strategy} strategy gap ${fmt(target.gap_pct,1)}% 最負，待補 ${wan(target.need_wan)}。`,reason_bank:`${bank} bank gap ${fmt(beforeBankGapPct,1)}% 最大，gap ${wan(beforeBankGapWan)}；lot min/max ${wan(rule.min_wan)}/${wan(rule.max_wan)}，採無條件捨去 ${wan(amt)}。`,status:stage.stage_id==='strategic'?'candidate_only':'planned'};
        allocation_steps.push(s); stageSteps.push(s);
        working[target.strategy]=n(working[target.strategy])+amt;
        bankWorking[bank]=n(bankWorking[bank])+amt;
        remaining-=amt;
        const nextStrategy=rowsFromAmounts(working).find(r=>r.strategy===target.strategy);
        const nextBank=bankRowsFromAmounts(bankWorking).find(r=>r.bank===bank);
        trace.push(`${s.display_title}；補完後 ${target.strategy} gap ${fmt(nextStrategy?.gap_pct,1)}%，${bank} bank gap ${fmt(nextBank?.gap_pct,1)}%。`);
      }
      const byStrategy=summarizeAmounts(stageSteps,'strategy_title');
      const byBank=summarizeAmounts(stageSteps,'bank');
      stages.push({...stage,planned_wan:stage.available_wan-remaining,remaining_wan:remaining,steps:stageSteps,trace,by_strategy:byStrategy,by_bank:byBank,remaining_gap_rows:rowsFromAmounts(working),remaining_bank_gap_rows:bankRowsFromAmounts(bankWorking)});
    });
    const handoff_to_market_fcn=allocation_steps.map(s=>({step:s.step,find:{bank:s.bank,strategy_title:s.strategy_title,amount_wan:s.amount_wan,market_source:'market_fcn_history',ranking:'m8_gap_then_risk_then_coupon'}}));
    return {version:'v070f_bank_gap_stage_allocation',unit:'wan_usd',base_policy:{total_plan_base_wan:140,fubon_plan_base_wan:90,sinopac_plan_base_wan:50,gap_base_rule:'strategy_gap_uses_static_total_plan_base_140',bank_gap_rule:'each_step_chooses_highest_bank_gap_pct',release_rule:'release_controls_stage_capital_only'},strategy_gap_rows:buildStaticGapRows(),bank_gap_rows:bankRowsFromAmounts(getRuntimeBankAmounts()),stages,allocation_steps,handoff_to_market_fcn,runtime_context:window.__M2_RUNTIME_CONTEXT__||null};
  }

  function renderKpis(){return `<div class="m2v070-kpis"><div class="m2v070-kpi" style="--accent:#0f766e"><label>優先規劃｜確定可用</label><b>5萬</b><span>確定 release，可立即規劃。</span></div><div class="m2v070-kpi" style="--accent:#2563eb"><label>短期規劃｜條件式啟用</label><b>15萬</b><span>20萬 - 優先 5萬。</span></div><div class="m2v070-kpi" style="--accent:#7c3aed"><label>策略佈局｜候補資金</label><b>15萬</b><span>35萬 - 5萬 - 15萬，不硬做。</span></div><div class="m2v070-kpi" style="--accent:#f97316"><label>Total Plan Base</label><b>140萬</b><span>富邦 90萬 + 永豐 50萬；策略 gap 分母。</span></div></div>`;}
  function renderStrategyGap(){const rows=buildStaticGapRows(); const ctx=window.__M2_RUNTIME_CONTEXT__; const body=rows.map(r=>`<tr class="${r.gap_pct!=null&&r.gap_pct<0?'m2v070-under':'m2v070-over'}"><td><b>${r.strategy}</b></td><td>${r.current_wan==null?'-':wan(r.current_wan)}</td><td>${r.real_pct==null?'-':fmt(r.real_pct,1)+'%'}</td><td>${fmt(r.target_pct,0)}%</td><td>${r.gap_pct==null?'-':fmt(r.gap_pct,1)+'%'}</td><td>${r.need_wan==null?'-':wan(r.need_wan)}</td><td>${r.gap_pct==null?'待接資料':r.gap_pct<0?'Underweight':'OK / Over'}</td></tr>`).join('');return `<div class="m2v070-panel" id="planner-strategy-refill"><h3>C. 投資策略補單｜Strategy Gap First</h3><div class="m2v070-note"><b>口徑：</b>四類策略全部用 Total Plan Base 140萬計算 Real / Target / Gap；Gap% 最負者優先補。</div><div class="table-wrap" style="margin-top:10px"><table class="m2v070-table"><thead><tr><th>策略類別</th><th>目前金額</th><th>Real</th><th>Target</th><th>Gap</th><th>待補萬</th><th>狀態</th></tr></thead><tbody>${body}</tbody></table></div><div class="m2v070-note">v070f：資料來源 <b>window.__M2_RUNTIME_CONTEXT__.strategy_amounts_wan</b>；Context：${ctx?.version||'尚未建立'}</div></div>`;}
  function renderStageCards(){const plan=buildAllocationPlan();window.__M2_ALLOCATION_PLAN_BLUEPRINT__=plan;return `<div class="m2v070-panel" id="planner-stage-simulation"><h3>D. 補單步驟推演｜Stage Result First</h3><div class="m2v070-note">每階段依 C 區 gap% + Bank Gap% 動態推演；每補一筆後重算 strategy gap 與 bank gap。每一步格式固定為：<b>Step N｜策略類別｜銀行｜金額</b>。</div><div class="m2v070-actions"><button type="button" data-m2v070="expand">全部展開</button><button type="button" data-m2v070="collapse">全部收合</button></div>${plan.stages.map(stage=>`<div class="m2v070-stage"><div class="m2v070-stage-head"><div><div class="m2v070-stage-title">${stage.title}</div><div class="m2v070-stage-sub">可用 ${wan(stage.available_wan)}｜已規劃 ${wan(stage.planned_wan)}｜剩餘 ${wan(stage.remaining_wan)}</div></div><span class="m2v070-pill">${stage.status}</span></div><div class="m2v070-result"><div><label>策略結果</label>${fmtMap(stage.by_strategy)}</div><div><label>銀行配置</label>${fmtMap(stage.by_bank)}</div><div><label>階段說明</label>${stage.activation==='candidate_only'?'候補資金，不硬做；市場條件合理才轉第 4 區。':'每步先看 Bank Gap% 最大，再看 Strategy Gap% 最負。'}</div></div><details class="m2v070-trace"><summary>展開推演過程</summary>${stage.steps.map(s=>`<div class="m2v070-step"><b>${s.display_title}</b><br>${s.reason_strategy}<br>${s.reason_bank}</div>`).join('')||'<div class="m2v070-step">本階段沒有可執行配置。</div>'}<div class="m2v070-note"><b>Trace</b><br>${stage.trace.join('<br>')||'無'}</div></details></div>`).join('')}</div>`;}
  function renderOutput(){const plan=window.__M2_ALLOCATION_PLAN_BLUEPRINT__||buildAllocationPlan();window.__M2_ALLOCATION_PLAN_BLUEPRINT__=plan;return `<div class="m2v070-panel" id="planner-output"><h3>E0. Planner Output｜給第 4 區讀</h3><div class="m2v070-note">目前輸出：<b>window.__M2_ALLOCATION_PLAN_BLUEPRINT__</b>，包含 stages / allocation_steps / handoff_to_market_fcn。</div><details class="m2v070-trace"><summary>查看 planner JSON</summary><pre style="white-space:pre-wrap;font-size:12px;background:#0f172a;color:#e5e7eb;border-radius:12px;padding:10px;max-height:320px;overflow:auto">${JSON.stringify(plan,null,2)}</pre></details></div>`;}
  function buildHtml(){return `<div class="m2v070-wrap" id="m2v070PlanningBlueprint"><div class="m2v070-head"><b>M2 v070f Planning UI</b><br>第 3 區已進入 Stage Allocation Engine：C 區決定策略缺口，D 區依 Bank Gap% + Strategy Gap% 分階段推演。</div>${renderKpis()}${renderStrategyGap()}${renderStageCards()}${renderOutput()}</div>`;}
  function refresh(){const old=document.getElementById('m2v070PlanningBlueprint');if(old){old.outerHTML=buildHtml();bindActions(document.getElementById('m2v070PlanningBlueprint'));}}
  function injectSubnav(){const nav=document.getElementById('m2MaturityCashflowSubnav');if(!nav||nav.querySelector('[data-planner-nav="strategy"]'))return;[['strategy','C. 投資策略補單'],['stage','D. 補單推演'],['output','E0. Planner Output']].forEach(([key,label])=>{const b=document.createElement('button');b.className='m2-hz-subnav-btn';b.dataset.plannerNav=key;b.type='button';b.textContent=label;nav.insertBefore(b,nav.querySelector('[data-planner-nav="detail"]')||null);});}
  function bindActions(root){if(!root)return;root.querySelectorAll('[data-m2v070]').forEach(btn=>btn.addEventListener('click',()=>{const open=btn.dataset.m2v070==='expand';root.querySelectorAll('details.m2v070-trace').forEach(d=>d.open=open);}));}
  function inject(){injectCss();injectSubnav();const bottom=document.getElementById('bottomQuery');const active=document.getElementById('activeTitle');if(!bottom||!active||!/Maturity Cashflow/.test(active.textContent||''))return;if(document.getElementById('m2v070PlanningBlueprint')){refresh();return;}bottom.insertAdjacentHTML('afterbegin',buildHtml());bindActions(document.getElementById('m2v070PlanningBlueprint'));}
  document.addEventListener('click',function(ev){const btn=ev.target.closest('[data-planner-nav]');if(btn){const map={strategy:'planner-strategy-refill',stage:'planner-stage-simulation',output:'planner-output'};setTimeout(()=>{inject();const el=document.getElementById(map[btn.dataset.plannerNav]);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});},520);}else setTimeout(inject,260);},true);
  new MutationObserver(()=>setTimeout(inject,220)).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject);else inject();
})();
