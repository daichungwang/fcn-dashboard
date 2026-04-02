// ==========================================
// M4 - Learning Engine（外單評估 + 儲存）
// ==========================================

import { evaluateFCN } from "../core/fcn_engine.js";

// -------------------------------
// 儲存外單
// -------------------------------
export async function saveExternalDeal(deal, result) {
  const record = {
    ...deal,
    ...result,
    decision: null,
    outcome: null,
    created_at: new Date().toISOString()
  };

  console.log("📦 Saving Deal:", record);

  // GitHub Pages 無法直接寫檔
  // 👉 這裡先存在 localStorage（第一版）
  let history = JSON.parse(localStorage.getItem("external_deals") || "[]");
  history.push(record);

  localStorage.setItem("external_deals", JSON.stringify(history));

  return record;
}

// -------------------------------
// 取得歷史資料
// -------------------------------
export function getExternalDeals() {
  return JSON.parse(localStorage.getItem("external_deals") || "[]");
}

// -------------------------------
// 評分 + 儲存
// -------------------------------
export async function evaluateAndStore(deal) {
  const result = evaluateFCN(deal);
  const record = await saveExternalDeal(deal, result);
  return record;
}
