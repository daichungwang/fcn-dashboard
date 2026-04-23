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


def round2(v: float) -> float:
    return round(safe_num(v, 0.0), 2)


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


@dataclass
class InputBundle:
    baseline_rows: dict[str, dict[str, Any]]
    market_runtime: dict[str, dict[str, Any]]
    pool30_rows: dict[str, dict[str, Any]]


# -------------------------
# Input adapter skeleton
# -------------------------
def load_inputs() -> InputBundle:
    baseline_path = Path("data/m7/m7_new_stock_today.json")
    market_path = Path("data/market_runtime.json")
    pool_path = Path("data/pool30.json")

    baseline_raw = load_json(baseline_path)
    market_raw = load_json(market_path)
    pool_raw = load_json(pool_path)

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
    if isinstance(market_raw, dict):
        for sym, row in market_raw.items():
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

    return InputBundle(
        baseline_rows=baseline_rows,
        market_runtime=market_rows,
        pool30_rows=pool_rows,
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

    returns_base = {
        "1d": safe_num(b.get("1日漲跌幅"), None),
        "1w": safe_num(b.get("1週漲跌幅"), None),
        "1m": safe_num(b.get("1月漲跌幅"), None),
        "3m": safe_num(b.get("3月漲跌幅"), None),
        "6m": safe_num(b.get("6月漲跌幅"), None),
        "12m": safe_num(b.get("12月漲跌幅"), None),
    }

    returns_market = {
        "1d": safe_num(m.get("ret_1d"), 0.0) * 100.0,
        "1w": safe_num(m.get("ret_1w"), 0.0) * 100.0,
        "1m": safe_num(m.get("ret_1m"), 0.0) * 100.0,
        "3m": safe_num(m.get("ret_3m"), 0.0) * 100.0,
        "6m": safe_num(m.get("ret_6m"), 0.0) * 100.0,
        "12m": safe_num(m.get("ret_12m"), 0.0) * 100.0,
    }

    rets = {}
    for k in ["1d", "1w", "1m", "3m", "6m", "12m"]:
        val = returns_base[k]
        if val is None:
            val = returns_market[k]
        rets[k] = safe_num(val, 0.0)

    swing_days = b.get("結構資料", {}).get("swing_days")
    if not isinstance(swing_days, list):
        swing_days = m.get("swing_days")
    if not isinstance(swing_days, list):
        swing_days = []
    swing_days = [safe_num(x, 0.0) for x in swing_days[:6]]
    while len(swing_days) < 6:
        swing_days.append(0.0)

    valuation_data = b.get("估值資料", {}) if isinstance(b.get("估值資料"), dict) else {}

    forward_pe = safe_num(valuation_data.get("ForwardPE"), None)
    anchor_pe = safe_num(valuation_data.get("AnchorPE"), None)
    peg = safe_num(valuation_data.get("PEG"), None)
    eps_growth = safe_num(valuation_data.get("EPS成長率"), None)
    quality_momentum = safe_num(valuation_data.get("QualityMomentum"), None)

    volume_ratio = safe_num(b.get("量比"), None)
    if volume_ratio is None:
        volume_ratio = safe_num(m.get("volume_ratio"), 1.0)

    volume = safe_num(m.get("volume"), 0.0)
    price_now = safe_num(m.get("price_now"), safe_num(b.get("股價"), 0.0))
    size_proxy = max(price_now, 0.0) * max(volume, 0.0)

    exposure = b.get("持倉曝險", {}) if isinstance(b.get("持倉曝險"), dict) else {}
    exposure_ratio = safe_num(exposure.get("投入資金比"), 0.0)
    exposure_danger = safe_num(exposure.get("Danger"), 0.0)
    exposure_watch = safe_num(exposure.get("Watch"), 0.0)

    baseline_score = safe_num(b.get("today_score"), None)
    baseline_components = b.get("分數拆解", {}) if isinstance(b.get("分數拆解"), dict) else {}

    # event score placeholder: baseline quality score proxy (safe fallback)
    event_score = safe_num(exposure.get("Event平均"), 0.0)

    return {
        "symbol": symbol,
        "name": b.get("股名") or p.get("name") or p.get("名稱") or symbol,
        "category": b.get("分類") or p.get("category") or "unknown",
        "sector": b.get("產業") or p.get("sector") or "",
        "subsector": b.get("子產業") or p.get("subsector") or "",
        "returns": rets,
        "swing_days": swing_days,
        "valuation": {
            "forward_pe": forward_pe,
            "anchor_pe": anchor_pe,
            "peg": peg,
            "eps_growth": eps_growth,
        },
        "quality_momentum": quality_momentum,
        "market_acceptance": {
            "volume_ratio": volume_ratio,
            "liquidity_proxy": volume,
            "size_proxy": size_proxy,
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
def compute_trend(feature: dict[str, Any]) -> dict[str, float]:
    rets = feature["returns"]
    w = curve_params["trend_curve"]
    trend_raw = (
        0.25 * safe_num(rets["1m"], 0.0)
        + 0.25 * safe_num(rets["3m"], 0.0)
        + 0.25 * safe_num(rets["6m"], 0.0)
        + 0.25 * safe_num(rets["12m"], 0.0)
    )
    trend_score_10 = piecewise(w["points"], trend_raw)
    return {"raw": trend_raw, "score_10": clamp(trend_score_10, 0.0, 10.0)}


def compute_structure(feature: dict[str, Any]) -> dict[str, float]:
    days = feature["swing_days"]
    d_weights = [0.2, 0.2, 0.1, 0.1, 0.2, 0.2]
    structure_raw = sum(dw * safe_num(days[i], 0.0) for i, dw in enumerate(d_weights))
    structure_score_10 = piecewise(curve_params["structure_curve"]["points"], structure_raw)
    return {"raw": structure_raw, "score_10": clamp(structure_score_10, 0.0, 10.0)}


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
    ape = safe_num(val.get("anchor_pe"), 0.0)
    peg = safe_num(val.get("peg"), 0.0)
    growth = safe_num(val.get("eps_growth"), 0.0)

    pe_ratio = fpe / ape if ape > 0 else max(peg, 0.0)

    pe_score = piecewise(curve_params["valuation_curve"]["pe_ratio"]["points"], pe_ratio)
    g_score = piecewise(curve_params["valuation_curve"]["growth"]["points"], growth)

    bw = curve_params["valuation_curve"]["blend_weights"]
    valuation_raw = bw["pe"] * pe_score + bw["growth"] * g_score

    return {
        "raw": valuation_raw,
        "score_10": clamp(valuation_raw, 0.0, 10.0),
        "pe_ratio": pe_ratio,
        "growth": growth,
    }


def compute_quality(feature: dict[str, Any]) -> dict[str, float]:
    q_raw = safe_num(feature.get("quality_momentum"), 0.0)
    q_score = piecewise(curve_params["quality_curve"]["points"], q_raw)
    return {"raw": q_raw, "score_10": clamp(q_score, 0.0, 10.0)}


def compute_market_acceptance(feature: dict[str, Any]) -> dict[str, float]:
    m = feature["market_acceptance"]
    vr = safe_num(m.get("volume_ratio"), 1.0)
    lp = safe_num(m.get("liquidity_proxy"), 0.0)
    sp = safe_num(m.get("size_proxy"), 0.0)

    c = curve_params["market_acceptance_curve"]
    vr_score = piecewise(c["volume_ratio"]["points"], vr)
    lp_score = piecewise(c["liquidity"]["points"], lp)
    sp_score = piecewise(c["size_proxy"]["points"], sp)

    bw = c["blend_weights"]
    raw = bw["volume_ratio"] * vr_score + bw["liquidity"] * lp_score + bw["size_proxy"] * sp_score
    return {"raw": raw, "score_10": clamp(raw, 0.0, 10.0)}


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


# -------------------------
# Main
# -------------------------
def main() -> int:
    input_paths = {
        "baseline": "data/m7/m7_new_stock_today.json",
        "market_runtime": "data/market_runtime.json",
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

        symbols = sorted(set(bundle.pool30_rows.keys()) | set(bundle.baseline_rows.keys()))

        rows_out: list[dict[str, Any]] = []

        for sym in symbols:
            feature = build_feature_row(sym, bundle)

            trend = compute_trend(feature)
            structure = compute_structure(feature)
            timing = compute_timing(feature)
            valuation = compute_valuation(feature)
            quality = compute_quality(feature)
            market_acc = compute_market_acceptance(feature)

            exposure_data = compute_exposure_penalty(feature)
            overheat_penalty = compute_overheat_penalty(timing["raw"])

            comps = {
                "trend": trend["score_10"],
                "structure": structure["score_10"],
                "timing": timing["score_10"],
                "valuation": valuation["score_10"],
                "quality": quality["score_10"],
                "market_acceptance": market_acc["score_10"],
            }
            penalties = {
                "exposure_penalty": exposure_data["penalty"],
                "overheat_penalty": overheat_penalty,
            }

            event_score_10 = clamp(safe_num(feature["event_score"], 0.0), 0.0, 10.0)

            fcn_score, fcn_dbg = compute_fcn_score(comps, penalties, event_score_10)
            active_score, active_dbg = compute_active_score(comps, penalties, event_score_10)

            explain = explain_row(
                feature=feature,
                comps_10=comps,
                penalties_10=penalties,
                baseline_score=feature["baseline"].get("today_score"),
                fcn_score=fcn_score,
                active_score=active_score,
            )

            rows_out.append({
                "symbol": sym,
                "name": feature["name"],
                "category": feature["category"],
                "sector": feature["sector"],
                "subsector": feature["subsector"],
                "baseline": feature["baseline"],
                "features": {
                    "returns": feature["returns"],
                    "swing_days": feature["swing_days"],
                    "valuation": feature["valuation"],
                    "event_score": event_score_10,
                    "market_acceptance": feature["market_acceptance"],
                    "exposure": feature["exposure"],
                },
                "factor_scores_10": {k: round2(v) for k, v in comps.items()},
                "penalties_10": {
                    "exposure_penalty": round2(exposure_data["penalty"]),
                    "overheat_penalty": round2(overheat_penalty),
                    "warning_tags": exposure_data["tags"],
                },
                "scores": {
                    "fcn_score": round2(fcn_score),
                    "active_score": round2(active_score),
                },
                "debug": {
                    "fcn": fcn_dbg,
                    "active": active_dbg,
                },
                "explainability": explain,
            })

        # rankings
        sorted_fcn = sorted(rows_out, key=lambda r: r["scores"]["fcn_score"], reverse=True)
        sorted_active = sorted(rows_out, key=lambda r: r["scores"]["active_score"], reverse=True)
        sorted_baseline = sorted(rows_out, key=lambda r: safe_num(r["baseline"].get("today_score"), -1.0), reverse=True)

        fcn_rank = {r["symbol"]: i + 1 for i, r in enumerate(sorted_fcn)}
        active_rank = {r["symbol"]: i + 1 for i, r in enumerate(sorted_active)}
        base_rank = {r["symbol"]: i + 1 for i, r in enumerate(sorted_baseline) if r["baseline"].get("today_score") is not None}

        for row in rows_out:
            sym = row["symbol"]
            row["ranks"] = {
                "baseline_rank": base_rank.get(sym),
                "fcn_rank": fcn_rank.get(sym),
                "active_rank": active_rank.get(sym),
            }

        # A/B compare output
        ab_rows: list[dict[str, Any]] = []
        for row in rows_out:
            bscore = row["baseline"].get("today_score")
            fcn_s = row["scores"]["fcn_score"]
            act_s = row["scores"]["active_score"]
            b_comp = row["baseline"].get("components", {})
            f_comp = row["factor_scores_10"]

            compare = {
                "symbol": row["symbol"],
                "name": row["name"],
                "baseline_score": bscore,
                "fcn_score": fcn_s,
                "active_score": act_s,
                "fcn_vs_baseline_delta": round2(fcn_s - safe_num(bscore, 0.0)) if bscore is not None else None,
                "active_vs_baseline_delta": round2(act_s - safe_num(bscore, 0.0)) if bscore is not None else None,
                "baseline_rank": row["ranks"]["baseline_rank"],
                "fcn_rank": row["ranks"]["fcn_rank"],
                "active_rank": row["ranks"]["active_rank"],
                "fcn_rank_delta": (row["ranks"]["fcn_rank"] - row["ranks"]["baseline_rank"]) if row["ranks"]["baseline_rank"] else None,
                "active_rank_delta": (row["ranks"]["active_rank"] - row["ranks"]["baseline_rank"]) if row["ranks"]["baseline_rank"] else None,
                "trend_diff": round2(f_comp.get("trend", 0.0) - safe_num(b_comp.get("trend"), 0.0)),
                "structure_diff": round2(f_comp.get("structure", 0.0) - safe_num(b_comp.get("structure"), 0.0)),
                "timing_diff": round2(f_comp.get("timing", 0.0) - safe_num(b_comp.get("timing"), 0.0)),
                "valuation_diff": round2(f_comp.get("valuation", 0.0) - safe_num(b_comp.get("valuation"), 0.0)),
                "quality_diff": round2(f_comp.get("quality", 0.0) - safe_num(b_comp.get("quality"), 0.0)),
                "major_change_reason": "",
                "delta_driver_vs_baseline": row["explainability"]["delta_driver_vs_baseline"],
            }
            compare["major_change_reason"] = build_major_change_reason(compare)
            ab_rows.append(compare)

        ab_rows.sort(key=lambda x: x["fcn_score"], reverse=True)

        scores_payload = {
            "generated_at": now_iso(),
            "scope": {
                "scenarios": ["FCN", "Active"],
                "symbol_count": len(rows_out),
            },
            "rows": rows_out,
        }

        ab_payload = {
            "generated_at": now_iso(),
            "scope": {
                "comparison": "same-day same-universe",
                "symbol_count": len(ab_rows),
            },
            "rows": ab_rows,
        }

        params_snapshot = {
            "scenario_params": scenario_params,
            "regime_params": regime_params,
            "module_params": module_params,
            "curve_params": curve_params,
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
                "baseline_coverage": sum(1 for r in rows_out if r["baseline"].get("today_score") is not None),
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
