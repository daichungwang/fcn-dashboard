// ============================================================
// MM/M2 Holding Zones Legacy Cards Renderer v0.1
// Purpose: restore old M2 small-card reading style inside new /mm/m2 cockpit.
// This module is intentionally standalone so the main m2_mm_engine.js can stay stable.
// ============================================================

const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const fmt=(v,d=0)=>n(v).toLocaleString('en-US',{maximumFractionDigits:d});
const sum=list=>(list||[]).reduce((s,x)=>s+n(x.amt),0);

function pick(obj,keys,fallback='-'){
  for(const key of keys){
    const v=String(key).split('.').reduce((o,p)=>o?.[p],obj);
    if(v!==undefined&&v!==null&&v!=='')return v;
  }
  return fallback;
}
function shortDate(v){
  if(!v||v==='-')return '-';
  const s=String(v);
  return s.length>=10?s.slice(0,10):s;
}
function money(v){
  if(v===undefined||v===null||v==='')return '-';
  return `USD ${fmt(v,0)}`;
}
function price(v){
  if(v===undefined||v===null||v==='')return '-';
  return fmt(v,2);
}
function pct(v){
  if(v===undefined||v===null||v==='')return '-';
  return `${fmt(v,1)}%`;
}
function fcnType(f){
  return pick(f,['type','fcn_type','note_type','structure','product_type','productType'],'-');
}
function entryDate(f){
  return shortDate(pick(f,['entry_date','create_date','trade_date','start_date','date','created_at','issue_date'],'-'));
}
function maturityDate(f){
  return shortDate(pick(f,['maturity_date','maturity.maturity_date','end_date','expiry_date'],'-'));
}
function healthPill(health){
  if(health==='danger')return 'pill-danger';
  if(health==='watch')return 'pill-watch';
  return 'pill-healthy';
}
function decisionClass(f,zoneKey){
  if(zoneKey==='exit'||f.early_exit_ready)return 'decision-exit';
  if(f.fcn_health==='danger')return 'decision-red';
  if(f.fcn_health==='watch')return 'decision-yellow';
  return 'decision-green';
}
function cardClass(f,zoneKey){
  if(zoneKey==='exit')return 'fcn-card-exit-blue';
  if(f.fcn_health==='danger')return 'fcn-card-exit-red';
  if(f.fcn_health==='watch')return 'fcn-card-exit-green';
  return '';
}
function stockLines(f){
  const stocks=f.stocks||[];
  if(!stocks.length)return '<div class="fcn-line muted">尚無單股健康明細</div>';
  return stocks.map(s=>{
    const cls=s.stock_health==='danger'?'risk-danger':s.stock_health==='watch'?'risk-watch':'risk-safe';
    const distStrike=pick(s,['distance_to_strike_pct','dist_to_strike_pct','strike_distance_pct'],'-');
    const distKi=pick(s,['distance_to_ki_pct','dist_to_ki_pct','ki_distance_pct'],'-');
    const now=pick(s,['price_now','current_price','spot'],'-');
    const entry=pick(s,['entry_price','entry'],'-');
    const strike=pick(s,['strike_price','strike'],'-');
    const ki=pick(s,['ki_price','ki','knock_in_price'],'-');
    return `<div class="fcn-line"><b>${s.symbol||'-'}</b>｜<span class="${cls}">${s.stock_health||'-'}</span>｜Now ${price(now)}｜Entry ${price(entry)}｜Strike ${price(strike)}｜KI ${price(ki)}｜距Strike ${pct(distStrike)}｜距KI ${pct(distKi)}</div>`;
  }).join('');
}
function legacyFCNCard(f,zoneKey='normal'){
  const type=fcnType(f);
  const eDate=entryDate(f);
  const mDate=maturityDate(f);
  const basket=(f.basket||[]).join(' / ');
  const worst=f.worst_of||pick(f,['worst.symbol','worst_stock.symbol'],'-');
  const health=f.fcn_health||'-';
  const decision=f.decision_label||f.decision||'依 M2 health / maturity / early-exit 狀態持續追蹤。';
  const loss=pick(f,['unrealized_loss','loss','paper_loss','loss_amt','loss_amount'],'-');
  const interest=pick(f,['interest_received','interest','coupon_received','interest_amt'],'-');
  const net=pick(f,['net_profit','net','net_pnl','net_amt'],'-');
  const days=f.maturity?.days_to_maturity??pick(f,['days_to_maturity'],'-');
  return `<div class="fcn-card ${cardClass(f,zoneKey)}">
    <div class="fcn-head">
      <div>
        <div class="fcn-id">${f.fcn_id||'-'}</div>
        <div class="fcn-line muted">${f.tw_bank||''}｜${type}｜Entry ${eDate}｜Maturity ${mDate}</div>
      </div>
      <div><span class="pill ${healthPill(health)}">${health}</span></div>
    </div>
    <div class="fcn-line"><b>Amount</b> ${money(f.amt)}｜<b>Rate</b> ${fmt(f.rate,2)}%｜<b>Tenor</b> ${f.tenor||'-'}M｜<b>Days</b> ${days}</div>
    <div class="fcn-line"><b>Basket</b> ${basket||'-'}｜<b>Worst-of</b> ${worst}</div>
    <div class="pl-block"><b>P/L Snapshot</b><br>Loss ${loss==='-'?'-':money(loss)}｜Interest ${interest==='-'?'-':money(interest)}｜Net ${net==='-'?'-':money(net)}</div>
    <div class="decision-box ${decisionClass(f,zoneKey)}"><b>Decision</b><br>${decision}<br><span class="muted">Planner Tag: ${f.planner_tag||'-'}｜Early Exit ${f.early_exit_remark_count??0}/${f.early_exit_total_count??0}｜Ready ${f.early_exit_ready?'Y':'N'}｜Eligible ${f.early_exit_eligible?'Y':'N'}</span></div>
    <button class="expand-btn" type="button">展開 / 收合明細</button>
    <div class="detail-box">
      <div class="mini-title">Price / Risk Detail</div>
      ${stockLines(f)}
      <div class="mini-title">Raw FCN Detail</div>
      <div class="fcn-line">Bank ${f.bank||f.tw_bank||'-'}｜Currency ${f.currency||'USD'}｜Autocall ${pick(f,['autocall','autocall_pct'],'-')}｜Strike ${pick(f,['strike','strike_pct'],'-')}｜KI ${pick(f,['ki','ki_pct'],'-')}</div>
    </div>
  </div>`;
}
function zoneSummaryCard(title,rows,desc,cls){
  return `<div class="zone-card ${cls}"><div class="zone-title">${title}</div><div class="zone-meta">${desc}</div><div class="summary-value">${rows.length}</div><div class="summary-sub">USD ${fmt(sum(rows),0)}</div></div>`;
}
function legacyZonePanel(title,rows,zoneKey,empty='none'){
  return `<div class="zone-card ${zoneKey==='danger'?'zone-danger':zoneKey==='watch'?'zone-watch':zoneKey==='healthy'?'zone-healthy':'zone-maturity'}"><div class="zone-title">${title}</div><div class="zone-meta">${rows.length} 檔｜USD ${fmt(sum(rows),0)}</div>${rows.length?rows.map(f=>legacyFCNCard(f,zoneKey)).join(''):`<div class="muted">${empty}</div>`}</div>`;
}
function bindLegacyExpand(root=document){
  root.querySelectorAll('.expand-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const box=btn.closest('.fcn-card')?.querySelector('.detail-box');
      if(box)box.classList.toggle('show');
    });
  });
}

