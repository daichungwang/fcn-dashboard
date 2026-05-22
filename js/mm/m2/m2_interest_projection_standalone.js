(function(){
  if(window.__M2_INTEREST_STANDALONE__) return;
  window.__M2_INTEREST_STANDALONE__=true;

  const app=document.getElementById('interestApp');
  const runtimeMeta=document.getElementById('runtimeMeta');
  const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  const fmt=(v,d=2)=>n(v).toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  let poolRows=[];
  let selectedTemplate='all';
  let projectionRows=[];
  const cfg={firstOffset:41,interval:31,cashBuffer:3,months:12};
  const ui={bank:'',single:'',custom:''};

  function first(...vals){return vals.find(v=>v!==undefined&&v!==null&&String(v)!=='')}
  function addDays(date,days){const d=new Date(date);d.setDate(d.getDate()+days);return d}
  function ymd(d){if(!d)return'';const x=new Date(d);return Number.isNaN(x.getTime())?'':x.toISOString().slice(0,10)}
  function ym(d){const s=ymd(d);return s?s.slice(0,7):''}
  function entryDate(f){return first(f.entry_time,f.created_time,f.date,f.entry_date,f.create_date)}
  function maturityDate(f){if(f.maturity_time)return f.maturity_time;const e=new Date(entryDate(f));if(Number.isNaN(e.getTime()))return'';e.setMonth(e.getMonth()+n(f.tenor,0));return e}
  function getBasket(f){return Array.isArray(f.basket)?f.basket:String(f.basket||'').split(/[,+/\s]+/).filter(Boolean)}
  function activePosition(f){
    return String(f.status||'').trim().toLowerCase()==='active' && f.has_position!==false && f.is_portfolio!==false;
  }

  async function loadPool(){
    try{
      const res=await fetch('../../data/fcn_pool.json',{cache:'no-store'});
      const data=await res.json();
      poolRows=(Array.isArray(data)?data:(data.rows||data.data||data.fcns||[]));
      const activeCount=poolRows.filter(activePosition).length;
      runtimeMeta.textContent=`已載入 ${poolRows.length} 筆 FCN 資料｜Active ${activeCount} 筆納入利息推估｜Closed 不計息`;
    }catch(e){
      console.error(e);
      runtimeMeta.textContent='讀取 fcn_pool.json 失敗';
      poolRows=[];
    }
  }

  function syncUiFromDom(){
    const bankEl=document.getElementById('ipBank');
    const singleEl=document.getElementById('ipSingle');
    const customEl=document.getElementById('ipCustom');
    const monthsEl=document.getElementById('ipMonths');
    const firstEl=document.getElementById('ipFirst');
    const intervalEl=document.getElementById('ipInterval');
    const bufferEl=document.getElementById('ipBuffer');
    if(bankEl) ui.bank=bankEl.value||'';
    if(singleEl) ui.single=singleEl.value||'';
    if(customEl) ui.custom=customEl.value||'';
    if(monthsEl) cfg.months=n(monthsEl.value,12);
    if(firstEl) cfg.firstOffset=n(firstEl.value,41);
    if(intervalEl) cfg.interval=n(intervalEl.value,31);
    if(bufferEl) cfg.cashBuffer=n(bufferEl.value,3);
  }

  function setTemplate(next){
    syncUiFromDom();
    selectedTemplate=next;
    if(next==='all'){
      ui.bank='';
      ui.single='';
      ui.custom='';
    }
    if(next==='bank' && !ui.bank) ui.bank='富邦';
    render();
  }

  function templateRows(){
    let rows=poolRows.filter(activePosition);

    if(selectedTemplate==='bank'&&ui.bank){
      rows=rows.filter(f=>String(f.tw_bank||f.bank||'').includes(ui.bank));
    }

    if(selectedTemplate==='rayray'){
      rows=rows.filter(f=>String(f.fcn_id||'').includes('睿睿'));
    }

    if(selectedTemplate==='single'&&ui.single){
      const single=String(ui.single||'').trim().toUpperCase();
      rows=rows.filter(f=>String(f.fcn_id||'').toUpperCase().includes(single));
    }

    if(selectedTemplate==='custom'&&ui.custom){
      const ids=String(ui.custom||'').toUpperCase().split(/[\n, ]+/).map(x=>x.trim()).filter(Boolean);
      rows=rows.filter(f=>ids.some(id=>String(f.fcn_id||'').toUpperCase().includes(id)));
    }

    return rows;
  }

  function buildProjection(){
    const start=new Date();
    const end=new Date();
    end.setMonth(end.getMonth()+cfg.months);

    const rows=[];

    templateRows().forEach(f=>{
      const e=new Date(entryDate(f));
      if(Number.isNaN(e.getTime())) return;

      const mat=new Date(maturityDate(f));
      const stop=Number.isNaN(mat.getTime())?end:mat;

      let coupon=addDays(e,cfg.firstOffset);
      let seq=1;

      while(coupon<=end && coupon<=stop && seq<=48){
        const cash=addDays(coupon,cfg.cashBuffer);

        if(cash>=start){
          const interest=n(f.amt,0)*n(f.rate,0)/100/12;

          rows.push({
            month:ym(cash),
            cash_in_date:ymd(cash),
            coupon_date:ymd(coupon),
            seq,
            fcn_id:f.fcn_id||'',
            status:f.status||'',
            bank:f.tw_bank||f.bank||'',
            basket:getBasket(f).join('/'),
            currency:f.currency||'USD',
            amt:n(f.amt,0),
            rate:n(f.rate,0),
            interest
          });
        }

        coupon=addDays(coupon,cfg.interval);
        seq++;
      }
    });

    projectionRows=rows.sort((a,b)=>a.cash_in_date.localeCompare(b.cash_in_date)||a.fcn_id.localeCompare(b.fcn_id));
  }

  function monthlySummary(){
    const map={};

    projectionRows.forEach(r=>{
      const k=r.month+'|'+r.currency;
      map[k]=map[k]||{month:r.month,currency:r.currency,interest:0,count:0};
      map[k].interest+=r.interest;
      map[k].count++;
    });

    return Object.values(map).sort((a,b)=>a.month.localeCompare(b.month)||a.currency.localeCompare(b.currency));
  }

  function btn(k,label){
    return `<button class="ip-btn ${selectedTemplate===k?'active':''}" data-ip-template="${k}" type="button">${label}</button>`;
  }

  function renderKpis(){
    const fcns=templateRows();
    const totalAmt=fcns.reduce((s,f)=>s+n(f.amt),0);
    const totalInterest=projectionRows.reduce((s,r)=>s+r.interest,0);

    return `<div class="ip-grid"><div class="ip-kpi"><label>Active FCN Count</label><b>${fcns.length}</b></div><div class="ip-kpi"><label>Active Principal</label><b>USD ${fmt(totalAmt,0)}</b></div><div class="ip-kpi"><label>Projection Rows</label><b>${projectionRows.length}</b></div><div class="ip-kpi"><label>Total Interest</label><b>USD ${fmt(totalInterest,2)}</b></div></div>`;
  }

  function renderTables(){
    const mon=monthlySummary();

    if(!projectionRows.length){
      return `<div class="ip-empty">目前模板沒有可推估資料。只計算 status = active 且 has_position / is_portfolio 未被標 false 的 FCN；closed 不計息。</div>`;
    }

    return `<h3>7C. 月別總表</h3><div class="ip-table-wrap"><table class="ip-table"><thead><tr><th>Month</th><th>Currency</th><th>Count</th><th>Estimated Interest</th></tr></thead><tbody>${mon.map(r=>`<tr><td><b>${r.month}</b></td><td>${r.currency}</td><td>${r.count}</td><td>${r.currency} ${fmt(r.interest,2)}</td></tr>`).join('')}</tbody></table></div><h3>7D. FCN 明細表</h3><div class="ip-table-wrap"><table class="ip-table"><thead><tr><th>Cash-in</th><th>Coupon Date</th><th>#</th><th>FCN</th><th>Status</th><th>Bank</th><th>Basket</th><th>Amt</th><th>Rate</th><th>Interest</th></tr></thead><tbody>${projectionRows.map(r=>`<tr><td>${r.cash_in_date}</td><td>${r.coupon_date}</td><td>${r.seq}</td><td><b>${esc(r.fcn_id)}</b></td><td>${esc(r.status)}</td><td>${esc(r.bank)}</td><td>${esc(r.basket)}</td><td>${r.currency} ${fmt(r.amt,0)}</td><td>${fmt(r.rate,2)}%</td><td>${r.currency} ${fmt(r.interest,2)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function render(){
    buildProjection();
    const bankDisabled=selectedTemplate!=='bank'?'disabled':'';
    const singleDisabled=selectedTemplate!=='single'?'disabled':'';
    const customDisabled=selectedTemplate!=='custom'?'disabled':'';

    app.innerHTML=`<div class="ip-wrap"><aside class="ip-card"><div class="ip-title">7A. 快速模板</div><div class="ip-sub">按一下即可重算未來每月入帳利息。</div><div class="ip-btns">${btn('all','ALL 全部 FCN')}${btn('bank','By Bank 銀行別')}${btn('rayray','睿睿專區')}${btn('single','Single FCN')}${btn('custom','Custom 自訂')}</div><div class="ip-note">日期規則：第一次理論配息 = entry + 41 days；預估入帳 = 配息 + 3 days；之後每 31 days 一次。</div><div class="decision-note"><b>計算範圍：</b>只計算 status = active。closed / deleted / matured / inactive 一律不計息。</div></aside><main class="ip-card"><div class="ip-title">7B. FCN 利息推估</div><div class="ip-tools"><label>Bank <select id="ipBank" ${bankDisabled}><option value="">全部</option><option ${ui.bank==='富邦'?'selected':''}>富邦</option><option ${ui.bank==='永豐'?'selected':''}>永豐</option></select></label><label>Single <input id="ipSingle" ${singleDisabled} value="${esc(ui.single)}" placeholder="FCN849N"></label><label>Months <input id="ipMonths" type="number" value="${cfg.months}"></label><label>First +days <input id="ipFirst" type="number" value="${cfg.firstOffset}"></label><label>Interval <input id="ipInterval" type="number" value="${cfg.interval}"></label><label>Cash buffer <input id="ipBuffer" type="number" value="${cfg.cashBuffer}"></label></div><textarea id="ipCustom" ${customDisabled} rows="2" style="width:100%;border:1px solid #cbd5e1;border-radius:10px;padding:8px" placeholder="Custom FCN IDs，用逗號或換行：FCN849N 睿睿, FCN981N 睿睿">${esc(ui.custom)}</textarea><div class="ip-tools"><button id="ipRun">重新計算</button><button class="light" id="ipCopyJson">複製 JSON</button><button class="light" id="ipCopyCsv">複製 CSV</button></div><div id="ipResult">${renderKpis()}${renderTables()}<h3>7E. JSON Preview</h3><pre class="ip-json">${esc(JSON.stringify({template:selectedTemplate,filters:ui,config:cfg,rule:'status must equal active; closed not counted',rows:projectionRows},null,2))}</pre></div></main></div>`;

    bind();
  }

  function toCsv(){
    const head=['month','cash_in_date','coupon_date','seq','fcn_id','status','bank','basket','currency','amt','rate','interest'];
    return [head.join(','),...projectionRows.map(r=>head.map(k=>`"${String(r[k]??'').replace(/"/g,'""')}"`).join(','))].join('\n');
  }

  function bind(){
    document.querySelectorAll('[data-ip-template]').forEach(b=>b.addEventListener('click',()=>setTemplate(b.dataset.ipTemplate)));

    ['ipBank','ipSingle','ipCustom','ipMonths','ipFirst','ipInterval','ipBuffer'].forEach(id=>{
      const el=document.getElementById(id);
      if(!el) return;
      el.addEventListener('input',()=>{syncUiFromDom();setTimeout(render,0)});
      el.addEventListener('change',()=>{syncUiFromDom();setTimeout(render,0)});
    });

    document.getElementById('ipRun')?.addEventListener('click',()=>{syncUiFromDom();render()});

    document.getElementById('ipCopyJson')?.addEventListener('click',()=>{
      navigator.clipboard?.writeText(JSON.stringify({template:selectedTemplate,filters:ui,config:cfg,rule:'status must equal active; closed not counted',rows:projectionRows},null,2));
    });

    document.getElementById('ipCopyCsv')?.addEventListener('click',()=>{
      navigator.clipboard?.writeText(toCsv());
    });

    document.getElementById('reloadBtn')?.addEventListener('click',()=>location.reload());
  }

  loadPool().then(render);
})();
