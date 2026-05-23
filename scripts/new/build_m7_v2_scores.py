#!/usr/bin/env python3
"""
M7 v2 sandbox phase1 scorer.

Scope:
- per-stock scoring only (FCN / Active)
- sandbox outputs only
- safe fallback handling
- reusable engine skeleton + centralized MM params
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# -------------------------
# MM Parameter Layer
# -------------------------
scenario_params: dict[str, Any] = {
    "FCN": {
        "factor_weights": {
            "trend": 0.20,
            "structure": 0.22,
            "timing": 0.12,
            "valuation": 0.24,
            "quality": 0.12,
            "market_acceptance": 0.10,
        },
        "event_blend_weights": {
            "event_score": 0.60,
            "market_acceptance": 0.40,
        },
        "penalty_weights": {
            "exposure": 1.00,
            "overheat": 0.60,
        },
    },
    "Active": {
        "factor_weights": {
            "trend": 0.24,
            "structure": 0.16,
            "timing": 0.26,
            "valuation": 0.10,
            "quality": 0.08,
            "market_acceptance": 0.16,
        },
        "event_blend_weights": {
            "event_score": 0.70,
            "market_acceptance": 0.30,
        },
        "penalty_weights": {
            "exposure": 0.60,
            "overheat": 1.00,
        },
    },
}

regime_params: dict[str, Any] = {
    "default_regime": "neutral",
    "overlay_multipliers": {
        "neutral": {
            "trend": 1.00,
            "structure": 1.00,
            "timing": 1.00,
            "valuation": 1.00,
            "quality": 1.00,
            "market_acceptance": 1.00,
            "event_score": 1.00,
            "exposure_penalty": 1.00,
            "overheat_penalty": 1.00,
        },
        "bull": {
            "trend": 1.08,
            "structure": 1.02,
            "timing": 1.04,
            "valuation": 0.96,
            "quality": 0.98,
            "market_acceptance": 1.05,
            "event_score": 1.05,
            "exposure_penalty": 0.95,
            "overheat_penalty": 1.05,
        },
        "risk_off": {
            "trend": 0.95,
            "structure": 1.06,
            "timing": 0.92,
            "valuation": 1.04,
            "quality": 1.08,
            "market_acceptance": 0.95,
            "event_score": 0.95,
            "exposure_penalty": 1.08,
            "overheat_penalty": 1.10,
        },
        "high_vol": {
            "trend": 0.96,
            "structure": 1.08,
            "timing": 1.10,
            "valuation": 1.00,
            "quality": 1.02,
            "market_acceptance": 0.96,
            "event_score": 1.00,
            "exposure_penalty": 1.06,
            "overheat_penalty": 1.15,
        },
    },
}

module_params: dict[str, Any] = {
    "M7": {
        "scenario_order": ["FCN", "Active"],
        "score_floor": 0.0,
        "score_cap": 100.0,
    },
    "M6_placeholder": {
        "enabled": False,
        "notes": "placeholder for future execution-specific parameter set",
    },
}

curve_params: dict[str, Any] = {
    "trend_curve": {
        "type": "piecewise_linear",
        "points": [
            [-40.0, 0.0],
            [-20.0, 2.0],
            [-10.0, 4.0],
            [0.0, 6.0],
            [10.0, 8.0],
            [20.0, 9.0],
            [30.0, 10.0],
            [80.0, 10.0],
        ],
    },
    "structure_curve": {
        "type": "piecewise_linear",
        "points": [
            [-2.0, 0.0],
            [-1.0, 1.0],
            [0.0, 3.0],
            [2.0, 6.0],
            [5.0, 8.5],
            [10.0, 10.0],
            [20.0, 10.0],
        ],
    },
    "timing_curve": {
        "type": "piecewise_linear",
        "points": [
            [-12.0, 0.0],
            [-6.0, 2.0],
            [-3.0, 3.0],
            [0.0, 5.0],
            [3.0, 7.0],
            [6.0, 8.5],
            [10.0, 10.0],
            [20.0, 10.0],
        ],
    },
    "valuation_curve": {
        "pe_ratio": {
            "type": "piecewise_linear",
            "points": [
                [0.6, 10.0],
                [0.8, 8.5],
                [1.0, 6.5],
                [1.2, 4.5],
                [1.4, 3.0],
                [2.0, 1.0],
                [3.0, 0.5],
            ],
        },
        "growth": {
            "type": "piecewise_linear",
            "points": [
                [-30.0, 0.5],
                [-10.0, 2.0],
                [0.0, 3.0],
                [10.0, 5.0],
                [20.0, 7.5],
                [30.0, 9.0],
                [50.0, 10.0],
            ],
        },
        "blend_weights": {
            "pe": 0.60,
            "growth": 0.40,
        },
    },
    "quality_curve": {
        "type": "piecewise_linear",
        "points": [
            [-20.0, 1.0],
            [0.0, 3.0],
            [10.0, 5.0],
            [20.0, 7.0],
            [40.0, 9.0],
            [80.0, 10.0],
        ],
    },
    "market_acceptance_curve": {
        "volume_ratio": {
            "type": "piecewise_linear",
            "points": [
                [0.3, 1.0],
                [0.5, 3.0],
                [0.8, 6.0],
                [1.0, 8.0],
                [1.3, 9.0],
                [1.8, 10.0],
                [3.0, 10.0],
            ],
        },
        "liquidity": {
            "type": "piecewise_linear",
            "points": [
                [5.0e5, 1.0],
                [2.0e6, 3.5],
                [1.0e7, 6.5],
                [3.0e7, 8.5],
                [8.0e7, 10.0],
            ],
        },
        "size_proxy": {
            "type": "piecewise_linear",
            "points": [
                [1.0e7, 1.0],
                [5.0e7, 3.0],
                [2.0e8, 5.5],
                [8.0e8, 8.0],
                [2.0e9, 10.0],
            ],
        },
        "blend_weights": {
            "volume_ratio": 0.50,
            "liquidity": 0.30,
            "size_proxy": 0.20,
        },
    },
    "exposure_penalty_curve": {
        "ratio": {
            "type": "piecewise_linear",
            "points": [
                [0.0, 0.0],
                [10.0, 0.2],
                [20.0, 0.6],
                [30.0, 1.2],
                [40.0, 2.0],
                [50.0, 3.0],
                [70.0, 4.8],
                [90.0, 6.0],
            ],
        },
        "danger_add": 1.5,
        "watch_add": 0.5,
    },
    "overheat_penalty_curve": {
        "snapshot": {
            "type": "piecewise_linear",
            "points": [
                [4.0, 0.0],
                [6.0, 0.3],
                [8.0, 0.8],
                [10.0, 1.2],
                [14.0, 2.2],
                [20.0, 3.2],
            ],
        }
    },
}


# -------------------------
# Generic helpers / engine skeleton
# -------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


DYNAMIC_ANCHOR_CONFIG = load_json(Path("configs/mm/dynamic_anchor_regime_v1.json"))


def load_optional_json(path: Path, default: Any) -> Any:
    """Load optional JSON config. If missing or invalid, keep sandbox runnable."""
    try:
        if path.exists():
            return load_json(path)
    except Exception:
        pass
    return default


DEFAULT_M7_PARAM_CONFIG: dict[str, Any] = {
    "version": "m7_v2_parameter_config@fallback_default",
    "m7_v2_weights": {
        "valuation": 0.45,
        "trend": 0.25,
        "structure": 0.20,
        "timing": 0.0,
        "money": 0.10,
    },
    "legacy_raw_fallback": {
        "enabled": True,
        "fallback_history_weeks": 156,
        "rule": "if history_weeks < 156 then use m7_raw_score; else use m7_v2_score",
    },
    "trend": {
        "data_frequency": "weekly",
        "annualization_formula": "annualized_pct = (exp(weekly_slope * 52) - 1) * 100",
        "internal_weights": {
            "linear": 0.35,
            "ma200": 0.50,
            "acceleration": 0.15,
        },
        "periods": {
            "linear": "full_available_history",
            "ma200": "full_available_history",
            "ma_window_weeks": 40,
            "acceleration_recent_weeks": 156,
            "acceleration_compare": "recent_3y_annualized - full_history_annualized",
        },
        "linear_curve": {
            "type": "piecewise_linear",
            "input": "annualized_return_pct",
            "points": [
                [-20.0, -20.0],
                [-10.0, -10.0],
                [-5.0, -5.0],
                [0.0, 2.0],
                [5.0, 5.0],
                [10.0, 8.0],
                [15.0, 9.5],
                [20.0, 10.0],
                [40.0, 15.0],
            ],
            "cap_min": -20.0,
            "cap_max": 15.0,
        },
        "ma200_curve": {
            "type": "piecewise_linear",
            "input": "annualized_return_pct",
            "points": [
                [-20.0, -12.0],
                [-10.0, -8.0],
                [-5.0, -4.0],
                [0.0, 2.0],
                [5.0, 5.0],
                [10.0, 7.0],
                [15.0, 8.5],
                [20.0, 10.0],
                [40.0, 12.0],
            ],
            "cap_min": -12.0,
            "cap_max": 12.0,
        },
        "acceleration_curve": {
            "type": "piecewise_linear",
            "input": "recent_3y_annualized_minus_full_annualized_pct",
            "points": [
                [-30.0, -8.0],
                [-20.0, -6.0],
                [-10.0, -4.0],
                [-5.0, -2.0],
                [0.0, 0.0],
                [5.0, 2.0],
                [10.0, 4.0],
                [20.0, 5.0],
                [30.0, 6.0],
            ],
            "cap_min": -8.0,
            "cap_max": 6.0,
        },
    },
    "valuation": {
        "gap_curve": {
            "type": "piecewise_linear",
            "input": "valuation_gap",
            "points": [
                [-1.0, 10.0],
                [-0.40, 10.0],
                [-0.20, 9.0],
                [-0.05, 7.0],
                [0.05, 7.0],
                [0.20, 6.0],
                [0.40, 3.0],
                [0.80, 2.0],
            ],
            "cap_min": 2.0,
            "cap_max": 10.0,
        }
    },
}

M7_PARAM_CONFIG = load_optional_json(
    Path("configs/mm/m7_v2_parameter_config.json"),
    DEFAULT_M7_PARAM_CONFIG,
)

# -------------------------
# EPS Engine add-on input (safe optional)
# -------------------------
EPS_HISTORY_DATA = load_optional_json(Path("data/m1/eps_history_ai.json"), {})
UNIVERSE_ROWS = load_json(Path("data/m1/universe_150.json"))
UNIVERSE_BY_SYMBOL = {
    str(row.get("symbol", "")).upper(): row
    for row in (UNIVERSE_ROWS if isinstance(UNIVERSE_ROWS, list) else [])
    if isinstance(row, dict)
}

MONEY_LIQUIDITY_BENCHMARK: dict[str, float] = {
    "mean": 0.0,
    "p25": 0.0,
    "p75": 0.0,
}

CURRENT_MARKET_REGIME = "growth_bull"

FAMILY_INDUSTRY_REGIME = {
    "semi": "semi_upcycle",
    "semi_etf": "semi_upcycle",
    "software": "software_rerating",
    "platform": "software_rerating",
    "consumer": "consumer_weak",
    "industrial": "industrial_normal",
    "healthcare": "healthcare_defensive",
    "bond_proxy": "bond_supportive",
    "defensive_income": "bond_supportive",
    "travel": "travel_recovery",
}


def save_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)


def safe_num(v: Any, fallback: float = 0.0) -> float:
    try:
        n = float(v)
        if n != n or n in (float("inf"), float("-inf")):
            return fallback
        return n
    except Exception:
        return fallback


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def return_from_ref(price_now: Any, price_ref: Any) -> float | None:
    p_now = safe_num(price_now, None)
    p_ref = safe_num(price_ref, None)
    if p_now is None or p_ref is None or p_ref == 0:
        return None
    return p_now / p_ref - 1.0


def round2(v: float) -> float:
    return round(safe_num(v, 0.0), 2)


def normalize_m1_score_to_10(v: float | None) -> float:
    x = safe_num(v, None)
    if x is None:
        return 0.0
    if x > 10.0:
        return clamp(x / 10.0, 0.0, 10.0)
    return clamp(x, 0.0, 10.0)


def piecewise(points: list[list[float]], x: float) -> float:
    if not points:
        return 0.0
    pts = sorted([(safe_num(a), safe_num(b)) for a, b in points], key=lambda z: z[0])
    xv = safe_num(x)

    if xv <= pts[0][0]:
        return pts[0][1]
    if xv >= pts[-1][0]:
        return pts[-1][1]

    for i in range(1, len(pts)):
        x0, y0 = pts[i - 1]
        x1, y1 = pts[i]
        if x0 <= xv <= x1:
            if x1 == x0:
                return y1
            t = (xv - x0) / (x1 - x0)
            return y0 + t * (y1 - y0)

    return pts[-1][1]


def normalize_symbol(x: Any) -> str:
    return str(x or "").strip().upper()


def percentile(values: list[float], p: float) -> float:
    arr = sorted([safe_num(v, None) for v in values if safe_num(v, None) is not None and safe_num(v, 0.0) > 0])
    if not arr:
        return 0.0
    if len(arr) == 1:
        return arr[0]
    idx = (len(arr) - 1) * clamp(p, 0.0, 1.0)
    lo = math.floor(idx)
    hi = math.ceil(idx)
    if lo == hi:
        return arr[int(idx)]
    w = idx - lo
    return arr[lo] * (1.0 - w) + arr[hi] * w


def curve_score(curve: dict[str, Any], x: float, fallback: float = 0.0) -> float:
    if not isinstance(curve, dict):
        return fallback
    pts = curve.get("points", [])
    raw = piecewise(pts, x) if isinstance(pts, list) else fallback
    cap_min = safe_num(curve.get("cap_min"), None)
    cap_max = safe_num(curve.get("cap_max"), None)
    if cap_min is not None and cap_max is not None:
        return clamp(raw, cap_min, cap_max)
    return raw


def score_by_benchmark_linear(value: float, benchmark: dict[str, float], scores: dict[str, float], mean_band_pct: float = 0.05) -> float:
    v = safe_num(value, 0.0)
    p25 = safe_num(benchmark.get("p25"), 0.0)
    mean = safe_num(benchmark.get("mean"), 0.0)
    p75 = safe_num(benchmark.get("p75"), 0.0)
    s25 = safe_num(scores.get("p25"), 3.0)
    smean = safe_num(scores.get("mean"), 7.0)
    s75 = safe_num(scores.get("p75"), 10.0)
    if mean <= 0 or p25 <= 0 or p75 <= 0 or p75 <= p25:
        return smean
    low_band = mean * (1.0 - mean_band_pct)
    high_band = mean * (1.0 + mean_band_pct)
    if v <= p25:
        return s25
    if v >= p75:
        return s75
    if low_band <= v <= high_band:
        return smean
    if v < low_band:
        denom = max(1e-9, low_band - p25)
        return clamp(s25 + (v - p25) / denom * (smean - s25), s25, smean)
    denom = max(1e-9, p75 - high_band)
    return clamp(smean + (v - high_band) / denom * (s75 - smean), smean, s75)


@dataclass
class InputBundle:
    baseline_rows: dict[str, dict[str, Any]]
    market_runtime: dict[str, dict[str, Any]]
    pool30_rows: dict[str, dict[str, Any]]
    weekly_history: dict[str, dict[str, Any]]


# -------------------------
# Input adapter skeleton
# -------------------------
def load_inputs() -> InputBundle:
    baseline_path = Path("data/m7/m7_new_stock_today.json")
    market_path = Path("data/runtime_staging/market_runtime_long_horizon.json")
    if not market_path.exists():
        market_path = Path("data/market_runtime.json")
    pool_path = Path("data/pool30.json")
    weekly_history_path = Path("data/runtime_staging/weekly_price_history.json")

    baseline_raw = load_json(baseline_path)
    market_raw = load_json(market_path)
    pool_raw = load_json(pool_path)
    weekly_history_raw = load_json(weekly_history_path) if weekly_history_path.exists() else {}

    baseline_rows: dict[str, dict[str, Any]] = {}
    if isinstance(baseline_raw, dict):
        candidates: list[dict[str, Any]] = []
        for key in [
            "all",
            "simulation_pool",
            "watch_pool",
            "today_highlight_pool",
            "aggressive_recommend",
            "watch_list",
            "remove_list",
        ]:
            part = baseline_raw.get(key)
            if isinstance(part, list):
                candidates.extend([x for x in part if isinstance(x, dict)])
        # keep first seen ranking if duplicates
        for row in candidates:
            sym = normalize_symbol(row.get("股號") or row.get("symbol"))
            if sym and sym not in baseline_rows:
                baseline_rows[sym] = row

    market_rows: dict[str, dict[str, Any]] = {}
    market_source = market_raw.get("rows") if isinstance(market_raw, dict) and "rows" in market_raw else market_raw
    if isinstance(market_source, dict):
        for sym, row in market_source.items():
            if isinstance(row, dict):
                market_rows[normalize_symbol(sym)] = row

    pool_rows: dict[str, dict[str, Any]] = {}
    if isinstance(pool_raw, list):
        for row in pool_raw:
            if not isinstance(row, dict):
                continue
            sym = normalize_symbol(row.get("symbol"))
            if sym:
                pool_rows[sym] = row

    weekly_history_rows: dict[str, dict[str, Any]] = {}
    weekly_source = weekly_history_raw.get("rows") if isinstance(weekly_history_raw, dict) and "rows" in weekly_history_raw else weekly_history_raw
    if isinstance(weekly_source, dict):
        for sym, row in weekly_source.items():
            if isinstance(row, dict):
                weekly_history_rows[normalize_symbol(sym)] = row

    return InputBundle(
        baseline_rows=baseline_rows,
        market_runtime=market_rows,
        pool30_rows=pool_rows,
        weekly_history=weekly_history_rows,
    )


def get_nested(d: dict[str, Any], *keys: str, default: Any = None) -> Any:
    cur: Any = d
    for k in keys:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(k)
    return default if cur is None else cur


def build_feature_row(symbol: str, bundle: InputBundle) -> dict[str, Any]:
    b = bundle.baseline_rows.get(symbol, {})
    m = bundle.market_runtime.get(symbol, {})
    p = bundle.pool30_rows.get(symbol, {})
    wh = bundle.weekly_history.get(symbol, {})

    returns_base = {
        "1d": safe_num(b.get("1日漲跌幅"), None),
        "d2": None,
        "d3": None,
        "d4": None,
        "d5": None,
        "1w": safe_num(b.get("1週漲跌幅"), None),
        "1m": safe_num(b.get("1月漲跌幅"), None),
        "3m": safe_num(b.get("3月漲跌幅"), None),
        "6m": safe_num(b.get("6月漲跌幅"), None),
        "12m": safe_num(b.get("12月漲跌幅"), None),
        "3y": safe_num(b.get("3年漲跌幅"), None),
        "5y": safe_num(b.get("5年漲跌幅"), None),
        "10y": safe_num(b.get("10年漲跌幅"), None),
    }

    price_now_rt = safe_num(m.get("price_now"), safe_num(b.get("股價"), None))
    returns_market = {
        "1d": safe_num(m.get("ret_d1", m.get("ret_1d")), return_from_ref(price_now_rt, m.get("price_ref_d1"))),
        "d2": safe_num(m.get("ret_d2"), return_from_ref(price_now_rt, m.get("price_ref_d2"))),
        "d3": safe_num(m.get("ret_d3"), return_from_ref(price_now_rt, m.get("price_ref_d3"))),
        "d4": safe_num(m.get("ret_d4"), return_from_ref(price_now_rt, m.get("price_ref_d4"))),
        "d5": safe_num(m.get("ret_d5"), return_from_ref(price_now_rt, m.get("price_ref_d5"))),
        "1w": safe_num(m.get("ret_1w"), return_from_ref(price_now_rt, m.get("price_ref_1w"))),
        "1m": safe_num(m.get("ret_1m"), return_from_ref(price_now_rt, m.get("price_ref_1m"))),
        "3m": safe_num(m.get("ret_3m"), return_from_ref(price_now_rt, m.get("price_ref_3m"))),
        "6m": safe_num(m.get("ret_6m"), return_from_ref(price_now_rt, m.get("price_ref_6m"))),
        "12m": safe_num(m.get("ret_12m"), return_from_ref(price_now_rt, m.get("price_ref_12m"))),
        "3y": safe_num(m.get("ret_3y"), return_from_ref(price_now_rt, m.get("price_ref_3y"))),
        "5y": safe_num(m.get("ret_5y"), return_from_ref(price_now_rt, m.get("price_ref_5y"))),
        "10y": safe_num(m.get("ret_10y"), return_from_ref(price_now_rt, m.get("price_ref_10y"))),
    }

    rets = {}
    for k in ["1d", "d2", "d3", "d4", "d5", "1w", "1m", "3m", "6m", "12m", "3y", "5y", "10y"]:
        val = returns_base[k]
        if val is None:
            val = returns_market[k]
        rets[k] = safe_num(val, 0.0 if k in {"1d", "1w", "1m", "3m", "6m", "12m"} else None)

    swing_days = b.get("結構資料", {}).get("swing_days")
    if not isinstance(swing_days, list):
        swing_days = m.get("swing_days")
    if not isinstance(swing_days, list):
        swing_days = []
    swing_days = [safe_num(x, 0.0) for x in swing_days[:6]]
    while len(swing_days) < 6:
        swing_days.append(0.0)

    valuation_data = b.get("估值資料", {}) if isinstance(b.get("估值資料"), dict) else {}
    universe_row = UNIVERSE_BY_SYMBOL.get(symbol, {})

    forward_pe = safe_num(valuation_data.get("ForwardPE"), None)
    anchor_pe = safe_num(valuation_data.get("AnchorPE"), None)
    peg = safe_num(valuation_data.get("PEG"), None)
    eps_growth = safe_num(valuation_data.get("EPS成長率"), None)
    category_sub = (
        universe_row.get("category_sub")
        or b.get("子產業")
        or p.get("subsector")
        or ""
    )
    base_anchor = safe_num(
        universe_row.get("Anchor"),
        safe_num(DYNAMIC_ANCHOR_CONFIG.get("base_anchor_by_category_sub", {}).get(category_sub), anchor_pe or 0.0),
    )
    family = DYNAMIC_ANCHOR_CONFIG.get("category_family_map", {}).get(category_sub, "unknown")
    industry_regime = FAMILY_INDUSTRY_REGIME.get(family, "software_normal")
    market_multiplier = safe_num(
        DYNAMIC_ANCHOR_CONFIG.get("market_regimes", {})
        .get(CURRENT_MARKET_REGIME, {})
        .get("multiplier"),
        1.0,
    )
    industry_cfg = DYNAMIC_ANCHOR_CONFIG.get("industry_regimes", {}).get(industry_regime, {})
    industry_multiplier = safe_num(
        industry_cfg.get("family_multipliers", {}).get(family),
        safe_num(industry_cfg.get("default_multiplier"), 1.0),
    )
    archetype = DYNAMIC_ANCHOR_CONFIG.get("symbol_archetype_overrides", {}).get(symbol) or DYNAMIC_ANCHOR_CONFIG.get(
        "default_archetype_by_category_sub", {}
    ).get(category_sub, "BASELINE")
    archetype_multiplier = safe_num(
        DYNAMIC_ANCHOR_CONFIG.get("valuation_archetypes", {})
        .get(archetype, {})
        .get("multiplier"),
        1.0,
    )

    quality_momentum = safe_num(valuation_data.get("QualityMomentum"), None)

    volume_ratio = safe_num(b.get("量比"), None)
    if volume_ratio is None:
        volume_ratio = safe_num(m.get("volume_ratio"), 1.0)

    volume = safe_num(m.get("volume"), 0.0)
    price_now = safe_num(m.get("price_now"), safe_num(b.get("股價"), 0.0))
    avg_volume = safe_num(
        m.get("avg_volume", m.get("average_volume", m.get("averageVolume", m.get("averageVolume3M")))),
        None,
    )
    if avg_volume is None or avg_volume <= 0:
        avg_volume = volume / max(volume_ratio, 1e-9) if volume > 0 and volume_ratio > 0 else 0.0
    today_dollar_volume = max(price_now, 0.0) * max(volume, 0.0)
    avg_dollar_volume = max(price_now, 0.0) * max(avg_volume, 0.0)
    size_proxy = today_dollar_volume

    exposure = b.get("持倉曝險", {}) if isinstance(b.get("持倉曝險"), dict) else {}
    exposure_ratio = safe_num(exposure.get("投入資金比"), 0.0)
    exposure_danger = safe_num(exposure.get("Danger"), 0.0)
    exposure_watch = safe_num(exposure.get("Watch"), 0.0)

    baseline_score = safe_num(b.get("today_score"), None)
    baseline_components = b.get("分數拆解", {}) if isinstance(b.get("分數拆解"), dict) else {}

    # event score placeholder: baseline quality score proxy (safe fallback)
    event_score = safe_num(exposure.get("Event平均"), 0.0)

    weekly_prices_src = m.get("weekly_prices")
    if not isinstance(weekly_prices_src, list) or len(weekly_prices_src) == 0:
        weekly_prices_src = wh.get("weekly_prices")

    weekly_returns_src = m.get("weekly_returns")
    if not isinstance(weekly_returns_src, list) or len(weekly_returns_src) == 0:
        weekly_returns_src = wh.get("weekly_returns")

    history_weeks_src = m.get("history_weeks")
    if not history_weeks_src:
        history_weeks_src = wh.get("history_weeks")

    history_horizon_used_src = m.get("history_horizon_used")
    if not history_horizon_used_src:
        history_horizon_used_src = wh.get("history_horizon_used")

    return {
        "symbol": symbol,
        "name": b.get("股名") or p.get("name") or p.get("名稱") or symbol,
        "category": b.get("分類") or p.get("category") or "unknown",
        "is_pool30": bool(p),
        "sector": b.get("產業") or p.get("sector") or "",
        "subsector": b.get("子產業") or p.get("subsector") or "",
        "returns": rets,
        "weekly_prices": [safe_num(x, None) for x in weekly_prices_src] if isinstance(weekly_prices_src, list) else [],
        "weekly_returns": [safe_num(x, None) for x in weekly_returns_src] if isinstance(weekly_returns_src, list) else [],
        "history_weeks": int(safe_num(history_weeks_src, 0) or 0),
        "history_horizon_used": history_horizon_used_src,
        "swing_days": swing_days,
        "valuation": {
            "forward_pe": forward_pe,
            "anchor_pe": anchor_pe,
            "base_anchor": base_anchor,
            "category_sub": category_sub,
            "market_regime": CURRENT_MARKET_REGIME,
            "market_multiplier": market_multiplier,
            "industry_regime": industry_regime,
            "industry_multiplier": industry_multiplier,
            "valuation_archetype": archetype,
            "archetype_multiplier": archetype_multiplier,
            "peg": peg,
            "eps_growth": eps_growth,
        },
        "quality_momentum": quality_momentum,
        "market_acceptance": {
            "volume_ratio": volume_ratio,
            "volume": volume,
            "avg_volume": avg_volume,
            "today_dollar_volume": today_dollar_volume,
            "avg_dollar_volume": avg_dollar_volume,
            "liquidity_proxy": avg_dollar_volume,
            "size_proxy": size_proxy,
            "coverage_pct": safe_num(m.get("coverage_pct"), None),
            "data_warning": m.get("data_warning"),
            "missing_price_refs": m.get("missing_price_refs") if isinstance(m.get("missing_price_refs"), list) else [],
        },
        "runtime_fundamentals": {
            "trailing_eps": safe_num(m.get("trailing_eps"), None),
            "forward_eps": safe_num(m.get("forward_eps"), None),
            "trailing_pe": safe_num(m.get("trailing_pe"), None),
            "forward_pe": safe_num(m.get("forward_pe"), None),
            "earnings_growth": safe_num(m.get("earnings_growth"), None),
            "revenue_growth": safe_num(m.get("revenue_growth"), None),
            "market_cap": safe_num(m.get("market_cap"), None),
            "enterprise_value": safe_num(m.get("enterprise_value"), None),
            "beta": safe_num(m.get("beta"), None),
            "sector": m.get("sector"),
            "industry": m.get("industry"),
            "quote_type": m.get("quote_type"),
            "dividend_yield": safe_num(m.get("dividend_yield"), None),
            "payout_ratio": safe_num(m.get("payout_ratio"), None),
            "profit_margins": safe_num(m.get("profit_margins"), None),
            "gross_margins": safe_num(m.get("gross_margins"), None),
            "operating_margins": safe_num(m.get("operating_margins"), None),
            "return_on_equity": safe_num(m.get("return_on_equity"), None),
            "debt_to_equity": safe_num(m.get("debt_to_equity"), None),
            "free_cashflow": safe_num(m.get("free_cashflow"), None),
            "operating_cashflow": safe_num(m.get("operating_cashflow"), None),
            "fundamental_source": m.get("fundamental_source"),
            "fundamental_note": m.get("fundamental_note"),
        },
        "exposure": {
            "ratio": exposure_ratio,
            "danger": exposure_danger,
            "watch": exposure_watch,
        },
        "event_score": event_score,
        "baseline": {
            "today_score": baseline_score,
            "action": b.get("建議動作"),
            "components": {
                "trend": safe_num(baseline_components.get("趨勢分"), 0.0),
                "structure": safe_num(baseline_components.get("結構分"), 0.0),
                "timing": safe_num(baseline_components.get("時機分"), 0.0),
                "valuation": safe_num(baseline_components.get("估值分"), 0.0),
                "quality": safe_num(baseline_components.get("品質分"), 0.0),
            },
        },
    }


# -------------------------
# Skeleton factor computations
# -------------------------
def compute_trend(feature: dict[str, Any]) -> dict[str, Any]:
    """
    Trend v4 MM-config driven.

    Definition:
      Trend = linear long-term direction + MA200 confirmation + acceleration.

    Data:
      - weekly_prices from runtime staging.
      - linear and MA use full available history.
      - acceleration uses recent 3Y annualized slope minus full-history annualized slope.

    Annualization:
      annualized_pct = (exp(weekly_slope * 52) - 1) * 100

    Default MM weights:
      0.35 * linear + 0.50 * ma200 + 0.15 * acceleration

    Governance:
      If history_weeks < fallback_history_weeks (default 156), dashboard/consumer should treat
      m7_raw_score as fallback main score, because long-horizon regression signals are not reliable.
    """

    trend_cfg = M7_PARAM_CONFIG.get("trend", {}) if isinstance(M7_PARAM_CONFIG, dict) else {}
    internal_weights = trend_cfg.get("internal_weights", {}) if isinstance(trend_cfg, dict) else {}
    periods = trend_cfg.get("periods", {}) if isinstance(trend_cfg, dict) else {}
    fallback_cfg = M7_PARAM_CONFIG.get("legacy_raw_fallback", {}) if isinstance(M7_PARAM_CONFIG, dict) else {}

    w_linear = safe_num(internal_weights.get("linear"), 0.35)
    w_ma = safe_num(internal_weights.get("ma200"), 0.50)
    w_acc = safe_num(internal_weights.get("acceleration"), 0.15)
    fallback_history_weeks = int(safe_num(fallback_cfg.get("fallback_history_weeks"), 156))
    acceleration_recent_weeks = int(safe_num(periods.get("acceleration_recent_weeks"), 156))
    ma_window_weeks = int(safe_num(periods.get("ma_window_weeks"), 40))

    linear_curve = trend_cfg.get("linear_curve", DEFAULT_M7_PARAM_CONFIG["trend"]["linear_curve"])
    ma_curve = trend_cfg.get("ma200_curve", DEFAULT_M7_PARAM_CONFIG["trend"]["ma200_curve"])
    acceleration_curve = trend_cfg.get("acceleration_curve", DEFAULT_M7_PARAM_CONFIG["trend"]["acceleration_curve"])

    weekly_prices = [safe_num(x, None) for x in feature.get("weekly_prices", [])]
    weekly_prices = [x for x in weekly_prices if x is not None and x > 0]
    history_weeks = len(weekly_prices)

    if history_weeks < 4:
        return {
            "raw": 0.0,
            "score_10": 0.0,
            "trend_mode": "insufficient_data",
            "trend_reliability": "low",
            "history_weeks": history_weeks,
            "fallback_to_raw": True,
            "fallback_reason": "history_weeks < 4",
            "linear_slope": None,
            "ma_slope": None,
            "recent_3y_slope": None,
            "linear_annualized_pct": None,
            "ma_annualized_pct": None,
            "recent_3y_annualized_pct": None,
            "acceleration_annualized_delta_pct": None,
            "acceleration": None,
            "linear_score": None,
            "ma_score": None,
            "acceleration_score": None,
        }

    log_prices = [math.log(x) for x in weekly_prices]

    def calc_slope(y_vals: list[float]) -> float:
        n = len(y_vals)
        if n <= 1:
            return 0.0
        x_vals = list(range(n))
        x_mean = sum(x_vals) / n
        y_mean = sum(y_vals) / n
        numerator = sum((x_vals[i] - x_mean) * (y_vals[i] - y_mean) for i in range(n))
        denominator = sum((x_vals[i] - x_mean) ** 2 for i in range(n))
        if denominator == 0:
            return 0.0
        return numerator / denominator

    def annualize_pct(weekly_slope: float) -> float:
        try:
            return (math.exp(safe_num(weekly_slope, 0.0) * 52.0) - 1.0) * 100.0
        except OverflowError:
            return 9999.0 if weekly_slope > 0 else -100.0

    def score_curve(curve: dict[str, Any], x: float) -> float:
        pts = curve.get("points", []) if isinstance(curve, dict) else []
        raw = piecewise(pts, x)
        cap_min = safe_num(curve.get("cap_min"), None) if isinstance(curve, dict) else None
        cap_max = safe_num(curve.get("cap_max"), None) if isinstance(curve, dict) else None
        if cap_min is not None and cap_max is not None:
            return clamp(raw, cap_min, cap_max)
        return raw

    # 1) Linear: full available weekly log-price regression
    long_slope = calc_slope(log_prices)
    linear_annualized_pct = annualize_pct(long_slope)
    linear_score = score_curve(linear_curve, linear_annualized_pct)

    # 2) MA200 confirmation: default 40 weekly MA ~= 200 trading days.
    ma_series: list[float] = []
    if history_weeks >= ma_window_weeks:
        for i in range(ma_window_weeks, history_weeks + 1):
            ma_series.append(sum(weekly_prices[i - ma_window_weeks:i]) / ma_window_weeks)

    if len(ma_series) >= 10:
        ma_log = [math.log(x) for x in ma_series if x > 0]
        ma_slope = calc_slope(ma_log)
    else:
        ma_slope = 0.0

    ma_annualized_pct = annualize_pct(ma_slope)
    ma_score = score_curve(ma_curve, ma_annualized_pct)

    # 3) Acceleration: recent 3Y slope minus full-history slope, both annualized.
    if history_weeks >= acceleration_recent_weeks:
        recent_prices = weekly_prices[-acceleration_recent_weeks:]
        recent_log_prices = [math.log(x) for x in recent_prices if x > 0]
        recent_3y_slope = calc_slope(recent_log_prices)
        recent_3y_annualized_pct = annualize_pct(recent_3y_slope)
        acceleration_delta_pct = recent_3y_annualized_pct - linear_annualized_pct
        acceleration_score = score_curve(acceleration_curve, acceleration_delta_pct)
        acceleration_mode = "recent_3y_minus_full"
    else:
        recent_3y_slope = None
        recent_3y_annualized_pct = None
        acceleration_delta_pct = None
        acceleration_score = 0.0
        acceleration_mode = "insufficient_3y_history"

    final_score = w_linear * linear_score + w_ma * ma_score + w_acc * acceleration_score

    if history_weeks >= 520:
        mode = "full_10y"
        reliability = "high"
    elif history_weeks >= 260:
        mode = "full_5y"
        reliability = "high"
    elif history_weeks >= fallback_history_weeks:
        mode = "minimum_3y"
        reliability = "medium"
    elif history_weeks >= 52:
        mode = "short_history_fallback_raw"
        reliability = "low"
    else:
        mode = "insufficient_data"
        reliability = "low"

    fallback_to_raw = bool(fallback_cfg.get("enabled", True)) and history_weeks < fallback_history_weeks
    fallback_reason = None
    if fallback_to_raw:
        fallback_reason = f"history_weeks < {fallback_history_weeks}; use m7_raw_score as effective M7 score"

    return {
        "raw": round2(final_score),
        "score_10": round2(final_score),
        "trend_mode": mode,
        "trend_reliability": reliability,
        "history_weeks": history_weeks,
        "fallback_to_raw": fallback_to_raw,
        "fallback_reason": fallback_reason,
        "trend_formula": "0.35*linear + 0.50*ma200 + 0.15*acceleration",
        "linear_slope": round(long_slope, 6),
        "ma_slope": round(ma_slope, 6),
        "recent_3y_slope": round(recent_3y_slope, 6) if recent_3y_slope is not None else None,
        "linear_annualized_pct": round2(linear_annualized_pct),
        "ma_annualized_pct": round2(ma_annualized_pct),
        "recent_3y_annualized_pct": round2(recent_3y_annualized_pct) if recent_3y_annualized_pct is not None else None,
        "acceleration_annualized_delta_pct": round2(acceleration_delta_pct) if acceleration_delta_pct is not None else None,
        "acceleration": round2(acceleration_delta_pct) if acceleration_delta_pct is not None else None,
        "acceleration_mode": acceleration_mode,
        "linear_score": round2(linear_score),
        "ma_score": round2(ma_score),
        "acceleration_score": round2(acceleration_score),
        "ma_window_weeks": ma_window_weeks,
        "acceleration_recent_weeks": acceleration_recent_weeks,
    }

def compute_structure(feature: dict[str, Any]) -> dict[str, Any]:
    """
    Structure score uses weekly PRICE series, not weekly returns and not horizon returns.

    Input:
      feature["weekly_prices"] = 10Y/5Y/3Y/1Y weekly close price sequence from runtime.

    Models:
      1) linear:      log(price) = a + b*x
      2) quadratic:   log(price) = a + b*x + c*x^2
      3) logarithmic: log(price) = a + b*log(x+1)

    Score:
      structure_score = max(R² of the 3 models) * 10
      Example: best R² = 0.98 -> structure_score = 9.8
    """

    weekly_prices = [safe_num(x, None) for x in feature.get("weekly_prices", [])]
    weekly_prices = [x for x in weekly_prices if x is not None and x > 0]

    # NEW: define allowed_models before insufficient-data return.
    # Some universe_150 stocks may have <52 weekly prices; the early-return branch
    # still needs this value for debug/governance output.
    structure_cfg = M7_PARAM_CONFIG.get("structure", {}) if isinstance(M7_PARAM_CONFIG, dict) else {}
    allowed_models_cfg = structure_cfg.get("allowed_models", {}) if isinstance(structure_cfg, dict) else {}
    allowed_models = {
        "linear": bool(allowed_models_cfg.get("linear", True)),
        "quadratic": bool(allowed_models_cfg.get("quadratic", True)),
        "logarithmic": bool(allowed_models_cfg.get("logarithmic", True)),
    }

    def _solve_linear_system(a: list[list[float]], b: list[float]) -> list[float] | None:
        """Small Gaussian elimination solver to avoid sklearn/numpy dependency."""
        n = len(b)
        mat = [row[:] + [b[i]] for i, row in enumerate(a)]

        for col in range(n):
            pivot = max(range(col, n), key=lambda r: abs(mat[r][col]))
            if abs(mat[pivot][col]) < 1e-12:
                return None
            if pivot != col:
                mat[col], mat[pivot] = mat[pivot], mat[col]

            pivot_val = mat[col][col]
            for j in range(col, n + 1):
                mat[col][j] /= pivot_val

            for r in range(n):
                if r == col:
                    continue
                factor = mat[r][col]
                for j in range(col, n + 1):
                    mat[r][j] -= factor * mat[col][j]

        return [mat[i][n] for i in range(n)]

    def _fit_r2(x_values: list[float], y_values: list[float], degree: int) -> dict[str, Any]:
        n = len(x_values)
        if n < degree + 2:
            return {"r2": None, "coeffs": None, "dispersion": None}

        basis = [[x ** p for p in range(degree + 1)] for x in x_values]
        lhs = []
        rhs = []
        for i in range(degree + 1):
            lhs_row = []
            for j in range(degree + 1):
                lhs_row.append(sum(row[i] * row[j] for row in basis))
            lhs.append(lhs_row)
            rhs.append(sum(row[i] * y for row, y in zip(basis, y_values)))

        coeffs = _solve_linear_system(lhs, rhs)
        if coeffs is None:
            return {"r2": None, "coeffs": None, "dispersion": None}

        fitted = [sum(c * (x ** p) for p, c in enumerate(coeffs)) for x in x_values]
        mean_y = sum(y_values) / len(y_values)
        ss_tot = sum((y - mean_y) ** 2 for y in y_values)
        ss_res = sum((y - yhat) ** 2 for y, yhat in zip(y_values, fitted))
        r2 = 1.0 if ss_tot <= 1e-12 else 1.0 - ss_res / ss_tot
        r2 = clamp(r2, 0.0, 1.0)
        dispersion = (ss_res / len(y_values)) ** 0.5
        return {
            "r2": r2,
            "coeffs": coeffs,
            "dispersion": dispersion,
        }

    if len(weekly_prices) < 52:
        return {
            "raw": 0.0,
            "score_10": 0.0,
            "structure_score": 0.0,

            "slope": None,
            "dispersion": None,
            "stability": None,
            "r2": None,
            "drawdown_frequency": None,

            "structure_r2_linear": None,
            "structure_r2_quadratic": None,
            "structure_r2_logarithmic": None,
            "best_structure_r2": None,
            "best_structure_model": "insufficient_data",
            "structure_score_method": "best_allowed_r2_to_b3_curve",
            "structure_allowed_models": allowed_models,

            "linear_slope": None,
            "quadratic_a": None,
            "logarithmic_slope": None,
        }

    y = [math.log(p) for p in weekly_prices]
    x = list(range(len(y)))
    x_log = [math.log(i + 1.0) for i in x]

    linear = _fit_r2(x, y, degree=1)
    quadratic = _fit_r2(x, y, degree=2)
    logarithmic = _fit_r2(x_log, y, degree=1)

    model_r2 = {
        "linear": linear.get("r2"),
        "quadratic": quadratic.get("r2"),
        "logarithmic": logarithmic.get("r2"),
    }
    valid_models = {k: v for k, v in model_r2.items() if v is not None and allowed_models.get(k, True)}

    if not valid_models:
        best_model = "insufficient_data"
        best_r2 = None
        structure_score = 0.0
    else:
        best_model = max(valid_models, key=valid_models.get)
        best_r2 = valid_models[best_model]
        r2_curve = structure_cfg.get("r2_curve", {}) if isinstance(structure_cfg, dict) else {}
        structure_score = curve_score(r2_curve, best_r2, clamp(best_r2 * 10.0, 0.0, 10.0))

    best_dispersion = {
        "linear": linear.get("dispersion"),
        "quadratic": quadratic.get("dispersion"),
        "logarithmic": logarithmic.get("dispersion"),
    }.get(best_model)

    linear_coeffs = linear.get("coeffs") or []
    quadratic_coeffs = quadratic.get("coeffs") or []
    logarithmic_coeffs = logarithmic.get("coeffs") or []

    linear_slope = linear_coeffs[1] if len(linear_coeffs) > 1 else None
    quadratic_a = quadratic_coeffs[2] if len(quadratic_coeffs) > 2 else None
    logarithmic_slope = logarithmic_coeffs[1] if len(logarithmic_coeffs) > 1 else None

    return {
        "raw": structure_score,
        "score_10": structure_score,
        "structure_score": structure_score,

        "slope": linear_slope,
        "dispersion": best_dispersion,
        "stability": None if best_r2 is None else best_r2 * 10.0,
        "r2": best_r2,
        "drawdown_frequency": None,

        "structure_r2_linear": linear.get("r2"),
        "structure_r2_quadratic": quadratic.get("r2"),
        "structure_r2_logarithmic": logarithmic.get("r2"),
        "best_structure_r2": best_r2,
        "best_structure_model": best_model,
        "structure_score_method": "best_r2_of_linear_quadratic_logarithmic",

        "linear_slope": linear_slope,
        "quadratic_a": quadratic_a,
        "logarithmic_slope": logarithmic_slope,
    }



def trimmed_mean(values: list[float], trim_pct: float = 0.10) -> float | None:
    """Return trimmed mean after removing both tails. Used for valuation multiple normal level."""
    arr = sorted([safe_num(v, None) for v in values if safe_num(v, None) is not None and safe_num(v, 0.0) > 0])
    if not arr:
        return None
    n = len(arr)
    k = int(math.floor(n * clamp(trim_pct, 0.0, 0.45)))
    if n - 2 * k <= 0:
        k = 0
    core = arr[k:n-k] if k > 0 else arr
    if not core:
        return None
    return sum(core) / len(core)


def compute_regression_valuation_band(feature: dict[str, Any], structure: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    Historical self-band valuation proxy with valuation heat brake.

    Finalized logic:
      1) Use weekly price regression fair curve as the stock's standard price path.
      2) weekly_multiple = actual_price / fitted_fair_price.
      3) historical_trimmed_mean_multiple = trimmed mean of weekly_multiple series.
      4) current_regression_multiple = current_price / current_fitted_fair_price.
      5) adjustment = historical_trimmed_mean_multiple / sqrt(current_regression_multiple)
         - sqrt() makes the timing adjustment sub-linear, so the model does not fully pass through
           a short-term regression deviation into fair PE.
      6) valuation heat brake:
         valuation_heat = current_forward_pe / heat_baseline_pe
         where heat_baseline_pe is base_anchor first, then anchor_pe fallback.
         If current PE is already very high versus baseline, upward expansion is capped.
      7) individual_fair_pe = current_forward_pe * capped_adjustment.

    This does NOT need historical EPS.
    This is an individual valuation timing adjustment, not the final sector baseline.
    formula_test.html can still build the 28-sector baseline using these individual_fair_pe values.
    """
    val = feature.get("valuation", {}) if isinstance(feature.get("valuation"), dict) else {}
    current_forward_pe = safe_num(val.get("forward_pe"), None)
    heat_baseline_pe = safe_num(val.get("base_anchor"), safe_num(val.get("anchor_pe"), None))

    weekly_prices = [safe_num(x, None) for x in feature.get("weekly_prices", [])]
    weekly_prices = [x for x in weekly_prices if x is not None and x > 0]
    history_weeks = len(weekly_prices)

    def _fallback_payload(source: str, quality: str, fair_pe_value: float | None = None) -> dict[str, Any]:
        fair_value = fair_pe_value if fair_pe_value is not None else current_forward_pe
        return {
            "individual_fair_pe": round2(fair_value) if fair_value is not None and fair_value > 0 else None,
            "regression_fair_pe": round2(fair_value) if fair_value is not None and fair_value > 0 else None,
            "current_regression_multiple": None,
            "historical_trimmed_mean_multiple": None,
            "historical_median_multiple": None,
            "historical_p25_multiple": None,
            "historical_p75_multiple": None,
            "regression_adjustment_raw": None,
            "regression_adjustment_capped": None,
            "regression_adjustment_floor": 0.90,
            "regression_adjustment_cap": None,
            "valuation_heat": None,
            "valuation_heat_baseline_pe": round2(heat_baseline_pe) if heat_baseline_pe is not None and heat_baseline_pe > 0 else None,
            "valuation_heat_brake_rule": None,
            "regression_fair_price_now": None,
            "regression_actual_price_now": weekly_prices[-1] if weekly_prices else None,
            "regression_valuation_source": source,
            "regression_valuation_quality": quality,
        }

    if current_forward_pe is None or current_forward_pe <= 0:
        return _fallback_payload("missing_current_forward_pe", "missing", None)

    if history_weeks < 52:
        return _fallback_payload("fallback_current_forward_pe_insufficient_history", "low", current_forward_pe)

    y = [math.log(p) for p in weekly_prices]
    x = list(range(len(y)))
    x_log = [math.log(i + 1.0) for i in x]

    def _solve_linear_system(a: list[list[float]], b: list[float]) -> list[float] | None:
        n = len(b)
        mat = [row[:] + [b[i]] for i, row in enumerate(a)]
        for col in range(n):
            pivot = max(range(col, n), key=lambda r: abs(mat[r][col]))
            if abs(mat[pivot][col]) < 1e-12:
                return None
            if pivot != col:
                mat[col], mat[pivot] = mat[pivot], mat[col]
            pivot_val = mat[col][col]
            for j in range(col, n + 1):
                mat[col][j] /= pivot_val
            for r in range(n):
                if r == col:
                    continue
                factor = mat[r][col]
                for j in range(col, n + 1):
                    mat[r][j] -= factor * mat[col][j]
        return [mat[i][n] for i in range(n)]

    def _fit(x_values: list[float], y_values: list[float], degree: int) -> dict[str, Any]:
        n = len(x_values)
        if n < degree + 2:
            return {"r2": None, "coeffs": None, "fitted": []}
        basis = [[xx ** p for p in range(degree + 1)] for xx in x_values]
        lhs = []
        rhs = []
        for i in range(degree + 1):
            lhs_row = []
            for j in range(degree + 1):
                lhs_row.append(sum(row[i] * row[j] for row in basis))
            lhs.append(lhs_row)
            rhs.append(sum(row[i] * yy for row, yy in zip(basis, y_values)))
        coeffs = _solve_linear_system(lhs, rhs)
        if coeffs is None:
            return {"r2": None, "coeffs": None, "fitted": []}
        fitted = [sum(c * (xx ** p) for p, c in enumerate(coeffs)) for xx in x_values]
        mean_y = sum(y_values) / len(y_values)
        ss_tot = sum((yy - mean_y) ** 2 for yy in y_values)
        ss_res = sum((yy - yyhat) ** 2 for yy, yyhat in zip(y_values, fitted))
        r2 = 1.0 if ss_tot <= 1e-12 else 1.0 - ss_res / ss_tot
        return {"r2": clamp(r2, 0.0, 1.0), "coeffs": coeffs, "fitted": fitted}

    linear = _fit(x, y, 1)
    quadratic = _fit(x, y, 2)
    logarithmic = _fit(x_log, y, 1)
    models = {
        "linear": linear,
        "quadratic": quadratic,
        "logarithmic": logarithmic,
    }

    preferred = (structure or {}).get("best_structure_model")
    if preferred not in models or models.get(preferred, {}).get("r2") is None:
        valid = {k: v for k, v in models.items() if v.get("r2") is not None}
        preferred = max(valid, key=lambda k: valid[k]["r2"]) if valid else None

    if not preferred:
        return _fallback_payload("fallback_current_forward_pe_regression_fit_failed", "low", current_forward_pe)

    fitted_log = models[preferred].get("fitted", [])
    fitted_prices = [math.exp(v) for v in fitted_log if v is not None]
    if len(fitted_prices) != len(weekly_prices):
        return _fallback_payload("fallback_current_forward_pe_bad_fitted_series", "low", current_forward_pe)

    multiples = []
    for actual, fair in zip(weekly_prices, fitted_prices):
        if fair > 0:
            m = actual / fair
            if math.isfinite(m) and m > 0:
                multiples.append(m)

    normal_multiple = trimmed_mean(multiples, 0.10)
    median_multiple = percentile(multiples, 0.50) if multiples else None
    p25_multiple = percentile(multiples, 0.25) if multiples else None
    p75_multiple = percentile(multiples, 0.75) if multiples else None
    current_fair_price = fitted_prices[-1] if fitted_prices else None
    current_price = weekly_prices[-1] if weekly_prices else None
    current_multiple = (current_price / current_fair_price) if current_fair_price and current_fair_price > 0 else None

    if normal_multiple is None or current_multiple is None or current_multiple <= 0:
        fair_pe = current_forward_pe
        adjustment_raw = None
        adjustment_capped = None
        adjustment_cap = None
        valuation_heat = None
        heat_rule = "fallback_no_multiple"
        source = "fallback_current_forward_pe_missing_multiples"
        quality = "low"
    else:
        # finalized: sub-linear regression adjustment
        adjustment_raw = normal_multiple / math.sqrt(current_multiple)

        # valuation heat brake: prevent high-PE bubbles from expanding further.
        if heat_baseline_pe is not None and heat_baseline_pe > 0:
            valuation_heat = current_forward_pe / heat_baseline_pe
        else:
            valuation_heat = None

        if valuation_heat is None:
            adjustment_cap = 1.15
            heat_rule = "missing_heat_baseline_cap_1.15"
        elif valuation_heat <= 1.20:
            adjustment_cap = 1.20
            heat_rule = "heat<=1.20_cap_1.20"
        elif valuation_heat <= 1.50:
            adjustment_cap = 1.12
            heat_rule = "heat<=1.50_cap_1.12"
        elif valuation_heat <= 1.80:
            adjustment_cap = 1.08
            heat_rule = "heat<=1.80_cap_1.08"
        else:
            adjustment_cap = 1.02
            heat_rule = "heat>1.80_cap_1.02"

        adjustment_capped = clamp(adjustment_raw, 0.90, adjustment_cap)
        fair_pe = current_forward_pe * adjustment_capped
        source = "current_pe_x_trimmed_mean_over_sqrt_current_multiple_with_heat_brake"
        r2 = safe_num(models[preferred].get("r2"), 0.0)
        if history_weeks >= 260 and r2 >= 0.70:
            quality = "high"
        elif history_weeks >= 156 and r2 >= 0.50:
            quality = "medium"
        else:
            quality = "low"

    # avoid pathological PE anchors from extreme fits; still keep source/quality visible
    fair_pe_capped = clamp(safe_num(fair_pe, current_forward_pe), 1.0, 120.0)

    regression_price_models_now = {}
    for model_name, model_payload in models.items():
        fitted_log_values = model_payload.get("fitted", []) if isinstance(model_payload, dict) else []
        model_price_now = None
        if fitted_log_values:
            try:
                model_price_now = math.exp(fitted_log_values[-1])
            except OverflowError:
                model_price_now = None
        regression_price_models_now[model_name] = {
            "fair_price_now": round2(model_price_now) if model_price_now is not None else None,
            "actual_price_now": round2(current_price) if current_price is not None else None,
            "gap_to_actual": round(safe_num((model_price_now / current_price - 1.0), 0.0), 4) if model_price_now is not None and current_price and current_price > 0 else None,
            "r2": round2(model_payload.get("r2")) if isinstance(model_payload, dict) and model_payload.get("r2") is not None else None,
            "coeffs": model_payload.get("coeffs") if isinstance(model_payload, dict) else None,
            "is_preferred": model_name == preferred,
        }

    return {
        "individual_fair_pe": round2(fair_pe_capped),
        "regression_fair_pe": round2(fair_pe_capped),
        "current_regression_multiple": round(safe_num(current_multiple, 0.0), 4) if current_multiple is not None else None,
        "historical_trimmed_mean_multiple": round(safe_num(normal_multiple, 0.0), 4) if normal_multiple is not None else None,
        "historical_median_multiple": round(safe_num(median_multiple, 0.0), 4) if median_multiple is not None else None,
        "historical_p25_multiple": round(safe_num(p25_multiple, 0.0), 4) if p25_multiple is not None else None,
        "historical_p75_multiple": round(safe_num(p75_multiple, 0.0), 4) if p75_multiple is not None else None,
        "regression_adjustment_raw": round(safe_num(adjustment_raw, 0.0), 4) if adjustment_raw is not None else None,
        "regression_adjustment_capped": round(safe_num(adjustment_capped, 0.0), 4) if adjustment_capped is not None else None,
        "regression_adjustment_floor": 0.90,
        "regression_adjustment_cap": round(safe_num(adjustment_cap, 0.0), 4) if adjustment_cap is not None else None,
        "valuation_heat": round(safe_num(valuation_heat, 0.0), 4) if valuation_heat is not None else None,
        "valuation_heat_baseline_pe": round2(heat_baseline_pe) if heat_baseline_pe is not None and heat_baseline_pe > 0 else None,
        "valuation_heat_brake_rule": heat_rule,
        "regression_fair_price_now": round2(current_fair_price) if current_fair_price is not None else None,
        "regression_actual_price_now": round2(current_price) if current_price is not None else None,
        "regression_price_models_now": regression_price_models_now,
        "m7_price_models_now": regression_price_models_now,
        "m7_linear_fair_price": regression_price_models_now.get("linear", {}).get("fair_price_now"),
        "m7_quadratic_fair_price": regression_price_models_now.get("quadratic", {}).get("fair_price_now"),
        "m7_logarithmic_fair_price": regression_price_models_now.get("logarithmic", {}).get("fair_price_now"),
        "regression_valuation_model": preferred,
        "regression_valuation_r2": round2(models[preferred].get("r2")) if models[preferred].get("r2") is not None else None,
        "regression_valuation_history_weeks": history_weeks,
        "regression_valuation_source": source,
        "regression_valuation_quality": quality,
    }


