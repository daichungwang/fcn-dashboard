#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
M6 Price Forecast Debug Builder v9.1 fixed
Path: scripts/m6/build_price_forecast_debug.py

Purpose:
- Runtime-only pure price M6 prediction.
- Timing A/B decision layer fixed.
- Avoid numpy array truth-value bug.
- Output: data/m6/price_forecast_debug.json

Core:
1. price regression models:
   - linear
   - quadratic
   - log

2. today-bias adjustment:
   adjusted_future_price = raw_future_price / (raw_today_price / real_today_price)

3. timing decision:
   - ret_1d = today / price_ref_1d - 1
   - ret_1w = today / price_ref_1w - 1
   - ret_1m = today / price_ref_1m - 1
   - daily normalize = [ret_1d, ret_1w/5, ret_1m/21]
   - B if short-term direction is consistent
   - A if unclear / noisy / inconsistent

4. decision -> price:
   - B-up: amplify upside by 1.05
   - B-down: amplify downside by 0.95
   - A: compress movement by 50%
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


ROOT = Path(__file__).resolve().parents[2]

RUNTIME_PATH = ROOT / "data" / "market_runtime.json"
OUTPUT_PATH = ROOT / "data" / "m6" / "price_forecast_debug.json"


HORIZONS = {
    "1d": 1,
    "1w": 5,
    "1m": 21,
}

MODEL_WEIGHTS = {
    "linear": 0.30,
    "quadratic": 0.30,
    "log": 0.40,
}

PRICE_POINTS = [
    ("price_ref_12m", -252),
    ("price_ref_6m", -126),
    ("price_ref_3m", -63),
    ("price_ref_1m", -21),
    ("price_ref_1w", -5),
    ("price_ref_1d", -1),
]

DAILY_PRICE_POINTS = [
    ("price_ref_d5", -5),
    ("price_ref_d4", -4),
    ("price_ref_d3", -3),
    ("price_ref_d2", -2),
    ("price_ref_d1", -1),
]

TODAY_PRICE_KEYS = [
    "price_now",
    "today_price",
    "price",
    "last_price",
    "last",
    "close",
    "current_price",
]


def safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        if isinstance(value, str):
            value = value.replace(",", "").replace("$", "").strip()
            if value == "" or value.lower() in {"null", "none", "nan", "na", "n/a"}:
                return None
        x = float(value)
        if not math.isfinite(x):
            return None
        return x
    except Exception:
        return None


def positive_float(value: Any) -> Optional[float]:
    x = safe_float(value)
    if x is None or x <= 0:
        return None
    return x


def round_or_none(value: Optional[float], digits: int = 2) -> Optional[float]:
    if value is None or not math.isfinite(value):
        return None
    return round(value, digits)


def pct_or_none(value: Optional[float], digits: int = 2) -> Optional[float]:
    if value is None or not math.isfinite(value):
        return None
    return round(value, digits)


def load_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def dump_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def rows_from_keyed_dict(obj: Dict[str, Any]) -> List[Dict[str, Any]]:
    skip_keys = {
        "meta",
        "metadata",
        "config",
        "summary",
        "generated_at",
        "source",
        "version",
        "symbol_count",
    }
    rows: List[Dict[str, Any]] = []
    for key, payload in obj.items():
        if str(key).lower() in skip_keys:
            continue
        if not isinstance(payload, dict):
            continue
        row = dict(payload)
        row.setdefault("symbol", key)
        rows.append(row)
    return rows


