# ==========================================
# build_m1_candidate_80.py
# 功能：
# 1. 讀取 universe_150.json
# 2. 讀取主 runtime：data/market_runtime.json
# 3. 支援 runtime 兩種格式：{ rows: {SYMBOL: ...} } 或 {SYMBOL: ...}
# 4. 用 M7-lite 邏輯計算 market score
# 5. Candidate = Top 80 score core + mandatory pool30/deep/fcn/special stocks
# 6. 輸出到 data/m1/m1_candidate_80.json；實際筆數可能 > 80
# ==========================================

import json
from pathlib import Path

UNIVERSE_PATH = "data/m1/universe_150.json"
RUNTIME_PATH = "data/market_runtime.json"
OUTPUT_PATH = "data/m1/m1_candidate_80.json"

POOL30_PATH = "data/pool30.json"
DEEP_PROFILE_PATH = "data/m1/m1_stock_profile.json"
FCN_POOL_PATH = "data/fcn_pool.json"

CORE_TARGET_COUNT = 80

SPECIAL_SYMBOLS = {
    "SNPS",
}


def to_num(v, d=0):
    try:
        if v is None:
            return d
        return float(v)
    except Exception:
        return d


def clamp(x, lo=0, hi=10):
    return max(lo, min(hi, x))


def load_json_safe(path, default):
    p = Path(path)
    if not p.exists():
        return default
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:
        print(f"WARNING: failed to load {path}: {exc}")
        return default


def extract_symbols(payload):
    symbols = set()

    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, str):
                symbols.add(item.upper())
            elif isinstance(item, dict):
                sym = item.get("symbol") or item.get("ticker") or item.get("Symbol") or item.get("Ticker")
                if sym:
                    symbols.add(str(sym).upper())

    elif isinstance(payload, dict):
        for key, item in payload.items():
            if isinstance(key, str) and key.upper() not in {"META", "SUMMARY", "DATA", "ROWS", "ITEMS"}:
                if isinstance(item, dict) or isinstance(item, list) or isinstance(item, str):
                    if len(key) <= 8:
                        symbols.add(key.upper())

            if isinstance(item, dict):
                sym = item.get("symbol") or item.get("ticker") or item.get("Symbol") or item.get("Ticker")
                if sym:
                    symbols.add(str(sym).upper())
            elif isinstance(item, list):
                symbols |= extract_symbols(item)

        for container_key in ["rows", "data", "stocks", "items", "holdings", "positions"]:
            if container_key in payload:
                symbols |= extract_symbols(payload.get(container_key))

    return symbols


def load_runtime(path):
    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    runtime = payload.get("rows", payload)

    if not isinstance(runtime, dict):
        raise ValueError(f"Runtime format error: {path}")

    print(f"Loaded runtime from {path}, symbols={len(runtime)}")
    return runtime


def load_mandatory_symbols():
    mandatory = set(SPECIAL_SYMBOLS)

    pool30 = load_json_safe(POOL30_PATH, [])
    pool30_symbols = extract_symbols(pool30)
    mandatory |= pool30_symbols

    deep_profiles = load_json_safe(DEEP_PROFILE_PATH, {})
    deep_symbols = extract_symbols(deep_profiles)
    mandatory |= deep_symbols

    fcn_pool = load_json_safe(FCN_POOL_PATH, [])
    fcn_symbols = extract_symbols(fcn_pool)
    mandatory |= fcn_symbols

    print(f"Mandatory symbols total: {len(mandatory)}")
    print(f"  pool30 symbols: {len(pool30_symbols)}")
    print(f"  deep profile symbols: {len(deep_symbols)}")
    print(f"  fcn pool symbols: {len(fcn_symbols)}")
    print(f"  special symbols: {', '.join(sorted(SPECIAL_SYMBOLS))}")

    return mandatory


# ---------- M7-lite scoring ----------
def valuation_score(stock):
    return 5.0


