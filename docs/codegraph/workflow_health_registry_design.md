# Workflow Health Registry v1

## 目的

MM System Operations & Evolution Center 不能只依賴人工維護的 `mm_operation_queue.json`。目前 M6 Price Forecast Refresh 已經失敗，但沒有被 Operations Center 抓到，原因是 workflow health 不是活的 registry，也沒有每個 workflow 的 latest run / failed step / expected output 對照。

本設計新增 `data/mm/workflow_health_registry.json`，作為 detect-only workflow monitoring 的第一層資料來源。

## v1 範圍

目前只做：

- workflow registry
- latest failure observation
- expected output mapping
- suggested fix
- operation id

目前不做：

- auto rerun workflow
- auto repair
- auto commit
- auto merge

## Registry 欄位

每個 workflow 至少包含：

- `workflow_name`
- `workflow_file`
- `module`
- `expected_outputs`
- `failure_priority`

## Observation 欄位

每筆 observation 至少包含：

- `workflow_name`
- `run_id`
- `last_run_status`
- `failed_step`
- `error_message`
- `detected_issue`
- `priority`
- `suggested_fix`
- `expected_output`
- `output_health`
- `operation_id`

## M6 失敗案例

M6 Price Forecast Refresh 失敗位置：

```text
Install Python dependencies
```

錯誤：

```text
ERROR: Could not open requirements file: [Errno 2] No such file or directory: 'requirements.txt'
```

判定：

```text
P0 / m6_workflow_dependency_failure
```

原因：M6 workflow 在 dependency install 階段失敗，因此 build / validate / commit 全部 skipped，`data/m6/price_forecast_debug.json` 無法刷新。

## 下一步

v1.1 應把 registry observation merge 到 Operation Center UI：

1. dashboard 載入 `data/mm/workflow_health_registry.json`
2. 將 `latest_observations` 轉成 operations
3. 顯示在 Workflow Health / Runtime Health module
4. 若 output stale 或 empty，提升 priority
5. 若連續失敗，升級為 escalation

## 人話結論

Operations Center 要從「已知問題看板」進化成「workflow 偵測中心」。M6 這次不是 M6 預測模型先壞，而是 workflow dependency install 被缺失的 `requirements.txt` 擋住；同時系統缺少 workflow registry，所以沒有第一時間把它列入 P0 operation。
