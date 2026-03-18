from pathlib import Path
from datetime import datetime, timezone
import os
import json
import math
import re

import requests


# =========================
# 基本設定
# =========================
NEWSAPI_KEY = os.getenv("NEWSAPI_KEY", "").strip()
FRED_API_KEY = os.getenv("FRED_API_KEY", "").strip()

NEWSAPI_BASE = "https://newsapi.org/v2"
FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"

TIMEOUT = 20

FIXED_POOL = [
    {"symbol": "NVDA", "name": "NVIDIA", "type": "AI/科技", "risk": "中", "volatility": "高", "eki": "80%"},
    {"symbol": "AVGO", "name": "Broadcom", "type": "AI/科技", "risk": "中", "volatility": "中", "eki": "80%"},
    {"symbol": "TSM", "name": "Taiwan Semi", "type": "AI/科技", "risk": "低", "volatility": "中", "eki": "85%"},
    {"symbol": "AMD", "name": "AMD", "type": "AI/科技", "risk": "中", "volatility": "中", "eki": "80%"},
    {"symbol": "ORCL", "name": "Oracle", "type": "平台/資料庫", "risk": "中", "volatility": "中", "eki": "80%"},
    {"symbol": "MSFT", "name": "Microsoft", "type": "AI/雲端", "risk": "低", "volatility": "中", "eki": "85%"},
    {"symbol": "AMAT", "name": "Applied Materials", "type": "半導體設備", "risk": "中", "volatility": "中", "eki": "80%"},
    {"symbol": "PLTR", "name": "Palantir", "type": "AI/軟體", "risk": "高", "volatility": "高", "eki": "70%"},
    {"symbol": "COIN", "name": "Coinbase", "type": "金融/加密", "risk": "高", "volatility": "高", "eki": "65%"},
    {"symbol": "TSLA", "name": "Tesla", "type": "科技/車用", "risk": "高", "volatility": "高", "eki": "65%"},
]

DYNAMIC_POOL = [
    {"symbol": "CRDO", "name": "Credo", "type": "AI/網通", "risk": "高", "volatility": "高", "eki": "70%"},
    {"symbol": "ALAB", "name": "Astera Labs", "type": "AI/連接晶片", "risk": "高", "volatility": "高", "eki": "70%"},
    {"symbol": "MRVL", "name": "Marvell", "type": "AI/半導體", "risk": "中", "volatility": "中", "eki": "75%"},
    {"symbol": "ARM", "name": "Arm", "type": "AI/IP", "risk": "高", "volatility": "高", "eki": "70%"},
    {"symbol": "LVS", "name": "Las Vegas Sands", "type": "景氣循環", "risk": "中", "volatility": "中", "eki": "80%"},
    {"symbol": "UNH", "name": "UnitedHealth", "type": "防守/醫療", "risk": "低", "volatility": "低", "eki": "85%"},
]

# 先沿用你目前儀表板的核心風險資訊
RISK_RANKINGS = [
    {"code": "FCN710H", "stock": "ORCL", "price": 155.97, "strike": 185.01, "barrier": 134.44, "status": "持續關注", "distance_to_barrier_pct": 16.0, "level": "watch"},
    {"code": "FCN465K", "stock": "ORCL", "price": 155.97, "strike": 179.59, "barrier": 134.44, "status": "持續關注", "distance_to_barrier_pct": 16.0, "level": "watch"},
    {"code": "FCN935K", "stock": "COIN", "price": 203.32, "strike": 243.98, "barrier": 178.11, "status": "持續關注", "distance_to_barrier_pct": 14.2, "level": "watch"},
    {"code": "FCN791K", "stock": "COIN", "price": 203.32, "strike": 225.21, "barrier": 178.11, "status": "持續關注", "distance_to_barrier_pct": 14.2, "level": "watch"},
    {"code": "FCN499G", "stock": "NVDA", "price": 183.22, "strike": 189.98, "barrier": 151.98, "status": "健康", "distance_to_barrier_pct": 20.6, "level": "ok"},
]

HEADERS = {"User-Agent": "fcn-dashboard/1.0"}


# =========================
# 工具函式
# =========================
def now_local_str() -> str:
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M")


def req_json(url: str, params: dict | None = None) -> dict | list | None:
    try:
        r = requests.get(url, params=params, headers=HEADERS, timeout=TIMEOUT)
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


def compact_text(text: str, max_len: int = 140) -> str:
    text = re.sub(r"\s+", " ", (text or "")).strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rstrip() + "…"


