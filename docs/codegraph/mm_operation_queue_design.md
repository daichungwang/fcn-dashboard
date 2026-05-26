# MM System Operations & Evolution Center v1

更新日期：2026-05-26  
範圍：MM system operations / approval lifecycle / execution lifecycle / verification / result feedback  
模式：detect-only + operation-assist + observation-assist + human-in-the-loop lifecycle

## 1. 版面收斂

目前 dashboard 的上方區塊已經太重，容易失焦。v1.1 版面改成：

```text
Top:
  只保留 5 個 KPI 框
  - Waiting For Approval
  - Executing
  - Verifying
  - Completed Today
  - Rejected / Observation Only

Left Modules:
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

Right:
  Selected module details

Bottom:
  Raw Data / JSON / Search / Logs
```

## 2. 模組責任

`Today Action Center` 是第一個 module，負責顯示：

- Waiting For Approval
- Executing Operations
- Verification Results
- Approval Queue placeholder buttons

`System Summary` 是第二個 module，負責顯示原本 dashboard 上方三個主框：

- System Health Summary
- Today's Critical Issues
- Next Recommended Operations

因此 dashboard 頂部不再放大段文字，只保留 5 個 action KPI，讓使用者一打開就知道今天最需要處理什麼。

## 3. Lifecycle

完整 lifecycle 仍保留：

```text
Detect -> Analyze -> Recommend -> Human Approve -> Execute -> Verify -> Result Feedback
```

operation status：

- `detected`
- `reviewing`
- `waiting_approval`
- `approved`
- `executing`
- `verifying`
- `completed`
- `rejected`
- `observation`

## 4. Guardrails

目前不做：

- 不做 auto repair。
- 不自動 rerun scripts。
- 不自動 commit / push。
- 不自動修改 M8 / M1 / M7 engine。
- 不修改正式 fair rate。
- 不把 observation 當成正式結論。

Approval buttons 目前只是 UI placeholder，不會真的寫回 JSON 或執行 script。
