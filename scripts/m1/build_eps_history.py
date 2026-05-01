import json
import time
from pathlib import Path

import yfinance as yf


ROOT = Path(__file__).resolve().parents[2]
POOL30_PATH = ROOT / "data" / "pool30.json"
CANDIDATE_PATH = ROOT / "data" / "m1" / "m1_candidate_80.json"
OUT_PATH = ROOT / "data" / "m1" / "eps_history.json"

MAX_SYMBOLS = 20   # 先測 20 檔，確認可行後再放大
SLEEP_SEC = 0.8


def load_json(path, default):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def normalize_symbol(symbol):
    symbol = str(symbol or "").upper().strip()
    # 台股若未來要接，可在這裡轉成 .TW / .TWO
    return symbol


def get_symbols():
    pool30 = load_json(POOL30_PATH, [])
    candidates = load_json(CANDIDATE_PATH, [])

    symbols = []
    for row in pool30 + candidates:
        sym = normalize_symbol(row.get("symbol"))
        if sym and sym not in symbols:
            symbols.append(sym)

    return symbols[:MAX_SYMBOLS]


def safe_float(v):
    try:
        if v is None:
            return None
        x = float(v)
        if x != x:
            return None
        return round(x, 4)
    except Exception:
        return None


def fetch_eps(symbol):
    t = yf.Ticker(symbol)

    eps_history = []

    # 優先抓 annual income statement: Diluted EPS
    try:
        income = t.get_income_stmt(freq="yearly")
        if income is not None and not income.empty:
            for col in income.columns:
                year = int(str(col)[:4])
                eps = None

                for key in ["Diluted EPS", "Basic EPS"]:
                    if key in income.index:
                        eps = safe_float(income.loc[key, col])
                        if eps is not None:
                            break

                if eps is not None:
                    eps_history.append({
                        "year": year,
                        "eps": eps,
                        "source": "yfinance_income_stmt"
                    })
    except Exception:
        pass

    # fallback: earnings
    if not eps_history:
        try:
            earnings = t.earnings
            if earnings is not None and not earnings.empty:
                for year, row in earnings.iterrows():
                    eps = safe_float(row.get("Earnings"))
                    eps_history.append({
                        "year": int(year),
                        "eps": eps,
                        "source": "yfinance_earnings_fallback"
                    })
        except Exception:
            pass

    eps_history = [
        x for x in eps_history
        if x.get("year") and x.get("eps") is not None
    ]

    eps_history = sorted(eps_history, key=lambda x: x["year"])

    # forward EPS
    forward_eps = None
    trailing_eps = None

    try:
        info = t.get_info()
        forward_eps = safe_float(info.get("forwardEps"))
        trailing_eps = safe_float(info.get("trailingEps"))
    except Exception:
        pass

    latest_eps = eps_history[-1]["eps"] if eps_history else None

    return {
        "symbol": symbol,
        "eps_history": eps_history[-10:],
        "eps_forward": {
            "next_year": forward_eps
        },
        "eps_current": {
            "latest_annual": latest_eps,
            "trailing_eps": trailing_eps
        },
        "coverage": {
            "history_years": len(eps_history[-10:]),
            "has_forward_eps": forward_eps is not None,
            "has_trailing_eps": trailing_eps is not None,
            "usable_for_test": len(eps_history[-10:]) >= 5 and forward_eps is not None
        }
    }


def main():
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    symbols = get_symbols()
    output = {
        "meta": {
            "name": "M1 EPS History Test",
            "purpose": "Validate whether historical EPS and forward EPS can support M1 earnings-power model",
            "max_symbols": MAX_SYMBOLS,
            "source": "yfinance"
        },
        "data": {},
        "summary": {
            "total": 0,
            "usable": 0,
            "missing_history": [],
            "missing_forward_eps": [],
            "errors": []
        }
    }

    for i, symbol in enumerate(symbols, 1):
        print(f"[{i}/{len(symbols)}] fetching {symbol} ...")

        try:
            item = fetch_eps(symbol)
            output["data"][symbol] = item
            output["summary"]["total"] += 1

            if item["coverage"]["usable_for_test"]:
                output["summary"]["usable"] += 1

            if item["coverage"]["history_years"] < 5:
                output["summary"]["missing_history"].append(symbol)

            if not item["coverage"]["has_forward_eps"]:
                output["summary"]["missing_forward_eps"].append(symbol)

        except Exception as e:
            output["summary"]["errors"].append({
                "symbol": symbol,
                "error": str(e)
            })

        time.sleep(SLEEP_SEC)

    with OUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print("")
    print("DONE")
    print(f"Output: {OUT_PATH}")
    print(json.dumps(output["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
