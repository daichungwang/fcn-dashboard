#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build M1 normalized scores for MM / M1 integration.

Output:
  data/m1/m1_scores.json

Formula aligned with m1_test.html v2.5:
  M1_raw   = 0.45 * C2P + 0.30 * CC + 0.25 * M7n
  M1_score = M1_raw / max(M1_raw) * 10

Inputs:
  data/m1/m1_candidate_80.json
  data/m1/universe_150.json                 optional
  data/pool30.json                          optional
  data/m1/m1_fundamental_map.json           optional
  data/m7_sandbox/m7_v2_scores.json
  data/market_runtime.json                  optional

Design:
  - This script is an output builder, not a heavy model engine.
  - It keeps M1 scoring stable for MM dashboard, m1.html, and automation.
  - It does not modify existing m1.html / m1_test.html / runtime pipeline.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


ROOT = Path(__file__).resolve().parents[1]

PATH_CANDIDATE = ROOT / "data/m1/m1_candidate_80.json"
PATH_UNIVERSE = ROOT / "data/m1/universe_150.json"
PATH_POOL30 = ROOT / "data/pool30.json"
PATH_FUNDAMENTAL = ROOT / "data/m1/m1_fundamental_map.json"
PATH_M7 = ROOT / "data/m7_sandbox/m7_v2_scores.json"
PATH_RUNTIME = ROOT / "data/market_runtime.json"

PATH_OUT = ROOT / "data/m1/m1_scores.json"


CATEGORY_ORDER = ["core", "growth", "income", "defensive", "speculative"]
ETF_FORCE_DEFENSIVE = {
    "QQQ", "SMH", "SPY", "LQD", "XLU", "VPU", "XLF", "XLV", "XLE", "XLP", "VOLT", "ZAP"
}


def read_json(path: Path, default: Any = None) -> Any:
    if default is None:
        default = {}
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


def to_float(value: Any, default: Optional[float] = None) -> Optional[float]:
    if value is None:
        return default
    if isinstance(value, bool):
        return default
    try:
        x = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(x):
        return default
    return x


def round_or_none(value: Any, digits: int = 2) -> Optional[float]:
    x = to_float(value)
    if x is None:
        return None
    return round(x, digits)


def normalize_symbol(value: Any) -> str:
    return str(value or "").strip().upper()


def as_list(raw: Any) -> List[Dict[str, Any]]:
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, dict)]

    if isinstance(raw, dict):
        for key in ("rows", "data", "items", "stocks", "scores", "results", "all"):
            if isinstance(raw.get(key), list):
                return [x for x in raw[key] if isinstance(x, dict)]

        out: List[Dict[str, Any]] = []
        for k, v in raw.items():
            if isinstance(v, dict):
                row = {"symbol": v.get("symbol", k), **v}
                out.append(row)
        return out

    return []


def build_symbol_map(raw: Any) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for row in as_list(raw):
        sym = normalize_symbol(row.get("symbol") or row.get("ticker") or row.get("underlying"))
        if sym:
            out[sym] = row
    return out


def normalize_category(row: Dict[str, Any]) -> str:
    sym = normalize_symbol(row.get("symbol"))
    if sym in ETF_FORCE_DEFENSIVE:
        return "defensive"

    raw = str(row.get("category") or "").strip().lower()
    for cat in CATEGORY_ORDER:
        if cat in raw:
            return cat
    return "speculative"


def map_range_score(x: Optional[float], bands: Iterable[Tuple[float, float]]) -> Optional[float]:
    if x is None:
        return None
    for minimum, score in bands:
        if x >= minimum:
            return score
    return list(bands)[-1][1]