def normalize_rows(raw: Any) -> Tuple[List[Dict[str, Any]], str]:
    rows: List[Any] = []
    shape = "unknown"

    list_keys = [
        "rows",
        "data",
        "stocks",
        "items",
        "runtime",
        "prices",
        "market_runtime",
        "records",
        "symbols",
    ]

    if isinstance(raw, list):
        rows = raw
        shape = "top_level_list"
    elif isinstance(raw, dict):
        for key in list_keys:
            value = raw.get(key)
            if isinstance(value, list):
                rows = value
                shape = f"{key}_list"
                break
            if isinstance(value, dict):
                keyed_rows = rows_from_keyed_dict(value)
                if keyed_rows:
                    rows = keyed_rows
                    shape = f"{key}_dict_by_symbol"
                    break
        if not rows:
            rows = rows_from_keyed_dict(raw)
            shape = "top_level_dict_by_symbol"

    clean_rows: List[Dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        symbol = (
            row.get("symbol")
            or row.get("ticker")
            or row.get("Symbol")
            or row.get("Ticker")
        )
        symbol = str(symbol or "").strip().upper()
        if not symbol:
            continue
        if symbol in {"ROWS", "DATA", "META", "CONFIG", "SUMMARY", "GENERATED_AT", "SYMBOL_COUNT"}:
            continue
        clean = dict(row)
        clean["symbol"] = symbol
        clean_rows.append(clean)

    return clean_rows, shape


def get_today_price(row: Dict[str, Any]) -> Tuple[Optional[float], Optional[str]]:
    for key in TODAY_PRICE_KEYS:
        value = positive_float(row.get(key))
        if value is not None:
            return value, key
    return None, None


def build_price_series(row: Dict[str, Any], include_daily_refs: bool = True) -> Tuple[List[Tuple[float, float, str]], List[str], Optional[float], Optional[str]]:
    today_price, today_source = get_today_price(row)

    points = list(PRICE_POINTS)
    if include_daily_refs:
        points = DAILY_PRICE_POINTS + points

    series: List[Tuple[float, float, str]] = []
    missing_official: List[str] = []

    for key, x_day in points:
        value = positive_float(row.get(key))
        if value is None:
            if key in [k for k, _ in PRICE_POINTS]:
                missing_official.append(key)
            continue
        series.append((float(x_day), float(value), key))

    if today_price is not None:
        series.append((0.0, float(today_price), today_source or "today_price"))

    by_x: Dict[float, Tuple[float, float, str]] = {}
    for x_day, price, source in series:
        by_x[x_day] = (x_day, price, source)

    return sorted(by_x.values(), key=lambda item: item[0]), missing_official, today_price, today_source


def solve_linear_system(matrix: List[List[float]], vector: List[float]) -> Optional[List[float]]:
    n = len(vector)
    a = [row[:] + [vector[i]] for i, row in enumerate(matrix)]

    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(a[r][col]))
        if abs(a[pivot][col]) < 1e-12:
            return None

        a[col], a[pivot] = a[pivot], a[col]

        div = a[col][col]
        for j in range(col, n + 1):
            a[col][j] /= div

        for r in range(n):
            if r == col:
                continue
            factor = a[r][col]
            for j in range(col, n + 1):
                a[r][j] -= factor * a[col][j]

    return [a[i][n] for i in range(n)]


def polyfit(xs: List[float], ys: List[float], degree: int) -> Optional[List[float]]:
    if len(xs) < degree + 1:
        return None

    size = degree + 1
    matrix: List[List[float]] = []
    vector: List[float] = []

    for row_power in range(size):
        matrix_row = []
        for col_power in range(size):
            matrix_row.append(sum((x ** (row_power + col_power)) for x in xs))
        matrix.append(matrix_row)
        vector.append(sum((y * (x ** row_power)) for x, y in zip(xs, ys)))

    return solve_linear_system(matrix, vector)


def predict_poly(coeffs: List[float], x: float) -> float:
    return sum(c * (x ** i) for i, c in enumerate(coeffs))


def r2_score(ys: List[float], preds: List[float]) -> Optional[float]:
    if len(ys) != len(preds) or len(ys) < 2:
        return None

    mean_y = sum(ys) / len(ys)
    ss_tot = sum((y - mean_y) ** 2 for y in ys)
    if abs(ss_tot) < 1e-12:
        return None

    ss_res = sum((y - p) ** 2 for y, p in zip(ys, preds))
    return max(0.0, min(1.0, 1.0 - ss_res / ss_tot))


