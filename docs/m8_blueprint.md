FairYield=6+BasketPremium+KIAdj+GapAdj+TenorAdj+CorrAdj+StrikeAdj+TypeAdj​
🔥 M8 – Fair Yield Engine（FINAL BLUEPRINT）
一、系統定位（定稿）
M8 = Fair Yield Engine
用途：將 FCN 風險條件轉換為「市場合理利率」
二、核心原則（鐵律）
1️⃣ 風險越高 → 利率越高
2️⃣ 結構越差 → 利率越高
3️⃣ 不評價好壞，只反映市場價格
三、總公式（最終）
𝐹
𝑎
𝑖
𝑟
𝑌
𝑖
𝑒
𝑙
𝑑
=
6
+
𝐵
## License / 使用限制

This project is proprietary and for personal use only.

You may NOT:
- Copy or redistribute this project
- Use for commercial purposes
- Reproduce the system logic

All rights reserved by Gaya.Wang
𝑎
𝑠
𝑘
𝑒
𝑡
𝑃
𝑟
𝑒
𝑚
𝑖
𝑢
𝑚
+
𝐾
𝐼
𝐴
𝑑
𝑗
+
𝐺
𝑎
𝑝
𝐴
𝑑
𝑗
+
𝑇
𝑒
𝑛
𝑜
𝑟
𝐴
𝑑
𝑗
+
𝐶
𝑜
𝑟
𝑟
𝐴
𝑑
𝑗
+
𝑆
𝑡
𝑟
𝑖
𝑘
𝑒
𝐴
𝑑
𝑗
+
𝑇
𝑦
𝑝
𝑒
𝐴
𝑑
𝑗
FairYield=6+BasketPremium+KIAdj+GapAdj+TenorAdj+CorrAdj+StrikeAdj+TypeAdj
	​

四、輸入資料
股票（M7輸出）
StockScore_i
FCN條件
KI
Strike
Tenor（T, 月）
Type（AKI / DACN / EKI）
Basket結構
CorrLevel（低 / 中 / 高 / 極高）
五、BaseYield
𝐵
𝑎
𝑠
𝑒
𝑌
𝑖
𝑒
𝑙
𝑑
=
6
BaseYield=6
	​

六、Basket 模組（Worst-of 核心）
1️⃣ Weakness
𝑊
𝑒
𝑎
𝑘
𝑛
𝑒
𝑠
𝑠
𝑖
=
100
−
𝑆
𝑡
𝑜
𝑐
𝑘
𝑆
𝑐
𝑜
𝑟
𝑒
𝑖
Weakness
i
	​

=100−StockScore
i
	​

	​

2️⃣ BasketWeakness（4檔）
𝐵
𝑊
=
0.5
×
𝑊
𝑜
𝑟
𝑠
𝑡
1
+
0.3
×
𝑊
𝑜
𝑟
𝑠
𝑡
2
+
0.2
×
𝐴
𝑣
𝑔
BW=0.5×Worst1+0.3×Worst2+0.2×Avg
	​

3️⃣ BasketPremium
𝐵
𝑎
𝑠
𝑘
𝑒
𝑡
𝑃
𝑟
𝑒
𝑚
𝑖
𝑢
𝑚
=
0.15
×
𝐵
𝑊
BasketPremium=0.15×BW
	​

七、KIAdj（曲線型，已修正方向）
GapAdj=⎩
⎨
⎧​reject00.25(Gap−13)+0.015(Gap−13)2​Gap<1010≤Gap≤13Gap>13​​
	​

邊界
KI > 75 → reject
KI < 45 → cap（上限約 +4.5）
八、GapAdj（單調上升，定價邏輯）

Gap=Strike−KI


	​
​

邊界
Gap ≥ 25 → reject
GapAdj ≤ 3.5
九、TenorAdj（曲線型）
TenorAdj=min(4.0,max(−1.0, 0.22(T−6)+0.018(T−6)2))​

解讀
Tenor	Adj
3M	~ -0.5
6M	0
9M	~ +0.8
12M	~ +2.0

十、CorrAdj（相關性）
低相關      0
中相關      +0.5
高相關      +1.0
極高相關    +1.5
十一、StrikeAdj（最終版）
1️⃣ 理想 Strike（你定義）
ΔS=Strike−S∗(T)​
	​

