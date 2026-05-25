# MM System Operations & Evolution Center v1

更新日期：2026-05-25  
範圍：MM system operations / data pipeline / workflow / runtime / M8 evolution / observation queue  
模式：detect-only + operation-assist + observation-assist

## 1. 核心定位

MM System Operations & Evolution Center v1 不是第二個 MM 投資 dashboard，也不是用來直接判斷某張 FCN 單是否要做。

它是：

```text
MM 系統營運與演化中心
```

目前方向不再新增大量獨立 dashboard，而是把以下 layer 收斂進同一個中心：

- Data Pipeline Health
- Workflow Health
- Operation Queue
- M8 Template Memory
- Runtime Monitoring
- Observation Queue

核心流程仍是：

```text
Detect -> Prioritize -> Suggest Action -> Human Confirm -> Execute -> Verify
```

但 v1 會多一個重要分流：

```text
Observation only -> accumulate evidence -> wait for enough confidence -> future evolution candidate
```

## 2. 邊界

目前不做：

- 不新增第四個主 dashboard。
- 不做 auto repair。
- 不自動 rerun scripts。
- 不自動 commit / push。
- 不自動修改 M8 / M1 / M7 engine。
- 不修改正式 fair rate。
- 不把 observation 當成正式結論。

目前只做：detect-only、operation-assist、observation-assist、人工 daily operation 排序、系統演化候選觀察、修復後 verification target 定義。

## 3. Queue Type

Operation Queue 不只處理 maintenance，也要能處理 onboarding、runtime、observation、evolution。

| queue_type | 定義 |
| --- | --- |
| `maintenance` | workflow failure、dependency issues、stale M1/M7、stale runtime |
| `onboarding` | new stock onboarding incomplete、missing research card、missing EPS、missing M7/M1 |
| `runtime` | runtime freshness、runtime coverage、workflow monitoring、stale market runtime |
| `observation` | 樣本不足、outcome observation、M8 abnormal but insufficient confidence、template observation only |
| `evolution` | M8 beta evolution candidate、new template split candidate、template premium adjustment observation、suppressor/enhancer candidate observation、market coupon structural drift |

## 4. Observation Queue

Observation Queue 的目的不是立即修復，而是持續觀察。很多現象目前樣本不足，不能太早修正，例如 M8 beta 看起來偏低、某 template coupon drift、某 basket outcome 異常、outcome sample 不夠，或 suppressor / enhancer role 可能變化但證據還不夠。

這些項目必須先進 observation queue，不直接改 beta、premium、fair rate、size 或 engine。

## 5. Confidence Layer

每個 operation / observation 都要有 `confidence`，範圍是 0 到 1。

範例：workflow dependency failure = 0.98；M8 beta too low observation = 0.42。

目的：避免 observation 被誤認為正式結論。低 confidence 的 observation 可以提醒人工注意，但不能直接推動正式公式、beta、premium 或 fair rate 修正。

## 6. Dashboard Layout

保留目前 console layout：

```text
Top:
  System Health Summary
  Today's Critical Issues
  Next Recommended Operations

Left:
  Data Pipeline
  Runtime Health
  Workflow Health
  M8 Evolution
  Template Memory
  Improvement Queue
  Observation Queue
  New Stock Onboarding
  Market FCN Intake (future)

Right:
  Selected module details

Bottom:
  Raw Data / JSON / Search / Logs
```

## 7. 新增欄位

每筆 queue item 至少支援：

| 欄位 | 說明 |
| --- | --- |
| `queue_type` | maintenance / onboarding / runtime / observation / evolution |
| `confidence` | 0 到 1，代表系統對此判斷的信心 |
| `observation_reason` | 若是 observation，說明為什麼只能觀察 |
| `observation_required_samples` | 需要多少樣本才可能升級成正式 calibration / evolution |
| `evolution_candidate_reason` | 若是 evolution candidate，說明未來可能演化的原因 |

## 8. Priority 與 Queue Type

`priority` 表示今天處理順序，`queue_type` 表示問題本質。P0 + maintenance 代表 workflow failure 應優先處理；P2 + observation 代表 M8 beta 可能偏低但樣本不足，只能觀察；P2 + evolution 代表未來可能修 template 或 beta，但現在不能直接改正式參數。

## 9. 下一階段 Daily Operation Automation

本 center 是下一階段自動化的前置層。未來流程會是：

```text
AI 接收 LINE / market FCN
-> M1 / M2 / M6 / M7 / M8 readiness check
-> 系統資料與 runtime 診斷
-> output 綜合分析、推薦或 reject
-> maintain fcn_pool / market_fcn_history
```

在進入 automation 前，必須先讓系統能說清楚：今天哪些資料鏈沒補、哪些 workflow 沒正常跑、哪些 runtime stale、哪些 template / memory 只是 observation、哪些 M8 evolution candidate 需要更多樣本。

## 10. v1 結論

MM System Operations & Evolution Center v1 的價值是把系統從「看得到問題」推進到「知道今天該先處理什麼，以及哪些只能繼續觀察」。

核心不是自動修復，而是：

```text
逐一改善 + 持續觀察 + 為未來自動化鋪路
```