def infer_fcn_impact(text: str) -> tuple[bool, str]:
    t = (text or "").lower()
    risk_words = [
        "vix", "yield", "treasury", "interest rate", "inflation", "cpi",
        "oil", "gold", "volatility", "fed", "tariff", "geopolitical"
    ]
    hit = any(w in t for w in risk_words)
    if "vix" in t or "volatility" in t or "yield spike" in t:
        return True, "波動升高，FCN 敲入風險增加"
    if "fed" in t or "rate cut" in t or "soft landing" in t:
        return True, "利率環境改善時，FCN 收益 / 安全性通常較有利"
    if "oil" in t or "geopolitical" in t:
        return True, "地緣政治升溫可能擴大市場波動"
    return hit, "可能影響 FCN 環境，建議列入觀察" if hit else "影響有限"


def article_to_card(article: dict, default_summary: str = "") -> dict:
    title = compact_text(article.get("title") or "未命名新聞", 120)
    desc = article.get("description") or default_summary or ""
    content = article.get("content") or desc or title
    affects, impact_note = infer_fcn_impact(f"{title} {desc} {content}")
    summary = compact_text(desc or impact_note, 90)
    full_text = compact_text(content or impact_note, 220)
    return {
        "title": title,
        "summary": summary,
        "content": f"{full_text}｜解讀：{impact_note}",
        "affects_fcn": affects
    }


# =========================
# 新聞抓取
# =========================
def fetch_newsapi_everything(query: str, page_size: int = 10, language: str = "en", sort_by: str = "publishedAt") -> list[dict]:
    if not NEWSAPI_KEY:
        return []
    data = req_json(
        f"{NEWSAPI_BASE}/everything",
        {
            "q": query,
            "language": language,
            "sortBy": sort_by,
            "pageSize": page_size,
            "apiKey": NEWSAPI_KEY,
        },
    )
    if not isinstance(data, dict) or data.get("status") != "ok":
        return []
    return data.get("articles", [])


def fetch_international_news() -> list[dict]:
    queries = [
        "geopolitics OR middle east OR oil market",
        "global markets OR trade tensions OR tariffs",
        "world economy OR recession risk OR global growth",
    ]
    articles = []
    seen = set()
    for q in queries:
        for a in fetch_newsapi_everything(q, page_size=8):
            title = a.get("title", "").strip()
            if title and title not in seen:
                seen.add(title)
                articles.append(article_to_card(a))
            if len(articles) >= 12:
                return articles
    if articles:
        return articles
    # fallback
    return [
        {
            "title": "國際新聞資料來源未設定",
            "summary": "目前尚未設定 NEWSAPI_KEY，因此先顯示提示訊息。",
            "content": "到 GitHub Repository → Settings → Secrets and variables → Actions，新建 NEWSAPI_KEY 後，這裡會自動變成真新聞。",
            "affects_fcn": True,
        }
    ]


def fetch_financial_news() -> list[dict]:
    queries = [
        "federal reserve OR rates OR inflation OR cpi",
        "stock market volatility OR treasury yields OR VIX",
        "technology stocks OR semiconductors OR AI stocks",
    ]
    articles = []
    seen = set()
    for q in queries:
        for a in fetch_newsapi_everything(q, page_size=8):
            title = a.get("title", "").strip()
            if title and title not in seen:
                seen.add(title)
                articles.append(article_to_card(a))
            if len(articles) >= 12:
                return articles
    if articles:
        return articles
    return [
        {
            "title": "國際財經新聞資料來源未設定",
            "summary": "目前尚未設定 NEWSAPI_KEY，因此先顯示提示訊息。",
            "content": "設定 NEWSAPI_KEY 後，這裡會自動抓取利率、Fed、VIX、科技股與市場波動相關新聞。",
            "affects_fcn": True,
        }
    ]


