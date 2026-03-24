# 振宇 FCN 系統｜系統架構文件（V2）

---

## 一、系統總覽

本系統採用模組化架構，將「資料、核心計算、統計分析、畫面呈現」完全分離。

### 核心設計原則

- Core（核心公式）與 UI 完全分離
- Metrics（統計）獨立於 Core
- Module（畫面）只負責顯示與互動
- Data（資料）不包含任何計算邏輯

---

## 二、系統資料流（非常重要）
Data
→ Core Engine（股票 / FCN 計算）
→ Metrics（統計 / 指標）
→ Modules（畫面）
→ main.js（啟動）

---

## 三、資料夾結構
fcn-dashboard/
data/
js/
core/
metrics/
modules/
docs/
system_architecture.md
main.js

---

## 四、Data 層（5/5）

### 1. pool.json
- 股票池（FCN Pool）
- 股票分類、屬性、基本資料

---

### 2. positions.json
- 持倉資料
- FCN / 股票持倉

---

### 3. news.json
- 新聞與事件資料
- 提供 Event engine 使用

---

### 4. fcn_scenarios.js
- FCN 情境庫（最多20組）
- 每組包含：
  - 利率
  - 天期
  - KI
  - Strike
  - EKI
  - 檔數

---

### 5. fcn_runtime.js
- 控制目前啟用情境
- 例如：3組 / 5組 / 自訂

---

## 五、Core 層（2/2）

### 1. stock_engine.js
負責：

- Baseline Score
- Pure Score（波動調整）
- Event Score（預留）
- Volatility 模型
- evaluateStock()

❌ 不做：
- FCN 計算
- UI
- 統計

---

### 2. fcn_engine.js
負責：

- Basket Stock Score（平均 pure）
- Rate Score
- Period Score
- P Risk（Gap）
- SRI（Worst-of + ASSY）
- EKI
- FCN Pure Score
- FCN Event Score（預留）

❌ 不做：
- 股票分類
- UI
- 統計分析

---

## 六、Metrics 層（3/3）

👉 所有「統計、觀察值、儀表板數據」都集中在此

---

### 1. dashboard_metrics.js
負責：

- 股票建議率
- FCN 建議率
- 風險指數
- FCN 適合度
- System Score

👉 提供 Dashboard（四張卡）

---

### 2. analytics_metrics.js
負責：

- delta_pure_stock
- delta_event_stock
- delta_pure_fcn
- delta_event_fcn
- 股票上修 / 下修數
- 可做股票數
- 可做 FCN 比率
- 五大分類分布
- 平均 pure / 平均 delta
- scenario 平均分數
- 最佳 basket / 最佳 scenario

👉 特性：
- 模組化
- 可自由擴充
- 不影響主系統

---

### 3. summary_metrics.js
負責：

- 將 analytics 統計整理成 UI 可用結果
- M2 / M3 / Dashboard 的摘要輸出
- Top 建議
- 決策結果整理

---

## 七、Modules 層（5/5）

### 1. module1_news.js（M1）
- 國際新聞 / 財經 / AI 趨勢
- 提供 Event 輸入

---

### 2. module2_risk.js（M2）
- 持倉健康檢查
- 風險狀態（健康 / 觀察 / 危險）
- 顯示 delta / worst-of / 距離 KI

---

### 3. module3_decision.js（M3）
- FCN 決策核心畫面
- 呼叫：
  - stock_engine
  - fcn_engine
  - metrics
- 顯示：
  - 股票層
  - Basket 層
  - Scenario 層
  - 決策摘要

---

### 4. module4_review_query.js（M4）
- 單筆 FCN 評核
- 股票查詢
- 外部分析工具

---

### 5. module5_admin.js（M5）
- 新增 / 修改 / 刪除：
  - 股票
  - FCN 情境

---

## 八、Main 層（1/1）

### main.js

負責：
loadData();
initModule1();
initModule2();
initModule3();
initModule4();
initModule5();

❌ 不做：
- 計算
- UI 細節
- 統計
- 資料修改

---

## 九、設計規範（非常重要）

### ✅ 必須遵守

- Core 不寫 UI
- Module 不寫公式
- Metrics 不修改 Data
- Data 不包含邏輯
- main.js 不做計算

---

### ❌ 禁止事項

- module 呼叫並修改 core
- core 直接操作 DOM
- metrics 改寫 pool / scenario
- main.js 寫評分公式
- scenario 寫死在 engine

---

## 十、設計哲學（定稿）

> Core 負責「計算」  
> Metrics 負責「理解」  
> Module 負責「呈現」  
> Data 負責「來源」

---

## 十一、未來擴充方向

- Event Engine（接 M1）
- 自動化 Scenario 掃描
- 資金配置模組（M4+）
- FCN 滾動策略
- AI 決策輔助

---

## 十二、版本說明

- V1：核心公式完成（Stock + FCN Pure）
- V2：架構模組化（Core / Metrics / Modules 分離）
- 