def fit_regression(series: List[Tuple[float, float, str]], model_name: str) -> Dict[str, Any]:
    xs = [x for x, _, _ in series]
    values = [p for _, p, _ in series]

    if model_name == "linear":
        ys = values
        coeffs = polyfit(xs, ys, 1)
        log_mode = False

    elif model_name == "quadratic":
        ys = values
        coeffs = polyfit(xs, ys, 2)
        log_mode = False

    elif model_name == "log":
        if any(v <= 0 for v in values):
            return {
                "status": "invalid_non_positive_value",
                "coefficients": None,
                "r2": None,
                "log_mode": True,
            }
        ys = [math.log(v) for v in values]
        coeffs = polyfit(xs, ys, 1)
        log_mode = True

    else:
        return {
            "status": f"unknown_model:{model_name}",
            "coefficients": None,
            "r2": None,
            "log_mode": False,
        }

    if coeffs is None:
        return {
            "status": "insufficient_points",
            "coefficients": None,
            "r2": None,
            "log_mode": log_mode,
        }

    preds = [predict_poly(coeffs, x) for x in xs]

    return {
        "status": "ok",
        "coefficients": coeffs,
        "r2": r2_score(ys, preds),
        "log_mode": log_mode,
    }


def predict_from_fit(fit: Dict[str, Any], x: float) -> Optional[float]:
    if fit.get("status") != "ok":
        return None

    coeffs = fit.get("coefficients")
    if coeffs is None:
        return None

    value = predict_poly(coeffs, x)

    if fit.get("log_mode"):
        try:
            value = math.exp(value)
        except OverflowError:
            return None

    if not math.isfinite(value) or value <= 0:
        return None

    return value


def build_adjusted_forecast_from_fit(fit: Dict[str, Any], today_real_price: float, horizon_x: float) -> Dict[str, Any]:
    raw_today_price = predict_from_fit(fit, 0.0)
    raw_future_price = predict_from_fit(fit, float(horizon_x))

    if raw_today_price is None or raw_future_price is None or today_real_price <= 0:
        return {
            "raw_today_price": round_or_none(raw_today_price),
            "raw_future_price": round_or_none(raw_future_price),
            "today_adjustment_factor": None,
            "adjusted_price": None,
            "adjusted_factor": None,
            "adjusted_upside_pct": None,
            "r2": round_or_none(fit.get("r2"), 4),
            "status": fit.get("status"),
        }

    today_adjustment_factor = raw_today_price / today_real_price
    adjusted_price = raw_future_price / today_adjustment_factor if today_adjustment_factor > 0 else None
    adjusted_factor = adjusted_price / today_real_price if adjusted_price and adjusted_price > 0 else None
    adjusted_upside_pct = (adjusted_factor - 1.0) * 100.0 if adjusted_factor is not None else None

    return {
        "raw_today_price": round_or_none(raw_today_price),
        "raw_future_price": round_or_none(raw_future_price),
        "today_adjustment_factor": round_or_none(today_adjustment_factor, 6),
        "adjusted_price": round_or_none(adjusted_price),
        "adjusted_factor": round_or_none(adjusted_factor, 6),
        "adjusted_upside_pct": pct_or_none(adjusted_upside_pct, 2),
        "r2": round_or_none(fit.get("r2"), 4),
        "status": fit.get("status"),
    }


