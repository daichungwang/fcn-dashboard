# System Data Pipeline Health Dashboard 設計 v1.1

建立日期：2026-05-25  
範圍：FCN Dashboard / MM / M1 / M7 資料生產鏈  
階段：detect-only prototype，不自動修復

## 1. 核心目標

新增股票後，系統常見問題不是模型判斷錯，而是資料生產鏈斷掉：某些 JSON 沒重跑、某些 script mapping 不清楚、某些 runtime 過期，最後讓 M1/M7/MM 畫面讀到舊資料。

本 dashboard 的目標是讓系統先能發現：

- 哪些股票 coverage 不一致
- 哪些 JSON 過期
- 哪些資料檔找不到產生 script
- 哪些 GitHub Actions workflow 失敗
- daily runtime 是否因 requirements / dependency install 問題卡住
- 下一批應該逐一改善的修復項

目前明確不做：

- 不自動新增股票資料
- 不自動修復 JSON
- 不自動修改 `m1_scores.json`
- 不自動修改 `m7_v2_scores.json`
- 不大改既有 engine

## 2. Dashboard 與資料檔

Dashboard：

```text
mm/data_pipeline_health_dashboard.html
```

資料檔：

```text
data/mm/data_pipeline_health.json
```

設計文件：

```text
docs/codegraph/data_pipeline_health_design.md
```

## 3. Stock Coverage

檢查 universe / candidate / pool / runtime / M7 / M1 是否一致。

檢查來源：

| 檔案 | 用途 |
| --- | --- |
| `data/m1/universe_150.json` | 新增股票與 MM universe 基礎清單 |
| `data/m1/m1_candidate_80.json` | M1 candidate pool |
| `data/pool30.json` | FCN / MM pool |
| `data/market_runtime.json` | 市場 runtime |
| `data/runtime_staging/market_runtime_long_horizon.json` | long horizon runtime |
| `data/m7_sandbox/m7_v2_scores.json` | M7 v2 score |
| `data/m1/m1_scores.json` | M1 official normalized score |

Dashboard 顯示 count 與 overlap，讓使用者快速看出新增股票是否已經進入下游資料。

## 4. Missing Symbols

必須列出：

| 檢查 | 意義 |
| --- | --- |
| universe 有但 market_runtime 沒有 | 價格 / return runtime 尚未補 |
| universe 有但 M7 v2 score 沒有 | M7 長期估值與趨勢尚未補 |
| universe 有但 M1 score 沒有 | M1 體質分數尚未補 |
| candidate 有但 M1 score 沒有 | candidate 畫面可能讀不到 M1 |
| pool30 有但 M7 沒有 | FCN pool 缺 M7 判斷 |
| pool30 有但 M1 沒有 | FCN pool 缺 M1 判斷 |

Missing symbols 目前只列出與警告，不自動修復。

## 5. Freshness Check

每個 JSON 檢查：

- `updated_at`
- `generated_at`
- file modified time
- 是否 stale
- 上次更新時間
- 建議更新頻率

v1.1 建議更新週期：

| 檔案 | 建議更新 |
| --- | ---: |
| `data/market_runtime.json` | 2 天 |
| `data/runtime_staging/market_runtime_long_horizon.json` | 2 天 |
| `data/m7_sandbox/m7_v2_scores.json` | 7 天 |
| `data/m7_sandbox/m7_formula_input_audit.json` | 7 天 |
| `data/m1/m1_scores.json` | 7 天 |
| `data/m1/m1_candidate_80.json` | 7 天 |
| `data/pool30.json` | 7 天 |
| stock profile / research card / EPS / competitive card | 30 天 |

## 6. GitHub Actions / Workflow Health

新增 workflow health 區塊，讓 dashboard 顯示 daily pipeline 是否有跑成功。

每筆至少包含：