def compute_timing(feature: dict[str, Any]) -> dict[str, float]:
    rets = feature["returns"]
    timing_raw = (
        0.45 * safe_num(rets["1d"], 0.0)
        + 0.35 * safe_num(rets["1w"], 0.0)
        + 0.2 * safe_num(rets["1m"], 0.0)
    )
    timing_score_10 = piecewise(curve_params["timing_curve"]["points"], timing_raw)
    return {"raw": timing_raw, "score_10": clamp(timing_score_10, 0.0, 10.0)}


def compute_valuation(feature: dict[str, Any]) -> dict[str, float]:
    val = feature["valuation"]

    fpe = safe_num(val.get("forward_pe"), 0.0)
    base_anchor = safe_num(val.get("base_anchor"), safe_num(val.get("anchor_pe"), 0.0))
    market_multiplier = safe_num(val.get("market_multiplier"), 1.0)
    industry_multiplier = safe_num(val.get("industry_multiplier"), 1.0)
    archetype_multiplier = safe_num(val.get("archetype_multiplier"), 1.0)

    raw_final_anchor = base_anchor * market_multiplier * industry_multiplier * archetype_multiplier
    caps = DYNAMIC_ANCHOR_CONFIG.get("caps", {})
    final_anchor = clamp(
        raw_final_anchor,
        safe_num(caps.get("min_final_anchor"), 8.0),
        safe_num(caps.get("max_final_anchor"), 45.0),
    )
    valuation_gap = (fpe / final_anchor - 1.0) if final_anchor > 0 else 0.0
    valuation_cfg = M7_PARAM_CONFIG.get("valuation", {}) if isinstance(M7_PARAM_CONFIG, dict) else {}
    gap_curve = valuation_cfg.get("gap_curve", DEFAULT_M7_PARAM_CONFIG["valuation"]["gap_curve"])
    valuation_raw = piecewise(gap_curve.get("points", []), valuation_gap)
    valuation_score = clamp(
        valuation_raw,
        safe_num(gap_curve.get("cap_min"), 2.0),
        safe_num(gap_curve.get("cap_max"), 10.0),
    )

    return {
        "raw": valuation_raw,
        "score_10": valuation_score,
        "valuation_gap": valuation_gap,
        "base_anchor": base_anchor,
        "final_anchor": final_anchor,
    }


