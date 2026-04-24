#!/usr/bin/env python3
from __future__ import annotations

import json
from datetime import timedelta
from pathlib import Path

import pandas as pd
import yfinance as yf

SRC = Path("data/market_runtime.json")
OUT = Path("data/runtime_staging/market_runtime_long_horizon.json")

SHORT_RET_MAP = {
    "1d": "ret_1d",
    "1w": "ret_1w",
    "1m": "ret_1m",
    "3m": "ret_3m",
    "6m": "ret_6m",
    "12m": "ret_12m",
}

SWING_KEYS = ["d1", "d2", "d3", "d4", "d5"]
LONG_YEARS = {"3y": 3, "5y": 5, "10y": 10}
REF_KEYS = ["d1", "d2", "d3", "d4", "d5", "1w", "1m", "3m", "6m", "12m", "3y", "5y", "10y"]


def num(x):
    try:
        if x is None:
            return None
        v = float(x)
        if v != v or v in (float("inf"), float("-inf")):
            return None
        return v
    except Exception:
        return None


def to_ref(price_now, ret):
    if price_now is None or ret is None or (1.0 + ret) == 0:
        return None
    return round(price_now / (1.0 + ret), 6)


def _hist_close_series(symbol: str) -> pd.Series | None:
    try:
        hist = yf.Ticker(symbol).history(period="10y", auto_adjust=False)
    except Exception:
        return None
    if hist is None or hist.empty or "Close" not in hist:
        return None
    close = hist["Close"].dropna()
    if close.empty:
        return None
    return close


def _nearest_close(close: pd.Series, target_ts: pd.Timestamp) -> float | None:
    if close is None or close.empty:
        return None
    idx = close.index
    target = target_ts.tz_localize(None) if target_ts.tzinfo else target_ts
    idx_naive = idx.tz_localize(None) if getattr(idx, "tz", None) is not None else idx
    pos = idx_naive.searchsorted(target)
    candidates = []
    if 0 <= pos < len(idx_naive):
        candidates.append(pos)
    if pos - 1 >= 0:
        candidates.append(pos - 1)
    if not candidates:
        return None
    best = min(candidates, key=lambda i: abs((idx_naive[i] - target).days))
    return num(close.iloc[best])


def _compute_long_refs_from_yf(symbol: str, price_now: float | None) -> dict[str, float | None]:
    out = {"price_ref_3y": None, "price_ref_5y": None, "price_ref_10y": None, "ret_3y": None, "ret_5y": None, "ret_10y": None}
    if price_now is None:
        return out

    close = _hist_close_series(symbol)
    if close is None:
        return out

    last_ts = close.index[-1]
    for k, years in LONG_YEARS.items():
        target_ts = (last_ts.tz_localize(None) if getattr(last_ts, "tzinfo", None) else last_ts) - timedelta(days=365 * years)
        ref_price = _nearest_close(close, pd.Timestamp(target_ts))
        out[f"price_ref_{k}"] = ref_price
        out[f"ret_{k}"] = None if ref_price in (None, 0) else round(price_now / ref_price - 1.0, 6)
    return out


def main():
    raw = json.load(SRC.open())
    out = {}

    for sym, row in raw.items():
        if not isinstance(row, dict):
            continue

        price_now = num(row.get("price_now"))
        obj = {
            "price_now": price_now,
            "volume": num(row.get("volume")),
            "volume_ratio": num(row.get("volume_ratio")),
        }

        # timing inputs from swing_days + ret_1w
        swing_days = row.get("swing_days") if isinstance(row.get("swing_days"), list) else []
        for i, key in enumerate(SWING_KEYS):
            swing_val = num(swing_days[i]) if i < len(swing_days) else None
            # swing_days in source are percentage points (e.g. -1.08), convert to decimal return
            obj[f"ret_{key}"] = None if swing_val is None else round(swing_val / 100.0, 6)

        # short horizon from source runtime (production behavior remains source-of-truth)
        for k, src_ret in SHORT_RET_MAP.items():
            rv = num(row.get(src_ret))
            obj[f"ret_{k}"] = rv
            obj[f"price_ref_{k}"] = to_ref(price_now, rv)

        # long horizon from yfinance 10y history
        long_vals = _compute_long_refs_from_yf(sym, price_now)
        obj.update(long_vals)

        # map timing day refs from mapped swing returns
        for key in SWING_KEYS:
            obj[f"price_ref_{key}"] = to_ref(price_now, obj.get(f"ret_{key}"))

        available, missing = [], []
        for key in REF_KEYS:
            ref_key = f"price_ref_{key}"
            if obj.get(ref_key) is None:
                missing.append(ref_key)
            else:
                available.append(ref_key)

        obj["available_price_refs"] = available
        obj["missing_price_refs"] = missing
        obj["coverage_pct"] = round(len(available) / len(REF_KEYS) * 100.0, 2)
        obj["data_warning"] = "missing_long_horizon_refs" if any(obj.get(f"price_ref_{k}") is None for k in LONG_YEARS) else None

        out[sym] = obj

    OUT.parent.mkdir(parents=True, exist_ok=True)
    json.dump(
        {
            "generated_from": "scripts/runtime/build_market_runtime_long_horizon.py",
            "symbol_count": len(out),
            "rows": out,
        },
        OUT.open("w"),
        indent=2,
        ensure_ascii=False,
    )
    print(f"written {OUT}")


if __name__ == "__main__":
    main()

