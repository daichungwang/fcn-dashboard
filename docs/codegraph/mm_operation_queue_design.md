# MM System Operations & Evolution Center v1

更新日期：2026-05-26  
範圍：MM system operations / local approval lifecycle / Codex command generation  
模式：detect-only + operation-assist + local-only approval state

## 1. Local Approval State

Dashboard 按鈕只改瀏覽器本機狀態，不修改 GitHub 檔案、不改 JSON、不執行 script。

狀態保存在：

```text
window.localStorage["mm_operation_queue_local_state_v1"]
```

## 2. Button Behavior

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

## 3. Generate Codex Command

當 operation 被 Approve 後，Approved / Ready to Execute 卡片會顯示：

```text
[Generate Codex Command]
```

點擊後只產生可複製給 Codex 的文字指令，不會執行任何 script。

指令內容包含：

- operation id
- issue
- suggested_action
- suggested_script
- affected_file
- verification_target
- 限制：
  - 不要改 engine
  - 不要改非授權檔案
  - 不要自動 merge
- 完成後需要回報：
  - 修改哪些檔案
  - 是否成功
  - 如何驗證
  - dashboard health score 是否改善

## 4. Guardrails

目前不做：

- 不自動 rerun script。
- 不自動 commit / push。
- 不修改 GitHub 檔案。
- 不改 engine。
- 不修改正式 fair rate。

UI 必須明確提示：目前只是 local approval 與 command generation，不會真的執行 script。