def compute_quality(feature: dict[str, Any]) -> dict[str, float]:
    q_raw = safe_num(feature.get("quality_momentum"), 0.0)
    q_score = piecewise(curve_params["quality_curve"]["points"], q_raw)
    return {"raw": q_raw, "score_10": clamp(q_score, 0.0, 10.0)}


def compute_market_acceptance(feature: dict[str, Any]) -> dict[str, float]:
    """Money v2 = Liquidity + Flow."""
    m = feature["market_acceptance"]
    money_cfg = M7_PARAM_CONFIG.get("money", {}) if isinstance(M7_PARAM_CONFIG, dict) else {}
    module_name = str(money_cfg.get("active_module", "M7"))
    preset = (money_cfg.get("module_presets", {}) or {}).get(module_name, {})
    liquidity_weight = safe_num(preset.get("liquidity_weight"), 0.70)
    flow_weight = safe_num(preset.get("flow_weight"), 0.30)

    vr = safe_num(m.get("volume_ratio"), 1.0)
    avg_dollar_volume = safe_num(m.get("avg_dollar_volume"), safe_num(m.get("liquidity_proxy"), 0.0))
    today_dollar_volume = safe_num(m.get("today_dollar_volume"), safe_num(m.get("size_proxy"), 0.0))

    liquidity_curve = money_cfg.get("liquidity_curve", {}) if isinstance(money_cfg, dict) else {}
    mean_band_pct = safe_num(liquidity_curve.get("mean_band_pct"), 0.05)
    pool_scores = liquidity_curve.get("pool30_scores", {"p25": 5.0, "mean": 8.0, "p75": 10.0})
    universe_scores = liquidity_curve.get("universe_scores", {"p25": 3.0, "mean": 7.0, "p75": 10.0})
    is_pool30 = bool(feature.get("is_pool30", True))
    liquidity_scores = pool_scores if is_pool30 else universe_scores
    liquidity_score = score_by_benchmark_linear(
        avg_dollar_volume,
        MONEY_LIQUIDITY_BENCHMARK,
        liquidity_scores,
        mean_band_pct,
    )

    flow_curve = money_cfg.get("flow_curve", {}) if isinstance(money_cfg, dict) else {}
    volume_ratio_score = curve_score(flow_curve, vr, piecewise(curve_params["market_acceptance_curve"]["volume_ratio"]["points"], vr))

    mean_adv = safe_num(MONEY_LIQUIDITY_BENCHMARK.get("mean"), 0.0)
    money_position = today_dollar_volume / mean_adv if mean_adv > 0 else 1.0
    position_curve = money_cfg.get("money_position_curve", {}) if isinstance(money_cfg, dict) else {}
    money_position_score = curve_score(position_curve, money_position, volume_ratio_score)

    flow_blend = money_cfg.get("flow_blend_weights", {}) if isinstance(money_cfg, dict) else {}
    w_vr = safe_num(flow_blend.get("volume_ratio"), 0.70)
    w_pos = safe_num(flow_blend.get("money_position"), 0.30)
    flow_weight_sum = max(1e-9, w_vr + w_pos)
    flow_score = (w_vr * volume_ratio_score + w_pos * money_position_score) / flow_weight_sum

    total_weight = max(1e-9, liquidity_weight + flow_weight)
    raw = (liquidity_weight * liquidity_score + flow_weight * flow_score) / total_weight

    return {
        "raw": raw,
        "score_10": clamp(raw, 0.0, 10.0),
        "liquidity_score": clamp(liquidity_score, 0.0, 10.0),
        "flow_score": clamp(flow_score, 0.0, 10.0),
        "volume_ratio_score": clamp(volume_ratio_score, 0.0, 10.0),
        "money_position_score": clamp(money_position_score, 0.0, 10.0),
        "money_position": money_position,
        "avg_dollar_volume": avg_dollar_volume,
        "today_dollar_volume": today_dollar_volume,
        "volume_ratio": vr,
        "liquidity_weight": liquidity_weight,
        "flow_weight": flow_weight,
        "money_module_preset": module_name,
        "benchmark_mean": MONEY_LIQUIDITY_BENCHMARK.get("mean"),
        "benchmark_p25": MONEY_LIQUIDITY_BENCHMARK.get("p25"),
        "benchmark_p75": MONEY_LIQUIDITY_BENCHMARK.get("p75"),
    }