def calc_fundamental_score(f: Dict[str, Any]) -> Optional[float]:
    """
    Port of m1.html / m1_test.html calcFundamentalScore().
    """
    if not isinstance(f, dict):
        return None

    capex = to_float(f.get("capex_ratio_prev_y"))
    rev = to_float(f.get("revenue_growth_q"))
    opg = to_float(f.get("operating_income_growth_q"))
    opq = to_float(f.get("operating_income_q"))

    capex_score = map_range_score(capex, [
        (15, 10), (12, 8.5), (9, 7), (6, 5.5), (3, 4), (0, 2.5)
    ])
    rev_score = map_range_score(rev, [
        (30, 10), (20, 8.5), (10, 7), (5, 5.5), (0, 4), (-999, 2)
    ])
    opg_score = map_range_score(opg, [
        (40, 10), (25, 8.5), (15, 7), (5, 5.5), (0, 4), (-999, 2)
    ])
    size_score = map_range_score(opq, [
        (12000, 10), (8000, 8.5), (4000, 7), (1000, 5.5), (1, 4), (0, 2)
    ])

    parts: List[Tuple[float, float]] = []
    if capex_score is not None:
        parts.append((0.4, capex_score))
    if rev_score is not None:
        parts.append((0.2, rev_score))
    if opg_score is not None:
        parts.append((0.3, opg_score))
    if size_score is not None:
        parts.append((0.1, size_score))

    if not parts:
        return None

    sum_w = sum(w for w, _ in parts)
    sum_v = sum(w * v for w, v in parts)
    return round(sum_v / sum_w, 2)


def eps_coverage_from_engine(eps: Dict[str, Any]) -> Dict[str, Any]:
    """
    A/B/C/D follows eps_engine.cc_rank if present.
    This is data credibility, not EPS count.
    """
    if not isinstance(eps, dict) or not eps:
        return {
            "grade": "D",
            "history_count": 0,
            "forward_count": 0,
            "source": "missing_eps_engine",
            "confidence": "low",
            "label": "Global / ETF / Proxy",
        }

    history_count = int(to_float(eps.get("eps_regression_sample_count"), 0) or 0)
    forward_count = sum(
        1 for k in ("eps_2025", "eps_2026", "eps_2027")
        if to_float(eps.get(k)) is not None
    )

    raw_rank = str(eps.get("cc_rank") or eps.get("eps_coverage_rank") or "").strip().upper()
    grade = raw_rank if raw_rank in {"A", "B", "C", "D"} else ""

    if not grade:
        status = str(eps.get("eps_status") or eps.get("cc_source") or "").strip()
        if status == "actual_history_plus_eps_regression" and history_count >= 3 and forward_count >= 2:
            grade = "A"
        elif status == "runtime_fundamental_fallback":
            grade = "C"
        elif history_count >= 1 or forward_count >= 1 or status == "eps_regression_partial":
            grade = "B"
        else:
            grade = "D"

    label_map = {
        "A": "Full EPS",
        "B": "Partial EPS",
        "C": "Runtime Fundamentals",
        "D": "Global / ETF / Proxy",
    }

    return {
        "grade": grade,
        "history_count": history_count,
        "forward_count": forward_count,
        "source": eps.get("cc_source") or eps.get("eps_status") or "-",
        "confidence": eps.get("cc_confidence") or eps.get("confidence") or "-",
        "label": eps.get("cc_rank_label") or label_map.get(grade, "Global / ETF / Proxy"),
    }


def get_price_now(symbol: str, runtime_map: Dict[str, Dict[str, Any]], m7_row: Dict[str, Any], candidate_row: Dict[str, Any]) -> Optional[float]:
    rt = runtime_map.get(symbol, {})
    return to_float(
        rt.get("price_now")
        or rt.get("price")
        or rt.get("last_price")
        or rt.get("close")
        or rt.get("current_price")
        or m7_row.get("price_now")
        or candidate_row.get("price_now")
        or candidate_row.get("price")
        or m7_row.get("regression_actual_price_now")
    )


def normalize_runtime_daily_return(rt: Dict[str, Any]) -> Optional[float]:
    if not isinstance(rt, dict):
        return None

    # update_market_runtime.py usually stores ret_d1 as decimal daily return.
    v = to_float(rt.get("ret_d1"))
    if v is not None:
        return v

    # Legacy files can mix decimal and percent point.
    v = to_float(rt.get("ret_1d"))
    if v is None:
        return None
    return v / 100 if abs(v) > 1 else v


