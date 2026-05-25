# System Data Pipeline Health Dashboard 設計

建立日期：2026-05-25  
範圍：FCN Dashboard / MM / M1 / M7 資料生產鏈  
版本：v1 detect-only prototype

## 1. 核心問題

目前資料生產鏈的風險不是單一公式錯，而是新增股票後常常忘記重跑或更新某些 JSON，造成 dashboard 看起來可用，但底層資料其實沒有跟上。

最大苦主：

- `data/m7_sandbox/m7_v2_scores.json`
- `data/m1/m1_scores.json`

System Data Pipeline Health Dashboard 的任務是：

```text
新增股票後，讓我知道哪些資料還沒補、哪些 JSON 過期、哪些 script 沒跑。
```

目前階段只做：

1. 偵測。
2. 盤點。
3. Dashboard 顯示。
4. 產生 next fix items。

目前階段不做：

1. 不自動修復。
2. 不自動新增股票資料。
3. 不修改 `m1_scores.json`。
4. 不修改 `m7_v2_scores.json`。
5. 不改既有 engine。

## 2. Dashboard 與資料檔

新增檔案：

```text
data/mm/data_pipeline_health.json
mm/data_pipeline_health_dashboard.html
```

設計文件：

```text
docs/codegraph/data_pipeline_health_design.md
```

## 3. Stock Coverage

檢查 universe / candidate / pool / runtime / M7 / M1 是否一致。

核心檢查檔案：

| 檔案 | 角色 |
| --- | --- |
| `data/m1/universe_150.json` | 新增股票與 MM universe 主清單 |
| `data/m1/m1_candidate_80.json` | M1 candidate pool |
| `data/pool30.json` | FCN / MM pool |
| `data/market_runtime.json` | 短中期市場 runtime |
| `data/m7_sandbox/m7_v2_scores.json` | M7 v2 score |
| `data/m1/m1_scores.json` | M1 official normalized score |

需要顯示：

- universe count
- candidate count
- pool30 count
- market_runtime count
- M7 score count
- M1 score count
- overlap count

## 4. Missing Symbols

必須列出：

| 檢查 | 意義 |
| --- | --- |
| universe 有，但 market_runtime 沒有 | 新股票可能沒有價格 / return runtime |
| universe 有，但 M7 v2 score 沒有 | 新股票沒有進 M7 公式 |
| universe 有，但 M1 score 沒有 | 新股票沒有進 M1 score |
| candidate 有，但 M1 score 沒有 | candidate 畫面可能讀不到正式 M1 |
| pool30 有，但 M7 沒有 | pool 中股票缺長期估值 |
| pool30 有，但 M1 沒有 | pool 中股票缺體質評分 |

這些缺口不自動補資料，只列入 fix items。

## 5. Freshness Check

每個 JSON 要檢查：

- `updated_at`
- `generated_at`
- file modified time
- 是否 stale
- 上次更新時間
- 建議多久更新一次

v1 建議更新頻率：

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

## 6. Required Script Map

Dashboard 需列出每個資料檔由哪個 script 產生。

| 資料檔 | Script |
| --- | --- |
| `data/market_runtime.json` | `scripts/update_market_runtime.py` |
| `data/runtime_staging/market_runtime_long_horizon.json` | `scripts/update_market_runtime.py` 或 `scripts/runtime/build_market_runtime_long_horizon.py` |
| `data/m7_sandbox/m7_v2_scores.json` | `scripts/new/build_m7_v2_scores.py` |
| `data/m7_sandbox/m7_formula_input_audit.json` | `scripts/new/build_m7_formula_input_audit.py` |
| `data/m1/m1_scores.json` | `scripts/build_m1_scores.py` |
| `data/m1/m1_candidate_80.json` | `scripts/build_m1_candidate_80.py` |
| `data/m1/eps_history_ai.json` | `scripts/m1/build_eps_history.py` |
| `data/m1/competitive_cards.json` | `scripts/generate_competitive_cards.js` |

若找不到 mapping，要標記：

```text
MISSING_SCRIPT_MAPPING
```

目前 `m1_scores.json` 已確認 source 為：

```text
scripts/build_m1_scores.py
```

## 7. New Stock Onboarding Checklist

新增股票時必須跑：

1. 加入 `universe_150.json`
2. 補 stock profile / research card
3. 更新 `market_runtime`
4. 更新 long horizon runtime
5. 更新 EPS / competitive score
6. 重跑 M7 v2 score
7. 重跑 M1 score
8. 檢查 pool / candidate
9. 確認 MM / M1 畫面可讀

## 8. Health Score

輸出：

| 欄位 | 說明 |
| --- | --- |
| `pipeline_health_score` | 0-100 pipeline 健康分 |
| `critical_missing_count` | 重大缺口數 |
| `stale_file_count` | 過期檔案數 |
| `missing_symbol_count` | symbol coverage 缺口總數 |
| `next_action_priority` | 下一個優先處理項 |

v1 分數不是正式公式，只是提醒用。

## 9. Next 10 Fix Items

表格欄位：

| 欄位 | 說明 |
| --- | --- |
| `issue` | 問題類型 |
| `affected_file` | 受影響檔案 |
| `affected_symbols` | 受影響 symbols |
| `suggested_script` | 建議執行 script |
| `priority` | P0 / P1 / P2 / P3 |
| `reason` | 為什麼要處理 |

## 10. 改善方式

這個 dashboard 的精神和 MM System Health 一樣：

```text
先偵測資料生產鏈哪裡失控，
再逐一改善。
```

不是只觀察記錄，也不是一次大改全部資料鏈。每次應該處理一個明確問題，例如：

- 先重跑 market runtime。
- 再重跑 M7 score。
- 再重跑 M1 score。
- 再確認 pool / candidate 顯示。

改善後重新產生 `data_pipeline_health.json`，確認 score 是否上升、missing symbols 是否下降、stale files 是否清除。
