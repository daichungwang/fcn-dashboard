// ============================================================
// M2 Pool Manual Ops v74
// Path: js/mm/m2/m2_pool_manual_ops.js
// Purpose: Turn section 6 into a real FCN Pool query/edit/create/export workspace.
// Safety: no auto write-back. Generates JSON for manual paste/export only.
// ============================================================
(function(){
  if(window.__M2_POOL_MANUAL_OPS_V74__) return;
  window.__M2_POOL_MANUAL_OPS_V74__=true;

  const PATCH_ID='m2-pool-manual-ops-v74';
  const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  const fmt=(v,d=0)=>n(v).toLocaleString('en-US',{maximumFractionDigits:d});
  let poolRows=[];
  let selectedId=null;

  function css(){return `<style id="${PATCH_ID}-css">
#bottomQuery .pmops{display:grid!important;grid-template-columns:380px 1fr 430px!important;gap:12px!important;align-items:start!important;width:100%!important}
#bottomQuery .pm-card{border:1px solid #e5e7eb!important;border-radius:16px!important;background:#fff!important;padding:12px!important;min-height:160px!important;overflow:hidden!important}
#bottomQuery .pm-title{font-weight:950!important;font-size:16px!important;margin-bottom:8px!important}
#bottomQuery .pm-sub{font-size:12px!important;color:#64748b!important;line-height:1.45!important;margin-bottom:10px!important}
#bottomQuery .pm-tools{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important;margin-bottom:10px!important}
#bottomQuery .pm-tools input,#bottomQuery .pm-tools select,#bottomQuery .pm-form input,#bottomQuery .pm-form select,#bottomQuery .pm-form textarea{width:100%!important;border:1px solid #cbd5e1!important;border-radius:10px!important;padding:8px 10px!important;background:#fff!important;color:#111!important;font-size:13px!important}
#bottomQuery .pm-btns{display:flex!important;gap:8px!important;flex-wrap:wrap!important;margin:8px 0!important}
#bottomQuery .pm-btn{border:0!important;border-radius:10px!important;padding:8px 10px!important;background:#111!important;color:#fff!important;font-weight:900!important;cursor:pointer!important;font-size:12px!important;width:auto!important}
#bottomQuery .pm-btn.light{background:#eef2f7!important;color:#111!important;border:1px solid #d8dde6!important}
#bottomQuery .pm-btn.warn{background:#b45309!important;color:#fff!important}
#bottomQuery .pm-list{display:grid!important;gap:8px!important;max-height:620px!important;overflow:auto!important;padding-right:4px!important}
#bottomQuery .pm-row{border:1px solid #e5e7eb!important;border-radius:14px!important;padding:10px!important;background:#fff!important;cursor:pointer!important;line-height:1.45!important}
#bottomQuery .pm-row.active{outline:3px solid #bfdbfe!important;border-color:#2563eb!important;background:#eff6ff!important}
#bottomQuery .pm-row-top{display:flex!important;justify-content:space-between!important;gap:8px!important;font-weight:950!important;font-size:13px!important}
#bottomQuery .pm-row-sub{font-size:12px!important;color:#64748b!important;margin-top:4px!important;word-break:break-word!important}
#bottomQuery .pm-chips{display:flex!important;gap:5px!important;flex-wrap:wrap!important;margin-top:7px!important}
#bottomQuery .pm-chip{display:inline-block!important;border-radius:999px!important;background:#f1f5f9!important;color:#334155!important;padding:3px 7px!important;font-size:11px!important;font-weight:900!important}
#bottomQuery .pm-chip.good{background:#dcfce7!important;color:#166534!important}.pm-chip.warn{background:#fef3c7!important;color:#92400e!important}.pm-chip.bad{background:#fee2e2!important;color:#991b1b!important}.pm-chip.blue{background:#dbeafe!important;color:#1d4ed8!important}
#bottomQuery .pm-detail-grid{display:grid!important;grid-template-columns:repeat(2,1fr)!important;gap:8px!important;margin-top:10px!important}
#bottomQuery .pm-metric{border:1px solid #e5e7eb!important;border-radius:12px!important;background:#f8fafc!important;padding:9px!important}
#bottomQuery .pm-metric label{display:block!important;color:#64748b!important;font-size:11px!important;font-weight:900!important}.pm-metric b{font-size:16px!important}
#bottomQuery .pm-form{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important}
#bottomQuery .pm-form .wide{grid-column:1/-1!important}
#bottomQuery .pm-form label{font-size:11px!important;font-weight:900!important;color:#64748b!important;display:block!important;margin-bottom:3px!important}
#bottomQuery .pm-json{background:#020617!important;color:#d1fae5!important;border-radius:14px!important;padding:10px!important;font-family:Consolas,monospace!important;font-size:12px!important;white-space:pre!important;overflow:auto!important;max-height:280px!important;margin-top:10px!important}
#bottomQuery .pm-note{border:1px solid #f1df9a!important;background:#fffbe6!important;border-radius:12px!important;padding:9px!important;font-size:12px!important;line-height:1.6!important;margin-bottom:10px!important}
@media(max-width:1200px){#bottomQuery .pmops{grid-template-columns:1fr!important}#bottomQuery .pm-list{max-height:420px!important}}
</style>`}

  function first(...vals){return vals.find(v=>v!==undefined&&v!==null&&String(v)!=='')}
  function getId(f){return first(f.fcn_id,f.fcnId,f.id,f.product_id,'NEW-FCN')}
  function getBank(f){return first(f.tw_bank,f.bank,f.source,'-')}
  function getAmt(f){return n(first(f.amt,f.amount,f.notional,0),0)}
  function getRate(f){return n(first(f.rate,f.coupon_pct,f.coupon,0),0)}
  function getTenor(f){return n(first(f.tenor,f.period,f.tenor_month,0),0)}
  function getBasket(f){return Array.isArray(f.basket)?f.basket:(Array.isArray(f.symbols)?f.symbols:String(first(f.basket_display,'')).split(/[,+/|\s]+/).filter(Boolean))}
  function normalizeRow(f){return {...f,fcn_id:getId(f),tw_bank:getBank(f),amt:getAmt(f),rate:getRate(f),tenor:getTenor(f),basket:getBasket(f),status:first(f.status,'active')}}
  function statusClass(s){s=String(s||'').toLowerCase();if(s.includes('danger')||s.includes('soft_delete'))return'bad';if(s.includes('watch'))return'warn';return'good'}

  async function loadPool(){
    const paths=['../../data/fcn_pool.json','../../data/fcn_pool_old.json'];
    for(const p of paths){
      try{
        const res=await fetch(p,{cache:'no-store'});
        if(!res.ok) continue;
        const data=await res.json();
        const rows=Array.isArray(data)?data:(Array.isArray(data.data)?data.data:(Array.isArray(data.fcns)?data.fcns:[]));
        if(rows.length) return rows.map(normalizeRow);
      }catch(e){}
    }
    return [];
  }

  function selected(){return poolRows.find(x=>getId(x)===selectedId)||poolRows[0]||null}
  function filterRows(){
    const q=(document.getElementById('pmSearch')?.value||'').toUpperCase();
    const bank=document.getElementById('pmBank')?.value||'';
    const status=document.getElementById('pmStatus')?.value||'';
    const basket=document.getElementById('pmBasket')?.value?.toUpperCase()||'';
    return poolRows.filter(f=>{
      const text=[getId(f),getBank(f),getBasket(f).join(' '),f.status,f.worst_of,f.fcn_health].join(' ').toUpperCase();
      if(q&&!text.includes(q))return false;
      if(bank&&String(getBank(f)).indexOf(bank)<0)return false;
      if(status&&String(f.status)!==status)return false;
      if(basket&&!getBasket(f).join(' ').toUpperCase().includes(basket))return false;
      return true;
    });
  }

  function renderList(){
    const rows=filterRows();
    const list=document.getElementById('pmList');
    if(!list)return;
    list.innerHTML=rows.map(f=>`<div class="pm-row ${getId(f)===selectedId?'active':''}" data-pm-id="${getId(f)}"><div class="pm-row-top"><span>${getId(f)}</span><span>USD ${fmt(getAmt(f))}</span></div><div class="pm-row-sub">${getBasket(f).join(' / ')}｜${getBank(f)}｜Rate ${fmt(getRate(f),2)}%｜${getTenor(f)}M</div><div class="pm-chips"><span class="pm-chip ${statusClass(f.fcn_health||f.status)}">${f.fcn_health||f.status||'active'}</span><span class="pm-chip blue">KI ${fmt(first(f.ki,f.ki_pct,f.lower_barrier_pct,0),1)}</span><span class="pm-chip">Strike ${fmt(first(f.strike,f.strike_pct,0),1)}</span></div></div>`).join('')||'<div class="pm-note">查無資料</div>';
    list.querySelectorAll('.pm-row').forEach(r=>r.addEventListener('click',()=>{selectedId=r.dataset.pmId;renderAll(false)}));
    const count=document.getElementById('pmCount');if(count)count.textContent=`${rows.length} / ${poolRows.length} 筆`;
  }

  function formJson(){
    const v=id=>document.getElementById(id)?.value||'';
    return {
      fcn_id:v('pmEditId'),
      status:v('pmEditStatus')||'active',
      tw_bank:v('pmEditBank'),
      amt:Number(v('pmEditAmt')||0),
      rate:Number(v('pmEditRate')||0),
      tenor:Number(v('pmEditTenor')||0),
      strike:Number(v('pmEditStrike')||0),
      ki:Number(v('pmEditKi')||0),
      type:v('pmEditType')||'EKI',
      basket:v('pmEditBasket').split(/[,+/|\s]+/).map(x=>x.trim().toUpperCase()).filter(Boolean),
      note:v('pmEditNote'),
      updated_at:new Date().toISOString(),
      manual_ops:true
    };
  }

  function fillForm(f){
    if(!f)return;
    const set=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v??''};
    set('pmEditId',getId(f));set('pmEditStatus',f.status||'active');set('pmEditBank',getBank(f));set('pmEditAmt',getAmt(f));set('pmEditRate',getRate(f));set('pmEditTenor',getTenor(f));set('pmEditStrike',first(f.strike,f.strike_pct,''));set('pmEditKi',first(f.ki,f.ki_pct,''));set('pmEditType',first(f.type,f.fcn_type,'EKI'));set('pmEditBasket',getBasket(f).join(','));set('pmEditNote',first(f.note,''));updatePreview();
  }

  function updatePreview(){const pre=document.getElementById('pmJson');if(pre)pre.textContent=JSON.stringify(formJson(),null,2)}
  function softDelete(){const id=document.getElementById('pmEditId')?.value;const row=poolRows.find(x=>getId(x)===id);if(row){row.status='soft_delete';row.deleted_at=new Date().toISOString();row.manual_ops_delete=true;fillForm(row);renderList();}}
  function copyJson(){navigator.clipboard?.writeText(JSON.stringify(formJson(),null,2));}
  function newForm(){selectedId=null;fillForm({fcn_id:`NEW${Date.now().toString().slice(-6)}`,status:'active',tw_bank:'',amt:0,rate:0,tenor:0,strike:0,ki:0,type:'EKI',basket:[]});}

  function detailHtml(f){
    if(!f)return '<div class="pm-note">請先選擇 FCN</div>';
    return `<div class="pm-title">FCN Detail｜${getId(f)}</div><div class="pm-sub">這張卡是查詢中心，不直接寫回資料檔。</div><div class="pm-detail-grid"><div class="pm-metric"><label>Basket</label><b>${getBasket(f).join(' / ')||'-'}</b></div><div class="pm-metric"><label>Bank</label><b>${getBank(f)}</b></div><div class="pm-metric"><label>Amount</label><b>USD ${fmt(getAmt(f))}</b></div><div class="pm-metric"><label>Coupon / Tenor</label><b>${fmt(getRate(f),2)}% / ${getTenor(f)}M</b></div><div class="pm-metric"><label>Strike / KI</label><b>${fmt(first(f.strike,f.strike_pct,0),1)} / ${fmt(first(f.ki,f.ki_pct,0),1)}</b></div><div class="pm-metric"><label>Status</label><b>${f.status||'active'}</b></div></div><div class="pm-note" style="margin-top:10px">未來這裡會接 Basket DNA / M8 fair / M1 / M7 / Planner match / break event。</div>`;
  }

  function renderAll(refill=true){
    const box=document.getElementById('bottomQuery');if(!box)return;
    const f=selected();
    box.innerHTML=css()+`<div class="pmops"><section class="pm-card"><div class="pm-title">A. Query Workspace</div><div class="pm-sub">查詢 fcn_pool：fcn_id / basket / bank / status / coupon / KI。</div><div class="pm-tools"><input id="pmSearch" placeholder="搜尋 fcn_id / basket / bank"><input id="pmBasket" placeholder="basket ticker"><select id="pmBank"><option value="">全部銀行</option><option>富邦</option><option>永豐</option><option>UBS</option><option>GS</option></select><select id="pmStatus"><option value="">全部狀態</option><option>active</option><option>watch</option><option>danger</option><option>soft_delete</option></select></div><div class="pm-btns"><button class="pm-btn light" id="pmNew">新增 FCN</button><button class="pm-btn light" id="pmRefresh">重新整理</button><span class="pm-chip blue" id="pmCount">0</span></div><div class="pm-list" id="pmList"></div></section><section class="pm-card" id="pmDetail">${detailHtml(f)}</section><section class="pm-card"><div class="pm-title">C. Edit / Create / Export</div><div class="pm-sub">修改表單只產生 JSON，不自動寫回 GitHub。</div><div class="pm-form"><div><label>fcn_id</label><input id="pmEditId"></div><div><label>status</label><select id="pmEditStatus"><option>active</option><option>watch</option><option>danger</option><option>soft_delete</option></select></div><div><label>bank</label><input id="pmEditBank"></div><div><label>amount</label><input id="pmEditAmt" type="number"></div><div><label>coupon</label><input id="pmEditRate" type="number" step="0.01"></div><div><label>tenor</label><input id="pmEditTenor" type="number"></div><div><label>strike</label><input id="pmEditStrike" type="number" step="0.01"></div><div><label>KI</label><input id="pmEditKi" type="number" step="0.01"></div><div><label>type</label><select id="pmEditType"><option>EKI</option><option>AKI</option></select></div><div class="wide"><label>basket</label><input id="pmEditBasket" placeholder="NVDA,TSM,MU"></div><div class="wide"><label>note</label><textarea id="pmEditNote" rows="3"></textarea></div></div><div class="pm-btns"><button class="pm-btn" id="pmCopy">複製 JSON</button><button class="pm-btn warn" id="pmSoftDelete">Soft Delete</button></div><pre class="pm-json" id="pmJson"></pre></section></div>`;
    renderList();
    fillForm(f||{});
    ['pmSearch','pmBasket','pmBank','pmStatus'].forEach(id=>document.getElementById(id)?.addEventListener('input',renderList));
    document.getElementById('pmNew')?.addEventListener('click',newForm);
    document.getElementById('pmRefresh')?.addEventListener('click',async()=>{poolRows=await loadPool();renderAll();});
    document.getElementById('pmCopy')?.addEventListener('click',copyJson);
    document.getElementById('pmSoftDelete')?.addEventListener('click',softDelete);
    document.querySelectorAll('#bottomQuery .pm-form input,#bottomQuery .pm-form select,#bottomQuery .pm-form textarea').forEach(el=>el.addEventListener('input',updatePreview));
  }

  async function mount(){
    const title=document.getElementById('activeTitle')?.textContent||'';
    const box=document.getElementById('bottomQuery');
    if(!box || !title.includes('Pool Manual Ops')) return;
    if(box.dataset.pmopsMounted==='1') return;
    box.dataset.pmopsMounted='1';
    box.innerHTML='<div class="muted">Pool Manual Ops v74 載入中...</div>';
    poolRows=await loadPool();
    selectedId=poolRows[0]?getId(poolRows[0]):null;
    renderAll();
  }

  document.addEventListener('click',ev=>{if(ev.target.closest('[data-module="pool"]'))setTimeout(()=>{const b=document.getElementById('bottomQuery');if(b)b.dataset.pmopsMounted='0';mount();},160);});
  const obs=new MutationObserver(mount);if(document.body)obs.observe(document.body,{childList:true,subtree:true});
  setInterval(mount,1200);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
