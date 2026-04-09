# ==========================================
# update_market_runtime.py V4.2 FINAL
# 功能：
# 1. 從 Yahoo Finance 抓歷史價格
# 2. 用 fast_info.lastPrice 優先取得當前價格
# 3. 歷史資料仍用於計算 1d / 1w / 1m / 3m / 6m / 12m 報酬
# 4. 新增 swing_days（M8 用）
# 5. 避免最後一筆 Close 異常導致 price_now = 0
# 6. 輸出 data/market_runtime.json
# 7. 自動輸出 data/m7/m7_fundamental_data.json
# ==========================================

import json
import math
from datetime import datetime, timezone
from pathlib import Path

import yfinance as yf

print("🔥 update_market_runtime.py V4.2 current-price version loaded")

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
M7_OUTPUT_PATH = "data/m7/m7_fundamental_data.json"

M7_STATIC_PROFILE = {
    "NVDA": {"name": "NVIDIA", "eps_now": 3.1, "eps_next": 4.2, "quality_level": "高", "risk_level": "中"},
    "TSM":  {"name": "TSMC", "eps_now": 8.2, "eps_next": 10.1, "quality_level": "高", "risk_level": "低"},
    "AVGO": {"name": "Broadcom", "eps_now": 5.9, "eps_next": 7.1, "quality_level": "高", "risk_level": "中"},
    "AMAT": {"name": "Applied Materials", "eps_now": 8.4, "eps_next": 9.6, "quality_level": "高", "risk_level": "中"},
    "MU":   {"name": "Micron", "eps_now": 6.1, "eps_next": 8.4, "quality_level": "中", "risk_level": "高"},
    "AMD":  {"name": "AMD", "eps_now": 3.6, "eps_next": 4.8, "quality_level": "中", "risk_level": "高"},
    "MRVL": {"name": "Marvell", "eps_now": 1.9, "eps_next": 2.6, "quality_level": "中", "risk_level": "高"},
    "CRDO": {"name": "Credo", "eps_now": 1.2, "eps_next": 1.7, "quality_level": "低", "risk_level": "高"},
    "ALAB": {"name": "Astera Labs", "eps_now": 0.9, "eps_next": 1.4, "quality_level": "低", "risk_level": "高"},

    "MSFT": {"name": "Microsoft", "eps_now": 11.2, "eps_next": 12.8, "quality_level": "高", "risk_level": "低"},
    "GOOG": {"name": "Google", "eps_now": 9.1, "eps_next": 10.3, "quality_level": "高", "risk_level": "中"},
    "AMZN": {"name": "Amazon", "eps_now": 4.1, "eps_next": 5.0, "quality_level": "高", "risk_level": "中"},
    "ORCL": {"name": "Oracle", "eps_now": 5.8, "eps_next": 6.4, "quality_level": "中", "risk_level": "中"},
    "PLTR": {"name": "Palantir", "eps_now": 1.2, "eps_next": 1.6, "quality_level": "中", "risk_level": "高"},
    "ARM":  {"name": "ARM", "eps_now": 1.5, "eps_next": 2.0, "quality_level": "中", "risk_level": "高"},
    "TSLA": {"name": "Tesla", "eps_now": 3.0, "eps_next": 3.7, "quality_level": "中", "risk_level": "高"},

    "META": {"name": "Meta", "eps_now": 17.4, "eps_next": 19.2, "quality_level": "高", "risk_level": "中"},
    "AAPL": {"name": "Apple", "eps_now": 7.3, "eps_next": 8.0, "quality_level": "高", "risk_level": "低"},

    "COST": {"name": "Costco", "eps_now": 16.5, "eps_next": 18.1, "quality_level": "高", "risk_level": "低"},
    "TGT":  {"name": "Target", "eps_now": 8.1, "eps_next": 8.8, "quality_level": "中", "risk_level": "中"},
    "EL":   {"name": "Estee Lauder", "eps_now": 2.6, "eps_next": 3.2, "quality_level": "中", "risk_level": "中"},
    "NKE":  {"name": "Nike", "eps_now": 2.9, "eps_next": 3.3, "quality_level": "低", "risk_level": "中"},

    "COIN": {"name": "Coinbase", "eps_now": 5.1, "eps_next": 5.8, "quality_level": "低", "risk_level": "高"},
    "SOFI": {"name": "SoFi", "eps_now": 0.6, "eps_next": 0.9, "quality_level": "低", "risk_level": "高"},

    "UNH":  {"name": "UnitedHealth", "eps_now": 24.3, "eps_next": 26.1, "quality_level": "高", "risk_level": "低"},
    "REGN": {"name": "Regeneron", "eps_now": 36.5, "eps_next": 39.0, "quality_level": "中", "risk_level": "中"},

    "CCL":  {"name": "Carnival", "eps_now": 1.1, "eps_next": 1.5, "quality_level": "中", "risk_level": "高"},
    "AAL":  {"name": "American Airlines", "eps_now": 0.9, "eps_next": 1.2, "quality_level": "低", "risk_level": "高"},
    "LVS":  {"name": "Las Vegas Sands", "eps_now": 2.4, "eps_next": 2.9, "quality_level": "中", "risk_level": "中"},

    "SMH":  {"name": "VanEck Semiconductor ETF", "eps_now": 0, "eps_next": 0, "quality_level": "高", "risk_level": "中"},
    "QQQ":  {"name": "Invesco QQQ", "eps_now": 0, "eps_next": 0, "quality_level": "高", "risk_level": "中"},
    "LQD":  {"name": "iShares iBoxx Investment Grade Corporate Bond ETF", "eps_now": 0, "eps_next": 0, "quality_level": "高", "risk_level": "低"},

    "INTC": {"name": "Intel", "eps_now": 1.8, "eps_next": 2.1, "quality_level": "中", "risk_level": "中"},
}

