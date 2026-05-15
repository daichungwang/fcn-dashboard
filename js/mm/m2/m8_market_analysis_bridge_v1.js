// ============================================================
// M8 Market Analysis Bridge v1
// Path: js/mm/m2/m8_market_analysis_bridge_v1.js
// Purpose: bridge M2 Market FCN Analysis to M8 batch + calibration workspace
// ============================================================
import { runM8Case } from '../../core/m8_batch_engine.js';
import { buildM8CalibrationDataset, buildCalibrationRegressionRows } from '../modules/m8_calibration_engine_v1.js';

const toNum=(v,d=null)=>Number.isFinite(Number(v))?Number(v):d;
const round2=v=>Number.isFinite(Number(v))?Math.round(Number(v)*100)/100:null;
const arr=v=>Array.isArray(v)?v:[];
const avg=xs=>{const a=arr(xs).map(Number).filter(Number.isFinite);return a.length?a.reduce((s,x)=>s+x,0)/a.length:null};
const up=v=>String(v||'').trim().toUpperCase();
export function normalizeSurfaceSymbols(symbols){
  if(!symbols)return[];
  if(typeof symbols==='string')symbols=symbols.split(/[,+|\s]+/);
  return [...new Set(arr(symbols).map(s=>up(String(s).replace(/\s+(UW|UN|US|JP|HK)$/i,''))).filter(Boolean).map(s=>s==='GOOGL'?'GOOG':s))].sort();
}
export function normalizeSurfaceKey(symbols){return normalizeSurfaceSymbols(symbols).join('+')}
export function getM8TemplateDnaRules(){return{
  C_TSLA_MOMENTUM_CORE:{any_required:['TSLA']},
  D_SPECULATIVE_MOMENTUM:{any_required:['COIN','CRDO','ALAB','SOFI','COHR','COHRN','LITE','CRDW','PLTR']},
  B_MEMORY_SEMI_TACTICAL:{any_required:['MU','SNDK']},
  E_DEFENSIVE_STABILIZER:{any_required:['LQD','AAPL','BAC','C','UNH','REGN','TGT']},
  A_AI_CORE_INSTITUTIONAL:{any_required:['NVDA','TSM','AVGO','SMH','QQQ','AMD','MRVL','ARM','AMAT']}
}}
export function normalizeTemplateId(t){t=String(t||'').trim();if(!t)return'F_OTHERS_M7_BASKET_DRIVEN';if(t==='A'||t.startsWith('A_'))return'A_AI_CORE_INSTITUTIONAL';if(t==='B'||t.startsWith('B_'))return'B_MEMORY_SEMI_TACTICAL';if(t==='C'||t.startsWith('C_'))return'C_TSLA_MOMENTUM_CORE';if(t==='D'||t.startsWith('D_'))return'D_SPECULATIVE_MOMENTUM';if(t==='E'||t.startsWith('E_'))return'E_DEFENSIVE_STABILIZER';if(t==='F'||t.startsWith('F_'))return'F_OTHERS_M7_BASKET_DRIVEN';return t}
export function passTemplateDna(symbols,templateId){const rule=getM8TemplateDnaRules()[normalizeTemplateId(templateId)];if(!rule)return true;const set=new Set(normalizeSurfaceSymbols(symbols));return !(rule.any_required||[]).length||(rule.any_required||[]).some(s=>set.has(up(s)))}
export function repairTemplateByDna(symbols,rawTemplateId){const raw=normalizeTemplateId(rawTemplateId);if(passTemplateDna(symbols,raw))return raw;const order=['C_TSLA_MOMENTUM_CORE','D_SPECULATIVE_MOMENTUM','B_MEMORY_SEMI_TACTICAL','E_DEFENSIVE_STABILIZER','A_AI_CORE_INSTITUTIONAL'];return order.find(t=>passTemplateDna(symbols,t))||'F_OTHERS_M7_BASKET_DRIVEN'}
export function detectThemeTemplate(symbols){const set=new Set(normalizeSurfaceSymbols(symbols));const hasEtf=set.has('SMH')||set.has('QQQ');const core=['TSM','NVDA','AVGO'].filter(s=>set.has(s));return hasEtf&&core.length>=1?'ETF_SEMI_CORE':null}
function pick(...xs){for(const x of xs){const n=Number(x);if(Number.isFinite(n))return n}return null}
function pctGap(market,fair){const m=Number(market),f=Number(fair);return Number.isFinite(m)&&Number.isFinite(f)&&f!==0?round2((m-f)/f*100):null}
function absGap(market,fair){const m=Number(market),f=Number(fair);return Number.isFinite(m)&&Number.isFinite(f)?round2(m-f):null}
function rowSymbols(r){return normalizeSurfaceSymbols(r?.symbols||r?.basket_symbols_key||r?.basket_display||r?.core_dna_3||r?.core_dna_2||[])}
function rowKey(r,templateId){const symbols=rowSymbols(r);const raw=r?.core_dna_3||r?.core_dna_2||r?.basket_symbols_key||r?.basket_display||'UNKNOWN';const rawSymbols=normalizeSurfaceSymbols(raw);const tpl=normalizeTemplateId(templateId);if(passTemplateDna(rawSymbols,tpl))return normalizeSurfaceKey(rawSymbols);if(symbols.length&&passTemplateDna(symbols,tpl))return normalizeSurfaceKey(symbols);return normalizeSurfaceKey(rawSymbols.length?rawSymbols:symbols)||'UNKNOWN'}
export async function runSingleMarketFcnCheck(input){
  const symbols=normalizeSurfaceSymbols(input.symbols||input.basket);
  return await runM8Case({caseName:'M2_SINGLE_MARKET_FCN',symbols,KI:toNum(input.ki),Strike:toNum(input.strike),T:toNum(input.tenor),type:input.type||input.barrier_type||'AKI',marketYield:toNum(input.coupon)});
}
export async function runBatchMarketWorkspace(options={}){
  const dataset=await buildM8CalibrationDataset({current_path:options.current_path||'./data/fcn_pool.json',old_path:options.old_path||'./data/fcn_pool_old.json',market_history_path:options.market_history_path||'./data/mm/market_fcn_history.json',max_rows:options.max_rows});
  const regRows=buildCalibrationRegressionRows(dataset);
  let regression=null;
  if(window.M8RegressionEngineV1?.runM8Regression)regression=window.M8RegressionEngineV1.runM8Regression(regRows);
  const rows=(regression?.calibrated_rows||regRows||dataset.rows||[]).filter(r=>r&&r.source_type==='market_history');
  const templateSummary=buildTemplateSummary(rows);
  return{dataset,regRows,regression,marketRows:rows,templateSummary,radar:buildUpdateRadar(rows)};
}
export function buildTemplateSummary(rows){
  const groups={};
  arr(rows).forEach(r=>{const syms=rowSymbols(r);const parent=repairTemplateByDna(syms,r.basket_template_label||r.basket_template||'F');if(!groups[parent])groups[parent]=[];groups[parent].push({...r,_symbols:syms,_parent:parent})});
  return Object.entries(groups).map(([template,rs])=>({template,count:rs.length,market:round2(avg(rs.map(r=>pick(r.market_coupon,r.market_rate)))),old_fair:round2(avg(rs.map(r=>pick(r.fair_yield,r.my_preference_rate,r.old_fair_rate)))),new_fair:round2(avg(rs.map(r=>pick(r.clean_global_fair,r.new_fair_rate)))),final_fair:round2(avg(rs.map(r=>pick(r.final_fair_rate,r.clean_global_fair,r.new_fair_rate)))),beta:round2(avg(rs.map(r=>pick(r.overlay_beta,1)))),gap_final_pct:pctGap(avg(rs.map(r=>pick(r.market_coupon,r.market_rate))),avg(rs.map(r=>pick(r.final_fair_rate,r.clean_global_fair,r.new_fair_rate)))),subtemplates:buildSubtemplateSummaryForRows(rs,template)})).sort((a,b)=>b.count-a.count)}
