#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import math
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

RUNTIME_PATH = ROOT / "data" / "market_runtime.json"
OUTPUT_PATH = ROOT / "data" / "m6" / "price_forecast_debug.json"

# horizons（交易日）
HORIZONS = {
    "1d": 1,
    "1w": 5,
    "1m": 21
}

PRICE_KEYS = [
    ("price_ref_12m", -252),
    ("price_ref_6m", -126),
    ("price_ref_3m", -63),
    ("price_ref_1m", -21),
    ("price_ref_1w", -5),
    ("price_ref_1d", -1),
]

DAILY_KEYS = [
    ("price_ref_d5", -5),
    ("price_ref_d4", -4),
    ("price_ref_d3", -3),
    ("price_ref_d2", -2),
    ("price_ref_d1", -1),
]

TODAY_KEYS = ["price_now", "today_price", "price"]

# ---------------- utils ----------------

def safe(x):
    try:
        v = float(x)
        return v if v > 0 else None
    except:
        return None

def get_today(row):
    for k in TODAY_KEYS:
        v = safe(row.get(k))
        if v:
            return v, k
    return None, None

def build_series(row):
    today, src = get_today(row)
    series = []

    for k, x in DAILY_KEYS + PRICE_KEYS:
        v = safe(row.get(k))
        if v:
            series.append((x, v, k))

    if today:
        series.append((0, today, src))

    # dedupe x
    d = {}
    for x, p, k in series:
        d[x] = (x, p, k)

    return sorted(d.values(), key=lambda x: x[0]), today, src

# ---------------- regression ----------------

def polyfit(xs, ys, deg):
    n = deg + 1
    if len(xs) < n:
        return None

    A = [[sum(x**(i+j) for x in xs) for j in range(n)] for i in range(n)]
    B = [sum(y*(x**i) for x,y in zip(xs,ys)) for i in range(n)]

    # solve
    for i in range(n):
        pivot = A[i][i]
        if abs(pivot) < 1e-10:
            return None
        for j in range(i, n):
            A[i][j] /= pivot
        B[i] /= pivot
        for r in range(n):
            if r != i:
                f = A[r][i]
                for c in range(i, n):
                    A[r][c] -= f*A[i][c]
                B[r] -= f*B[i]

    return B

def predict(c, x):
    return sum(c[i]*(x**i) for i in range(len(c)))

def r2(y, p):
    if len(y)<2: return None
    m = sum(y)/len(y)
    ss = sum((yi-m)**2 for yi in y)
    if ss==0: return None
    return 1 - sum((yi-pi)**2 for yi,pi in zip(y,p))/ss

def model(series, deg, horizon, log=False):
    xs = [x for x,_,_ in series]
    ys = [math.log(p) if log else p for _,p,_ in series]

    c = polyfit(xs, ys, deg)
    if not c:
        return None

    preds = [predict(c,x) for x in xs]
    r = r2(ys, preds)

    f = predict(c, horizon)
    if log:
        f = math.exp(f)

    return {
        "price": round(f,2) if f>0 else None,
        "r2": round(r,4) if r else None
    }

# ---------------- main logic ----------------

def run_one(row):
    symbol = row.get("symbol")
    series, today, src = build_series(row)

    if not today or len(series) < 3:
        return {
            "symbol": symbol,
            "today_price": today,
            "error": "insufficient data"
        }

    xs = [x for x,_,_ in series]
    ys = [p for _,p,_ in series]

    out = {
        "symbol": symbol,
        "today_price": round(today,2),
        "forecast": {}
    }

    for h_name, h_val in HORIZONS.items():
        res = {}

        lin = model(series,1,h_val)
        quad = model(series,2,h_val)
        logm = model(series,1,h_val,log=True)

        models = {
            "linear": lin,
            "quadratic": quad,
            "log": logm
        }

        # factor & pct
        for k,v in models.items():
            if not v or not v["price"]:
                continue

            price = v["price"]
            factor = price / today
            pct = (factor - 1) * 100

            res[k] = {
                "price": price,
                "factor": round(factor,4),
                "upside_pct": round(pct,2),
                "r2": v["r2"]
            }

        # best model
        best = None
        best_r2 = -1
        for k,v in res.items():
            if v["r2"] and v["r2"] > best_r2:
                best_r2 = v["r2"]
                best = k

        # expected price（加權）
        if res:
            weights = {"linear":0.3,"quadratic":0.4,"log":0.3}
            exp = sum(res[k]["price"]*weights[k] for k in res if k in weights)
            exp_factor = exp / today
            exp_pct = (exp_factor - 1) * 100
        else:
            exp = exp_factor = exp_pct = None

        out["forecast"][h_name] = {
            "models": res,
            "best_model": best,
            "expected_price": round(exp,2) if exp else None,
            "expected_factor": round(exp_factor,4) if exp_factor else None,
            "expected_upside_pct": round(exp_pct,2) if exp_pct else None
        }

    return out

# ---------------- load & run ----------------

def load_runtime():
    with open(RUNTIME_PATH, "r", encoding="utf-8") as f:
        raw = json.load(f)

    if isinstance(raw, dict) and "rows" in raw:
        rows = raw["rows"]
        if isinstance(rows, dict):
            return [dict(v, symbol=k) for k,v in rows.items()]
        return rows

    return raw

def main():
    rows = load_runtime()

    results = []
    for r in rows:
        results.append(run_one(r))

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump({
            "meta": {
                "engine": "M6_v4",
                "horizons": list(HORIZONS.keys()),
                "models": ["linear","quadratic","log"]
            },
            "data": results
        }, f, indent=2)

    print(f"[M6 v4] done → {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
