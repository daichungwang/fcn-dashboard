#!/usr/bin/env python3
"""Check M1 universe ticker coverage in the stock profile file.

This script intentionally does not modify data/m1/m1_stock_profile.json. It only
writes a missing-coverage report to data/m1/m1_stock_profile_missing_report.json
and exits successfully even when missing tickers are found, so scheduled checks can
surface warnings without failing the workflow.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT = Path(__file__).resolve().parents[2]
UNIVERSE_PATH = REPO_ROOT / "data" / "m1" / "universe_150.json"
PROFILE_PATH = REPO_ROOT / "data" / "m1" / "m1_stock_profile.json"
REPORT_PATH = REPO_ROOT / "data" / "m1" / "m1_stock_profile_missing_report.json"


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as fp:
        return json.load(fp)


def normalize_ticker(value: Any) -> str | None:
    if value is None:
        return None

    ticker = str(value).strip().upper()
    return ticker or None


def extract_universe_tickers(universe: Any) -> list[str]:
    """Extract unique tickers from the universe file while preserving order."""
    raw_tickers: Iterable[Any]

    if isinstance(universe, list):
        raw_tickers = (
            item.get("symbol", item.get("ticker")) if isinstance(item, dict) else item
            for item in universe
        )
    elif isinstance(universe, dict):
        for key in ("rows", "data", "universe", "tickers", "symbols"):
            if isinstance(universe.get(key), list):
                return extract_universe_tickers(universe[key])
        raw_tickers = universe.keys()
    else:
        raise TypeError("universe_150.json must be a list or object")

    seen: set[str] = set()
    tickers: list[str] = []
    for raw_ticker in raw_tickers:
        ticker = normalize_ticker(raw_ticker)
        if ticker and ticker not in seen:
            seen.add(ticker)
            tickers.append(ticker)

    return tickers


def extract_profile_tickers(profile: Any) -> set[str]:
    """Extract tickers covered by the stock profile file."""
    tickers: set[str] = set()

    if isinstance(profile, dict):
        for key, value in profile.items():
            ticker = normalize_ticker(key)
            if ticker and ticker != "QUALITY_CHECK":
                tickers.add(ticker)

            if isinstance(value, dict):
                value_ticker = normalize_ticker(value.get("symbol", value.get("ticker")))
                if value_ticker:
                    tickers.add(value_ticker)
        return tickers

    if isinstance(profile, list):
        for item in profile:
            if isinstance(item, dict):
                ticker = normalize_ticker(item.get("symbol", item.get("ticker")))
            else:
                ticker = normalize_ticker(item)
            if ticker:
                tickers.add(ticker)
        return tickers

    raise TypeError("m1_stock_profile.json must be a list or object")


def build_report() -> dict[str, Any]:
    universe = load_json(UNIVERSE_PATH)
    profile = load_json(PROFILE_PATH)

    universe_tickers = extract_universe_tickers(universe)
    profile_tickers = extract_profile_tickers(profile)
    missing_tickers = [ticker for ticker in universe_tickers if ticker not in profile_tickers]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "status": "missing" if missing_tickers else "ok",
        "inputs": {
            "universe": str(UNIVERSE_PATH.relative_to(REPO_ROOT)),
            "stock_profile": str(PROFILE_PATH.relative_to(REPO_ROOT)),
        },
        "summary": {
            "universe_ticker_count": len(universe_tickers),
            "profile_ticker_count": len(profile_tickers),
            "missing_ticker_count": len(missing_tickers),
        },
        "missing_tickers": missing_tickers,
    }


def main() -> int:
    report = build_report()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with REPORT_PATH.open("w", encoding="utf-8") as fp:
        json.dump(report, fp, ensure_ascii=False, indent=2)
        fp.write("\n")

    missing_tickers = report["missing_tickers"]
    print(f"Wrote {REPORT_PATH.relative_to(REPO_ROOT)}")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))

    if missing_tickers:
        message = (
            f"Missing {len(missing_tickers)} M1 stock profile ticker(s): "
            + ", ".join(missing_tickers)
        )
        print(f"::warning file={PROFILE_PATH.relative_to(REPO_ROOT)}::{message}")
    else:
        print("All universe tickers are covered by m1_stock_profile.json.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
