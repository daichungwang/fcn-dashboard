M7 Blueprint 定稿版
一、M7 的定位
M7 不是什麼

M7 不是在選最會漲的股票。
M7 也不是傳統成長股評分器。
M7 更不是單純 PEG 排名工具。

M7 是什麼

M7 是：

FCN 標的適配評估引擎

它要回答的是：

這檔股票現在是否適合成為 FCN 標的？

這個問題拆成六個面向：

估值：現在價格合不合理
趨勢：中期方向是否健康
結構：最近是否已跌出甜度
時機：現在是不是適合進場
資金：市場是否支持
類別：是否屬於可接受標的族群

其中：

品質不再只是獨立加分項
品質改成估值可信度倍率
二、M7 最終模組

M7 最終定稿保留六大模組：

Valuation
Trend
Structure
Timing
Money
Category

其中：

Structure、Money：沿用舊版
Valuation、Trend、Timing：本次重定義
Quality：併入 Valuation 作為乘數
三、各模組角色定義
1. Valuation

回答：

現在這個價格，如果被敲入接股票，合不合理？

Valuation 不處理：

趨勢
結構
時機
資金

Valuation 只處理：

PE 相對產業合理值
EPS 成長支撐
品質對估值可信度的修正
2. Trend

回答：

這家公司目前中期方向是上、下、還是盤整？

Trend 是方向，不是位置。
Trend 不處理甜不甜。

3. Structure

回答：

最近這段價格波動，有沒有把價格打到夠甜？

Structure 是甜度，不是方向。
Structure 直接沿用 M8 的 ShortSwing 邏輯。

4. Timing

回答：

現在這一刻，是不是適合做 FCN？

Timing 是短期節奏。
它只看近端 snapshot，不處理長期邏輯。

5. Money

回答：

市場是否有資金支持這個方向與位置？

Money 沿用舊版。

6. Category

回答：

這檔股票在 FCN 世界裡，是不是屬於可接受類別？

Category 是靜態偏好與風險框架。
它不是價格邏輯。

四、Valuation 定稿版
4.1 Valuation 核心公式
Valuation Raw = peScore + growthScore
Valuation Final = Valuation Raw × qualityFactor
4.2 peScore 定義
目標

用 Forward PE 相對產業合理 PE 的位置，衡量價格合理性。

4.3 需要資料
現價 price
明年 EPS eps_next
產業合理 PE anchorPE
4.4 公式
forwardPE = price / eps_next
peRatio = forwardPE / anchorPE

其中：

peRatio = 1 代表合理價
<1 代表偏便宜
>1 代表偏貴
4.5 peScore 曲線定義

peScore 中心為：

peRatio = 1 → 20分

你定義的分布邏輯是：

1 ± 0.1：加速，拉開公司差異
1 ± 0.2：線性，合理區間
1 ± 0.3：平滑，避免低基期暴衝

定稿對照表如下：

peRatio	peScore
0.7	34
0.8	32
0.9	28
1.0	20
1.1	12
1.2	8
1.3	6
>1.3	6 封底
<0.7	34 封頂
4.6 peScore 函式
function peScoreFromRatio(peRatio) {
  if (peRatio <= 0.7) return 34;
  if (peRatio <= 0.8) return 32 + (0.8 - peRatio) * 20;
  if (peRatio <= 0.9) return 28 + (0.9 - peRatio) * 40;
  if (peRatio <= 1.1) return 20 - (peRatio - 1.0) * 80;
  if (peRatio <= 1.2) return 12 - (peRatio - 1.1) * 40;
  if (peRatio <= 1.3) return 8 - (peRatio - 1.2) * 20;
  return 6;
}
4.7 growthScore 定義
目標

看未來 EPS 成長是否支撐現在價格。

4.8 需要資料
目前 EPS eps_now
明年 EPS eps_next
4.9 公式
growth = ((eps_next / eps_now) - 1) × 100

growth 單位為百分比。

4.10 growthScore 曲線定義

你定義的最終規則是：