def safe_number(v, default=0):
    try:
        if v is None:
            return default
        n = float(v)
        if math.isnan(n) or math.isinf(n):
            return default
        return n
    except Exception:
        return default

def safe_int(v, default=None):
    try:
        if v is None:
            return default
        n = float(v)
        if math.isnan(n) or math.isinf(n):
            return default
        return int(n)
    except Exception:
        return default

def get_price_safe(series, idx):
    try:
        if series is None or len(series) == 0:
            return None
        if abs(idx) >= len(series):
            return safe_number(series.iloc[0], None)
        return safe_number(series.iloc[idx], None)
    except Exception:
        return None

def get_last_valid_close(series):
    try:
        if series is None or len(series) == 0:
            return None
        cleaned = []
        for v in series:
            n = safe_number(v, None)
            if n is not None and n > 0:
                cleaned.append(n)
        if not cleaned:
            return None
        return cleaned[-1]
    except Exception:
        return None

def get_current_price(ticker, close_series):
    # 優先取即時/最新 quote 價格
    try:
        fi = ticker.fast_info
        if fi:
            for key in ["lastPrice", "regularMarketPrice", "previousClose"]:
                if key in fi:
                    v = safe_number(fi[key], None)
                    if v is not None and v > 0:
                        return v
    except Exception:
        pass

    # 次優先：用 info
    try:
        info = ticker.info
        for key in ["regularMarketPrice", "currentPrice", "previousClose"]:
            v = safe_number(info.get(key), None)
            if v is not None and v > 0:
                return v
    except Exception:
        pass

    # 最後 fallback：歷史最後一筆有效 close
    return safe_number(get_last_valid_close(close_series), 0)

def calc_return(now, past):
    now = safe_number(now, None)
    past = safe_number(past, None)
    if now is None or past is None or past == 0:
        return 0
    return round((now - past) / past, 6)

def calc_volume_ratio(volume_series):
    try:
        if volume_series is None or len(volume_series) < 21:
            return 1.0
        latest = safe_number(volume_series.iloc[-1], None)
        avg20 = safe_number(volume_series.tail(20).mean(), None)
        if latest is None or avg20 in (None, 0):
            return 1.0
        return round(latest / avg20, 2)
    except Exception:
        return 1.0

def pct_to_percent_number(v):
    return round(safe_number(v, 0) * 100, 2)

def calc_swing_days(hist):
    swings = []
    if hist is None or len(hist) == 0:
        return [0, 0, 0, 0, 0, 0]

    limit = min(6, len(hist))
    for i in range(limit):
        try:
            row = hist.iloc[-1 - i]
            open_price = safe_number(row.get("Open"), None)
            close_price = safe_number(row.get("Close"), None)

            if open_price in (None, 0) or close_price in (None, 0):
                swings.append(0)
                continue

            amp = abs(close_price - open_price) / open_price * 100
            swings.append(round(amp, 2))
        except Exception:
            swings.append(0)

    while len(swings) < 6:
        swings.append(0)

    return swings

