#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build M1 normalized scores for MM decision center.

Output: data/m1/m1_scores.json

V2 principle:
- MM must know every relevant stock, not only candidate_80.
- Score everything possible, then mark scope / missing fields / fallback usage.
- Do not hide COIN-like names just because EPS or candidate membership is incomplete.

Formula:
  M1_raw   = 0.45*C2P + 0.30*CC + 0.25*M7n
  M1_score = M1_raw / max(M1_raw across all relevant MM stocks) * 10
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, pstdev
from typing import Any, Dict, Iterable, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]

PATHS = {
    "candidate": ROOT / "data/m1/m1_candidate_80.json",
    "universe": ROOT / "data/m1/universe_150.json",
    "pool30": ROOT / "data/pool30.json",
    "total_pool": ROOT / "data/m1/pool_stock_evaluated_v1.json",
    "fundamental": ROOT / "data/m1/m1_fundamental_map.json",
    "m7": ROOT / "data/m7_sandbox/m7_v2_scores.json",
    "runtime": ROOT / "data/market_runtime.json",
    "profile_deep": ROOT / "data/m1/m1_stock_profile.json",
    "profile_all": ROOT / "data/m1/m1_stock_profile_all.json",
    "fcn_pool": ROOT / "data/fcn_pool.json",
    "m2_exposure": ROOT / "data/m7/m2_stock_exposure.json",
}
PATH_OUT = ROOT / "data/m1/m1_scores.json"

CATEGORY_ORDER = ["core", "growth", "income", "defensive", "speculative"]
ETF_FORCE_DEFENSIVE = {"QQQ", "SMH", "SPY", "LQD", "XLU", "VPU", "XLF", "XLV", "XLE", "XLP", "VOLT", "ZAP"}
DEFAULT_COMPONENT_SCORE = 5.999


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


def to_float(v: Any, default: Optional[float] = None) -> Optional[float]:
    if v is None or isinstance(v, bool):
        return default
    try:
        x = float(v)
    except (TypeError, ValueError):
        return default
    return x if math.isfinite(x) else default


def r2(v: Any) -> Optional[float]:
    x = to_float(v)
    return None if x is None else round(x, 2)


def sym(v: Any) -> str:
    return str(v or "").strip().upper()


def as_list(raw: Any) -> List[Dict[str, Any]]:
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, dict)]
    if isinstance(raw, dict):
        for k in ("rows", "data", "items", "stocks", "scores", "results", "all", "active", "positions"):
            if isinstance(raw.get(k), list):
                return [x for x in raw[k] if isinstance(x, dict)]
        return [{"symbol": v.get("symbol", k), **v} for k, v in raw.items() if isinstance(v, dict)]
    return []


def symbol_map(raw: Any) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for row in as_list(raw):
        s = sym(row.get("symbol") or row.get("ticker") or row.get("underlying") or row.get("underlying_symbol"))
        if s:
            out[s] = row
    return out


def symbol_set(raw: Any) -> set[str]:
    return set(symbol_map(raw).keys())


def fcn_symbol_set(raw: Any) -> set[str]:
    out = set()
    for row in as_list(raw):
        s = sym(row.get("symbol") or row.get("ticker") or row.get("underlying") or row.get("underlying_symbol") or row.get("stock_symbol"))
        if s:
            out.add(s)
    return out


def normalize_category(row: Dict[str, Any], fallback: str = "speculative") -> str:
    s = sym(row.get("symbol"))
    if s in ETF_FORCE_DEFENSIVE:
        return "defensive"
    raw = str(row.get("category") or row.get("m1_category") or fallback or "").lower()
    for cat in CATEGORY_ORDER:
        if cat in raw:
            return cat
    return fallback if fallback in CATEGORY_ORDER else "speculative"


def map_range_score(x: Optional[float], bands: Iterable[Tuple[float, float]]) -> Optional[float]:
    if x is None:
        return None
    b = list(bands)
    for minimum, score in b:
        if x >= minimum:
            return score
    return b[-1][1]


