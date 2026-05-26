# MM System Operations & Evolution Center v1.2

更新日期：2026-05-26  
範圍：MM system operations / approval lifecycle / execution feedback / dashboard state impact  
模式：detect-only + operation-assist + feedback-assist + local-only approval state

## 1. Second Version Direction

這一版的重點不是增加自動修復，而是把系統從「問題清單」推進成「有結論的營運流程」。

目標流程：

```text
Detect → Analyze → Recommend → Approve → Execute → Verify → Feedback → Learn
```

其中 `Feedback` 必須用人話說清楚：

- 做了什麼。
- 成功或失敗。
- 為什麼失敗。
- 哪些限制阻止繼續做。
- 下一步該逐一改善什麼。

## 2. Top KPI Redesign

頂部 5 張 KPI 小卡不再只是 queue count，而是改成 `System State + Impact`。

### 1. Today Action Required

取代 `waiting_approval_count`。

顯示：

- Human Decisions Required
- P0 waiting approval
- P1 queued

意義：今天有多少事項需要人工決策。

### 2. System Execution Status

取代 `executing_operations_count`。

顯示：

- running operations
- blocked operations
- escalation required

意義：目前執行鏈是否卡住。

### 3. Verification Health

取代 `verifying_operations_count`。

顯示：

- verification pass rate
- pending verify
- failed verify

意義：不是看有幾筆在驗證，而是看驗證品質。

### 4. Today Impact

取代 `completed_today`。

顯示：

- stale files delta
- coverage delta
- workflow recovered count

意義：今天真正改善了什麼，而不是只看完成數。

### 5. Observation / Escalation

取代 `rejected_or_observation_count`。

顯示：

- observation candidates
- rejected count
- evolution candidates
- escalation required

意義：Observation 與 Rejected 必須拆開，不可混成同一種結果。

## 3. System State Summary Bar

KPI 下方新增 `SYSTEM STATE SUMMARY BAR`，用狀態字而非單純數字呈現：

- Pipeline Health
- Runtime Freshness
- Coverage Health
- Workflow Status
- Recurring Issues

狀態值：

- `healthy`
- `warning`
- `critical`

這一層回答的是：

```text
系統現在健康嗎？哪一段開始壞掉？
```

## 4. Today Improvement Trend

新增 `TODAY IMPROVEMENT TREND`。

用來顯示已完成或正在驗證的改善訊號：

- stale files reduced
- workflow restored
- M7 coverage improved
- onboarding completed
- operation waiting for verification

Observation 不算正式成果，只能列為觀察。

## 5. Execution Feedback Layer

下一階段 JSON schema 建議新增以下欄位，但本版 dashboard 先不強制依賴：

- `execution_result`
- `execution_error`
- `blocked_reason`
- `next_required_operation`
- `verification_status`
- `verification_evidence`
- `human_feedback_summary`

範例：

```json
{
  "operation_id": "op-20260525-005",
  "execution_result": "blocked",
  "blocked_reason": "m1_competition_engine_syntax_error",
  "next_required_operation": "fix m1_competition_engine syntax before rerun competitive card generation",
  "human_feedback_summary": "competitive_cards refresh 無法執行，原因是 M1 engine 語法錯誤；因限制禁止修改 engine，本次不繼續。"
}
```

## 6. New Status Split

現有 lifecycle 保留，但建議新增更精準的執行後狀態：

- `blocked`
- `manual_required`
- `needs_new_operation`
- `ready_for_verifying`

使用原則：

- `blocked`：已嘗試執行，但被錯誤或限制擋住。
- `manual_required`：需要人工補資料，不可用 timestamp 假裝完成。
- `needs_new_operation`：必須開新的修復 operation，不能在本次 scope 內處理。
- `ready_for_verifying`：已有證據可進入驗證。

## 7. Follow-up Operation Suggestion

系統不自動修復，但可以產生下一步 operation suggestion。

例如本輪 test run：

```text
competitive_cards refresh failed
→ suggested follow-up operation:
fix m1_competition_engine syntax error
priority: P1
reason: blocks competitive_cards refresh
guardrail: requires explicit approval because it touches M1 engine
```

這符合「逐一改善」：

```text
不是只觀察，也不是一次大改，而是發現問題後逐一拆成可核可的改善項。
```

## 8. Local Approval State

Dashboard 按鈕只改瀏覽器本機狀態，不修改 GitHub 檔案、不改 JSON、不執行 script。

狀態保存在：

```text
window.localStorage["mm_operation_queue_local_state_v1"]
```

## 9. Button Behavior

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

## 10. Global Generate Codex Commands

右上方 toolbar 放置全域按鈕：

```text
[Generate Codex Commands]
```

點擊後掃描目前所有 `operation_status = approved` 的 operations，統一產出一份可複製給 Codex 的 command report，顯示在 modal / textarea 中。

若沒有 approved operation，顯示：

```text
目前沒有已核可 operation。
```

固定限制條件：

- 不要修改 M1/M7/M8 engine
- 不要修改非授權檔案
- 不要 merge
- 完成後回報修改檔案、驗證結果、是否需要進入 verifying

## 11. Guardrails

目前不做：

- 不自動 rerun script。
- 不自動 commit / push。
- 不修改 GitHub 檔案。
- 不改 M1/M7/M8 engine。
- 不修改正式 fair rate。
- 不把 observation 當正式結論。

UI 必須明確提示：目前只是 local approval、command generation 與 feedback-assist，不會真的執行 script。