def compute_exposure_penalty(feature: dict[str, Any]) -> dict[str, Any]:
    e = feature["exposure"]
    ratio = safe_num(e.get("ratio"), 0.0)
    danger = safe_num(e.get("danger"), 0.0)
    watch = safe_num(e.get("watch"), 0.0)

    c = curve_params["exposure_penalty_curve"]
    base_penalty = piecewise(c["ratio"]["points"], ratio)
    penalty = base_penalty + c["danger_add"] * danger + c["watch_add"] * watch

    tags = []
    if ratio >= 50:
        tags.append("exposure_high")
    elif ratio >= 30:
        tags.append("exposure_medium")
    if danger > 0:
        tags.append("danger_position")
    if watch > 0:
        tags.append("watch_position")

    return {"penalty": max(0.0, penalty), "tags": tags}



# -------------------------
# M1 Competitive / CC EPS Engine add-on (non-breaking)
# -------------------------
def _eps_data_rows() -> dict[str, Any]:
    """Return EPS records by symbol. Supports {meta,data}, flat dict, and list-of-records formats."""
    raw = EPS_HISTORY_DATA
    if isinstance(raw, dict) and isinstance(raw.get("data"), dict):
        return {normalize_symbol(k): v for k, v in raw.get("data", {}).items() if isinstance(v, dict)}
    if isinstance(raw, dict):
        out: dict[str, Any] = {}
        for k, v in raw.items():
            if k in {"meta", "summary"}:
                continue
            if isinstance(v, dict):
                sym = normalize_symbol(v.get("symbol") or k)
                if sym:
                    out[sym] = v
        return out
    if isinstance(raw, list):
        out: dict[str, Any] = {}
        for row in raw:
            if not isinstance(row, dict):
                continue
            sym = normalize_symbol(row.get("symbol") or row.get("ticker"))
            if sym:
                out[sym] = row
        return out
    return {}


def _extract_eps_history(eps_info: dict[str, Any]) -> list[dict[str, float]]:
    rows = eps_info.get("eps_history", []) if isinstance(eps_info, dict) else []
    out: list[dict[str, float]] = []
    if isinstance(rows, list):
        for idx, r in enumerate(rows):
            if isinstance(r, dict):
                yr = safe_num(r.get("fiscal_year", r.get("year")), None)
                eps = safe_num(r.get("eps", r.get("diluted_eps", r.get("eps_actual"))), None)
                if yr is not None and eps is not None:
                    out.append({"fiscal_year": int(yr), "eps": eps})
            else:
                eps = safe_num(r, None)
                if eps is not None:
                    out.append({"fiscal_year": idx, "eps": eps})
    return sorted(out, key=lambda x: x["fiscal_year"])


def _extract_forward_eps(eps_info: dict[str, Any]) -> dict[int, dict[str, Any]]:
    rows = eps_info.get("eps_forward", []) if isinstance(eps_info, dict) else []
    out: dict[int, dict[str, Any]] = {}
    if isinstance(rows, dict):
        for k, v in rows.items():
            yr = safe_num(k, None)
            if yr is None:
                continue
            if isinstance(v, dict):
                eps = safe_num(v.get("eps_estimate", v.get("eps", v.get("value"))), None)
                analyst_count = safe_num(v.get("analyst_count", v.get("analysts")), None)
            else:
                eps = safe_num(v, None)
                analyst_count = None
            out[int(yr)] = {"eps": eps, "analyst_count": analyst_count}
    elif isinstance(rows, list):
        for r in rows:
            if not isinstance(r, dict):
                continue
            yr = safe_num(r.get("fiscal_year", r.get("year")), None)
            eps = safe_num(r.get("eps_estimate", r.get("eps", r.get("value"))), None)
            analyst_count = safe_num(r.get("analyst_count", r.get("analysts")), None)
            if yr is not None:
                out[int(yr)] = {"eps": eps, "analyst_count": analyst_count}
    return out


def _annual_avg_prices_from_weekly(weekly_prices: list[Any]) -> list[float]:
    vals = [safe_num(x, None) for x in weekly_prices if safe_num(x, None) is not None and safe_num(x, 0.0) > 0]
    annual: list[float] = []
    for i in range(0, len(vals), 52):
        chunk = vals[i:i + 52]
        if len(chunk) >= 20:
            annual.append(sum(chunk) / len(chunk))
    return annual


def _annual_avg_price_by_year_from_weekly(weekly_prices: list[Any], latest_complete_year: int = 2025) -> dict[int, float]:
    """
    Convert M7 weekly price sequence to annual average price buckets.

    Important M1/CC governance:
    - EPS history is fiscal-year annual data.
    - M7 price history is weekly data without exact date stamps in m7_v2_scores output.
    - Therefore we bucket consecutive 52-week windows into annual averages and assign
      the last full 52-week bucket to latest_complete_year (default 2025).
    - Example with 522 weeks: 10 full annual buckets => 2016..2025.
    """
    annual = _annual_avg_prices_from_weekly(weekly_prices)
    if not annual:
        return {}
    start_year = int(latest_complete_year) - len(annual) + 1
    return {start_year + i: p for i, p in enumerate(annual)}


def _solve_linear_system(a: list[list[float]], b: list[float]) -> list[float] | None:
    n = len(b)
    if n == 0:
        return None
    mat = [row[:] + [b[i]] for i, row in enumerate(a)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(mat[r][col]))
        if abs(mat[pivot][col]) < 1e-12:
            return None
        if pivot != col:
            mat[col], mat[pivot] = mat[pivot], mat[col]
        pivot_val = mat[col][col]
        for j in range(col, n + 1):
            mat[col][j] /= pivot_val
        for r in range(n):
            if r == col:
                continue
            factor = mat[r][col]
            for j in range(col, n + 1):
                mat[r][j] -= factor * mat[col][j]
    return [mat[i][n] for i in range(n)]


def _fit_design_matrix(design: list[list[float]], y_values: list[float]) -> dict[str, Any]:
    if len(design) != len(y_values) or len(y_values) < 2:
        return {"r2": None, "coeffs": None, "fitted": []}
    cols = len(design[0]) if design else 0
    if cols <= 0 or len(y_values) < cols:
        return {"r2": None, "coeffs": None, "fitted": []}
    lhs: list[list[float]] = []
    rhs: list[float] = []
    for i in range(cols):
        lhs_row = []
        for j in range(cols):
            lhs_row.append(sum(row[i] * row[j] for row in design))
        lhs.append(lhs_row)
        rhs.append(sum(row[i] * y for row, y in zip(design, y_values)))
    coeffs = _solve_linear_system(lhs, rhs)
    if coeffs is None:
        return {"r2": None, "coeffs": None, "fitted": []}
    fitted = [sum(c * row[i] for i, c in enumerate(coeffs)) for row in design]
    mean_y = sum(y_values) / len(y_values)
    ss_tot = sum((y - mean_y) ** 2 for y in y_values)
    ss_res = sum((y - yhat) ** 2 for y, yhat in zip(y_values, fitted))
    r2 = 1.0 if ss_tot <= 1e-12 else clamp(1.0 - ss_res / ss_tot, 0.0, 1.0)
    return {"r2": r2, "coeffs": coeffs, "fitted": fitted}


def _predict_from_coeffs(coeffs: list[float] | None, row: list[float]) -> float | None:
    if coeffs is None or len(coeffs) != len(row):
        return None
    val = sum(c * row[i] for i, c in enumerate(coeffs))
    if not math.isfinite(val):
        return None
    return val




def _safe_log_positive(x: Any) -> float | None:
    """Return log(x) only for positive finite inputs; otherwise None.

    Governance note:
    - EPS itself may be 0 or negative and can remain as regression target y.
    - Only log-transformed INPUTS must be strictly positive.
    """
    v = safe_num(x, None)
    if v is None or v <= 0 or not math.isfinite(v):
        return None
    return math.log(v)


def _safe_eps_growth(new_eps: Any, old_eps: Any) -> float | None:
    """EPS growth is only meaningful when both EPS values are positive."""
    new_v = safe_num(new_eps, None)
    old_v = safe_num(old_eps, None)
    if new_v is None or old_v is None or new_v <= 0 or old_v <= 0:
        return None
    return new_v / old_v - 1.0


