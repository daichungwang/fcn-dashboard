#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

SRC = Path('data/market_runtime.json')
OUT = Path('data/runtime_staging/market_runtime_long_horizon.json')

RET_MAP = {
    'd1':'ret_1d','d2':'ret_d2','d3':'ret_d3','d4':'ret_d4','d5':'ret_d5',
    '1w':'ret_1w','1m':'ret_1m','3m':'ret_3m','6m':'ret_6m','12m':'ret_12m','3y':'ret_3y','5y':'ret_5y','10y':'ret_10y'
}

def num(x):
    try:
        if x is None:
            return None
        v=float(x)
        if v!=v or v in (float('inf'),float('-inf')):
            return None
        return v
    except Exception:
        return None

def to_ref(price_now, ret):
    if price_now is None or ret is None or (1.0 + ret) == 0:
        return None
    return round(price_now / (1.0 + ret), 6)

def main():
    raw=json.load(SRC.open())
    out={}
    for sym,row in raw.items():
        if not isinstance(row,dict):
            continue
        price_now=num(row.get('price_now'))
        obj={'price_now':price_now}
        available=[]; missing=[]
        for k,src_ret in RET_MAP.items():
            rv=num(row.get(src_ret))
            obj[f'ret_{k}']=rv
            ref=to_ref(price_now,rv)
            obj[f'price_ref_{k}']=ref
            (available if ref is not None else missing).append(f'price_ref_{k}')
        years=10 if obj.get('price_ref_10y') is not None else 5 if obj.get('price_ref_5y') is not None else 3 if obj.get('price_ref_3y') is not None else 1 if obj.get('price_ref_12m') is not None else 0
        obj['available_price_refs']=available
        obj['missing_price_refs']=missing
        obj['coverage_pct']=round(len(available)/len(RET_MAP)*100,2)
        obj['history_available_years']=years
        obj['data_warning']='missing_long_horizon_refs' if years < 3 else None
        obj['volume']=num(row.get('volume'))
        obj['volume_ratio']=num(row.get('volume_ratio'))
        out[sym]=obj
    OUT.parent.mkdir(parents=True,exist_ok=True)
    json.dump({'generated_from':'scripts/runtime/build_market_runtime_long_horizon.py','symbol_count':len(out),'rows':out},OUT.open('w'),indent=2,ensure_ascii=False)
    print(f'written {OUT}')

if __name__=='__main__':
    main()
