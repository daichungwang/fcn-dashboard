#!/usr/bin/env python3
from __future__ import annotations
import json
from collections import Counter
from pathlib import Path

LONG=Path('data/runtime_staging/market_runtime_long_horizon.json')
SCORES=Path('data/m7_sandbox/m7_v2_scores.json')
OUT=Path('data/m7_sandbox/m7_formula_input_audit.json')
BASE=Path('data/m7/m7_new_stock_today.json')


def miss(v):
    return v is None

def main():
    long=json.load(LONG.open())['rows'] if LONG.exists() else {}
    scores_rows={r['symbol']:r for r in json.load(SCORES.open())['rows']} if SCORES.exists() else {}
    base=json.load(BASE.open())['all']
    base_by={r.get('股號'):r for r in base}
    symbols=sorted(set(base_by)|set(long)|set(scores_rows))
    reports=[]
    c=Counter()
    full=partial=blocked=0

    # precompute compare context
    cat_mean={}
    pooled_std = None
    if scores_rows:
        vals=[r.get('m7_raw_score') for r in scores_rows.values() if r.get('m7_raw_score') is not None]
        mean=sum(vals)/len(vals) if vals else None
        var=sum((x-mean)**2 for x in vals)/max(1,len(vals)-1) if vals else None
        pooled_std=(var**0.5) if var is not None else None
        cats={r.get('category') for r in scores_rows.values()}
        for cat in cats:
            vv=[r.get('m7_raw_score') for r in scores_rows.values() if r.get('category')==cat and r.get('m7_raw_score') is not None]
            cat_mean[cat]=sum(vv)/len(vv) if vv else None
    sub_hist={}
    for sub in {r.get('category_sub') for r in scores_rows.values()}:
        vv=[r.get('historical_score') for r in scores_rows.values() if r.get('category_sub')==sub and r.get('historical_score') is not None]
        sub_hist[sub]=sum(vv)/len(vv) if vv else None

    for s in symbols:
        b=base_by.get(s,{})
        v=(b.get('估值資料') or {}) if isinstance(b,dict) else {}
        l=long.get(s,{})
        sr=scores_rows.get(s,{})
        miss_map={
            'valuation':[], 'trend':[], 'structure':[], 'timing':[], 'money':[], 'compare':[]
        }
        # valuation
        for f,val in {
            'forward_pe':v.get('ForwardPE'),
            'base_anchor':sr.get('feature_snapshot',{}).get('valuation',{}).get('base_anchor'),
            'market_multiplier':sr.get('feature_snapshot',{}).get('valuation',{}).get('market_multiplier'),
            'industry_multiplier':sr.get('feature_snapshot',{}).get('valuation',{}).get('industry_multiplier'),
            'archetype_multiplier':sr.get('feature_snapshot',{}).get('valuation',{}).get('archetype_multiplier'),
        }.items():
            if miss(val): miss_map['valuation'].append(f)
        # trend/structure
        for fac in ['trend','structure']:
            for f in ['price_now','price_ref_10y','price_ref_5y','price_ref_3y','price_ref_12m','price_ref_6m','price_ref_3m','price_ref_1m']:
                if miss(l.get(f)): miss_map[fac].append(f)
            if fac=='structure' and miss(l.get('price_ref_3m')):
                miss_map[fac].append('regression inputs')
        for f in ['ret_d1','ret_d2','ret_d3','ret_d4','ret_d5','ret_1w']:
            if miss(l.get(f)): miss_map['timing'].append(f)
        for f,val in {'volume_ratio':l.get('volume_ratio'),'price_now':l.get('price_now'),'volume':l.get('volume'),'ADV':(None if miss(l.get('price_now')) or miss(l.get('volume')) else l.get('price_now')*l.get('volume'))}.items():
            if miss(val): miss_map['money'].append(f)
        compare_fields={
            'm7_raw_score':sr.get('m7_raw_score'),
            'category_mean_adjusted':cat_mean.get(sr.get('category')),
            'pooled_std':pooled_std,
            'historical_score':sr.get('historical_score'),
            'subcategory_historical_score':sub_hist.get(sr.get('category_sub')),
            'zscore':sr.get('zscore'),
            'h_value':sr.get('h_value')
        }
        for f,val in compare_fields.items():
            if miss(val): miss_map['compare'].append(f)

        total_missing=sum(len(v) for v in miss_map.values())
        status='fully_calculable' if total_missing==0 else ('blocked' if len(miss_map['valuation'])>0 or len(miss_map['compare'])>2 else 'partial')
        if status=='fully_calculable': full+=1
        elif status=='partial': partial+=1
        else: blocked+=1
        for arr in miss_map.values():
            for m in arr: c[m]+=1
        reports.append({'symbol':s,'status':status,'missing_inputs':miss_map})

    out={'summary':{'total_symbols':len(symbols),'symbols_fully_calculable':full,'symbols_partial':partial,'symbols_blocked':blocked,'most_common_missing_fields':[{'field':k,'count':v} for k,v in c.most_common(20)]},'rows':reports}
    OUT.parent.mkdir(parents=True,exist_ok=True)
    json.dump(out,OUT.open('w'),indent=2,ensure_ascii=False)
    print('written',OUT)

if __name__=='__main__':
    main()
