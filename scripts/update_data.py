from pathlib import Path
from datetime import datetime, timezone
import json

def now_str():
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M")

def build_data():
    return {
        "updated_at": now_str(),
        "summary": {
            "active_fcn_count": 24,
            "top_risk_code": "FCN710H",
            "worst_of": "ORCL",
            "market_env": "可做",
            "main_conclusion": "可以做 FCN，但優先配置 AI 核心股，並先處理 ORCL / COIN 這兩個風險集中的來源。"
        },
        "morning_brief": {
            "international_news": [{
                "title": "自動更新模板：國際新聞",
                "summary": "這裡將由每日流程自動寫入摘要。",
                "content": "未來可接入新聞來源與摘要規則。",
                "affects_fcn": True
            }],
            "financial_news": [{
                "title": "自動更新模板：國際財經",
                "summary": "這裡將由每日流程自動寫入摘要。",
                "content": "未來可接入利率、Fed、CPI、VIX 等資料來源。",
                "affects_fcn": True
            }],
            "ai_trend": [{
                "title": "自動更新模板：AI 趨勢",
                "summary": "這裡將由每日流程自動寫入 AI Agent 相關消息。",
                "content": "未來可標記是否在 FCN Pool 觀察名單及建議公司。",
                "affects_fcn": True
            }],
            "macro": [{
                "title": "自動更新模板：總經",
                "summary": "這裡將由每日流程自動寫入總經摘要。",
                "content": "未來可接入 CPI、利率曲線、VIX、油價、黃金與主要股市。",
                "affects_fcn": True
            }]
        },
        "strategy_cards": [{
            "title": "先監控 ORCL",
            "action": "持續關注",
            "reason": "GitHub Actions 模板已啟用，之後會由自動流程重算。",
            "level": "watch"
        }],
        "risk_overview": [{
            "label": "高優先監控",
            "text": "FCN710H，Worst-of 為 ORCL。"
        }],
        "risk_radar": [{
            "label": "ORCL 風險集中度",
            "value": 68,
            "type": "watch"
        }],
        "fcn_rankings": [],
        "holdings_brief": [],
        "pool_analysis": {
            "fixed_pool": [],
            "dynamic_pool": []
        },
        "today_recommendations": {
            "add": [],
            "watch": [],
            "avoid": []
        },
        "scenario_suggestions": []
    }

if __name__ == "__main__":
    data = build_data()
    Path("data.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print("data.json updated at", data["updated_at"])