def _fit_eps_regression_models(years: list[int], prices: list[float], eps_values: list[float]) -> dict[str, Any]:
    """
    M1 Competitive EPS regression, following the agreed spec:
      input  = fiscal year + annual average price + annual EPS
      models = 3 regression forms
      output = best R² model and prediction function metadata

    Models:
      1) linear:      EPS = a + b*t + c*price
      2) quadratic:   EPS = a + b*t + c*t² + d*price
      3) logarithmic: EPS = a + b*log(t+1) + c*log(price)
    """
    cleaned: list[tuple[int, float, float]] = []
    for y, p, e in zip(years, prices, eps_values):
        yy = int(y)
        pp = safe_num(p, None)
        ee = safe_num(e, None)
        if pp is not None and pp > 0 and ee is not None and math.isfinite(ee):
            cleaned.append((yy, pp, ee))
    if len(cleaned) < 3:
        return {"best_model": None, "best_r2": None, "models": {}, "sample_count": len(cleaned)}

    base_year = cleaned[0][0]
    t_vals = [float(y - base_year) for y, _, _ in cleaned]
    p_vals = [p for _, p, _ in cleaned]
    e_vals = [e for _, _, e in cleaned]

    design_linear = [[1.0, t, p] for t, p in zip(t_vals, p_vals)]
    design_quadratic = [[1.0, t, t * t, p] for t, p in zip(t_vals, p_vals)]

    # Log model can use negative/zero EPS as target y, but its INPUTS must be positive.
    # t+1 is positive for the fitted history because base_year is the first year (t>=0).
    # price must also be strictly positive. If not, skip only the logarithmic model.
    log_design: list[list[float]] = []
    log_y: list[float] = []
    for t, p, e in zip(t_vals, p_vals, e_vals):
        lt = _safe_log_positive(t + 1.0)
        lp = _safe_log_positive(p)
        if lt is not None and lp is not None:
            log_design.append([1.0, lt, lp])
            log_y.append(e)

    models = {
        "eps_linear_time_price": _fit_design_matrix(design_linear, e_vals),
        "eps_quadratic_time_price": _fit_design_matrix(design_quadratic, e_vals),
        "eps_log_time_log_price": _fit_design_matrix(log_design, log_y) if len(log_design) >= 3 else {"r2": None, "coeffs": None, "fitted": []},
    }
    valid = {k: v for k, v in models.items() if v.get("r2") is not None}
    best_name = max(valid, key=lambda k: valid[k]["r2"]) if valid else None
    best_r2 = valid[best_name]["r2"] if best_name else None
    return {
        "best_model": best_name,
        "best_r2": best_r2,
        "models": models,
        "sample_count": len(cleaned),
        "base_year": base_year,
    }


def _predict_eps_with_best_model(model_payload: dict[str, Any], year: int, price: float | None) -> float | None:
    best = model_payload.get("best_model")
    if not best:
        return None
    model = (model_payload.get("models") or {}).get(best, {})
    coeffs = model.get("coeffs")
    base_year = safe_num(model_payload.get("base_year"), None)
    pp = safe_num(price, None)
    if base_year is None or pp is None or pp <= 0:
        return None
    t = float(int(year) - int(base_year))
    if best == "eps_linear_time_price":
        row = [1.0, t, pp]
    elif best == "eps_quadratic_time_price":
        row = [1.0, t, t * t, pp]
    elif best == "eps_log_time_log_price":
        lt = _safe_log_positive(t + 1.0)
        lp = _safe_log_positive(pp)
        if lt is None or lp is None:
            return None
        row = [1.0, lt, lp]
    else:
        return None
    pred = _predict_from_coeffs(coeffs, row)
    if pred is None:
        return None
    # EPS regression can produce negative predictions for turnaround stocks; keep negative for scoring,
    # but clamp pathological explosions for governance.
    return clamp(pred, -50.0, 500.0)


def _fit_price_forecast_model(annual_price_by_year: dict[int, float]) -> dict[str, Any]:
    rows = sorted((int(y), safe_num(p, None)) for y, p in annual_price_by_year.items())
    rows = [(y, p) for y, p in rows if p is not None and p > 0]
    if len(rows) < 3:
        return {"best_model": None, "best_r2": None, "models": {}, "base_year": None, "sample_count": len(rows)}
    years = [y for y, _ in rows]
    prices = [p for _, p in rows]
    base_year = years[0]
    t_vals = [float(y - base_year) for y in years]
    log_prices = [math.log(max(p, 1e-9)) for p in prices]

    price_log_design: list[list[float]] = []
    price_log_y: list[float] = []
    for t, lp in zip(t_vals, log_prices):
        lt = _safe_log_positive(t + 1.0)
        if lt is not None:
            price_log_design.append([1.0, lt])
            price_log_y.append(lp)

    models = {
        "price_linear_time": _fit_design_matrix([[1.0, t] for t in t_vals], log_prices),
        "price_quadratic_time": _fit_design_matrix([[1.0, t, t * t] for t in t_vals], log_prices),
        "price_log_time": _fit_design_matrix(price_log_design, price_log_y) if len(price_log_design) >= 3 else {"r2": None, "coeffs": None, "fitted": []},
    }
    valid = {k: v for k, v in models.items() if v.get("r2") is not None}
    best_name = max(valid, key=lambda k: valid[k]["r2"]) if valid else None
    best_r2 = valid[best_name]["r2"] if best_name else None
    return {"best_model": best_name, "best_r2": best_r2, "models": models, "base_year": base_year, "sample_count": len(rows)}


def _predict_price_with_best_model(price_model: dict[str, Any], year: int) -> float | None:
    best = price_model.get("best_model")
    if not best:
        return None
    model = (price_model.get("models") or {}).get(best, {})
    coeffs = model.get("coeffs")
    base_year = safe_num(price_model.get("base_year"), None)
    if base_year is None:
        return None
    t = float(int(year) - int(base_year))
    if best == "price_linear_time":
        row = [1.0, t]
    elif best == "price_quadratic_time":
        row = [1.0, t, t * t]
    elif best == "price_log_time":
        lt = _safe_log_positive(t + 1.0)
        if lt is None:
            return None
        row = [1.0, lt]
    else:
        return None
    pred_log = _predict_from_coeffs(coeffs, row)
    if pred_log is None:
        return None
    try:
        return clamp(math.exp(pred_log), 0.01, 100000.0)
    except OverflowError:
        return None


def _predict_price_with_named_model(price_model: dict[str, Any], model_name: str, year: int) -> float | None:
    """Predict price from a specific annual price regression model, not only the best model."""
    model = (price_model.get("models") or {}).get(model_name, {})
    coeffs = model.get("coeffs")
    base_year = safe_num(price_model.get("base_year"), None)
    if coeffs is None or base_year is None:
        return None

    t = float(int(year) - int(base_year))
    if model_name == "price_linear_time":
        row = [1.0, t]
    elif model_name == "price_quadratic_time":
        row = [1.0, t, t * t]
    elif model_name == "price_log_time":
        lt = _safe_log_positive(t + 1.0)
        if lt is None:
            return None
        row = [1.0, lt]
    else:
        return None

    pred_log = _predict_from_coeffs(coeffs, row)
    if pred_log is None:
        return None
    try:
        return clamp(math.exp(pred_log), 0.01, 100000.0)
    except OverflowError:
        return None


def _price_model_forecast_all(price_model: dict[str, Any], years: list[int] | None = None) -> dict[str, Any]:
    """
    Structured annual price regression output for M6.

    This is the formal producer for:
      - M1/M6 annual price model linear / quadratic / log
      - individual model R²
      - model-specific forecast prices

    M6 should read this output instead of inventing model prices.
    """
    if years is None:
        years = [2025, 2026, 2027]

    name_map = {
        "price_linear_time": "linear",
        "price_quadratic_time": "quadratic",
        "price_log_time": "logarithmic",
    }

    models_out: dict[str, Any] = {}
    models = price_model.get("models") or {}
    for raw_name, short_name in name_map.items():
        model = models.get(raw_name, {}) if isinstance(models, dict) else {}
        prices = {
            str(y): round2(_predict_price_with_named_model(price_model, raw_name, y))
            if _predict_price_with_named_model(price_model, raw_name, y) is not None
            else None
            for y in years
        }
        models_out[short_name] = {
            "model_name": raw_name,
            "r2": round2(model.get("r2")) if model.get("r2") is not None else None,
            "coeffs": model.get("coeffs"),
            "prices": prices,
            "available": any(v is not None for v in prices.values()),
        }

    return {
        "best_model": price_model.get("best_model"),
        "best_r2": round2(price_model.get("best_r2")) if price_model.get("best_r2") is not None else None,
        "base_year": price_model.get("base_year"),
        "sample_count": price_model.get("sample_count"),
        "models": models_out,
        "purpose": "annual_price_regression_outputs_for_m6_forecast_debug",
    }


def _linear_fit_predict(y_values: list[float], future_index: int) -> tuple[float | None, float | None]:
    y = [safe_num(v, None) for v in y_values if safe_num(v, None) is not None]
    n = len(y)
    if n < 2:
        return None, None
    x = list(range(n))
    mx = sum(x) / n
    my = sum(y) / n
    den = sum((xi - mx) ** 2 for xi in x)
    if den == 0:
        return None, None
    slope = sum((x[i] - mx) * (y[i] - my) for i in range(n)) / den
    intercept = my - slope * mx
    fitted = [intercept + slope * xi for xi in x]
    ss_tot = sum((yi - my) ** 2 for yi in y)
    ss_res = sum((y[i] - fitted[i]) ** 2 for i in range(n))
    r2 = 1.0 if ss_tot <= 1e-12 else clamp(1.0 - ss_res / ss_tot, 0.0, 1.0)
    return intercept + slope * future_index, r2


def _score_future_profit(eps_2026: float | None) -> float:
    e = safe_num(eps_2026, None)
    if e is None or e <= 0:
        return 0.0
    return clamp(5.0 + math.log(max(e, 0.01)) * 1.8, 0.0, 10.0)


def _weighted_forward_growth(eps_2025: float | None, eps_2026: float | None, eps_2027: float | None) -> dict[str, float | None]:
    """
    Final M1 Competitive EPS growth definition.

    growth_2026_vs_2025 = eps_2026 / eps_2025 - 1
    growth_2027_vs_2026 = eps_2027 / eps_2026 - 1

    weighted_forward_growth =
        0.55 * growth_2026_vs_2025 + 0.45 * growth_2027_vs_2026

    Governance:
      - Requires positive eps_2025 and eps_2026.
      - Requires eps_2027 to use the full two-stage formula.
      - If eps_2027 is missing but eps_2025/2026 are valid, fallback to 2026 vs 2025.
    """
    e25 = safe_num(eps_2025, None)
    e26 = safe_num(eps_2026, None)
    e27 = safe_num(eps_2027, None)

    if e25 is None or e26 is None:
        return {
            "growth_2026_vs_2025": None,
            "growth_2027_vs_2026": None,
            "weighted_forward_growth": None,
            "growth_formula": "missing_eps_2025_or_eps_2026",
            "growth_type": "missing",
        }
    if e25 <= 0 or e26 <= 0:
        return {
            "growth_2026_vs_2025": None,
            "growth_2027_vs_2026": None,
            "weighted_forward_growth": None,
            "growth_formula": "nonpositive_eps_growth_not_computed",
            "growth_type": "recovery_or_loss",
        }

    g1 = e26 / e25 - 1.0
    g2 = None
    if e27 is not None and e27 > 0:
        g2 = e27 / e26 - 1.0
        g = 0.55 * g1 + 0.45 * g2
        formula = "0.55*(eps_2026/eps_2025-1)+0.45*(eps_2027/eps_2026-1)"
    else:
        g = g1
        formula = "fallback_eps_2026_vs_2025_only"

    return {
        "growth_2026_vs_2025": g1,
        "growth_2027_vs_2026": g2,
        "weighted_forward_growth": g,
        "growth_formula": formula,
        "growth_type": "normal",
    }


def _growth_to_score(g: float | None) -> float:
    """
    Convert weighted forward EPS growth to 0-10 score using linear interpolation.

    Points are the final agreed business curve:
      <=0%   => 2.0
       5%    => 4.0
      10%    => 6.0
      15%    => 7.0
      20%    => 8.0
      25%    => 9.0
      30%    => 9.5
      50%    => 9.8
     100%+   => 10.0
    """
    if g is None or not math.isfinite(safe_num(g, 0.0)):
        return 5.999

    points = [
        (0.00, 2.0),
        (0.05, 4.0),
        (0.10, 6.0),
        (0.15, 7.0),
        (0.20, 8.0),
        (0.25, 9.0),
        (0.30, 9.5),
        (0.50, 9.8),
        (1.00, 10.0),
    ]

    if g <= 0.0:
        return 2.0
    if g >= points[-1][0]:
        return 10.0

    for i in range(1, len(points)):
        x0, y0 = points[i - 1]
        x1, y1 = points[i]
        if x0 <= g <= x1:
            t = (g - x0) / (x1 - x0)
            return clamp(y0 + t * (y1 - y0), 0.0, 10.0)

    return 5.999


def _score_growth(eps_2025: float | None, eps_2026: float | None, eps_2027: float | None) -> float:
    growth_payload = _weighted_forward_growth(eps_2025, eps_2026, eps_2027)
    return _growth_to_score(safe_num(growth_payload.get("weighted_forward_growth"), None))


def _eps_yoy_stability_score(eps_values: list[float]) -> float:
    """
    EPS YoY stability score for M1 Competitive middle_consistency.

    Meaning:
      - Measures whether annual EPS growth is stable, not whether growth is high.
      - Growth level is already captured by future_growth_score.

    Formula:
      yoy[i] = (eps[i] - eps[i-1]) / abs(eps[i-1])
      yoy is clipped to [-2, +2] to avoid small-base explosions.
      volatility = population std(yoy)
      stability = 10 * (1 - volatility / 1.0), clipped to 0..10

    Governance:
      - <5 EPS observations: neutral fallback 6.0
      - Any non-positive EPS: halve stability because the earnings line is not clean.
    """
    vals = [safe_num(v, None) for v in eps_values if safe_num(v, None) is not None and math.isfinite(safe_num(v, 0.0))]
    if len(vals) < 5:
        return 6.0

    yoy: list[float] = []
    for i in range(1, len(vals)):
        prev = vals[i - 1]
        cur = vals[i]
        if prev is None or abs(prev) <= 1e-9:
            continue
        g = (cur - prev) / abs(prev)
        yoy.append(clamp(g, -2.0, 2.0))

    if not yoy:
        return 6.0

    mean_yoy = sum(yoy) / len(yoy)
    volatility = (sum((g - mean_yoy) ** 2 for g in yoy) / len(yoy)) ** 0.5
    stability = clamp(10.0 * (1.0 - volatility / 1.0), 0.0, 10.0)

    if any(v <= 0 for v in vals):
        stability *= 0.5

    return clamp(stability, 0.0, 10.0)


def _score_consistency(eps_values: list[float], eps_model_r2: float | None = None) -> float:
    """
    Middle Consistency for M1 Competitive / CC score.

    This must not be a fixed fallback. For stocks with enough EPS history:
      consistency = 0.70 * EPS regression R² * 10
                  + 0.30 * EPS YoY stability score

    For ETF / no EPS / insufficient EPS history, keep neutral 6.0.
    """
    vals = [safe_num(v, None) for v in eps_values if safe_num(v, None) is not None and math.isfinite(safe_num(v, 0.0))]
    if len(vals) < 5:
        return 6.0

    r2v = safe_num(eps_model_r2, None)
    if r2v is None:
        # Fallback: if caller did not pass the chosen EPS regression R², compute a simple internal EPS trend fit.
        years = list(range(len(vals)))
        model = _fit_eps_regression_models(years, [float(i + 1) for i in years], vals)
        r2v = safe_num(model.get("best_r2"), None)

    if r2v is None:
        return 6.0

    r2_score = clamp(r2v, 0.0, 1.0) * 10.0
    stability_score = _eps_yoy_stability_score(vals)
    negatives_penalty = 1.0 if any(v <= 0 for v in vals) else 0.0

    return clamp(0.70 * r2_score + 0.30 * stability_score - negatives_penalty, 0.0, 10.0)


def _score_quality_from_eps_regression(
    eps_values: list[float],
    eps_model_r2: float | None,
    price_model_r2: float | None,
    forward_map: dict[int, dict[str, Any]],
    flags: list[Any],
) -> float:
    """Quality is EPS explainability/data quality, not PE R²."""
    vals = [safe_num(v, None) for v in eps_values if safe_num(v, None) is not None]
    eps_r2 = safe_num(eps_model_r2, None)
    if eps_r2 is None:
        eps_r2 = 0.60 if len(vals) >= 3 else 0.5999
    price_r2 = safe_num(price_model_r2, None)
    if price_r2 is None:
        price_r2 = 0.50
    data_coverage = clamp(len(vals) / 6.0, 0.0, 1.0)
    fwd_available = 0.0
    for yr in [2025, 2026, 2027]:
        if safe_num((forward_map.get(yr) or {}).get("eps"), None) is not None:
            fwd_available += 1.0
    fwd_score = fwd_available / 3.0
    score = (
        0.55 * eps_r2 * 10.0
        + 0.15 * price_r2 * 10.0
        + 0.15 * data_coverage * 10.0
        + 0.15 * fwd_score * 10.0
    )
    flag_set = {str(x).lower() for x in flags} if isinstance(flags, list) else set()
    if any(v <= 0 for v in vals):
        score -= 1.0
    if "volatile" in flag_set or "high_volatility" in flag_set:
        score -= 1.0
    if "cyclical" in flag_set:
        score -= 0.5
    if "adjusted_eps" in flag_set:
        score -= 0.5
    return clamp(score, 0.0, 10.0)


def _median(values: list[float]) -> float | None:
    arr = sorted([safe_num(v, None) for v in values if safe_num(v, None) is not None and math.isfinite(safe_num(v, 0.0))])
    if not arr:
        return None
    n = len(arr)
    mid = n // 2
    if n % 2 == 1:
        return arr[mid]
    return (arr[mid - 1] + arr[mid]) / 2.0