def calc_fundamental_score(f: Dict[str, Any]) -> Optional[float]:
    if not isinstance(f, dict) or not f:
        return None
    capex = to_float(f.get("capex_ratio_prev_y"))
    rev = to_float(f.get("revenue_growth_q"))
    opg = to_float(f.get("operating_income_growth_q"))
    opq = to_float(f.get("operating_income_q"))
    capex_score = map_range_score(capex, [(15, 10), (12, 8.5), (9, 7), (6, 5.5), (3, 4), (0, 2.5)])
    rev_score = map_range_score(rev, [(30, 10), (20, 8.5), (10, 7), (5, 5.5), (0, 4), (-999, 2)])
    opg_score = map_range_score(opg, [(40, 10), (25, 8.5), (15, 7), (5, 5.5), (0, 4), (-999, 2)])
    size_score = map_range_score(opq, [(12000, 10), (8000, 8.5), (4000, 7), (1000, 5.5), (1, 4), (0, 2)])
    parts = []
    if capex_score is not None: parts.append((0.4, capex_score))
    if rev_score is not None: parts.append((0.2, rev_score))
    if opg_score is not None: parts.append((0.3, opg_score))
    if size_score is not None: parts.append((0.1, size_score))
    if not parts:
        return None
    return round(sum(w * v for w, v in parts) / sum(w for w, _ in parts), 2)