0% 到 10%：慢慢加，3 → 6
10% 到 20%：拉開，6 → 14
20% 到 30%：線性，14 → 18
30%以上：鈍化，最多 25
衰退要懲罰，但 衰退的扣分幅度減半
成長段不變，衰退段縮半
4.11 growthScore 原始對照表
growth	原始分數
-30%	0
-20%	1
-10%	2
0%	3
10%	6
20%	14
30%	18
40%	23
50%	25
4.12 衰退減半後最終對照表

規則：

若 growth >= 0：分數不變
若 growth < 0：以 0% = 3 為基準，負向偏差減半

最終表：

growth	growthScore
-30%	1.5
-20%	2.0
-10%	2.5
0%	3.0
10%	6.0
20%	14.0
30%	18.0
40%	23.0
50%	25.0
4.13 growthScore 函式

先定原始函式：

function growthScoreBase(growth) {
  if (growth <= -30) return 0;

  if (growth <= -20) {
    return 1 + (growth + 20) * 0.1;
  }

  if (growth <= -10) {
    return 2 + (growth + 10) * 0.1;
  }

  if (growth <= 0) {
    return 3 + growth * 0.1;
  }

  if (growth <= 10) {
    return 3 + 0.3 * growth;
  }

  if (growth <= 20) {
    const x = growth - 10;
    return 6 + 8 * Math.pow(x / 10, 1.5);
  }

  if (growth <= 30) {
    return 14 + 0.4 * (growth - 20);
  }

  return Math.min(25, 18 + 1.6 * Math.sqrt(growth - 30));
}

再做衰退減半調整：

function growthScoreFinal(growth) {
  const base = 3;
  const oldScore = growthScoreBase(growth);

  if (growth >= 0) return oldScore;

  return base + 0.5 * (oldScore - base);
}
4.14 qualityFactor 定義
目標

品質不單獨加分，而是作為估值可信度倍率。

也就是：

好公司估值可以放大，普通公司估值維持，差公司不再額外暴力削弱
4.15 qualityMomentum 公式

你定義用市場價格來代表品質的中長期反應：

qualityMomentum =
0.1×r1m + 0.15×r3m + 0.25×r6m + 0.5×r12m

其中：

r1m：1月漲跌幅
r3m：3月漲跌幅
r6m：6月漲跌幅
r12m：12月漲跌幅
4.16 qualityFactor 曲線定義

你最後定的是：

標準值從 80% 起
好公司可放大到 120%
不再下削到 60%

也就是：

qualityFactor 範圍 = 0.8 ~ 1.2

對照邏輯：

q	qualityFactor
-10% ~ +10%	0.80
+10% ~ +20%	0.80 → 1.00
+20% ~ +30%	1.00 → 1.20
≥ +30%	1.20 封頂
≤ +10% 且偏弱	0.80 不再更低
4.17 qualityFactor 函式
function qualityFactor(q) {
  if (q >= 30) return 1.20;

  if (q >= 20) {
    return 1.00 + (q - 20) * 0.02;
  }

  if (q >= 10) {
    return 0.80 + (q - 10) * 0.02;
  }

  return 0.80;
}
4.18 Valuation 最終函式
function buildValuationCore(row, anchorPE) {
  const price = Number(row["現價"]);
  const epsNow = Number(row["目前EPS"]);
  const epsNext = Number(row["明年EPS"]);
  const r1m = Number(row["1月漲跌幅"]);
  const r3m = Number(row["3月漲跌幅"]);
  const r6m = Number(row["6月漲跌幅"]);
  const r12m = Number(row["12月漲跌幅"]);

  const forwardPE = epsNext > 0 ? price / epsNext : null;
  const peRatio = forwardPE && anchorPE ? forwardPE / anchorPE : null;
  const growth = epsNow > 0 && epsNext > 0
    ? ((epsNext / epsNow) - 1) * 100
    : null;

  const peScore = peRatio !== null ? peScoreFromRatio(peRatio) : 20;
  const growthScore = growth !== null ? growthScoreFinal(growth) : 3;

  const rawValuation = peScore + growthScore;

  const q =
    0.1 * r1m +
    0.15 * r3m +
    0.25 * r6m +
    0.5 * r12m;

  const qFactor = qualityFactor(q);

  const finalValuation = rawValuation * qFactor;

  return {
    forwardPE,
    peRatio,
    growth,
    peScore,
    growthScore,
    qualityMomentum: q,
    qualityFactor: qFactor,
    rawValuation,
    finalValuation
  };
}
五、Trend 定稿版
5.1 Trend 角色

