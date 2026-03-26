# 振宇 FCN 系統｜M1 News Runtime 輸出格式規格 V1.2

## 一、目的
M1 負責將新聞轉為可量化事件資料，供 M2 / M3 使用。

M1 功能包含：
1. 收集新聞
2. 分類（Macro / Industry / Market）
3. 指派 SID score
4. 做 mapping
5. 產生 impact_map
6. 彙總 stock_event_map

---

## 二、輸出檔案
`data/news_runtime.json`

---

## 三、整體結構

```json
{
  "date": "2026-03-25",
  "news_items": [],
  "stock_event_map": {}
}
```

---

## 四、Sector 定義（正式版）

```text
AI_SEMI
CLOUD_SOFTWARE
PLATFORM
CONSUMER
FINANCIAL
HEALTHCARE
ENERGY
TRAVEL
ETF
```

---

## 五、每個 Sector 解釋

### 1. AI_SEMI
AI 核心半導體鏈，包含 GPU、晶圓代工、設備、記憶體。
代表股票：
`NVDA / TSM / AVGO / AMAT / MU / AMD / MRVL / ARM`

### 2. CLOUD_SOFTWARE
雲端與 AI 應用層。
代表股票：
`MSFT / GOOG / ORCL / AMZN`

### 3. PLATFORM
平台經濟、廣告、生態系。
代表股票：
`META / AAPL`

### 4. CONSUMER
非科技消費。
代表股票：
`COST / TGT / EL`

### 5. FINANCIAL
利率敏感、金融與高 beta 金融。
代表股票：
`SOFI / COIN`

### 6. HEALTHCARE
防禦型醫療。
代表股票：
`UNH`

### 7. ENERGY
能源。
目前 pool30 佔比低，先保留架構。

### 8. TRAVEL
旅遊／航空／博彩旅遊，高波動收益型。
代表股票：
`CCL / AAL / LVS`

### 9. ETF
系統級 ETF。
代表股票：
`SMH / QQQ / LQD`

---

## 六、Subsector 定義（V1）
Subsector 用來提升產業新聞精準度。

### AI_SEMI
`GPU / FOUNDRY / EQUIPMENT / MEMORY / NETWORKING / CPU`

### CLOUD_SOFTWARE
`CLOUD / DATABASE / ENTERPRISE_SOFTWARE`

### TRAVEL
`AIRLINE / CRUISE / CASINO`

### CONSUMER
`RETAIL / PREMIUM_CONSUMER / STAPLES`

### HEALTHCARE
`INSURANCE / PHARMA / DEVICE`

---

## 七、Macro Factors（正式版）

```text
1. 利率（Interest Rate）
2. 就業（Jobs）
3. 流動性（Liquidity / QE / QT）
4. 美元（USD）
5. 油價（Oil）
6. 地緣政治（Geopolitics）
7. 波動率（VIX）
```

---

## 八、Macro → Sector 權重表（核心傳導表）
每一則總經新聞先被分類成一個 `subtype`，再透過 `MACRO_SECTOR_WEIGHT` 傳導到 sector。

---

## 九、Market Rule Table（市場新聞 → 類股/風格）
Market 新聞不直接走 sector，而是先走 style/category，再映射到股票。

### 市場 tag 範例
`risk_on / risk_off / high_volatility / flight_to_quality / liquidity_easing / liquidity_tightening`

### Category（建議沿用）
`核心 / 成長 / 防禦 / 收益 / 投機`

---

## 十、新聞基本欄位
- `id`：新聞唯一編號
- `title`：新聞標題
- `summary`：2–3 行摘要
- `source`：Reuters / Bloomberg / CNBC ...
- `published_at`：ISO 格式時間

---

## 十一、新聞分類欄位

### type
`macro / industry / market`

### subtype

#### macro
- 利率上升
- 利率下降
- 流動性寬鬆
- 流動性緊縮
- 就業強勁
- 就業轉弱
- 美元走強
- 美元走弱
- 油價上升
- 油價下跌
- 地緣政治升溫
- VIX上升
- VIX下降

