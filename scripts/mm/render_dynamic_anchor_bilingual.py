#!/usr/bin/env python3
"""Render bilingual (ZH first + EN key) explanation from dynamic-anchor preview JSON."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def main() -> None:
    parser = argparse.ArgumentParser(description="Render bilingual dynamic anchor explanation")
    parser.add_argument("--input", required=True, help="dynamic anchor preview json")
    parser.add_argument("--mapping", default="configs/mm/dynamic_anchor_display_zh_en_v1.json")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    preview = load_json(args.input)
    mapping = load_json(args.mapping)

    cat_map = mapping["category_sub"]
    mkt_map = mapping["market_regime"]
    ind_map = mapping["industry_regime"]

    rows_out = []
    for row in preview.get("rows", []):
        category_sub = row.get("category_sub", "")
        market_regime = row.get("market_regime", "")
        industry_regime = row.get("industry_regime", "")

        rows_out.append({
            "symbol": row.get("symbol"),
            "display": {
                "stock": f"股票：{row.get('symbol')}",
                "category_sub": f"細分類：{cat_map.get(category_sub, category_sub)}",
                "market_regime": f"市場狀態：{mkt_map.get(market_regime, market_regime)}",
                "industry_regime": f"產業狀態：{ind_map.get(industry_regime, industry_regime)}",
                "base_anchor": f"基準估值：{row.get('base_anchor')}x",
                "final_anchor": f"動態估值中樞：{row.get('final_anchor')}x",
                "anchor_range": f"估值區間：{row.get('anchor_floor')}x ~ {row.get('anchor_ceiling')}x"
            },
            "backend": {
                "symbol": row.get("symbol"),
                "category_sub": category_sub,
                "market_regime": market_regime,
                "industry_regime": industry_regime,
                "base_anchor": row.get("base_anchor"),
                "final_anchor": row.get("final_anchor")
            }
        })

    payload = {
        "generated_from": "scripts/mm/render_dynamic_anchor_bilingual.py",
        "source_preview": args.input,
        "mapping_config": args.mapping,
        "row_count": len(rows_out),
        "rows": rows_out
    }

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"✅ bilingual explanation -> {out_path} ({len(rows_out)} rows)")


if __name__ == "__main__":
    main()
