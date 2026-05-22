// ============================================================
// MM/M2 作戰中心 - V69 Planner Driven Market FCN Selector Runtime
// Purpose: D. FCN 遴選系統 uses handoff steps x market_fcn_history x M8 Fair.
// v69i: listen to History Data Window changes, clear cache, rerender D selector.
// ============================================================
(function(){
  const PATCH_ID='m2-v069-selector-runtime';
  if(window.__M2_V069_SELECTOR_RUNTIME__) return;
  window.__M2_V069_SELECTOR_RUNTIME__=true;

  const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  const fmt=(v,d=0)=>n(v).toLocaleString('en-US',{maximumFractionDigits:d});
  const wan=v=>`${fmt(n(v,0),0)}萬`;
  const pct=v=>`${n(v,0)>=0?'+':''}${fmt(v,2)}%`;
  let marketRowsCache=null;

  async function loadMarketRows(force=false){
    if(marketRowsCache && !force) return marketRowsCache;
    const res=await fetch('../../data/mm/market_fcn_history.json',{cache:'no-store'});
    marketRowsCache=await res.json();
    return Array.isArray(marketRowsCache)?marketRowsCache:(Array.isArray(marketRowsCache?.rows)?marketRowsCache.rows:[]);
  }
  function resetMarketRowsCache(){marketRowsCache=null;}

  function normalizeSymbols(v){
    if(Array.isArray(v)) return v.map(x=>String(x||'').trim().toUpperCase()).filter(Boolean);
    return String(v||'').split(/[,+/\s]+/).map(x=>x.trim().toUpperCase()).filter(Boolean);
  }
  function rowSource(r){return String(r.source||r.bank_source||r.broker||'').toLowerCase();}
  function rowCoupon(r){return n(r.coupon_pct??r.market_coupon??r.market_rate??r.coupon??r.rate,0);}
  function rowTenor(r){return n(r.tenor_month??r.tenor_months??r.tenor??r.months??r.period,0);}
  function rowStrike(r){return n(r.strike_pct??r.strike,NaN);}
  function rowKi(r){return n(r.ki_pct??r.ki??r.knock_in,NaN);}
  function rowSymbols(r){return normalizeSymbols(r.symbols||r.underlyings||r.basket||r.basket_display||r.tickers);}
  function rowId(r,idx){return r.product_id||r.fcn_id||r.id||r.code||r.name||`FCN${idx+1}`;}
  function rowDate(r){return r.generated_at||r.date||r.trade_date||r.quote_date||r.updated_at||r.created_at||'-';}
  function templateFor(symbols){
    if(symbols.some(s=>['NVDA','TSM','AVGO','SMH','AMD','MRVL','ARM','MU'].includes(s))) return 'B_TACTICAL_AGGRESSIVE';
    if(symbols.some(s=>['COIN','SOFI','ALAB','CRDO','PLTR'].includes(s))) return 'D_SPECULATIVE';
    if(symbols.some(s=>['AAPL','LQD','UNH','REGN'].includes(s))) return 'E_DEFENSIVE';
    return 'F_OTHERS';
  }
  function riskBucket(strike,ki){
    const s=n(strike,0), k=n(ki,0);
    if(s>=75||k>=65) return 'HIGH';
    if(s>=70||k>=60) return 'MEDIUM_HIGH';
    if(s>=60||k>=50) return 'MID';
    return 'LOW';
  }
  function tenorBucket(m){if(m<=3)return 'SHORT'; if(m<=6)return 'MEDIUM_SHORT'; if(m<=9)return 'MEDIUM'; return 'LONG';}

  function css(){return `<style id="${PATCH_ID}-css">
#marketWorkspaceContent .v69{display:grid!important;gap:14px!important;width:100%!important;max-width:100%!important}#marketWorkspaceContent .v69 *{box-sizing:border-box!important}
#marketWorkspaceContent .v69-banner{border:1px solid #bfdbfe!important;background:#eff6ff!important;border-radius:16px!important;padding:14px!important;line-height:1.65!important;font-size:14px!important}#marketWorkspaceContent .v69-banner b{font-size:15px!important}.v69-mark{display:inline-block;margin-left:8px;border-radius:999px;background:#dcfce7;color:#166534;border:1px solid #86efac;padding:3px 8px;font-size:12px;font-weight:950}.v69-window{display:inline-block;margin-left:6px;border-radius:999px;background:#fef3c7;color:#92400e;border:1px solid #fbbf24;padding:3px 8px;font-size:12px;font-weight:950}
#marketWorkspaceContent .v69-stage{border:1px solid #cbd5e1!important;border-radius:20px!important;background:linear-gradient(135deg,#fff,#f8fafc)!important;padding:14px!important;display:grid!important;gap:12px!important}#marketWorkspaceContent .v69-stage-title{font-size:18px!important;font-weight:950!important}.v69-stage-sub{font-size:12px!important;color:#64748b!important;margin-top:3px!important}
#marketWorkspaceContent .v69-slot{border:1px solid #e5e7eb!important;border-radius:18px!important;padding:14px!important;background:#fff!important;box-shadow:0 2px 8px rgba(15,23,42,.04)!important;overflow:hidden!important}#marketWorkspaceContent .v69-slot-head{display:flex!important;justify-content:space-between!important;gap:12px!important;align-items:flex-start!important;margin-bottom:10px!important}#marketWorkspaceContent .v69-slot-title{font-size:16px!important;font-weight:950!important;line-height:1.35!important}#marketWorkspaceContent .v69-slot-sub{font-size:13px!important;color:#64748b!important;margin-top:4px!important;line-height:1.45!important}#marketWorkspaceContent .v69-slot-status{font-weight:950!important;color:#0f766e!important;background:#ecfdf5!important;border:1px solid #bbf7d0!important;border-radius:999px!important;padding:6px 10px!important;white-space:nowrap!important;font-size:12px!important}
#marketWorkspaceContent .v69-diag{display:flex!important;gap:6px!important;flex-wrap:wrap!important;margin:8px 0 10px!important}#marketWorkspaceContent .v69-diag span{display:inline-block!important;border-radius:999px!important;background:#f8fafc!important;color:#334155!important;border:1px solid #e2e8f0!important;padding:4px 8px!important;font-size:11px!important;font-weight:900!important}
#marketWorkspaceContent .v69-cards{display:flex!important;flex-wrap:nowrap!important;gap:12px!important;overflow-x:auto!important;overflow-y:hidden!important;padding:4px 2px 16px!important;width:100%!important;max-width:100%!important;scrollbar-gutter:stable!important}#marketWorkspaceContent .v69-card{display:grid!important;grid-template-rows:auto auto auto auto auto auto 1fr!important;flex:0 0 334px!important;width:334px!important;max-width:334px!important;min-width:334px!important;min-height:314px!important;border:1px solid #e5e7eb!important;border-radius:18px!important;background:#fff!important;padding:12px!important;box-shadow:0 2px 8px rgba(15,23,42,.05)!important;overflow:hidden!important;white-space:normal!important}#marketWorkspaceContent .v69-card.selected{outline:3px solid #bbf7d0!important;border-color:#22c55e!important}.v69-grade-promote{border-left:6px solid #16a34a!important}.v69-grade-update{border-left:6px solid #2563eb!important}.v69-grade-watch{border-left:6px solid #f59e0b!important}
#marketWorkspaceContent .v69-card-top{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:8px!important;align-items:start!important}#marketWorkspaceContent .v69-card-title{display:flex!important;gap:6px!important;align-items:center!important;font-weight:950!important;font-size:13px!important;line-height:1.35!important;min-width:0!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}#marketWorkspaceContent .v69-card-title input{flex:0 0 auto!important;margin:0!important}#marketWorkspaceContent .v69-amt{display:grid!important;grid-template-columns:auto 62px auto!important;align-items:center!important;gap:4px!important;font-size:12px!important;color:#334155!important;white-space:nowrap!important}#marketWorkspaceContent .v69-amt input{width:62px!important;min-width:62px!important;border:1px solid #cbd5e1!important;border-radius:8px!important;padding:5px!important;text-align:center!important;font-weight:900!important;background:#fff!important;color:#111!important}
#marketWorkspaceContent .v69-source{font-size:12px!important;color:#64748b!important;margin-top:6px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}#marketWorkspaceContent .v69-chips{display:flex!important;gap:5px!important;flex-wrap:wrap!important;margin:8px 0!important;min-height:22px!important;max-height:48px!important;overflow:hidden!important}.v69-chip{display:inline-block!important;border-radius:999px!important;background:#f1f5f9!important;color:#334155!important;padding:3px 7px!important;font-size:11px!important;font-weight:900!important;line-height:1.25!important;white-space:nowrap!important}.v69-chip.good{background:#dcfce7!important;color:#166534!important}.v69-chip.warn{background:#fef3c7!important;color:#92400e!important}.v69-chip.blue{background:#dbeafe!important;color:#1d4ed8!important}
#marketWorkspaceContent .v69-terms,#marketWorkspaceContent .v69-fair,#marketWorkspaceContent .v69-why{font-size:13px!important;line-height:1.55!important;color:#334155!important;margin-top:7px!important;word-break:break-word!important;white-space:normal!important}#marketWorkspaceContent .v69-terms{min-height:42px!important;border-bottom:1px dashed #e5e7eb!important;padding-bottom:7px!important}#marketWorkspaceContent .v69-terms b{font-size:17px!important;color:#0f172a!important}#marketWorkspaceContent .v69-fair{min-height:58px!important;border-top:0!important;padding-top:0!important}#marketWorkspaceContent .v69-fair b{color:#0f172a!important}#marketWorkspaceContent .v69-why{align-self:end!important;background:#f8fafc!important;border:1px solid #e5e7eb!important;border-radius:12px!important;padding:8px!important;min-height:39px!important;font-weight:850!important}
#marketWorkspaceContent .v69-empty{border:1px dashed #cbd5e1!important;border-radius:14px!important;padding:12px!important;color:#64748b!important;background:#f8fafc!important}#marketWorkspaceContent .v69-blueprint{border:1px solid #d8dde6!important;border-radius:18px!important;background:linear-gradient(135deg,#fff,#f8fafc)!important;padding:14px!important}.v69-bp-grid{display:grid!important;grid-template-columns:repeat(4,1fr)!important;gap:10px!important;margin-top:10px!important}.v69-bp-card{border:1px solid #e5e7eb!important;border-radius:14px!important;background:#fff!important;padding:10px!important}.v69-bp-card label{display:block!important;font-size:12px!important;color:#64748b!important;font-weight:900!important}.v69-bp-card b{font-size:20px!important}.v69-bp-list{margin-top:10px!important;display:grid!important;gap:8px!important}.v69-bp-row{border:1px solid #e5e7eb!important;background:#fff!important;border-radius:12px!important;padding:9px!important;font-size:13px!important;line-height:1.55!important;white-space:normal!important}
@media(max-width:900px){#marketWorkspaceContent .v69-bp-grid{grid-template-columns:1fr!important}#marketWorkspaceContent .v69-slot-head{display:block!important}#marketWorkspaceContent .v69-slot-status{display:inline-block!important;margin-top:8px!important}#marketWorkspaceContent .v69-card{flex-basis:302px!important;width:302px!important;max-width:302px!important;min-width:302px!important}}
</style>`}

  function fairEstimate(row,coupon){
    const fair=n(row.m8_fair_rate??row.fair_rate??row.new_fair_rate??row.final_fair_ref,0);
    return fair>0?fair:Math.max(8,coupon-2);
  }
  function normalizeCandidate(row,idx,step){
    const coupon=rowCoupon(row), tenor=rowTenor(row), symbols=rowSymbols(row), source=rowSource(row);
    const fair=fairEstimate(row,coupon); const gap=coupon-fair; const strike=rowStrike(row), ki=rowKi(row);
    const action=gap>=2?'Update':gap>=0.8?'Watch':'Watch';
    return {product_id:rowId(row,idx),source,bank:step.bank,generated_at:rowDate(row),upstream_bank:row.upstream_bank||'-',candidate_score:n(row.score??row.candidate_score??(gap+5),0),symbols,coupon_pct:coupon,tenor_month:tenor,barrier_type:row.barrier_type||row.type||'EKI',memory_type:row.memory_type||row.frequency||'',strike_pct:strike,ki_pct:ki,m8_fair_rate:fair,fair_gap:gap,final_fair_ref:n(row.final_fair_ref??row.final_fair??fair+0.5,NaN),action,template_group:row.template_group||row.template||templateFor(symbols),risk_bucket:row.risk_bucket||riskBucket(strike,ki),tenor_bucket:row.tenor_bucket||tenorBucket(tenor),planner_need_match:10,risk_fit_score:ki>=65?6:8,bank_fit_score:10,min_amount:step.amount_wan*10000};
  }
  function buildPack(rows){
    const handoff=window.__M2_TO_MARKET_FCN_HANDOFF__;
    const steps=(handoff&&Array.isArray(handoff.steps)&&handoff.steps.length)?handoff.steps:[];
    if(!steps.length) return null;
    const stages={};
    steps.forEach(step=>{
      const source=String(step.source||'').toLowerCase();
      const market=(rows||[]).filter(r=>rowSource(r)===source);
      const candidates=market.map((r,i)=>normalizeCandidate(r,i,step)).sort((a,b)=>b.fair_gap-a.fair_gap||b.coupon_pct-a.coupon_pct).slice(0,10);
      const stageKey=step.stage||'未分階段';
      stages[stageKey]=stages[stageKey]||{title:stageKey,steps:[]};
      stages[stageKey].steps.push({step,candidates,diagnostics:{market_rows:market.length,planner_matched:market.length,m8_fair_ok:candidates.filter(c=>c.m8_fair_rate>0).length,risk_fit:candidates.filter(c=>c.risk_fit_score>=7).length,displayed:candidates.length}});
    });
    return {handoff,rows,stages:Object.values(stages)};
  }
  function diagnosticsHtml(d){return `<div class="v69-diag"><span>Market rows ${d.market_rows||0}</span><span>Planner matched ${d.planner_matched||0}</span><span>M8 fair OK ${d.m8_fair_ok||0}</span><span>Risk fit ${d.risk_fit||0}</span><span>Displayed ${d.displayed||0} / 10</span></div>`;}
  function bankScore(c){return 10;}
  function candidateCard(step,c){
    const grade=String(c.action||'Watch').toLowerCase(); const amount=n(step.amount_wan,3); const kiText=Number.isFinite(Number(c.ki_pct))?fmt(c.ki_pct,1):'NA'; const strikeText=Number.isFinite(Number(c.strike_pct))?fmt(c.strike_pct,1):'NA'; const finalRef=Number.isFinite(Number(c.final_fair_ref))?`${fmt(c.final_fair_ref,2)}%`:'-';
    return `<div class="v69-card v69-grade-${grade}" data-v69-step="${step.step}" data-v69-candidate="${c.product_id}"><div class="v69-card-top"><label class="v69-card-title"><input type="checkbox" class="v69-check" data-v69-step="${step.step}" data-v69-candidate="${c.product_id}"> ${c.action}｜${c.product_id}</label><div class="v69-amt"><span>建議</span><input class="v69-amt-input" data-v69-step="${step.step}" data-v69-candidate="${c.product_id}" type="number" min="0" step="1" value="${amount}"><span>萬</span></div></div><div class="v69-source">${c.source}｜${c.generated_at||'-'}｜上手 ${c.upstream_bank||'-'}｜Score ${fmt(c.candidate_score,2)}</div><div class="v69-chips">${(c.symbols||[]).slice(0,6).map(s=>`<span class="v69-chip">${s}</span>`).join('')}</div><div class="v69-terms"><b>${fmt(c.coupon_pct,2)}%</b>｜${fmt(c.tenor_month,0)}M｜${c.barrier_type||'NA'} ${c.memory_type||''}<br>Strike/KI ${strikeText}/${kiText}</div><div class="v69-fair"><b>Market ${fmt(c.coupon_pct,2)}%</b>｜M8 Fair ${fmt(c.m8_fair_rate,2)}%<br>Gap ${pct(c.fair_gap)}｜Final Ref ${finalRef}</div><div class="v69-chips"><span class="v69-chip ${c.action==='Update'?'blue':'warn'}">${c.action}</span><span class="v69-chip">${c.template_group}</span><span class="v69-chip">${c.risk_bucket}</span><span class="v69-chip">${c.tenor_bucket}</span></div><div class="v69-why">配對 ${fmt(c.planner_need_match,1)}/10｜Risk ${fmt(c.risk_fit_score,1)}/10｜Bank ${fmt(bankScore(c),1)}/10</div></div>`;
  }
  function getWindowMode(){return localStorage.getItem('m2_market_history_window_days_v079')||'2';}
  function renderWorkspace(pack){
    const totalSteps=pack.stages.reduce((s,g)=>s+g.steps.length,0);
    const mode=getWindowMode();
    return `${css()}<div class="v69" data-v69="1"><div class="v69-banner"><b>D. FCN遴選系統｜v69i Handoff Step Driven</b><span class="v69-mark">3 stages × ${totalSteps} steps</span><span class="v69-window">History ${mode==='all'?'ALL':mode+'日'}</span><br>第 3 區 D 輸出 handoff steps；第 4 區 D 依 <b>Stage → Step → Bank Source</b> 展開小卡。永豐只抓 sinopac；富邦只抓 fubon。候選資料會跟 History Data Window 即時連動。</div>${pack.stages.map(stage=>`<section class="v69-stage"><div><div class="v69-stage-title">${stage.title}</div><div class="v69-stage-sub">${stage.steps.length} steps｜按補單順序展開</div></div>${stage.steps.map(group=>{const st=group.step;return `<section class="v69-slot"><div class="v69-slot-head"><div><div class="v69-slot-title">Step ${st.step}｜${st.strategy}｜${st.bank}｜需求 ${wan(st.amount_wan)}</div><div class="v69-slot-sub">source=${st.source}｜stage=${st.stage}｜rank=${st.rank_rule||'market coupon - m8 fair'}</div></div><div class="v69-slot-status" id="v69-status-${st.step}">未勾選</div></div>${diagnosticsHtml(group.diagnostics)}<div class="v69-cards">${group.candidates.map(c=>candidateCard(st,c)).join('')||'<div class="v69-empty">目前沒有符合此 step/source 的 market_fcn_history 候選。</div>'}</div></section>`;}).join('')}</section>`).join('')}<div id="v69Blueprint"></div><details><summary>分析過程｜v69i Step Candidate Diagnostics</summary><div class="muted" style="line-height:1.7;margin-top:8px">已讀 handoff steps ${totalSteps}；History ${mode==='all'?'ALL':mode+'日'} market rows ${pack.rows.length}。每個 Step 硬套 source：永豐/sinopac、富邦/fubon。</div></details></div>`;
  }

  function bindEvents(box,pack){
    const flat={}; pack.stages.forEach(stage=>stage.steps.forEach(g=>g.candidates.forEach(c=>{flat[`${g.step.step}::${c.product_id}`]={step:g.step,candidate:c};})));
    const update=()=>{
      const selected=[]; box.querySelectorAll('.v69-check:checked').forEach(ch=>{const key=`${ch.dataset.v69Step}::${ch.dataset.v69Candidate}`; const item=flat[key]; const amt=n(box.querySelector(`.v69-amt-input[data-v69-step="${ch.dataset.v69Step}"][data-v69-candidate="${ch.dataset.v69Candidate}"]`)?.value,0); if(item) selected.push({...item,amount_wan:amt});});
      const total=selected.reduce((s,x)=>s+x.amount_wan,0); const byBank=b=>selected.filter(x=>x.step.bank===b).reduce((s,x)=>s+x.amount_wan,0); const byStage={}; pack.stages.forEach(stage=>byStage[stage.title]=selected.filter(x=>x.step.stage===stage.title).reduce((s,x)=>s+x.amount_wan,0));
      const rows=selected.map(x=>`<div class="v69-bp-row"><b>Step ${x.step.step}｜${x.step.bank}｜${x.step.strategy}｜${x.candidate.product_id}</b>｜${(x.candidate.symbols||[]).join('/')}｜${wan(x.amount_wan)}<br><span class="muted">Market ${fmt(x.candidate.coupon_pct,2)}%｜M8 Fair ${fmt(x.candidate.m8_fair_rate,2)}%｜Gap ${pct(x.candidate.fair_gap)}｜${x.candidate.template_group}｜${x.candidate.risk_bucket}</span></div>`).join('')||'<div class="v69-bp-row muted">尚未勾選 FCN，今日投資藍圖暫為待分配。</div>';
      const bp=box.querySelector('#v69Blueprint'); if(bp) bp.innerHTML=`<div class="v69-blueprint"><h3>OUTPUT｜今日投資藍圖｜V69i</h3><div class="decision-note"><b>一句話：</b>${selected.length?'今日可依 12-step handoff 補市場單；每一步只看指定銀行 source。':'尚未勾選候選，先保留現金等待更合適市場單。'}</div><div class="v69-bp-grid"><div class="v69-bp-card"><label>總投入</label><b>${wan(total)}</b></div><div class="v69-bp-card"><label>永豐</label><b>${wan(byBank('永豐'))}</b></div><div class="v69-bp-card"><label>富邦</label><b>${wan(byBank('富邦'))}</b></div><div class="v69-bp-card"><label>階段</label><b>${Object.entries(byStage).map(([k,v])=>`${k.replace('｜',' ')} ${wan(v)}`).join(' / ')}</b></div></div><div class="v69-bp-list">${rows}</div></div>`;
      box.querySelectorAll('.v69-card').forEach(card=>{const checked=box.querySelector(`.v69-check[data-v69-step="${card.dataset.v69Step}"][data-v69-candidate="${card.dataset.v69Candidate}"]`)?.checked; card.classList.toggle('selected',!!checked);});
      pack.stages.forEach(stage=>stage.steps.forEach(g=>{const used=selected.filter(x=>x.step.step===g.step.step).reduce((s,x)=>s+x.amount_wan,0); const el=box.querySelector(`#v69-status-${g.step.step}`); if(el) el.textContent=used>0?`已選 ${wan(used)}｜剩餘 ${wan(Math.max(0,g.step.amount_wan-used))}`:'未勾選';}));
    };
    box.querySelectorAll('.v69-check,.v69-amt-input').forEach(el=>{el.addEventListener('input',update);el.addEventListener('change',update);}); update();
  }

  async function renderV69Selector(force=false){
    const box=document.getElementById('marketWorkspaceContent'); if(!box) return;
    const text=box.textContent||''; const shouldPatch=force||text.includes('FCN遴選系統')||box.querySelector('.dsel')||box.dataset.v69Target==='1'; if(!shouldPatch) return; if(box.dataset.v69Patched==='1'&&!force) return;
    box.dataset.v69Patched='1'; box.dataset.v69Target='1'; box.innerHTML='<div class="muted">V69i：載入 handoff steps × History Window 候選...</div>';
    try{const rows=await loadMarketRows(force); const pack=buildPack(rows); if(!pack) throw new Error('No window.__M2_TO_MARKET_FCN_HANDOFF__ steps. 請先開第 3 區 Maturity Cashflow 產生 handoff。'); box.innerHTML=renderWorkspace(pack); bindEvents(box,pack);}catch(err){console.error(err); box.innerHTML=`<div class="decision-note bad"><b>V69i 載入失敗</b><br>${err.message}</div>`; box.dataset.v69Patched='0';}
  }
  function rerenderFromWindowChange(){
    resetMarketRowsCache();
    const box=document.getElementById('marketWorkspaceContent');
    if(box){box.dataset.v69Patched='0';box.dataset.v69Target='1';}
    setTimeout(()=>renderV69Selector(true),80);
  }
  function install(){
    document.addEventListener('click',ev=>{const btn=ev.target.closest('[data-market-tab]'); if(!btn) return; if(btn.dataset.marketTab==='selector'){setTimeout(()=>renderV69Selector(true),180);setTimeout(()=>renderV69Selector(true),650);}});
    window.addEventListener('m2:market-history-window-change',rerenderFromWindowChange);
    window.M2V69SelectorRuntime={rerender:rerenderFromWindowChange,clearCache:resetMarketRowsCache};
    const obs=new MutationObserver(()=>renderV69Selector(false)); obs.observe(document.body,{childList:true,subtree:true}); setInterval(()=>renderV69Selector(false),1200); renderV69Selector(false);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install); else install();
})();
