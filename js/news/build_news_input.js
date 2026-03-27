/* =========================================
   Build News Input V1
   功能：
   1. 接收 rawNews 陣列
   2. 逐則呼叫 AI 分類
   3. 輸出 M1 可用的 news_input 格式
========================================= */

import { normalizeNewsWithAI } from "./ai_normalizer.js";

export async function buildNewsInput(rawNewsList = []) {
  const result = [];

  for (let i = 0; i < rawNewsList.length; i++) {
    const raw = rawNewsList[i];

    try {
      const normalized = await normalizeNewsWithAI(raw, i + 1);
      result.push(normalized);
      console.log(`✅ AI分類完成: ${normalized.id} ${normalized.title}`);
    } catch (err) {
      console.error(`❌ 第 ${i + 1} 則新聞分類失敗`, err, raw);

      // fallback：至少保留原始新聞，不讓整批中斷
      result.push({
        id: "N" + String(i + 1).padStart(3, "0"),
        title: raw.title || "",
        summary: raw.summary || "",
        source: raw.source || "",
        published_at: raw.published_at || "",
        type: "macro",
        subtype: "中性",
        sid_label: "中性",
        sid_score: 0,
        affected_sectors: [],
        affected_subsectors: [],
        affected_categories: [],
        duration: 7,
        confidence: 0.3,
        is_active: true
      });
    }
  }

  console.log("🧾 buildNewsInput result =", result);
  return result;
}