def _eps_cagr(eps_values: list[float]) -> float | None:
    vals = [safe_num(v, None) for v in eps_values if safe_num(v, None) is not None]
    positives = [v for v in vals if v is not None and v > 0]
    if len(positives) < 2:
        return None
    first = positives[0]
    last = positives[-1]
    years = max(1, len(positives) - 1)
    try:
        return clamp((last / first) ** (1.0 / years) - 1.0, -0.80, 1.50)
    except Exception:
        return None


def build_global_eps_model(symbols: list[str], bundle: InputBundle) -> dict[str, Any]:
    """
    Build global M1 Competitive EPS regression model for stocks without EPS history.

    This follows the original CC requirement:
      known stocks: annual_avg_price + fiscal_year + EPS -> train EPS regression
      missing stocks: annual/future price + year -> impute EPS

    It does not alter M7 valuation/trend/structure/money scores.
    """
    eps_rows = _eps_data_rows()
    samples_by_cat: dict[str, dict[str, list[Any]]] = {}
    all_years: list[int] = []
    all_prices: list[float] = []
    all_eps: list[float] = []
    global_growths: list[float] = []

    for raw_sym in symbols:
        sym = normalize_symbol(raw_sym)
        eps_info = eps_rows.get(sym, {})
        eps_hist = _extract_eps_history(eps_info)
        if len(eps_hist) < 3:
            continue
        feature = build_feature_row(sym, bundle)
        category_sub = str(feature.get("valuation", {}).get("category_sub") or "UNKNOWN")
        annual_price_by_year = _annual_avg_price_by_year_from_weekly(feature.get("weekly_prices", []))
        years: list[int] = []
        prices: list[float] = []
        eps_values: list[float] = []
        for r in eps_hist:
            yr = int(r["fiscal_year"])
            p = safe_num(annual_price_by_year.get(yr), None)
            e = safe_num(r.get("eps"), None)
            if p is not None and p > 0 and e is not None and math.isfinite(e):
                years.append(yr)
                prices.append(p)
                eps_values.append(e)
        if len(eps_values) < 3:
            continue
        all_years.extend(years)
        all_prices.extend(prices)
        all_eps.extend(eps_values)
        bucket = samples_by_cat.setdefault(category_sub, {"years": [], "prices": [], "eps": [], "growth": []})
        bucket["years"].extend(years)
        bucket["prices"].extend(prices)
        bucket["eps"].extend(eps_values)
        g = _eps_cagr(eps_values)
        if g is not None:
            global_growths.append(g)
            bucket["growth"].append(g)

    global_model = _fit_eps_regression_models(all_years, all_prices, all_eps)
    category_models: dict[str, dict[str, Any]] = {}
    for cat, s in samples_by_cat.items():
        model = _fit_eps_regression_models(s["years"], s["prices"], s["eps"])
        # Use category model only if it has enough observations and a valid R².
        if safe_num(model.get("sample_count"), 0) >= 8 and model.get("best_model"):
            category_models[cat] = {
                "model": model,
                "sample_count": model.get("sample_count"),
                "growth": _median(s.get("growth", [])),
            }

    return {
        "global_model": global_model,
        "global_sample_count": global_model.get("sample_count", 0),
        "global_growth": _median(global_growths) or 0.08,
        "category_models": category_models,
    }


def _predict_eps_from_global_model(
    feature: dict[str, Any],
    annual_price_by_year: dict[int, float],
    price_model: dict[str, Any],
    global_eps_model: dict[str, Any] | None,
) -> dict[str, Any]:
    model_pack = global_eps_model or {}
    valuation = feature.get("valuation", {}) if isinstance(feature.get("valuation"), dict) else {}
    category_sub = str(valuation.get("category_sub") or "UNKNOWN")
    cat = (model_pack.get("category_models") or {}).get(category_sub)
    if isinstance(cat, dict) and isinstance(cat.get("model"), dict):
        model_payload = cat.get("model")
        source = "category_eps_regression_model"
        sample_count = safe_num(cat.get("sample_count"), 0)
        growth = safe_num(cat.get("growth"), safe_num(model_pack.get("global_growth"), 0.08))
    else:
        model_payload = model_pack.get("global_model", {}) if isinstance(model_pack, dict) else {}
        source = "global_eps_regression_model"
        sample_count = safe_num(model_pack.get("global_sample_count"), 0) if isinstance(model_pack, dict) else 0
        growth = safe_num(model_pack.get("global_growth"), 0.08) if isinstance(model_pack, dict) else 0.08

    price_2025 = annual_price_by_year.get(2025) or _predict_price_with_best_model(price_model, 2025)
    price_2026 = _predict_price_with_best_model(price_model, 2026) or price_2025
    price_2027 = _predict_price_with_best_model(price_model, 2027) or price_2026

    eps_2025 = _predict_eps_with_best_model(model_payload, 2025, price_2025)
    eps_2026 = _predict_eps_with_best_model(model_payload, 2026, price_2026)
    eps_2027 = _predict_eps_with_best_model(model_payload, 2027, price_2027)
    if eps_2027 is None and eps_2026 is not None:
        eps_2027 = eps_2026 * (1.0 + clamp(growth, -0.50, 0.80))

    return {
        "eps_2025": eps_2025,
        "eps_2026": eps_2026,
        "eps_2027": eps_2027,
        "price_2025": price_2025,
        "price_2026": price_2026,
        "price_2027": price_2027,
        "source": source,
        "sample_count": int(sample_count or 0),
        "r2": model_payload.get("best_r2") if isinstance(model_payload, dict) else None,
        "best_model": model_payload.get("best_model") if isinstance(model_payload, dict) else None,
    }



def _score_linear(value: Any, lo: float, hi: float, fallback: float | None = None) -> float | None:
    x = safe_num(value, None)
    if x is None:
        return fallback
    if hi <= lo:
        return fallback
    return clamp((x - lo) / (hi - lo) * 10.0, 0.0, 10.0)


def _score_inverse(value: Any, lo: float, hi: float, fallback: float | None = None) -> float | None:
    x = safe_num(value, None)
    if x is None:
        return fallback
    if hi <= lo:
        return fallback
    return clamp((hi - x) / (hi - lo) * 10.0, 0.0, 10.0)


def _weighted_available(parts: list[tuple[float, float | None]]) -> float | None:
    usable = [(w, v) for w, v in parts if v is not None and math.isfinite(v)]
    if not usable:
        return None
    sw = sum(w for w, _ in usable)
    if sw <= 0:
        return None
    return sum(w * v for w, v in usable) / sw


def _has_runtime_fundamental(rt: dict[str, Any]) -> bool:
    if not isinstance(rt, dict):
        return False
    quote_type = str(rt.get("quote_type") or "").upper()
    if quote_type == "ETF":
        return False
    core_fields = [
        rt.get("trailing_eps"),
        rt.get("forward_eps"),
        rt.get("forward_pe"),
        rt.get("revenue_growth"),
        rt.get("profit_margins"),
        rt.get("gross_margins"),
        rt.get("operating_margins"),
        rt.get("return_on_equity"),
        rt.get("free_cashflow"),
        rt.get("operating_cashflow"),
        rt.get("market_cap"),
    ]
    return sum(1 for v in core_fields if safe_num(v, None) is not None) >= 4



def derive_cc_rank(eps_status: str | None, eps_sample_count: int | float | None, forward_count: int | float | None, is_etf_or_skip: bool = False) -> dict[str, Any]:
    """
    Rank A/B/C/D for M1 Dashboard 1.5.

    Final definition:
      A = normal EPS mode: structured EPS history + forward EPS are sufficient.
      B = partial EPS mode: structured EPS exists but is not complete enough for A.
      C = market_runtime fundamental fallback.
      D = global / ETF / proxy / neutral fallback.

    Rank is a confidence/source grade for CC, not an investment recommendation.
    """
    status = str(eps_status or "").strip()
    sample = int(safe_num(eps_sample_count, 0) or 0)
    fwd = int(safe_num(forward_count, 0) or 0)

    if is_etf_or_skip or status in {"etf_global_proxy", "global_eps_regression_imputed", "neutral_fallback_no_eps_regression_model"}:
        rank = "D"
        label = "Global / ETF / Proxy"
        detail = "global_or_etf_or_neutral_fallback"
        confidence = "low"
    elif status == "runtime_fundamental_fallback":
        rank = "C"
        label = "Runtime Fundamental Fallback"
        detail = "market_runtime_fundamentals_used_when_structured_eps_is_incomplete"
        confidence = "medium"
    elif status == "actual_history_plus_eps_regression" and sample >= 3 and fwd >= 2:
        rank = "A"
        label = "Full EPS"
        detail = "eps_history_regression_plus_forward_eps"
        confidence = "high"
    elif sample >= 1 or fwd >= 1 or status in {"actual_history_plus_eps_regression", "eps_regression_partial"}:
        rank = "B"
        label = "Partial EPS"
        detail = "partial_structured_eps_or_forward_eps"
        confidence = "medium"
    else:
        rank = "D"
        label = "Global / ETF / Proxy"
        detail = "no_structured_eps_and_no_runtime_fundamental_fallback"
        confidence = "low"

    return {
        "cc_rank": rank,
        "eps_coverage_rank": rank,
        "cc_rank_label": label,
        "cc_rank_detail": detail,
        "cc_rank_confidence_floor": confidence,
    }

def compute_runtime_cc_score(rt: dict[str, Any]) -> dict[str, Any] | None:
    """
    Runtime fundamental fallback for companies without structured EPS history/forward series.

    Policy:
      - Use only when eps_history_ai is not sufficient.
      - Do not replace structured EPS engine when history EPS exists.
      - Do not use for ETFs.
    """
    if not _has_runtime_fundamental(rt):
        return None

    trailing_eps = safe_num(rt.get("trailing_eps"), None)
    forward_eps = safe_num(rt.get("forward_eps"), None)
    forward_pe = safe_num(rt.get("forward_pe"), None)
    trailing_pe = safe_num(rt.get("trailing_pe"), None)
    earnings_growth = safe_num(rt.get("earnings_growth"), None)
    revenue_growth = safe_num(rt.get("revenue_growth"), None)
    market_cap = safe_num(rt.get("market_cap"), None)
    profit_margins = safe_num(rt.get("profit_margins"), None)
    gross_margins = safe_num(rt.get("gross_margins"), None)
    operating_margins = safe_num(rt.get("operating_margins"), None)
    return_on_equity = safe_num(rt.get("return_on_equity"), None)
    debt_to_equity = safe_num(rt.get("debt_to_equity"), None)
    free_cashflow = safe_num(rt.get("free_cashflow"), None)
    operating_cashflow = safe_num(rt.get("operating_cashflow"), None)

    # 1) Profitability: margins + ROE. Bounds are intentionally broad and cross-sector friendly.
    profitability = _weighted_available([
        (0.30, _score_linear(profit_margins, 0.00, 0.35)),
        (0.25, _score_linear(gross_margins, 0.20, 0.75)),
        (0.25, _score_linear(operating_margins, 0.00, 0.35)),
        (0.20, _score_linear(return_on_equity, 0.00, 0.60)),
    ])

    # 2) Forward EPS value: positive forward EPS + reasonable forward PE + EPS improvement.
    forward_profit_score = _score_future_profit(forward_eps) if forward_eps is not None else None
    forward_pe_score = _score_inverse(forward_pe, 5.0, 60.0)
    implied_eps_growth = _safe_eps_growth(forward_eps, trailing_eps)
    implied_eps_growth_score = _growth_to_score(implied_eps_growth)
    forward_eps_value = _weighted_available([
        (0.40, forward_profit_score),
        (0.35, forward_pe_score),
        (0.25, implied_eps_growth_score),
    ])

    # 3) Growth: earnings growth if available, otherwise revenue growth carries the layer.
    growth = _weighted_available([
        (0.55, _growth_to_score(earnings_growth)),
        (0.45, _growth_to_score(revenue_growth)),
    ])

    # 4) Cashflow: FCF/market cap and OCF/market cap. Negative FCF is allowed to score low.
    fcf_yield = (free_cashflow / market_cap) if free_cashflow is not None and market_cap and market_cap > 0 else None
    ocf_yield = (operating_cashflow / market_cap) if operating_cashflow is not None and market_cap and market_cap > 0 else None
    cashflow = _weighted_available([
        (0.55, _score_linear(fcf_yield, -0.02, 0.08)),
        (0.45, _score_linear(ocf_yield, 0.00, 0.12)),
    ])

    # 5) Balance sheet: lower debt-to-equity is better. If unavailable, keep neutral.
    balance_sheet = _score_inverse(debt_to_equity, 0.0, 250.0, fallback=5.999)

    component_parts = [
        (0.30, profitability),
        (0.25, forward_eps_value),
        (0.20, growth),
        (0.15, cashflow),
        (0.10, balance_sheet),
    ]
    cc = _weighted_available(component_parts)
    if cc is None:
        return None
    cc = clamp(cc, 0.0, 10.0)

    coverage_fields = [
        trailing_eps, forward_eps, forward_pe, earnings_growth, revenue_growth,
        profit_margins, gross_margins, operating_margins, return_on_equity,
        debt_to_equity, free_cashflow, operating_cashflow, market_cap,
    ]
    coverage_count = sum(1 for v in coverage_fields if v is not None)
    confidence = "medium" if coverage_count >= 8 else "low"

    return {
        "cc_score": round2(cc),
        "runtime_cc_score": round2(cc),
        "runtime_cc_breakdown": {
            "profitability": round2(profitability) if profitability is not None else None,
            "forward_eps_value": round2(forward_eps_value) if forward_eps_value is not None else None,
            "growth": round2(growth) if growth is not None else None,
            "cashflow": round2(cashflow) if cashflow is not None else None,
            "balance_sheet": round2(balance_sheet) if balance_sheet is not None else None,
            "fcf_yield": round(fcf_yield, 4) if fcf_yield is not None else None,
            "ocf_yield": round(ocf_yield, 4) if ocf_yield is not None else None,
            "implied_eps_growth": round(implied_eps_growth, 4) if implied_eps_growth is not None else None,
        },
        "runtime_fundamental_fields_used": coverage_count,
        "runtime_fundamental_source": rt.get("fundamental_source") or "market_runtime",
        "runtime_fundamental_note": rt.get("fundamental_note"),
        "confidence": confidence,
    }

