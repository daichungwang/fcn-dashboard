// ============================================================
// M2 v70/v73 Selector UI Patch
// Path: js/mm/m2/m2_v070_selector_ui_patch.js
// Purpose:
// - v70: clarify FCN Score / Basket DNA / M1-M7 fallback.
// - v73: global duplicate lock by candidate identity = source::product_id.
// ============================================================
(function(){
  if(window.__M2_V070_SELECTOR_UI_PATCH__) return;
  window.__M2_V070_SELECTOR_UI_PATCH__=true;

  function getBox(){ return document.getElementById('marketWorkspaceContent'); }

  function normalizeSource(s){
    return String(s||'-').trim().toLowerCase();
  }

  function getCardSource(card){
    const t=card?.querySelector('.v69-source')?.textContent||'';
    return normalizeSource(t.split('｜')[0]||'-');
  }

  function getCardProductId(card){
    return card?.dataset?.v69Candidate || '';
  }

  function getCandidateKeyFromCard(card){
    return `${getCardSource(card)}::${getCardProductId(card)}`;
  }

  function ensureDuplicateStyle(){
    if(document.getElementById('m2-v73-dup-style')) return;
    const style=document.createElement('style');
    style.id='m2-v73-dup-style';
    style.textContent=`
      #marketWorkspaceContent .v73-dup-warning{border:1px solid #fecaca!important;background:#fff1f2!important;color:#991b1b!important;border-radius:12px!important;padding:8px 10px!important;margin:8px 0!important;font-size:12px!important;font-weight:900!important;line-height:1.5!important}
      #marketWorkspaceContent .v69-card.duplicate-blocked{outline:3px solid #fecaca!important;border-color:#ef4444!important}
      #marketWorkspaceContent .v69-chip.dup{background:#fee2e2!important;color:#991b1b!important}
    `;
    document.head.appendChild(style);
  }

  function showDuplicateWarning(msg){
    const box=getBox();
    if(!box) return;
    ensureDuplicateStyle();
    let el=box.querySelector('#v73DuplicateWarning');
    if(!el){
      el=document.createElement('div');
      el.id='v73DuplicateWarning';
      el.className='v73-dup-warning';
      const bp=box.querySelector('#v69Blueprint');
      if(bp) bp.parentNode.insertBefore(el,bp);
      else box.prepend(el);
    }
    el.textContent=msg;
  }

  function selectedKeyMap(box){
    const map=new Map();
    box.querySelectorAll('.v69-check:checked').forEach(ch=>{
      const card=ch.closest('.v69-card');
      if(!card) return;
      const key=getCandidateKeyFromCard(card);
      if(!map.has(key)) map.set(key,[]);
      map.get(key).push(ch);
    });
    return map;
  }

  function enforceUniqueSelections(triggerCheckbox=null){
    const box=getBox();
    if(!box) return;
    ensureDuplicateStyle();

    // If a newly checked box duplicates an existing selected candidate_key, immediately uncheck the new one.
    if(triggerCheckbox && triggerCheckbox.checked){
      const card=triggerCheckbox.closest('.v69-card');
      const key=getCandidateKeyFromCard(card);
      const existing=[...box.querySelectorAll('.v69-check:checked')].filter(ch=>ch!==triggerCheckbox).find(ch=>{
        const c=ch.closest('.v69-card');
        return getCandidateKeyFromCard(c)===key;
      });
      if(existing){
        triggerCheckbox.checked=false;
        card?.classList.add('duplicate-blocked');
        setTimeout(()=>card?.classList.remove('duplicate-blocked'),1200);
        showDuplicateWarning(`重複選擇已阻止：${key} 已在其他區塊被勾選。同一張 FCN 以 source::product_id 為唯一識別，只能計入一次。`);
        return false;
      }
    }

    // Safety cleanup: if duplicated states already exist, keep first and uncheck the rest.
    const map=selectedKeyMap(box);
    let changed=false;
    map.forEach((checks,key)=>{
      if(checks.length<=1) return;
      checks.slice(1).forEach(ch=>{
        ch.checked=false;
        ch.closest('.v69-card')?.classList.add('duplicate-blocked');
        changed=true;
      });
      showDuplicateWarning(`已自動移除重複選擇：${key}。同一 source::product_id 不可在同一 OUTPUT 重複計算。`);
    });
    if(changed){
      setTimeout(()=>box.querySelectorAll('.duplicate-blocked').forEach(x=>x.classList.remove('duplicate-blocked')),1200);
      const first=box.querySelector('.v69-check');
      if(first) first.dispatchEvent(new Event('input',{bubbles:true}));
    }
    return true;
  }

  function patchDuplicateLock(){
    const box=getBox();
    if(!box || box.dataset.v73DupLock==='1') return;
    box.dataset.v73DupLock='1';
    ensureDuplicateStyle();
    box.addEventListener('change',ev=>{
      const ch=ev.target.closest?.('.v69-check');
      if(!ch) return;
      const ok=enforceUniqueSelections(ch);
      if(!ok){
        ev.preventDefault();
        ev.stopImmediatePropagation();
      }
    },true);
    box.addEventListener('input',ev=>{
      const ch=ev.target.closest?.('.v69-check');
      if(ch) enforceUniqueSelections(ch);
    },true);
  }

  function patchText(){
    const box=getBox();
    if(!box) return;
    const banner=box.querySelector('.v69-banner');
    if(banner && !banner.dataset.v70Text){
      banner.dataset.v70Text='1';
      banner.innerHTML='<b>D. FCN遴選系統｜v73 FCN Score + Worst-of + Duplicate Lock</b><span class="v69-mark">plannerResult × market_fcn_history × source::product_id</span><br>3. Maturity Cashflow / m2_planner 決定「要補什麼」，D 區只負責拿 market_fcn_history 找候選。排序主軸為 <b>FCN Score = 0.40 Market Coupon + 0.25 FCN Condition + 0.15 M1 + 0.20 M7</b>；M1/M7 尚未接入時以 6 分中性值代替。勾選層以 <b>source::product_id</b> 做唯一識別，同一張 FCN 不可重複計入 OUTPUT。';
    }
  }

  function patchCards(){
    const box=getBox();
    if(!box) return;
    box.querySelectorAll('.v69-card').forEach(card=>{
      if(card.dataset.v70Patched==='1') return;
      card.dataset.v70Patched='1';
      const candidateKey=getCandidateKeyFromCard(card);
      const src=card.querySelector('.v69-source');
      if(src && !src.textContent.includes('Key ')){
        src.textContent += `｜Key ${candidateKey}`;
      }
      const chips=card.querySelectorAll('.v69-chips')[1];
      if(chips && !chips.textContent.includes('Unique')){
        chips.insertAdjacentHTML('beforeend', `<span class="v69-chip dup">Unique ${candidateKey}</span>`);
      }
    });
  }

  function patchBlueprintText(){
    const box=getBox();
    if(!box) return;
    const notes=box.querySelectorAll('.decision-note');
    notes.forEach(note=>{
      if(note.dataset.v70Text==='1') return;
      if(note.textContent.includes('M8 fair gap')){
        note.dataset.v70Text='1';
        note.innerHTML=note.innerHTML.replace('排序依 M8 fair gap，Final Fair 只參考。','排序依 FCN Score；M1/M7 若無資料以 6 分中性值代替；同一 source::product_id 只計入一次。');
      }
    });
  }

  function patch(){
    patchDuplicateLock();
    patchText();
    patchCards();
    patchBlueprintText();
    enforceUniqueSelections();
  }

  const obs=new MutationObserver(patch);
  if(document.body) obs.observe(document.body,{childList:true,subtree:true});
  setInterval(patch,1000);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',patch);
  else patch();
})();