def trend_score(rt):
    r1m = to_num(rt.get("ret_1m"))
    r3m = to_num(rt.get("ret_3m"))
    r6m = to_num(rt.get("ret_6m"))
    r12m = to_num(rt.get("ret_12m"))

    x = (
        0.15 * r1m +
        0.25 * r3m +
        0.25 * r6m +
        0.35 * r12m
    ) * 100

    if x >= 40: return 10
    if x >= 25: return 8.5
    if x >= 15: return 7.5
    if x >= 5:  return 6.5
    if x >= 0:  return 5.5
    if x >= -5: return 4.5
    if x >= -15:return 3.5
    if x >= -25:return 2.5
    return 1.5


def quality_score(stock, rt):
    cat = str(stock.get("category", "")).lower()
    vol_ratio = to_num(rt.get("volume_ratio"), 1.0)
    r12m = to_num(rt.get("ret_12m"))

    base = 5.0

    if cat == "core":
        base += 2.0
    elif cat == "growth":
        base += 1.0
    elif cat == "income":
        base += 0.5
    elif cat == "defensive":
        base += 1.0
    elif cat == "speculative":
        base -= 1.5

    if r12m > 0.30:
        base += 1.0
    elif r12m < -0.20:
        base -= 1.0

    if vol_ratio > 2.5:
        base -= 0.5

    return clamp(base)


def snapshot_score(rt):
    r1d = to_num(rt.get("ret_1d"))
    r1w = to_num(rt.get("ret_1w"))
    r1m = to_num(rt.get("ret_1m"))

    x = (0.4 * r1d + 0.4 * r1w + 0.2 * r1m) * 100

    if x >= 15: return 9
    if x >= 8:  return 8
    if x >= 3:  return 7
    if x >= 0:  return 6
    if x >= -3: return 5
    if x >= -8: return 4
    if x >= -15:return 3
    return 2


def m7_lite_score(stock, rt):
    val = valuation_score(stock)
    trend = trend_score(rt)
    quality = quality_score(stock, rt)
    snap = snapshot_score(rt)

    score = (
        0.35 * val +
        0.35 * trend +
        0.20 * quality +
        0.10 * snap
    )

    return {
        "m7_lite_score": round(score, 2),
        "valuation_score": round(val, 2),
        "trend_score": round(trend, 2),
        "quality_score": round(quality, 2),
        "snapshot_score": round(snap, 2)
    }


def missing_runtime_candidate_row(stock):
    sym = str(stock.get("symbol", "")).upper()
    quality = quality_score(stock, {})
    return {
        "symbol": sym,
        "category": stock.get("category", ""),
        "sector": stock.get("sector", ""),
        "style": stock.get("style", []),
        "m7_lite_score": round(0.35 * 5.0 + 0.20 * quality, 2),
        "valuation_score": 5.0,
        "trend_score": None,
        "quality_score": round(quality, 2),
        "snapshot_score": None,
        "mandatory_candidate": True,
        "in_candidate_core_80": False,
        "candidate_source": "mandatory_missing_runtime",
        "ret_1d": None,
        "ret_1w": None,
        "ret_1m": None,
        "ret_3m": None,
        "ret_6m": None,
        "ret_12m": None,
        "volume_ratio": None,
        "price_source": "unavailable",
        "runtime_status": "missing",
        "data_status": "pending",
        "warning": "mandatory symbol included without market_runtime; price/return fields intentionally null"
    }


