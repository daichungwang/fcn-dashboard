# MM System Operations & Evolution Center v1

更新日期：2026-05-26  
範圍：MM system operations / local approval lifecycle / browser state  
模式：detect-only + operation-assist + local-only approval state

## 1. Focused Layout

Dashboard 頂部只保留 5 個 KPI：

- Waiting For Approval
- Executing
- Verifying
- Completed Today
- Rejected / Observation Only

其他資訊都放進 modules：

1. Today Action Center
2. System Summary
3. Data Pipeline
4. Runtime Health
5. Workflow Health
6. M8 Evolution
7. Template Memory
8. Improvement Queue
9. Observation Queue
10. New Stock Onboarding
11. Market FCN Intake (future)

## 2. Local Approval State

v1 按鈕只改瀏覽器本機狀態，不修改 GitHub 檔案、不改 JSON、不執行 script。

狀態保存在：

```text
window.localStorage["mm_operation_queue_local_state_v1"]
```

## 3. Button Behavior

### Approve

- `operation_status` 改成 `approved`
- `approved_by` 改成 `manual`
- `approved_at` 改成目前時間
- 從 Waiting For Approval 移出
- 顯示在 Approved / Ready to Execute

### Reject

- `operation_status` 改成 `rejected`
- `verification_result` 改成 `not_started`
- 移到 Rejected / Observation

### Observation Only

- `operation_status` 改成 `observation`
- `verification_result` 改成 `observation_only`
- 移到 Observation

### Reset Local State

清除 localStorage，回到 JSON 原始狀態。

## 4. Guardrails

目前不做：

- 不自動 rerun script。
- 不自動 commit / push。
- 不修改 GitHub 檔案。
- 不改 engine。
- 不修改正式 fair rate。

UI 必須明確提示：目前只是 local approval，不會真的執行 script。
