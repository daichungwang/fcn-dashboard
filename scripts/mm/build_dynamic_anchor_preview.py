#!/usr/bin/env python3
"""Phase-1 sandbox Dynamic Anchor Regime Engine.

- MM parameters are fully externalized in config JSON.
- No production flow rewrite.
- Produces explainable per-symbol dynamic-anchor preview.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def compute_dynamic_anchor(
    row: dict[str, Any],
    config: dict[str, Any],
    market_regime: str,
    industry_regime: str,
) -> dict[str, Any]:
    category_sub = row.get("category_sub", "")

    base_map = config["base_anchor_by_category_sub"]
    family_map = config["category_family_map"]
    market_map = config["market_regimes"]
    industry_map = config["industry_regimes"]
    caps = config["caps"]
    band_map = config["tolerance_bands"]
    archetype_defs = config.get("valuation_archetypes", {})
    default_archetype_map = config.get("default_archetype_by_category_sub", {})
    symbol_archetype_map = config.get("symbol_archetype_overrides", {})

    if category_sub not in base_map:
        raise KeyError(f"missing base anchor for category_sub={category_sub}")
    if market_regime not in market_map:
        raise KeyError(f"unknown market_regime={market_regime}")
    if industry_regime not in industry_map:
        raise KeyError(f"unknown industry_regime={industry_regime}")

    base_anchor = float(base_map[category_sub])
    family = family_map.get(category_sub, "other")

    market_multiplier = float(market_map[market_regime]["multiplier"])

    industry_rule = industry_map[industry_regime]
    industry_multiplier = float(industry_rule.get("default_multiplier", 1.0))
    industry_multiplier = float(industry_rule.get("family_multipliers", {}).get(family, industry_multiplier))

    symbol = str(row.get("symbol", ""))
    valuation_archetype = symbol_archetype_map.get(symbol) or default_archetype_map.get(category_sub, "BASELINE")
    archetype_rule = archetype_defs.get(valuation_archetype, {"multiplier": 1.0})
    archetype_multiplier = float(archetype_rule.get("multiplier", 1.0))

    raw_final = base_anchor * market_multiplier * industry_multiplier * archetype_multiplier

    up_cap = 1.0 + float(caps["max_adjustment_up_pct"])
    down_cap = 1.0 - float(caps["max_adjustment_down_pct"])
    capped_by_adjustment = clamp(raw_final, base_anchor * down_cap, base_anchor * up_cap)
    final_anchor = clamp(capped_by_adjustment, float(caps["min_final_anchor"]), float(caps["max_final_anchor"]))

    digits = int(caps.get("round_digits", 2))
    tolerance_band = float(band_map.get(market_regime, band_map.get("normal", 0.15)))

    return {
        "symbol": row.get("symbol"),
        "category_sub": category_sub,
        "industry_family": family,
        "valuation_archetype": valuation_archetype,
        "base_anchor": round(base_anchor, digits),
        "market_regime": market_regime,
        "market_multiplier": round(market_multiplier, digits),
        "industry_regime": industry_regime,
        "industry_multiplier": round(industry_multiplier, digits),
        "archetype_multiplier": round(archetype_multiplier, digits),
        "raw_final_anchor": round(raw_final, digits),
        "final_anchor": round(final_anchor, digits),
        "anchor_floor": round(final_anchor * (1.0 - tolerance_band), digits),
        "anchor_ceiling": round(final_anchor * (1.0 + tolerance_band), digits),
        "tolerance_band": round(tolerance_band, digits),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build sandbox dynamic-anchor preview from MM config")
    parser.add_argument("--universe", default="data/m1/universe_150.json")
    parser.add_argument("--config", default="configs/mm/dynamic_anchor_regime_v1.json")
    parser.add_argument("--market-regime", default="normal")
    parser.add_argument("--industry-regime", default="industrial_normal")
    parser.add_argument("--output", default="data/m1_sandbox/dynamic_anchor_preview.json")
    parser.add_argument("--symbols", nargs="*", default=[])
    args = parser.parse_args()

    universe = load_json(Path(args.universe))
    cfg = load_json(Path(args.config))

    rows = universe
    if args.symbols:
        wanted = {s.upper() for s in args.symbols}
        rows = [r for r in universe if str(r.get("symbol", "")).upper() in wanted]

    out_rows = [
        compute_dynamic_anchor(r, cfg, args.market_regime, args.industry_regime)
        for r in rows
    ]

    payload = {
        "generated_from": "scripts/mm/build_dynamic_anchor_preview.py",
        "parameter_config": args.config,
        "market_regime": args.market_regime,
        "industry_regime": args.industry_regime,
        "row_count": len(out_rows),
        "rows": out_rows,
    }

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"✅ dynamic anchor preview -> {out_path} ({len(out_rows)} rows)")


if __name__ == "__main__":
    main()
