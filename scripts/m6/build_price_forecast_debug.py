# ====== M6 v8 EPS 強化版 ======

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

RUNTIME = ROOT / "data/market_runtime.json"
EPS_FILE = ROOT / "data/m1/eps_history_ai.json"
M7_FILE = ROOT / "data/m7_sandbox/m7_v2_scores.json"
OUTPUT = ROOT / "data/m6/price_forecast_debug.json"

HORIZONS = {"1d":1,"1w":5,"1m":21}

PRICE_W = {"linear":0.3,"quadratic":0.3,"log":0.4}
EPS_W   = {"linear":0.3,"quadratic":0.3,"growth":0.4}

# ====== utils ======

def f(x):
    try:
        x=float(x)
        return x if x>0 else None
    except:
        return None

def load(p):
    if not p.exists(): return {}
    return json.load(open(p,"r",encoding="utf-8"))

# ====== regression ======

def polyfit(x,y,d):
    import numpy as np
    if len(x)<d+1: return None
    c=np.polyfit(x,y,d)
    return c[::-1]

def predict(c,x):
    return sum(c[i]*(x**i) for i in range(len(c)))

def r2(y,p):
    if len(y)<2: return None
    m=sum(y)/len(y)
    ss=sum((i-m)**2 for i in y)
    if ss==0: return None
    return 1 - sum((i-j)**2 for i,j in zip(y,p))/ss

# ====== PRICE MODEL ======

def price_models(series,h):
    xs=[i[0] for i in series]
    ys=[i[1] for i in series]

    out={}

    for name,d in [("linear",1),("quadratic",2)]:
        c = polyfit(xs, ys, d)
        if c is None:
            continue
        pred=[predict(c,x) for x in xs]
        out[name]={
            "today":predict(c,0),
            "future":predict(c,h),
            "r2":r2(ys,pred)
        }

    # log
    if all(y>0 for y in ys):
        ly=[math.log(y) for y in ys]
        c=polyfit(xs,ly,1)
        if c:
            pred=[predict(c,x) for x in xs]
            out["log"]={
                "today":math.exp(predict(c,0)),
                "future":math.exp(predict(c,h)),
                "r2":r2(ly,pred)
            }

    return out

# ====== EPS MODEL ======

def eps_models(eps_list,price_today,h):
    if len(eps_list)<3:
        return {}

    years=[i[0] for i in eps_list]
    eps=[i[1] for i in eps_list]

    has_neg = any(e<=0 for e in eps)

    # PE
    ttm=eps[-1]
    pe = price_today/ttm if ttm>0 else 15

    models={}

    # linear / quadratic
    for name,d in [("linear",1),("quadratic",2)]:
        c=polyfit(years,eps,d)
        if not c: continue
        e_today=predict(c,years[-1])
        e_future=predict(c,years[-1]+1)
        models[name]={
            "today":e_today*pe,
            "future":e_future*pe
        }

    # ====== 核心：負EPS處理 ======

    if not has_neg:
        # log
        if all(e>0 for e in eps):
            le=[math.log(e) for e in eps]
            c=polyfit(years,le,1)
            if c:
                models["log"]={
                    "today":math.exp(predict(c,years[-1]))*pe,
                    "future":math.exp(predict(c,years[-1]+1))*pe
                }
    else:
        # ===== growth model =====
        g=[]
        gx=[]
        for i in range(1,len(eps)):
            prev=eps[i-1]
            cur=eps[i]
            if prev!=0:
                g.append(cur/abs(prev))
                gx.append(years[i])

        if len(g)>=2:
            c=polyfit(gx,g,1)
            if c:
                g_now=predict(c,gx[-1])
                eps_future=eps[-1]*g_now
                models["growth"]={
                    "today":price_today,
                    "future":eps_future*pe
                }

    return models

# ====== FACTOR ADJUST ======

def adjust(m,today):
    out={}
    for k,v in m.items():
        if not v.get("today") or not v.get("future"):
            continue
        factor=v["today"]/today if today else 1
        adj=v["future"]/factor if factor else None
        out[k]=adj
    return out

# ====== MAIN ======

def main():

    runtime=load(RUNTIME)
    eps=load(EPS_FILE)
    eps=eps.get("data",eps)

    rows=runtime.get("rows",runtime)

    result=[]

    for sym,row in rows.items():

        today=f(row.get("price_now"))
        if not today: continue

        # ===== price series =====
        series=[]
        mapping=[(-252,"price_ref_12m"),(-126,"price_ref_6m"),(-63,"price_ref_3m"),
                 (-21,"price_ref_1m"),(-5,"price_ref_1w"),(-1,"price_ref_1d")]

        for x,k in mapping:
            v=f(row.get(k))
            if v: series.append((x,v))

        series.append((0,today))

        if len(series)<3: continue

        # ===== EPS data =====
        eps_data=eps.get(sym,{}).get("eps_history",[])
        eps_list=[(i["fiscal_year"],i["eps"]) for i in eps_data if i.get("eps")]

        out={"symbol":sym,"today_price":today,"forecast":{}}

        for name,h in HORIZONS.items():

            pm=price_models(series,h)
            em=eps_models(eps_list,today,h)

            pm_adj=adjust(pm,today)
            em_adj=adjust(em,today)

            # weighted
            p_val=sum(pm_adj.get(k,0)*PRICE_W.get(k,0) for k in pm_adj)
            e_val=sum(em_adj.get(k,0)*EPS_W.get(k,0) for k in em_adj)

            final=0.6*p_val + 0.4*e_val if e_val else p_val

            out["forecast"][name]={
                "price_models":pm_adj,
                "eps_models":em_adj,
                "price_only":p_val,
                "eps_only":e_val,
                "final":round(final,2) if final else None
            }

        result.append(out)

    OUTPUT.parent.mkdir(exist_ok=True)
    json.dump({"data":result},open(OUTPUT,"w"),indent=2)

    print("M6 v8 done")

if __name__=="__main__":
    main()