def fetch_ai_trend() -> list[dict]:
    queries = [
        "AI agent OR autonomous agent OR agentic AI",
        "NVIDIA OR Microsoft OR Broadcom OR TSMC AI",
        "OpenAI OR Anthropic OR inference chips OR AI infrastructure",
    ]
    articles = []
    seen = set()
    pool_symbols = {p["symbol"] for p in FIXED_POOL + DYNAMIC_POOL}

    for q in queries:
        for a in fetch_newsapi_everything(q, page_size=6):
            title = a.get("title", "").strip()
            if not title or title in seen:
                continue
            seen.add(title)
            base = article_to_card(a, default_summary="AI agent 與 AI 基礎設施相關消息")
            text = f"{title} {a.get('description','')} {a.get('content','')}".upper()

            in_pool = [s for s in pool_symbols if s in text]
            if any(s in text for s in ["NVDA", "AVGO", "TSM", "MSFT"]):
                invest = "建議關注：核心池"
            elif any(s in text for s in ["AMD", "AMAT", "MRVL", "ARM", "PLTR"]):
                invest = "建議關注：觀察池"
            else:
                invest = "建議：持續觀察"

            if in_pool:
                base["content"] += f"｜FCN Pool：{', '.join(in_pool)}｜{invest}"
            else:
                base["content"] += f"｜FCN Pool：未直接命中｜{invest}"

            articles.append(base)
            if len(articles) >= 8:
                return articles

    if articles:
        return articles

    return [
        {
            "title": "AI 趨勢資料來源未設定",
            "summary": "目前尚未設定 NEWSAPI_KEY，因此先顯示提示訊息。",
            "content": "設定 NEWSAPI_KEY 後，這裡會自動抓取 AI agent、AI 基礎設施與 FCN Pool 相關公司新聞。",
            "affects_fcn": True,
        }
    ]


# =========================
# FRED 總經資料
# =========================
def fred_latest(series_id: str) -> tuple[float | None, float | None]:
    if not FRED_API_KEY:
        return None, None
    data = req_json(
        FRED_BASE,
        {
            "series_id": series_id,
            "api_key": FRED_API_KEY,
            "file_type": "json",
            "sort_order": "desc",
            "limit": 5,
        },
    )
    if not isinstance(data, dict):
        return None, None

    values = []
    for row in data.get("observations", []):
        v = row.get("value")
        if v not in (None, ".", ""):
            try:
                values.append(float(v))
            except Exception:
                pass

    if len(values) >= 2:
        return values[0], values[1]
    if len(values) == 1:
        return values[0], None
    return None, None


def pct_change(curr: float | None, prev: float | None) -> float | None:
    if curr is None or prev is None or prev == 0:
        return None
    return (curr - prev) / abs(prev) * 100.0


def format_delta(curr: float | None, prev: float | None, unit: str = "", pct_mode: bool = False) -> str:
    if curr is None:
        return "N/A"
    if prev is None:
        return f"{curr:.2f}{unit}"
    d = curr - prev
    sign = "+" if d >= 0 else ""
    if pct_mode:
        p = pct_change(curr, prev)
        ptxt = "N/A" if p is None else f"{p:+.2f}%"
        return f"{curr:.2f}{unit}（{ptxt}）"
    return f"{curr:.2f}{unit}（{sign}{d:.2f}{unit}）"


