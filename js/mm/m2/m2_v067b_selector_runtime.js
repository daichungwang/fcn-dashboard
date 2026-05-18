// ============================================================
// MM/M2 作戰中心 II - V67B Selector Runtime Patch
// Purpose: Replace v067A mock FCN selector with market_fcn_history driven candidates.
// Scope: UI orchestration only; no write-back, no production engine mutation.
// ============================================================
(function(){
  const PATCH_ID='m2-v067b-selector-runtime';
  if(window.__M2_V067B_SELECTOR_RUNTIME__) return;
  window.__M2_V067B_SELECTOR_RUNTIME__=true;

  const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  const fmt=(v,d=0)=>n(v).toLocaleString('en-US',{maximumFractionDigits:d});
  const wan=v=>`${fmt(n(v,0),0)}萬`;
  let marketRowsCache=null;

  function normalizeBasketSymbols(v){
    if(Array.isArray(v)) return v.map(x=>String(x||'').trim().toUpperCase()).filter(Boolean);
    return String(v||'').split(/[,+/\s]+/).map(x=>x.trim().toUpperCase()).filter(Boolean);
  }

  function selectorSlots(){
    return [
      {id:'sinopac-spec',bank:'永豐',category:'短期投機單',need:4,min:3,strategy:'建議 1 張 × 3萬｜投機單以 min lot 控風險'},
      {id:'sinopac-aggr',bank:'永豐',category:'積極單',need:6,min:3,strategy:'可 1張6萬 or 2張3萬｜依候選品質選擇'},
      {id:'fubon-spec',bank:'富邦',category:'短期投機單',need:1,min:1,strategy:'可 1 張 × 1萬｜補足投機缺口尾數'}
    ];
  }

  function detectTemplate(symbols){
    if(symbols.includes('NVDA')||symbols.includes('TSM')||symbols.includes('AVGO')||symbols.includes('SMH')||symbols.includes('AMD')||symbols.includes('MRVL')||symbols.includes('ARM')) return 'A_AI_CORE';
    if(symbols.includes('MU')||symbols.includes('SNDK')) return 'B_MEMORY';
    if(symbols.includes('TSLA')) return 'C_TSLA';
    if(symbols.includes('COIN')||symbols.includes('SOFI')||symbols.includes('ALAB')||symbols.includes('CRDO')||symbols.includes('PLTR')) return 'D_SPECULATIVE';
    if(symbols.includes('AAPL')||symbols.includes('LQD')||symbols.includes('UNH')||symbols.includes('REGN')) return 'E_DEFENSIVE';
    return 'F_OTHERS';
  }

  function capacityFor(symbols,strike,ki){
    if(strike>=75 || ki>=65) return 'CAUTION';
    if(symbols.includes('TSLA')||symbols.includes('COIN')||symbols.includes('SOFI')||symbols.includes('ALAB')||symbols.includes('CRDO')) return 'HOT';
    return 'PASS';
  }

  function categoryFor(coupon,tenor){
    if(coupon>=21 && tenor<=6) return '短期投機單';
    if(coupon>=21) return '積極單';
    if(coupon>=18) return '合理投資型';
    return '長期穩定現金流';
  }

  function slotFor(bank,category){
    if(bank==='永豐' && category==='短期投機單') return 'sinopac-spec';
    if(bank==='永豐' && category==='積極單') return 'sinopac-aggr';
    if(bank==='富邦' && category==='短期投機單') return 'fubon-spec';
    return null;
  }

  function buildCandidates(rows){
    const result={'sinopac-spec':[],'sinopac-aggr':[],'fubon-spec':[]};
    (Array.isArray(rows)?rows:[]).forEach((r,idx)=>{
      const bank=String(r.source||'').toLowerCase().includes('sinopac')?'永豐':'富邦';
      const coupon=n(r.coupon_pct??r.market_coupon??r.market_rate,null);
      const tenor=n(r.tenor_month??r.tenor,null);
      const strike=n(r.strike_pct??r.strike,null);
      const ki=n(r.ki_pct??r.ki,null);
      const symbols=normalizeBasketSymbols(r.symbols||r.basket||r.basket_display);
      if(!Number.isFinite(coupon)||!Number.isFinite(tenor)||!symbols.length) return;
      const category=categoryFor(coupon,tenor);
      const slot=slotFor(bank,category);
      if(!slot) return;

      // V67B temporary estimate. V68 will replace this with runBatchMarketWorkspace final_fair/new_fair/beta.
      const estimatedFair=Math.max(8,coupon-2);
      const finalFair=estimatedFair+0.5;
      const gap=coupon-finalFair;
      const template=detectTemplate(symbols);
      const capacity=capacityFor(symbols,strike,ki);
      const action=gap>=3?'Promote':gap>=1?'Update':'Watch';
      const amount=bank==='富邦'?1:3;
      result[slot].push({
        id:r.product_id||r.fcn_id||`MKT-${idx+1}`,
        grade:gap>=3?'A':gap>=1?'B':'C',
        bank,category,basket:symbols,coupon,
        tenor:`${tenor}M`,
        type:`${r.barrier_type||'NA'} ${r.memory_type||''}`.trim(),
        strike:Number.isFinite(strike)?strike:null,
        ki:Number.isFinite(ki)?ki:null,
        m8:Number(estimatedFair.toFixed(1)),
        final:Number(finalFair.toFixed(1)),
        gap:`${gap>=0?'+':''}${gap.toFixed(1)}%`,
        gap_num:gap,
        template,action,capacity,amount,
        source:r.source||'-',
        upstream_bank:r.upstream_bank||'-',
        generated_at:r.generated_at||'-',
        reason:`${template}｜Market ${coupon.toFixed(1)}% vs Final ${finalFair.toFixed(1)}%｜Gap ${gap.toFixed(1)}%。`
      });
    });
    Object.keys(result).forEach(k=>result[k].sort((a,b)=>b.gap_num-a.gap_num));
    return result;
  }

  async function loadMarketRows(){
    if(marketRowsCache) return marketRowsCache;
    const res=await fetch('../../data/mm/market_fcn_history.json',{cache:'no-store'});
    marketRowsCache=await res.json();
    return marketRowsCache;
  }

  function css(){return `<style id="${PATCH_ID}-css">
.v67b-mark{display:inline-block;margin-left:8px;border-radius:999px;background:#dcfce7;color:#166534;border:1px solid #86efac;padding:3px 8px;font-size:12px;font-weight:950}.v67b-empty{border:1px dashed #cbd5e1;border-radius:14px;padding:12px;color:#64748b;background:#f8fafc}.dcard-source{font-size:12px;color:#64748b;margin-top:5px}.dcard-action{font-weight:950}.chip.promote{background:#dcfce7;color:#166534}.chip.update{background:#dbeafe;color:#1d4ed8}.chip.watch{background:#fef3c7;color:#92400e}.chip.caution{background:#fee2e2;color:#991b1b}.chip.hot{background:#ffedd5;color:#9a3412}.bp-row.reject{background:#fff7ed;border-color:#fed7aa}.bp-row.pass{background:#f8fafc}
</style>`}

  function candidateCard(slot,c){
    const capClass=String(c.capacity||'').toLowerCase();
    const actionClass=String(c.action||'').toLowerCase();
    return `<div class="dcard dcard-${String(c.grade||'c').toLowerCase()}" data-dslot="${slot.id}" data-candidate="${c.id}">
      <div class="dcard-top"><label class="dcard-title"><input type="checkbox" class="dsel-check" data-dslot="${slot.id}" data-candidate="${c.id}"> ${c.grade}級｜${c.id}</label><div class="dcard-amt">建議 <input class="dsel-amt" data-dslot="${slot.id}" data-candidate="${c.id}" type="number" min="0" step="1" value="${c.amount}"> 萬</div></div>
      <div class="dcard-source">${c.source}｜${c.generated_at}｜上手 ${c.upstream_bank}</div>
      <div class="chips">${c.basket.map(s=>`<span class="chip">${s}</span>`).join('')}</div>
      <div class="dterms"><b>${fmt(c.coupon,2)}%</b>｜${c.tenor}｜${c.type}｜${fmt(c.strike,1)} / ${fmt(c.ki,1)}</div>
      <div class="dfair">M8 ${fmt(c.m8,1)}%｜Final ${fmt(c.final,1)}%｜Gap ${c.gap}</div>
      <div class="chips"><span class="chip ${actionClass}">${c.action}</span><span class="chip">${c.template}</span><span class="chip ${capClass}">Capacity ${c.capacity}</span></div>
      <div class="dwhy">${c.reason}</div>
    </div>`;
  }

  function renderWorkspace(candidates){
    const slots=selectorSlots();
    const totalRows=Object.values(candidates).reduce((s,arr)=>s+arr.length,0);
    return `${css()}<div class="dsel" data-v67b="1"><div class="dsel-banner"><b>D. FCN遴選系統｜v067B Market Rows Driven</b><span class="v67b-mark">真實 market_fcn_history</span><br>市場單 → Slot → 候選卡 → 勾選 → 修改金額 → OUTPUT 今日投資藍圖。此版不寫回、不下單；M8 fair 暫用 V67B estimate，V68 接 new/final/beta。</div>${slots.map(slot=>`<section class="dslot"><div class="dslot-head"><div><div class="dslot-title">${slot.bank}｜${slot.category}｜需求 ${wan(slot.need)}</div><div class="dslot-sub">min ${wan(slot.min)}｜${slot.strategy}</div></div><div class="dslot-status" id="dstatus-${slot.id}">未勾選</div></div><div class="dcards">${(candidates[slot.id]||[]).slice(0,8).map(c=>candidateCard(slot,c)).join('')||'<div class="v67b-empty">目前 market_fcn_history 沒有符合此 slot 的市場單。</div>'}</div></section>`).join('')}<div id="dselBlueprint"></div><details><summary>分析過程｜V67B Dynamic Candidate Rows</summary><div class="muted" style="line-height:1.7;margin-top:8px">已讀入 ${totalRows} 筆候選。分類規則：coupon≥21 且 tenor≤6 → 短期投機；coupon≥21 → 積極；coupon≥18 → 合理。銀行：sinopac → 永豐，其餘預設富邦。</div></details></div>`;
  }

  function bindEvents(box,candidates){
    const slots=selectorSlots();
    const flat={};
    Object.values(candidates).forEach(arr=>arr.forEach(c=>flat[c.id]=c));
    const update=()=>{
      const selected=[];
      box.querySelectorAll('.dsel-check:checked').forEach(ch=>{
        const slot=slots.find(s=>s.id===ch.dataset.dslot);
        const cand=flat[ch.dataset.candidate];
        const amt=n(box.querySelector(`.dsel-amt[data-dslot="${ch.dataset.dslot}"][data-candidate="${ch.dataset.candidate}"]`)?.value,0);
        if(slot&&cand)selected.push({slot,cand,amt});
      });
      const total=selected.reduce((s,x)=>s+x.amt,0);
      const bankTotal=b=>selected.filter(x=>x.cand.bank===b).reduce((s,x)=>s+x.amt,0);
      const catTotal=c=>selected.filter(x=>x.cand.category===c).reduce((s,x)=>s+x.amt,0);
      const rows=selected.map(x=>`<div class="bp-row pass"><b>${x.cand.bank}｜${x.cand.category}｜${x.cand.id}</b>｜${x.cand.basket.join('/')}｜${wan(x.amt)}<br><span class="muted">${fmt(x.cand.coupon,2)}%｜${x.cand.tenor}｜${x.cand.type}｜${fmt(x.cand.strike,1)}/${fmt(x.cand.ki,1)}｜${x.cand.gap}｜${x.cand.action}｜${x.cand.capacity}</span></div>`).join('')||'<div class="bp-row muted">尚未勾選 FCN，今日投資藍圖暫為待分配。</div>';
      const unfilled=slots.map(s=>({slot:s,used:selected.filter(x=>x.slot.id===s.id).reduce((a,b)=>a+b.amt,0)})).map(x=>({slot:x.slot,remain:Math.max(0,x.slot.need-x.used)})).filter(x=>x.remain>0);
      const rejects=Object.values(candidates).flat().filter(c=>!selected.some(x=>x.cand.id===c.id)).slice(0,5).map(c=>`<div class="bp-row reject"><b>暫不選｜${c.bank}｜${c.id}</b>｜${c.basket.join('/')}<br><span class="muted">原因：排序較後 / 未勾選｜${c.action}｜${c.capacity}｜Gap ${c.gap}</span></div>`).join('');
      const bp=box.querySelector('#dselBlueprint');
      if(bp)bp.innerHTML=`<div class="blueprint"><h3>OUTPUT｜今日投資藍圖｜V67B</h3><div class="decision-note"><b>一句話：</b>${selected.length?'今日可依勾選候選建立市場跟單；未滿 slot 的部分先列待分配。':'目前尚未勾選候選，先保留現金等待市場單。'}</div><div class="bp-grid"><div class="bp-card"><label>總投入</label><b>${wan(total)}</b></div><div class="bp-card"><label>永豐</label><b>${wan(bankTotal('永豐'))}</b></div><div class="bp-card"><label>富邦</label><b>${wan(bankTotal('富邦'))}</b></div><div class="bp-card"><label>積極 / 投機</label><b>${wan(catTotal('積極單'))} / ${wan(catTotal('短期投機單'))}</b></div></div><div class="bp-list">${rows}</div><div class="bp-list"><div class="bp-row"><b>待分配 / 未完成 slot</b><br>${unfilled.map(x=>`${x.slot.bank} ${x.slot.category} 剩餘 ${wan(x.remain)}`).join('｜')||'全部完成'}</div>${rejects}</div></div>`;
      box.querySelectorAll('.dcard').forEach(card=>{
        const checked=box.querySelector(`.dsel-check[data-dslot="${card.dataset.dslot}"][data-candidate="${card.dataset.candidate}"]`)?.checked;
        card.classList.toggle('selected',!!checked);
      });
      slots.forEach(slot=>{
        const used=selected.filter(x=>x.slot.id===slot.id).reduce((s,x)=>s+x.amt,0);
        const el=box.querySelector(`#dstatus-${slot.id}`);
        if(el)el.textContent=used>0?`已選 ${wan(used)}｜剩餘 ${wan(Math.max(0,slot.need-used))}`:'未勾選';
      });
    };
    box.querySelectorAll('.dsel-check,.dsel-amt').forEach(el=>{el.addEventListener('input',update);el.addEventListener('change',update)});
    update();
  }

  async function patchIfNeeded(){
    const box=document.getElementById('marketWorkspaceContent');
    if(!box || box.dataset.v67bPatched==='1') return;
    const isSelector=box.textContent.includes('FCN遴選系統') || box.querySelector('.dsel');
    if(!isSelector) return;
    box.dataset.v67bPatched='1';
    box.innerHTML='<div class="muted">V67B：載入 market_fcn_history 真實市場單...</div>';
    try{
      const rows=await loadMarketRows();
      const candidates=buildCandidates(rows);
      box.innerHTML=renderWorkspace(candidates);
      bindEvents(box,candidates);
    }catch(err){
      console.error(err);
      box.innerHTML=`<div class="decision-note bad"><b>V67B 載入失敗</b><br>${err.message}</div>`;
      box.dataset.v67bPatched='0';
    }
  }

  function install(){
    const obs=new MutationObserver(()=>patchIfNeeded());
    obs.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('click',ev=>{
      if(ev.target.closest('[data-market-tab="selector"]')){
        setTimeout(()=>{
          const box=document.getElementById('marketWorkspaceContent');
          if(box) box.dataset.v67bPatched='0';
          patchIfNeeded();
        },120);
      }
    });
    setInterval(patchIfNeeded,1000);
    patchIfNeeded();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install);
  else install();
})();