def load_pool():
    with open(POOL_PATH, "r", encoding="utf-8") as f:
        pool = json.load(f)

    symbols = [s["symbol"] for s in pool if s.get("symbol")]
    extra_symbols = ["INTC"]

    final = []
    seen = set()
    for sym in symbols + extra_symbols:
        if sym and sym not in seen:
            seen.add(sym)
            final.append(sym)
    return final

def fetch_market_runtime(symbols):
    result = {}

    for symbol in symbols:
        print(f"Fetching {symbol}...")

        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period="1y", auto_adjust=False)

            if hist is None or len(hist) < 10:
                raise Exception("Not enough data")

            close = hist["Close"]
            volume_series = hist["Volume"] if "Volume" in hist.columns else None

            price_now = safe_number(get_current_price(ticker, close), 0)

            ref_prices = {}
            for k, days in WINDOWS.items():
                ref = get_price_safe(close, -1 - days)
                ref = safe_number(ref, None)
                if ref is None or ref <= 0:
                    ref = safe_number(get_last_valid_close(close), 0)
                ref_prices[k] = ref

            swing_days = calc_swing_days(hist)

            result[symbol] = {
                "price_now": safe_number(price_now, 0),
                "volume": safe_int(volume_series.iloc[-1], None) if volume_series is not None and len(volume_series) > 0 else None,
                "volume_ratio": calc_volume_ratio(volume_series),
                "last_update": datetime.now(timezone.utc).isoformat(),

                "price_ref_1d": safe_number(ref_prices["1d"], 0),
                "price_ref_1w": safe_number(ref_prices["1w"], 0),
                "price_ref_1m": safe_number(ref_prices["1m"], 0),
                "price_ref_3m": safe_number(ref_prices["3m"], 0),
                "price_ref_6m": safe_number(ref_prices["6m"], 0),
                "price_ref_12m": safe_number(ref_prices["12m"], 0),

                "ret_1d": safe_number(calc_return(price_now, ref_prices["1d"]), 0),
                "ret_1w": safe_number(calc_return(price_now, ref_prices["1w"]), 0),
                "ret_1m": safe_number(calc_return(price_now, ref_prices["1m"]), 0),
                "ret_3m": safe_number(calc_return(price_now, ref_prices["3m"]), 0),
                "ret_6m": safe_number(calc_return(price_now, ref_prices["6m"]), 0),
                "ret_12m": safe_number(calc_return(price_now, ref_prices["12m"]), 0),

                "swing_days": swing_days,
                "amp_1d": swing_days[0] if swing_days else 0
            }

        except Exception as e:
            print(f"❌ Error {symbol}: {e}")
            result[symbol] = {
                "price_now": 0,
                "volume": None,
                "volume_ratio": 1.0,
                "last_update": datetime.now(timezone.utc).isoformat(),

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

                "swing_days": [0, 0, 0, 0, 0, 0],
                "amp_1d": 0
            }

    return result

def save_market_runtime(result):
    output_path = Path(OUTPUT_PATH)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print("✅ market_runtime.json updated")

def build_m7_fundamental_data(market_runtime):
    output = []

    for symbol, static in M7_STATIC_PROFILE.items():
        market = market_runtime.get(symbol)
        if not market:
            continue

        output.append({
            "symbol": symbol,
            "name": static["name"],
            "price": safe_number(market.get("price_now"), 0),
            "eps_now": safe_number(static["eps_now"], 0),
            "eps_next": safe_number(static["eps_next"], 0),
            "quality_level": static["quality_level"],
            "risk_level": static["risk_level"],
            "ret_1w": pct_to_percent_number(market.get("ret_1w")),
            "ret_1m": pct_to_percent_number(market.get("ret_1m")),
            "ret_3m": pct_to_percent_number(market.get("ret_3m")),
            "ret_6m": pct_to_percent_number(market.get("ret_6m")),
            "ret_12m": pct_to_percent_number(market.get("ret_12m")),
            "volume_ratio": safe_number(market.get("volume_ratio"), 1.0),
            "swing_days": market.get("swing_days", [0, 0, 0, 0, 0, 0]),
            "amp_1d": safe_number(market.get("amp_1d"), 0)
        })

    return output

def save_m7_fundamental_data(market_runtime):
    output_path = Path(M7_OUTPUT_PATH)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    data = build_m7_fundamental_data(market_runtime)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"✅ m7_fundamental_data.json updated, total {len(data)} symbols")

def main():
    symbols = load_pool()
    market_runtime = fetch_market_runtime(symbols)
    save_market_runtime(market_runtime)
    save_m7_fundamental_data(market_runtime)
    print("✅ update_market_runtime.py finished")

if __name__ == "__main__":
    main()
