import json
import yfinance as yf
from datetime import datetime

# ---------- 讀取 universe ----------
with open("data/m1/universe_150.json", "r") as f:
    universe = json.load(f)

symbols = [s["symbol"] for s in universe]

print(f"Total symbols: {len(symbols)}")

data = {}

# ---------- 抓市場資料 ----------
for sym in symbols:
    try:
        ticker = yf.Ticker(sym)
        hist = ticker.history(period="1y")

        if hist.empty:
            print(f"{sym} -> no data")
            continue

        closes = hist["Close"]

        def get_safe(idx):
            try:
                return float(closes.iloc[idx])
            except:
                return None

        data[sym] = {
            "price_now": get_safe(-1),
            "price_1d": get_safe(-2),
            "price_1w": get_safe(-6),
            "price_1m": get_safe(-22),
            "price_3m": get_safe(-66),
            "price_6m": get_safe(-132),
            "price_12m": get_safe(0),
            "last_update": datetime.now().isoformat()
        }

        print(f"{sym} OK")

    except Exception as e:
        print(f"{sym} ERROR:", e)

# ---------- 輸出 ----------
output_path = "data/m1/m1_market_runtime.json"

with open(output_path, "w") as f:
    json.dump(data, f, indent=2)

print(f"\nSaved to {output_path}")
