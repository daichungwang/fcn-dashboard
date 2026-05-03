#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
M6 Price Forecast Debug Engine v0.1

Purpose:
  Produce a large, inspectable debug output before connecting forecast results
  back into MM. This is intentionally verbose.

Output:
  data/m6/price_forecast_debug.json

Concept:
  We compare two result paths side by side:

  Result A — Direct adjusted price average
    adjusted_price_i = fair_price_i * user_adjustment_factor_i
    user_adjustment_factor_i = abs(today_price / fair_price_i)
    result_a_price = average(adjusted_price_i)

  Result B — Return-based forecast formula
    gap_i = (fair_price_i - today_price) / today_price
    confidence_weight_i = r2_i * module_weight * model_type_weight * data_quality_weight
    fair_expected_return = sum(gap_i * confidence_weight_i) / sum(confidence_weight_i)
    forecast_return_h = fair_expected_return * fair_pull_weight_h + momentum_h * momentum_weight_h + event_h * event_weight_h
    forecast_price_h = today_price * (1 + forecast_return_h)

Notes:
  - Result A is included because the user requested the six adjustment factors and six adjusted prices.
  - Result B is included as the safer baseline because it averages returns, not raw prices.
  - Missing fair prices are kept as null and clearly marked.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


ROOT = Path(__file__).resolve().parents[1]

PATH_M1_SCORES = ROOT / "data/m1/m1_scores.json"
PATH_M7_SCORES = ROOT / "data/m7_sandbox/m7_v2_scores.json"
PATH_MARKET_RUNTIME = ROOT / "data/market_runtime.json"
PATH_M6_POSITIONS = ROOT / "data/m6/positions.json"
PATH_OUT = ROOT / "data/m6/price_forecast_debug.json"


MODULE_WEIGHTS = {
    "M1": 0.40,
    "M7": 0.60,
}

MODEL_TYPE_WEIGHTS = {
    "linear": 0.80,
    "quadratic": 1.00,
    "log": 0.90,
}

QUALITY_WEIGHTS = {
    "A": 1.00,
    "B": 0.85,
    "C": 0.65,
    "D": 0.45,
}

HORIZON_WEIGHTS = {
    "1d": {
        "fair_pull_weight": 0.10,
        "momentum_weight": 0.70,
        "event_weight": 0.20,
    },
    "1w": {
        "fair_pull_weight": 0.30,
        "momentum_weight": 0.50,
        "event_weight": 0.20,
    },
    "1m": {
        "fair_pull_weight": 0.50,
        "momentum_weight": 0.30,
        "event_weight": 0.20,
    },
}

# =========================================
# DEBUG SYMBOL FILTER
# Model validation scope before connecting forecast back to MM.
# =========================================
DEBUG_MODE = True
DEBUG_SYMBOLS = {
    "NVDA", "AVGO", "TSM", "SMH", "MRVL", "MU",
    "QQQ", "TSLA", "UNH", "PLTR", "AMD",
    "NKE", "EL", "TGT", "CCL", "LQD",
    "ORCL", "GOOG", "COIN",
}


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


def n(value: Any, default: Optional[float] = None) -> Optional[float]:
    if value is None or isinstance(value, bool):
        return default
    try:
        x = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(x):
        return default
    return x


def r2(value: Any, digits: int = 4) -> Optional[float]:
    x = n(value)
    return None if x is None else round(x, digits)


def sym(value: Any) -> str:
    return str(value or "").strip().upper()


def as_list(raw: Any) -> List[Dict[str, Any]]:
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, dict)]
    if isinstance(raw, dict):
        for key in ("rows", "data", "items", "stocks", "scores", "results", "all", "positions"):
            if isinstance(raw.get(key), list):
                return [x for x in raw[key] if isinstance(x, dict)]
        out = []
        for k, v in raw.items():
            if isinstance(v, dict):
                out.append({"symbol": v.get("symbol", k), **v})
        return out
    return []