def eps_coverage(eps: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(eps, dict) or not eps:
        return {"grade": "D", "history_count": 0, "forward_count": 0, "source": "missing_eps_engine", "confidence": "low", "label": "Global / ETF / Proxy"}
    h = int(to_float(eps.get("eps_regression_sample_count"), 0) or 0)
    f = sum(1 for k in ("eps_2025", "eps_2026", "eps_2027") if to_float(eps.get(k)) is not None)
    raw_rank = str(eps.get("cc_rank") or eps.get("eps_coverage_rank") or "").upper().strip()
    grade = raw_rank if raw_rank in {"A", "B", "C", "D"} else ""
    if not grade:
        status = str(eps.get("eps_status") or eps.get("cc_source") or "")
        if status == "actual_history_plus_eps_regression" and h >= 3 and f >= 2:
            grade = "A"
        elif status == "runtime_fundamental_fallback":
            grade = "C"
        elif h >= 1 or f >= 1 or status == "eps_regression_partial":
            grade = "B"
        else:
            grade = "D"
    labels = {"A": "Full EPS", "B": "Partial EPS", "C": "Runtime Fundamentals", "D": "Global / ETF / Proxy"}
    return {"grade": grade, "history_count": h, "forward_count": f, "source": eps.get("cc_source") or eps.get("eps_status") or "-", "confidence": eps.get("cc_confidence") or eps.get("confidence") or "-", "label": eps.get("cc_rank_label") or labels[grade]}


def normalize_daily_return(rt: Dict[str, Any]) -> Optional[float]:
    if not isinstance(rt, dict):
        return None
    v = to_float(rt.get("ret_d1"))
    if v is not None:
        return v
    v = to_float(rt.get("ret_1d"))
    if v is None:
        return None
    return v / 100 if abs(v) > 1 else v


def merge_row(s: str, maps: Dict[str, Dict[str, Dict[str, Any]]]) -> Dict[str, Any]:
    merged: Dict[str, Any] = {"symbol": s}
    for key in ("runtime", "m7", "profile_all", "profile_deep", "universe", "candidate", "pool30", "total_pool"):
        row = maps.get(key, {}).get(s, {})
        if isinstance(row, dict):
            merged.update(row)
    merged["symbol"] = s
    return merged


def scope_for(s: str, sets: Dict[str, set[str]]) -> Dict[str, Any]:
    is_candidate = s in sets["candidate"]
    is_universe = s in sets["universe"]
    is_pool30 = s in sets["pool30"]
    is_total_pool = s in sets["total_pool"]
    has_deep_profile = s in sets["profile_deep"]
    has_generic_profile = s in sets["profile_all"]
    is_m6_active = s in sets["fcn_pool"] or s in sets["m2_exposure"]
    has_m7 = s in sets["m7"]
    has_runtime = s in sets["runtime"]
    has_profile = has_deep_profile or has_generic_profile

    if is_candidate:
        scope = "candidate"
    elif is_universe:
        scope = "universe"
    elif is_pool30 or is_total_pool or has_profile or is_m6_active:
        scope = "forced_relevant"
    elif has_m7 or has_runtime:
        scope = "market_runtime_only"
    else:
        scope = "unknown"

    flags: List[str] = []
    if not is_candidate: flags.append("not_in_candidate_80")
    if not is_universe: flags.append("not_in_universe_150")
    if is_pool30 and not is_candidate: flags.append("pool30_not_in_candidate")
    if is_total_pool and not is_candidate: flags.append("total_pool_not_in_candidate")
    if is_m6_active and not is_candidate: flags.append("m6_or_m2_active_not_in_candidate")
    if has_deep_profile and not is_candidate: flags.append("deep_profile_not_in_candidate")
    if not has_m7: flags.append("missing_m7")
    if not has_runtime: flags.append("missing_runtime")

    return {
        "m1_scope": scope,
        "is_candidate": is_candidate,
        "is_universe": is_universe,
        "is_pool30": is_pool30,
        "is_total_pool": is_total_pool,
        "has_profile": has_profile,
        "has_deep_profile": has_deep_profile,
        "has_generic_profile": has_generic_profile,
        "is_m6_active": is_m6_active,
        "has_m7": has_m7,
        "has_runtime": has_runtime,
        "problem_flags": flags,
    }


def prepare_row(s: str, maps: Dict[str, Dict[str, Dict[str, Any]]], fundamental: Dict[str, Any], sets: Dict[str, set[str]]) -> Dict[str, Any]:
    base = merge_row(s, maps)
    f = fundamental.get(s, {}) if isinstance(fundamental, dict) else {}
    m7 = maps["m7"].get(s, {})
    rt = maps["runtime"].get(s, {})
    eps = m7.get("eps_engine") or {}
    cov = eps_coverage(eps)

    capex_score = calc_fundamental_score(f)
    cc = to_float(eps.get("cc_score"))
    cc_raw = to_float(eps.get("cc_raw_score") if eps.get("cc_raw_score") is not None else eps.get("cc_score"))
    m7n = to_float(m7.get("m7_v2_score"))

    missing = []
    if not f: missing.append("fundamental_map")
    if not eps: missing.append("eps_engine")
    if not rt: missing.append("runtime")
    if capex_score is None: missing.append("capex_score")
    if cc is None: missing.append("cc_score")
    if m7n is None: missing.append("m7_v2_score")

    fallback_missing = []
    if capex_score is None: fallback_missing.append("capex_score")
    if cc is None: fallback_missing.append("competitive_score")
    if m7n is None: fallback_missing.append("m7_v2_score")

    cat_fallback = normalize_category(m7) if m7.get("category") else "speculative"
    if base.get("category"):
        cat_fallback = normalize_category(base)

    profile_source = "deep" if s in maps["profile_deep"] else "generic" if s in maps["profile_all"] else "none"
    scope = scope_for(s, sets)

    price_now = to_float(rt.get("price_now") or rt.get("price") or rt.get("last_price") or rt.get("close") or rt.get("current_price") or m7.get("price_now") or base.get("price_now") or base.get("price") or m7.get("regression_actual_price_now"))

    return {
        **base,
        "symbol": s,
        "name": base.get("name") or base.get("company_name") or m7.get("name") or rt.get("name") or s,
        "category": normalize_category(base, cat_fallback),
        "subsector": base.get("subsector") or base.get("sub_category") or base.get("category_sub") or m7.get("subsector") or "",
        "category_sub": base.get("category_sub") or m7.get("category_sub") or base.get("subsector") or "",
        "sector": base.get("sector") or m7.get("sector") or "",
        **scope,
        "profile_source": profile_source,
        "capex_score": capex_score,
        "competitive_score": cc,
        "competitive_raw_score": cc_raw,
        "m7_v2_score": m7n,
        "eps_coverage_grade": cov["grade"],
        "eps_rank_label": cov["label"],
        "eps_cc_source": cov["source"],
        "eps_cc_confidence": cov["confidence"],
        "eps_history_count": cov["history_count"],
        "eps_forward_count": cov["forward_count"],
        "eps_future_profit_score": to_float(eps.get("future_profit_score")),
        "eps_future_growth_score": to_float(eps.get("future_growth_score")),
        "eps_consistency_score": to_float(eps.get("middle_consistency_score") if eps.get("middle_consistency_score") is not None else eps.get("consistency")),
        "eps_quality_score": to_float(eps.get("quality_score") if eps.get("quality_score") is not None else eps.get("quality")),
        "eps_future_growth_rate": to_float(eps.get("future_growth_rate")),
        "eps_warnings": eps.get("warnings") if isinstance(eps.get("warnings"), list) else [],
        "price_now": price_now,
        "ret_1d": normalize_daily_return(rt),
        "volume_ratio": to_float(rt.get("volume_ratio") or m7.get("volume_ratio")),
        "missing_fields": sorted(set(missing)),
        "fallback_missing_components": fallback_missing,
        "source_trace": {
            "candidate": scope["is_candidate"],
            "universe": scope["is_universe"],
            "pool30": scope["is_pool30"],
            "total_pool": scope["is_total_pool"],
            "profile": scope["has_profile"],
            "profile_source": profile_source,
            "m6_or_m2_active": scope["is_m6_active"],
            "fundamental": bool(f),
            "m7": bool(m7),
            "runtime": bool(rt),
            "eps_engine": bool(eps),
        },
    }


def compute_raw(row: Dict[str, Any]) -> Dict[str, Any]:
    c2p = to_float(row.get("capex_score"), DEFAULT_COMPONENT_SCORE)
    cc = to_float(row.get("competitive_score"), DEFAULT_COMPONENT_SCORE)
    m7n = to_float(row.get("m7_v2_score"), DEFAULT_COMPONENT_SCORE)
    raw = 0.45 * c2p + 0.30 * cc + 0.25 * m7n
    return {
        "raw_m1_score": round(raw, 2),
        "breakdown": {
            "capex_score": r2(c2p),
            "competitive_score": r2(cc),
            "m7_v2_score": r2(m7n),
            "m3_score": None,
            "m7_score": r2(m7n),
            "weights": {"capex_score": 0.45, "competitive_score": 0.30, "m7_v2_score": 0.25},
            "fallback_used": {
                "capex_score": row.get("capex_score") is None,
                "competitive_score": row.get("competitive_score") is None,
                "m7_v2_score": row.get("m7_v2_score") is None,
            },
            "fallback_default": DEFAULT_COMPONENT_SCORE,
        },
    }


def score_quality(row: Dict[str, Any]) -> str:
    fallback_count = sum(1 for v in row.get("breakdown", {}).get("fallback_used", {}).values() if v)
    cc_grade = str(row.get("eps_coverage_grade") or "D").upper()
    if fallback_count == 0 and cc_grade in {"A", "B"}: return "A"
    if fallback_count <= 1 and cc_grade in {"A", "B", "C"}: return "B"
    if fallback_count <= 2: return "C"
    return "D"


def decision_status(row: Dict[str, Any]) -> str:
    if row.get("is_candidate"): return "CANDIDATE_SCORE"
    if row.get("is_pool30") or row.get("is_total_pool"): return "POOL_OR_TOTAL_POOL_REFERENCE"
    if row.get("is_m6_active"): return "M6_ACTIVE_REFERENCE"
    if row.get("has_profile"): return "PROFILE_REFERENCE"
    if row.get("is_universe"): return "UNIVERSE_REFERENCE"
    return "REFERENCE_ONLY"


def score_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    computed = [{**row, **compute_raw(row)} for row in rows]
    max_raw = max((to_float(r.get("raw_m1_score"), 0) or 0 for r in computed), default=0)
    for row in computed:
        raw = to_float(row.get("raw_m1_score"))
        row["M1_score"] = 0 if raw is None or max_raw <= 0 else round(raw / max_raw * 10, 2)
        row["m1_score"] = row["M1_score"]
        row["score_quality"] = score_quality(row)
        row["decision_status"] = decision_status(row)
        row["score_basis"] = "official_candidate_score" if row.get("is_candidate") else "reference_score_marked_by_scope"
    computed.sort(key=lambda r: to_float(r.get("M1_score"), -999) or -999, reverse=True)
    for idx, row in enumerate(computed, 1):
        row["rank"] = idx
        row["rank_all"] = idx
    for idx, row in enumerate([r for r in computed if r.get("is_candidate")], 1):
        row["rank_candidate"] = idx
    return computed


def stats(vals: List[float]) -> Dict[str, Optional[float]]:
    if not vals: return {"mean": None, "std": None, "cv": None}
    m = mean(vals)
    sd = pstdev(vals) if len(vals) > 1 else 0.0
    return {"mean": round(m, 2), "std": round(sd, 2), "cv": round(sd / m, 4) if m else None}


def summary(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    cc_counts = {"A": 0, "B": 0, "C": 0, "D": 0}
    quality_counts = {"A": 0, "B": 0, "C": 0, "D": 0}
    category_counts = {k: 0 for k in CATEGORY_ORDER}
    scope_counts: Dict[str, int] = {}
    problem_counts: Dict[str, int] = {}
    for row in rows:
        cc_counts[str(row.get("eps_coverage_grade") or "D").upper() if str(row.get("eps_coverage_grade") or "D").upper() in cc_counts else "D"] += 1
        quality_counts[str(row.get("score_quality") or "D").upper() if str(row.get("score_quality") or "D").upper() in quality_counts else "D"] += 1
        cat = str(row.get("category") or "speculative").lower()
        category_counts[cat] = category_counts.get(cat, 0) + 1
        sc = str(row.get("m1_scope") or "unknown")
        scope_counts[sc] = scope_counts.get(sc, 0) + 1
        for flag in row.get("problem_flags", []):
            problem_counts[flag] = problem_counts.get(flag, 0) + 1
    vals = [to_float(r.get("M1_score")) for r in rows]
    vals = [x for x in vals if x is not None]
    cvals = [to_float(r.get("M1_score")) for r in rows if r.get("is_candidate")]
    cvals = [x for x in cvals if x is not None]
    return {
        "total": len(rows),
        "candidate_count": sum(1 for r in rows if r.get("is_candidate")),
        "universe_count": sum(1 for r in rows if r.get("is_universe")),
        "pool30_count": sum(1 for r in rows if r.get("is_pool30")),
        "total_pool_count": sum(1 for r in rows if r.get("is_total_pool")),
        "profile_count": sum(1 for r in rows if r.get("has_profile")),
        "deep_profile_count": sum(1 for r in rows if r.get("has_deep_profile")),
        "m6_active_count": sum(1 for r in rows if r.get("is_m6_active")),
        "avg_m1_score": round(mean(vals), 2) if vals else None,
        "max_m1_score": round(max(vals), 2) if vals else None,
        "min_m1_score": round(min(vals), 2) if vals else None,
        "score_stats_all": stats(vals),
        "score_stats_candidate": stats(cvals),
        "cc_rank_counts": cc_counts,
        "score_quality_counts": quality_counts,
        "category_counts": category_counts,
        "scope_counts": dict(sorted(scope_counts.items())),
        "problem_counts": dict(sorted(problem_counts.items())),
    }


def main() -> None:
    raw = {k: read_json(p, [] if k in {"candidate", "universe", "pool30", "fcn_pool"} else {}) for k, p in PATHS.items()}
    maps = {k: symbol_map(raw[k]) for k in ("candidate", "universe", "pool30", "total_pool", "m7", "runtime", "profile_deep", "profile_all", "m2_exposure")}
    sets = {k: set(maps[k].keys()) for k in maps}
    sets["fcn_pool"] = fcn_symbol_set(raw["fcn_pool"])

    all_symbols = sorted(set().union(*sets.values()))
    rows = [prepare_row(s, maps, raw["fundamental"], sets) for s in all_symbols]
    scored = score_rows(rows)
    payload = {
        "source": "scripts/build_m1_scores.py",
        "version": "m1_scores_v2_0_decision_center",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "formula": "M1_raw = 0.45*C2P + 0.30*CC + 0.25*M7n; M1_score = M1_raw / max(M1_raw across all relevant MM stocks) * 10",
        "principle": "Score every MM-relevant stock when possible; mark scope, data quality, missing fields, fallback usage, and problem flags instead of hiding missing-data names.",
        "input_paths": {k: str(p.relative_to(ROOT)) for k, p in PATHS.items()},
        "counts": {
            "candidate": len(sets["candidate"]), "universe": len(sets["universe"]), "pool30": len(sets["pool30"]),
            "total_pool": len(sets["total_pool"]), "profile_deep": len(sets["profile_deep"]), "profile_all": len(sets["profile_all"]),
            "fcn_symbols": len(sets["fcn_pool"]), "m2_symbols": len(sets["m2_exposure"]), "m7_rows": len(sets["m7"]),
            "runtime_rows": len(sets["runtime"]), "scored": len(scored),
        },
        "summary": summary(scored),
        "rows": scored,
    }
    write_json(PATH_OUT, payload)
    print(f"wrote={PATH_OUT.relative_to(ROOT)}")
    print(f"version={payload['version']}")
    print(f"rows={len(scored)}")
    print(f"scope_counts={payload['summary']['scope_counts']}")
    print(f"problem_counts={payload['summary']['problem_counts']}")


if __name__ == "__main__":
    main()