| 欄位 | 說明 |
| --- | --- |
| `workflow_name` | workflow 名稱，例如 `daily-runtime-refresh` |
| `last_run_status` | 最新狀態，例如 `success` / `failed` |
| `failed_step` | 失敗步驟 |
| `error_message` | 錯誤摘要 |
| `suggested_fix` | 建議修復 |
| `priority` | P0 / P1 / P2 / P3 |

daily runtime refresh 若出現以下情況，一律列為 P0：

- 缺少 `requirements.txt`
- dependency install 失敗
- workflow 沒有在執行 runtime scripts 前完成 dependency bootstrap

原因：daily runtime 是 `market_runtime.json` 與 long horizon runtime 的上游。一旦 workflow 因依賴問題失敗，後面的 M1/M7/MM 判斷都可能讀到過期資料。

## 7. Required Script Map

Dashboard 必須列出每個資料檔由哪個 script 產生。

| 資料檔 | Script |
| --- | --- |
| `data/market_runtime.json` | `scripts/update_market_runtime.py` |
| `data/runtime_staging/market_runtime_long_horizon.json` | `scripts/update_market_runtime.py` / `scripts/runtime/build_market_runtime_long_horizon.py` |
| `data/m7_sandbox/m7_v2_scores.json` | `scripts/new/build_m7_v2_scores.py` |
| `data/m7_sandbox/m7_formula_input_audit.json` | `scripts/new/build_m7_formula_input_audit.py` |
| `data/m1/m1_scores.json` | `scripts/build_m1_scores.py` |
| `data/m1/m1_candidate_80.json` | `scripts/build_m1_candidate_80.py` |
| `data/m1/eps_history_ai.json` | `scripts/m1/build_eps_history.py` |
| `data/m1/competitive_cards.json` | `scripts/generate_competitive_cards.js` |

找不到 mapping 時標記：

```text
MISSING_SCRIPT_MAPPING
```

## 8. New Stock Onboarding Checklist

新增股票時必須逐一完成：

1. 加入 `universe_150.json`
2. 補 stock profile / research card
3. 更新 `market_runtime`
4. 更新 long horizon runtime
5. 更新 EPS / competitive score
6. 重跑 M7 v2 score
7. 重跑 M1 score
8. 檢查 pool / candidate
9. 確認 MM / M1 畫面可讀

這份 checklist 的用意不是自動化所有工作，而是避免新增股票後忘記重跑某一段資料鏈。

## 9. Health Score

輸出欄位：

| 欄位 | 說明 |
| --- | --- |
| `pipeline_health_score` | 0-100 pipeline 健康分 |
| `critical_missing_count` | 重大缺口數 |
| `workflow_failure_count` | workflow 失敗數 |
| `stale_file_count` | 過期 JSON 數 |
| `missing_symbol_count` | symbol coverage 缺口總數 |
| `next_action_priority` | 下一個最優先處理項 |

workflow dependency failure 屬於 P0，會拉低 pipeline health score，因為它會阻斷 daily runtime 更新。

## 10. Next Fix Items

`stale_file_count` 目前是 4，因此 dashboard 必須直接顯示 `Next 4 Fix Items`，不要只顯示總數。

Next 4 Fix Items 欄位：

| 欄位 | 說明 |
| --- | --- |
| `issue` | 問題類型 |
| `affected_file` | 受影響檔案 |
| `affected_symbols` | 受影響 symbols |
| `suggested_script` | 建議執行的 script |
| `priority` | P0 / P1 / P2 / P3 |
| `reason` | 為什麼需要處理 |

workflow P0 會另外顯示在 GitHub Actions / Workflow Health 區塊，避免和 stale JSON 的 Next 4 清單混在一起。

## 11. 逐一改善原則

這個 dashboard 不是只觀察記錄，也不是要一次大改。

它的工作方式是：

```text
先發現哪裡壞掉，再把問題排成可處理的下一步，然後逐一改善。
```

每一次改善都應該能回到 `data_pipeline_health.json` 驗證：

- missing symbols 是否下降
- stale files 是否減少
- workflow failure 是否解除
- script mapping 是否補齊
- MM / M1 / M7 畫面是否能讀到更新後資料