def main():
    with open(UNIVERSE_PATH, "r", encoding="utf-8") as f:
        universe = json.load(f)

    runtime = load_runtime(RUNTIME_PATH)
    mandatory_symbols = load_mandatory_symbols()

    universe_symbols = {str(stock.get("symbol", "")).upper() for stock in universe if stock.get("symbol")}

    scored = []
    missing_runtime = []
    mandatory_not_in_universe = sorted([s for s in mandatory_symbols if s not in universe_symbols])
    mandatory_missing_runtime = []

    for stock in universe:
        sym = str(stock.get("symbol", "")).upper()
        if not sym:
            continue

        rt = runtime.get(sym)
        if not rt:
            missing_runtime.append(sym)
            if sym in mandatory_symbols:
                mandatory_missing_runtime.append(sym)
                scored.append(missing_runtime_candidate_row(stock))
            continue

        s = m7_lite_score(stock, rt)
        is_mandatory = sym in mandatory_symbols

        scored.append({
            "symbol": sym,
            "category": stock.get("category", ""),
            "sector": stock.get("sector", ""),
            "style": stock.get("style", []),
            "m7_lite_score": s["m7_lite_score"],
            "valuation_score": s["valuation_score"],
            "trend_score": s["trend_score"],
            "quality_score": s["quality_score"],
            "snapshot_score": s["snapshot_score"],
            "mandatory_candidate": is_mandatory,
            "in_candidate_core_80": False,
            "candidate_source": "mandatory" if is_mandatory else "score_rank",
            "ret_1d": rt.get("ret_1d", 0),
            "ret_1w": rt.get("ret_1w", 0),
            "ret_1m": rt.get("ret_1m", 0),
            "ret_3m": rt.get("ret_3m", 0),
            "ret_6m": rt.get("ret_6m", 0),
            "ret_12m": rt.get("ret_12m", 0),
            "volume_ratio": rt.get("volume_ratio", 1.0)
        })

    scored.sort(key=lambda x: x["m7_lite_score"], reverse=True)

    # Core 80 = pure score top 80, regardless of pool30.
    core_rows = scored[:CORE_TARGET_COUNT]
    core_symbols = {row["symbol"] for row in core_rows}

    mandatory_rows = [row for row in scored if row["mandatory_candidate"]]
    mandatory_symbols_scored = {row["symbol"] for row in mandatory_rows}

    # Final candidate = Top80 union mandatory. Duplicates removed.
    final_by_symbol = {}
    for row in core_rows:
        row = dict(row)
        row["in_candidate_core_80"] = True
        row["candidate_source"] = "core80+mandatory" if row["symbol"] in mandatory_symbols_scored else "core80"
        final_by_symbol[row["symbol"]] = row

    for row in mandatory_rows:
        if row["symbol"] not in final_by_symbol:
            row = dict(row)
            row["in_candidate_core_80"] = False
            row["candidate_source"] = "mandatory_addon"
            final_by_symbol[row["symbol"]] = row

    candidate_rows = list(final_by_symbol.values())
    candidate_rows.sort(
        key=lambda x: (
            0 if x.get("in_candidate_core_80") else 1,
            -to_num(x.get("m7_lite_score")),
            str(x.get("symbol", ""))
        )
    )

    mandatory_in_core = len(core_symbols & mandatory_symbols_scored)
    mandatory_addon = len(mandatory_symbols_scored - core_symbols)

    Path("data/m1").mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(candidate_rows, f, indent=2, ensure_ascii=False)

    print(f"Universe total: {len(universe)}")
    print(f"Total scored: {len(scored)}")
    print(f"Core target count: {CORE_TARGET_COUNT}")
    print(f"Core 80 output: {len(core_rows)}")
    print(f"Mandatory scored: {len(mandatory_rows)}")
    print(f"Mandatory already in core80: {mandatory_in_core}")
    print(f"Mandatory addon: {mandatory_addon}")
    print(f"Final Candidate output: {len(candidate_rows)}")
    print(f"Missing runtime: {len(missing_runtime)}")
    if missing_runtime:
        print("Missing runtime symbols:", ", ".join(missing_runtime[:80]))
    if mandatory_not_in_universe:
        print("Mandatory not in universe:", ", ".join(mandatory_not_in_universe[:80]))
    if mandatory_missing_runtime:
        print("Mandatory missing runtime:", ", ".join(mandatory_missing_runtime[:80]))
    print(f"Saved Candidate to {OUTPUT_PATH}")
    print("Mandatory addon sample:")
    for row in candidate_rows:
        if row.get("candidate_source") == "mandatory_addon":
            print(row["symbol"], row["m7_lite_score"], row["category"], row["sector"])
    print("Top 10 overall:")
    for row in candidate_rows[:10]:
        print(row["symbol"], row["m7_lite_score"], row["category"], row["sector"], row["candidate_source"])


if __name__ == "__main__":
    main()