def build_macro_module() -> tuple[list[dict], dict]:
    # FRED series
    cpi, cpi_prev = fred_latest("CPIAUCSL")
    fed, fed_prev = fred_latest("FEDFUNDS")
    vix, vix_prev = fred_latest("VIXCLS")
    dgs10, dgs10_prev = fred_latest("DGS10")
    dgs20, dgs20_prev = fred_latest("DGS20")
    sp500, sp500_prev = fred_latest("SP500")
    unrate, unrate_prev = fred_latest("UNRATE")
    oil, oil_prev = fred_latest("DCOILWTICO")
    gold, gold_prev = fred_latest("GOLDAMGBD228NLBM")

    cpi_yoy = pct_change(cpi, cpi_prev)
    vix_delta = None if vix is None or vix_prev is None else vix - vix_prev
    yield_curve = None if dgs10 is None or dgs20 is None else dgs20 - dgs10

    macro_cards = [
        {
            "title": f"CPI：{format_delta(cpi, cpi_prev)}",
            "summary": "通膨變化越溫和，通常越有利 FCN 環境。",
            "content": f"CPI 最新值：{format_delta(cpi, cpi_prev)}。若通膨放緩，Fed 壓力可能下降，對 FCN 通常較有利。",
            "affects_fcn": True,
        },
        {
            "title": f"Fed Funds：{format_delta(fed, fed_prev, unit='%')}",
            "summary": "利率下行通常有利風險資產與 FCN 整體安全性。",
            "content": f"聯邦基金利率：{format_delta(fed, fed_prev, unit='%')}。利率若走低，市場波動通常較易收斂。",
            "affects_fcn": True,
        },
        {
            "title": f"VIX：{format_delta(vix, vix_prev)}",
            "summary": "VIX 上升通常代表敲入風險提升。",
            "content": f"VIX：{format_delta(vix, vix_prev)}。VIX 若明顯走高，FCN 應降低進攻型配置。",
            "affects_fcn": True,
        },
        {
            "title": f"美債 10Y / 20Y：{format_delta(dgs10, dgs10_prev, unit='%')} / {format_delta(dgs20, dgs20_prev, unit='%')}",
            "summary": "中長期利率上升會壓抑科技估值，需留意 AI 核心股波動。",
            "content": f"10年期：{format_delta(dgs10, dgs10_prev, unit='%')}；20年期：{format_delta(dgs20, dgs20_prev, unit='%')}；利差：{yield_curve:.2f}%" if yield_curve is not None else "中長期利率資料不足。",
            "affects_fcn": True,
        },
        {
            "title": f"S&P 500：{format_delta(sp500, sp500_prev)}",
            "summary": "美股大盤若維持上行，FCN 環境通常偏友善。",
            "content": f"S&P 500：{format_delta(sp500, sp500_prev)}。大盤穩定通常有利核心池如 NVDA / AVGO / TSM / MSFT。",
            "affects_fcn": True,
        },
        {
            "title": f"失業率：{format_delta(unrate, unrate_prev, unit='%')}",
            "summary": "就業若明顯惡化，市場會提高對經濟放緩的擔憂。",
            "content": f"失業率：{format_delta(unrate, unrate_prev, unit='%')}。若就業轉弱過快，市場波動可能重新升高。",
            "affects_fcn": True,
        },
        {
            "title": f"油價 / 黃金：{format_delta(oil, oil_prev)} / {format_delta(gold, gold_prev)}",
            "summary": "油價代表通膨與地緣風險，黃金代表避險需求。",
            "content": f"WTI：{format_delta(oil, oil_prev)}；黃金：{format_delta(gold, gold_prev)}。若油價與黃金同步上行，代表市場避險情緒增強。",
            "affects_fcn": True,
        },
    ]

    # 總經評分
    score = 0
    reasons = []

    if vix is not None:
        if vix < 18:
            score += 2
            reasons.append("VIX 偏低，市場波動可控")
        elif vix < 24:
            score += 0
            reasons.append("VIX 中性，環境可做但需控風險")
        else:
            score -= 2
            reasons.append("VIX 偏高，敲入風險增加")

    if dgs10 is not None and dgs10_prev is not None:
        if dgs10 <= dgs10_prev:
            score += 1
            reasons.append("10Y 利率未再上行，科技估值壓力較小")
        else:
            score -= 1
            reasons.append("10Y 利率上升，科技股波動可能放大")

    if sp500 is not None and sp500_prev is not None:
        if sp500 >= sp500_prev:
            score += 1
            reasons.append("美股大盤維持穩定")
        else:
            score -= 1
            reasons.append("美股大盤回落，風險偏好降低")

    if oil is not None and oil_prev is not None and oil > oil_prev:
        score -= 1
        reasons.append("油價走升，通膨與地緣風險需留意")

    if score >= 2:
        env = "可做"
        env_text = "總經環境中性偏有利，FCN 可以做，但仍需控制單一高敏感標的集中度。"
    elif score >= 0:
        env = "保守做"
        env_text = "總經環境中性，FCN 可做但需偏保守，優先核心股並壓低進攻型曝險。"
    else:
        env = "觀望"
        env_text = "總經壓力偏高，現階段較適合觀望或只做防守型 FCN。"

    macro_summary = {
        "market_env": env,
        "market_env_text": env_text,
        "reasons": reasons,
        "score": score,
        "vix": vix,
    }

    if not FRED_API_KEY:
        macro_cards = [
            {
                "title": "FRED API 未設定",
                "summary": "目前未設定 FRED_API_KEY，因此先顯示提示。",
                "content": "到 GitHub Repository → Settings → Secrets and variables → Actions，新建 FRED_API_KEY 後，這裡會自動抓取 CPI、Fed、VIX、10Y、20Y、油價、黃金與 S&P 500。",
                "affects_fcn": True,
            }
        ]
        macro_summary = {
            "market_env": "可做",
            "market_env_text": "目前為模板模式。設定 FRED_API_KEY 後，會自動轉成真實總經判讀。",
            "reasons": ["尚未設定 FRED_API_KEY，暫以模板模式運行"],
            "score": 0,
            "vix": None,
        }

    return macro_cards, macro_summary