#### industry（已按九大 sector 更新）
- AI_SEMI：AI伺服器 / GPU / FOUNDRY / EQUIPMENT / MEMORY / NETWORKING / CPU
- CLOUD_SOFTWARE：CLOUD / DATABASE / ENTERPRISE_SOFTWARE
- PLATFORM：ADVERTISING / ECOSYSTEM / PLATFORM_TRAFFIC
- CONSUMER：RETAIL / PREMIUM_CONSUMER / STAPLES
- FINANCIAL：FINTECH / EXCHANGE / CRYPTO_FINANCE
- HEALTHCARE：INSURANCE / PHARMA / DEVICE
- ENERGY：OIL_GAS / REFINING / ENERGY_SERVICE
- TRAVEL：AIRLINE / CRUISE / CASINO
- ETF：SEMI_ETF / TECH_ETF / BOND_ETF

#### market
- risk_on
- risk_off
- high_volatility
- flight_to_quality
- liquidity_easing
- liquidity_tightening

---

## 十二、SID 欄位

### sid_label
`強利多 / 利多 / 微利多 / 中性 / 微利空 / 利空 / 強利空`

### sid_score
`+3 / +2 / +1 / 0 / -1 / -2 / -3`

---

## 十三、影響對象欄位

### target_mode
`sector / subsector / category / direct_stock`

### affected_sectors
例如：`["AI_SEMI", "CLOUD_SOFTWARE", "ETF"]`

### affected_subsectors
例如：`["MEMORY"]`

### affected_categories
例如：`["防禦", "投機"]`

---

## 十四、單則新聞格式（定稿）

```json
{
  "id": "N001",
  "title": "Fed signals rate cuts",
  "summary": "聯準會釋出降息訊號，市場風險偏好升溫。",
  "source": "Reuters",
  "published_at": "2026-03-25T08:00:00Z",
  "type": "macro",
  "subtype": "利率下降",
  "sid_label": "利多",
  "sid_score": 2,
  "target_mode": "sector",
  "affected_sectors": ["AI_SEMI", "CLOUD_SOFTWARE", "ETF"],
  "affected_subsectors": [],
  "affected_categories": [],
  "impact_map": {
    "NVDA": 1.0,
    "TSM": 1.0,
    "AMAT": 1.0,
    "MSFT": 2.0,
    "GOOG": 2.0,
    "AMZN": 2.0,
    "QQQ": 1.0,
    "SMH": 1.0
  },
  "duration": 7,
  "confidence": 0.8,
  "is_active": true
}
```

---

## 十五、傳導公式

### Macro
`macro_score = SID × sector_weight × 0.5`

### Industry
`industry_score = SID`

### Market
`market_score = SID × category_rule`

---

## 十六、stock_event_map 結構（定稿）

```json
{
  "TSM": {
    "macro_scores": [1.0, -0.5, 0.8],
    "industry_scores": [2.0, 1.0],
    "market_scores": [0.5],
    "macro_avg": 0.4333,
    "industry_avg": 1.5,
    "market_avg": 0.5,
    "event_raw": 2.4333,
    "event_score": 0.9733,
    "news_count": 6,
    "active_news_ids": ["N001", "N004", "N008", "N011", "N017", "N025"]
  }
}
```

---

## 十七、平均規則
`macro_avg = sum / n`
`industry_avg = sum / n`
`market_avg = sum / n`

---

## 十八、最終公式（定稿）

### 原始值
`event_raw = macro_avg + industry_avg + market_avg`

### 建議版（正式使用）
`event_score = 0.4 × macro_avg + 0.3 × industry_avg + 0.3 × market_avg`

---

## 十九、核心原則（定稿）
1. 所有新聞先轉 SID
2. 每則新聞必須有 impact_map
3. M2 / M3 只讀 stock_event_map
4. 同類新聞先平均
5. 最後三類再合併

---

## 二十、結論
`News → SID → Mapping → impact_map → stock_event_map → M2/M3`