def prepare_rows(
    candidates: List[Dict[str, Any]],
    fundamental_map: Dict[str, Any],
    m7_map: Dict[str, Dict[str, Any]],
    runtime_map: Dict[str, Dict[str, Any]],
    pool30_symbols: set[str],
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []

    for raw in candidates:
        symbol = normalize_symbol(raw.get("symbol") or raw.get("ticker"))
        if not symbol:
            continue

        f = fundamental_map.get(symbol, {}) if isinstance(fundamental_map, dict) else {}
        m7 = m7_map.get(symbol, {})
        rt = runtime_map.get(symbol, {})
        eps = m7.get("eps_engine") or {}
        coverage = eps_coverage_from_engine(eps)

        capex_score = calc_fundamental_score(f)
        competitive_score = to_float(eps.get("cc_score"))
        competitive_raw_score = to_float(eps.get("cc_raw_score") if eps.get("cc_raw_score") is not None else eps.get("cc_score"))
        m7_v2_score = to_float(m7.get("m7_v2_score"))

        row = {
            **raw,
            "symbol": symbol,
            "name": raw.get("name") or raw.get("company_name") or symbol,
            "category": normalize_category(raw),
            "subsector": raw.get("subsector") or raw.get("sub_category") or raw.get("category_sub") or "",
            "category_sub": raw.get("category_sub") or m7.get("category_sub") or raw.get("subsector") or "",
            "sector": raw.get("sector") or m7.get("sector") or "",
            "in_pool30": symbol in pool30_symbols,

            "capex_score": capex_score,
            "competitive_score": competitive_score,
            "competitive_raw_score": competitive_raw_score,
            "m7_v2_score": m7_v2_score,

            "eps_coverage_grade": coverage["grade"],
            "eps_rank_label": coverage["label"],
            "eps_cc_source": coverage["source"],
            "eps_cc_confidence": coverage["confidence"],
            "eps_history_count": coverage["history_count"],
            "eps_forward_count": coverage["forward_count"],

            "eps_future_profit_score": to_float(eps.get("future_profit_score")),
            "eps_future_growth_score": to_float(eps.get("future_growth_score")),
            "eps_consistency_score": to_float(eps.get("middle_consistency_score") if eps.get("middle_consistency_score") is not None else eps.get("consistency")),
            "eps_quality_score": to_float(eps.get("quality_score") if eps.get("quality_score") is not None else eps.get("quality")),
            "eps_future_growth_rate": to_float(eps.get("future_growth_rate")),
            "eps_warnings": eps.get("warnings") if isinstance(eps.get("warnings"), list) else [],

            "price_now": get_price_now(symbol, runtime_map, m7, raw),
            "ret_1d": normalize_runtime_daily_return(rt),
            "volume_ratio": to_float(rt.get("volume_ratio") or m7.get("volume_ratio")),

            "source_trace": {
                "candidate": True,
                "fundamental": bool(f),
                "m7": bool(m7),
                "runtime": bool(rt),
                "eps_engine": bool(eps),
                "pool30": symbol in pool30_symbols,
            },
        }

        rows.append(row)

    return rows


def compute_m1_raw(row: Dict[str, Any]) -> Dict[str, Any]:
    """
    Missing components follow the UI fallback: 5.999.
    """
    c2p = to_float(row.get("capex_score"), 5.999)
    cc = to_float(row.get("competitive_score"), 5.999)
    m7n = to_float(row.get("m7_v2_score"), 5.999)

    raw = 0.45 * c2p + 0.30 * cc + 0.25 * m7n

    return {
        "raw_m1_score": round(raw, 2),
        "breakdown": {
            "capex_score": round_or_none(c2p, 2),
            "competitive_score": round_or_none(cc, 2),
            "m7_v2_score": round_or_none(m7n, 2),
            "m3_score": None,
            "m7_score": round_or_none(m7n, 2),
            "weights": {
                "capex_score": 0.45,
                "competitive_score": 0.30,
                "m7_v2_score": 0.25,
            },
            "fallback_used": {
                "capex_score": row.get("capex_score") is None,
                "competitive_score": row.get("competitive_score") is None,
                "m7_v2_score": row.get("m7_v2_score") is None,
            },
        },
    }


def score_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    computed: List[Dict[str, Any]] = []
    for row in rows:
        s = compute_m1_raw(row)
        computed.append({**row, **s})

    max_raw = max((to_float(r.get("raw_m1_score"), 0) or 0 for r in computed), default=0)

    for row in computed:
        raw = to_float(row.get("raw_m1_score"))
        if raw is None or max_raw <= 0:
            row["M1_score"] = 0
        else:
            row["M1_score"] = round(raw / max_raw * 10, 2)
        row["m1_score"] = row["M1_score"]

    computed.sort(key=lambda r: to_float(r.get("M1_score"), -999) or -999, reverse=True)

    for idx, row in enumerate(computed, start=1):
        row["rank"] = idx

    return computed


def build_summary(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    total = len(rows)
    cc_counts = {"A": 0, "B": 0, "C": 0, "D": 0}
    category_counts: Dict[str, int] = {k: 0 for k in CATEGORY_ORDER}

    for row in rows:
        grade = str(row.get("eps_coverage_grade") or "D").upper()
        if grade not in cc_counts:
            grade = "D"
        cc_counts[grade] += 1

        cat = str(row.get("category") or "speculative").lower()
        category_counts[cat] = category_counts.get(cat, 0) + 1

    score_values = [to_float(r.get("M1_score")) for r in rows]
    score_values = [x for x in score_values if x is not None]

    avg_score = round(sum(score_values) / len(score_values), 2) if score_values else None
    max_score = round(max(score_values), 2) if score_values else None
    min_score = round(min(score_values), 2) if score_values else None

    return {
        "total": total,
        "avg_m1_score": avg_score,
        "max_m1_score": max_score,
        "min_m1_score": min_score,
        "cc_rank_counts": cc_counts,
        "category_counts": category_counts,
        "pool30_count_in_candidates": sum(1 for r in rows if r.get("in_pool30")),
    }


def main() -> None:
    candidates_raw = read_json(PATH_CANDIDATE, [])
    universe_raw = read_json(PATH_UNIVERSE, [])
    pool30_raw = read_json(PATH_POOL30, [])
    fundamental_map = read_json(PATH_FUNDAMENTAL, {})
    m7_raw = read_json(PATH_M7, {"rows": []})
    runtime_raw = read_json(PATH_RUNTIME, {})

    candidates = as_list(candidates_raw)
    universe = as_list(universe_raw)
    pool30 = as_list(pool30_raw)

    m7_map = build_symbol_map(m7_raw)
    runtime_map = build_symbol_map(runtime_raw)
    pool30_symbols = {normalize_symbol(x.get("symbol") or x.get("ticker")) for x in pool30 if normalize_symbol(x.get("symbol") or x.get("ticker"))}

    rows_prepared = prepare_rows(candidates, fundamental_map, m7_map, runtime_map, pool30_symbols)
    rows_scored = score_rows(rows_prepared)

    payload = {
        "source": "scripts/build_m1_scores.py",
        "version": "m1_scores_v1_0",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "formula": "M1_raw = 0.45*C2P + 0.30*CC + 0.25*M7n; M1_score = M1_raw / max(M1_raw) * 10",
        "input_paths": {
            "candidate": str(PATH_CANDIDATE.relative_to(ROOT)),
            "universe": str(PATH_UNIVERSE.relative_to(ROOT)),
            "pool30": str(PATH_POOL30.relative_to(ROOT)),
            "fundamental": str(PATH_FUNDAMENTAL.relative_to(ROOT)),
            "m7": str(PATH_M7.relative_to(ROOT)),
            "runtime": str(PATH_RUNTIME.relative_to(ROOT)),
        },
        "counts": {
            "universe": len(universe),
            "candidate": len(candidates),
            "scored": len(rows_scored),
            "m7_rows": len(m7_map),
            "runtime_rows": len(runtime_map),
        },
        "summary": build_summary(rows_scored),
        "rows": rows_scored,
    }

    write_json(PATH_OUT, payload)

    print(f"wrote={PATH_OUT.relative_to(ROOT)}")
    print(f"rows={len(rows_scored)}")
    print(f"max_m1_score={payload['summary']['max_m1_score']}")
    print(f"avg_m1_score={payload['summary']['avg_m1_score']}")
    print(f"cc_rank_counts={payload['summary']['cc_rank_counts']}")


if __name__ == "__main__":
    main()