export function buildSubtemplateSummaryForRows(rows,template){
  const groups={};
  arr(rows).forEach(r=>{const key=rowKey(r,template);if(!groups[key])groups[key]=[];groups[key].push(r);const theme=detectThemeTemplate(rowSymbols(r));if(theme){if(!groups[theme])groups[theme]=[];groups[theme].push({...r,_group_type:'theme_template'})}});
  return Object.entries(groups).map(([key,rs])=>({key,count:rs.length,group_type:rs.some(r=>r._group_type==='theme_template')?'theme_template':'small_template',example_basket:rs[0]?.basket_display||rs[0]?.basket_symbols_key||rowSymbols(rs[0]).join('+'),market:round2(avg(rs.map(r=>pick(r.market_coupon,r.market_rate)))),old_fair:round2(avg(rs.map(r=>pick(r.fair_yield,r.my_preference_rate,r.old_fair_rate)))),new_fair:round2(avg(rs.map(r=>pick(r.clean_global_fair,r.new_fair_rate)))),final_fair:round2(avg(rs.map(r=>pick(r.final_fair_rate,r.clean_global_fair,r.new_fair_rate)))),beta:round2(avg(rs.map(r=>pick(r.overlay_beta,1)))),gap_after_pct:pctGap(avg(rs.map(r=>pick(r.market_coupon,r.market_rate))),avg(rs.map(r=>pick(r.final_fair_rate,r.clean_global_fair,r.new_fair_rate)))),included_rows:rs.map(r=>({fcn_id:r.fcn_id||r.record_id||'-',source_type:r.source_type||'-',bank:r.bank||'-',date:r.date||r.issue_date||'-',basket:r.basket_display||r.basket_symbols_key||rowSymbols(r).join('+'),market_coupon:pick(r.market_coupon,r.market_rate),new_fair:pick(r.clean_global_fair,r.new_fair_rate),final_fair:pick(r.final_fair_rate,r.clean_global_fair,r.new_fair_rate),beta:pick(r.overlay_beta,1),ki:pick(r.ki,r.ki_pct),strike:pick(r.strike,r.strike_pct),tenor:pick(r.tenor,r.tenor_month),fallback_level:r.fallback_level||'-'}))})).sort((a,b)=>b.count-a.count||Math.abs(b.gap_after_pct||0)-Math.abs(a.gap_after_pct||0))}
export function buildUpdateRadar(rows){
  const subs=[];buildTemplateSummary(rows).forEach(t=>t.subtemplates.forEach(s=>subs.push({...s,parent_template:t.template})));
  return subs.map(s=>{let coverage=s.count>=3?'candidate':s.group_type==='theme_template'?'theme':'observe';return{...s,coverage,action:coverage==='candidate'?'New Small Template Candidate':coverage==='theme'?'Theme Covered':'Observe / sample not enough',reason:coverage==='candidate'?'同一小模板在 market_history 重複出現，應列入 M8 surface 候選。':coverage==='theme'?'已進入主題模板，先觀察 theme surface。':'樣本不足，先不建模板。'}});
}
