(function(){
  if(window.__M2_INTEREST_STANDALONE__) return;
  window.__M2_INTEREST_STANDALONE__=true;

  const app=document.getElementById('interestApp');
  const runtimeMeta=document.getElementById('runtimeMeta');
  if(!app) return;

  const n=(v,d=0)=>{const raw=String(v??'').replace(/[^\d.-]/g,'');const x=Number(raw);return Number.isFinite(x)?x:d};
  const fmt=(v,d=2)=>n(v).toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  let poolRows=[];
  let selectedTemplate='all';
  let projectionRows=[];
  const cfg={firstOffset:41,interval:31,cashBuffer:3,months:12};
  const ui={bank:'',single:'',custom:''};

  function first(...vals){return vals.find(v=>v!==undefined&&v!==null&&String(v).trim()!=='')}
  function addDays(date,days){const d=new Date(date);d.setDate(d.getDate()+days);return d}
  function ymd(d){if(!d)return'';const x=new Date(d);return Number.isNaN(x.getTime())?'':x.toISOString().slice(0,10)}
  function ym(d){const s=ymd(d);return s?s.slice(0,7):''}
  function entryDate(f){return first(f.entry_time,f.created_time,f.date,f.entry_date,f.create_date)}
  function maturityDate(f){if(f.maturity_time)return f.maturity_time;const e=new Date(entryDate(f));if(Number.isNaN(e.getTime()))return'';e.setMonth(e.getMonth()+n(f.tenor,0));return e}
  function exitDate(f){return first(f.exit_time,f.closed_time,f.exit_date,f.maturity_time)}
  function getBasket(f){return Array.isArray(f.basket)?f.basket:String(f.basket||f.symbols||f.underlyings||'').split(/[,+/\s]+/).filter(Boolean)}
  function activePosition(f){return String(f.status||'active').trim().toLowerCase()==='active'&&f.has_position!==false&&f.is_portfolio!==false}
  function amountOf(f){return n(first(f.amt,f.amount,f.notional,f.principal,f.investment_amount,f.face_value,f.issue_amount),0)}
  function sourceOf(f){return String(first(f.source,f.decision_flag,f.tw_bank,f.bank,'Unknown'))}
  function statusOf(f){return String(first(f.status,f.lifecycle,'Unknown'))}
  function isExitFcn(f){const s=statusOf(f).toLowerCase();return ['closed','expired','redeemed','early_exit','settled','inactive','matured'].includes(s)||!!f.exit_time||!!f.closed_time}

  async function loadPool(){
    try{
      const res=await fetch('../../data/fcn_pool.json',{cache:'no-store'});
      const data=await res.json();
      poolRows=(Array.isArray(data)?data:(data.rows||data.data||data.fcns||[]));
      const activeCount=poolRows.filter(activePosition).length;
      if(runtimeMeta) runtimeMeta.textContent=`Loaded ${poolRows.length} FCN rows; active ${activeCount}.`;
    }catch(e){
      console.error(e);
      if(runtimeMeta) runtimeMeta.textContent='Failed to load fcn_pool.json';
      poolRows=[];
    }
  }

  function syncUiFromDom(){
    const bankEl=document.getElementById('ipBank'),singleEl=document.getElementById('ipSingle'),customEl=document.getElementById('ipCustom'),monthsEl=document.getElementById('ipMonths'),firstEl=document.getElementById('ipFirst'),intervalEl=document.getElementById('ipInterval'),bufferEl=document.getElementById('ipBuffer');
    if(bankEl)ui.bank=bankEl.value||'';if(singleEl)ui.single=singleEl.value||'';if(customEl)ui.custom=customEl.value||'';
    if(monthsEl)cfg.months=n(monthsEl.value,12);if(firstEl)cfg.firstOffset=n(firstEl.value,41);if(intervalEl)cfg.interval=n(intervalEl.value,31);if(bufferEl)cfg.cashBuffer=n(bufferEl.value,3);
  }
  function setTemplate(next){syncUiFromDom();selectedTemplate=next;if(next==='all'){ui.bank='';ui.single='';ui.custom='';}if(next==='bank'&&!ui.bank)ui.bank='富邦';render()}
  function applyTemplateFilter(rows){
    let out=rows.slice();
    if(selectedTemplate==='bank'&&ui.bank)out=out.filter(f=>String(f.tw_bank||f.bank||'').includes(ui.bank));
    if(selectedTemplate==='rayray')out=out.filter(f=>String(f.fcn_id||'').includes('睿睿'));
    if(selectedTemplate==='single'&&ui.single){const single=String(ui.single||'').trim().toUpperCase();out=out.filter(f=>String(f.fcn_id||'').toUpperCase().includes(single));}
    if(selectedTemplate==='custom'&&ui.custom){const ids=String(ui.custom||'').toUpperCase().split(/[\n, ]+/).map(x=>x.trim()).filter(Boolean);out=out.filter(f=>ids.some(id=>String(f.fcn_id||'').toUpperCase().includes(id)));}
    return out;
  }
  function templateRows(){return applyTemplateFilter(poolRows).filter(activePosition)}
  function movementRows(){return applyTemplateFilter(poolRows)}

  function buildProjection(){
    const start=new Date(),end=new Date();end.setMonth(end.getMonth()+cfg.months);
    const rows=[];
    templateRows().forEach(f=>{
      const e=new Date(entryDate(f));if(Number.isNaN(e.getTime()))return;
      const mat=new Date(maturityDate(f));const stop=Number.isNaN(mat.getTime())?end:mat;
      let coupon=addDays(e,cfg.firstOffset),seq=1;
      while(coupon<=end&&coupon<=stop&&seq<=48){
        const cash=addDays(coupon,cfg.cashBuffer);
        if(cash>=start){
          const interest=amountOf(f)*n(f.rate,0)/100/12;
          rows.push({month:ym(cash),cash_in_date:ymd(cash),coupon_date:ymd(coupon),seq,fcn_id:f.fcn_id||'',status:f.status||'',bank:f.tw_bank||f.bank||'',basket:getBasket(f).join('/'),currency:f.currency||'USD',amt:amountOf(f),rate:n(f.rate,0),interest});
        }
        coupon=addDays(coupon,cfg.interval);seq++;
      }
    });
    projectionRows=rows.sort((a,b)=>a.cash_in_date.localeCompare(b.cash_in_date)||a.fcn_id.localeCompare(b.fcn_id));
  }
  function monthlySummary(){const map={};projectionRows.forEach(r=>{const k=r.month+'|'+r.currency;map[k]=map[k]||{month:r.month,currency:r.currency,interest:0,count:0};map[k].interest+=r.interest;map[k].count++;});return Object.values(map).sort((a,b)=>a.month.localeCompare(b.month)||a.currency.localeCompare(b.currency))}
  function groupByMonth(rows,dateFn){const map={};rows.forEach(f=>{const month=ym(dateFn(f));if(!month)return;const currency=f.currency||'USD';const key=month+'|'+currency;map[key]=map[key]||{month,currency,count:0,amount:0,items:[]};map[key].count++;map[key].amount+=amountOf(f);map[key].items.push(f);});return Object.values(map).sort((a,b)=>b.month.localeCompare(a.month)||a.currency.localeCompare(b.currency))}
  function optionList(values,selected,label){return `<option value="">${label}</option>${values.map(v=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(v)}</option>`).join('')}`}
  function fcnMiniRows(items,dateFn){return `<div class="ip-table-wrap ip-nested"><table class="ip-table"><thead><tr><th>Date</th><th>FCN</th><th>Status</th><th>Source</th><th>Bank</th><th>Basket</th><th>Amount</th></tr></thead><tbody>${items.map(f=>`<tr><td>${ymd(dateFn(f))}</td><td><b>${esc(f.fcn_id||'')}</b></td><td>${esc(statusOf(f))}</td><td>${esc(sourceOf(f))}</td><td>${esc(f.tw_bank||f.bank||'')}</td><td>${esc(getBasket(f).join('/'))}</td><td>${esc(f.currency||'USD')} ${fmt(amountOf(f),0)}</td></tr>`).join('')}</tbody></table></div>`}
  function renderMonthlyExits(){const groups=groupByMonth(movementRows().filter(isExitFcn),exitDate);if(!groups.length)return `<h3 style="margin-top:14px">7B. Monthly FCN Exits / 每月 FCN 出場</h3><div class="ip-empty">目前沒有可彙總的 FCN 出場資料。</div>`;return `<h3 style="margin-top:14px">7B. Monthly FCN Exits / 每月 FCN 出場</h3><div class="ip-table-wrap"><table class="ip-table"><thead><tr><th>Month</th><th>Currency</th><th>Exit Count</th><th>Exit Amount</th><th>Detail</th></tr></thead><tbody>${groups.map(g=>`<tr><td><b>${g.month}</b></td><td>${g.currency}</td><td>${g.count}</td><td>${g.currency} ${fmt(g.amount,0)}</td><td><details><summary>展開明細</summary>${fcnMiniRows(g.items,exitDate)}</details></td></tr>`).join('')}</tbody></table></div>`}
  function renderMonthlyNewFcns(){const rows=movementRows().filter(f=>ym(entryDate(f)));const months=[...new Set(rows.map(f=>ym(entryDate(f))))].sort().reverse();const sources=[...new Set(rows.map(sourceOf))].sort();const statuses=[...new Set(rows.map(statusOf))].sort();const month=document.getElementById('ipNewMonth')?.value||'';const source=document.getElementById('ipNewSource')?.value||'';const status=document.getElementById('ipNewStatus')?.value||'';const filtered=rows.filter(f=>(!month||ym(entryDate(f))===month)&&(!source||sourceOf(f)===source)&&(!status||statusOf(f)===status));const groups=groupByMonth(filtered,entryDate);return `<h3 style="margin-top:14px">7C. Monthly New FCN / 每月新增 FCN</h3><div class="ip-tools"><label>Month <select id="ipNewMonth">${optionList(months,month,'全部月份')}</select></label><label>Source <select id="ipNewSource">${optionList(sources,source,'全部來源')}</select></label><label>Status <select id="ipNewStatus">${optionList(statuses,status,'全部狀態')}</select></label></div>${groups.length?`<div class="ip-table-wrap"><table class="ip-table"><thead><tr><th>Month</th><th>Currency</th><th>New Count</th><th>New Amount</th><th>Detail</th></tr></thead><tbody>${groups.map(g=>`<tr><td><b>${g.month}</b></td><td>${g.currency}</td><td>${g.count}</td><td>${g.currency} ${fmt(g.amount,0)}</td><td><details><summary>展開明細</summary>${fcnMiniRows(g.items,entryDate)}</details></td></tr>`).join('')}</tbody></table></div>`:`<div class="ip-empty">目前篩選條件下沒有新增 FCN。</div>`}`}

  function btn(k,label){return `<button class="ip-btn ${selectedTemplate===k?'active':''}" data-ip-template="${k}" type="button">${label}</button>`}
  function renderKpis(){const fcns=templateRows();const totalAmt=fcns.reduce((s,f)=>s+amountOf(f),0);const totalInterest=projectionRows.reduce((s,r)=>s+r.interest,0);return `<div class="ip-grid"><div class="ip-kpi"><label>Active FCN Count</label><b>${fcns.length}</b></div><div class="ip-kpi"><label>Active Principal</label><b>USD ${fmt(totalAmt,0)}</b></div><div class="ip-kpi"><label>Projection Rows</label><b>${projectionRows.length}</b></div><div class="ip-kpi"><label>Total Interest</label><b>USD ${fmt(totalInterest,2)}</b></div></div>`}
  function renderMonthlyCards(mon){const max=Math.max(1,...mon.map(r=>n(r.interest,0)));return `<div class="ip-month-cards">${mon.map(r=>{const pct=Math.max(3,Math.min(100,n(r.interest,0)/max*100));return `<div class="ip-month-card"><div class="ip-month-head"><b>${r.month}</b><span>${r.currency}</span></div><div class="ip-month-money"><span class="ip-month-currency">${r.currency}</span><span class="ip-month-amount">${fmt(r.interest,2)}</span></div><div class="ip-month-sub">${r.count} 筆入帳</div><div class="ip-month-bar"><span style="width:${pct}%"></span></div></div>`}).join('')}</div>`}
  function renderTables(){const mon=monthlySummary();const movement=renderMonthlyExits()+renderMonthlyNewFcns();if(!projectionRows.length)return `${movement}<div class="ip-empty">目前模板沒有可推估利息資料。只計算 status = active 且 has_position / is_portfolio 未被標 false 的 FCN；closed 不計息。</div>`;return `<h3>7A. Monthly Interest Summary / 月別利息總表</h3>${renderMonthlyCards(mon)}<details class="ip-month-detail"><summary>月別表格明細</summary><div class="ip-table-wrap"><table class="ip-table"><thead><tr><th>Month</th><th>Currency</th><th>Count</th><th>Estimated Interest</th></tr></thead><tbody>${mon.map(r=>`<tr><td><b>${r.month}</b></td><td>${r.currency}</td><td>${r.count}</td><td>${r.currency} ${fmt(r.interest,2)}</td></tr>`).join('')}</tbody></table></div></details>${movement}<h3 style="margin-top:14px">7D. FCN 明細表</h3><div class="ip-table-wrap"><table class="ip-table"><thead><tr><th>Cash-in</th><th>Coupon Date</th><th>#</th><th>FCN</th><th>Status</th><th>Bank</th><th>Basket</th><th>Amt</th><th>Rate</th><th>Interest</th></tr></thead><tbody>${projectionRows.map(r=>`<tr><td>${r.cash_in_date}</td><td>${r.coupon_date}</td><td>${r.seq}</td><td><b>${esc(r.fcn_id)}</b></td><td>${esc(r.status)}</td><td>${esc(r.bank)}</td><td>${esc(r.basket)}</td><td>${r.currency} ${fmt(r.amt,0)}</td><td>${fmt(r.rate,2)}%</td><td>${r.currency} ${fmt(r.interest,2)}</td></tr>`).join('')}</tbody></table></div>`}
  function render(){syncUiFromDom();buildProjection();const bankDisabled=selectedTemplate!=='bank'?'disabled':'',singleDisabled=selectedTemplate!=='single'?'disabled':'',customDisabled=selectedTemplate!=='custom'?'disabled':'';app.innerHTML=`<div class="ip-wrap"><aside class="ip-card"><div class="ip-title">7. FCN Interest Projection</div><div class="ip-sub">快速模板重算未來每月入帳利息，並補上本金新增/出場節奏。</div><div class="ip-btns">${btn('all','ALL 全部 FCN')}${btn('bank','By Bank 銀行別')}${btn('rayray','睿睿專區')}${btn('single','Single FCN')}${btn('custom','Custom 自訂')}</div><div class="ip-note">日期規則：第一次理論配息 = entry + 41 days；預估入帳 = 配息 + 3 days；之後每 31 days 一次。</div><div class="decision-note"><b>計算範圍：</b>利息只計算 active FCN；7B/7C 本金節奏使用 fcn_pool 原始資料彙總。</div></aside><main class="ip-card"><div class="ip-title">7. FCN 利息推估</div><div class="ip-tools"><label>Bank <select id="ipBank" ${bankDisabled}><option value="">全部</option><option ${ui.bank==='富邦'?'selected':''}>富邦</option><option ${ui.bank==='永豐'?'selected':''}>永豐</option></select></label><label>Single <input id="ipSingle" ${singleDisabled} value="${esc(ui.single)}" placeholder="FCN849N"></label><label>Months <input id="ipMonths" type="number" value="${cfg.months}"></label><label>First +days <input id="ipFirst" type="number" value="${cfg.firstOffset}"></label><label>Interval <input id="ipInterval" type="number" value="${cfg.interval}"></label><label>Cash buffer <input id="ipBuffer" type="number" value="${cfg.cashBuffer}"></label></div><textarea id="ipCustom" ${customDisabled} rows="2" style="width:100%;border:1px solid #cbd5e1;border-radius:10px;padding:8px" placeholder="Custom FCN IDs，用逗號或換行：FCN849N 睿睿, FCN981N 睿睿">${esc(ui.custom)}</textarea><div class="ip-tools"><button id="ipRun">重新計算</button><button class="light" id="ipCopyJson">複製 JSON</button><button class="light" id="ipCopyCsv">複製 CSV</button></div><div id="ipResult">${renderKpis()}${renderTables()}<h3 style="margin-top:14px">7E. JSON Preview</h3><pre class="ip-json">${esc(JSON.stringify({template:selectedTemplate,filters:ui,config:cfg,rule:'interest rows only count active FCN; 7B/7C summarize principal movement',rows:projectionRows},null,2))}</pre></div></main></div>`;injectCss();bind()}
  function injectCss(){if(document.getElementById('ipMonthlyCardCss'))return;const st=document.createElement('style');st.id='ipMonthlyCardCss';st.textContent=`.ip-month-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:10px 0 12px}.ip-month-card{border:1px solid #e5e7eb;border-radius:16px;background:linear-gradient(135deg,#fff,#f8fafc);padding:12px;box-shadow:0 2px 8px rgba(15,23,42,.04)}.ip-month-head{display:flex;justify-content:space-between;gap:8px;align-items:center;color:#334155}.ip-month-head b{font-size:15px}.ip-month-head span{font-size:11px;font-weight:800;color:#64748b;background:#eef2ff;border-radius:999px;padding:3px 7px}.ip-month-money{display:flex;align-items:baseline;gap:6px;margin-top:8px}.ip-month-currency{font-size:11px;font-weight:700;color:#475569;letter-spacing:.2px}.ip-month-amount{font-size:16px;font-weight:650;color:#111;line-height:1.1}.ip-month-sub{font-size:12px;color:#64748b;margin-top:5px}.ip-month-bar{height:6px;background:#e2e8f0;border-radius:999px;margin-top:10px;overflow:hidden}.ip-month-bar span{display:block;height:100%;background:#111;border-radius:999px}.ip-month-detail{border:1px solid #e5e7eb;border-radius:14px;background:#fff;padding:10px;margin:8px 0 14px}.ip-month-detail summary{cursor:pointer;font-weight:850;color:#334155}.ip-table details summary{cursor:pointer;font-weight:800;color:#2563eb}.ip-nested{margin:8px 0 0}.ip-nested .ip-table{min-width:760px}@media(max-width:1100px){.ip-month-cards{grid-template-columns:repeat(2,1fr)}}@media(max-width:720px){.ip-month-cards{grid-template-columns:1fr}}`;document.head.appendChild(st)}
  function toCsv(){const head=['month','cash_in_date','coupon_date','seq','fcn_id','status','bank','basket','currency','amt','rate','interest'];return [head.join(','),...projectionRows.map(r=>head.map(k=>`"${String(r[k]??'').replace(/"/g,'""')}"`).join(','))].join('\n')}
  function bind(){document.querySelectorAll('[data-ip-template]').forEach(b=>b.addEventListener('click',()=>setTemplate(b.dataset.ipTemplate)));['ipBank','ipSingle','ipCustom','ipMonths','ipFirst','ipInterval','ipBuffer','ipNewMonth','ipNewSource','ipNewStatus'].forEach(id=>{const el=document.getElementById(id);if(!el)return;el.addEventListener('input',()=>{syncUiFromDom();setTimeout(render,0)});el.addEventListener('change',()=>{syncUiFromDom();setTimeout(render,0)});});document.getElementById('ipRun')?.addEventListener('click',()=>{syncUiFromDom();render()});document.getElementById('ipCopyJson')?.addEventListener('click',()=>navigator.clipboard?.writeText(JSON.stringify({template:selectedTemplate,filters:ui,config:cfg,rule:'interest rows only count active FCN; 7B/7C summarize principal movement',rows:projectionRows},null,2)));document.getElementById('ipCopyCsv')?.addEventListener('click',()=>navigator.clipboard?.writeText(toCsv()));document.getElementById('reloadBtn')?.addEventListener('click',()=>location.reload())}
  loadPool().then(render);
})();
