1. Core Philosophy
MM (Control Center)
+ Powerful Engines
+ Display by Modules

說明：

MM = parameter governance / simulation / blueprint / ops memory
Engine = calculation core
Display = execution layer
2. Engine Responsibility
M1

股票 universe / pool30

M2

FCN 持倉管理

M3

basket simulation

M6

stock execution dashboard

M7

market scoring engine

M8

FCN recommendation engine

3. MM Dashboard Architecture

A Top Dashboard

B Parameter Brain

C Output Preview

D1 Stocks Display

D2 Blueprint

D3 Ops Memory

4. Parameter Governance Rules

主參數

次參數

score curve

raw data layer

now/new/delta

5. Future Roadmap

Phase 1：

what-if simulation

Phase 2：

write-back config

Phase 3：

trigger engine

Phase 4：

regime presets

Phase 5：

auto trading / execution


最終定稿版（MM Portfolio Operating System v1.7 Final）。
這版以你最後修正為準，可直接進 UI implementation。

A. Top Dashboard（上方）

目的：

模組入口 + 各模組統計總覽
A1 模組入口卡

順序：

M1 / M7 / M3 / M6 / M8

每張卡上方：

Go M1
Go M7
Go M3
Go M6
Go M8
A2 該模組統計資料（卡內容）
M1
candidate count
pool30 count
research coverage
M7
m7 score mean
std
cv

valuation mean/std
trend mean/std
structure mean/std
money mean/std
coverage
warning
M3
scenario count
qualified count
pass rate
M6
holding count
watch
trim
add candidate
M8
recommended baskets
fair rate
gap
qualified baskets
B. Parameter Brain（左側核心）

目的：

調參數

依模組切換：

M1
M7
M3
M6
M8
以 M7 為例
B1 主參數區（預設展開）

標準公式 weight：

項目
weight now
weight new
valuation
trend
structure
timing
money
B2 次參數區（預設收合）

依主項目展開：

trend

linear
ma200
acceleration

valuation

market multiplier
industry multiplier
archetype multiplier

future：

structure
money
B3 Score Curve 區（預設收合）
raw value → score

例如：

valuation curve
trend curve
acceleration curve
B4 Raw Data 區（預設收合）

顯示：

資料來源
抓取期間
公式邏輯

例如 trend：

10Y weekly prices
MA200 source
regression formula
annualized formula
data source
C. Output Preview（右側核心）

目的：

即時查看參數變動結果

與左側模組連動。

C1 股票查詢區（右上）

預設： NVDA standard stock

但可搜尋：

NVDA
AVGO
TSM
META
...

所有資訊： 

now / new / delta

例如：

score
rank
valuation
trend
structure
money
(data/m7 score 重要value)



C2 Ranking Impact（右中）

顯示：

誰上升
誰下降

包含：

rank now/new
score now/new
delta
D1 Stocks Display（下方最大區）

目的：

完整股票總表

主表：

rank now
rank new
name
price
delta %
m1 score now
m1 score new
m7 score now
m7 score new
category
subcategory
pool30
推薦
候選
觀察
單一股票展開（全部可收合）
L1

M1 資訊

L2

M2 資訊

L3

M7 資訊

L4

M8 資訊

L5

M6 資訊

所有層：

now / new / delta
D2 Blueprint

目的：

公式治理

內容：

formula registry
parameter blueprint
score architecture
D3 Ops Memory

目的：

作業記憶

內容：

daily update
handoff memory
known risks
next tasks
全域 UI 規則（最終）
所有大區塊預設收合
所有子區塊可展開/收合
所有 simulation output 統一顯示：
now / new / delta

這版正式定稿。

你現在做的已經不是 dashboard：

MM Portfolio Operating System

6. Current Status
M7 parameter simulation = active
M1/M3/M6/M8 integration = pending