def compute_timing_structure(row: Dict[str, Any], today_price: float) -> Dict[str, Any]:
    """
    Correct timing return source:
    ret_1d = today / price_ref_1d - 1
    ret_1w = today / price_ref_1w - 1
    ret_1m = today / price_ref_1m - 1

    All internal values use decimal:
    0.048 = +4.8%
    """

    def calc_ret(ref_key: str) -> float:
        ref_price = positive_float(row.get(ref_key))
        if ref_price is not None and today_price > 0:
            return today_price / ref_price - 1.0
        return 0.0

    ret_1d = calc_ret("price_ref_1d")
    ret_1w = calc_ret("price_ref_1w")
    ret_1m = calc_ret("price_ref_1m")

    normalized = [
        ret_1d / 1.0,
        ret_1w / 5.0,
        ret_1m / 21.0,
    ]

    xs = [1.0, 5.0, 21.0]
    coeffs = polyfit(xs, normalized, 1)
    slope = coeffs[1] if coeffs is not None and len(coeffs) >= 2 else 0.0

    fitted = [predict_poly(coeffs, x) for x in xs] if coeffs is not None else [0.0, 0.0, 0.0]
    slope_r2 = r2_score(normalized, fitted)

    mean_daily = sum(normalized) / len(normalized)
    variance = sum((y - mean_daily) ** 2 for y in normalized) / len(normalized)
    dispersion = math.sqrt(variance)

    max_abs = max(abs(x) for x in normalized) if normalized else 0.0
    min_abs = min(abs(x) for x in normalized) if normalized else 0.0
    consistency_ratio = min_abs / max_abs if max_abs > 0 else 0.0

    same_sign_positive = all(y > 0 for y in normalized)
    same_sign_negative = all(y < 0 for y in normalized)
    same_sign = same_sign_positive or same_sign_negative

    strength_consistent = consistency_ratio >= 0.55
    dispersion_ok = dispersion <= 0.006
    strength_ok = abs(mean_daily) >= 0.00025

    direction = "up" if mean_daily > 0 else "down" if mean_daily < 0 else "flat"

    decision_mode = "B" if same_sign and strength_consistent and dispersion_ok and strength_ok else "A"
    decision_label = f"B-{direction}" if decision_mode == "B" else "A"

    return {
        "raw_returns": {
            "ret_1d_pct": round(ret_1d * 100.0, 4),
            "ret_1w_pct": round(ret_1w * 100.0, 4),
            "ret_1m_pct": round(ret_1m * 100.0, 4),
        },
        "daily_normalized_returns": {
            "ret_1d_daily_pct": round(normalized[0] * 100.0, 4),
            "ret_1w_daily_pct": round(normalized[1] * 100.0, 4),
            "ret_1m_daily_pct": round(normalized[2] * 100.0, 4),
        },
        "slope": round(slope, 8),
        "slope_r2": round_or_none(slope_r2, 4),
        "mean_daily": round(mean_daily, 8),
        "dispersion": round(dispersion, 8),
        "consistency_ratio": round(consistency_ratio, 4),
        "same_sign": same_sign,
        "strength_consistent": strength_consistent,
        "dispersion_ok": dispersion_ok,
        "strength_ok": strength_ok,
        "direction": direction,
        "decision_mode": decision_mode,
        "decision_label": decision_label,
        "rule": "B if same_sign and consistency_ratio>=0.55 and dispersion<=0.006 and abs(mean_daily)>=0.00025; else A",
    }


def apply_decision_to_price(today_price: float, forecast_price: Optional[float], decision_mode: str, direction: str) -> Optional[float]:
    if forecast_price is None or today_price <= 0:
        return forecast_price

    factor = forecast_price / today_price

    if decision_mode == "B":
        if direction == "up":
            factor *= 1.05
        elif direction == "down":
            factor *= 0.95
    else:
        factor = 1.0 + (factor - 1.0) * 0.5

    return today_price * factor


def normalize_weights(weights: Dict[str, float], models: Dict[str, Dict[str, Any]]) -> Dict[str, float]:
    clean: Dict[str, float] = {}

    for model_name, weight in weights.items():
        model = models.get(model_name)
        if not model or model.get("status") != "ok":
            continue

        value = positive_float(model.get("adjusted_price"))
        if value is None:
            continue

        try:
            w = float(weight)
        except Exception:
            continue

        if math.isfinite(w) and w > 0:
            clean[model_name] = w

    total = sum(clean.values())
    if total <= 0:
        return {}

    return {k: v / total for k, v in clean.items()}