2️⃣ 偏差  ΔS=Strike−S∗(T)​
	​

3️⃣ 利率補償 StrikeAdj=min(2.5,max(−1.0, 0.12ΔS+0.01(ΔS)2))​

十二、TypeAdj（已修正）
AKI   →  0
DACN  → +1.0
EKI   → -1.0
十三、Reject 條件
KI > 75
Gap < 10
Gap ≥ 25
十四、完整展開式（最終）
FairYield=6+0.15×(0.5×Worst1Weakness+0.3×Worst2Weakness+0.2×AvgWeakness)+0.18(KI−65)+0.006(KI−65)2+GapAdj+min(4,max(−1,0.22(T−6)+0.018(T−6)2))+CorrAdj+min(2.5,max(−1,0.12ΔS+0.01ΔS2))+TypeAdj

FairYield=6+0.15×(0.5×Worst1Weakness+0.3×Worst2Weakness+0.2×AvgWeakness)+0.18(KI−65)+0.006(KI−65)
2
+GapAdj+min(4,max(−1,0.22(T−6)+0.018(T−6)
2
))+CorrAdj+min(2.5,max(−1,0.12ΔS+0.01ΔS
2
))+TypeAdj
	​

十五、輸出格式（M8）
{
  "fair_yield": 20.3,
  "basket_premium": 6.3,
  "ki_adj": 2.4,
  "gap_adj": 0,
  "tenor_adj": 2.0,
  "corr_adj": 1.0,
  "strike_adj": 2.5,
  "type_adj": 0,
  "valid": true
}
十六、與決策系統分離（最重要）
Fair Yield Engine → 算「市場應該多少利率」
FCN Score        → 判斷「值不值得做」
十七、整體流程（最終）
M7 → 股票池

M8 → Fair Yield

市場報價 - Fair Yield → Pricing

最後 → FCN Score + Pricing → 決策
🔥 最終一句（整個系統核心）
先看價格對不對（M8）
再決定要不要做（FCN Score）

# 📘 M8 Blueprint（FCN 自動組合引擎｜最終版）

---

# 🎯 一、M8 定位

M7 = 選股（能不能做）  
M8 = 組合 + FCN 模擬（怎麼做）

---

# 🧠 二、核心三句話

1️⃣ KI 決定你會不會死  
2️⃣ Strike 決定你接不接得下來  
3️⃣ 你只會接到最爛的那一檔（Worst-of）

---

# ⚙️ 三、M8 決策總公式

FCN總分 =
股票基本分數組件
+ 今日分數組件
+ 條件分數組件

---

# 🧩 四、三大分數組件

---

## 1️⃣ 股票基本分數組件

股票基本分數組件 =
0.6 × Worst-of 基本股票分數
+ 0.4 × Avg(基本股票分數)

---

## 2️⃣ 今日分數組件

今日分數組件 =
Avg(今日分數)

---

## 3️⃣ 條件分數組件（方案A）

條件分數組件 =
0.3 × KI分數
+ 0.2 × Gap分數
+ 0.3 × Tenor分數
+ 0.6 × Rate分數
+ Type分數

（不做 normalize）

---

# ⚙️ 五、FCN參數生成（核心）

---

# 1️⃣ KI（下限價）

KI = 長期保護區（10年線）

---

## KI候選生成

KI_candidates = f(10年保護區)

if ≤52 → [50, 55]  
if 52–58 → [55, 60]  
if 58–63 → [60, 65]  
>63 → ❌不做  

---

# 2️⃣ Strike（修正版）

---

## PEG組合公式（🔥重要修正）

PEG_combo =
0.6 × Worst-of PEG
+ 0.4 × Avg PEG

---

## Strike候選生成

Strike_candidates = g(PEG_combo)

if PEG < 0.8 → [65, 70, 75]  
0.8–1.0 → [65, 70]  
1.0–1.2 → [60, 65]  
1.2–1.5 → [55, 60]  
>1.5 → [50, 55] 或 ❌  

---

# 3️⃣ GAP

GAP = Strike - KI

---

## GAP規則