def symbol_map(raw: Any) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for row in as_list(raw):
        s = sym(row.get("symbol") or row.get("ticker") or row.get("underlying"))
        if s:
            out[s] = row
    return out


def first_num(*values: Any) -> Optional[float]:
    for v in values:
        x = n(v)
        if x is not None:
            return x
    return None


def get_price_now(symbol: str, runtime: Dict[str, Any], m7: Dict[str, Any], m1: Dict[str, Any], pos: Dict[str, Any]) -> Optional[float]:
    return first_num(
        runtime.get("price_now"),
        runtime.get("price"),
        runtime.get("last_price"),
        runtime.get("close"),
        runtime.get("current_price"),
        m7.get("price_now"),
        m7.get("regression_actual_price_now"),
        m1.get("price_now"),
        pos.get("current"),
        pos.get("current_price"),
        pos.get("price"),
    )


def normalize_return_pct(raw_value: Any) -> Optional[float]:
    """
    Return decimal, not percent point.
    """
    x = n(raw_value)
    if x is None:
        return None
    if abs(x) > 1:
        return x / 100
    return x


def price_from_fields(row: Dict[str, Any], fields: List[str]) -> Optional[float]:
    for f in fields:
        x = n(row.get(f))
        if x is not None and x > 0:
            return x
    return None


def r2_from_fields(row: Dict[str, Any], fields: List[str], fallback: Optional[float] = None) -> Optional[float]:
    for f in fields:
        x = n(row.get(f))
        if x is not None and x >= 0:
            return min(max(x, 0), 1)
    return fallback


