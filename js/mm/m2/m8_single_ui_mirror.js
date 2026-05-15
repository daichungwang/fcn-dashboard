// ============================================================
// M8 Single UI Mirror v1.0.0
// Path: js/mm/m2/m8_single_ui_mirror.js
// Purpose: Render M2 Single FCN output with m8_batch-like cards/UI.
// ============================================================

const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const fmt=(v,d=2)=>Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{maximumFractionDigits:d}):'-';
const pct=(v,d=2)=>Number.isFinite(Number(v))?`${fmt(v,d)}%`:'-';
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function pick(obj,keys,d=null){for(const k of keys){const v=obj?.[k];if(v!==undefined&&v!==null&&v!=='')return v}return d}
function key(symbols){return [...new Set((symbols||[]).map(s=>String(s||'').trim().toUpperCase()).filter(Boolean).map(s=>s==='GOOGL'?'GOOG':s))].sort().join('+')}
function card(label,value,sub,cls='') {return `<div class="m8m-card ${cls}"><div class="m8m-label">${label}</div><div class="m8m-value">${value}</div><div class="m8m-sub">${sub||''}</div></div>`}
function meter(label,value,max=50,cls='') {const v=n(value,0),m=Math.max(0.01,n(max,50)),w=Math.max(0,Math.min(100,v/m*100));return `<div class="m8m-meter ${cls}"><span>${label}</span><div><i style="width:${w}%"></i></div><b>${fmt(v,2)}</b></div>`}
function css(){return `<style>
.m8m{display:grid;gap:12px;font-family:inherit}.m8m-top{display:grid;grid-template-columns:repeat(6,minmax(110px,1fr));gap:10px}.m8m-card{border:1px solid #e5e7eb;border-radius:14px;background:#fff;padding:14px;box-shadow:0 1px 2px rgba(15,23,42,.04)}.m8m-label{font-size:12px;color:#64748b;font-weight:800}.m8m-value{font-size:24px;font-weight:900;color:#0f172a;margin-top:6px}.m8m-sub{font-size:12px;color:#64748b;margin-top:4px}.m8m-card.good{border-left:5px solid #0f766e}.m8m-card.warn{border-left:5px solid #f97316}.m8m-card.info{border-left:5px solid #2563eb}.m8m-card.purple{border-left:5px solid #7c3aed}.m8m-note{border:1px solid #cbd5e1;background:#f8fafc;border-radius:14px;padding:10px 12px;font-size:13px;color:#334155}.m8m-template{display:grid;grid-template-columns:repeat(8,minmax(100px,1fr));gap:10px}.m8m-engines{display:grid;grid-template-columns:1fr 1fr;gap:12px}.m8m-engine{border:1px solid #e5e7eb;border-radius:16px;background:#fff;overflow:hidden}.m8m-head{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e5e7eb;background:#f8fafc;padding:12px 14px}.m8m-head h3{margin:0;font-size:16px}.m8m-pill{font-size:12px;border-radius:999px;padding:4px 9px;background:#eef2ff;color:#2563eb;font-weight:800}.m8m-body{padding:14px}.m8m-meter{display:grid;grid-template-columns:130px 1fr 58px;gap:10px;align-items:center;margin:8px 0;font-size:12px}.m8m-meter div{height:10px;background:#e5e7eb;border-radius:999px;overflow:hidden}.m8m-meter i{display:block;height:100%;background:linear-gradient(90deg,#2563eb,#10b981);border-radius:999px}.m8m-meter.bad i{background:linear-gradient(90deg,#f97316,#dc2626)}.m8m-comment{margin-top:12px;border:1px solid #e5e7eb;background:#f8fafc;border-radius:12px;padding:10px;font-size:13px;color:#334155;line-height:1.55}.m8m-cap{border:1px solid #dbeafe;background:#f8fbff;border-radius:14px;padding:10px}.m8m-table{width:100%;border-collapse:collapse;font-size:12px}.m8m-table th,.m8m-table td{padding:8px;border-bottom:1px solid #e5e7eb;text-align:left}.m8m-status-ok{color:#0f766e;font-weight:900}.m8m-status-over{color:#dc2626;font-weight:900}.m8m-raw summary{cursor:pointer;font-weight:800}.m8m-raw pre{white-space:pre-wrap;font-size:11px;max-height:320px;overflow:auto;background:#0f172a;color:#e5e7eb;border-radius:12px;padding:10px}@media(max-width:1100px){.m8m-top{grid-template-columns:repeat(2,1fr)}.m8m-template{grid-template-columns:repeat(2,1fr)}.m8m-engines{grid-template-columns:1fr}}
</style>`}

function capacityRows(input,ctx={}){const amount=n(input.amount||input.amt||0,0);const rows=ctx.stockCapacityRowsData||[];return (input.symbols||[]).map(s=>{const r=rows.find(x=>String(x.symbol).toUpperCase()===String(s).toUpperCase())||{};const current=n(r.base??r.active,0);const max=n(r.max,0);const after=current+amount;return{symbol:s,current,max,after,status:max&&after>max?'OVER':'OK'}})}

