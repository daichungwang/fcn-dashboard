/* =========================================
   AI Normalizer V1
   功能：
   1. 接收 rawNews
   2. 呼叫 AI 進行分類
   3. 回傳 M1 可用格式
========================================= */

export async function normalizeNewsWithAI(rawNews, index = 1) {
  const OPENAI_API_KEY = "YOUR_OPENAI_API_KEY"; // 🔥 先填你的 key（本地測試用）

  const prompt = `
你是一個金融新聞分類器，請把以下新聞轉成結構化 JSON。

【輸出規則】
1. 只輸出 JSON，不要任何多餘說明
2. JSON 格式如下：

{
  "type": "macro | industry | market",
  "subtype": "必填，中文，例如：利率下降 / 通膨上升 / 油價上升 / VIX上升 / AI需求強勁",
  "sid_label": "利多 | 利空 | 中性",
  "sid_score": -3 到 3 的整數,
  "affected_sectors": [],
  "affected_subsectors": [],
  "affected_categories": [],
  "duration": 7,
  "confidence": 0.8,
  "is_active": true
}

【九大 sector 只能用這些】
AI_SEMI
AI_APPLICATION
PLATFORM
CONSUMER
FINANCIAL
HEALTHCARE
TRAVEL
ETF
ENERGY

【新聞內容】
title: ${rawNews.title}
summary: ${rawNews.summary}
source: ${rawNews.source}
published_at: ${rawNews.published_at}
`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI 分類失敗: ${errText}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "{}";

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    console.error("❌ AI 回傳不是合法 JSON:", text);
    throw new Error("AI 回傳格式錯誤，無法解析 JSON");
  }

  return {
    id: "N" + String(index).padStart(3, "0"),
    title: rawNews.title || "",
    summary: rawNews.summary || "",
    source: rawNews.source || "",
    published_at: rawNews.published_at || "",
    type: parsed.type || "macro",
    subtype: parsed.subtype || "中性",
    sid_label: parsed.sid_label || "中性",
    sid_score: Number.isFinite(Number(parsed.sid_score)) ? Number(parsed.sid_score) : 0,
    affected_sectors: Array.isArray(parsed.affected_sectors) ? parsed.affected_sectors : [],
    affected_subsectors: Array.isArray(parsed.affected_subsectors) ? parsed.affected_subsectors : [],
    affected_categories: Array.isArray(parsed.affected_categories) ? parsed.affected_categories : [],
    duration: Number.isFinite(Number(parsed.duration)) ? Number(parsed.duration) : 7,
    confidence: Number.isFinite(Number(parsed.confidence)) ? Number(parsed.confidence) : 0.8,
    is_active: parsed.is_active !== false
  };
}