def build_model_points(symbol: str, today: float, m1: Dict[str, Any], m7: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Collect model prices for M6 debug.

    Important price-basis governance:
      - today is runtime today price from market_runtime.
      - M7 regression model prices are generated by M7 from weekly price history.
      - m7_price_models_now.actual_price_now is the weekly-series latest price, usually last week close.
      - Therefore all forecast gap calculations use runtime today price as denominator,
        while M7 last-week actual price is kept as model_actual_price for audit.

    Formal M7 fields expected:
      m7_price_models_now.linear.fair_price_now
      m7_price_models_now.quadratic.fair_price_now
      m7_price_models_now.logarithmic.fair_price_now
    """
    score_quality = str(m1.get("score_quality") or m1.get("eps_coverage_grade") or "C").upper()
    data_quality_weight = QUALITY_WEIGHTS.get(score_quality, 0.65)

    m7_models = m7.get("m7_price_models_now") or m7.get("regression_price_models_now") or {}
    eps_price_models = ((m7.get("eps_engine") or {}).get("price_model_forecast_all") or {}).get("models") or {}

    def m7_model(name: str) -> Dict[str, Any]:
        row = m7_models.get(name, {}) if isinstance(m7_models, dict) else {}
        return row if isinstance(row, dict) else {}

    def eps_model(name: str) -> Dict[str, Any]:
        row = eps_price_models.get(name, {}) if isinstance(eps_price_models, dict) else {}
        return row if isinstance(row, dict) else {}

    def eps_price(name: str, year: str = "2026") -> Optional[float]:
        row = eps_model(name)
        prices = row.get("prices") if isinstance(row, dict) else {}
        if isinstance(prices, dict):
            return n(prices.get(year))
        return None

    def eps_r2(name: str) -> Optional[float]:
        row = eps_model(name)
        return n(row.get("r2")) if isinstance(row, dict) else None

    specs = [
        {
            "module": "M1",
            "model": "linear",
            "label": "m1-L",
            "price": first_num(
                price_from_fields(m1, ["m1_linear_fair_price", "linear_fair_price", "regression_fair_price_linear", "fair_price_linear"]),
                eps_price("linear", "2026")
            ),
            "r2": first_num(
                r2_from_fields(m1, ["m1_linear_r2", "linear_r2", "regression_r2_linear"]),
                eps_r2("linear")
            ),
            "model_actual_price": None,
            "price_basis": "M1/EPS annual price model 2026 if available",
        },
        {
            "module": "M1",
            "model": "quadratic",
            "label": "m1-Q",
            "price": first_num(
                price_from_fields(m1, ["m1_quadratic_fair_price", "quadratic_fair_price", "regression_fair_price_quadratic", "fair_price_quadratic"]),
                eps_price("quadratic", "2026")
            ),
            "r2": first_num(
                r2_from_fields(m1, ["m1_quadratic_r2", "quadratic_r2", "regression_r2_quadratic"]),
                eps_r2("quadratic")
            ),
            "model_actual_price": None,
            "price_basis": "M1/EPS annual price model 2026 if available",
        },
        {
            "module": "M1",
            "model": "log",
            "label": "m1-log",
            "price": first_num(
                price_from_fields(m1, ["m1_log_fair_price", "m1_logarithmic_fair_price", "log_fair_price", "logarithmic_fair_price", "regression_fair_price_log", "fair_price_log"]),
                eps_price("logarithmic", "2026")
            ),
            "r2": first_num(
                r2_from_fields(m1, ["m1_log_r2", "log_r2", "logarithmic_r2", "regression_r2_logarithmic"]),
                eps_r2("logarithmic")
            ),
            "model_actual_price": None,
            "price_basis": "M1/EPS annual price model 2026 if available",
        },
        {
            "module": "M7",
            "model": "linear",
            "label": "m7-L",
            "price": first_num(
                n(m7_model("linear").get("fair_price_now")),
                price_from_fields(m7, ["m7_linear_fair_price", "linear_fair_price", "regression_fair_price_linear", "fair_price_linear", "regression_linear_fair_price"])
            ),
            "r2": first_num(
                n(m7_model("linear").get("r2")),
                r2_from_fields(m7, ["structure_r2_linear", "regression_r2_linear", "linear_r2"])
            ),
            "model_actual_price": n(m7_model("linear").get("actual_price_now")),
            "price_basis": "M7 weekly regression fair price; actual_price_now is latest weekly price, not runtime today",
        },
        {
            "module": "M7",
            "model": "quadratic",
            "label": "m7-Q",
            "price": first_num(
                n(m7_model("quadratic").get("fair_price_now")),
                price_from_fields(m7, ["m7_quadratic_fair_price", "quadratic_fair_price", "regression_fair_price_quadratic", "fair_price_quadratic", "regression_quadratic_fair_price", "regression_fair_price_now", "fair_price", "fair_value"])
            ),
            "r2": first_num(
                n(m7_model("quadratic").get("r2")),
                r2_from_fields(m7, ["structure_r2_quadratic", "regression_r2_quadratic", "quadratic_r2"])
            ),
            "model_actual_price": n(m7_model("quadratic").get("actual_price_now")),
            "price_basis": "M7 weekly regression fair price; actual_price_now is latest weekly price, not runtime today",
        },
        {
            "module": "M7",
            "model": "log",
            "label": "m7-log",
            "price": first_num(
                n(m7_model("logarithmic").get("fair_price_now")),
                price_from_fields(m7, ["m7_log_fair_price", "m7_logarithmic_fair_price", "log_fair_price", "logarithmic_fair_price", "regression_fair_price_log", "fair_price_log", "regression_logarithmic_fair_price"])
            ),
            "r2": first_num(
                n(m7_model("logarithmic").get("r2")),
                r2_from_fields(m7, ["structure_r2_logarithmic", "regression_r2_logarithmic", "log_r2", "logarithmic_r2"])
            ),
            "model_actual_price": n(m7_model("logarithmic").get("actual_price_now")),
            "price_basis": "M7 weekly regression fair price; actual_price_now is latest weekly price, not runtime today",
        },
    ]

    out = []
    for spec in specs:
        price = spec["price"]
        module = spec["module"]
        model = spec["model"]
        model_type_weight = MODEL_TYPE_WEIGHTS.get(model, 1.0)
        module_weight = MODULE_WEIGHTS.get(module, 0.5)
        model_r2 = spec["r2"] if spec["r2"] is not None else 0.50

        user_adjustment_factor = None
        adjusted_price_user = None
        gap_return = None
        confidence_weight = None
        model_actual_gap_to_runtime_today = None

        if price is not None and price > 0 and today > 0:
            user_adjustment_factor = abs(today / price)
            adjusted_price_user = price * user_adjustment_factor
            gap_return = (price - today) / today
            confidence_weight = model_r2 * module_weight * model_type_weight * data_quality_weight

        model_actual = spec.get("model_actual_price")
        if model_actual is not None and model_actual > 0 and today > 0:
            model_actual_gap_to_runtime_today = (today - model_actual) / model_actual

        out.append({
            "label": spec["label"],
            "module": module,
            "model": model,
            "fair_price": r2(price, 4),
            "runtime_today_price_used_for_gap": r2(today, 4),
            "model_actual_price": r2(model_actual, 4),
            "model_actual_price_basis": spec.get("price_basis"),
            "model_actual_gap_to_runtime_today": r2(model_actual_gap_to_runtime_today, 6),
            "user_adjustment_factor_abs_today_over_model": r2(user_adjustment_factor, 6),
            "adjusted_price_user_formula": r2(adjusted_price_user, 4),
            "gap_return": r2(gap_return, 6),
            "model_r2": r2(model_r2, 4),
            "module_weight": module_weight,
            "model_type_weight": model_type_weight,
            "data_quality_weight": data_quality_weight,
            "confidence_weight": r2(confidence_weight, 6),
            "available": price is not None and price > 0,
            "missing_reason": None if price is not None and price > 0 else "missing_fair_price",
        })

    return out


def average(values: List[float]) -> Optional[float]:
    vals = [x for x in values if x is not None and math.isfinite(x)]
    if not vals:
        return None
    return sum(vals) / len(vals)


def weighted_average(pairs: List[tuple[float, float]]) -> Optional[float]:
    valid = [(v, w) for v, w in pairs if v is not None and w is not None and math.isfinite(v) and math.isfinite(w) and w > 0]
    if not valid:
        return None
    return sum(v * w for v, w in valid) / sum(w for _, w in valid)


def build_momentum(runtime: Dict[str, Any], m7: Dict[str, Any]) -> Dict[str, Any]:
    ret_1d = normalize_return_pct(first_num(runtime.get("ret_1d"), runtime.get("ret_d1"), m7.get("ret_1d")))
    ret_1w = normalize_return_pct(first_num(runtime.get("ret_1w"), m7.get("ret_1w")))
    ret_1m = normalize_return_pct(first_num(runtime.get("ret_1m"), m7.get("ret_1m")))
    ret_3m = normalize_return_pct(first_num(runtime.get("ret_3m"), m7.get("ret_3m"), runtime.get("proxy_return_3m")))

    volume_ratio = first_num(runtime.get("volume_ratio"), m7.get("volume_ratio"), 1.0)
    volume_event = 0.0
    if volume_ratio is not None:
      volume_event = max(min((volume_ratio - 1.0) * 0.02, 0.05), -0.05)

    momentum_1d = average([x for x in [ret_1d, ret_1w] if x is not None])
    momentum_1w = average([x for x in [ret_1w, ret_1m] if x is not None])
    momentum_1m = average([x for x in [ret_1m, ret_3m] if x is not None])

    return {
        "ret_1d": r2(ret_1d, 6),
        "ret_1w": r2(ret_1w, 6),
        "ret_1m": r2(ret_1m, 6),
        "ret_3m": r2(ret_3m, 6),
        "volume_ratio": r2(volume_ratio, 4),
        "event_return_proxy": r2(volume_event, 6),
        "momentum": {
            "1d": r2(momentum_1d, 6),
            "1w": r2(momentum_1w, 6),
            "1m": r2(momentum_1m, 6),
        },
    }


def build_result(symbol: str, m1: Dict[str, Any], m7: Dict[str, Any], runtime: Dict[str, Any], pos: Dict[str, Any]) -> Dict[str, Any]:
    today = get_price_now(symbol, runtime, m7, m1, pos)
    if today is None or today <= 0:
        return {
            "symbol": symbol,
            "available": False,
            "missing_reason": "missing_today_price",
        }

    models = build_model_points(symbol, today, m1, m7)
    available_models = [x for x in models if x["available"]]

    result_a_price = average([
        x["adjusted_price_user_formula"]
        for x in available_models
        if x["adjusted_price_user_formula"] is not None
    ])

    fair_expected_return = weighted_average([
        (x["gap_return"], x["confidence_weight"])
        for x in available_models
        if x["gap_return"] is not None and x["confidence_weight"] is not None
    ])

    momentum = build_momentum(runtime, m7)
    event = momentum["event_return_proxy"] or 0.0

    result_b = {}
    for horizon, weights in HORIZON_WEIGHTS.items():
        mom = momentum["momentum"].get(horizon)
        fair_part = (fair_expected_return or 0.0) * weights["fair_pull_weight"]
        mom_part = (mom or 0.0) * weights["momentum_weight"]
        event_part = event * weights["event_weight"]
        forecast_return = fair_part + mom_part + event_part
        result_b[horizon] = {
            "forecast_return": r2(forecast_return, 6),
            "forecast_price": r2(today * (1 + forecast_return), 4),
            "formula_parts": {
                "fair_part": r2(fair_part, 6),
                "momentum_part": r2(mom_part, 6),
                "event_part": r2(event_part, 6),
            },
            "weights": weights,
        }

    fair_prices = [x["fair_price"] for x in available_models if x["fair_price"] is not None]
    confidence_weights = [x["confidence_weight"] for x in available_models if x["confidence_weight"] is not None]

    return {
        "symbol": symbol,
        "available": True,
        "price_now": r2(today, 4),
        "price_now_basis": "market_runtime_today_price",
        "m7_actual_price_now": r2(first_num(m7.get("regression_actual_price_now"), (m7.get("m7_price_models_now") or {}).get("quadratic", {}).get("actual_price_now") if isinstance(m7.get("m7_price_models_now"), dict) else None), 4),
        "m7_actual_price_basis": "latest weekly price used by M7 regression, usually last week close",
        "m1_score": r2(first_num(m1.get("M1_score"), m1.get("m1_score")), 4),
        "m7_score": r2(first_num(m7.get("m7_v2_score"), m7.get("m7_score"), m7.get("score")), 4),
        "score_quality": m1.get("score_quality") or m1.get("eps_coverage_grade") or "-",
        "m1_scope": m1.get("m1_scope") or "-",
        "model_points": models,
        "result_a_direct_adjusted_price_avg": {
            "description": "average(fair_price_i * abs(today_price / fair_price_i)); included for inspection",
            "price": r2(result_a_price, 4),
            "return_vs_today": r2((result_a_price - today) / today if result_a_price is not None else None, 6),
        },
        "result_b_return_based_formula": {
            "description": "weighted average of fair-price gaps, then horizon momentum/event correction",
            "fair_expected_return": r2(fair_expected_return, 6),
            "fair_implied_price": r2(today * (1 + fair_expected_return), 4) if fair_expected_return is not None else None,
            "forecast": result_b,
        },
        "momentum_inputs": momentum,
        "debug_stats": {
            "available_model_count": len(available_models),
            "missing_model_count": 6 - len(available_models),
            "fair_price_low": r2(min(fair_prices), 4) if fair_prices else None,
            "fair_price_mid_simple": r2(average(fair_prices), 4) if fair_prices else None,
            "fair_price_high": r2(max(fair_prices), 4) if fair_prices else None,
            "confidence_weight_sum": r2(sum(confidence_weights), 6) if confidence_weights else None,
        },
        "warnings": build_warnings(today, available_models, fair_expected_return),
    }


def build_warnings(today: float, available_models: List[Dict[str, Any]], fair_expected_return: Optional[float]) -> List[str]:
    warnings = []
    if len(available_models) < 3:
        warnings.append("available_model_count_lt_3")
    if fair_expected_return is None:
        warnings.append("missing_fair_expected_return")
    for x in available_models:
        fp = x.get("fair_price")
        if fp and abs((fp - today) / today) > 0.60:
            warnings.append(f"large_gap_{x['label']}")
    return sorted(set(warnings))


def main() -> None:
    m1_raw = read_json(PATH_M1_SCORES, {"rows": []})
    m7_raw = read_json(PATH_M7_SCORES, {"rows": []})
    runtime_raw = read_json(PATH_MARKET_RUNTIME, {})
    positions_raw = read_json(PATH_M6_POSITIONS, [])

    m1_map = symbol_map(m1_raw)
    m7_map = symbol_map(m7_raw)
    runtime_map = symbol_map(runtime_raw)
    pos_map = symbol_map(positions_raw)

    all_symbols = set(m1_map) | set(m7_map) | set(runtime_map) | set(pos_map)

    if DEBUG_MODE:
        # Force-run the selected symbols during debug.
        # Do not filter them out even if some sources are missing;
        # missing data should be visible in the output.
        symbols = sorted(DEBUG_SYMBOLS)
        missing_debug_symbols = sorted(DEBUG_SYMBOLS - all_symbols)
    else:
        symbols = sorted(all_symbols)
        missing_debug_symbols = []

    rows = []
    for symbol in symbols:
        rows.append(build_result(
            symbol,
            m1_map.get(symbol, {}),
            m7_map.get(symbol, {}),
            runtime_map.get(symbol, {}),
            pos_map.get(symbol, {}),
        ))

    payload = {
        "source": "scripts/m6/build_price_forecast_debug.py",
        "version": "m6_price_forecast_debug_v0_2_limited_19",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "principle": "Limited 19-symbol debug output first; inspect two result paths before connecting to MM.",
        "result_types": {
            "A": "direct adjusted price average using six fair prices and six user adjustment factors",
            "B": "return-based weighted formula using gap return, R2/confidence weights, and horizon momentum/event correction",
        },
        "formula": {
            "result_a": "avg(fair_price_i * abs(today_price / fair_price_i))",
            "result_b_fair_return": "sum(((fair_price_i - runtime_today_price) / runtime_today_price) * confidence_weight_i) / sum(confidence_weight_i)",
            "confidence_weight_i": "r2_i * module_weight_i * model_type_weight_i * data_quality_weight_i",
            "forecast_price_h": "runtime_today_price * (1 + forecast_return_h)",
        },
        "config": {
            "debug_mode": DEBUG_MODE,
            "debug_symbols": sorted(DEBUG_SYMBOLS),
            "missing_debug_symbols": missing_debug_symbols,
            "module_weights": MODULE_WEIGHTS,
            "model_type_weights": MODEL_TYPE_WEIGHTS,
            "quality_weights": QUALITY_WEIGHTS,
            "horizon_weights": HORIZON_WEIGHTS,
        },
        "counts": {
            "all_symbols_before_filter": len(all_symbols),
            "symbols": len(symbols),
            "available": sum(1 for x in rows if x.get("available")),
            "missing_debug_symbols": len(missing_debug_symbols),
        },
        "rows": rows,
    }

    write_json(PATH_OUT, payload)

    print(f"wrote={PATH_OUT.relative_to(ROOT)}")
    print(f"symbols={len(symbols)}")
    print(f"available={payload['counts']['available']}")


if __name__ == "__main__":
    main()
