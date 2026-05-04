import json
import math
from pathlib import Path
from typing import Dict, Any, List, Tuple

ROOT = Path(__file__).resolve().parents[2]

RUNTIME = ROOT / "data/market_runtime.json"
OUTPUT = ROOT / "data/m6/price_forecast_debug.json"

# =========================
# 基本工具
# =========================
def safe_float(x):
    try:
        return float(x)
    except:
        return None

def positive_float(x):
    v = safe_float(x)
    return v if v and v > 0 else None

# =========================
# Regression
# =========================
def polyfit(xs, ys, degree):
    import numpy as np
    if len(xs) < degree + 1:
        return None
    return np.polyfit(xs, ys, degree)[::-1]

def predict_poly(coeffs, x):
    return sum(coeffs[i] * (x ** i) for i in range(len(coeffs)))

def r2_score(y, yhat):
    if len(y) < 2:
        return None
    mean = sum(y) / len(y)
    ss_tot = sum((i - mean) ** 2 for i in y)
    ss_res = sum((i - j) ** 2 for i, j in zip(y, yhat))
    return 1 - ss_res / ss_tot if ss_tot != 0 else None

# =========================
# PRICE MODELS
# =========================
def price_models(series, horizon):
    xs = [p[0] for p in series]
    ys = [p[1] for p in series]

    out = {}

    for name, d in [("linear", 1), ("quadratic", 2)]:
        c = polyfit(xs, ys, d)
        if c is None:
            continue

        pred = [predict_poly(c, x) for x in xs]

        out[name] = {
            "today": predict_poly(c, 0),
            "future": predict_poly(c, horizon),
            "r2": r2_score(ys, pred)
        }

    # log
    if all(y > 0 for y in ys):
        ly = [math.log(y) for y in ys]
        c = polyfit(xs, ly, 1)
        if c:
            pred = [predict_poly(c, x) for x in xs]
            out["log"] = {
                "today": math.exp(predict_poly(c, 0)),
                "future": math.exp(predict_poly(c, horizon)),
                "r2": r2_score(ly, pred)
            }

    return out

# =========================
# 🔥 TIMING（完全修正）
# =========================
def compute_timing(row, today):

    def calc_ret(ref):
        ref_price = positive_float(row.get(ref))
        if ref_price and today:
            return (today / ref_price) - 1  # decimal
        return 0.0

    r1 = calc_ret("price_ref_1d")
    r5 = calc_ret("price_ref_1w")
    r21 = calc_ret("price_ref_1m")

    # daily normalize
    norm = [
        r1,
        r5 / 5,
        r21 / 21
    ]

    xs = [1, 5, 21]
    c = polyfit(xs, norm, 1)
    slope = c[1] if c else 0

    mean = sum(norm) / 3
    var = sum((x - mean) ** 2 for x in norm) / 3
    disp = math.sqrt(var)

    max_abs = max(abs(x) for x in norm)
    min_abs = min(abs(x) for x in norm)
    consistency = min_abs / max_abs if max_abs > 0 else 0

    same_sign = all(x > 0 for x in norm) or all(x < 0 for x in norm)

    direction = "up" if mean > 0 else "down"

    if same_sign and consistency >= 0.55 and disp <= 0.0006 and abs(mean) >= 0.00025:
        mode = "B"
    else:
        mode = "A"

    return {
        "normalized": norm,
        "slope": slope,
        "dispersion": disp,
        "consistency": consistency,
        "same_sign": same_sign,
        "direction": direction,
        "mode": mode
    }

# =========================
# 🔥 DECISION → PRICE
# =========================
def apply_decision(today, price, mode, direction):

    if price is None:
        return None

    factor = price / today

    if mode == "B":
        if direction == "up":
            factor *= 1.05
        else:
            factor *= 0.95
    else:
        factor = 1 + (factor - 1) * 0.5

    return today * factor

# =========================
# MAIN
# =========================
def run():

    data = json.load(open(RUNTIME))
    rows = data.get("rows", data)

    results = []

    for sym, row in rows.items():

        today = safe_float(row.get("price_now"))
        if not today:
            continue

        series = []
        mapping = [
            (-252, "price_ref_12m"),
            (-126, "price_ref_6m"),
            (-63, "price_ref_3m"),
            (-21, "price_ref_1m"),
            (-5, "price_ref_1w"),
            (-1, "price_ref_1d")
        ]

        for x, k in mapping:
            v = positive_float(row.get(k))
            if v:
                series.append((x, v, k))

        series.append((0, today, "now"))

        if len(series) < 3:
            continue

        timing = compute_timing(row, today)

        out = {
            "symbol": sym,
            "today": today,
            "decision_mode": timing["mode"],
            "direction": timing["direction"],
            "forecast": {}
        }

        for name, h in {"1d": 1, "1w": 5, "1m": 21}.items():

            pm = price_models(series, h)

            prices = [v["future"] for v in pm.values() if v.get("future")]

            if not prices:
                continue

            base_price = sum(prices) / len(prices)

            final_price = apply_decision(
                today,
                base_price,
                timing["mode"],
                timing["direction"]
            )

            out["forecast"][name] = {
                "base_price": round(base_price, 2),
                "final_price": round(final_price, 2),
                "upside_pct": round((final_price / today - 1) * 100, 2)
            }

        results.append(out)

    OUTPUT.parent.mkdir(exist_ok=True)
    json.dump({"data": results}, open(OUTPUT, "w"), indent=2)

    print("✅ M6 v9.1 DONE")

if __name__ == "__main__":
    run()