export function renderLegacyHoldingZones({runtime,groups,rightDetail,rightInsight,bottomQuery}){
  const g=groups;
  const exitRows=[...(g.ready||[]),...(g.maturity||[])];
  const candidateRows=g.candidate||[];
  const dangerRows=runtime.danger||[];
  const watchRows=runtime.watch||[];
  const healthyRows=runtime.healthy||[];
  rightDetail.innerHTML=`<div class="zone-grid">
    ${zoneSummaryCard('到期 / 提前 Ready',exitRows,'正式出場與本月現金流主來源','zone-exit-blue')}
    ${zoneSummaryCard('預計提前到期',candidateRows,'候選觀察，不等於正式 ready','zone-watch')}
    ${zoneSummaryCard('積極處理｜破下限價',dangerRows,'Danger / KI / 接股壓力','zone-danger')}
    ${zoneSummaryCard('持續追蹤',watchRows,'Watch / Strike 壓力','zone-watch')}
    ${zoneSummaryCard('健康',healthyRows,'正常續抱，預設降權','zone-healthy')}
  </div>`;
  rightInsight.innerHTML=`<div class="decision-note">Holding Zones 已改回舊 M2 小卡閱讀方式：主畫面優先看出場、Danger、Watch；Healthy 降權收合。每張卡保留 entry/type、amount/rate/tenor、worst-of、P/L snapshot、decision 與展開明細。</div>`;
  bottomQuery.innerHTML=`<div class="zone-grid">
    ${legacyZonePanel('到期 / 提前 Ready',exitRows,'exit')}
    ${legacyZonePanel('積極處理｜Danger',dangerRows,'danger')}
    ${legacyZonePanel('持續追蹤｜Watch',watchRows,'watch')}
    ${legacyZonePanel('預計提前到期｜Candidate',candidateRows,'watch')}
  </div>
  <details class="panel" style="margin-top:14px;"><summary><b>健康持倉 Healthy｜${healthyRows.length} 檔｜USD ${fmt(sum(healthyRows),0)}</b>（預設收合）</summary><div class="zone-grid" style="margin-top:12px;">${legacyZonePanel('健康｜Healthy',healthyRows,'healthy')}</div></details>`;
  bindLegacyExpand(bottomQuery);
}