def build_weighted_model_price(models: Dict[str, Dict[str, Any]], configured_weights: Dict[str, float], today_price: float) -> Dict[str, Any]:
    weights_used = normalize_weights(configured_weights, models)

    weighted = None
    factor = None
    upside_pct = None

    if weights_used:
        weighted = 0.0
        for model_name, weight in weights_used.items():
            weighted += positive_float(models[model_name].get("adjusted_price")) * weight

        factor = weighted / today_price
        upside_pct = (factor - 1.0) * 100.0

    return {
        "model_weights_configured": configured_weights,
        "model_weights_used": {k: round(v, 4) for k, v in weights_used.items()},
        "weighted_price": round_or_none(weighted),
        "weighted_factor": round_or_none(factor, 6),
        "weighted_upside_pct": pct_or_none(upside_pct, 2),
    }


def build_one_forecast(row: Dict[str, Any], include_daily_refs: bool = True, verbose: bool = False) -> Dict[str, Any]:
    symbol = row["symbol"]
    name = row.get("name") or row.get("company") or row.get("company_name")

    series, missing, today_price, today_source = build_price_series(row, include_daily_refs=include_daily_refs)
    source_keys = [source for _, _, source in series]

    base: Dict[str, Any] = {
        "symbol": symbol,
        "name": name,
        "today_price": round_or_none(today_price),
        "forecast": {},
        "flat": {},
        "debug": {
            "model_scope": "M6 v9.1 fixed: pure price models + timing decision + decision adjusted price",
            "today_price_source": today_source,
            "include_daily_refs": include_daily_refs,
            "valid_price_points": len(series),
            "price_sources_used": source_keys,
            "missing_price_fields": missing,
            "series": [
                {
                    "x_day": int(x_day),
                    "price": round(price, 4),
                    "source": source,
                }
                for x_day, price, source in series
            ],
            "warnings": [],
        },
    }

    if today_price is None:
        base["debug"]["warnings"].append("today price missing")
        return base

    timing = compute_timing_structure(row, today_price)

    base["timing_structure"] = timing
    base["decision_mode"] = timing.get("decision_mode")
    base["decision_label"] = timing.get("decision_label")
    base["short_direction"] = timing.get("direction")

    if len(series) < 3:
        base["debug"]["warnings"].append("insufficient price points: need at least 3")
        return base

    fits = {
        "linear": fit_regression(series, "linear"),
        "quadratic": fit_regression(series, "quadratic"),
        "log": fit_regression(series, "log"),
    }

    base["debug"]["price_fit_summary"] = {
        model_name: {
            "status": fit.get("status"),
            "r2": round_or_none(fit.get("r2"), 4),
            "coefficients": [round(c, 8) for c in fit.get("coefficients", [])] if fit.get("coefficients") else None,
            "log_mode": fit.get("log_mode"),
        }
        for model_name, fit in fits.items()
    }

    for horizon_name, horizon_days in HORIZONS.items():
        price_models = {
            model_name: build_adjusted_forecast_from_fit(fit, today_price, horizon_days)
            for model_name, fit in fits.items()
        }

        price_weighted = build_weighted_model_price(
            price_models,
            MODEL_WEIGHTS,
            today_price,
        )

        before_price = price_weighted.get("weighted_price")
        after_price = apply_decision_to_price(
            today_price=today_price,
            forecast_price=before_price,
            decision_mode=base.get("decision_mode"),
            direction=base.get("short_direction"),
        )

        after_factor = after_price / today_price if after_price is not None and today_price > 0 else None
        after_upside_pct = (after_factor - 1.0) * 100.0 if after_factor is not None else None

        base["forecast"][horizon_name] = {
            "horizon_days": horizon_days,
            "price_models": price_models,
            "price_weighted_before_decision": price_weighted,
            "decision_adjustment": {
                "mode": base.get("decision_mode"),
                "direction": base.get("short_direction"),
                "before_price": round_or_none(before_price),
                "after_price": round_or_none(after_price),
            },
            "final": {
                "weighted_price_final": round_or_none(after_price),
                "weighted_factor_final": round_or_none(after_factor, 6),
                "weighted_upside_pct_final": pct_or_none(after_upside_pct, 2),
            },
        }

    f1d = base["forecast"].get("1d", {})
    f1w = base["forecast"].get("1w", {})
    f1m = base["forecast"].get("1m", {})

    one_month_models = f1m.get("price_models", {})

    base["m7_linear_price"] = one_month_models.get("linear", {}).get("adjusted_price")
    base["m7_quadratic_price"] = one_month_models.get("quadratic", {}).get("adjusted_price")
    base["m7_log_price"] = one_month_models.get("log", {}).get("adjusted_price")

    base["weighted_price_1d"] = f1d.get("final", {}).get("weighted_price_final")
    base["weighted_price_1w"] = f1w.get("final", {}).get("weighted_price_final")
    base["weighted_price_1m"] = f1m.get("final", {}).get("weighted_price_final")

    base["weighted_upside_pct_1d"] = f1d.get("final", {}).get("weighted_upside_pct_final")
    base["weighted_upside_pct_1w"] = f1w.get("final", {}).get("weighted_upside_pct_final")
    base["weighted_upside_pct_1m"] = f1m.get("final", {}).get("weighted_upside_pct_final")

    base["flat"] = {
        "decision_mode": base.get("decision_mode"),
        "decision_label": base.get("decision_label"),
        "short_direction": base.get("short_direction"),
        "timing_slope": base.get("timing_structure", {}).get("slope"),
        "timing_dispersion": base.get("timing_structure", {}).get("dispersion"),
        "timing_consistency_ratio": base.get("timing_structure", {}).get("consistency_ratio"),
        "price_weighted_before_decision_1d": f1d.get("price_weighted_before_decision", {}).get("weighted_price"),
        "price_weighted_before_decision_1w": f1w.get("price_weighted_before_decision", {}).get("weighted_price"),
        "price_weighted_before_decision_1m": f1m.get("price_weighted_before_decision", {}).get("weighted_price"),
        "final_weighted_1d": base["weighted_price_1d"],
        "final_weighted_1w": base["weighted_price_1w"],
        "final_weighted_1m": base["weighted_price_1m"],
    }

    if verbose:
        print(
            f"[M6 v9.1] {symbol}: today={today_price}({today_source}), "
            f"mode={base['decision_label']}, "
            f"1d={base['weighted_price_1d']}, "
            f"1w={base['weighted_price_1w']}, "
            f"1m={base['weighted_price_1m']}"
        )

    return base