def compute_eps_engine_v26(feature: dict[str, Any], trend: dict[str, Any] | None = None, structure: dict[str, Any] | None = None, global_eps_model: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    M1 Competitive CC Engine - regression version.

    This intentionally replaces the prior PE-driven CC logic.
    It follows the original agreed requirement:
      1) weekly_prices -> annual average prices
      2) annual average prices + fiscal-year EPS -> 3 EPS regressions
      3) select best R² model
      4) predict EPS 2025/2026/2027
      5) if no EPS history, use the global EPS regression model.

    M7 valuation/trend/structure/money scores remain untouched.
    """
    symbol = normalize_symbol(feature.get("symbol"))
    eps_info = _eps_data_rows().get(symbol, {})
    valuation = feature.get("valuation", {}) if isinstance(feature.get("valuation"), dict) else {}
    category_sub = str(valuation.get("category_sub") or "")
    is_etf_or_skip = "ETF" in category_sub.upper() or bool(eps_info.get("skip_eps"))
    runtime_fundamentals = feature.get("runtime_fundamentals", {}) if isinstance(feature.get("runtime_fundamentals"), dict) else {}
    has_runtime_fundamental = _has_runtime_fundamental(runtime_fundamentals)

    weekly_prices = feature.get("weekly_prices", []) if isinstance(feature.get("weekly_prices"), list) else []
    annual_price_by_year = _annual_avg_price_by_year_from_weekly(weekly_prices, latest_complete_year=2025)
    price_model = _fit_price_forecast_model(annual_price_by_year)
    eps_history_rows = _extract_eps_history(eps_info)
    forward_map = _extract_forward_eps(eps_info)
    quality_flags = eps_info.get("quality_flag", []) if isinstance(eps_info, dict) else []

    years: list[int] = []
    prices: list[float] = []
    eps_values: list[float] = []
    for r in eps_history_rows:
        yr = int(r["fiscal_year"])
        p = safe_num(annual_price_by_year.get(yr), None)
        e = safe_num(r.get("eps"), None)
        if p is not None and p > 0 and e is not None and math.isfinite(e):
            years.append(yr)
            prices.append(p)
            eps_values.append(e)

    eps_model = _fit_eps_regression_models(years, prices, eps_values) if len(eps_values) >= 3 else {
        "best_model": None,
        "best_r2": None,
        "models": {},
        "sample_count": len(eps_values),
    }

    price_2025 = annual_price_by_year.get(2025) or _predict_price_with_best_model(price_model, 2025)
    price_2026 = _predict_price_with_best_model(price_model, 2026) or price_2025
    price_2027 = _predict_price_with_best_model(price_model, 2027) or price_2026

    model_eps_2025 = _predict_eps_with_best_model(eps_model, 2025, price_2025)
    model_eps_2026 = _predict_eps_with_best_model(eps_model, 2026, price_2026)
    model_eps_2027 = _predict_eps_with_best_model(eps_model, 2027, price_2027)

    global_projection = None
    # Layer order:
    #   1) structured EPS history/forward series
    #   2) market_runtime fundamentals fallback
    #   3) global/category EPS regression fallback
    # If there is no structured EPS history but runtime fundamentals are available, avoid global projection.
    allow_global_projection = not (len(eps_values) < 3 and has_runtime_fundamental and not is_etf_or_skip)
    if allow_global_projection and (model_eps_2026 is None or model_eps_2027 is None or is_etf_or_skip) and global_eps_model:
        global_projection = _predict_eps_from_global_model(feature, annual_price_by_year, price_model, global_eps_model)
        if model_eps_2025 is None or is_etf_or_skip:
            model_eps_2025 = global_projection.get("eps_2025")
            price_2025 = global_projection.get("price_2025")
        if model_eps_2026 is None or is_etf_or_skip:
            model_eps_2026 = global_projection.get("eps_2026")
            price_2026 = global_projection.get("price_2026")
        if model_eps_2027 is None or is_etf_or_skip:
            model_eps_2027 = global_projection.get("eps_2027")
            price_2027 = global_projection.get("price_2027")

    analyst_2025 = forward_map.get(2025, {}).get("eps")
    analyst_2026 = forward_map.get(2026, {}).get("eps")
    analyst_2027 = forward_map.get(2027, {}).get("eps")
    analyst_count_2026 = forward_map.get(2026, {}).get("analyst_count")
    analyst_count_2027 = forward_map.get(2027, {}).get("analyst_count")

    def blend_eps(analyst_eps: float | None, model_eps: float | None, analyst_count: float | None) -> tuple[float | None, str]:
        ae = safe_num(analyst_eps, None)
        me = safe_num(model_eps, None)
        ac = safe_num(analyst_count, None)
        if ae is not None and ae > 0 and ac is not None and ac >= 5 and me is not None and me > 0:
            return 0.65 * ae + 0.35 * me, "analyst_model_blend"
        if ae is not None and ae > 0 and ac is not None and ac >= 5:
            return ae, "analyst_only"
        if ae is not None and ae > 0 and ac is None and me is not None and me > 0:
            return 0.50 * ae + 0.50 * me, "forward_provided_no_count_blend"
        if me is not None and me > 0:
            return me, "model_only"
        if ae is not None and ae > 0:
            return ae, "forward_provided_low_count"
        return None, "missing"

    eps_2025 = analyst_2025 if safe_num(analyst_2025, None) is not None else model_eps_2025
    eps_2026, src_2026 = blend_eps(analyst_2026, model_eps_2026, analyst_count_2026)
    eps_2027, src_2027 = blend_eps(analyst_2027, model_eps_2027, analyst_count_2027)

    has_history = len(eps_values) >= 3
    has_model = eps_2026 is not None and eps_2027 is not None
    warnings: list[str] = []
    if not has_history:
        warnings.append("eps_history_less_than_3")
    if len(annual_price_by_year) < 3:
        warnings.append("annual_price_history_less_than_3")
    if global_projection is not None:
        warnings.append("global_eps_regression_model_used")
    if is_etf_or_skip:
        warnings.append("etf_or_skip_eps_global_proxy_not_company_eps")
    if src_2026 in {"forward_provided_low_count", "missing"} or src_2027 in {"forward_provided_low_count", "missing"}:
        warnings.append("forward_eps_low_confidence_or_missing")

    eps_yoy_stability_score = _eps_yoy_stability_score(eps_values)
    consistency_score = _score_consistency(eps_values, safe_num(eps_model.get("best_r2"), None))
    quality_score = _score_quality_from_eps_regression(
        eps_values,
        safe_num(eps_model.get("best_r2"), None),
        safe_num(price_model.get("best_r2"), None),
        forward_map,
        quality_flags,
    )

    growth_payload: dict[str, Any] = {}
    runtime_cc_payload = None
    if (not has_history) and has_runtime_fundamental and not is_etf_or_skip:
        runtime_cc_payload = compute_runtime_cc_score(runtime_fundamentals)

    if runtime_cc_payload is not None:
        cc_score = safe_num(runtime_cc_payload.get("cc_score"), 5.999)
        future_profit_score = safe_num(runtime_cc_payload.get("runtime_cc_breakdown", {}).get("forward_eps_value"), 5.999)
        growth_score = safe_num(runtime_cc_payload.get("runtime_cc_breakdown", {}).get("growth"), 5.999)
        eps_status = "runtime_fundamental_fallback"
        eps_source = "market_runtime_fundamentals"
        confidence = runtime_cc_payload.get("confidence") or "medium"
        warnings.append("runtime_fundamental_fallback_used")
    elif not has_model:
        cc_score = 5.999
        future_profit_score = 5.999
        growth_score = 5.999
        eps_status = "neutral_fallback_no_eps_regression_model"
        eps_source = "neutral_fallback"
        confidence = "low"
    else:
        future_profit_score = _score_future_profit(eps_2026)
        growth_payload = _weighted_forward_growth(eps_2025, eps_2026, eps_2027)
        growth_score = _growth_to_score(safe_num(growth_payload.get("weighted_forward_growth"), None))
        cc_score = 0.30 * future_profit_score + 0.30 * growth_score + 0.20 * consistency_score + 0.20 * quality_score
        cc_score = clamp(cc_score, 0.0, 10.0)
        if has_history and eps_model.get("best_model"):
            eps_status = "actual_history_plus_eps_regression"
            confidence = "high" if safe_num(eps_model.get("best_r2"), 0.0) >= 0.70 else "medium"
        elif global_projection is not None:
            eps_status = "etf_global_proxy" if is_etf_or_skip else "global_eps_regression_imputed"
            confidence = "medium" if safe_num(global_projection.get("sample_count"), 0) >= 8 else "low"
        else:
            eps_status = "eps_regression_partial"
            confidence = "medium"
        eps_source = f"2026:{src_2026};2027:{src_2027}"
        if global_projection is not None:
            eps_source += f";global:{global_projection.get('source')}"

    forward_count = sum(1 for v in [eps_2025, eps_2026, eps_2027] if safe_num(v, None) is not None)
    rank_payload = derive_cc_rank(
        eps_status,
        eps_model.get("sample_count"),
        forward_count,
        is_etf_or_skip=is_etf_or_skip,
    )

    return {
        "cc_score": round2(cc_score),
        "cc_rank": rank_payload.get("cc_rank"),
        "eps_coverage_rank": rank_payload.get("eps_coverage_rank"),
        "cc_rank_label": rank_payload.get("cc_rank_label"),
        "cc_rank_detail": rank_payload.get("cc_rank_detail"),
        "cc_rank_confidence_floor": rank_payload.get("cc_rank_confidence_floor"),
        "cc_source": eps_status,
        "cc_confidence": confidence,
        "cc_method": "eps_engine" if eps_status == "actual_history_plus_eps_regression" else ("runtime_fundamental" if eps_status == "runtime_fundamental_fallback" else "global_or_neutral_fallback"),
        "runtime_cc_score": runtime_cc_payload.get("runtime_cc_score") if isinstance(runtime_cc_payload, dict) else None,
        "runtime_cc_breakdown": runtime_cc_payload.get("runtime_cc_breakdown") if isinstance(runtime_cc_payload, dict) else None,
        "runtime_fundamental_fields_used": runtime_cc_payload.get("runtime_fundamental_fields_used") if isinstance(runtime_cc_payload, dict) else None,
        "runtime_fundamental_source": runtime_cc_payload.get("runtime_fundamental_source") if isinstance(runtime_cc_payload, dict) else None,
        "runtime_fundamental_note": runtime_cc_payload.get("runtime_fundamental_note") if isinstance(runtime_cc_payload, dict) else None,
        "future_profit_score": round2(future_profit_score),
        "future_growth_score": round2(growth_score),
        "future_growth_rate": round(safe_num(growth_payload.get("weighted_forward_growth"), 0.0), 4) if has_model and growth_payload.get("weighted_forward_growth") is not None else None,
        "growth_2026_vs_2025": round(safe_num(growth_payload.get("growth_2026_vs_2025"), 0.0), 4) if has_model and growth_payload.get("growth_2026_vs_2025") is not None else None,
        "growth_2027_vs_2026": round(safe_num(growth_payload.get("growth_2027_vs_2026"), 0.0), 4) if has_model and growth_payload.get("growth_2027_vs_2026") is not None else None,
        "future_growth_formula": growth_payload.get("growth_formula") if has_model else None,
        "future_growth_type": growth_payload.get("growth_type") if has_model else None,
        "middle_consistency_score": round2(consistency_score),
        "eps_yoy_stability_score": round2(eps_yoy_stability_score),
        "quality_score": round2(quality_score),
        "future_profit": round2(future_profit_score),
        "future_growth": round2(growth_score),
        "consistency": round2(consistency_score),
        "eps_yoy_stability": round2(eps_yoy_stability_score),
        "quality": round2(quality_score),
        "eps_2025": round2(eps_2025) if eps_2025 is not None else None,
        "eps_2026": round2(eps_2026) if eps_2026 is not None else None,
        "eps_2027": round2(eps_2027) if eps_2027 is not None else None,
        "model_eps_2025": round2(model_eps_2025) if model_eps_2025 is not None else None,
        "model_eps_2026": round2(model_eps_2026) if model_eps_2026 is not None else None,
        "model_eps_2027": round2(model_eps_2027) if model_eps_2027 is not None else None,
        "analyst_eps_2026": round2(analyst_2026) if analyst_2026 is not None else None,
        "analyst_eps_2027": round2(analyst_2027) if analyst_2027 is not None else None,
        "analyst_count_2026": analyst_count_2026,
        "analyst_count_2027": analyst_count_2027,
        "eps_regression_model": eps_model.get("best_model"),
        "eps_regression_r2": round2(eps_model.get("best_r2")) if eps_model.get("best_r2") is not None else None,
        "eps_regression_sample_count": eps_model.get("sample_count"),
        "price_regression_model": price_model.get("best_model"),
        "price_regression_r2": round2(price_model.get("best_r2")) if price_model.get("best_r2") is not None else None,
        "annual_price_alignment_method": "52_week_bucket_latest_complete_year_2025",
        "annual_price_years_used": years,
        "price_model_2025": round2(price_2025) if price_2025 is not None else None,
        "price_model_2026": round2(price_2026) if price_2026 is not None else None,
        "price_model_2027": round2(price_2027) if price_2027 is not None else None,
        # Legacy-compatible fields kept but no longer drive CC quality.
        "pe_model_2026": None,
        "pe_model_2027": None,
        "pe_prior": None,
        "pe_history_r2": None,
        "global_model_source": global_projection.get("source") if global_projection is not None else None,
        "global_model_sample_count": global_projection.get("sample_count") if global_projection is not None else None,
        "global_model_r2": round2(global_projection.get("r2")) if global_projection is not None and global_projection.get("r2") is not None else None,
        "eps_status": eps_status,
        "eps_source": eps_source,
        "confidence": confidence,
        "warnings": warnings,
    }

def compute_overheat_penalty(timing_raw: float) -> float:
    pts = curve_params["overheat_penalty_curve"]["snapshot"]["points"]
    return max(0.0, piecewise(pts, timing_raw))


def apply_regime_multiplier(name: str, value: float) -> float:
    regime = regime_params["default_regime"]
    mult = regime_params["overlay_multipliers"].get(regime, {}).get(name, 1.0)
    return safe_num(value, 0.0) * safe_num(mult, 1.0)


# -------------------------
# Scenario composition
# -------------------------
def compose_score(scenario: str, comps: dict[str, float], penalties: dict[str, float], event_score: float) -> tuple[float, dict[str, Any]]:
    sp = scenario_params[scenario]

    fw = sp["factor_weights"]
    ew = sp["event_blend_weights"]
    pw = sp["penalty_weights"]

    adjusted_components = {
        k: apply_regime_multiplier(k, comps.get(k, 0.0))
        for k in fw.keys()
    }

    base_10 = sum(fw[k] * adjusted_components.get(k, 0.0) for k in fw.keys())

    event_blend_10 = (
        ew["event_score"] * clamp(event_score, 0.0, 10.0)
        + ew["market_acceptance"] * adjusted_components.get("market_acceptance", 0.0)
    )

    penalty_10 = (
        pw["exposure"] * apply_regime_multiplier("exposure_penalty", penalties.get("exposure_penalty", 0.0))
        + pw["overheat"] * apply_regime_multiplier("overheat_penalty", penalties.get("overheat_penalty", 0.0))
    )

    score_10 = base_10 + 0.20 * event_blend_10 - penalty_10
    score_100 = clamp(score_10 * 10.0, module_params["M7"]["score_floor"], module_params["M7"]["score_cap"])

    debug = {
        "base_10": round2(base_10),
        "event_blend_10": round2(event_blend_10),
        "penalty_10": round2(penalty_10),
        "components_10": {k: round2(v) for k, v in adjusted_components.items()},
    }
    return score_100, debug


def compute_fcn_score(comps: dict[str, float], penalties: dict[str, float], event_score: float) -> tuple[float, dict[str, Any]]:
    return compose_score("FCN", comps, penalties, event_score)


def compute_active_score(comps: dict[str, float], penalties: dict[str, float], event_score: float) -> tuple[float, dict[str, Any]]:
    return compose_score("Active", comps, penalties, event_score)


# -------------------------
# Explainability
# -------------------------
def explain_row(
    feature: dict[str, Any],
    comps_10: dict[str, float],
    penalties_10: dict[str, float],
    baseline_score: float | None,
    fcn_score: float,
    active_score: float,
) -> dict[str, Any]:
    contributors = sorted(
        [{"name": k, "score_10": round2(v)} for k, v in comps_10.items()],
        key=lambda x: x["score_10"],
        reverse=True,
    )

    penalties = sorted(
        [{"name": k, "score_10": round2(v)} for k, v in penalties_10.items() if v > 0],
        key=lambda x: x["score_10"],
        reverse=True,
    )

    dominant_driver = contributors[0]["name"] if contributors else "none"

    baseline = safe_num(baseline_score, None)
    if baseline is None:
        delta_driver = "no_baseline"
    else:
        avg_new = (fcn_score + active_score) / 2.0
        diff = avg_new - baseline
        if diff > 5:
            delta_driver = f"score_up:{dominant_driver}"
        elif diff < -5:
            delta_driver = f"score_down:{penalties[0]['name'] if penalties else 'penalty_mix'}"
        else:
            delta_driver = "score_near_baseline"

    return {
        "contributors": contributors[:3],
        "penalties": penalties[:3],
        "dominant_driver": dominant_driver,
        "delta_driver_vs_baseline": delta_driver,
    }


def build_major_change_reason(compare_row: dict[str, Any]) -> str:
    candidates = [
        ("trend", abs(safe_num(compare_row.get("trend_diff"), 0.0))),
        ("structure", abs(safe_num(compare_row.get("structure_diff"), 0.0))),
        ("timing", abs(safe_num(compare_row.get("timing_diff"), 0.0))),
        ("valuation", abs(safe_num(compare_row.get("valuation_diff"), 0.0))),
        ("quality", abs(safe_num(compare_row.get("quality_diff"), 0.0))),
    ]
    candidates.sort(key=lambda x: x[1], reverse=True)
    top = candidates[0]
    if top[1] < 0.5:
        return "no_major_change"
    return f"{top[0]}_dominant_delta"


RAW_WEIGHTS = {
    "valuation": 0.30,
    "trend": 0.25,
    "structure": 0.20,
    "timing": 0.15,
    "money": 0.10,
}

COMPARE_PARAMS = {
    "zscore_weight": 0.6,
    "zscore_cap": 1.5,
    "historical_weight": 1.0,
    "historical_cap": 1.0,
    "p_value_threshold": 0.2,
    "m7_final_threshold": 6.5,
}

CATEGORY_TARGET_HORIZON = {
    "CPU_GPU_COMPUTE_SEMI": "3Y",
    "ASIC_CUSTOM_SILICON": "3Y",
    "FOUNDRY_FAB_INFRA": "5Y",
    "MEMORY_CYCLICAL_SEMI": "3Y",
    "SEMI_EQUIPMENT": "5Y",
    "CLOUD_PLATFORM_MEGACAP": "3Y",
    "CYBERSECURITY_DATA_SOFTWARE": "3Y",
    "TRAVEL_LEISURE_CYCLICAL": "1Y",
    "CRYPTO_EXCHANGE_PLATFORM": "1Y",
    "CRYPTO_MINERS": "1Y",
    "UTILITY_LOWVOL_DEFENSIVE": "10Y",
    "YIELD_REIT_BONDLIKE_INCOME": "10Y",
    "BOND_ETF": "10Y",
}

HORIZON_BUCKETS = {
    "1Y": ["1d", "1w", "1m", "3m", "6m", "12m"],
    "3Y": ["1m", "3m", "6m", "12m", "3y"],
    "5Y": ["6m", "12m", "3y", "5y"],
    "10Y": ["12m", "3y", "5y", "10y"],
}

BUCKET_MONTH_EQUIV = {
    "1d": 0.03,
    "1w": 0.23,
    "1m": 1.0,
    "3m": 3.0,
    "6m": 6.0,
    "12m": 12.0,
    "3y": 36.0,
    "5y": 60.0,
    "10y": 120.0,
}


def compute_historical_score(feature: dict[str, Any]) -> float:
    category_sub = feature["valuation"].get("category_sub", "")
    horizon = CATEGORY_TARGET_HORIZON.get(category_sub, "3Y")
    buckets = HORIZON_BUCKETS.get(horizon, HORIZON_BUCKETS["3Y"])
    rets = feature.get("returns", {})
    total = 0.0
    weights_sum = 0.0
    for b in buckets:
        rv = safe_num(rets.get(b), None)
        if rv is None:
            continue
        w = BUCKET_MONTH_EQUIV.get(b, 1.0)
        total += w * rv
        weights_sum += w
    if weights_sum <= 0:
        return 0.0
    return total / weights_sum


# -------------------------
# Main
# -------------------------
def main() -> int:
    input_paths = {
        "baseline": "data/m7/m7_new_stock_today.json",
        "market_runtime": "data/runtime_staging/market_runtime_long_horizon.json",
        "pool30": "data/pool30.json",
    }

    output_paths = {
        "scores": Path("data/m7_sandbox/m7_v2_scores.json"),
        "ab_compare": Path("data/m7_sandbox/m7_v2_ab_compare.json"),
        "manifest": Path("data/m7_sandbox/m7_v2_run_manifest.json"),
    }

    started_at = now_iso()
    notes: list[str] = []
    warnings: list[str] = []

    try:
        bundle = load_inputs()
        # Competitive Score universe: use universe_150 as the mother pool,
        # while preserving existing pool30/baseline symbols.
        symbols = sorted(
            set(UNIVERSE_BY_SYMBOL.keys())
            | set(bundle.pool30_rows.keys())
            | set(bundle.baseline_rows.keys())
        )

        global MONEY_LIQUIDITY_BENCHMARK
        benchmark_values: list[float] = []
        for sym, row in bundle.market_runtime.items():
            if not isinstance(row, dict):
                continue
            price_now = safe_num(row.get("price_now"), 0.0)
            volume = safe_num(row.get("volume"), 0.0)
            volume_ratio = safe_num(row.get("volume_ratio"), 0.0)
            avg_volume = safe_num(row.get("avg_volume", row.get("average_volume", row.get("averageVolume", row.get("averageVolume3M")))), None)
            if avg_volume is None or avg_volume <= 0:
                avg_volume = volume / max(volume_ratio, 1e-9) if volume > 0 and volume_ratio > 0 else 0.0
            adv = price_now * avg_volume
            if adv > 0:
                benchmark_values.append(adv)
        if benchmark_values:
            MONEY_LIQUIDITY_BENCHMARK = {
                "mean": sum(benchmark_values) / len(benchmark_values),
                "p25": percentile(benchmark_values, 0.25),
                "p75": percentile(benchmark_values, 0.75),
            }
        rows_out: list[dict[str, Any]] = []
        eps_rows = _eps_data_rows()
        global_eps_model = build_global_eps_model(symbols, bundle)

        for sym in symbols:
            norm_sym = normalize_symbol(sym)
            feature = build_feature_row(norm_sym, bundle)
            trend = compute_trend(feature)
            structure = compute_structure(feature)
            regression_valuation = compute_regression_valuation_band(feature, structure)
            if isinstance(feature.get("valuation"), dict):
                feature["valuation"].update(regression_valuation)
            if sym == "TSM":
                tsm_weekly_len = len([x for x in feature.get("weekly_prices", []) if safe_num(x, None) is not None and safe_num(x, 0.0) > 0])
                print(
                    "[debug] TSM weekly_prices_len="
                    f"{tsm_weekly_len}, best_structure_model={structure.get('best_structure_model')}, "
                    f"best_structure_r2={structure.get('best_structure_r2')}"
                )
                if tsm_weekly_len <= 500:
                    print("[debug][warn] TSM weekly_prices_len <= 500 (expected > 500)")
                if structure.get("best_structure_r2") is not None and structure.get("best_structure_r2") <= 0.1:
                    print("[debug][warn] TSM best_structure_r2 is near legacy-low range (<=0.10)")
            timing = compute_timing(feature)
            valuation = compute_valuation(feature)
            money = compute_market_acceptance(feature)
            exposure_data = compute_exposure_penalty(feature)
            warning_flag = bool(exposure_data["tags"])

            m7_raw_score = (
                RAW_WEIGHTS["valuation"] * valuation["score_10"]
                + RAW_WEIGHTS["trend"] * trend["score_10"]
                + RAW_WEIGHTS["structure"] * structure["score_10"]
                + RAW_WEIGHTS["timing"] * timing["score_10"]
                + RAW_WEIGHTS["money"] * money["score_10"]
            )
            historical_score = compute_historical_score(feature)
            m1_score = normalize_m1_score_to_10(feature.get("baseline", {}).get("today_score"))
            m7_v2_weights = M7_PARAM_CONFIG.get("m7_v2_weights", {}) if isinstance(M7_PARAM_CONFIG, dict) else {}
            w_val = safe_num(m7_v2_weights.get("valuation"), 0.45)
            w_trend = safe_num(m7_v2_weights.get("trend"), 0.25)
            w_structure = safe_num(m7_v2_weights.get("structure"), 0.20)
            w_timing = safe_num(m7_v2_weights.get("timing"), 0.0)
            w_money = safe_num(m7_v2_weights.get("money"), 0.10)

            m7_v2_score_unclamped = (
                w_val * valuation["score_10"]
                + w_trend * trend["score_10"]
                + w_structure * structure["score_10"]
                + w_timing * timing["score_10"]
                + w_money * money["score_10"]
            )
            m7_v2_score = clamp(m7_v2_score_unclamped, 0.0, 10.0)
            m7_v2_formula = (
                f"{w_val:.2f}*valuation + {w_trend:.2f}*trend + "
                f"{w_structure:.2f}*structure + {w_timing:.2f}*timing + {w_money:.2f}*money"
            )

            m7_v2_fallback_to_raw = bool(trend.get("fallback_to_raw"))
            m7_effective_score = m7_raw_score if m7_v2_fallback_to_raw else m7_v2_score
            m7_effective_score_source = "m7_raw_score" if m7_v2_fallback_to_raw else "m7_v2_score"

            eps_engine = compute_eps_engine_v26(feature, trend, structure, global_eps_model)
            weekly_count = len([
                x for x in feature.get("weekly_prices", [])
                if safe_num(x, None) is not None and safe_num(x, 0.0) > 0
            ])
            competitive_scope = {
                "in_universe_150": norm_sym in UNIVERSE_BY_SYMBOL,
                "has_baseline_row": norm_sym in bundle.baseline_rows,
                "has_pool30_row": norm_sym in bundle.pool30_rows,
                "has_market_runtime": norm_sym in bundle.market_runtime,
                "has_weekly_prices": weekly_count > 0,
                "weekly_price_count": weekly_count,
                "has_eps_data": norm_sym in eps_rows,
                "score_source": (
                    "full_m7_eps"
                    if eps_engine.get("cc_rank") == "A"
                    else ("partial_eps" if eps_engine.get("cc_rank") == "B" else ("runtime_fundamental_fallback" if eps_engine.get("cc_rank") == "C" else "global_or_proxy_fallback"))
                ),
                "cc_rank": eps_engine.get("cc_rank"),
            }

            rows_out.append({
                "symbol": sym,
                "name": feature["name"],
                "eps_engine": eps_engine,
                "competitive_scope": competitive_scope,
                "category": feature["category"],
                "subsector": feature["subsector"],
                "category_sub": feature["valuation"].get("category_sub"),
                "valuation_archetype": feature["valuation"].get("valuation_archetype"),
                "valuation_score": round2(valuation["score_10"]),
                "individual_fair_pe": regression_valuation.get("individual_fair_pe"),
                "regression_fair_pe": regression_valuation.get("regression_fair_pe"),
                "current_regression_multiple": regression_valuation.get("current_regression_multiple"),
                "historical_trimmed_mean_multiple": regression_valuation.get("historical_trimmed_mean_multiple"),
                "historical_median_multiple": regression_valuation.get("historical_median_multiple"),
                "historical_p25_multiple": regression_valuation.get("historical_p25_multiple"),
                "historical_p75_multiple": regression_valuation.get("historical_p75_multiple"),
                "regression_fair_price_now": regression_valuation.get("regression_fair_price_now"),
                "regression_actual_price_now": regression_valuation.get("regression_actual_price_now"),
                "regression_price_models_now": regression_valuation.get("regression_price_models_now"),
                "m7_price_models_now": regression_valuation.get("m7_price_models_now"),
                "m7_linear_fair_price": regression_valuation.get("m7_linear_fair_price"),
                "m7_quadratic_fair_price": regression_valuation.get("m7_quadratic_fair_price"),
                "m7_logarithmic_fair_price": regression_valuation.get("m7_logarithmic_fair_price"),
                "regression_valuation_model": regression_valuation.get("regression_valuation_model"),
                "regression_valuation_r2": regression_valuation.get("regression_valuation_r2"),
                "regression_valuation_history_weeks": regression_valuation.get("regression_valuation_history_weeks"),
                "regression_valuation_source": regression_valuation.get("regression_valuation_source"),
                "regression_valuation_quality": regression_valuation.get("regression_valuation_quality"),
                "trend_score": round2(trend["score_10"]),
                "trend_mode": trend.get("trend_mode"),
                "trend_reliability": trend.get("trend_reliability"),
                "trend_linear_slope": trend.get("linear_slope"),
                "trend_ma_slope": trend.get("ma_slope"),
                "trend_acceleration": trend.get("acceleration"),
                "trend_linear_score": trend.get("linear_score"),
                "trend_ma_score": trend.get("ma_score"),
                "trend_acceleration_score": trend.get("acceleration_score"),
                "trend_formula": trend.get("trend_formula"),
                "trend_fallback_to_raw": trend.get("fallback_to_raw"),
                "trend_fallback_reason": trend.get("fallback_reason"),
                "trend_linear_annualized_pct": trend.get("linear_annualized_pct"),
                "trend_ma_annualized_pct": trend.get("ma_annualized_pct"),
                "trend_recent_3y_slope": trend.get("recent_3y_slope"),
                "trend_recent_3y_annualized_pct": trend.get("recent_3y_annualized_pct"),
                "trend_acceleration_annualized_delta_pct": trend.get("acceleration_annualized_delta_pct"),
                "trend_acceleration_mode": trend.get("acceleration_mode"),
                "trend_ma_window_weeks": trend.get("ma_window_weeks"),
                "trend_acceleration_recent_weeks": trend.get("acceleration_recent_weeks"),
                "structure_slope": round2(structure["slope"]) if structure.get("slope") is not None else None,
                "structure_dispersion": round2(structure["dispersion"]) if structure.get("dispersion") is not None else None,
                "structure_stability": round2(structure["stability"]) if structure.get("stability") is not None else None,
                "structure_r2": round2(structure["r2"]) if structure.get("r2") is not None else None,
                "structure_r2_linear": round2(structure["structure_r2_linear"]) if structure.get("structure_r2_linear") is not None else None,
                "structure_r2_quadratic": round2(structure["structure_r2_quadratic"]) if structure.get("structure_r2_quadratic") is not None else None,
                "structure_r2_logarithmic": round2(structure["structure_r2_logarithmic"]) if structure.get("structure_r2_logarithmic") is not None else None,
                "best_structure_r2": round2(structure["best_structure_r2"]) if structure.get("best_structure_r2") is not None else None,
                "best_structure_model": structure.get("best_structure_model"),
                "structure_score_method": structure.get("structure_score_method"),
                "linear_slope": structure.get("linear_slope"),
                "quadratic_a": structure.get("quadratic_a"),
                "logarithmic_slope": structure.get("logarithmic_slope"),
                "drawdown_frequency": round2(structure["drawdown_frequency"] * 100.0) if structure.get("drawdown_frequency") is not None else None,
                "structure_score": round2(structure["score_10"]),
                "timing_score": round2(timing["score_10"]),
                "money_score": round2(money["score_10"]),
                "money_liquidity_score": round2(money.get("liquidity_score")),
                "money_flow_score": round2(money.get("flow_score")),
                "money_volume_ratio_score": round2(money.get("volume_ratio_score")),
                "money_position_score": round2(money.get("money_position_score")),
                "money_position": round2(money.get("money_position")),
                "avg_dollar_volume": round2(money.get("avg_dollar_volume")),
                "today_dollar_volume": round2(money.get("today_dollar_volume")),
                "volume_ratio": round2(money.get("volume_ratio")),
                "money_liquidity_weight": round2(money.get("liquidity_weight")),
                "money_flow_weight": round2(money.get("flow_weight")),
                "money_module_preset": money.get("money_module_preset"),
                "m1_score": round2(m1_score),
                "m7_raw_score": round2(m7_raw_score),
                "m7_v2_score": round2(m7_v2_score),
                "m7_v2_formula": m7_v2_formula,
                "m7_v2_score_unclamped": round2(m7_v2_score_unclamped),
                "m7_effective_score": round2(m7_effective_score),
                "m7_effective_score_source": m7_effective_score_source,
                "m7_v2_fallback_to_raw": m7_v2_fallback_to_raw,
                "historical_score": round2(historical_score),
                "warning_flag": warning_flag,
                "coverage_pct": feature["market_acceptance"].get("coverage_pct"),
                "data_warning": feature["market_acceptance"].get("data_warning"),
                "missing_price_refs": feature["market_acceptance"].get("missing_price_refs"),
                "history_weeks": feature.get("history_weeks"),
                "history_horizon_used": feature.get("history_horizon_used"),
                "feature_snapshot": {
                    "valuation": feature["valuation"],
                    "returns": feature["returns"],
                    "market_acceptance": feature.get("market_acceptance", {}),
                },
            })

        # statistical adjustment layer
        if rows_out:
            pooled_mean = sum(r["m7_raw_score"] for r in rows_out) / len(rows_out)
            pooled_var = sum((r["m7_raw_score"] - pooled_mean) ** 2 for r in rows_out) / max(1, len(rows_out) - 1)
            pooled_std = max(1e-6, pooled_var ** 0.5)
        else:
            pooled_std = 1.0

        cat_mean: dict[str, float] = {}
        for cat in sorted(set(r["category"] for r in rows_out)):
            vals = [r["m7_raw_score"] for r in rows_out if r["category"] == cat]
            cat_mean[cat] = sum(vals) / len(vals) if vals else 0.0

        sub_hist_mean: dict[str, float] = {}
        for sub in sorted(set(r["category_sub"] for r in rows_out)):
            vals = [r["historical_score"] for r in rows_out if r["category_sub"] == sub]
            sub_hist_mean[sub] = sum(vals) / len(vals) if vals else 0.0

        ab_rows: list[dict[str, Any]] = []
        for row in rows_out:
            category_mean_adjusted = cat_mean.get(row["category"], row["m7_raw_score"])
            zscore = (row["m7_raw_score"] - category_mean_adjusted) / pooled_std
            z_adj = clamp(zscore * COMPARE_PARAMS["zscore_weight"], -COMPARE_PARAMS["zscore_cap"], COMPARE_PARAMS["zscore_cap"])
            sub_h = sub_hist_mean.get(row["category_sub"], 0.0)
            h_value = (row["historical_score"] / sub_h) if abs(sub_h) > 1e-6 else 1.0
            h_adjustment = (h_value - 1.0) * COMPARE_PARAMS["historical_weight"]
            h_adj = clamp(h_adjustment, -COMPARE_PARAMS["historical_cap"], COMPARE_PARAMS["historical_cap"])
            m7_final_score = clamp(row["m7_raw_score"] + z_adj + h_adj, 0.0, 10.0)
            p_value = max(0.0, min(1.0, math.erfc(abs(zscore) / math.sqrt(2))))
            today_status = (
                "TODAY_FCN_POOL"
                if (m7_final_score >= COMPARE_PARAMS["m7_final_threshold"] and p_value <= COMPARE_PARAMS["p_value_threshold"] and not row["warning_flag"])
                else ("WATCH" if m7_final_score >= COMPARE_PARAMS["m7_final_threshold"] else "REVIEW")
            )

            row.update({
                "zscore": round2(zscore),
                "z_adj": round2(z_adj),
                "h_value": round2(h_value),
                "h_adj": round2(h_adj),
                "m7_final_score": round2(m7_final_score),
                "p_value": round2(p_value),
                "confidence": round2((1.0 - p_value) * 100.0),
                "today_fcn_pool_status": today_status,
            })

            ab_rows.append({
                "symbol": row["symbol"],
                "m1_score": row["m1_score"],
                "m7_score": row["m7_raw_score"],
                "m7_v2_score": row["m7_v2_score"],
                "zscore": row["zscore"],
                "z_adj": row["z_adj"],
                "historical_score": row["historical_score"],
                "h_value": row["h_value"],
                "h_adj": row["h_adj"],
                "m7_final_score": row["m7_final_score"],
                "m7_effective_score": row.get("m7_effective_score"),
                "m7_effective_score_source": row.get("m7_effective_score_source"),
                "p_value": row["p_value"],
                "confidence": row["confidence"],
                "warning_flag": row["warning_flag"],
                "today_fcn_pool_status": row["today_fcn_pool_status"],
            })

        rows_out.sort(key=lambda r: r["m7_final_score"], reverse=True)
        ab_rows.sort(key=lambda r: r["m7_final_score"], reverse=True)

        scores_payload = {
            "generated_at": now_iso(),
            "scope": {
                "scenarios": ["M7_RAW", "M7_V2", "M7_EFFECTIVE", "M7_FINAL"],
                "price_model_outputs": ["regression_price_models_now", "m7_price_models_now", "eps_engine.price_model_forecast_all"],
                "symbol_count": len(rows_out),
                "global_eps_model_sample_count": global_eps_model.get("global_sample_count"),
            },
            "rows": rows_out,
        }

        ab_payload = {
            "generated_at": now_iso(),
            "scope": {
                "comparison": "statistical_adjustment_layer",
                "symbol_count": len(ab_rows),
            },
            "rows": ab_rows,
        }

        params_snapshot = {
            "raw_weights": RAW_WEIGHTS,
            "compare_params": COMPARE_PARAMS,
            "category_target_horizon": CATEGORY_TARGET_HORIZON,
            "regime_params": regime_params,
            "module_params": module_params,
            "curve_params": curve_params,
            "m7_v2_parameter_config": M7_PARAM_CONFIG,
        }

        raw_id = json.dumps(
            {
                "inputs": input_paths,
                "symbols": symbols,
                "params_hash_seed": params_snapshot,
            },
            sort_keys=True,
            ensure_ascii=False,
        ).encode("utf-8")
        run_id = "M7V2-" + hashlib.sha256(raw_id).hexdigest()[:12]

        manifest = {
            "run_id": run_id,
            "started_at": started_at,
            "finished_at": now_iso(),
            "inputs": input_paths,
            "outputs": {k: str(v) for k, v in output_paths.items()},
            "summary": {
                "symbol_count": len(symbols),
                "baseline_coverage": 0,
                "warnings": len(warnings),
                "notes": len(notes),
            },
            "parameter_snapshot": params_snapshot,
            "warnings": warnings,
            "notes": notes,
        }

        save_json(output_paths["scores"], scores_payload)
        save_json(output_paths["ab_compare"], ab_payload)
        save_json(output_paths["manifest"], manifest)

        print("✅ m7 v2 sandbox run completed")
        print(f"✅ scores -> {output_paths['scores']}")
        print(f"✅ ab_compare -> {output_paths['ab_compare']}")
        print(f"✅ manifest -> {output_paths['manifest']}")
        return 0

    except Exception as e:  # keep hard fail visible in sandbox
        print(f"❌ m7 v2 sandbox run failed: {e}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

