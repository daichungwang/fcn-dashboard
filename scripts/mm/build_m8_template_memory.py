#!/usr/bin/env python3
"""Build M8 Template Memory v1.

Inputs:
- data/mm/market_fcn_history.json
- data/mm/m8_template_surface.json

Output:
- data/mm/m8_template_memory.json

AI v0 only. Parent template guardrail:
MU parent > TSLA parent > AI Core / Semi parent > Other.
If a basket can be logically classified, it must not fall into Other.
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
MARKET_PATH = ROOT / "data" / "mm" / "market_fcn_history.json"
SURFACE_PATH = ROOT / "data" / "mm" / "m8_template_surface.json"
OUTPUT_PATH = ROOT / "data" / "mm" / "m8_template_memory.json"


def load_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8-sig"))


def as_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def avg(values: list[float | None]) -> float | None:
    usable = [value for value in values if value is not None]
    return round(mean(usable), 4) if usable else None


def normalize_symbols(value: Any) -> list[str]:
    if isinstance(value, list):
        raw = value
    elif isinstance(value, str):
        raw = value.replace("\uff0c", ",").replace("/", ",").replace("+", ",").split(",")
    else:
        raw = []
    return sorted({str(item).strip().upper() for item in raw if str(item).strip()})


def key_of(symbols: list[str]) -> str:
    return "+".join(symbols) if symbols else "UNKNOWN"


def classify_parent(symbols: list[str], surface_parent: str | None = None) -> str:
    symbol_set = set(symbols)
    if "MU" in symbol_set:
        return "B_MEMORY_SEMI_TACTICAL_MU_PARENT"
    if "TSLA" in symbol_set:
        return "D_SPECULATIVE_MOMENTUM_TSLA_PARENT"
    ai_names = {"NVDA", "TSM", "AVGO", "BAC", "QQQ", "SMH", "SNPS", "AAPL", "GOOG", "GOOGL", "ASML", "AMD", "ARM", "QCOM"}
    ai_hits = len(symbol_set & ai_names)
    ai_core = (
        {"TSM", "NVDA"}.issubset(symbol_set)
        or ("TSM" in symbol_set and bool(symbol_set & {"AVGO", "SNPS", "SMH"}))
        or ("NVDA" in symbol_set and bool(symbol_set & {"AVGO", "SMH", "BAC"}))
        or ai_hits >= 3
    )
    if ai_core:
        return "A_AI_CORE_INSTITUTIONAL"
    if surface_parent and surface_parent != "F_OTHERS_M7_BASKET_DRIVEN":
        return surface_parent
    return "F_OTHERS_M7_BASKET_DRIVEN"


def classify_reason(symbols: list[str], parent: str) -> str:
    if "MU_PARENT" in parent:
        return "MU found in basket; MU parent has priority over TSLA, AI Core, and Other."
    if "TSLA_PARENT" in parent:
        return "TSLA found and MU is absent; TSLA parent has priority over AI Core and Other."
    if parent == "A_AI_CORE_INSTITUTIONAL":
        return "AI/Semi structure detected, such as TSM/NVDA/AVGO/SNPS/SMH/BAC/QQQ theme."
    return "No priority symbol or AI/Semi pattern detected; kept in Other."


def residual_direction(value: float | None) -> str:
    if value is None:
        return "unknown"
    if value >= 1.0:
        return "market_higher"
    if value <= -1.0:
        return "market_lower"
    return "near_fair"


def beta_suggestion(direction: str, residual: float | None, sample_count: int) -> str:
    if residual is None:
        return "keep_observing"
    if sample_count < 3:
        return "wait_more_samples"
    if direction == "market_higher":
        return "raise_fair_or_add_overlay"
    if direction == "market_lower":
        return "lower_fair_or_review_risk"
    return "keep_current_beta"


def explain(symbols: list[str], parent: str, direction: str, residual: float | None) -> str:
    basket = ", ".join(symbols) if symbols else "this basket"
    reason = classify_reason(symbols, parent)
    if residual is None:
        return f"{basket} is classified as {parent}. {reason} No comparable M8 fair rate yet."
    if direction == "near_fair":
        return f"{basket} is classified as {parent}. {reason} Market coupon is close to M8 fair."
    return f"{basket} is classified as {parent}. {reason} Residual is {round(residual, 2)} points."


def get_surface_small_templates(surface: dict[str, Any]) -> dict[str, dict[str, Any]]:
    raw = surface.get("small_templates") or {}
    if isinstance(raw, dict):
        return {str(k): v for k, v in raw.items() if isinstance(v, dict)}
    return {}


def build_memory() -> dict[str, Any]:
    market_rows = load_json(MARKET_PATH, [])
    if isinstance(market_rows, dict):
        market_rows = market_rows.get("rows", [])
    market_rows = [row for row in market_rows if isinstance(row, dict)]
    surface = load_json(SURFACE_PATH, {})
    surface_small = get_surface_small_templates(surface if isinstance(surface, dict) else {})

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in market_rows:
        grouped[key_of(normalize_symbols(row.get("symbols") or row.get("basket")))].append(row)

    memories = []
    for key in sorted(set(grouped.keys()) | set(surface_small.keys())):
        rows = grouped.get(key, [])
        surface_row = surface_small.get(key, {})
        symbols = normalize_symbols(surface_row.get("match_symbols") or key)
        parent = classify_parent(symbols, surface_row.get("parent_template"))
        coupons = [as_number(row.get("coupon_pct") or row.get("coupon")) for row in rows]
        market_coupon = avg(coupons)
        if market_coupon is None:
            market_coupon = as_number(surface_row.get("avg_market_coupon"))
        avg_new_fair = as_number(surface_row.get("avg_new_fair_rate"))
        avg_final_fair = as_number(surface_row.get("avg_final_fair_rate"))
        residual_new = None if market_coupon is None or avg_new_fair is None else market_coupon - avg_new_fair
        residual_final = None if market_coupon is None or avg_final_fair is None else market_coupon - avg_final_fair
        residual = residual_final if residual_final is not None else residual_new
        direction = residual_direction(residual)
        sample_count = len(rows) if rows else int(as_number(surface_row.get("count")) or 0)
        latest = max(rows, key=lambda row: str(row.get("generated_at") or row.get("date") or "")) if rows else {}
        ids = [str(row.get("product_id") or row.get("fcn_id") or row.get("id") or "").strip() for row in rows]
        ids = [item for item in ids if item] or [str(item) for item in surface_row.get("sample_ids", []) if item]
        row_dirs = [residual_direction(coupon - avg_new_fair) for coupon in coupons if coupon is not None and avg_new_fair is not None]
        consistent = bool(row_dirs) and len(set(row_dirs)) == 1 and row_dirs[0] != "near_fair"
        high_residual = residual is not None and abs(residual) >= 2.0
        beta = beta_suggestion(direction, residual, sample_count)
        memories.append({
            "template_id": surface_row.get("template_id") or key,
            "parent_template": parent,
            "classification_reason": classify_reason(symbols, parent),
            "small_template_key": key,
            "symbols": symbols,
            "sample_count": sample_count,
            "last_market_coupon": as_number(latest.get("coupon_pct") or latest.get("coupon")) if latest else market_coupon,
            "avg_market_coupon": market_coupon,
            "avg_new_fair": avg_new_fair,
            "avg_final_fair": avg_final_fair,
            "residual_market_minus_new": None if residual_new is None else round(residual_new, 4),
            "residual_market_minus_final": None if residual_final is None else round(residual_final, 4),
            "residual_direction": direction,
            "residual_direction_consistent": consistent,
            "high_residual": high_residual,
            "beta_suggestion": beta,
            "confidence": surface_row.get("confidence") or ("medium" if sample_count >= 5 and residual is not None else "low" if sample_count >= 3 else "observe"),
            "last_seen_date": latest.get("generated_at") or latest.get("date") or surface_row.get("latest_observation_date"),
            "source_trade_ids": ids,
            "surface_hit": bool(surface_row),
            "promote_to_template_candidate": sample_count >= 3 and consistent and not bool(surface_row),
            "needs_overlay": high_residual or beta in {"raise_fair_or_add_overlay", "lower_fair_or_review_risk"},
            "memory_trend": "stable" if direction == "near_fair" else "persistent" if sample_count >= 3 else "forming",
            "explainability": explain(symbols, parent, direction, residual),
            "note": "AI v0 rule output only. No ML model is used."
        })

    return {
        "version": "m8_template_memory_v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": {"market_fcn_history": "data/mm/market_fcn_history.json", "m8_template_surface": "data/mm/m8_template_surface.json"},
        "summary": {
            "template_count": len(memories),
            "active_memory_count": sum(1 for item in memories if item["sample_count"] > 0),
            "candidate_template_count": sum(1 for item in memories if item["promote_to_template_candidate"]),
            "high_residual_template_count": sum(1 for item in memories if item["high_residual"]),
            "market_trade_count": len(market_rows),
            "surface_small_template_count": len(surface_small)
        },
        "ai_v0": {"parent_classification_priority": "MU > TSLA > AI Core / Semi > Other", "is_real_ml": False},
        "memories": memories
    }


def main() -> None:
    payload = build_memory()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT)}")
    print(json.dumps(payload["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
