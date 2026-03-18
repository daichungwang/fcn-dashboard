from pathlib import Path
from datetime import datetime, timezone
import os
import json
import re
import requests

NEWSAPI_KEY = os.getenv("NEWSAPI_KEY", "").strip()
FRED_API_KEY = os.getenv("FRED_API_KEY", "").strip()

NEWSAPI_BASE = "https://newsapi.org/v2"
FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"
TIMEOUT = 20
HEADERS = {"User-Agent": "fcn-dashboard/6.1"}

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

RISK_RANKINGS = [
    {"code": "FCN710H", "stock": "ORCL", "price": 155.97, "strike": 185.01, "barrier": 134.44, "status": "持續關注", "distance_to_barrier_pct": 16.0, "level": "watch"},
    {"code": "FCN465K", "stock": "ORCL", "price": 155.97, "strike": 179.59, "barrier": 134.44, "status": "持續關注", "distance_to_barrier_pct": 16.0, "level": "watch"},
    {"code": "FCN935K", "stock": "COIN", "price": 203.32, "strike": 243.98, "barrier": 178.11, "status": "持續關注", "distance_to_barrier_pct": 14.2, "level": "watch"},
    {"code": "FCN791K", "stock": "COIN", "price": 203.32, "strike": 225.21, "barrier": 178.11, "status": "持續關注", "distance_to_barrier_pct": 14.2, "level": "watch"},
    {"code": "FCN499G", "stock": "NVDA", "price": 183.22, "strike": 189.98, "barrier": 151.98, "status": "健康", "distance_to_barrier_pct": 20.6, "level": "ok"},
]

def now_local_str() -> str:
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M")

def req_json(url: str, params: dict | None = None):
    try:
        r = requests.get(url, params=params, headers=HEADERS, timeout=TIMEOUT)
        r.raise_for_status()
        return r.json()
    except Exception:
        return None

def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()

def compact_text(text: str, max_len: int = 120) -> str:
    text = clean_text(text)
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rstrip() + "…"

def infer_fcn_impact(text: str) -> tuple[bool, str, int]:
    t = (text or "").lower()
    score = 0
    note = "影響有限"

    if any(w in t for w in ["vix", "volatility", "selloff", "risk-off"]):
        score -= 2
        note = "波動升高，FCN 敲入風險增加"
    elif any(w in t for w in ["fed", "rate cut", "soft landing", "disinflation"]):
        score += 1
        note = "利率壓力若下降，FCN 環境通常較有利"
    elif any(w in t for w in ["yield spike", "treasury yields", "higher for longer"]):
        score -= 1
        note = "利率上行可能壓抑科技股與 FCN 安全邊際"
    elif any(w in t for w in ["oil", "middle east", "geopolitical", "tariff"]):
        score -= 1
        note = "地緣風險升高，需留意市場波動擴大"

    affects = score != 0 or any(
        w in t for w in ["fed", "vix", "yield", "oil", "inflation", "cpi", "jobs", "treasury"]
    )
    return affects, note, score

def article_to_card(article: dict, category: str = "") -> dict:
    title = compact_text(article.get("title") or "未命名新聞", 120)
    desc = compact_text(article.get("description") or "", 110)
    content_raw = article.get("content") or article.get("description") or title
    affects, note, score = infer_fcn_impact(f"{title} {desc} {content_raw}")

    if not desc:
        desc = compact_text(note, 90)

    content = compact_text(content_raw, 220)
    if category:
        content = f"{content}｜分類：{category}｜解讀：{note}"
    else:
        content = f"{content}｜解讀：{note}"

    return {
        "title": title,
        "summary": desc,
        "content": content,
        "affects_fcn": affects,
        "impact_score": score
    }

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