def main() -> None:
    raw = load_json(RUNTIME_PATH, {})
    rows, runtime_shape = normalize_rows(raw)

    results = [
        build_one_forecast(row=row, include_daily_refs=True, verbose=False)
        for row in rows
    ]

    rows_with_forecast = sum(
        1
        for row in results
        if row.get("weighted_price_1d") is not None
        or row.get("weighted_price_1w") is not None
        or row.get("weighted_price_1m") is not None
    )

    payload = {
        "meta": {
            "engine": "M6_price_forecast_v9_1_fixed_timing_decision",
            "input_runtime": str(RUNTIME_PATH).replace("\\", "/"),
            "output": str(OUTPUT_PATH).replace("\\", "/"),
            "runtime_shape": runtime_shape,
            "rows": len(results),
            "rows_with_forecast": rows_with_forecast,
            "horizons": HORIZONS,
            "model_weights": MODEL_WEIGHTS,
            "models": ["linear", "quadratic", "log"],
            "adjustment_formula": "adjusted_future_price = raw_future_price / (raw_today_price / real_today_price)",
            "timing_return_formula": "ret_1d=today/price_ref_1d-1, ret_1w=today/price_ref_1w-1, ret_1m=today/price_ref_1m-1",
            "timing_decision_rule": "B if same_sign and consistency_ratio>=0.55 and dispersion<=0.006 and abs(mean_daily)>=0.00025; else A",
            "decision_price_rule": "B-up multiply factor by 1.05; B-down multiply factor by 0.95; A compress factor distance to today by 50%",
            "data_rule": "runtime_only_no_external_fetch_no_imputation",
        },
        "data": results,
    }

    dump_json(OUTPUT_PATH, payload)

    print(
        f"[M6 v9.1] Done. rows={len(results)}, "
        f"rows_with_forecast={rows_with_forecast}, "
        f"runtime_shape={runtime_shape}"
    )
    print(f"[M6 v9.1] Output: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