# =========================
# Pool 分析 / 推薦
# =========================
def score_pool_item(item: dict, macro_summary: dict) -> dict:
    symbol = item["symbol"]
    score = 0

    if symbol in {"NVDA", "AVGO", "TSM", "MSFT"}:
        score += 3
    if symbol in {"ORCL", "AMD", "AMAT", "MRVL", "ARM"}:
        score += 1
    if symbol in {"COIN", "TSLA", "PLTR", "CRDO", "ALAB"}:
        score -= 1

    env = macro_summary["market_env"]
    if env == "可做":
        if symbol in {"NVDA", "AVGO", "TSM", "MSFT", "AMAT", "AMD"}:
            score += 1
    elif env == "保守做":
        if item["risk"] == "低":
            score += 2
        if item["risk"] == "高":
            score -= 2
    else:
        if item["risk"] == "低":
            score += 1
        else:
            score -= 2

    if symbol in {"ORCL", "COIN"}:
        score -= 2  # 與你目前部位風險集中有關

    if score >= 3:
        today = "可加入"
        level = "ok"
        reason = "屬核心池 / 防守池，且目前環境允許配置。"
    elif score >= 1:
        today = "持續觀察"
        level = "watch"
        reason = "可列候補，但不宜重壓。"
    else:
        today = "暫不建議"
        level = "risk"
        reason = "現階段波動或集中風險偏高，暫不建議加碼。"

    new_item = dict(item)
    new_item.update({
        "day_change": "",
        "five_day": "",
        "today": today,
        "reason": reason,
        "level": level,
    })
    return new_item


def build_pool_and_reco(macro_summary: dict) -> tuple[dict, dict, list[dict]]:
    fixed = [score_pool_item(x, macro_summary) for x in FIXED_POOL]
    dynamic = [score_pool_item(x, macro_summary) for x in DYNAMIC_POOL]

    all_items = fixed + dynamic
    add = [{"symbol": x["symbol"], "reason": x["reason"]} for x in all_items if x["today"] == "可加入"][:5]
    watch = [{"symbol": x["symbol"], "reason": x["reason"]} for x in all_items if x["today"] == "持續觀察"][:5]
    avoid = [{"symbol": x["symbol"], "reason": x["reason"]} for x in all_items if x["today"] == "暫不建議"][:5]

    if macro_summary["market_env"] == "可做":
        scenarios = [
            {"name": "情境 A：穩定收息", "targets": ["TSM", "MSFT", "UNH"], "eki": "80%–85%", "tenor": "6–12 個月", "goal": "低波動穩定收息"},
            {"name": "情境 B：平衡收益", "targets": ["NVDA", "AVGO", "AMD", "AMAT"], "eki": "70%–80%", "tenor": "3–9 個月", "goal": "收益與風險平衡"},
            {"name": "情境 C：高收益進攻", "targets": ["PLTR", "ARM"], "eki": "60%–70%", "tenor": "1–3 個月", "goal": "高收益，但部位要小"},
        ]
    elif macro_summary["market_env"] == "保守做":
        scenarios = [
            {"name": "情境 A：穩定收息", "targets": ["TSM", "MSFT", "UNH"], "eki": "80%–85%", "tenor": "6–12 個月", "goal": "防守為主"},
            {"name": "情境 B：平衡收益", "targets": ["NVDA", "AVGO"], "eki": "75%–80%", "tenor": "3–6 個月", "goal": "只保留主力池"},
            {"name": "情境 C：避險觀望", "targets": ["TSM", "MSFT"], "eki": "80%–85%", "tenor": "短中期", "goal": "降低高波動曝險"},
        ]
    else:
        scenarios = [
            {"name": "情境 A：避險觀望", "targets": ["MSFT", "UNH"], "eki": "80%–85%", "tenor": "短中期", "goal": "只保留低波動核心"},
            {"name": "情境 B：暫停進攻型", "targets": ["COIN", "TSLA", "PLTR"], "eki": "不建議", "tenor": "暫停", "goal": "避免高波動敲入"},
        ]

    return (
        {"fixed_pool": fixed, "dynamic_pool": dynamic},
        {"add": add, "watch": watch, "avoid": avoid},
        scenarios,
    )