Trend 只看方向，不看甜度。

它回答：

這家公司目前中期方向是健康、偏弱、還是下行？
5.2 Trend 輸入資料
r1m
r3m
r6m
r12m
5.3 Trend 原始公式
trendRaw = 0.15×r1m + 0.25×r3m + 0.30×r6m + 0.30×r12m
5.4 Trend 分數表
trendRaw	trendScore
≥ +30%	30
+20%	26
+10%	22
0%	18
-10%	14
-20%	10
-30%	6
≤ -40%	2
5.5 Trend 函式
function trendScore(trendRaw) {
  if (trendRaw >= 30) return 30;
  if (trendRaw >= 20) return 26 + (trendRaw - 20) * 0.4;
  if (trendRaw >= 10) return 22 + (trendRaw - 10) * 0.4;
  if (trendRaw >= 0) return 18 + trendRaw * 0.4;

  if (trendRaw >= -10) return 18 + trendRaw * 0.4;
  if (trendRaw >= -20) return 14 + (trendRaw + 10) * 0.4;
  if (trendRaw >= -30) return 10 + (trendRaw + 20) * 0.4;

  return 2;
}
六、Structure 定稿版
6.1 Structure 角色

Structure 直接代表：

價格甜不甜

它不再重新發明新區間公式，而是直接吃 M8 的 ShortSwing。

6.2 ShortSwing 公式
ShortSwing = 0.35×d0 + 0.25×d1 + 0.15×d2 + 0.10×d3 + 0.08×d4 + 0.07×d5

其中：

d0：當日振幅或近端 swing
d1~d5：往前 5 天
6.3 Structure 分數定義

你定稿的是：

0% ~ 5%：曲線加速，0 → 8
5% ~ 10%：線性，8 → 10
≥10%：封頂 10
6.4 Structure 函式
function structureScoreFromShortSwing(shortSwing) {
  if (shortSwing <= 0) return 0;

  if (shortSwing <= 5) {
    return 8 * Math.pow(shortSwing / 5, 1.6);
  }

  if (shortSwing <= 10) {
    return 8 + (shortSwing - 5) * 0.4;
  }

  return 10;
}
七、Timing 定稿版
7.1 Timing 角色

Timing 只回答：

現在這一刻是否適合進場

Timing 不再扣到負分，而是統一為 0~10。

7.2 Snapshot 公式
snapshot = 0.4×r1d + 0.5×r1w + 0.1×r1m

其中：

r1d：今日漲跌幅
r1w：1週漲跌幅
r1m：1月漲跌幅
7.3 Timing 分數定義

你最後定的是：

無扣分版
0 到 10
-15% ~ +15% 對應 7.5 ~ 2.5
中心 0 對應 5 分
往下最多 10
往上最多 0
7.4 Timing 函式
function timingScore(r1d, r1w, r1m) {
  const movePct =
    0.4 * r1d +
    0.5 * r1w +
    0.1 * r1m;

  let score = 5 - 0.1667 * movePct;

  score = Math.max(0, Math.min(10, score));

  return score;
}
八、Money 定稿版

Money 這一版決定：

沿用舊版

不調整。

理由：

舊版已可用
目前主要問題不在 Money
避免一次改太多造成系統失穩
九、Category 定稿版

Category 這一版不另重設邏輯，維持原有 FCN pool 分類思維。

Category 的角色是：

靜態可接性與風險框架

它不是價格模組。
它保留在總分整合階段再使用。

十、M7 Blueprint 定稿狀態

目前已完成定稿的核心模組如下：

已定稿
Valuation
Trend
Structure
Timing
Money（沿用舊版）
Category（保留原框架）
其中最重要的重構
Quality 不再獨立平行加分
Quality 改為 Valuation 的可信度倍率
## License / 使用限制

This project is proprietary and for personal use only.

You may NOT:
- Copy or redistribute this project
- Use for commercial purposes
- Reproduce the system logic

All rights reserved by Gaya.Wang