=0 → +5  
<10 → ❌  
10–13 → +4~+5（最佳）  
13–15 → +3  
15–18 → 0  
18–20 → -4  
20–22 → -5  
22–25 → -8  
≥25 → ❌  

---

# ⚙️ 六、模擬情境生成（核心）

---

## Scenario 公式

Scenario Set =
CartesianProduct(
KI_candidates,
Strike_candidates,
Tenor,
Rate,
Type
)

---

## 候選

Tenor = [6, 9, 12]  
Rate = [16, 18, 20, 24]  
Type = [EKI, AKI]  

---

## 過濾條件（🔥最重要）

Keep scenario if:

1. Strike ≥ KI  
2. GAP = 0 或 10 ≤ GAP < 25  
3. KI ≤ Worst-of 保護能力  
4. Strike ≤ PEG 可接受上限  

---

# ⚙️ 七、FCN條件分數

---

## KI分數

≤55 → +8  
55–60 → +4  
60–65 → 0  
65–70 → -4  
70–75 → -8  
>75 → ❌  

---

## GAP分數

依上表

---

## Tenor分數

0–3 → +5  
4–6 → +2  
6 → 0  
7–9 → -2  
10–12 → -5  

---

## Rate分數

<10 → ❌  
10–12 → -4  
12–15 → -2  
15–16 → 0  
16–18 → +3  
18–20 → +5  
20–24 → +8  
≥24 → +10  

---

## Type分數

EKI → +2  
AKI → 0  
Down-KI → +1  

---

# ⚙️ 八、組合邏輯

---

## 選股來源

Strict：
M7 積極推薦  

Loose：
+ 觀察名單  

---

## 過濾

❌ Top  
❌ Downtrend  
❌ 曝險過高  

---

## 模板

主力：2 Core + 1 Growth + 1 Defensive  
保守：2 Core + 2 Defensive  
收益：2 Core + 1 Growth + 1 Income  

---

# ⚙️ 九、Worst-of 機制

2–3檔 → 最差1檔  
4–5檔 → 最差2檔  

---

# 💰 十、曝險控制

Core ≤40%  
Growth ≤25%  
Defensive ≤35%  

超過 → 不納入組合  

---

# 🧾 十一、輸出格式

{
  "模擬編號": "SIM_001",
  "股票組合": ["NVDA", "TSM", "CCL"],

  "最差股票": "CCL",
  "平均基本股票分數": 2.33,
  "最差股票分數": -5,
  "股票基本分數組件": -2.07,

  "平均今日分數": 1.0,
  "今日分數組件": 1.0,

  "KI": 50,
  "Strike": 60,
  "Gap": 10,
  "天期月數": 6,
  "利率": 18,
  "產品類型": "EKI",

  "KI分數": 5,
  "Gap分數": 5,
  "天期分數": 0,
  "利率分數": 5,
  "產品類型分數": 2,

  "條件分數組件": 8.9,
  "FCN總分": 7.83,

  "模擬結果": "可做",
  "模擬說明": "保護強、Gap合理、收益平衡",

  "最後更新日期": "YYYY-MM-DD"
}

---

# 🚦 十二、決策門檻

FCN總分 ≥ 8 → 可做  
6.5–8 → 觀察  
<6.5 → 不做  

---

# 🧠 最重要一句

FCN不是在算你賺多少  
是先確保你不會接到爛股票






📘 M8 Blueprint（正式定稿版｜方案 A）
🎯 一、M8 定位
M7 = 選股（能不能做）
M8 = 組合 + FCN 模擬（怎麼做）
🧠 二、核心原則（寫最上面）
1️⃣ KI 決定你會不會死
2️⃣ Strike 決定你接不接得下來
3️⃣ 你只會接到最爛的那一檔（Worst-of）
⚙️ 三、M8 決策總公式（最重要）
FCN總分
= 股票基本分數組件
+ 今日分數組件
+ 條件分數組件
🧩 四、三大分數組件
1️⃣ 股票基本分數組件（Worst-of核心）
股票基本分數組件
= 0.6 × Worst-of 基本股票分數
+ 0.4 × Avg(基本股票分數)
📌 說明
Worst-of = 核心風險
Avg = 組合品質
權重 60% / 40%
2️⃣ 今日分數組件（市場時點）
今日分數組件
= Avg(今日分數)
📌 說明
判斷今天是否適合做 FCN
反映趨勢 + 結構 + 短期動能
3️⃣ 條件分數組件（FCN條件）