# =========================
# 文字結論
# =========================
def build_conclusion(macro_summary: dict, recommendations: dict) -> tuple[str, list[dict], list[dict], list[dict]]:
    env = macro_summary["market_env"]
    add_symbols = [x["symbol"] for x in recommendations["add"]][:4]
    watch_symbols = [x["symbol"] for x in recommendations["watch"]][:3]
    avoid_symbols = [x["symbol"] for x in recommendations["avoid"]][:3]

    if env == "可做":
        conclusion = f"可以做 FCN，優先配置 {' / '.join(add_symbols) or 'AI 核心股'}，並持續監控 ORCL / COIN 風險集中。"
    elif env == "保守做":
        conclusion = f"今天可保守做 FCN，建議以 {' / '.join(add_symbols[:3]) or '核心防守股'} 為主，避免進攻型標的過重。"
    else:
        conclusion = "今天較適合觀望或只做防守型 FCN，先避開高波動與風險集中的標的。"

    strategy_cards = [
        {
            "title": "監控 ORCL 風險集中",
            "action": "持續關注",
            "reason": "你目前高優先監控部位仍集中於 ORCL，需避免再加重同類曝險。",
            "level": "watch",
        },
        {
            "title": "降低 COIN / 高波動權重",
            "action": "降低權重",
            "reason": "若總經波動升高，高 beta 標的更容易放大 FCN 敲入風險。",
            "level": "watch",
        },
        {
            "title": "優先核心池",
            "action": "可配置",
            "reason": f"目前建議先看：{' / '.join(add_symbols) if add_symbols else 'NVDA / AVGO / TSM / MSFT'}。",
            "level": "ok",
        },
    ]

    risk_overview = [
        {"label": "高優先監控", "text": f"{RISK_RANKINGS[0]['code']}，Worst-of 為 {RISK_RANKINGS[0]['stock']}，距下限 {RISK_RANKINGS[0]['distance_to_barrier_pct']}%。"},
        {"label": "總經環境", "text": macro_summary["market_env_text"]},
        {"label": "今日建議", "text": f"可加入：{' / '.join(add_symbols) if add_symbols else '暫無'}；觀察：{' / '.join(watch_symbols) if watch_symbols else '暫無'}；避免：{' / '.join(avoid_symbols) if avoid_symbols else '暫無'}。"},
    ]

    vix = macro_summary.get("vix")
    vix_risk = 40 if vix is None else min(max(int(vix * 2), 10), 95)
    ai_safety = 78 if env == "可做" else (62 if env == "保守做" else 45)

    risk_radar = [
        {"label": "ORCL 風險集中度", "value": 68, "type": "watch"},
        {"label": "COIN 風險集中度", "value": 61, "type": "watch"},
        {"label": "VIX 壓力", "value": vix_risk, "type": "risk" if vix_risk >= 55 else "watch"},
        {"label": "AI 核心股安全度", "value": ai_safety, "type": "ok" if ai_safety >= 70 else "watch"},
    ]

    return conclusion, strategy_cards, risk_overview, risk_radar


# =========================
# 主流程
# =========================
def build_data() -> dict:
    updated_at = now_local_str()

    international_news = fetch_international_news()[:12]
    financial_news = fetch_financial_news()[:12]
    ai_trend = fetch_ai_trend()[:8]
    macro_cards, macro_summary = build_macro_module()

    pool_analysis, today_recommendations, scenario_suggestions = build_pool_and_reco(macro_summary)
    main_conclusion, strategy_cards, risk_overview, risk_radar = build_conclusion(macro_summary, today_recommendations)

    data = {
        "updated_at": updated_at,
        "summary": {
            "active_fcn_count": 24,
            "top_risk_code": RISK_RANKINGS[0]["code"],
            "worst_of": RISK_RANKINGS[0]["stock"],
            "market_env": macro_summary["market_env"],
            "main_conclusion": main_conclusion,
        },
        "morning_brief": {
            "international_news": international_news,
            "financial_news": financial_news,
            "ai_trend": ai_trend,
            "macro": macro_cards,
        },
        "strategy_cards": strategy_cards,
        "risk_overview": risk_overview,
        "risk_radar": risk_radar,
        "fcn_rankings": RISK_RANKINGS,
        "holdings_brief": RISK_RANKINGS[:3],
        "pool_analysis": pool_analysis,
        "today_recommendations": today_recommendations,
        "scenario_suggestions": scenario_suggestions,
    }
    return data


if __name__ == "__main__":
    data = build_data()
    Path("data.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    print("data.json updated at", data["updated_at"])
