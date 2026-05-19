// ============================================================
// MM/M2 v070 Planning UI Blueprint
// Purpose: Put strategy refill planning UI into Section 3 first.
// Notes:
// - UI-only / read-only patch.
// - Does not move v066 market logic yet.
// - Adds Stage Result First cards with hidden trace.
// ============================================================
(function(){
  if(window.__M2_V070_PLANNING_UI_BLUEPRINT__) return;
  window.__M2_V070_PLANNING_UI_BLUEPRINT__ = true;

  const PLAN_BASE_WAN = 140;
  const FUBON_BASE_WAN = 90;
  const SINOPAC_BASE_WAN = 50;

  const n = (v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  const fmt = (v,d=0)=>n(v).toLocaleString('en-US',{maximumFractionDigits:d});
  const wan = v => `${fmt(n(v,0),0)}萬`;

  const TARGETS = {
    '長期穩定現金流':40,
    '合理投資型':30,
    '積極單':20,
    '短期投機單':10
  };

  function injectCss(){
    if(document.getElementById('m2V070PlanningCss')) return;
    const style=document.createElement('style');
    style.id='m2V070PlanningCss';
    style.textContent = `
      .m2v070-wrap{display:grid;gap:14px;margin-top:14px}
      .m2v070-head{border:1px solid #dbeafe;background:#f8fbff;border-radius:16px;padding:13px;line-height:1.65;font-size:13px}
      .m2v070-head b{font-size:15px}
      .m2v070-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
      .m2v070-kpi{position:relative;overflow:hidden;border:1px solid #e5e7eb;border-radius:16px;padding:12px 12px 12px 14px;background:#fff}
      .m2v070-kpi:before{content:"";position:absolute;left:0;top:0;width:5px;height:100%;background:var(--accent,#64748b)}
      .m2v070-kpi label{display:block;font-size:12px;color:#64748b;font-weight:950}
      .m2v070-kpi b{display:block;font-size:22px;margin-top:4px}
      .m2v070-kpi span{display:block;font-size:12px;color:#667085;line-height:1.4;margin-top:4px}
      .m2v070-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .m2v070-panel{border:1px solid #e5e7eb;border-radius:16px;background:#fff;padding:13px}
      .m2v070-panel h3{margin:0 0 8px;font-size:16px}
      .m2v070-note{border:1px solid #dbeafe;background:#f8fbff;border-radius:12px;padding:10px;line-height:1.65;font-size:13px;margin-top:8px}
      .m2v070-table{width:100%;border-collapse:collapse;min-width:720px}
      .m2v070-table th,.m2v070-table td{border-bottom:1px solid #eee;padding:8px;text-align:left;white-space:nowrap;font-size:13px}
      .m2v070-table th{background:#fafafa;color:#555}
      .m2v070-stage{border:1px solid #e5e7eb;border-radius:18px;background:linear-gradient(135deg,#fff,#f8fafc);padding:13px;margin-top:10px}
      .m2v070-stage-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
      .m2v070-stage-title{font-size:16px;font-weight:950}
      .m2v070-stage-sub{font-size:13px;color:#64748b;margin-top:4px;line-height:1.45}
      .m2v070-pill{display:inline-block;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:950;border:1px solid #d8dde6;background:#fff;color:#334155;white-space:nowrap}
      .m2v070-result{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
      .m2v070-result div{border:1px solid #e5e7eb;border-radius:12px;background:#fff;padding:9px;font-size:13px;line-height:1.45}
      .m2v070-result label{display:block;font-size:12px;color:#64748b;font-weight:950;margin-bottom:3px}
      .m2v070-trace{margin-top:10px;border:1px dashed #cbd5e1;border-radius:14px;background:#fff;padding:10px}
      .m2v070-trace summary{cursor:pointer;font-weight:950}
      .m2v070-step{border:1px solid #eee;border-radius:12px;background:#fafafa;padding:9px;margin:8px 0;line-height:1.55;font-size:13px}
      .m2v070-actions{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
      .m2v070-actions button{background:#f1f5f9!important;color:#111!important;border:1px solid #d8dde6!important;padding:7px 10px!important;border-radius:10px!important}
      @media(max-width:1000px){.m2v070-kpis,.m2v070-grid2,.m2v070-result{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function moneyWanFromUsd(v){return Math.floor(n(v,0)/10000);}

  function inferStrategyAmountWan(){
    const text=document.body.innerText||'';
    const out={};
    Object.keys(TARGETS).forEach(k=>{out[k]=null;});
    // Best effort only. The existing engine has no public data object here, so UI blueprint can still render placeholders.
    return out;
  }

  function buildStaticGapRows(){
    const current=inferStrategyAmountWan();
    return Object.keys(TARGETS).map(k=>{
      const cur=current[k];
      const target=TARGETS[k];
      const real=cur==null?null:cur/PLAN_BASE_WAN*100;
      const gap=real==null?null:real-target;
      const need=gap==null?null:(gap<0?Math.floor(PLAN_BASE_WAN*Math.abs(gap)/100):0);
      return {strategy:k,current_wan:cur,target_pct:target,real_pct:real,gap_pct:gap,need_wan:need};
    });
  }

  function stageData(){
    return [
      {
        id:'priority',title:'第一階段｜優先規劃',available:5,planned:5,remaining:0,status:'結果優先',
        resultStrategy:'依 gap% 最負策略優先；示範格式：積極單 5萬',
        resultBank:'永豐 3萬、富邦 2萬',
        note:'確定 release，可立即規劃。每一步補完後重算策略 gap 與銀行 gap。',
        steps:[
          ['積極單','永豐',3,'Step 1｜積極單｜永豐｜3萬：策略類別放最前面；永豐符合 min/max 3萬。'],
          ['積極單','富邦',2,'Step 2｜積極單｜富邦｜2萬：本階段剩 2萬，永豐 min 3萬不符，改富邦補尾數。']
        ]
      },
      {
        id:'short_term',title:'第二階段｜短期規劃',available:15,planned:null,remaining:null,status:'條件式',
        resultStrategy:'承接第一階段剩餘缺口，繼續以 gap% 最負者優先。',
        resultBank:'依銀行 gap% 與 min/max lot 決定。',
        note:'候選 release 成立後再啟用；若四類缺口已補滿，多餘資金保留，不硬補。',
        steps:[
          ['待推演','待分配',0,'第二階段將讀取第一階段後的 remaining need，再重新排序。']
        ]
      },
      {
        id:'strategic',title:'第三階段｜策略佈局',available:15,planned:null,remaining:null,status:'候補',
        resultStrategy:'只在市場單條件合理時啟用。',
        resultBank:'需同時通過銀行水位、M8 gap、風險限制。',
        note:'未來一月候補資金，不視為本月必做。',
        steps:[
          ['候補','待分配',0,'第三階段預設只保留；市場條件好才轉交第 4 區配對。']
        ]
      }
    ];
  }

  function renderKpis(){
    return `<div class="m2v070-kpis">
      <div class="m2v070-kpi" style="--accent:#0f766e"><label>優先規劃｜確定可用</label><b>5萬</b><span>確定 release，可立即規劃。</span></div>
      <div class="m2v070-kpi" style="--accent:#2563eb"><label>短期規劃｜條件式啟用</label><b>15萬</b><span>20萬 - 優先 5萬。</span></div>
      <div class="m2v070-kpi" style="--accent:#7c3aed"><label>策略佈局｜候補資金</label><b>15萬</b><span>35萬 - 5萬 - 15萬，不硬做。</span></div>
      <div class="m2v070-kpi" style="--accent:#f97316"><label>Total Plan Base</label><b>140萬</b><span>富邦 90萬 + 永豐 50萬；策略 gap 分母。</span></div>
    </div>`;
  }

  function renderStrategyGap(){
    const rows=buildStaticGapRows();
    const body=rows.map(r=>`<tr><td><b>${r.strategy}</b></td><td>${r.current_wan==null?'-':wan(r.current_wan)}</td><td>${r.real_pct==null?'-':fmt(r.real_pct,1)+'%'}</td><td>${fmt(r.target_pct,0)}%</td><td>${r.gap_pct==null?'-':fmt(r.gap_pct,1)+'%'}</td><td>${r.need_wan==null?'-':wan(r.need_wan)}</td><td>${r.gap_pct==null?'待接資料':r.gap_pct<0?'Underweight':'OK / Over'}</td></tr>`).join('');
    return `<div class="m2v070-panel" id="planner-strategy-refill"><h3>C. 投資策略補單｜Strategy Gap First</h3>
      <div class="m2v070-note"><b>口徑：</b>四類策略全部用 Total Plan Base 140萬計算 Real / Target / Gap；Gap% 最負者優先補。補單模式只做風控限制，不主導排序。</div>
      <div class="table-wrap" style="margin-top:10px"><table class="m2v070-table"><thead><tr><th>策略類別</th><th>目前金額</th><th>Real</th><th>Target</th><th>Gap</th><th>待補萬</th><th>狀態</th></tr></thead><tbody>${body}</tbody></table></div>
      <div class="m2v070-note">公式：need_wan = floor(140萬 × abs(負 gap%) / 100)。Release 只控制可執行階段，不直接扣 35萬重算 base。</div>
    </div>`;
  }

  function renderStageCards(){
    return `<div class="m2v070-panel" id="planner-stage-simulation"><h3>D. 補單步驟推演｜Stage Result First</h3>
      <div class="m2v070-note">預設顯示各階段結果；中間推演過程隱藏。每一步格式固定為：<b>Step N｜策略類別｜銀行｜金額</b>。</div>
      <div class="m2v070-actions"><button type="button" data-m2v070="expand">全部展開</button><button type="button" data-m2v070="collapse">全部收合</button></div>
      ${stageData().map(s=>`<div class="m2v070-stage"><div class="m2v070-stage-head"><div><div class="m2v070-stage-title">${s.title}</div><div class="m2v070-stage-sub">可用 ${wan(s.available)}｜已規劃 ${s.planned==null?'待推演':wan(s.planned)}｜剩餘 ${s.remaining==null?'待推演':wan(s.remaining)}</div></div><span class="m2v070-pill">${s.status}</span></div>
        <div class="m2v070-result"><div><label>策略結果</label>${s.resultStrategy}</div><div><label>銀行配置</label>${s.resultBank}</div><div><label>階段說明</label>${s.note}</div></div>
        <details class="m2v070-trace"><summary>展開推演過程</summary>${s.steps.map((x,i)=>`<div class="m2v070-step"><b>Step ${i+1}｜${x[0]}｜${x[1]}｜${wan(x[2])}</b><br>${x[3]}</div>`).join('')}<div class="m2v070-note">分配規則：allocate one executable lot → recompute strategy gap / bank gap → next priority → 若低於銀行 min 或類型已滿足，停止或切換銀行。</div></details>
      </div>`).join('')}
    </div>`;
  }

  function renderOutput(){
    const plan={version:'v070_ui_blueprint',unit:'wan_usd',base_policy:{total_plan_base_wan:140,fubon_plan_base_wan:90,sinopac_plan_base_wan:50,gap_base_rule:'strategy_gap_uses_static_total_plan_base_140',release_rule:'release_controls_stage_capital_only'},stage_capital:[{stage_id:'priority',available_wan:5},{stage_id:'short_term',available_wan:15},{stage_id:'strategic',available_wan:15}],step_display_rule:'Step N｜策略類別｜銀行｜金額'};
    window.__M2_ALLOCATION_PLAN_BLUEPRINT__=plan;
    return `<div class="m2v070-panel" id="planner-output"><h3>E0. Planner Output｜給第 4 區讀</h3><div class="m2v070-note">目前先輸出 blueprint object：<b>window.__M2_ALLOCATION_PLAN_BLUEPRINT__</b>。下一階段才把第 4 區 Market FCN Match 改讀正式 allocation_steps。</div><details class="m2v070-trace"><summary>查看 blueprint JSON</summary><pre style="white-space:pre-wrap;font-size:12px;background:#0f172a;color:#e5e7eb;border-radius:12px;padding:10px;max-height:320px;overflow:auto">${JSON.stringify(plan,null,2)}</pre></details></div>`;
  }

  function buildHtml(){
    return `<div class="m2v070-wrap" id="m2v070PlanningBlueprint"><div class="m2v070-head"><b>M2 v070 Planning UI Blueprint</b><br>第 3 區先定義資金 / 策略 / 銀行補單 UI，不搬第 4 區 v066 邏輯。策略缺口用 140萬靜態母數；可補金額用 5萬 / 15萬 / 15萬 分階段控制。</div>${renderKpis()}${renderStrategyGap()}${renderStageCards()}${renderOutput()}</div>`;
  }

  function injectSubnav(){
    const nav=document.getElementById('m2MaturityCashflowSubnav');
    if(!nav || nav.querySelector('[data-planner-nav="strategy"]')) return;
    const btns=[['strategy','C. 投資策略補單'],['stage','D. 補單推演'],['output','E0. Planner Output']];
    btns.forEach(([key,label])=>{
      const b=document.createElement('button');
      b.className='m2-hz-subnav-btn';
      b.dataset.plannerNav=key;
      b.type='button';
      b.textContent=label;
      nav.insertBefore(b, nav.querySelector('[data-planner-nav="detail"]') || null);
    });
  }

  function bindActions(root){
    root.querySelectorAll('[data-m2v070]').forEach(btn=>btn.addEventListener('click',()=>{
      const open=btn.dataset.m2v070==='expand';
      root.querySelectorAll('details.m2v070-trace').forEach(d=>d.open=open);
    }));
  }

  function inject(){
    injectCss();
    injectSubnav();
    const bottom=document.getElementById('bottomQuery');
    const active=document.getElementById('activeTitle');
    if(!bottom || !active || !/Maturity Cashflow/.test(active.textContent||'')) return;
    if(document.getElementById('m2v070PlanningBlueprint')) return;
    bottom.insertAdjacentHTML('afterbegin',buildHtml());
    bindActions(document.getElementById('m2v070PlanningBlueprint'));
  }

  document.addEventListener('click',function(ev){
    const btn=ev.target.closest('[data-planner-nav]');
    if(btn){
      const map={strategy:'planner-strategy-refill',stage:'planner-stage-simulation',output:'planner-output'};
      setTimeout(()=>{
        inject();
        const el=document.getElementById(map[btn.dataset.plannerNav]);
        if(el) el.scrollIntoView({behavior:'smooth',block:'start'});
      },280);
    } else {
      setTimeout(inject,180);
    }
  },true);
  new MutationObserver(()=>setTimeout(inject,80)).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',inject);
  else inject();
})();