def dedupe_articles(articles: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for a in articles:
        title = clean_text(a.get("title", ""))
        if not title or title in seen:
            continue
        seen.add(title)
        out.append(a)
    return out

def fetch_international_news() -> list[dict]:
    buckets = [
        ("地緣政治", "middle east OR geopolitics OR oil market OR war"),
        ("全球經濟", "global economy OR recession risk OR global growth"),
        ("貿易政策", "tariffs OR trade tensions OR export controls"),
    ]
    cards = []
    for label, query in buckets:
        cards.extend([article_to_card(a, label) for a in fetch_newsapi_everything(query, page_size=8)])
    cards = dedupe_articles(cards)
    return cards[:12] or [{
        "title": "國際新聞資料來源未設定",
        "summary": "目前未設定 NEWSAPI_KEY。",
        "content": "設定 NEWSAPI_KEY 後，這裡會自動抓 10–20 則國際新聞。",
        "affects_fcn": True,
        "impact_score": 0
    }]

def fetch_financial_news() -> list[dict]:
    buckets = [
        ("Fed / 利率", "federal reserve OR interest rates OR treasury yields"),
        ("通膨 / 就業", "inflation OR CPI OR jobs report OR unemployment"),
        ("市場 / 波動", "stock market volatility OR VIX OR equity selloff"),
    ]
    cards = []
    for label, query in buckets:
        cards.extend([article_to_card(a, label) for a in fetch_newsapi_everything(query, page_size=8)])
    cards = dedupe_articles(cards)
    return cards[:12] or [{
        "title": "國際財經新聞資料來源未設定",
        "summary": "目前未設定 NEWSAPI_KEY。",
        "content": "設定 NEWSAPI_KEY 後，這裡會自動抓 10–20 則國際財經新聞。",
        "affects_fcn": True,
        "impact_score": 0
    }]

def fetch_ai_trend() -> list[dict]:
    buckets = [
        ("AI Agent", "AI agent OR agentic AI OR autonomous agents"),
        ("AI 基礎設施", "NVIDIA OR Broadcom OR TSMC OR Microsoft AI"),
        ("模型 / 推論", "OpenAI OR Anthropic OR inference chips OR AI infrastructure"),
    ]
    pool_symbols = {p["symbol"] for p in FIXED_POOL + DYNAMIC_POOL}
    cards = []

    for label, query in buckets:
        for a in fetch_newsapi_everything(query, page_size=6):
            title = clean_text(a.get("title", ""))
            if not title:
                continue
            base = article_to_card(a, label)
            joined = f"{title} {a.get('description','')} {a.get('content','')}".upper()
            hits = [s for s in pool_symbols if s in joined]

            if any(s in joined for s in ["NVDA", "AVGO", "TSM", "MSFT"]):
                invest = "建議：核心池"
            elif any(s in joined for s in ["AMD", "AMAT", "MRVL", "ARM", "PLTR"]):
                invest = "建議：觀察池"
            else:
                invest = "建議：持續觀察"

            base["content"] += f"｜FCN Pool：{', '.join(hits) if hits else '未直接命中'}｜{invest}"
            cards.append(base)

    cards = dedupe_articles(cards)
    return cards[:8] or [{
        "title": "AI 趨勢資料來源未設定",
        "summary": "目前未設定 NEWSAPI_KEY。",
        "content": "設定 NEWSAPI_KEY 後，這裡會自動抓取 AI agent / AI 基礎設施新聞。",
        "affects_fcn": True,
        "impact_score": 0
    }]

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

def format_delta(curr: float | None, prev: float | None, unit: str = "") -> str:
    if curr is None:
        return "N/A"
    if prev is None:
        return f"{curr:.2f}{unit}"
    d = curr - prev
    sign = "+" if d >= 0 else ""
    return f"{curr:.2f}{unit}（{sign}{d:.2f}{unit}）"

def build_macro_module() -> tuple[list[dict], dict]:
    cpi, cpi_prev = fred_latest("CPIAUCSL")
    fed, fed_prev = fred_latest("FEDFUNDS")
    vix, vix_prev = fred_latest("VIXCLS")
    dgs10, dgs10_prev = fred_latest("DGS10")
    dgs20, dgs20_prev = fred_latest("DGS20")
    sp500, sp500_prev = fred_latest("SP500")
    unrate, unrate_prev = fred_latest("UNRATE")
    oil, oil_prev = fred_latest("DCOILWTICO")
    gold, gold_prev = fred_latest("GOLDAMGBD228NLBM")

    if not FRED_API_KEY:
        return ([{
            "title": "總經資料來源未設定",
            "summary": "目前未設定 FRED_API_KEY。",
            "content": "設定 FRED_API_KEY 後，這裡會自動抓 CPI、Fed、VIX、10Y、20Y、油價、黃金等資料。",
            "affects_fcn": True,
            "impact_score": 0
        }], {
            "market_env": "保守做",
            "market_env_text": "目前為模板模式，設定 FRED_API_KEY 後會切換為真實總經判讀。",
            "score": 0,
            "vix": None,
        })

    score = 0
    reasons = []

    if vix is not None:
        if vix < 18:
            score += 2
            reasons.append("VIX 偏低，市場波動可控")
        elif vix < 24:
            reasons.append("VIX 中性，FCN 可做但需控風險")
        else:
            score -= 2
            reasons.append("VIX 偏高，敲入風險增加")

    if dgs10 is not None and dgs10_prev is not None:
        if dgs10 <= dgs10_prev:
            score += 1
            reasons.append("10Y 利率未再上行")
        else:
            score -= 1
            reasons.append("10Y 利率上升，科技股壓力增加")

    if sp500 is not None and sp500_prev is not None:
        if sp500 >= sp500_prev:
            score += 1
            reasons.append("美股大盤穩定")
        else:
            score -= 1
            reasons.append("美股大盤回落")

    if oil is not None and oil_prev is not None and oil > oil_prev:
        score -= 1
        reasons.append("油價走升，地緣與通膨壓力偏高")

    if score >= 2:
        env = "可做"
        env_text = "總經環境中性偏有利，FCN 可做，但仍需避免風險集中在單一高敏感標的。"
    elif score >= 0:
        env = "保守做"
        env_text = "總經環境中性，FCN 可做但需偏保守，優先核心股。"
    else:
        env = "觀望"
        env_text = "總經壓力偏高，建議降低進攻型 FCN。"

    cards = [
        {
            "title": f"CPI：{format_delta(cpi, cpi_prev)}",
            "summary": "通膨若放緩，通常有利 FCN 環境。",
            "content": "通膨走勢會影響 Fed 與市場風險偏好。",
            "affects_fcn": True,
            "impact_score": 1
        },
        {
            "title": f"Fed Funds：{format_delta(fed, fed_prev, '%')}",
            "summary": "利率下行通常較有利風險資產。",
            "content": "Fed 方向是 FCN 環境的重要核心變數。",
            "affects_fcn": True,
            "impact_score": 1
        },
        {
            "title": f"VIX：{format_delta(vix, vix_prev)}",
            "summary": "VIX 上升代表 FCN 敲入風險上升。",
            "content": "VIX 是你每日要看的核心指標。",
            "affects_fcn": True,
            "impact_score": -2
        },
        {
            "title": f"10Y / 20Y：{format_delta(dgs10, dgs10_prev, '%')} / {format_delta(dgs20, dgs20_prev, '%')}",
            "summary": "中長期利率上升會壓抑科技估值。",
            "content": "科技與 AI 核心股會受中長債殖利率影響。",
            "affects_fcn": True,
            "impact_score": -1
        },
        {
            "title": f"油價 / 黃金：{format_delta(oil, oil_prev)} / {format_delta(gold, gold_prev)}",
            "summary": "油價與黃金反映通膨與避險情緒。",
            "content": "若兩者同步走升，通常代表市場更保守。",
            "affects_fcn": True,
            "impact_score": -1
        },
        {
            "title": f"失業率：{format_delta(unrate, unrate_prev, '%')}｜S&P500：{format_delta(sp500, sp500_prev)}",
            "summary": "就業與股市穩定度共同反映風險偏好。",
            "content": "若就業惡化且股市回落，FCN 需更保守。",
            "affects_fcn": True,
            "impact_score": 0
        },
    ]

    return cards, {
        "market_env": env,
        "market_env_text": env_text,
        "score": score,
        "reasons": reasons,
        "vix": vix,
    }

def score_pool_item(item: dict, macro_summary: dict) -> dict:
    symbol = item["symbol"]
    score = 0

    if symbol in {"NVDA", "AVGO", "TSM", "MSFT"}:
        score += 3
    if symbol in {"AMD", "AMAT", "MRVL", "ARM", "ORCL"}:
        score += 1
    if symbol in {"COIN", "TSLA", "PLTR", "CRDO", "ALAB"}:
        score -= 1

    env = macro_summary["market_env"]
    if env == "可做":
        score += 1 if item["risk"] != "高" else 0
    elif env == "保守做":
        score += 1 if item["risk"] == "低" else -1
    else:
        score += 1 if item["risk"] == "低" else -2

    if symbol in {"ORCL", "COIN"}:
        score -= 2

    if score >= 3:
        today = "可加入"
        level = "ok"
        reason = "屬核心池 / 防守池，且現階段環境允許配置。"
    elif score >= 1:
        today = "持續觀察"
        level = "watch"
        reason = "可列觀察，但不宜重壓。"
    else:
        today = "暫不建議"
        level = "risk"
        reason = "現階段波動或集中風險偏高。"

    x = dict(item)
    x.update({
        "day_change": "",
        "five_day": "",
        "today": today,
        "reason": reason,
        "level": level,
    })
    return x

def build_pool_and_reco(macro_summary: dict):
    fixed = [score_pool_item(x, macro_summary) for x in FIXED_POOL]
    dynamic = [score_pool_item(x, macro_summary) for x in DYNAMIC_POOL]
    all_items = fixed + dynamic

    add = [{"symbol": x["symbol"], "reason": x["reason"]} for x in all_items if x["today"] == "可加入"][:5]
    watch = [{"symbol": x["symbol"], "reason": x["reason"]} for x in all_items if x["today"] == "持續觀察"][:5]
    avoid = [{"symbol": x["symbol"], "reason": x["reason"]} for x in all_items if x["today"] == "暫不建議"][:5]

    env = macro_summary["market_env"]
    if env == "可做":
        scenarios = [
            {"name": "穩定收息", "targets": ["TSM", "MSFT", "UNH"], "eki": "80%–85%", "tenor": "6–12個月", "goal": "低波動穩定收息"},
            {"name": "平衡收益", "targets": ["NVDA", "AVGO", "AMD"], "eki": "70%–80%", "tenor": "3–9個月", "goal": "主力配置"},
            {"name": "進攻型", "targets": ["PLTR", "ARM"], "eki": "60%–70%", "tenor": "1–3個月", "goal": "部位小、追求收益"},
        ]
    elif env == "保守做":
        scenarios = [
            {"name": "穩定收息", "targets": ["TSM", "MSFT", "UNH"], "eki": "80%–85%", "tenor": "6–12個月", "goal": "防守優先"},
            {"name": "平衡收益", "targets": ["NVDA", "AVGO"], "eki": "75%–80%", "tenor": "3–6個月", "goal": "只留主力池"},
        ]
    else:
        scenarios = [
            {"name": "避險觀望", "targets": ["MSFT", "UNH"], "eki": "80%–85%", "tenor": "短中期", "goal": "只保留低波動核心"},
        ]

    return {"fixed_pool": fixed, "dynamic_pool": dynamic}, {"add": add, "watch": watch, "avoid": avoid}, scenarios

def build_conclusion(macro_summary: dict, recommendations: dict):
    add_symbols = [x["symbol"] for x in recommendations["add"]][:4]
    watch_symbols = [x["symbol"] for x in recommendations["watch"]][:3]
    avoid_symbols = [x["symbol"] for x in recommendations["avoid"]][:3]

    env = macro_summary["market_env"]
    if env == "可做":
        conclusion = f"今天可做 FCN，優先配置 {' / '.join(add_symbols) or 'AI 核心股'}，並持續監控 ORCL / COIN 風險集中。"
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
        {"label": "今日推薦", "text": f"可加入：{' / '.join(add_symbols) if add_symbols else '暫無'}；觀察：{' / '.join(watch_symbols) if watch_symbols else '暫無'}；避免：{' / '.join(avoid_symbols) if avoid_symbols else '暫無'}。"},
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

def build_data():
    updated_at = now_local_str()

    international_news = fetch_international_news()
    financial_news = fetch_financial_news()
    ai_trend = fetch_ai_trend()
    macro_cards, macro_summary = build_macro_module()
    pool_analysis, today_recommendations, scenario_suggestions = build_pool_and_reco(macro_summary)
    main_conclusion, strategy_cards, risk_overview, risk_radar = build_conclusion(macro_summary, today_recommendations)

    return {
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

if __name__ == "__main__":
    data = build_data()
    Path("data.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print("data.json updated at", data["updated_at"])
