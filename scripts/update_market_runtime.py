# ==========================================
# update_market_runtime.py V2.1（穩定版 + 3M）
# 功能：
# 1. 從 Yahoo Finance 抓歷史價格
# 2. 自動 fallback（避免 null）
# 3. 計算 1d / 1w / 1m / 3m / 6m / 12m 報酬
# 4. 輸出 data/market_runtime.json
# 5. 舊欄位完全保留，新增 3m，不影響其他 engine
# ==========================================

import json
from datetime import datetime, timezone
import yfinance as yf

# ------------------------------------------
# 參數
# ------------------------------------------
WINDOWS = {
    "1d": 1,
    "1w": 5,
    "1m": 21,
    "3m": 63,
    "6m": 126,
    "12m": 252
}

POOL_PATH = "data/pool30.json"
OUTPUT_PATH = "data/market_runtime.json"


# ------------------------------------------
# 工具：安全取值
# ------------------------------------------
def get_price_safe(series, idx):
    try:
        if len(series) == 0:
            return None

        # 若索引超出範圍，fallback 到最舊資料
        if abs(idx) >= len(series):
            return float(series.iloc[0])

        value = series.iloc[idx]
        if value is None:
            return None

        return float(value)
    except Exception:
        return None


def calc_return(now, past):
    if now is None or past is None or past == 0:
        return 0
    return round((now - past) / past, 6)


def fallback(value, default=0):
    if value is None:
        return default
    return value


# ------------------------------------------
# 主程式
# ------------------------------------------
def main():
    with open(POOL_PATH, "r", encoding="utf-8") as f:
        pool = json.load(f)

    symbols = [s["symbol"] for s in pool]
    result = {}

    for symbol in symbols:
        print(f"Fetching {symbol}...")

        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period="1y")

            if len(hist) < 10:
                raise Exception("Not enough data")

            close = hist["Close"]

            price_now = get_price_safe(close, -1)

            data = {
                "price_now": fallback(price_now, 0),
                "volume": int(hist["Volume"].iloc[-1]) if len(hist) > 0 else None,
                "last_update": datetime.now(timezone.utc).isoformat()
            }

            # 各時間點價格
            ref_prices = {}
            for k, days in WINDOWS.items():
                ref_prices[k] = get_price_safe(close, -1 - days)

            # 補值：若抓不到，直接用現價
            for k in ref_prices:
                if ref_prices[k] is None:
                    ref_prices[k] = price_now

            # 存價格（舊欄位保留，新增 3m）
            data["price_ref_1d"] = fallback(ref_prices["1d"], 0)
            data["price_ref_1w"] = fallback(ref_prices["1w"], 0)
            data["price_ref_1m"] = fallback(ref_prices["1m"], 0)
            data["price_ref_3m"] = fallback(ref_prices["3m"], 0)
            data["price_ref_6m"] = fallback(ref_prices["6m"], 0)
            data["price_ref_12m"] = fallback(ref_prices["12m"], 0)

            # 算報酬（舊欄位保留，新增 3m）
            data["ret_1d"] = calc_return(price_now, ref_prices["1d"])
            data["ret_1w"] = calc_return(price_now, ref_prices["1w"])
            data["ret_1m"] = calc_return(price_now, ref_prices["1m"])
            data["ret_3m"] = calc_return(price_now, ref_prices["3m"])
            data["ret_6m"] = calc_return(price_now, ref_prices["6m"])
            data["ret_12m"] = calc_return(price_now, ref_prices["12m"])

            result[symbol] = data

        except Exception as e:
            print(f"❌ Error {symbol}: {e}")

            # fallback：給基本值（避免整檔壞掉）
            result[symbol] = {
                "price_now": 0,
                "price_ref_1d": 0,
                "price_ref_1w": 0,
                "price_ref_1m": 0,
                "price_ref_3m": 0,
                "price_ref_6m": 0,
                "price_ref_12m": 0,
                "ret_1d": 0,
                "ret_1w": 0,
                "ret_1m": 0,
                "ret_3m": 0,
                "ret_6m": 0,
                "ret_12m": 0,
                "volume": None,
                "last_update": datetime.now(timezone.utc).isoformat()
            }

    # 輸出
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print("✅ market_runtime.json updated (stable + 3m)")


if __name__ == "__main__":
    main()