👉 採用 方案 A（加權加總）

條件分數組件
= 0.3 × KI分數
+ 0.2 × Gap分數
+ 0.3 × Tenor分數
+ 0.6 × Rate分數
+ Type分數
📌 說明（非常重要）
不做 normalize（刻意讓利率權重高）
利率是「機會」，但也是「風險訊號」
⚙️ 五、FCN條件計算公式
1️⃣ KI（下限價）
KI = 長期保護區（10年線 / 長期底部）
KI分數
KI比例	分數
≤55%	+8
55–60%	+4
60–65%	0
65–70%	-4
70–75%	-8
>75%	❌不做
2️⃣ Strike（執行價）
Strike = 由 PEG / 估值推導
3️⃣ GAP
GAP = Strike - KI
GAP分數
GAP	分數
=0	+5
<10	-7
10	+5
10–13	+4
13–15	+3
15–18	0
18–20	-4
20–22	-5
22–25	-8
≥25	❌不做
4️⃣ Tenor（天期）
月數	分數
0–3	+5
4–6	+2
6	0
7–9	-2
10–12	-5
>12	❌不做
5️⃣ Rate（利率）
利率	分數
<10%	❌不做
10–12%	-4
12–15%	-2
15–16%	0
16–18%	+3
18–20%	+5
20–24%	+8
≥24%	+10
6️⃣ Type（產品類型）
類型	分數
EKI	+2
AKI / MKI	0
Down-KI	+1
⚙️ 六、組合邏輯（M8 Engine）
1️⃣ 選股來源
Strict
M7 積極推薦（今日推薦優先）
Loose
+ 觀察名單（排除 Top / Downtrend）
2️⃣ 過濾條件
❌ Downtrend → 移除
❌ Top → 移除
❌ 曝險過高 → 不進組合
3️⃣ 組合模板
主力
2 Core + 1 Growth + 1 Defensive
保守
2 Core + 2 Defensive
收益
2 Core + 1 Growth + 1 Income
⚙️ 七、Worst-of 機制
2–3檔 → 最差1檔
4–5檔 → 最差2檔
懲罰
Worst-of過低 → 直接拖垮整體分數
💰 八、曝險控制（M2整合）
Baseline
類型	安全
Core	≤40%
Growth	≤25%
Defensive	≤35%
規則
超過 baseline → 不禁止，但不納入組合
🧪 九、模擬模式
1️⃣ Strict（保守）
只用積極推薦
2️⃣ Loose（進攻）
加入觀察名單
🧾 十、輸出格式（JSON）
{
  "模擬編號": "SIM_001",
  "股票組合": ["NVDA", "TSM", "CCL"],

  "最差股票": "CCL",
  "平均基本股票分數": 2.33,
  "最差股票分數": -5,
  "股票基本分數組件": -2.07,

  "平均今日分數": 1.0,
  "今日分數組件": 1.0,

  "KI": 50,
  "Strike": 60,
  "Gap": 10,
  "天期月數": 6,
  "利率": 18,
  "產品類型": "EKI",

  "KI分數": 5,
  "Gap分數": 5,
  "天期分數": 0,
  "利率分數": 5,
  "產品類型分數": 2,

  "條件分數組件": 8.9,
  "FCN總分": 7.83,

  "模擬結果": "可做",
  "模擬說明": "保護強、Gap合理、收益平衡",

  "最後更新日期": "YYYY-MM-DD"
}
🚦 十一、決策門檻
FCN總分 ≥ 8      → 可做
6.5 – 8         → 觀察
< 6.5           → 不做
🧠 十二、最重要一句話
FCN不是在算你賺多少
是先確保你不會接到爛股票
✅ 最終結論

這套 M8 Blueprint：

✔ 完全量化（可寫程式）
✔ 對齊你的 FCN 策略
✔ Worst-of 為核心
✔ KI / GAP / Rate 全納入
✔ 可直接產出交易建議
