# MM Operation Queue Layer v1 設計

更新日期：2026-05-25  
範圍：MM / System Health / Data Pipeline Health / Daily Operation  
模式：detect-only + operation-assist

## 1. 核心定位

System Data Pipeline Health Dashboard v1.1 已經做到：

```text
Detect -> Display
```

MM Operation Queue Layer v1 的下一步是：

```text
Detect -> Prioritize -> Suggest Action -> Human Confirm -> Execute -> Verify
```

這不是自動修復系統，也不是 AI 自動改參數。它是 MM 作戰中心的每日工作派發層，負責把已偵測到的問題變成可排序、可確認、可執行、可驗證的 operation queue。

## 2. 明確限制

v1 不做以下行為：

- 不自動修復。
- 不自動 rerun scripts。
- 不自動 commit / push。
- 不自動修改 M1 / M7 / M8 / MM engine。
- 不修改 `data/m1/m1_scores.json`。
- 不修改 `data/m7_sandbox/m7_v2_scores.json`。

v1 只做以下行為：

- 問題優先排序。
- 建議下一步。
- 建立 operation queue。
- 協助人工 daily operation。
- 修復後定義 verification target。

## 3. Dashboard Console Layout

Operation Queue Dashboard 使用作戰中心式版面：

```text
Top:
  System Health Summary
  Today's Critical Issues
  Next Recommended Operations

Left:
  Modules
    - Data Pipeline
    - Runtime Health
    - Workflow Health
    - M8 Evolution
    - Template Memory
    - Improvement Queue
    - New Stock Onboarding
    - Market FCN Intake (future)

Right:
  Selected module details

Bottom:
  Raw Data / JSON / Search / Logs
```

這個 layout 的目的，是讓使用者先看到今天最重要的風險，再從左側模組切入細節，最後在底部檢查原始 JSON、搜尋 operation 或查看 logs。

## 4. 資料檔

```text
docs/codegraph/mm_operation_queue_design.md
data/mm/mm_operation_queue.json
mm/mm_operation_queue_dashboard.html
```

## 5. Today Operations 欄位

每個 operation 至少包含：

| 欄位 | 說明 |
| --- | --- |
| `priority` | P0 / P1 / P2 / P3 |
| `issue` | 問題類型 |
| `reason` | 為什麼進入 queue |
| `affected_file` | 受影響資料或 workflow |
| `affected_symbols` | 受影響股票 |
| `suggested_action` | 建議人工下一步 |
| `suggested_script` | 可能需要執行或檢查的 script |
| `expected_impact` | 修復後預期改善 |
| `verification_target` | 修復後要驗證什麼 |
| `operation_status` | detected / reviewing / approved / executing / verifying / completed / rejected |

## 6. Priority Levels

P0：workflow failure、runtime pipeline broken、stale runtime causing stale M1/M7/MM。  
P1：stale M1/M7、missing runtime、onboarding incomplete。  
P2：missing research card、missing EPS、partial coverage、stale support data。  
P3：document / mapping improvements。

## 7. Suggested Action Layer

Operation Queue 會把 issue 對應到下一步建議：

| Issue | Suggested Action |
| --- | --- |
| `workflow_dependency_failure` | fix workflow dependency install |
| `m1_scores_stale` | run `scripts/build_m1_scores.py` |
| `m7_scores_stale` | run `scripts/new/build_m7_v2_scores.py` |
| `new_stock_onboarding_incomplete` | complete M7 + M1 generation |
| `missing_research_card` | update stock profile / research card workflow |
| `missing_script_mapping` | document the producing script or mark manual owner |

## 8. Verification Layer

每個 operation 必須定義修完後要驗證什麼。

| Operation | Verification Target |
| --- | --- |
| workflow fixed | GitHub Actions success、`market_runtime.json` updated、stale count reduced |
| M1 rerun | symbol appears in `m1_scores.json`、dashboard coverage improved |
| M7 rerun | symbol appears in `m7_v2_scores.json`、M7 freshness no longer stale |
| onboarding completed | universe / candidate / pool / runtime / M1 / M7 coverage aligned |
| mapping documented | `MISSING_SCRIPT_MAPPING` count reduced |

## 9. Human Confirmation

`operation_status` 是人工流程狀態：detected、reviewing、approved、executing、verifying、completed、rejected。v1 dashboard 只顯示狀態，不會自動改狀態或自動執行。

## 10. Queue Ordering

Queue 根據以下順序排序：

1. 是否影響正式 judgment。
2. 是否影響 runtime freshness。
3. 是否影響多模組。
4. 是否會造成錯誤 GOOD。
5. 是否重複發生。

建議 sort score：

```text
priority base
+ formal_judgment_impact
+ runtime_freshness_impact
+ multi_module_impact
+ false_good_risk
+ recurrence_penalty
```

## 11. v1 結論

MM Operation Queue v1 是「逐一改善」的工作派發中心。它不急著自動修復，而是先讓系統知道：今天最該處理什麼、為什麼、怎麼處理、修完後怎麼驗證。
