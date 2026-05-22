# ==========================================
# build_m1_candidate_80.py
# 功能：
# 1. 讀取 universe_150.json
# 2. 讀取主 runtime：data/market_runtime.json
# 3. 支援 runtime 兩種格式：{ rows: {SYMBOL: ...} } 或 {SYMBOL: ...}
# 4. 用 M7-lite 邏輯計算 market score
# 5. 輸出 top 80 到 data/m1/m1_candidate_80.json
# ==========================================

import json
from pathlib import Path

UNIVERSE_PATH = "data/m1/universe_150.json"
RUNTIME_PATH = "data/market_runtime.json"
OUTPUT_PATH = "data/m1/m1_candidate_80.json"


def to_num(v, d=0):
    try:
        if v is None:
            return d
        return float(v)
    except:
        return d


def clamp(x, lo=0, hi=10):
    return max(lo, min(hi, x))


def load_runtime(path):
    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    runtime = payload.get("rows", payload)

    if not isinstance(runtime, dict):
        raise ValueError(f"Runtime format error: {path}")

    print(f"Loaded runtime from {path}, symbols={len(runtime)}")
    return runtime


# ---------- M7-lite scoring ----------
def valuation_score(stock):
    # 先留接口，現在沒有 valuation raw，就先給中性 5
    # 之後可接 PE / growth / quality
    return 5.0


def trend_score(rt):
    r1m = to_num(rt.get("ret_1m"))
    r3m = to_num(rt.get("ret_3m"))
    r6m = to_num(rt.get("ret_6m"))
    r12m = to_num(rt.get("ret_12m"))

    # 長中期趨勢
    x = (
        0.15 * r1m +
        0.25 * r3m +
        0.25 * r6m +
        0.35 * r12m
    ) * 100

    # 映射到 0~10
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

    # 類別微調
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

    # 長期報酬加分
    if r12m > 0.30:
        base += 1.0
    elif r12m < -0.20:
        base -= 1.0

    # 成交量異常太大，先不當品質加分
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

    # M1 上游用，不納入 news / timing / 短結構
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


def main():
    with open(UNIVERSE_PATH, "r", encoding="utf-8") as f:
        universe = json.load(f)

    runtime = load_runtime(RUNTIME_PATH)

    scored = []
    missing_runtime = []

    for stock in universe:
        sym = stock.get("symbol")
        if not sym:
            continue

        rt = runtime.get(sym)
        if not rt:
            missing_runtime.append(sym)
            continue

        s = m7_lite_score(stock, rt)

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
            "ret_1d": rt.get("ret_1d", 0),
            "ret_1w": rt.get("ret_1w", 0),
            "ret_1m": rt.get("ret_1m", 0),
            "ret_3m": rt.get("ret_3m", 0),
            "ret_6m": rt.get("ret_6m", 0),
            "ret_12m": rt.get("ret_12m", 0),
            "volume_ratio": rt.get("volume_ratio", 1.0)
        })

    scored.sort(key=lambda x: x["m7_lite_score"], reverse=True)
    top80 = scored[:80]

    Path("data/m1").mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(top80, f, indent=2, ensure_ascii=False)

    print(f"Universe total: {len(universe)}")
    print(f"Total scored: {len(scored)}")
    print(f"Missing runtime: {len(missing_runtime)}")
    if missing_runtime:
        print("Missing runtime symbols:", ", ".join(missing_runtime[:80]))
    print(f"Saved top 80 to {OUTPUT_PATH}")
    print("Top 10:")
    for row in top80[:10]:
        print(row["symbol"], row["m7_lite_score"], row["category"], row["sector"])


if __name__ == "__main__":
    main()
