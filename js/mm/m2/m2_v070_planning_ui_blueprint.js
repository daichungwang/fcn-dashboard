// ============================================================
// MM/M2 v072 Planning UI Blueprint
// Dynamic stage caps + complete candidate allocation loop
// ============================================================
(function(){
  if(window.__M2_V070_PLANNING_UI_BLUEPRINT__) return;
  window.__M2_V070_PLANNING_UI_BLUEPRINT__ = true;

  const DEFAULT_PLAN_BASE_WAN = 140;
  const BANK_TARGETS_WAN = { '富邦':110, '永豐':40 };
  const TARGETS = { '長期穩定現金流':40, '合理投資型':30, '積極單':20, '短期投機單':10 };
  const BANK_RULES = { '永豐':{min_wan:3,max_wan:3,priority:1}, '富邦':{min_wan:1,max_wan:3,priority:2} };
  const BANK_SOURCE = { '永豐':'sinopac', '富邦':'fubon' };
  const PANEL_STATE = window.__M2_V070_PANEL_STATE__ || (window.__M2_V070_PANEL_STATE__={strategy:true,stage:true,json:false});
  let INJECTING=false;
  let LAST_SIG='';

  const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  const floorWan=v=>Math.max(0,Math.floor(n(v,0)));
  const fmt=v=>floorWan(v).toLocaleString('en-US');
  const pct=v=>Number.isFinite(Number(v))?`${Math.floor(Number(v))}%`:'-';
  const wan=v=>`${fmt(v)}萬`;

  function injectCss(){
    if(document.getElementById('m2V070PlanningCss')) return;
    const style=document.createElement('style');
    style.id='m2V070PlanningCss';
    style.textContent=`.m2v070-wrap{display:grid;gap:14px;margin-top:14px}.m2v070-head,.m2v070-note{border:1px solid #dbeafe;background:#f8fbff;border-radius:14px;padding:10px;line-height:1.65;font-size:13px}.m2v070-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.m2v070-kpi{position:relative;border:1px solid #e5e7eb;border-radius:16px;padding:12px 12px 12px 14px;background:#fff;min-height:168px}.m2v070-kpi:before{content:"";position:absolute;left:0;top:0;width:5px;height:100%;background:var(--accent,#64748b);border-radius:16px 0 0 16px}.m2v070-kpi label{display:block;font-size:12px;color:#64748b;font-weight:950}.m2v070-kpi b{display:block;font-size:22px;margin-top:4px}.m2v070-kpi span{display:block;font-size:12px;color:#667085;line-height:1.4;margin-top:4px}.m2v070-panel{border:1px solid #e5e7eb;border-radius:16px;background:#fff;padding:13px}.m2v070-panel>summary{cursor:pointer;font-size:16px;font-weight:950;list-style:none}.m2v070-panel>summary::-webkit-details-marker{display:none}.m2v070-table{width:100%;border-collapse:collapse;min-width:760px}.m2v070-table th,.m2v070-table td{border-bottom:1px solid #eee;padding:8px;text-align:left;white-space:nowrap;font-size:13px}.m2v070-table th{background:#fafafa;color:#555}.m2v070-under{background:#fff7ed}.m2v070-over{background:#f8fafc}.m2v070-stage{border:1px solid #e5e7eb;border-radius:18px;background:linear-gradient(135deg,#fff,#f8fafc);padding:13px;margin-top:10px}.m2v070-stage-title{font-size:16px;font-weight:950}.m2v070-stage-sub{font-size:13px;color:#64748b;margin-top:4px}.m2v070-result{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}.m2v070-result div{border:1px solid #e5e7eb;border-radius:12px;background:#fff;padding:9px;font-size:13px;line-height:1.45}.m2v070-mini-steps{margin-top:10px;border:1px solid #e5e7eb;border-radius:14px;background:#fff;overflow:hidden}.m2v070-mini-head,.m2v070-mini-row{display:grid;grid-template-columns:52px 1.05fr .7fr .6fr .75fr;gap:6px;align-items:center;padding:7px 8px;font-size:12px;border-bottom:1px solid #eee}.m2v070-mini-head{background:#f8fafc;color:#64748b;font-size:11px;font-weight:950}.m2v070-actions{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.m2v070-actions button{background:#f1f5f9!important;color:#111!important;border:1px solid #d8dde6!important;padding:7px 10px!important;border-radius:10px!important}.m2v070-jsonbox{display:none;white-space:pre-wrap;font-size:12px;background:#0f172a;color:#e5e7eb;border-radius:12px;padding:10px;max-height:320px;overflow:auto}.m2v070-jsonbox.show{display:block}.m2v070-step-table{overflow:auto;margin-top:10px}.m2v070-badge{display:inline-block;border:1px solid #e5e7eb;border-radius:999px;padding:2px 7px;background:#f8fafc;font-size:12px;font-weight:900}.m2v070-badge.good{background:#ecfdf5;border-color:#bbf7d0;color:#166534}.m2v070-badge.warn{background:#fff7ed;border-color:#fed7aa;color:#9a3412}@media(max-width:1000px){.m2v070-kpis,.m2v070-result{grid-template-columns:1fr}.m2v070-mini-head,.m2v070-mini-row{grid-template-columns:44px 1fr .7fr .6fr}}`;
    document.head.appendChild(style);
  }

  function getCtx(){ return window.__M2_RUNTIME_CONTEXT__ || {}; }
  function pick(obj, keys){ for(const k of keys){ if(Number.isFinite(Number(obj[k]))) return Number(obj[k]); } return 0; }
  function getPlanBaseWan(){ return pick(getCtx(),['planning_base_wan','plan_base_wan','base_total_wan']) || DEFAULT_PLAN_BASE_WAN; }

  function getStageCaps(){
    const c=getCtx();
    const confirmedMaturity=pick(c,['confirmed_maturity_wan','ready_maturity_wan','safe_maturity_wan','hard_maturity_wan']);
    const confirmedEarly=pick(c,['confirmed_early_exit_wan','ready_early_exit_wan','early_exit_ready_wan','hard_early_exit_wan']);
    const confirmedAssign=pick(c,['confirmed_assignment_wan','confirmed_stock_delivery_wan','ready_assignment_wan','hard_assignment_wan']);
    const expectedMaturity=pick(c,['expected_maturity_wan','watch_maturity_wan','projected_maturity_wan','maturity_candidate_wan']);
    const expectedEarly=pick(c,['expected_early_exit_wan','watch_early_exit_wan','early_exit_candidate_wan','candidate_early_exit_wan']);
    const expectedAssign=pick(c,['expected_assignment_wan','expected_stock_delivery_wan','watch_assignment_wan','candidate_assignment_wan']);
    const stage1=floorWan(confirmedMaturity+confirmedEarly-confirmedAssign);
    const expectedPool=floorWan(expectedMaturity+expectedEarly-expectedAssign);
    const stage2=floorWan(expectedPool*0.5);
    const stage3=floorWan(expectedPool-stage2);
    return {stage1,stage2,stage3,expectedPool,confirmedMaturity,confirmedEarly,confirmedAssign,expectedMaturity,expectedEarly,expectedAssign};
  }
  function getStages(){const c=getStageCaps();return[{stage_id:'priority',title:'第一階段｜優先規劃',available_wan:c.stage1,status:'確定可用',sub:'確定到期 + 確定提前 - 確定接股'},{stage_id:'short_term',title:'第二階段｜短期規劃',available_wan:c.stage2,status:'條件式啟用',sub:'floor(預計池 × 50%)'},{stage_id:'strategic',title:'第三階段｜策略佈局',available_wan:c.stage3,status:'候補資金',sub:'預計池 - 第二階段'}];}
  function getRuntimeAmounts(){const src=getCtx().strategy_amounts_wan||{};const out={};Object.keys(TARGETS).forEach(k=>{out[k]=Number.isFinite(Number(src[k]))?Number(src[k]):null;});return out;}
  function getRuntimeBankAmounts(){const src=getCtx().bank_amounts_wan||getCtx().bank_used_wan||getCtx().broker_amounts_wan||{};return {'富邦':n(src['富邦'],0),'永豐':n(src['永豐'],0)};}
  function bankTargets(){return getCtx().bank_targets_wan||BANK_TARGETS_WAN;}
  function bankRowsFromAmounts(amounts){const targets=bankTargets();return Object.keys(targets).map(bank=>{const used=n(amounts[bank],0);const target=n(targets[bank],0);const gap=target-used;return {bank,used_wan:used,target_wan:target,gap_raw_wan:gap,gap_wan:floorWan(gap),gap_pct:target>0?Math.max(0,gap)/target*100:0};}).sort((a,b)=>b.gap_pct-a.gap_pct||(BANK_RULES[a.bank]?.priority||99)-(BANK_RULES[b.bank]?.priority||99));}
  function rowsFromAmounts(amounts){const base=getPlanBaseWan();return Object.keys(TARGETS).map(k=>{const cur=amounts[k];const target=TARGETS[k];const real=cur==null?null:cur/base*100;const gap=real==null?null:real-target;const need=gap==null?null:(gap<0?floorWan(base*Math.abs(gap)/100):0);return {strategy:k,current_wan:cur,target_pct:target,real_pct:real,gap_pct:gap,need_wan:need};}).sort((a,b)=>{if(a.gap_pct==null)return 1;if(b.gap_pct==null)return -1;return a.gap_pct-b.gap_pct;});}
  function strategyCandidates(amounts){return rowsFromAmounts(amounts).filter(r=>r.gap_pct!=null&&r.gap_pct<0&&r.need_wan>0);}
  function bankCandidates(amounts){return bankRowsFromAmounts(amounts).filter(r=>r.gap_wan>0);}
  function lotFor(bank, stageRemaining, strategyNeed, bankGapWan){const rule=BANK_RULES[bank]||BANK_RULES['富邦'];return floorWan(Math.min(rule.max_wan,stageRemaining,strategyNeed,bankGapWan));}
  function findAllocationCandidate(stageRemaining, strategyWorking, bankWorking){
    const strategies=strategyCandidates(strategyWorking);
    const banks=bankCandidates(bankWorking);
    for(const strategy of strategies){
      for(const bank of banks){
        const rule=BANK_RULES[bank.bank]||BANK_RULES['富邦'];
        const amount=lotFor(bank.bank,stageRemaining,strategy.need_wan,bank.gap_wan);
        if(amount>=rule.min_wan)return {strategy,bank,amount,rule};
      }
    }
    return null;
  }
  function summarizeAmounts(steps,key){const out={};steps.forEach(s=>{out[s[key]]=(out[s[key]]||0)+s.amount_wan;});return out;}
  function fmtMap(map){const entries=Object.entries(map||{}).filter(([,v])=>n(v)>0);return entries.length?entries.map(([k,v])=>`${k} ${wan(v)}`).join('、'):'無配置';}
  function renderMiniSteps(steps){if(!steps||!steps.length)return '<div class="m2v070-mini-steps"><div class="m2v070-mini-row">本階段沒有可執行配置。</div></div>';return `<div class="m2v070-mini-steps"><div class="m2v070-mini-head"><div>Step</div><div>策略</div><div>銀行</div><div>金額</div><div>重算</div></div>${steps.map(s=>`<div class="m2v070-mini-row"><div>${s.step}</div><div>${s.strategy_title}</div><div>${s.bank}</div><div><b>${wan(s.amount_wan)}</b></div><div>${pct(s.before_strategy_gap_pct)}→${pct(s.after_strategy_gap_pct)}</div></div>`).join('')}</div>`;}
  function publishHandoff(plan){const steps=(plan.allocation_steps||[]).map(s=>({step:s.step,stage:s.stage_title,stage_id:s.stage_id,strategy:s.strategy_title,bank:s.bank,source:BANK_SOURCE[s.bank]||'',amount_wan:s.amount_wan,status:s.status,before_strategy_gap_pct:s.before_strategy_gap_pct,after_strategy_gap_pct:s.after_strategy_gap_pct,before_bank_gap_pct:s.before_bank_gap_pct,after_bank_gap_pct:s.after_bank_gap_pct,rank_rule:'candidate_search_by_largest_strategy_gap_then_largest_bank_gap_recompute_each_step'}));const handoff={source:'maturity_cashflow_d',version:'v072_candidate_allocation_loop',updated_at:new Date().toISOString(),steps};window.__M2_TO_MARKET_FCN_HANDOFF__=handoff;plan.handoff_to_market_fcn=steps.map(s=>({step:s.step,find:s}));return handoff;}

  function buildAllocationPlan(){
    const stagesDef=getStages();
    const working={...getRuntimeAmounts()};
    const bankWorking=getRuntimeBankAmounts();
    const stages=[];const allocation_steps=[];let stepNo=1;
    stagesDef.forEach(stage=>{
      let remaining=stage.available_wan;const stageSteps=[];const trace=[];let safe=0;
      while(remaining>0 && safe++<80){
        const cand=findAllocationCandidate(remaining,working,bankWorking);
        if(!cand){trace.push(`剩餘 ${wan(remaining)} 無可執行 lot：策略缺口、銀行缺口或 min lot 條件不足。`);break;}
        const target=cand.strategy;const bankChoice=cand.bank;const bank=bankChoice.bank;const amt=cand.amount;
        const beforeStrategy=rowsFromAmounts(working).find(r=>r.strategy===target.strategy)||target;
        const beforeBank=bankRowsFromAmounts(bankWorking).find(r=>r.bank===bank)||bankChoice;
        working[target.strategy]=n(working[target.strategy])+amt;
        bankWorking[bank]=n(bankWorking[bank])+amt;
        remaining-=amt;
        const afterStrategy=rowsFromAmounts(working).find(r=>r.strategy===target.strategy)||{};
        const afterBank=bankRowsFromAmounts(bankWorking).find(r=>r.bank===bank)||{};
        const s={step:stepNo++,stage_id:stage.stage_id,stage_title:stage.title,operation_type:target.strategy,strategy_title:target.strategy,bank,amount_wan:amt,status:stage.stage_id==='strategic'?'candidate_only':'planned',display_title:`Step ${stepNo-1}｜${target.strategy}｜${bank}｜${wan(amt)}`,before_strategy_gap_pct:beforeStrategy.gap_pct,after_strategy_gap_pct:afterStrategy.gap_pct,before_strategy_need_wan:beforeStrategy.need_wan,after_strategy_need_wan:afterStrategy.need_wan,before_bank_gap_pct:beforeBank.gap_pct,after_bank_gap_pct:afterBank.gap_pct,before_bank_gap_wan:beforeBank.gap_wan,after_bank_gap_wan:afterBank.gap_wan,remaining_wan:remaining,recompute_note:'candidate search complete: after every step, all strategy and bank gaps are recalculated'};
        allocation_steps.push(s);stageSteps.push(s);trace.push(s.display_title);
      }
      stages.push({...stage,planned_wan:stage.available_wan-remaining,remaining_wan:remaining,unallocated_wan:remaining,steps:stageSteps,trace,by_strategy:summarizeAmounts(stageSteps,'strategy_title'),by_bank:summarizeAmounts(stageSteps,'bank')});
    });
    const plan={version:'v072_candidate_allocation_loop',unit:'wan_usd',stage_caps:getStageCaps(),base_policy:{total_plan_base_wan:getPlanBaseWan()},strategy_gap_rows:rowsFromAmounts(getRuntimeAmounts()),bank_gap_rows:bankRowsFromAmounts(getRuntimeBankAmounts()),final_strategy_gap_rows:rowsFromAmounts(working),final_bank_gap_rows:bankRowsFromAmounts(bankWorking),stages,allocation_steps,runtime_context:getCtx()};publishHandoff(plan);return plan;
  }
  function renderKpis(){const plan=buildAllocationPlan();window.__M2_ALLOCATION_PLAN_BLUEPRINT__=plan;const caps=getStageCaps();const total=(plan.allocation_steps||[]).reduce((s,x)=>s+n(x.amount_wan),0);const s0=plan.stages[0]||{},s1=plan.stages[1]||{},s2=plan.stages[2]||{};return `<div class="m2v070-kpis"><div class="m2v070-kpi" style="--accent:#0f766e"><label>優先規劃｜確定可用</label><b>${wan(s0.available_wan)}</b><span>${s0.sub}</span>${renderMiniSteps(s0.steps)}</div><div class="m2v070-kpi" style="--accent:#2563eb"><label>短期規劃｜條件式啟用</label><b>${wan(s1.available_wan)}</b><span>${s1.sub}</span>${renderMiniSteps(s1.steps)}</div><div class="m2v070-kpi" style="--accent:#7c3aed"><label>策略佈局｜候補資金</label><b>${wan(s2.available_wan)}</b><span>${s2.sub}</span>${renderMiniSteps(s2.steps)}</div><div class="m2v070-kpi" style="--accent:#f97316"><label>預計池 / 已規劃</label><b>${wan(caps.expectedPool)} / ${wan(total)}</b><span>v072：完整 candidate search，不可執行金額留在 unallocated。</span></div></div>`;}
  function renderStrategyGap(){const rows=rowsFromAmounts(getRuntimeAmounts());const banks=bankRowsFromAmounts(getRuntimeBankAmounts());const open=PANEL_STATE.strategy?' open':'';return `<details class="m2v070-panel" id="planner-strategy-refill"${open}><summary>C. 投資策略補單｜Strategy Gap First + Bank Gap First</summary><div class="table-wrap" style="margin-top:10px"><table class="m2v070-table"><thead><tr><th>策略類別</th><th>目前金額</th><th>Real</th><th>Target</th><th>Gap</th><th>待補萬</th></tr></thead><tbody>${rows.map(r=>`<tr class="${r.gap_pct!=null&&r.gap_pct<0?'m2v070-under':'m2v070-over'}"><td><b>${r.strategy}</b></td><td>${r.current_wan==null?'-':wan(r.current_wan)}</td><td>${r.real_pct==null?'-':pct(r.real_pct)}</td><td>${r.target_pct}%</td><td>${r.gap_pct==null?'-':pct(r.gap_pct)}</td><td>${r.need_wan==null?'-':wan(r.need_wan)}</td></tr>`).join('')}</tbody></table></div><div class="table-wrap" style="margin-top:10px"><table class="m2v070-table"><thead><tr><th>Bank</th><th>Used</th><th>Target</th><th>Gap</th><th>Gap%</th><th>Lot Rule</th></tr></thead><tbody>${banks.map(b=>`<tr><td><b>${b.bank}</b></td><td>${wan(b.used_wan)}</td><td>${wan(b.target_wan)}</td><td>${wan(b.gap_wan)}</td><td>${pct(b.gap_pct)}</td><td>min ${wan(BANK_RULES[b.bank]?.min_wan||1)} / max ${wan(BANK_RULES[b.bank]?.max_wan||3)}</td></tr>`).join('')}</tbody></table></div></details>`;}
  function renderStepTraceTable(steps){if(!steps||!steps.length)return '<div class="m2v070-note">本階段沒有可執行配置。</div>';return `<div class="m2v070-step-table"><table class="m2v070-table"><thead><tr><th>Step</th><th>Stage</th><th>Selected Strategy</th><th>Strategy Gap before→after</th><th>Selected Bank</th><th>Bank Gap before→after</th><th>Amount</th><th>Remaining</th></tr></thead><tbody>${steps.map(s=>`<tr><td><b>${s.step}</b></td><td>${s.stage_title}</td><td>${s.strategy_title}</td><td>${pct(s.before_strategy_gap_pct)} → ${pct(s.after_strategy_gap_pct)}</td><td>${s.bank}</td><td>${pct(s.before_bank_gap_pct)} → ${pct(s.after_bank_gap_pct)}</td><td><b>${wan(s.amount_wan)}</b></td><td>${wan(s.remaining_wan)}</td></tr>`).join('')}</tbody></table></div>`;}
  function renderStageCards(){const plan=window.__M2_ALLOCATION_PLAN_BLUEPRINT__||buildAllocationPlan();const open=PANEL_STATE.stage?' open':'';return `<details class="m2v070-panel" id="planner-stage-simulation"${open}><summary>D. 補單步驟推演｜每一步後重新計算 Allocation</summary>${plan.stages.map(stage=>`<div class="m2v070-stage"><div class="m2v070-stage-title">${stage.title}</div><div class="m2v070-stage-sub">可用 ${wan(stage.available_wan)}｜已規劃 ${wan(stage.planned_wan)}｜剩餘 ${wan(stage.remaining_wan)}</div><div class="m2v070-result"><div><label>策略結果</label>${fmtMap(stage.by_strategy)}</div><div><label>銀行配置</label>${fmtMap(stage.by_bank)}</div><div><label>Unallocated</label>${wan(stage.unallocated_wan||0)}</div><div><label>階段說明</label>${stage.sub}</div></div>${renderStepTraceTable(stage.steps)}</div>`).join('')}</details>`;}
  function renderOutput(){const plan=window.__M2_ALLOCATION_PLAN_BLUEPRINT__||buildAllocationPlan();const handoff=window.__M2_TO_MARKET_FCN_HANDOFF__||publishHandoff(plan);return `<div class="m2v070-panel" id="planner-output"><h3>E0. Planner Output｜給第 4 區 D 讀</h3><div class="m2v070-note">已輸出 <b>window.__M2_TO_MARKET_FCN_HANDOFF__</b>；v072 只輸出可執行 lot，不能硬配的剩餘資金留在 unallocated。</div><div class="m2v070-actions"><button type="button" data-m2v070-json="toggle">查看 / 收合 planner JSON</button></div><pre id="m2v070JsonBox" class="m2v070-jsonbox">${JSON.stringify({plan,handoff},null,2)}</pre></div>`;}
  function buildHtml(){return `<div class="m2v070-wrap" id="m2v070PlanningBlueprint"><div class="m2v070-head"><b>M2 v072 Candidate Allocation Loop</b><br>每一步重算全部策略 gap% 與銀行 gap%；若最大銀行/策略無法執行 min lot，會嘗試下一組候選，不硬配。</div>${renderKpis()}<div class="m2v070-actions"><button type="button" data-m2v070-panel="expand">展開 C / D</button><button type="button" data-m2v070-panel="collapse">收合 C / D</button></div>${renderStrategyGap()}${renderStageCards()}${renderOutput()}</div>`;}
  function applyPanelState(){const c=document.getElementById('planner-strategy-refill');const d=document.getElementById('planner-stage-simulation');const j=document.getElementById('m2v070JsonBox');if(c)c.open=!!PANEL_STATE.strategy;if(d)d.open=!!PANEL_STATE.stage;if(j)j.classList.toggle('show',!!PANEL_STATE.json);}
  function refresh(){const old=document.getElementById('m2v070PlanningBlueprint');if(old){const sig=JSON.stringify(getCtx());if(sig===LAST_SIG)return;LAST_SIG=sig;INJECTING=true;old.outerHTML=buildHtml();applyPanelState();setTimeout(()=>{INJECTING=false},80);}}
  function inject(){injectCss();const bottom=document.getElementById('bottomQuery');const active=document.getElementById('activeTitle');if(!bottom||!active||!/Maturity Cashflow/.test(active.textContent||''))return;if(document.getElementById('m2v070PlanningBlueprint')){refresh();return;}INJECTING=true;LAST_SIG=JSON.stringify(getCtx());bottom.insertAdjacentHTML('afterbegin',buildHtml());applyPanelState();setTimeout(()=>{INJECTING=false},80);}
  document.addEventListener('click',function(ev){const p=ev.target.closest('[data-m2v070-panel]');if(p){const open=p.getAttribute('data-m2v070-panel')==='expand';PANEL_STATE.strategy=open;PANEL_STATE.stage=open;applyPanelState();}const j=ev.target.closest('[data-m2v070-json]');if(j){PANEL_STATE.json=!PANEL_STATE.json;applyPanelState();}setTimeout(inject,260);},true);
  new MutationObserver(()=>{if(!INJECTING)setTimeout(inject,220)}).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject);else inject();
})();