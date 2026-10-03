#!/usr/bin/env python3
"""Build Item 8 stock allocation health runtime summary."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
OUT_PATH = ROOT / "data" / "mm" / "item8_stock_allocation_health.json"

SOURCE = "scripts/mm/build_item8_stock_allocation_health.py"
VERSION = "v1_item8_stock_allocation_health"
IMPACT_METHOD = "per_underlying_full_notional"

AMOUNT_FIELDS = ("amount", "notional", "principal", "investment_amount", "face_value", "issue_amount", "amt")
SYMBOL_FIELDS = ("symbols", "underlyings", "basket", "stocks", "stock", "underlying", "tickers")
EXCLUDED_STATUS = {"closed", "expired", "redeemed", "early_exit", "settled", "inactive"}
EXIT_FIELDS = ("exit_date", "exit_time")
MATURITY_FIELDS = ("maturity_date", "expiry_date", "maturity_time", "expiry_time", "maturity", "expiry")
SYMBOL_SPLIT_RE = re.compile(r"[,+/;|&\s]+")
NUMBER_RE = re.compile(r"[-+]?\d[\d,]*(?:\.\d+)?")
ETF_SYMBOLS = {"SMH", "QQQ", "LQD"}
THEMES = {
    "AI_SEMI",
    "AI_INFRA",
    "AI_POWER",
    "AI_APPLICATION",
    "PLATFORM",
    "AI_HOSTING",
    "FINANCIAL",
    "CONSUMER",
    "HEALTHCARE",
    "TRAVEL",
    "ETF",
    "CRYPTO",
}
CATEGORY_ORDER = ["Core", "Growth", "Defensive / Income", "Speculative", "ETF"]
CATEGORY_TARGETS = {
    "Core": 40.0,
    "Growth": 25.0,
    "Defensive / Income": 15.0,
    "Speculative": 10.0,
    "ETF": 10.0,
}
STOCK_LIMIT_OVERRIDES = {
    "NVDA": 900000.0,
    "TSM": 900000.0,
    "SMH": 700000.0,
    "AVGO": 700000.0,
    "GOOG": 700000.0,
    "MSFT": 700000.0,
    "AAPL": 600000.0,
    "MRVL": 300000.0,
    "AMD": 300000.0,
    "COIN": 30000.0,
    "ALAB": 30000.0,
    "CRDO": 30000.0,
    "LITE": 30000.0,
    "NKE": 30000.0,
}
STOCK_CATEGORY_LIMITS = {
    "core": 500000.0,
    "growth": 300000.0,
    "defensive": 300000.0,
    "income": 300000.0,
    "defensive / income": 300000.0,
    "etf": 700000.0,
    "speculative": 30000.0,
    "watch": 100000.0,
    "unknown": 100000.0,
}
CATEGORY_IMPACT_LIMITS = {
    "Core": 1800000.0,
    "Growth": 1200000.0,
    "Defensive / Income": 1000000.0,
    "ETF": 900000.0,
    "Speculative": 120000.0,
    "Unknown": 100000.0,
}
THEME_IMPACT_LIMITS = {
    "AI_SEMI": 1800000.0,
    "AI_APPLICATION": 1200000.0,
    "AI_INFRA": 700000.0,
    "AI_POWER": 700000.0,
    "PLATFORM": 700000.0,
    "HEALTHCARE": 700000.0,
    "CONSUMER": 500000.0,
    "TRAVEL": 300000.0,
    "FINANCIAL": 100000.0,
    "ETF": 900000.0,
    "Unknown": 100000.0,
}


def read_json(relative_path: str, default: Any) -> Any:
    path = ROOT / relative_path
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def normalize_symbol(value: Any) -> str | None:
    if value is None:
        return None
    symbol = str(value).strip().upper()
    return symbol or None


def as_number(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    match = NUMBER_RE.search(text)
    if not match:
        return 0.0
    text = match.group(0).replace(",", "")
    try:
        return float(text)
    except ValueError:
        return 0.0


def extract_notional(row: dict[str, Any]) -> tuple[float, str | None]:
    for field in AMOUNT_FIELDS:
        amount = as_number(row.get(field))
        if amount > 0:
            return amount, field
    return 0.0, None


def has_value(value: Any) -> bool:
    return value is not None and str(value).strip() != ""


def is_truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "y"}


def is_falsey(value: Any) -> bool:
    if isinstance(value, bool):
        return not value
    if value is None:
        return False
    return str(value).strip().lower() in {"0", "false", "no", "n"}


def parse_date(value: Any) -> date | None:
    if not has_value(value):
        return None
    text = str(value).strip()
    for token in (text[:10], text):
        try:
            return datetime.fromisoformat(token.replace("Z", "+00:00")).date()
        except ValueError:
            continue
    return None


def active_status(row: dict[str, Any], today: date) -> tuple[bool, str | None]:
    status = str(row.get("status") or "").strip().lower()
    if status in EXCLUDED_STATUS:
        return False, f"status_{status}"
    if "is_active" in row and is_falsey(row.get("is_active")):
        return False, "is_active_false"
    for flag in ("closed", "redeemed", "early_exit"):
        if is_truthy(row.get(flag)):
            return False, f"{flag}_true"
    for field in EXIT_FIELDS:
        if has_value(row.get(field)):
            return False, f"{field}_present"

    explicit_active = is_truthy(row.get("is_active"))
    if not explicit_active:
        for field in MATURITY_FIELDS:
            d = parse_date(row.get(field))
            if d and d < today:
                return False, f"{field}_past"
    return True, None


def flatten_symbols(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [part for part in SYMBOL_SPLIT_RE.split(value) if part]
    if isinstance(value, dict):
        candidates: list[str] = []
        for key in ("symbol", "ticker", "name", "underlying"):
            if key in value:
                candidates.extend(flatten_symbols(value.get(key)))
        if not candidates:
            for key in value.keys():
                candidates.extend(flatten_symbols(key))
        return candidates
    if isinstance(value, list):
        result: list[str] = []
        for item in value:
            result.extend(flatten_symbols(item))
        return result
    return [str(value)]


def extract_symbols(row: dict[str, Any]) -> list[str]:
    symbols: list[str] = []
    for field in SYMBOL_FIELDS:
        if field in row:
            symbols.extend(flatten_symbols(row.get(field)))
    normalized = [symbol for symbol in (normalize_symbol(item) for item in symbols) if symbol]
    return sorted(set(normalized))


def index_by_symbol(rows: Any) -> dict[str, dict[str, Any]]:
    if isinstance(rows, dict) and isinstance(rows.get("rows"), list):
        rows = rows["rows"]
    if not isinstance(rows, list):
        return {}
    indexed: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        symbol = normalize_symbol(row.get("symbol"))
        if symbol:
            indexed[symbol] = row
    return indexed


def normalize_category(raw: Any, symbol: str) -> str:
    if symbol in ETF_SYMBOLS:
        return "ETF"
    text = str(raw or "").strip().lower().replace("_", " ").replace("-", " ")
    if text == "etf":
        return "ETF"
    if text == "core":
        return "Core"
    if text == "growth":
        return "Growth"
    if text in {"defensive", "income", "defensive income", "defensive / income"}:
        return "Defensive / Income"
    if text == "speculative":
        return "Speculative"
    return "Unknown"


def classify_category(symbol: str, pool30: dict[str, dict[str, Any]], universe: dict[str, dict[str, Any]]) -> str:
    pool_row = pool30.get(symbol)
    if pool_row:
        sector = str(pool_row.get("sector") or "").strip().upper()
        if sector == "ETF" or symbol in ETF_SYMBOLS:
            return "ETF"
        category = normalize_category(pool_row.get("category"), symbol)
        if category != "Unknown":
            return category
    uni_row = universe.get(symbol)
    if uni_row:
        category = normalize_category(uni_row.get("category"), symbol)
        if category != "Unknown":
            return category
    return "ETF" if symbol in ETF_SYMBOLS else "Unknown"


def normalize_theme(raw: Any, symbol: str) -> str:
    if symbol in ETF_SYMBOLS:
        return "ETF"
    text = str(raw or "").strip().upper().replace("-", "_").replace(" ", "_")
    aliases = {
        "CLOUD": "PLATFORM",
        "SAAS": "AI_APPLICATION",
        "SOFTWARE": "AI_APPLICATION",
        "BANK": "FINANCIAL",
        "FINANCE": "FINANCIAL",
        "DEFENSIVE": "HEALTHCARE",
    }
    text = aliases.get(text, text)
    return text if text in THEMES else "Unknown"


def classify_theme(symbol: str, pool30: dict[str, dict[str, Any]], universe: dict[str, dict[str, Any]]) -> str:
    pool_row = pool30.get(symbol)
    if pool_row:
        theme = normalize_theme(pool_row.get("sector"), symbol)
        if theme != "Unknown":
            return theme
    uni_row = universe.get(symbol)
    if uni_row:
        theme = normalize_theme(uni_row.get("sector"), symbol)
        if theme != "Unknown":
            return theme
    return "ETF" if symbol in ETF_SYMBOLS else "Unknown"


def pct(value: float, total: float) -> float:
    return round((value / total * 100.0), 2) if total > 0 else 0.0


def limit_status(amount: float, limit: float) -> tuple[float, str]:
    usage = pct(amount, limit)
    if limit <= 0:
        return 0.0, "OK"
    if amount > limit:
        return usage, "Over Limit"
    if usage >= 80.0:
        return usage, "Near Limit"
    return usage, "OK"


def health_light(amount: float, limit: float, danger_count: int = 0, watch_count: int = 0) -> tuple[str, str]:
    usage, status = limit_status(amount, limit)
    if danger_count > 0 or status == "Over Limit":
        return status, "Red"
    if watch_count > 0 or usage >= 80.0:
        return status, "Yellow"
    return status, "Green"


def limit_action(status: str, danger_count: int = 0, watch_count: int = 0) -> str:
    if status == "Over Limit":
        return "暫停新增"
    if danger_count > 0:
        return "優先處理"
    if status == "Near Limit" or watch_count > 0:
        return "只觀察，不主動加碼"
    return "可維持"


def stock_limit(symbol: str, category: str) -> float:
    if symbol in STOCK_LIMIT_OVERRIDES:
        return STOCK_LIMIT_OVERRIDES[symbol]
    key = str(category or "unknown").strip().lower()
    return STOCK_CATEGORY_LIMITS.get(key, STOCK_CATEGORY_LIMITS["unknown"])


def impact_fields(amount: float, limit: float, danger_count: int = 0, watch_count: int = 0) -> dict[str, Any]:
    usage, status = limit_status(amount, limit)
    status, light = health_light(amount, limit, danger_count, watch_count)
    return {
        "linked_impact_amount": round(amount, 2),
        "impact_limit": round(limit, 2),
        "impact_room": round(limit - amount, 2),
        "limit_usage_pct": usage,
        "limit_status": status,
        "light": light,
        "action": limit_action(status, danger_count, watch_count),
    }


def build_allocation(items: dict[str, float], total: float, order: list[str] | None = None) -> list[dict[str, Any]]:
    keys = order or sorted(items, key=lambda key: (-items[key], key))
    return [
        {"name": key, "exposure": round(items.get(key, 0.0), 2), "weight": pct(items.get(key, 0.0), total)}
        for key in keys
        if key in items or order
    ]


def build_impact_allocation(
    items: dict[str, float],
    total: float,
    limits: dict[str, float],
    health_counts: dict[str, dict[str, int]],
    top_symbols: dict[str, list[str]],
    order: list[str] | None = None,
) -> list[dict[str, Any]]:
    rows = []
    for row in build_allocation(items, total, order):
        name = row["name"]
        counts = health_counts.get(name, {})
        danger_count = int(counts.get("danger_count", 0))
        watch_count = int(counts.get("watch_count", 0))
        healthy_count = int(counts.get("healthy_count", 0))
        limit = limits.get(name, limits.get("Unknown", 100000.0))
        row.update(
            impact_fields(row["exposure"], limit, danger_count, watch_count)
            | {
                "danger_count": danger_count,
                "watch_count": watch_count,
                "healthy_count": healthy_count,
                "top_symbols": top_symbols.get(name, [])[:5],
            }
        )
        rows.append(row)
    return rows


def warning(severity: str, code: str, message: str, weight: float | None = None) -> dict[str, Any]:
    row: dict[str, Any] = {"severity": severity, "code": code, "message": message}
    if weight is not None:
        row["weight"] = round(weight, 2)
    return row


def health_from_warnings(warnings: list[dict[str, Any]]) -> str:
    severities = {item["severity"] for item in warnings}
    if "Risk" in severities:
        return "Risk"
    if "Watch" in severities:
        return "Watch"
    return "Healthy"


def score_value(row: dict[str, Any], keys: tuple[str, ...]) -> float | None:
    for key in keys:
        value = row.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return None


def valuation_risk(row: dict[str, Any]) -> str | None:
    for key in ("valuation_risk", "valuation_heat_risk", "risk_level"):
        value = row.get(key)
        if value:
            return str(value)
    return None


def exposure_health_counts(symbol: str, deal_count: int, m2_stocks: dict[str, Any]) -> dict[str, int]:
    row = m2_stocks.get(symbol)
    danger_count = int(as_number(row.get("danger"))) if isinstance(row, dict) else 0
    watch_count = int(as_number(row.get("watch"))) if isinstance(row, dict) else 0
    healthy_count = max(int(deal_count) - danger_count - watch_count, 0)
    return {
        "danger_count": max(danger_count, 0),
        "watch_count": max(watch_count, 0),
        "healthy_count": healthy_count,
    }


def build_recommendations(
    pool30: dict[str, dict[str, Any]],
    universe: dict[str, dict[str, Any]],
    m1: dict[str, dict[str, Any]],
    m7: dict[str, dict[str, Any]],
    exposure_by_symbol: dict[str, float],
    category_weights: dict[str, float],
    theme_weights: dict[str, float],
) -> list[dict[str, Any]]:
    candidates = set(universe) | set(m1) | set(m7) | set(pool30)
    rows: list[dict[str, Any]] = []
    speculative_overweight = category_weights.get("Speculative", 0.0) > 15.0

    for symbol in sorted(candidates):
        category = classify_category(symbol, pool30, universe)
        theme = classify_theme(symbol, pool30, universe)
        m1_score = score_value(m1.get(symbol, {}), ("M1_score", "m1_score", "raw_m1_score"))
        m7_score = score_value(m7.get(symbol, {}), ("m7_final_score", "m7_effective_score", "m7_v2_score"))
        invested = round(exposure_by_symbol.get(symbol, 0.0), 2)
        available = 1 if invested == 0 else 0
        score = 0.0
        reasons: list[str] = []

        if symbol in pool30:
            score += 30.0
            reasons.append("pool30 symbol")
        if m1_score is not None:
            score += m1_score * 2.0
            if m1_score >= 7:
                score += 8.0
                reasons.append(f"M1 >= 7 ({m1_score:.2f})")
        if m7_score is not None:
            score += m7_score * 2.0
            if m7_score >= 7:
                score += 8.0
                reasons.append(f"M7 >= 7 ({m7_score:.2f})")
        if invested == 0:
            score += 8.0
            reasons.append("not currently invested")
        elif available > 0:
            score += 5.0
            reasons.append("available exposure")

        if speculative_overweight and category == "Speculative":
            score -= 18.0
            reasons.append("speculative bucket overweight penalty")
        if category != "Unknown" and category_weights.get(category, 0.0) > CATEGORY_TARGETS.get(category, 100.0) + 10.0:
            score -= 10.0
            reasons.append(f"{category} overweight penalty")
        if theme != "Unknown" and theme_weights.get(theme, 0.0) > (45.0 if theme == "AI_SEMI" else 35.0):
            score -= 8.0
            reasons.append(f"{theme} theme overweight penalty")

        risk = valuation_risk(m7.get(symbol, {})) or valuation_risk(m1.get(symbol, {}))
        if risk and str(risk).strip().lower() in {"very high", "extreme", "very_high"}:
            score -= 12.0
            reasons.append(f"valuation risk {risk}")

        if not reasons:
            reasons.append("baseline candidate")
        rows.append(
            {
                "symbol": symbol,
                "score": round(score, 2),
                "category": category,
                "theme": theme,
                "invested": invested,
                "available": available,
                "m1_score": round(m1_score, 2) if m1_score is not None else None,
                "m7_score": round(m7_score, 2) if m7_score is not None else None,
                "reason": reasons,
            }
        )

    rows.sort(key=lambda row: (-row["score"], row["symbol"]))
    return rows[:20]


def main() -> None:
    fcn_pool = read_json("data/fcn_pool.json", [])
    pool30 = index_by_symbol(read_json("data/pool30.json", []))
    universe = index_by_symbol(read_json("data/m1/universe_150.json", []))
    m1 = index_by_symbol(read_json("data/m1/m1_scores.json", {}))
    m7 = index_by_symbol(read_json("data/m7_sandbox/m7_v2_scores.json", {}))
    m2_exposure = read_json("data/m7/m2_stock_exposure.json", {})
    m2_stocks = m2_exposure.get("stocks", {}) if isinstance(m2_exposure, dict) and isinstance(m2_exposure.get("stocks"), dict) else {}

    exposure_by_symbol: dict[str, float] = defaultdict(float)
    deal_count_by_symbol: dict[str, int] = defaultdict(int)
    total_worst_of_exposure = 0.0
    amount_field_usage: dict[str, int] = defaultdict(int)
    excluded_reason_counts: dict[str, int] = defaultdict(int)
    active_deal_count = 0
    excluded_deal_count = 0
    total_raw_deal_count = len(fcn_pool) if isinstance(fcn_pool, list) else 0
    today = datetime.now(timezone.utc).date()

    for row in fcn_pool if isinstance(fcn_pool, list) else []:
        if not isinstance(row, dict):
            excluded_deal_count += 1
            excluded_reason_counts["invalid_row"] += 1
            continue
        is_active, excluded_reason = active_status(row, today)
        if not is_active:
            excluded_deal_count += 1
            excluded_reason_counts[excluded_reason or "not_active"] += 1
            continue
        notional, amount_field = extract_notional(row)
        if notional <= 0:
            excluded_deal_count += 1
            excluded_reason_counts["missing_amount"] += 1
            continue
        symbols = extract_symbols(row)
        if not symbols:
            excluded_deal_count += 1
            excluded_reason_counts["missing_symbols"] += 1
            continue
        active_deal_count += 1
        if amount_field:
            amount_field_usage[amount_field] += 1
        for symbol in symbols:
            exposure_by_symbol[symbol] += notional
            deal_count_by_symbol[symbol] += 1
            total_worst_of_exposure += notional

    if isinstance(m2_exposure, dict) and isinstance(m2_exposure.get("stocks"), dict):
        for symbol, row in m2_exposure["stocks"].items():
            normalized = normalize_symbol(symbol)
            if not normalized or not isinstance(row, dict):
                continue
            deal_count_by_symbol.setdefault(normalized, int(as_number(row.get("fcn_count"))))

    category_exposure: dict[str, float] = defaultdict(float)
    theme_exposure: dict[str, float] = defaultdict(float)
    for symbol, exposure in exposure_by_symbol.items():
        category_exposure[classify_category(symbol, pool30, universe)] += exposure
        theme_exposure[classify_theme(symbol, pool30, universe)] += exposure

    category_weights = {key: pct(value, total_worst_of_exposure) for key, value in category_exposure.items()}
    theme_weights = {key: pct(value, total_worst_of_exposure) for key, value in theme_exposure.items()}

    warnings: list[dict[str, Any]] = []
    speculative_weight = category_weights.get("Speculative", 0.0)
    if speculative_weight > 15.0:
        warnings.append(warning("Risk", "TOO_SPECULATIVE", "Speculative > 15% → Too Speculative", speculative_weight))
    elif speculative_weight > 10.0:
        warnings.append(warning("Watch", "SPECULATIVE_WATCH", "Speculative > 10% → Watch", speculative_weight))

    core_weight = category_weights.get("Core", 0.0)
    if core_weight < 25.0:
        warnings.append(warning("Watch", "CORE_UNDERWEIGHT", "Core < 25% → Core Underweight", core_weight))

    defensive_weight = category_weights.get("Defensive / Income", 0.0)
    if defensive_weight < 10.0:
        warnings.append(
            warning("Watch", "DEFENSIVE_UNDERWEIGHT", "Defensive + Income < 10% → Defensive Underweight", defensive_weight)
        )

    etf_weight = category_weights.get("ETF", 0.0)
    if etf_weight > 20.0:
        warnings.append(warning("Watch", "ETF_CONCENTRATION", "ETF > 20% → ETF Concentration", etf_weight))

    for category, target in CATEGORY_TARGETS.items():
        weight_value = category_weights.get(category, 0.0)
        if weight_value > target + 10.0:
            warnings.append(warning("Watch", "CATEGORY_OVERWEIGHT", f"{category} > target + 10% → Overweight", weight_value))

    single_name_concentration = []
    stock_health = []
    category_health_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    theme_health_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    category_top_symbols: dict[str, list[str]] = defaultdict(list)
    theme_top_symbols: dict[str, list[str]] = defaultdict(list)
    for symbol, exposure in sorted(exposure_by_symbol.items(), key=lambda item: (-item[1], item[0])):
        weight_value = pct(exposure, total_worst_of_exposure)
        category = classify_category(symbol, pool30, universe)
        theme = classify_theme(symbol, pool30, universe)
        counts = exposure_health_counts(symbol, deal_count_by_symbol.get(symbol, 0), m2_stocks)
        limit = stock_limit(symbol, category)
        impact = impact_fields(exposure, limit, counts["danger_count"], counts["watch_count"])
        concentration_level = "Normal"
        if weight_value > 30.0:
            concentration_level = "High"
            warnings.append(
                warning("Risk", "CONCENTRATION_HIGH", f"{symbol} > 30% total exposure → Concentration High", weight_value)
            )
        elif weight_value > 20.0:
            concentration_level = "Watch"
            warnings.append(
                warning("Watch", "CONCENTRATION_WATCH", f"{symbol} > 20% total exposure → Concentration Watch", weight_value)
            )
        row = {
            "symbol": symbol,
            "exposure": round(exposure, 2),
            "weight": weight_value,
            "category": category,
            "theme": theme,
            "deal_count": deal_count_by_symbol.get(symbol, 0),
            "fcn_count": deal_count_by_symbol.get(symbol, 0),
            "concentration": concentration_level,
            **counts,
            **impact,
        }
        single_name_concentration.append(row)
        stock_health.append(row)
        for key in ("danger_count", "watch_count", "healthy_count"):
            category_health_counts[category][key] += counts[key]
            theme_health_counts[theme][key] += counts[key]
        category_top_symbols[category].append(symbol)
        theme_top_symbols[theme].append(symbol)

    ai_semi_weight = theme_weights.get("AI_SEMI", 0.0)
    if ai_semi_weight > 45.0:
        warnings.append(warning("Risk", "AI_SEMI_CONCENTRATION_HIGH", "AI_SEMI theme > 45% → Theme Concentration High", ai_semi_weight))
    elif ai_semi_weight > 35.0:
        warnings.append(warning("Watch", "AI_SEMI_THEME_WATCH", "AI_SEMI theme > 35% → Theme Watch", ai_semi_weight))

    for theme in ("AI_HOSTING", "CRYPTO"):
        weight_value = theme_weights.get(theme, 0.0)
        if weight_value > 10.0:
            warnings.append(warning("Watch", "SPECULATIVE_THEME_WATCH", f"{theme} theme > 10% → Speculative Theme Watch", weight_value))

    invested_symbols = set(exposure_by_symbol)
    mainstream_symbols = set(pool30)
    market_mainstream_gap = {
        "mainstream_invested": sorted(mainstream_symbols & invested_symbols),
        "mainstream_not_invested": sorted(mainstream_symbols - invested_symbols),
        "invested_non_mainstream": sorted(invested_symbols - mainstream_symbols),
        "speculative_exposure": [
            row
            for row in single_name_concentration
            if row["category"] == "Speculative" or row["theme"] in {"AI_HOSTING", "CRYPTO"}
        ],
    }

    recommendation_priority = build_recommendations(
        pool30,
        universe,
        m1,
        m7,
        exposure_by_symbol,
        category_weights,
        theme_weights,
    )

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": SOURCE,
        "version": VERSION,
        "summary": {
            "total_worst_of_exposure": round(total_worst_of_exposure, 2),
            "total_linked_impact_amount": round(total_worst_of_exposure, 2),
            "impact_method": IMPACT_METHOD,
            "impact_method_note": "Each underlying receives the full FCN notional. Example: 30,000 FCN linked to TSM/NVDA/COIN counts 30,000 impact for each symbol.",
            "overall_health": health_from_warnings(warnings),
            "top_warnings": warnings[:10],
        },
        "category_allocation": build_impact_allocation(
            category_exposure,
            total_worst_of_exposure,
            CATEGORY_IMPACT_LIMITS,
            category_health_counts,
            category_top_symbols,
            CATEGORY_ORDER,
        ),
        "theme_allocation": build_impact_allocation(
            theme_exposure,
            total_worst_of_exposure,
            THEME_IMPACT_LIMITS,
            theme_health_counts,
            theme_top_symbols,
        ),
        "single_name_concentration": single_name_concentration,
        "stock_health": stock_health,
        "market_mainstream_gap": market_mainstream_gap,
        "recommendation_priority": recommendation_priority,
        "debug": {
            "active_deal_count": active_deal_count,
            "excluded_deal_count": excluded_deal_count,
            "total_raw_deal_count": total_raw_deal_count,
            "amount_field_usage": dict(sorted(amount_field_usage.items())),
            "excluded_reason_counts": dict(sorted(excluded_reason_counts.items())),
            "top_symbol_deal_counts": [
                {
                    "symbol": symbol,
                    "deal_count": deal_count_by_symbol[symbol],
                    "exposure": round(exposure_by_symbol[symbol], 2),
                }
                for symbol in sorted(exposure_by_symbol, key=lambda item: (-deal_count_by_symbol[item], item))[:20]
            ],
            "impact_method": IMPACT_METHOD,
        },
    }
    write_json(OUT_PATH, payload)


if __name__ == "__main__":
    main()
