# ==========================================
# update_market_runtime.py
# 功能：
# 1. 從 Yahoo Finance 抓歷史價格
# 2. 計算 1d / 1w / 1m / 6m / 12m 報酬
# 3. 輸出 data/market_runtime.json
# ==========================================

import json
import yfinance as yf
from datetime import datetime

# ------------------------------------------
# 參數
# ------------------------------------------
WINDOWS = {
    "1d": 1,
    "1w": 5,
    "1m": 21,
    "6m": 126,
    "12m": 252
}

POOL_PATH = "data/pool30.json"
OUTPUT_PATH = "data/market_runtime.json"


# ------------------------------------------
# 工具：安全取值
# ------------------------------------------
def get_price(series, idx):
    try:
        return float(series.iloc[idx])
    except:
        return None


def calc_return(now, past):
    if now is None or past is None or past == 0:
        return 0
    return round((now - past) / past, 6)


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

            close = hist["Close"]

            price_now = get_price(close, -1)

            data = {
                "price_now": price_now,
                "volume": int(hist["Volume"].iloc[-1]) if len(hist) > 0 else None,
                "last_update": datetime.utcnow().isoformat()
            }

            # 各時間點價格
            ref_prices = {}
            for k, days in WINDOWS.items():
                ref_prices[k] = get_price(close, -1 - days)

            # 存價格
            data["price_ref_1d"] = ref_prices["1d"]
            data["price_ref_1w"] = ref_prices["1w"]
            data["price_ref_1m"] = ref_prices["1m"]
            data["price_ref_6m"] = ref_prices["6m"]
            data["price_ref_12m"] = ref_prices["12m"]

            # 算報酬
            data["ret_1d"] = calc_return(price_now, ref_prices["1d"])
            data["ret_1w"] = calc_return(price_now, ref_prices["1w"])
            data["ret_1m"] = calc_return(price_now, ref_prices["1m"])
            data["ret_6m"] = calc_return(price_now, ref_prices["6m"])
            data["ret_12m"] = calc_return(price_now, ref_prices["12m"])

            result[symbol] = data

        except Exception as e:
            print(f"Error {symbol}: {e}")

    # 輸出
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    print("✅ market_runtime.json updated")


if __name__ == "__main__":
    main()