export function renderM8SingleMirrorResult(res={},input={},ctx={}){
  const mr=res.market_regression||res.m8_market_regression||{};
  const symbols=input.symbols||res.symbols||[];
  const market=n(input.coupon??res.market_yield,NaN);
  const fair=n(pick(res,['fair_yield','fair_rate','fairYield','m8_fair_rate','preference_fair','fair']),NaN);
  const final=n(pick(mr,['final_fair_rate','finalFair'],pick(res,['final_fair_rate','finalFair','final_fair','finalYield'],NaN)),NaN);
  const newFair=n(pick(mr,['new_fair_rate','global_regression_rate','clean_global_fair'],NaN),NaN);
  const gapPct=n(pick(mr,['pricing_gap_vs_final_pct','gap_after_pct'],Number.isFinite(final)&&final?((market-final)/final*100):NaN),NaN);
  const gapAbs=Number.isFinite(market)&&Number.isFinite(final)?market-final:NaN;
  const verdict=res.pricing_view||(Number.isFinite(gapPct)?(gapPct>=10?'便宜':gapPct>=2?'略便宜':gapPct<=-10?'偏貴':gapPct<=-2?'略貴':'合理'):'-');
  const beta=n(pick(mr,['overlay_beta','convergence_strength'],NaN),NaN);
  const count=pick(mr,['lookup_count','sample_count'],0);
  const conf=pick(mr,['surface_confidence','confidence'],'-');
  const maxPref=Math.max(25,n(res.pre_rate,0),n(res.fair_yield,0),n(res.base,0),n(res.basket_premium,0)+10);
  const cap=capacityRows(input,ctx);
  const templateLine=[
    card('分類模板',esc(mr.large_template||res.template_parent||'-'),''),
    card('使用模板',esc(mr.surface_matched_key||mr.small_template||res.template_used||key(symbols)||'-'),''),
    card('New Fair',pct(newFair,2),''),
    card('全域回歸估計利率',pct(pick(mr,['global_regression_rate','clean_global_fair'],newFair),2),''),
    card('β 值 / 效果',`${fmt(beta,2)} / ${fmt(pick(mr,['improvement_pct'],0),0)}%`,''),
    card('樣本 / 信心',`${count} / ${esc(conf)}`,''),
    card('Market Coupon Avg',pct(pick(mr,['history_weighted_market_rate','surface_market_coupon','market_coupon_avg'],NaN),2),''),
    card('Surface - Current',pct(Number.isFinite(n(pick(mr,['history_weighted_market_rate'],NaN),NaN))&&Number.isFinite(market)?n(pick(mr,['history_weighted_market_rate'],0),0)-market:NaN,2),'')
  ].join('');
  const capTable=cap.length?`<div class="m8m-cap"><b>M2 Basket Capacity Gate｜籃子容量檢查</b><table class="m8m-table"><thead><tr><th>Symbol</th><th>Current</th><th>After</th><th>Limit</th><th>Status</th></tr></thead><tbody>${cap.map(r=>`<tr><td><b>${esc(r.symbol)}</b></td><td>USD ${fmt(r.current,0)}</td><td>USD ${fmt(r.after,0)}</td><td>USD ${fmt(r.max,0)}</td><td class="${r.status==='OVER'?'m8m-status-over':'m8m-status-ok'}">${r.status}</td></tr>`).join('')}</tbody></table></div>`:'';
  return `${css()}<div class="m8m">
    <div class="m8m-top">
      ${card('Market',pct(market,2),'銀行報價','info')}
      ${card('M8 Fair',pct(fair,2),'你的偏好','good')}
      ${card('Final Fair',pct(final,2),'市場公平利率','purple')}
      ${card('Gap',pct(gapPct,1),'vs Final Fair','warn')}
      ${card('判定',esc(verdict),'雙引擎')}
      ${card('Calibration','Go to m8_calibration','模板校正')}
    </div>
    <div class="m8m-note">市場判定：Market ${pct(market,2)} vs Final Fair ${pct(final,2)}，Gap ${pct(gapPct,2)}（${Number.isFinite(gapAbs)?fmt(gapAbs,2)+' pts':'-'}）。</div>
    <div class="m8m-template">${templateLine}</div>
    <div class="m8m-engines">
      <div class="m8m-engine"><div class="m8m-head"><h3>B1. M8 Preference Engine｜你的偏好</h3><span class="m8m-pill">Preference</span></div><div class="m8m-body">
        ${meter('Base',res.base,maxPref)}${meter('Basket Premium',res.basket_premium,maxPref)}${meter('Structure Total',res.structure_total,maxPref)}${meter('VolAdj',res.vol_adj,maxPref)}${meter('RatePressureAdj',res.rate_pressure_adj,maxPref)}${meter('PreRate',res.pre_rate,maxPref)}${meter('HighRateBrake',res.high_rate_brake,maxPref,'bad')}${meter('Final M8 Fair',fair,maxPref)}
        <div class="m8m-comment">Market ${pct(market,2)} 高於 M8 Fair ${pct(fair,2)}；這是在你的偏好模型下的利率拆解。</div>
      </div></div>
      <div class="m8m-engine"><div class="m8m-head"><h3>B2. Market Regression Engine｜市場公平利率</h3><span class="m8m-pill">β Market</span></div><div class="m8m-body">
        ${meter('New Fair',newFair,50)}${meter('Final Fair',final,50)}${meter('β',beta,1)}${meter('Template Count',count,30)}${meter('Confidence',typeof conf==='number'?conf:0,100)}
        <div class="m8m-comment">${esc(mr.comment||'使用 market history / template surface 進行 β 校正；Current Market Yield 只做 gap 判定。')}</div>
      </div></div>
    </div>
    ${capTable}
    <details class="m8m-raw"><summary>C. Explainability｜Raw Trace / Stock Sources</summary><pre>${esc(JSON.stringify(res,null,2))}</pre></details>
  </div>`;
}
